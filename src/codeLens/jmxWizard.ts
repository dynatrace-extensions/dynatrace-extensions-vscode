/**
  Copyright 2022 Dynatrace LLC

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
 */

import { CodeLensCommand } from "@common";
import vscode from "vscode";
import { JMXProcess, MBeanListDto } from "../dynatrace-api/interfaces/extensions";
import { getDynatraceClient } from "../treeViews/tenantsTreeView";
import { getCachedJMXData, setCachedJMXData } from "../utils/caching";
import logger from "../utils/logging";
import { createSingletonProvider } from "../utils/singleton";

export type JMXData = Record<string, MBeanListDto>;

const JMX_REGEX = /^(jmx:)/gm;
const ALL_TECHNOLOGIES = "All technologies";
const ALL_HOSTS = "All hosts";

/**
 * Code Lens Provider implementation to facilitate loading JMX metrics from the
 * discovery APIs and leveraging it in other parts of the extension.
 */
class JmxWizardCodeLensProvider implements vscode.CodeLensProvider {
  private lastScrape = "N/A";
  private isLoading = false;
  private processName: string | undefined;
  private processId: string | undefined;
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor() {
    vscode.commands.registerCommand(
      CodeLensCommand.JmxScrapeMetrics,
      this.scrapeMetrics.bind(this),
    );
  }

  /**
   * Provides Code Lenses for the JMX wizard. Two lenses are created: one to trigger
   * MBean navigation, and one showing when data was last captured.
   * @param document document where provider was invoked
   * @returns list of Code Lenses
   */
  public provideCodeLenses(
    document: vscode.TextDocument,
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const text = document.getText();
    const regex = new RegExp(JMX_REGEX);
    const match = regex.exec(text);
    if (!match) {
      return [];
    }

    const line = document.lineAt(document.positionAt(match.index).line);
    const position = new vscode.Position(line.lineNumber, line.text.indexOf(match[0]));
    const range = document.getWordRangeAtPosition(position, new RegExp(JMX_REGEX));
    if (!range) {
      return [];
    }

    const actionLens = new vscode.CodeLens(range, {
      title: "Navigate MBeans",
      tooltip: "Connect to a Java process and capture its MBeans, then use them in the Extension.",
      command: CodeLensCommand.JmxScrapeMetrics,
      arguments: [],
    });

    if (this.isLoading) {
      return [
        actionLens,
        new vscode.CodeLens(range, {
          title: "Loading...",
          tooltip: "Retrieving metrics from Dynatrace OneAgent...",
          command: "",
          arguments: [],
        }),
      ];
    }

    const domainCount = Object.keys(getCachedJMXData()[this.processName ?? ""] ?? {}).length;
    const statusLens = new vscode.CodeLens(range, {
      title:
        this.lastScrape === "N/A"
          ? this.lastScrape
          : `${domainCount} domains found (${this.lastScrape.substring(5)})`,
      tooltip:
        this.lastScrape === "N/A"
          ? "Data has not been captured yet."
          : `${this.lastScrape}. Found ${domainCount} domains.`,
      command: "",
      arguments: [],
    });

    return [actionLens, statusLens];
  }

  /**
   * Metric scraping workflow. Clears cached data if needed, then scrapes
   * and updates the timestamp on success.
   * @param changeConfig re-collect process details even if they already exist
   */
  private async scrapeMetrics(changeConfig: boolean = false) {
    if (!this.processId || changeConfig) {
      setCachedJMXData({});
    }
    const success = await this.scrape();
    if (success) {
      this.lastScrape = `Last captured at: ${new Date().toLocaleTimeString()}`;
      this._onDidChangeCodeLenses.fire();
    }
  }

  /**
   * Captures JMX metrics by walking the user through technology, host, and process
   * selection, then fetching MBean details for the chosen process.
   * @returns whether discovery completed successfully
   */
  private async scrape() {
    try {
      const dtClient = await getDynatraceClient();
      if (!dtClient) {
        throw Error("Cannot continue without Dynatrace API client.");
      }

      const processList = await dtClient.extensionsV2.listJMXProcesses();
      if (!processList) {
        throw Error("No JMX-enabled processes found for this environment.");
      }

      // Step 1: Pick a technology
      const technologyName = await this.pickFromProcessProperty(
        processList,
        p => p.properties.TECHNOLOGIES,
        ALL_TECHNOLOGIES,
        "Capture data - Choose your technology",
        "Select the technology to filter your processes",
      );

      // Step 2: Pick a host (filtered by chosen technology)
      const techFiltered = this.filterProcesses(processList, technologyName, ALL_TECHNOLOGIES, {
        matchFn: p => p.properties.TECHNOLOGIES,
      });
      const hostName = await this.pickFromProcessProperty(
        techFiltered,
        p => p.properties.HOSTS,
        ALL_HOSTS,
        "Capture data - Choose your host",
        "Select the host to filter your processes",
      );

      // Step 3: Pick a process (filtered by technology + host)
      const fullyFiltered = this.filterProcesses(techFiltered, hostName, ALL_HOSTS, {
        matchFn: p => p.properties.HOSTS,
      });
      this.processName = await vscode.window.showQuickPick(
        fullyFiltered.map(p => p.name),
        {
          title: "Capture data - Choose your process",
          placeHolder: "Select the process to capture its MBeans",
          canPickMany: false,
          ignoreFocusOut: true,
        },
      );

      const selected = fullyFiltered.find(p => p.name === this.processName);
      this.processId = selected?.id;

      // Step 4: Fetch MBean details
      this.isLoading = true;
      this._onDidChangeCodeLenses.fire();
      const processDetails = await dtClient.extensionsV2.getJMXProcessDetails(this.processId);
      setCachedJMXData({ [this.processName]: processDetails });
      this.isLoading = false;
      return true;
    } catch (err) {
      logger.error(err);
      this.isLoading = false;
      return false;
    }
  }

  /**
   * Collects unique values from a process property and presents a quick pick.
   * An "all" option is prepended as the first choice.
   */
  private async pickFromProcessProperty(
    processes: JMXProcess[],
    extractFn: (p: JMXProcess) => string[],
    allLabel: string,
    title: string,
    placeHolder: string,
  ): Promise<string | undefined> {
    const values = new Set<string>([allLabel]);
    for (const p of processes) {
      for (const v of extractFn(p)) {
        values.add(v);
      }
    }
    if (values.size <= 1) {
      return allLabel;
    }
    return vscode.window.showQuickPick([...values], {
      title,
      placeHolder,
      canPickMany: false,
      ignoreFocusOut: true,
    });
  }

  /**
   * Filters a process list by a chosen value. If the value is undefined or
   * equals the "all" label, returns the full list unfiltered.
   */
  private filterProcesses(
    processes: JMXProcess[],
    chosen: string | undefined,
    allLabel: string,
    { matchFn }: { matchFn: (p: JMXProcess) => string[] },
  ): JMXProcess[] {
    if (!chosen || chosen === allLabel) {
      return processes;
    }
    return processes.filter(p => matchFn(p).includes(chosen));
  }
}

/**
 * Provides singleton access to the JmxWizardCodeLensProvider.
 */
export const getJmxWizardCodeLensProvider = createSingletonProvider(JmxWizardCodeLensProvider);
