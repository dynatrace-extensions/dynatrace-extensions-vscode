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

/********************************************************************************
 * UTILITIES FOR IN-MEMORY CACHING AND DATA RE-USE
 ********************************************************************************/

import Axios from "axios";
import * as yaml from "yaml";
import { PromData } from "../codeLens/prometheusScraper";
import { ValidationStatus } from "../codeLens/utils/selectorUtils";
import { WmiQueryResult } from "../codeLens/utils/wmiUtils";
import { Entity, EntityType } from "../dynatrace-api/interfaces/monitoredEntities";
import { ExtensionStub } from "../interfaces/extensionMeta";
import { EnvironmentsTreeDataProvider } from "../treeViews/environmentsTreeView";
import { fetchOID, OidInformation } from "./snmp";

/**
 * A utility class for caching reusable data that other components depend on.
 * The idea is that shared, cacheable data should only be fetched once.
 */
export class CachedDataProvider {
  private readonly environments: EnvironmentsTreeDataProvider;
  private builtinEntities: EntityType[] = [];
  private baristaIcons: string[] = [];
  private selectorStatuses: Record<string, ValidationStatus> = {};
  private prometheusData: PromData = {};
  private wmiData: Record<string, WmiQueryResult> = {};
  private oidInfo: Record<string, OidInformation> = {};
  private extensionYaml: ExtensionStub | undefined;
  private extensionText: string | undefined;
  private extensionLineCounter: yaml.LineCounter | undefined;
  private entityInstances: Record<string, Entity[]> = {};

  /**
   * @param environments a Dynatrace Environments provider
   */
  constructor(environments: EnvironmentsTreeDataProvider) {
    this.environments = environments;
    this.loadBuiltinEntities().catch(() => {});
    this.loadBaristaIcons();
  }

  /**
   * Gets any cached Prometheus data.
   * @returns cached data
   */
  public getPrometheusData(): PromData {
    return this.prometheusData;
  }

  /**
   * Caches Prometheus data.
   * @param data data to cache
   */
  public addPrometheusData(data: PromData) {
    this.prometheusData = data;
  }

  /**
   * Gets a cached selector validation status.
   * @param selector the selector string to get status for
   * @returns last known validation status
   */
  public getSelectorStatus(selector: string): ValidationStatus {
    return selector in this.selectorStatuses
      ? this.selectorStatuses[selector]
      : { status: "unknown" };
  }

  /**
   * Updates the validation status for a selector.
   * @param selector the selector to update status for
   * @param status the current validation status
   */
  public addSelectorStatus(selector: string, status: ValidationStatus) {
    this.selectorStatuses[selector] = status;
  }

  /**
   * Gets a list of Dynatrace built-in entities and their details.
   * @returns list of entities
   */
  public async getBuiltinEntities(): Promise<EntityType[]> {
    if (this.builtinEntities.length === 0) {
      await this.loadBuiltinEntities();
    }

    return this.builtinEntities;
  }

  /**
   * Gets a list of Dynatrace Barista icon IDs.
   * @returns list of icon IDs
   */
  public getBaristaIcons(): string[] {
    if (this.baristaIcons.length === 0) {
      this.loadBaristaIcons();
    }

    return this.baristaIcons;
  }

  /**
   * Loads the list of Dynatrace built-in entities from
   * the currently connected environment, if any.
   */
  private async loadBuiltinEntities() {
    await this.environments.getDynatraceClient().then(async dt => {
      if (dt) {
        await dt.entitiesV2.listTypes().then((types: EntityType[]) => {
          if (types.length > 0) {
            this.builtinEntities = types;
          }
        });
      }
    });
  }

  /**
   * Loads the names of all available Barista Icons.
   * The internal Barista endpoint is tried first, before the public one.
   */
  private loadBaristaIcons() {
    const publicURL = "https://barista.dynatrace.com/data/resources/icons.json";
    const internalURL = "https://barista.lab.dynatrace.org/data/resources/icons.json";
    interface BaristaResponse {
      icons?: BaristaMeta[];
    }
    interface BaristaMeta {
      title: string;
      public: boolean;
      tags: string[];
      name: string;
    }

    Axios.get<BaristaResponse>(internalURL)
      .then(res => {
        if (res.data.icons) {
          this.baristaIcons = res.data.icons.map((i: BaristaMeta) => i.name);
        }
      })
      .catch(async () => {
        Axios.get<BaristaResponse>(publicURL)
          .then(res => {
            if (res.data.icons) {
              this.baristaIcons = res.data.icons.map((i: BaristaMeta) => i.name);
            }
          })
          .catch(err => {
            console.log("Barista not accessible.");
            console.log((err as Error).message);
          });
      });
  }

  public getWmiQueryResult(query: string): WmiQueryResult | undefined {
    return this.wmiData[query];
  }

  public addWmiQueryResult(result: WmiQueryResult) {
    this.wmiData[result.query] = result;
  }

  public async getSingleOidInfo(oid: string): Promise<OidInformation> {
    if (!(oid in this.oidInfo)) {
      this.oidInfo[oid] = await fetchOID(oid);
    }

    return this.oidInfo[oid];
  }

  public async getBulkOidsInfo(oids: string[]): Promise<OidInformation[]> {
    const infoPromises = oids.map(oid => this.getSingleOidInfo(oid));
    const infos = await Promise.all(infoPromises);
    return infos;
  }

  public getSnmpData(): Record<string, OidInformation> {
    return this.oidInfo;
  }

  public getExtensionYaml(extension: string): ExtensionStub {
    if (this.extensionText && this.extensionText === extension && this.extensionYaml) {
      return this.extensionYaml;
    }

    this.extensionText = extension;
    this.extensionLineCounter = new yaml.LineCounter();
    this.extensionYaml = yaml.parse(extension, {
      lineCounter: this.extensionLineCounter,
    }) as ExtensionStub;
    return this.extensionYaml;
  }

  public getStringifiedExtension(extensionYaml?: ExtensionStub): string {
    if (extensionYaml) {
      return yaml.stringify(extensionYaml, {
        lineCounter: this.extensionLineCounter,
        lineWidth: 0,
      });
    }
    return yaml.stringify(this.extensionYaml, {
      lineCounter: this.extensionLineCounter,
      lineWidth: 0,
    });
  }

  public async getEntitiesOfType(type: string): Promise<Entity[]> {
    const dt = await this.environments.getDynatraceClient();
    if (dt) {
      if (!(type in this.entityInstances)) {
        this.entityInstances[type] = await dt.entitiesV2.list(`type(${type})`).catch(() => []);
      }
    } else {
      return [];
    }
    return this.entityInstances[type];
  }

  public async getBulkEntities(types: string[]) {
    const entityPromises = types.map(t => this.getEntitiesOfType(t));
    const entityLists = await Promise.all(entityPromises);
    return entityLists.flat();
  }
}
