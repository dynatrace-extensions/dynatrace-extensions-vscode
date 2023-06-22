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

import { existsSync, readFileSync } from "fs";
import * as path from "path";
import Axios from "axios";
import { BehaviorSubject, Observable } from "rxjs";
import * as vscode from "vscode";
import * as yaml from "yaml";
import { PromData } from "../codeLens/prometheusScraper";
import { ValidationStatus } from "../codeLens/utils/selectorUtils";
import { WmiQueryResult } from "../codeLens/utils/wmiUtils";
import { Entity, EntityType } from "../dynatrace-api/interfaces/monitoredEntities";
import { ExtensionStub } from "../interfaces/extensionMeta";
import { EnvironmentsTreeDataProvider } from "../treeViews/environmentsTreeView";
import { getExtensionFilePath } from "./fileSystem";
import { fetchOID, OidInformation } from "./snmp";

type CachedDataType =
  | "builtinEntityTypes"
  | "parsedExtension"
  | "baristaIcons"
  | "prometheusData"
  | "wmiData"
  | "entityInstances"
  | "selectorStatuses"
  | "snmpData";

/**
 * Simple class for registering a consumer of cacheable data.
 * A consumer needs to have been registered as a subscriber to the type of data it needs to consume.
 * Extend from CachedDataConsumer and make use of any property you've subscribed yourself to.
 */
export class CachedDataConsumer {
  protected builtinEntityTypes: EntityType[] = undefined;
  protected baristaIcons: string[] = undefined;
  protected parsedExtension: ExtensionStub = undefined;
  protected prometheusData: PromData = undefined;
  protected wmiData: Record<string, WmiQueryResult | undefined> = undefined;
  protected entityInstances: Record<string, Entity[] | undefined> = undefined;
  protected selectorStatuses: Record<string, ValidationStatus | undefined> = undefined;
  protected snmpData: Record<string, OidInformation | undefined> = undefined;

  public updateCachedData(dataType: CachedDataType, data: unknown) {
    if (Object.keys(this).includes(dataType)) {
      this[dataType.toString()] = data;
    }
  }
}

/**
 * Simple class for registering a producer of cacheable data.
 * Producers have the data cache as dependency so they can update data, also giving them full access
 * to consume any cached data as needed (provided they've been subscribed to it, of course).
 * Extend from CachedDataProducer and use the update functions to update data.
 */
export class CachedDataProducer extends CachedDataConsumer {
  protected cachedData: CachedData;

  constructor(cachedData: CachedData) {
    super();
    this.cachedData = cachedData;
  }
}

/**
 * A utility class for caching reusable data that other components depend on.
 * Data is fetched only when needed and stored in-memory for reusability. This class should have
 * only 1 global instance throughout the project, otherwise multiple cache copies can create issues.
 * Find the global instance in src/extension.ts
 */
export class CachedData {
  private readonly environments: EnvironmentsTreeDataProvider;
  private builtinEntityTypes = new BehaviorSubject<EntityType[]>([]);
  private parsedExtension = new BehaviorSubject<ExtensionStub | undefined>(undefined);
  private baristaIcons = new BehaviorSubject<string[]>([]);
  private selectorStatuses = new BehaviorSubject<Record<string, ValidationStatus | undefined>>({});
  private prometheusData = new BehaviorSubject<PromData>({});
  private wmiData = new BehaviorSubject<Record<string, WmiQueryResult | undefined>>({});
  private snmpData = new BehaviorSubject<Record<string, OidInformation | undefined>>({});
  private entityInstances = new BehaviorSubject<Record<string, Entity[] | undefined>>({});

  /**
   * @param environments a Dynatrace Environments provider
   */
  constructor(environments: EnvironmentsTreeDataProvider) {
    this.environments = environments;
  }

  public subscribeConsumers(subscription: Partial<Record<CachedDataType, CachedDataConsumer[]>>) {
    Object.entries(subscription).forEach(([dataType, consumers]) => {
      consumers.forEach(consumer => {
        (this[dataType] as BehaviorSubject<unknown>).subscribe({
          next: data => consumer.updateCachedData(dataType as CachedDataType, data),
        });
      });
    });
  }

  /**
   * Gets the latest value of the given cached data type. Needed when you're outside of a class and
   * cannot extend to create a CachedDataConsumer or CachedDataProducer.
   * @param dataType type of cached data you need.
   * @returns "builtinEntityTypes" => {@link EntityType}[]
     @returns "parsedExtension" => {@link ExtensionStub}
     @returns "baristaIcons" => string[]
     @returns "prometheusData" => {@link PromData}
     @returns "wmiData" => Record<string, {@link WmiQueryResult}>
     @returns "entityInstances" => Record<string, {@link Entity}[]>
     @returns "selectorStatuses" => Record<string, {@link ValidationStatus}>
     @returns "snmpData" => Record<string, {@link OidInformation}>
   */
  public getCached<T>(dataType: CachedDataType) {
    return this[dataType].getValue() as T;
  }

