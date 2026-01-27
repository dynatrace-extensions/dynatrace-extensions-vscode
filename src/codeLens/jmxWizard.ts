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

import { readFileSync } from "fs";
import { CodeLensCommand, UtilTypes } from "@common";
import axios from "axios";
import vscode from "vscode";
import { getConnectedTenant } from "../treeViews/tenantsTreeView";
import { getCachedPrometheusData, setCachedPrometheusData } from "../utils/caching";
import logger from "../utils/logging";
import { createSingletonProvider } from "../utils/singleton";

export type JMXData = string;

type JMXProcessList = {
  list: JMXProcess[];
};

type JMXProcess = {
  name: string;
  id: string;
  agentVersion: string;
  properties: JMXProperty;
};

type JMXProperty = {
  TECHNOLOGIES: string[];
  HOSTS: string[];
  PROCESS_GROUPS: string[];
};

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
 * Code Lens Provider implementation to facilitate loading Prometheus metrics and data
 * from an external endpoint and leveraging it in other parts of the extension.
 */
class JmxWizardCodeLensProvider implements vscode.CodeLensProvider {
  private readonly logTrace = ["codeLens", "jmxWizard", "JmxWizardCodeLensProvider"];
  private codeLenses: vscode.CodeLens[];
  private regex: RegExp;
  private lastScrape = "N/A";
  private token: string | undefined;
  private jmxCompleteProcessList: JMXProcessList | undefined;
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
   * Provides the actual Code Lenses. Two lenses are created: one to allow endpoint
   * detail collection and reading/processing data, the other to show when data was
   * last read and processed.
   * @param document document where provider was invoked
   * @param token cancellation token
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
            title: "Scrape data",
            tooltip:
              "Connect to a Java process and navigate its MBeans, then use them in the Extension.",
            command: CodeLensCommand.ScrapeMetrics,
            arguments: [],
          }),
        );
        // Edit config lens
        if (this.lastScrape !== "N/A") {
          this.codeLenses.push(
            new vscode.CodeLens(range, {
              title: "Edit config",
              tooltip: "Make changes to the scraping configuration.",
              command: CodeLensCommand.ScrapeMetrics,
              arguments: [true],
            }),
          );
        }
        // Status lens
        const scrapedMetrics = Object.keys(getCachedPrometheusData()).length;
        this.codeLenses.push(
          new vscode.CodeLens(range, {
            title:
              this.lastScrape === "N/A"
                ? this.lastScrape
                : `${scrapedMetrics} metrics (${this.lastScrape.substring(5)})`,
            tooltip:
              this.lastScrape === "N/A"
                ? "Data has not been scraped yet."
                : `${this.lastScrape}. Found ${scrapedMetrics} metrics.`,
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
      const details = await this.collectTokenDetails();
      if (!details) {
        return;
      }
      // Clear cached data since we're now scraping a different process
      // setCachedJmxWizardData({});
    }
    const scrapeSuccess = await this.scrape();
    if (scrapeSuccess) {
      this.lastScrape = `Last scraped at: ${new Date().toLocaleTimeString()}`;
      this._onDidChangeCodeLenses.fire();
    }
  }

  /**
   * Endpoint detail collection workflow. This workflow has been created to support
   * all the authenticaiton schemes that Prometheus Extensions 2.0 support.
   * @returns whether data collection was successful (i.e. mandatory details collected) or not
   */
  private async collectTokenDetails(): Promise<boolean> {
    this.token = await vscode.window.showInputBox({
      title: "Platform token",
      placeHolder: "Enter a Dynatrace platform token with the extensions:jmx:read scope",
      prompt: "Mandatory",
      ignoreFocusOut: true,
    });
    if (!this.token) {
      return false;
    }
    return true;
  }

  /**
   * Scrapes prometheus metrics.
   * This involves connecting to the endpoint, reading the data, and processing it.
   * @returns whether scraping was successful (any errors) or not
   */
  private async scrape() {
    if (!this.token) {
      return false;
    }
    try {
      const tenant = await getConnectedTenant();
      const environmentURL = tenant?.url;
      const javaProcessListURL =
        environmentURL + "/platform/extensions/v1/discovery/jmx/processes/";
      const config = {
        headers: {
          Authorization: "Bearer " + this.token,
        },
      };
      logger.info("I did this " + javaProcessListURL);
      await axios.get(javaProcessListURL, config).then(res => {
        this.jmxCompleteProcessList = res.data as undefined;
      });
      this.technologyList = new Set<string>();
      this.hostList = new Set<string>();
      this.jmxCompleteProcessList.forEach(element => {
        element.properties.TECHNOLOGIES.forEach(tech => {
          this.technologyList?.add(tech);
        });
      });
      if (this.technologyList.size > 0) {
        this.technologyName = (await vscode.window.showQuickPick(Array.from(this.technologyList), {
          title: "Scrape data - Choose your technology",
          placeHolder: "Select the technology to filter your processes",
          canPickMany: false,
          ignoreFocusOut: true,
        })) as string;
      }
      this.jmxCompleteProcessList?.forEach(element => {
        if (
          element.properties.TECHNOLOGIES.includes(this.technologyName) ||
          this.technologyName === undefined
        )
          element.properties.HOSTS.forEach(host => {
            this.hostList?.add(host);
          });
      });
      if (this.hostList.size > 0) {
        this.hostName = (await vscode.window.showQuickPick(Array.from(this.hostList), {
          title: "Scrape data - Choose your host",
          placeHolder: "Select the host to filter your processes",
          canPickMany: false,
          ignoreFocusOut: true,
        })) as string;
      }
      this.jmxProcessListIds = [];
      this.jmxProcessListNames = [];
      this.jmxCompleteProcessList?.forEach(element => {
        if (
          (element.properties.HOSTS.includes(this.hostName) || this.hostName === undefined) &&
          (element.properties.TECHNOLOGIES.includes(this.technologyName) ||
            this.technologyName === undefined)
        ) {
          this.jmxProcessListIds?.push(element.id);
          this.jmxProcessListNames?.push(element.name);
        }
      });
      this.processName = (await vscode.window.showQuickPick(this.jmxProcessListNames, {
        title: "Scrape data - Choose your process",
        placeHolder: "Select the process to scrape its MBeans",
        canPickMany: false,
        ignoreFocusOut: true,
      })) as string;
      const index = this.jmxProcessListNames.indexOf(this.processName);
      this.processId = this.jmxProcessListIds[index];
      await axios.get(javaProcessListURL + this.processId, config).then(res => {
        this.processJMXWizardData(res.data as jmxDataResponse);
      });
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
   * @param data raw data from a Prometheus Endpoint
   */
  private processJMXWizardData(data: jmxDataResponse) {
    //data.process_name = this.processName;
    //this.cachedData.setJMXWizardData(data);
  }
}

/**
 * Provides singleton access to the JmxWizardCodeLensProvider
 */
export const getJmxWizardCodeLensProvider = createSingletonProvider(JmxWizardCodeLensProvider);
