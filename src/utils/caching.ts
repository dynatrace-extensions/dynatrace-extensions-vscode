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

import * as path from "path";
import Axios from "axios";
import { BehaviorSubject, Observable, Subscriber, delay, map, of, switchMap } from "rxjs";
import * as vscode from "vscode";
import * as yaml from "yaml";
import { PromData } from "../codeLens/prometheusScraper";
import { ValidationStatus } from "../codeLens/utils/selectorUtils";
import { WmiQueryResult } from "../codeLens/utils/wmiUtils";
import { Entity, EntityType } from "../dynatrace-api/interfaces/monitoredEntities";
import { ExtensionStub } from "../interfaces/extensionMeta";
import { getDynatraceClient } from "../treeViews/tenantsTreeView";
import * as logger from "../utils/logging";
import { waitForCondition } from "./code";
import { getExtensionFilePath, getSnmpMibFiles, readExtensionManifest } from "./fileSystem";
import {
  MibModuleStore,
  OidInformation,
  downloadActiveGateMibFiles,
  fetchOID,
  parseMibFile,
} from "./snmp";

type LoadedMibFile = { name: string; filePath: string };
interface BaristaResponse {
  icons?: BaristaMeta[];
}
interface BaristaMeta {
  title: string;
  public: boolean;
  tags: string[];
  name: string;
}

const logTrace = ["utils", "caching"];
let initialized = false;
let globalStorage: string;
let builtinEntityTypes: EntityType[] = [];
const parsedExtension = new BehaviorSubject<ExtensionStub | undefined>(undefined);
let baristaIcons: string[] = [];
const selectorStatuses = new Map<string, ValidationStatus>();
let prometheusData: PromData = {};
const wmiQueryResults = new Map<string, WmiQueryResult>();
const wmiQueryStatuses = new Map<string, ValidationStatus>();
const snmpOIDs = new Map<string, OidInformation>();
const entityInstances = new Map<string, Entity[]>();
let localSnmpDatabase: OidInformation[] = [];
let mibStore: MibModuleStore;
const mibFilesLoaded: LoadedMibFile[] = [];
let manifestParsingPipeline: Subscriber<string>;

export const initializeCache = async (globalStoragePath: string) => {
  if (initialized) return;
  const fnLogTrace = [...logTrace, "initializeCache"];
  logger.info("Initializing Data Cache...", ...fnLogTrace);

  const initialManifestContent = readExtensionManifest();
  createManifestProcessingPipeline(initialManifestContent);
  setManifestChangeListeners();

  // Wait for the parsed extension to be available before completing the init
  await waitForCondition(() => parsedExtension.getValue() !== undefined);

  globalStorage = globalStoragePath;
  loadBuiltinEntityTypes().then(
    () => logger.debug("Built-in entity types loaded", ...fnLogTrace),
    () => logger.debug("Built-in entity types unavailable", ...fnLogTrace),
  );
  loadBaristaIcons().then(
    () => logger.debug("Barista Icons loaded", ...fnLogTrace),
    () => logger.debug("Barista Icons unavailable", ...fnLogTrace),
  );
  if (/^snmp:.*?$/gm.test(initialManifestContent)) {
    loadSnmpData().then(
      () => logger.debug("SNMP data loaded in cache", ...fnLogTrace),
      () => logger.debug("SNMP data unavailable, will use online server", ...fnLogTrace),
    );
  }

  logger.info("Data Cache initialized.", ...fnLogTrace);
  initialized = true;
};

const loadBuiltinEntityTypes = async () => {
  const dtClient = await getDynatraceClient();
  if (dtClient) {
    builtinEntityTypes = await dtClient.entitiesV2.listTypes().catch(() => []);
  }
};

const loadBaristaIcons = async () => {
  const publicURL = "https://barista.dynatrace.com/data/resources/icons.json";
  const internalURL = "https://barista.lab.dynatrace.org/data/resources/icons.json";

  let icons = await loadBaristaIconsFromUrl(internalURL);
  if (icons.length === 0) {
    icons = await loadBaristaIconsFromUrl(publicURL);
  }
  baristaIcons = icons;
};

const loadBaristaIconsFromUrl = async (url: string) => {
  const icons = await Axios.get<BaristaResponse>(url)
    .then(res => {
      return res.data.icons ? res.data.icons.map((i: BaristaMeta) => i.name) : [];
    })
    .catch(err => {
      logger.warn(
        `Barista url ${url} not accessible: ${(err as Error).message}`,
        ...logTrace,
        "fetchBaristaIcons",
      );
      return [];
    });
  return icons;
};

const loadSnmpData = async () => {
  await createDefaultMibStore();
  loadUserMibFiles();
};

const createDefaultMibStore = async () => {
  const fnLogTrace = [...logTrace, "createDefaultMibStore"];
  logger.debug("Creating SNMP MIB store", ...fnLogTrace);

  await downloadActiveGateMibFiles(globalStorage);

  logger.debug("ActiveGate MIBs ready. Building MIB store", ...fnLogTrace);
  mibStore = new MibModuleStore();
  localSnmpDatabase = mibStore.getAllOidInfos();
};

export const loadUserMibFiles = (files?: string[]) => {
  const filesToProcess = files ?? findUnprocessedMibFiles();
  const manuallyParsed: OidInformation[] = [];
  if (filesToProcess.length > 0) {
    filesToProcess.forEach(file => {
      mibFilesLoaded.push({ name: path.basename(file).split(".")[0], filePath: file });
      try {
        logger.debug(`Loading user provided MIB file ${file}`, ...logTrace, "loadUserMibFiles");
        mibStore.loadFromFile(file);
      } catch {
        // In case of errors, perform a manual parsing
        manuallyParsed.push(...parseMibFile(file));
      }
    });

    localSnmpDatabase = [...mibStore.getAllOidInfos(), ...manuallyParsed];
  }
};

