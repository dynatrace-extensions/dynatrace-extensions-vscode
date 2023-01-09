import axios from "axios";

const BASE_URL = "https://oid-rep.orange-labs.fr/get";

export interface OidInformation {
  description?: string;
  maxAccess?: string;
  status?: string;
  syntax?: string;
  objectType?: string;
}

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
    .catch(err => {
      return {};
    });
}

export function isOidReadable(info: OidInformation): boolean {
  return Boolean(info.maxAccess && info.maxAccess !== "not-accessible");
}

function processOidData(data: string) {
  const details = data.split("<br>").map(p => p.trim());

  const descriptionIdx = details.indexOf("DESCRIPTION");

  const description = details.slice(descriptionIdx + 1).join(" ");
  const oid: Record<string, string> = { description: description };

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

function cleanKeyName(key: string): string {
  const dashIdx = key.indexOf("-");
  const cleanKey = key.toLowerCase();
  return dashIdx !== -1
    ? cleanKey.slice(0, dashIdx) + cleanKey.charAt(dashIdx + 1).toUpperCase() + cleanKey.slice(dashIdx + 2)
    : cleanKey;
}
