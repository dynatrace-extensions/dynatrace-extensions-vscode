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
import axios from "axios";
import * as vscode from "vscode";
import { getCachedPrometheusData, setCachedPrometheusData } from "../utils/caching";
import { setHttpsAgent } from "../utils/general";
import * as logger from "../utils/logging";

export type PromData = Record<string, PromDetails>;
type PromDetails = {
  type?: string;
  dimensions?: string[];
  description?: string;
};
type PromAuth = "No authentication" | "Bearer token" | "Username & password" | "AWS key";
type ScrapingMethod = "Endpoint" | "File";

/**
 * Provides singleton access to the PrometheusCodeLensProvider
 */
export const getPrometheusCodeLensProvider = (() => {
  let instance: PrometheusCodeLensProvider | undefined;

  return () => {
    instance = instance === undefined ? new PrometheusCodeLensProvider() : instance;
    return instance;
  };
})();

/**
 * Code Lens Provider implementation to facilitate loading Prometheus metrics and data
 * from an external endpoint and leveraging it in other parts of the extension.
 */
class PrometheusCodeLensProvider implements vscode.CodeLensProvider {
  private readonly logTrace = ["codeLens", "prometheusScraper", "PrometheusCodeLensProvider"];
  private codeLenses: vscode.CodeLens[];
  private regex: RegExp;
  private lastScrape = "N/A";
  private method: ScrapingMethod | undefined;
  private promUrl: string | undefined;
  private promFile: string | undefined;
  private promAuth: PromAuth | undefined;
  private promToken: string | undefined;
  private promUsername: string | undefined;
  private promPassword: string | undefined;
  private promAccessKey: string | undefined;
  private promSecretKey: string | undefined;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    this.codeLenses = [];
    this.regex = /^(prometheus:)/gm;
    vscode.commands.registerCommand(
      "dynatrace-extensions.codelens.scrapeMetrics",
      async (changeConfig: boolean) => {
        await this.scrapeMetrics(changeConfig);
      },
    );
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
              "Connect to an exporter or read a file and scrape metrics, then use them in the Extension.",
            command: "dynatrace-extensions.codelens.scrapeMetrics",
            arguments: [],
          }),
        );
        // Edit config lens
        if (this.lastScrape !== "N/A") {
          this.codeLenses.push(
            new vscode.CodeLens(range, {
              title: "Edit config",
              tooltip: "Make changes to the scraping configuration.",
              command: "dynatrace-extensions.codelens.scrapeMetrics",
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
    if ((!this.promUrl && !this.promFile) || changeConfig) {
      const details = await this.collectScrapingDetails();
      if (!details) {
        return;
      }
      // Clear cached data since we're now scraping a different endpoint/file
      setCachedPrometheusData({});
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
  private async collectScrapingDetails(): Promise<boolean> {
    // Endpoint URL
    this.method = (await vscode.window.showQuickPick(["Endpoint", "File"], {
      title: "Scrape data - method selection",
      placeHolder: "Select your scraping method",
      canPickMany: false,
      ignoreFocusOut: true,
    })) as ScrapingMethod;
    switch (this.method) {
      case "Endpoint":
        this.promUrl = await vscode.window.showInputBox({
          title: "Scrape data - endpoint URL",
          placeHolder: "Enter your full metrics endpoint URL",
          prompt: "Mandatory",
          ignoreFocusOut: true,
        });
        if (!this.promUrl) {
          return false;
        }
        // Endpoint connectivity scheme
        this.promAuth = (await vscode.window.showQuickPick(
          ["No authentication", "Bearer token", "Username & password", "AWS key"],
          {
            title: "Scrape data - endpoint authentication",
            placeHolder: "Select your endpoint's authentication scheme",
            canPickMany: false,
            ignoreFocusOut: true,
          },
        )) as PromAuth;
        // Endpoint authentication details
        switch (this.promAuth) {
          case "No authentication":
            return true;
          case "Bearer token":
            this.promToken = await vscode.window.showInputBox({
              title: "Scrape data - endpoint authentication",
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
              title: "Scrape data - endpoint authentication",
              placeHolder: "Enter the username to use for authentication",
              prompt: "Mandatory",
              ignoreFocusOut: true,
            });
            this.promPassword = await vscode.window.showInputBox({
              title: "Scrape data - endpoint authentication",
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
            logger.notify("ERROR", "AWS authentication not support yet, sorry.");
            return false;
            this.promAccessKey = await vscode.window.showInputBox({
              title: "Scrape data - endpoint authentication",
              placeHolder: "Enter the AWS access key to use for authentication",
              prompt: "Mandatory",
              ignoreFocusOut: true,
            });
            this.promSecretKey = await vscode.window.showInputBox({
              title: "Scrape data - endpoint authentication",
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
      case "File":
        this.promFile = await vscode.window.showInputBox({
          title: "Scrape data - file location",
          placeHolder: "Enter the full, physical location of the file",
          prompt: "Mandatory",
          ignoreFocusOut: true,
        });
        if (!this.promFile) {
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
  private async scrape() {
    try {
      switch (this.method) {
        case "Endpoint":
          if (!this.promUrl) {
            return false;
          }
          setHttpsAgent(this.promUrl);
          switch (this.promAuth) {
            case "No authentication":
              await axios.get(this.promUrl).then(res => {
                this.processPrometheusData(res.data as string);
              });
              return true;
            case "Username & password":
              if (!this.promUsername || !this.promPassword) {
                return false;
              }
              await axios
                .get(this.promUrl, {
                  auth: { username: this.promUsername, password: this.promPassword },
                })
                .then(res => {
                  this.processPrometheusData(res.data as string);
                });
              return true;
            case "Bearer token":
              if (!this.promToken) {
                return false;
              }
              await axios
                .get(this.promUrl, { headers: { Authorization: `Bearer ${this.promToken}` } })
                .then(res => {
                  this.processPrometheusData(res.data as string);
                });
              return true;
            default:
              return false;
          }
        case "File":
          if (!this.promFile) {
            return false;
          }
          try {
            const data = readFileSync(this.promFile, "utf-8");
            this.processPrometheusData(data);
            return true;
          } catch (err) {
            logger.error(err, ...this.logTrace);
            return false;
          }
      }
    } catch (err) {
      logger.error(err, ...this.logTrace);
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
    const scrapedMetrics: PromData = {};
    data
      .trim()
      .split("\n")
      .forEach(line => {
        // # HELP defines description of a metric
        if (line.startsWith("# HELP")) {
          const key = line.split("# HELP ")[1].split(" ")[0];
          let description = line.split(`${key} `)[1];
          if (!(key in scrapedMetrics)) {
            scrapedMetrics[key] = {} as PromDetails;
          }
          if (description.startsWith("description:")) {
            description = description.replace(/description: /gm, "");
          }
          scrapedMetrics[key].description = '"' + description.replace(/(\r\n|\n|\r)/gm, "") + '"';
          // # TYPE defines type of a metric
        } else if (line.startsWith("# TYPE")) {
          const key = line.split("# TYPE ")[1].split(" ")[0];
          let type = line.split(`${key} `)[1].trim();
          if (type === "counter") {
            type = "count";
          }
          if (!(key in scrapedMetrics)) {
            scrapedMetrics[key] = {} as PromDetails;
          }
          scrapedMetrics[key].type = type;
          // Any other line that is not a comment contains dimensions and the value
        } else if (!line.startsWith("#")) {
          let key = line.split(line.includes("{") ? "{" : " ")[0];
          const dimensionsStr = line.split(line.includes("{") ? "{" : " ")[1];
          if (key.endsWith("_total")) {
            if (
              key.split("_total")[0] in scrapedMetrics &&
              scrapedMetrics[key.split("_total")[0]].type === "count"
            ) {
              key = key.split("_total")[0];
            }
          }
          if (key.endsWith("_count")) {
            if (
              key.split("_count")[0] in scrapedMetrics &&
              scrapedMetrics[key.split("_count")[0]].type === "summary"
            ) {
              key = key.split("_count")[0];
            }
          }
          if (key.endsWith("_sum")) {
            if (
              key.split("_sum")[0] in scrapedMetrics &&
              scrapedMetrics[key.split("_sum")[0]].type === "summary"
            ) {
              key = key.split("_sum")[0];
            }
          }
          if (!(key in scrapedMetrics)) {
            scrapedMetrics[key] = {} as PromDetails;
          }
          // make sure lines without dimensions have the correct keys
          // if line includes dimensions, find them
          if (dimensionsStr.includes("}")) {
            const dimensions = dimensionsStr.slice(0, dimensionsStr.length - 1);
            dimensions.split(",").forEach(dimension => {
              if (dimension.includes("=")) {
                if (!("dimensions" in scrapedMetrics[key])) {
                  scrapedMetrics[key].dimensions = [];
                }
                const dKey = dimension.split("=")[0];
                if (!scrapedMetrics[key].dimensions?.includes(dKey)) {
                  scrapedMetrics[key].dimensions?.push(dKey);
                }
              }
            });
          }
        }
      });
    setCachedPrometheusData(scrapedMetrics);
  }
}
