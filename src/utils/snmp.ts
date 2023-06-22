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
 * UTILITIES FOR WORKING WITH SNMP
 ********************************************************************************/

import { readFileSync } from "fs";
import axios from "axios";

// URL to online OID Repository
const BASE_URL = "https://oid-rep.orange-labs.fr/get";

export interface OidInformation {
  description?: string;
  maxAccess?: string;
  status?: string;
  syntax?: string;
  objectType?: string;
  index?: string;
}

/**
 * Checks whether an OID is readable from known access information.
 * @param info OID Info as prepared by {@link fetchOID}
 * @returns status
 */
export function isOidReadable(info: OidInformation): boolean {
  return Boolean(info.maxAccess && info.maxAccess !== "not-accessible");
}

/**
 * Shallow check whether an OID defines a table.
 * @param info OID Info as prepared by {@link fetchOID}
 * @returns status
 */
export function isTable(info: OidInformation): boolean {
  return Boolean(info.syntax?.toLowerCase().includes("sequence"));
}

/**
 * Extract an OID from a metric value text (as present in yaml)
 * @param value
 * @returns oid
 */
export function oidFromMetriValue(value: string): string {
  return value.endsWith(".0") ? value.slice(4, value.length - 2) : value.slice(4);
}

/**
 * Given raw data from the online OID repository or a MIB file, parses this into a structured
 * object of OID metadata information.
 * @param details raw data
 * @returns OID metadata info
 */
function processOidData(details: string): OidInformation {
  const objectTypeMatches = /(.*?) OBJECT-TYPE/.exec(details) ?? [];
  const syntaxMatches = /SYNTAX (.*?) MAX-ACCESS/.exec(details) ?? [];
  const maxAccessMatches = /MAX-ACCESS (.*?) /.exec(details) ?? [];
  const statusMatches = /STATUS (.*?) /.exec(details) ?? [];
  const descriptionMatches = /DESCRIPTION "(.*?)"/.exec(details) ?? [];
  const indexMatches = /INDEX (.*?) ::=/.exec(details) ?? [];

  return {
    objectType: objectTypeMatches.length > 1 ? objectTypeMatches[1] : undefined,
    syntax: syntaxMatches.length > 1 ? syntaxMatches[1] : undefined,
    maxAccess: maxAccessMatches.length > 1 ? maxAccessMatches[1] : undefined,
    status: statusMatches.length > 1 ? statusMatches[1] : undefined,
    description: descriptionMatches.length > 1 ? descriptionMatches[1] : undefined,
    index: indexMatches.length > 1 ? indexMatches[1] : undefined,
  };
}

/**
 * Given an OID, pulls metadata information available online.
 * @param oid OID in standard dot notation
 * @returns metadata info or empty object if not available
 */
export async function fetchOID(oid: string) {
  console.log(`Fetching OID ${oid}`);
  return axios
    .get(`${BASE_URL}/${oid}`)
    .then(res => {
      if (res.data) {
        const rawData = String(res.data)
          .slice(String(res.data).lastIndexOf("<code>") + 6)
          .split("</code>")[0]
          .replace(/\n/g, " ")
          .replace(/<br\/>/g, "");
        return processOidData(rawData);
      }
      return {};
    })
    .catch(err => {
      console.log(err);
      return {};
    });
}

export function parseMibFile(filePath: string) {
  const mibContent = readFileSync(filePath)
    .toString()
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/[\r\t\f\v]|\s{2,}/g, " ");

  const objectMatches = mibContent.match(/(\w+ OBJECT-TYPE .*?::= { .*? })/g);
  const parsedObjects = objectMatches.map(objectData => processOidData(objectData));

  return parsedObjects;
}