  /**
   * Initializes cache by pulling all data that can be pre-loaded and setting up update schedules.
   */
  public async initialize() {
    // Fetch entities
    this.fetchBuiltinEntityTypes()
      .then(entityTypes => this.builtinEntityTypes.next(entityTypes))
      .catch(() => this.builtinEntityTypes.next([]))
      .finally(() => this.builtinEntityTypes.complete());

    // Fetch Barista icons
    this.fetchBaristaIcons()
      .then(icons => this.baristaIcons.next(icons))
      .catch(() => this.baristaIcons.next([]))
      .finally(() => this.baristaIcons.complete());

    // Fetch extension manifest and update it with every document change
    new Observable(subscriber => {
      try {
        const initialValue = yaml.parse(this.fetchExtensionManifest()) as ExtensionStub;
        subscriber.next(initialValue);
      } catch {
        // Don't really caare about invalid YAMLs
      }
      // Extension manifest should be updated on every doc change
      const manifestFilePath = getExtensionFilePath();
      vscode.workspace.onDidChangeTextDocument(change => {
        if (path.resolve(change.document.fileName) === path.resolve(manifestFilePath)) {
          try {
            const newValue = yaml.parse(change.document.getText()) as ExtensionStub;
            subscriber.next(newValue);
          } catch {
            // Don't really care about invalid YAMLs
          }
        }
      });
    }).subscribe(this.parsedExtension);
  }

  /**
   * Fetches the list of Dynatrace built-in entity types from the currently connected environment.
   */
  private async fetchBuiltinEntityTypes(): Promise<EntityType[]> {
    const dtClient = await this.environments.getDynatraceClient();
    if (dtClient) {
      const entityTypes = await dtClient.entitiesV2.listTypes().catch(() => []);
      return entityTypes;
    }

    return [];
  }

  /**
   * Fetches the content of the extension manifest as string.
   */
  private fetchExtensionManifest(): string {
    const manifestFilePath = getExtensionFilePath();
    if (manifestFilePath && existsSync(manifestFilePath)) {
      return readFileSync(manifestFilePath).toString();
    }
    return "";
  }

  /**
   * Loads the names of all available Barista Icons. The internal Barista endpoint is tried first,
   * before the public one.
   */
  private async fetchBaristaIcons(): Promise<string[]> {
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

    const icons = await Axios.get<BaristaResponse>(internalURL)
      .then(res => {
        if (res.data.icons) {
          return res.data.icons.map((i: BaristaMeta) => i.name);
        }
        return [];
      })
      .catch(() => {
        const publicIcons = Axios.get<BaristaResponse>(publicURL)
          .then(res => {
            if (res.data.icons) {
              return res.data.icons.map((i: BaristaMeta) => i.name);
            }
            return [];
          })
          .catch(err => {
            console.log("Barista not accessible.");
            console.log((err as Error).message);
            return [];
          });
        return publicIcons;
      });

    return icons;
  }

  /**
   * On demand update of built-in entity types (TODO: is this really needed? who would trigger it?).
   */
  public updateEntityTypes() {
    this.fetchBuiltinEntityTypes()
      .then(entityTypes => this.builtinEntityTypes.next(entityTypes))
      .catch(() => this.builtinEntityTypes.next([]))
      .finally(() => this.builtinEntityTypes.complete());
  }

  /**
   * On demand update of Prometheus cached data.
   */
  public setPrometheusData(data: PromData) {
    this.prometheusData.next(data);
  }

  /**
   * On demand update of WMI Query cached data.
   */
  public updateWmiQueryResult(result: WmiQueryResult) {
    const nextWmiData = this.wmiData.getValue();
    nextWmiData[result.query] = result;
    this.wmiData.next(nextWmiData);
  }

  /**
   * On demand update of Entity Instances
   */
  public async addEntityInstances(types: string[]) {
    const dtClient = await this.environments.getDynatraceClient();
    if (dtClient) {
      const entityPromises = types.map(async (t: string): Promise<[string, Entity[]]> => {
        if (!(t in this.entityInstances.getValue())) {
          return [t, await dtClient.entitiesV2.list(`type(${t}}`).catch(() => [])];
        }
        return [t, this.entityInstances.getValue()[t]];
      });
      const entityLists = await Promise.all(entityPromises);
      const nextEntityInstances = {
        ...this.entityInstances.getValue(),
        ...Object.fromEntries(entityLists),
      };

      this.entityInstances.next(nextEntityInstances);
    }
  }

  /**
   * On demand update the validation status for a selector.
   * @param selector the selector to update status for
   * @param status the current validation status
   */
  public updateSelectorStatus(selector: string, status: ValidationStatus) {
    const nextSelectorStatuses = this.selectorStatuses.getValue();
    nextSelectorStatuses[selector] = status;
    this.selectorStatuses.next(nextSelectorStatuses);
  }

  /**
   * On demand update of the SNMP data.
   * @param oid
   */
  public async updateSnmpOid(oid: string) {
    const nextSnmpData = this.snmpData.getValue();
    if (!(oid in nextSnmpData)) {
      const data = await fetchOID(oid);
      nextSnmpData[oid] = data;
      this.snmpData.next(nextSnmpData);
    }
  }

  /**
   * On demand update of the SNMP data.
   * @param oids
   */
  public async updateSnmpData(oids: string[]) {
    const oidPromises = oids.map(async (oid: string): Promise<[string, OidInformation]> => {
      if (!(oid in this.snmpData.getValue())) {
        return [oid, await fetchOID(oid)];
      } else {
        return [oid, this.snmpData.getValue()[oid]];
      }
    });
    const oidData = await Promise.all(oidPromises);
    const nextSnmpData = {
      ...this.snmpData.getValue(),
      ...Object.fromEntries(oidData),
    };
    this.snmpData.next(nextSnmpData);
  }
}