const findUnprocessedMibFiles = () => {
  return getSnmpMibFiles().filter(
    file =>
      mibFilesLoaded.findIndex(
        loadedMib =>
          loadedMib.name.toLowerCase() === path.basename(file).toLowerCase() ||
          loadedMib.filePath === file,
      ) === -1,
  );
};

const createManifestProcessingPipeline = (initialContent: string) => {
  new Observable<string>(subscriber => {
    manifestParsingPipeline = subscriber;
    subscriber.next(initialContent);
  })
    .pipe<string, ExtensionStub | undefined>(
      switchMap<string, Observable<string>>(value => of(value).pipe(delay(200))),
      map<string, ExtensionStub | undefined>(manifestText => {
        try {
          return yaml.parse(manifestText) as ExtensionStub;
        } catch {
          return parsedExtension.getValue();
        }
      }),
    )
    .subscribe(parsedExtension);
};

const setManifestChangeListeners = () => {
  vscode.workspace.onDidChangeTextDocument(change => {
    pushDocumentChangeForParsing(change.document);
  });
  vscode.workspace.onDidSaveTextDocument(document => {
    pushDocumentChangeForParsing(document);
  });
  vscode.workspace.onDidOpenTextDocument(document => {
    pushDocumentChangeForParsing(document);
  });
};

const pushDocumentChangeForParsing = (doc: vscode.TextDocument) => {
  const manifestFilePath = getExtensionFilePath();
  if (manifestFilePath && path.resolve(doc.fileName) === path.resolve(manifestFilePath)) {
    manifestParsingPipeline.next(doc.getText());
  }
};

export const pushManifestTextForParsing = () => {
  const manifestContent = readExtensionManifest();
  if (manifestContent === "") return;
  manifestParsingPipeline.next(manifestContent);
};

export const getCachedWmiQueryResult = (query: string) => wmiQueryResults.get(query);

export const getCachedWmiStatus = (query: string) => wmiQueryStatuses.get(query);

export const getCachedPrometheusData = () => prometheusData;

export const getCachedSelectorStatus = (selector: string) => selectorStatuses.get(selector);

export const getCachedEntityInstances = (type: string) => entityInstances.get(type);

export const getCachedSnmpOids = () => snmpOIDs;

export const getCachedOid = (oid: string) => snmpOIDs.get(oid);

export const getCachedBuiltinEntityTypes = () => builtinEntityTypes;

export const getCachedBaristaIcons = () => baristaIcons;

export const getCachedParsedExtension = () => parsedExtension.getValue();

export const getLoadedMibFiles = () => mibFilesLoaded;

export const setCachedWmiStatus = (query: string, status: ValidationStatus) => {
  wmiQueryStatuses.set(query, status);
};

export const setCachedWmiQueryResult = (result: WmiQueryResult) => {
  wmiQueryResults.set(result.query, result);
};

export const setCachedPrometheusData = (data: PromData) => {
  prometheusData = data;
};

export const setCachedSelectorStatus = (selector: string, status: ValidationStatus) => {
  selectorStatuses.set(selector, status);
};

export const updateCachedSnmpOids = async (oids: string[]) => {
  await Promise.all(oids.map(oid => fetchAndUpdateOidInformation(oid)));
};

export const updateCachedOid = async (oid: string) => {
  await fetchAndUpdateOidInformation(oid);
};

const fetchAndUpdateOidInformation = async (oid: string) => {
  if (!snmpOIDs.has(oid)) {
    const localIndex = getLocalDatabaseOidIndex(oid);
    if (localIndex !== -1) {
      snmpOIDs.set(oid, localSnmpDatabase[localIndex]);
    } else {
      // Only ASN.1 notation is supported for online fetching
      snmpOIDs.set(oid, await fetchOID(oid));
    }
  }
};

const getLocalDatabaseOidIndex = (oid: string) => {
  const nameNotation = /^[\da-zA-Z]+$/.test(oid);
  return localSnmpDatabase.findIndex(obj =>
    nameNotation ? obj.objectType === oid : obj.oid === oid,
  );
};

export const updateEntityInstances = async (types: string[]) => {
  await Promise.all(
    types.filter(t => !entityInstances.has(t)).map(type => fetchAndUpdateEntityTypeInstances(type)),
  );
};

const fetchAndUpdateEntityTypeInstances = async (type: string) => {
  const dtClient = await getDynatraceClient();
  if (!dtClient || entityInstances.has(type)) return;
  await dtClient.entitiesV2
    .list(`type(${type})`)
    .then(entities => entityInstances.set(type, entities));
};

/**
 * Memoizes the result of the getter function call based on the string representation of the getter.
 * Dependency array is compared to refresh the cache (empty array caches it forever).
 * @param getter Function to memoize
 * @param deps Array of dependencies to compare
 * @param clear If true, removes this getter from the cache
 */
export const useMemo = (() => {
  interface MemoCache {
    oldDeps: unknown[];
    oldResult: unknown;
  }

  const memoCache = new Map<string, MemoCache>();

  return async <T>(
    getter: () => T | PromiseLike<T>,
    deps: unknown[],
    clear: boolean = false,
  ): Promise<T> => {
    const cacheKey = getter.toString();

    if (clear) {
      memoCache.delete(cacheKey);
    } else {
      if (
        !memoCache.has(cacheKey) ||
        !deps.every((dep, i) => String(dep) === String(memoCache.get(cacheKey)?.oldDeps[i]))
      ) {
        memoCache.set(cacheKey, { oldDeps: deps, oldResult: await getter() });
      }
    }

    return memoCache.get(cacheKey)?.oldResult as T;
  };
})();
