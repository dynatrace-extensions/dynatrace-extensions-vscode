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
import { BehaviorSubject, Observable, switchMap, of, delay, map } from "rxjs";
import * as vscode from "vscode";
import * as yaml from "yaml";
import { PromData } from "../codeLens/prometheusScraper";
import { ValidationStatus } from "../codeLens/utils/selectorUtils";
import { WmiQueryResult } from "../codeLens/utils/wmiUtils";
import { Entity, EntityType } from "../dynatrace-api/interfaces/monitoredEntities";
import { ExtensionStub } from "../interfaces/extensionMeta";
import { EnvironmentsTreeDataProvider } from "../treeViews/environmentsTreeView";
import { loopSafeWait } from "./code";
import { getExtensionFilePath, getSnmpMibFiles } from "./fileSystem";
import { fetchOID, MibModuleStore, OidInformation, parseMibFile } from "./snmp";

type CachedDataType =
  | "builtinEntityTypes"
  | "parsedExtension"
  | "baristaIcons"
  | "prometheusData"
  | "wmiData"
  | "wmiStatuses"
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
  protected wmiStatuses: Record<string, ValidationStatus | undefined> = undefined;
  protected entityInstances: Record<string, Entity[] | undefined> = undefined;
  protected selectorStatuses: Record<string, ValidationStatus | undefined> = undefined;
  protected snmpData: Record<string, OidInformation | undefined> = undefined;
  private snmpDatabase: OidInformation[];

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

type LoadedFile = { name: string; filePath: string };

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
  private wmiStatuses = new BehaviorSubject<Record<string, ValidationStatus | undefined>>({});
  private snmpData = new BehaviorSubject<Record<string, OidInformation | undefined>>({});
  private entityInstances = new BehaviorSubject<Record<string, Entity[] | undefined>>({});
  private localSnmpDatabase: OidInformation[] = [];
  private mibStore: MibModuleStore;
  public mibFilesLoaded: LoadedFile[] = [];

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
     @returns "wmiStatuses" => Record<string, {@link ValidationStatus}>
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

    // Fetch extension manifest
    const initialManifestContent = this.fetchExtensionManifest();
    // Load local SNMP database if applicable
    if (/^snmp:.*?$/gm.test(initialManifestContent)) {
      this.buildLocalSnmpDatabase();
      // Also process user's MIB files
      this.loadLocalMibFiles(getSnmpMibFiles()).catch(() => {});
    }

    // Initial parse of extension manifest
    new Observable(subscriber => {
      subscriber.next(initialManifestContent);
      const manifestFilePath = getExtensionFilePath();
      const pushTextUpdate = (filePath: string, doc: vscode.TextDocument) => {
        // If manifest didn't exist at activation time, we must detect again
        if (!filePath) {
          filePath = getExtensionFilePath();
        }
        if (path.resolve(doc.fileName) === path.resolve(filePath)) {
          subscriber.next(doc.getText());
        }
      };

      // Given all scenarios, YAML should be updated
      // On every document change
      vscode.workspace.onDidChangeTextDocument(change => {
        pushTextUpdate(manifestFilePath, change.document);
      });
      // On every document save
      vscode.workspace.onDidSaveTextDocument(document => {
        pushTextUpdate(manifestFilePath, document);
      });
      // On every document open
      vscode.workspace.onDidOpenTextDocument(document => {
        pushTextUpdate(manifestFilePath, document);
      });
    })
      .pipe(
        // Skip some expensive processing by only parsing the last text after 200 ms
        switchMap((value: string) => of(value).pipe(delay(200))),
        map((manifestText: string) => {
          try {
            return yaml.parse(manifestText) as ExtensionStub;
          } catch {
            // If YAML is invalid, revert back to previous value
            return this.parsedExtension.getValue();
          }
        }),
      )
      .subscribe(this.parsedExtension);

    // Wait for the parsed extension to be available before completing the init
    while (this.parsedExtension.getValue() === undefined) {
      await loopSafeWait(100);
    }
  }

  /**
   * Loads some base MIB files and builds out a local in-memory SNMP Database which should have
   * higher priority for OID searches than the online server.
   */
  private buildLocalSnmpDatabase() {
    this.mibStore = new MibModuleStore();
    this.localSnmpDatabase = this.mibStore.getAllOidInfos();
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

  private async collectSingleOid(oid: string): Promise<[string, OidInformation]> {
    // Check it's not in the cached data
    if (!(oid in this.snmpData.getValue())) {
      // And not in the local database
      const nameNotation = /^[\da-zA-Z]+$/.test(oid);
      const localIndex = this.localSnmpDatabase.findIndex(obj =>
        nameNotation ? obj.objectType === oid : obj.oid === oid,
      );
      if (localIndex === -1) {
        // Only ASN.1 notation is supported for online fetching
        return nameNotation ? [oid, {}] : [oid, await fetchOID(oid)];
      } else {
        return [oid, this.localSnmpDatabase[localIndex]];
      }
    } else {
      return [oid, this.snmpData.getValue()[oid]];
    }
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
   * On demand update the execution status for a WMI query.
   * @param query WMI query to update status for
   * @param status the current execution status
   */
  public updateWmiStatus(query: string, status: ValidationStatus) {
    const nextWmiStatuses = this.wmiStatuses.getValue();
    nextWmiStatuses[query] = status;
    this.wmiStatuses.next(nextWmiStatuses);
  }

  /**
   * On demand update of the SNMP data.
   * @param oid
   */
  public async updateSnmpOid(oid: string) {
    const [, info] = await this.collectSingleOid(oid);
    const nextSnmpData = this.snmpData.getValue();
    nextSnmpData[oid] = info;
    this.snmpData.next(nextSnmpData);
  }

  /**
   * On demand update of the SNMP data.
   * @param oids
   */
  public async updateSnmpData(oids: string[]) {
    const oidPromises = oids.map(oid => this.collectSingleOid(oid));
    const oidData = await Promise.all(oidPromises);
    const nextSnmpData = {
      ...this.snmpData.getValue(),
      ...Object.fromEntries(oidData),
    };
    this.snmpData.next(nextSnmpData);
  }

  /**
   * Update the local SNMP database with content from extension files
   * @param files filePaths to process
   */
  public async loadLocalMibFiles(files: string[]) {
    const newFiles = files.filter(
      file =>
        this.mibFilesLoaded.findIndex(
          loadedMib =>
            loadedMib.name.toLowerCase() === path.basename(file).toLowerCase() ||
            loadedMib.filePath === file,
        ) === -1,
    );
    const partialParsed: OidInformation[] = [];
    if (newFiles.length > 0) {
      newFiles.forEach(file => {
        this.mibFilesLoaded.push({ name: path.basename(file).split(".")[0], filePath: file });
        try {
          this.mibStore.loadFromFile(file);
        } catch {
          // TODO: Should analyse if this is really needed
          partialParsed.push(...parseMibFile(file));
        }
      });

      this.localSnmpDatabase = [...this.mibStore.getAllOidInfos(), ...partialParsed];
    }
  }
}
