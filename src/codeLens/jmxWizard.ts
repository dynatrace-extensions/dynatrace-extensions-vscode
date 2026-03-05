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
import { MBeanListDto } from "../dynatrace-api/interfaces/extensions";
import { getDynatraceClient } from "../treeViews/tenantsTreeView";
import { getCachedJMXData, setCachedJMXData } from "../utils/caching";
import logger from "../utils/logging";
import { createSingletonProvider } from "../utils/singleton";

export type JMXData = Record<string, MBeanListDto>;

export type jmxDataResponse = {
  jmxData: Record<string, domainData>;
};

type domainData = {
  mbean: Record<string, mbeanData>[];
};

type mbeanData = {
  properties: Record<string, string>;
  metrics: { name: string; numeric: boolean }[];
  fullPath: string;
};

/**
 * Code Lens Provider implementation to facilitate loading JMX metrics from the
 * discovery APIs and leveraging it in other parts of the extension.
 */
class JmxWizardCodeLensProvider implements vscode.CodeLensProvider {
  private readonly logTrace = ["codeLens", "jmxWizard", "JmxWizardCodeLensProvider"];
  private codeLenses: vscode.CodeLens[];
  private regex: RegExp;
  private lastScrape = "N/A";
  private jmxProcessListNames: string[] | undefined;
  private jmxProcessListIds: string[] | undefined;
  private processName: string | undefined;
  private processId: string | undefined;
  private technologyList: Set<string> | undefined;
  private hostList: Set<string> | undefined;
  private technologyName: string | undefined;
  private hostName: string | undefined;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    this.codeLenses = [];
    this.regex = /^(jmx:)/gm;
    vscode.commands.registerCommand(CodeLensCommand.ScrapeMetrics, this.scrapeMetrics.bind(this));
  }

  /**
   * Provides the actual Code Lenses. Two lenses are created: one to allow JMX data
   * detail collection and reading/processing data, the other to show when data was
   * last read and processed.
   * @param document document where provider was invoked
   * @returns list of Code Lenses
   */
  public provideCodeLenses(
    document: vscode.TextDocument,
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    this.codeLenses = [];
    const regex = new RegExp(this.regex);
    const text = document.getText();

    let matches;
    while ((matches = regex.exec(text)) !== null) {
      const line = document.lineAt(document.positionAt(matches.index).line);
      const indexOf = line.text.indexOf(matches[0]);
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));

      if (range) {
        // Action lens
        this.codeLenses.push(
          new vscode.CodeLens(range, {
            title: "Navigate MBeans",
            tooltip:
              "Connect to a Java process and capture its MBeans, then use them in the Extension.",
            command: CodeLensCommand.ScrapeMetrics,
            arguments: [],
          }),
        );
        // Edit config lens
        if (this.lastScrape !== "N/A") {
          this.codeLenses.push(
            new vscode.CodeLens(range, {
              title: "Edit config",
              tooltip: "Make changes to the JMX configuration.",
              command: CodeLensCommand.ScrapeMetrics,
              arguments: [true],
            }),
          );
        }
        // Status lens
        const scrapedMetrics = Object.keys(getCachedJMXData()[this.processName ?? ""] ?? {}).length;
        this.codeLenses.push(
          new vscode.CodeLens(range, {
            title:
              this.lastScrape === "N/A"
                ? this.lastScrape
                : `${scrapedMetrics} domains found (${this.lastScrape.substring(5)})`,
            tooltip:
              this.lastScrape === "N/A"
                ? "Data has not been captured yet."
                : `${this.lastScrape}. Found ${scrapedMetrics} domains.`,
            command: "",
            arguments: [],
          }),
        );
      }
    }

    return this.codeLenses;
  }

  /**
   * Metric scraping workflow. If no previous details are known, these are collected.
   * Upon successful scraping and processing, timestamp is updated.
   * @param changeConfig collect the details required for scraping, even if they exist already
   * @returns void
   */
  private async scrapeMetrics(changeConfig: boolean = false) {
    // Only collect details if none are available
    if (!this.processId || changeConfig) {
      // Clear cached data since we're now scraping a different process
      setCachedJMXData({});
    }
    const scrapeSuccess = await this.scrape();
    if (scrapeSuccess) {
      this.lastScrape = `Last captured at: ${new Date().toLocaleTimeString()}`;
      this._onDidChangeCodeLenses.fire();
    }
  }

  /**
   * Captures JMX metrics.
   * This involves connecting to the endpoint, reading the data, and processing it.
   * @returns whether discovery was successful (any errors) or not
   */
  private async scrape() {
    try {
      const dtClient = await getDynatraceClient();
      if (!dtClient) {
        throw Error("Cannot continue without Dynatrace API client.");
      }
      const jmxCompleteProcessList = await dtClient.extensionsV2.listJMXProcesses();
      if (!jmxCompleteProcessList) {
        throw Error("No JMX-enabled processes found for this environment.");
      }
      this.technologyList = new Set<string>();
      this.hostList = new Set<string>();
      jmxCompleteProcessList.forEach(element => {
        element.properties.TECHNOLOGIES.forEach(tech => {
          this.technologyList?.add(tech);
        });
      });
      if (this.technologyList.size > 0) {
        this.technologyName = (await vscode.window.showQuickPick(Array.from(this.technologyList), {
          title: "Capture data - Choose your technology",
          placeHolder: "Select the technology to filter your processes",
          canPickMany: false,
          ignoreFocusOut: true,
        })) as string;
      }
      jmxCompleteProcessList.forEach(element => {
        if (
          element.properties.TECHNOLOGIES.includes(this.technologyName ?? "") ||
          this.technologyName === undefined
        )
          element.properties.HOSTS.forEach(host => {
            this.hostList?.add(host);
          });
      });
      if (this.hostList.size > 0) {
        this.hostName = (await vscode.window.showQuickPick(Array.from(this.hostList), {
          title: "Capture data - Choose your host",
          placeHolder: "Select the host to filter your processes",
          canPickMany: false,
          ignoreFocusOut: true,
        })) as string;
      }
      this.jmxProcessListIds = [];
      this.jmxProcessListNames = [];
      jmxCompleteProcessList.forEach(element => {
        if (
          (element.properties.HOSTS.includes(this.hostName ?? "") || this.hostName === undefined) &&
          (element.properties.TECHNOLOGIES.includes(this.technologyName ?? "") ||
            this.technologyName === undefined)
        ) {
          this.jmxProcessListIds?.push(element.id);
          this.jmxProcessListNames?.push(element.name);
        }
      });
      this.processName = (await vscode.window.showQuickPick(this.jmxProcessListNames, {
        title: "Capture data - Choose your process",
        placeHolder: "Select the process to capture its MBeans",
        canPickMany: false,
        ignoreFocusOut: true,
      })) as string;
      const index = this.jmxProcessListNames.indexOf(this.processName);
      this.processId = this.jmxProcessListIds[index];
      const processDetails = await dtClient.extensionsV2.getJMXProcessDetails(this.processId);
      this.processJMXWizardData(processDetails);
      return true;
    } catch (err) {
      logger.error(err);
      return false;
    }
  }

  /**
   * Processes raw Prometheus data line by line and extracts the details relevant
   * for Extensions 2.0. The data is cached with a cached data provider for access
   * in other parts of the VSCode extension.
   * @param data raw data from a JMX process discovery API
   */
  private processJMXWizardData(data: MBeanListDto) {
    const jmxData: JMXData = {
      [`${this.processName}`]: data,
    };
    setCachedJMXData(jmxData);
  }
}

/**
 * Provides singleton access to the JmxWizardCodeLensProvider
 */
export const getJmxWizardCodeLensProvider = createSingletonProvider(JmxWizardCodeLensProvider);
