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
          .replace(/"/g, "")
          .replace(/\n/g, " ");
        return processOidData(rawData);
      }
      return {};
    })
    .catch((err) => {
      console.log(err);
      return {};
    });
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
  return Boolean(info.syntax && info.syntax.toLowerCase().includes("sequence"));
}

/**
 * Given raw data from the online OID repository, parses this into a structured object
 * of OID metadata information.
 * @param data raw response from OID repository
 * @returns OID metadata info
 */
function processOidData(data: string) {
  const details = data.split("<br/>").map(p => p.trim());

  const descriptionIdx = details.indexOf("DESCRIPTION");

  const description = details.slice(descriptionIdx + 1).join(" ");
  const oid: Record<string, string> = { description: description };

  if (description.includes("INDEX")) {
    oid.description = description.slice(0, description.lastIndexOf("INDEX"));
    oid.index = description.split("INDEX")[1];
  }

  details.slice(0, descriptionIdx).forEach(detail => {
    const [key, ...values] = detail.split(" ");
    if (values[0] === "OBJECT-TYPE") {
      oid.objectType = key;
    } else {
      oid[cleanKeyName(key)] = values[0] ?? "";
    }
  });

  return oid;
}

/**
 * Cleans a metadata key as given by the online OID repository and translates it to
 * camelCase for better readability.
 * @param key metadata attribute key from OID repository
 * @returns key in camelCase
 */
function cleanKeyName(key: string): string {
  const dashIdx = key.indexOf("-");
  const cleanKey = key.toLowerCase();
  return dashIdx !== -1
    ? cleanKey.slice(0, dashIdx) + cleanKey.charAt(dashIdx + 1).toUpperCase() + cleanKey.slice(dashIdx + 2)
    : cleanKey;
}
