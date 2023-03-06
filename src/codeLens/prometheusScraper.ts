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

import * as vscode from "vscode";
import axios from "axios";
import { CachedDataProvider } from "../utils/dataCaching";

type PromAuth = "No authentication" | "Bearer token" | "Username & password" | "AWS key";
export interface PromData {
  [key: string]: {
    type?: string;
    dimensions?: string[];
    description?: string;
  };
}

/**
 * Code Lens Provider implementation to facilitate loading Prometheus metrics and data
 * from an external endpoint and leveraging it in other parts of the extension.
 */
export class PrometheusCodeLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[];
  private regex: RegExp;
  private lastScrape = "N/A";
  private promUrl: string | undefined;
  private promAuth: PromAuth | undefined;
  private promToken: string | undefined;
  private promUsername: string | undefined;
  private promPassword: string | undefined;
  private promAccessKey: string | undefined;
  private promSecretKey: string | undefined;
  private readonly cachedData: CachedDataProvider;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  /**
   * @param cachedDataProvider provider of cacheable data
   */
  constructor(cachedDataProvider: CachedDataProvider) {
    this.codeLenses = [];
    this.regex = /^(prometheus:)/gm;
    vscode.commands.registerCommand("dt-ext-copilot.codelens.scrapeMetrics", (changeConfig: boolean) => {
      this.scrapeMetrics(changeConfig);
    });
    this.cachedData = cachedDataProvider;
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
    token: vscode.CancellationToken
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
            tooltip: "Connect to an exporter and scrape metrics, then use them in the Extension.",
            command: "dt-ext-copilot.codelens.scrapeMetrics",
            arguments: [],
          })
        );
        // Edit config lens
        if (this.lastScrape !== "N/A") {
          this.codeLenses.push(
            new vscode.CodeLens(range, {
              title: "Edit config",
              tooltip: "Make changes to the endpoint connection details",
              command: "dt-ext-copilot.codelens.scrapeMetrics",
              arguments: [true],
            })
          );
        }
        // Status lens
        const scrapedMetrics = Object.keys(this.cachedData.getPrometheusData()).length;
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
          })
        );
      }
    }

    return this.codeLenses;
  }

  /**
   * Metric scraping workflow. If no previous details are known, these are collected.
   * Upon successful scraping and processing, timestamp is updated.
   * @param changeConfig force collecting the details required for scraping, even if they exist already
   * @returns void
   */
  private async scrapeMetrics(changeConfig: boolean = false) {
    // Only collect details if none are available
    if (!this.promUrl || changeConfig) {
      const details = await this.collectEndpointDetails();
      if (!details) {
        return;
      }
      // Clear cached data since we're now scraping a different endpoint
      this.cachedData.addPrometheusData({});
    }
    const scrapeSuccess = this.scrape();
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
  private async collectEndpointDetails(): Promise<boolean> {
    // Endpoint URL
    const url = await vscode.window.showInputBox({
      title: "Scrape Prometheus Data (1/2)",
      placeHolder: "Enter your full metrics endpoint URL",
      prompt: "Mandatory",
      ignoreFocusOut: true,
    });
    if (!url) {
      return false;
    }
    this.promUrl = url;
    // Endpoint connectivity scheme
    this.promAuth = (await vscode.window.showQuickPick(
      ["No authentication", "Bearer token", "Username & password", "AWS key"],
      {
        title: "Scrape Prometheus Data (2/2)",
        placeHolder: "Select your endpoint's authentication scheme",
        canPickMany: false,
        ignoreFocusOut: true,
      }
    )) as PromAuth;
    // Endpoint authentication details
    switch (this.promAuth) {
      case "No authentication":
        return true;
      case "Bearer token":
        this.promToken = await vscode.window.showInputBox({
          title: "Scrape Prometheus Data (2/2)",
          placeHolder: "Enter the Bearer token to use for authentication",
          prompt: "Mandatory",
          ignoreFocusOut: true,
        });
        if (!this.promToken) {
          return false;
        }
        return true;
      case "Username & password":
        this.promUsername = await vscode.window.showInputBox({
          title: "Scrape Prometheus Data (2/2)",
          placeHolder: "Enter the username to use for authentication",
          prompt: "Mandatory",
          ignoreFocusOut: true,
        });
        this.promPassword = await vscode.window.showInputBox({
          title: "Scrape Prometheus Data (2/2)",
          placeHolder: "Enter the password to use for authentication",
          prompt: "Mandatory",
          ignoreFocusOut: true,
          password: true,
        });
        if (!this.promUsername || !this.promPassword) {
          return false;
        }
        return true;
      case "AWS key":
        // TODO: Figure out how to implement AWS authentication
        vscode.window.showErrorMessage("AWS authentication not support yet, sorry.");
        return false;
        this.promAccessKey = await vscode.window.showInputBox({
          title: "Scrape Prometheus Data (2/2)",
          placeHolder: "Enter the AWS access key to use for authentication",
          prompt: "Mandatory",
          ignoreFocusOut: true,
        });
        this.promSecretKey = await vscode.window.showInputBox({
          title: "Scrape Prometheus Data (2/2)",
          placeHolder: "Enter the AWS secret key to use for authentication",
          prompt: "Mandatory",
          ignoreFocusOut: true,
        });
        if (!this.promAccessKey || !this.promSecretKey) {
          return false;
        }
        return true;
      default:
        return false;
    }
  }

  /**
   * Scrapes prometheus metrics.
   * This involves connecting to the endpoint, reading the data, and processing it.
   * @returns whether scraping was successful (any errors) or not
   */
  private scrape() {
    try {
      switch (this.promAuth) {
        case "No authentication":
          axios.get(this.promUrl!).then(res => {
            this.processPrometheusData(res.data);
          });
          return true;
        case "Username & password":
          axios
            .get(this.promUrl!, { auth: { username: this.promUsername!, password: this.promPassword! } })
            .then(res => {
              this.processPrometheusData(res.data);
            });
          return true;
        case "Bearer token":
          // eslint-disable-next-line
          axios.get(this.promUrl!, { headers: { Authorization: `Bearer ${this.promToken}` } }).then(res => {
            this.processPrometheusData(res.data);
          });
          return true;
        default:
          return false;
      }
    } catch (err) {
      console.log(err);
      return false;
    }
  }

  /**
   * Processes raw Prometheus data line by line and extracts the details relevant
   * for Extensions 2.0. The data is cached with a cached data provider for access
   * in other parts of the VSCode extension.
   * @param data raw data from a Prometheus Endpoint
   */
  private processPrometheusData(data: string) {
    var scrapedMetrics: PromData = {};
    data
      .trim()
      .split("\n")
      .forEach(line => {
        // # HELP defines description of a metric
        if (line.startsWith("# HELP")) {
          var key = line.split("# HELP ")[1].split(" ")[0];
          var description = line.split(`${key} `)[1];
          if (!scrapedMetrics[key]) {
            scrapedMetrics[key] = {};
          }
          scrapedMetrics[key]["description"] = description;
          // # TYPE defines type of a metric
        } else if (line.startsWith("# TYPE")) {
          var key = line.split("# TYPE ")[1].split(" ")[0];
          var type = line.split(`${key} `)[1];
          if (type === "counter") {
            type = "count";
          }
          if (!scrapedMetrics[key]) {
            scrapedMetrics[key] = {};
          }
          scrapedMetrics[key]["type"] = type;
          // Any other line contains dimensions and the value
        } else {
          if (line.includes("{")) {
            var [key, dimensions] = line.split("{");
            if (!scrapedMetrics[key]) {
              scrapedMetrics[key] = {};
            }
            // make sure lines without dimenions have the correct keys
          } else {
            var [key, dimensions] = line.split(" ");
          }
          // if line includes dimensions, find them
          if (dimensions && dimensions.includes("}")) {
            dimensions = dimensions.slice(0, dimensions.length - 1);
            dimensions.split(",").forEach(dimension => {
              if (dimension.includes("=")) {
                if (!scrapedMetrics[key]["dimensions"]) {
                  scrapedMetrics[key]["dimensions"] = [];
                }
                var dKey = dimension.split("=")[0];
                if (!scrapedMetrics[key]["dimensions"]!.includes(dKey)) {
                  scrapedMetrics[key]["dimensions"]!.push(dKey);
                }
              }
            });
          }
        }
      });
    this.cachedData.addPrometheusData(scrapedMetrics);
  }
}
