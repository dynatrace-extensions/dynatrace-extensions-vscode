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

import * as crypto from "crypto";
import * as fs from "fs";
import * as forge from "node-forge";
import * as path from "path";

const algorithm = "aes-256-cbc";

/**
 * Encrypts a token using AES-256-CBC algorithm and provides a string comprised
 * of the initialization vector, key, and token in hex format. This is not
 * realistically secure as all the information required to decrypt it is
 * within the data but it's better than storing it in plain text.
 * @param token the token to encrypt
 * @returns the resulting string in hex format
 */
export function encryptToken(token: string): string {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  let encryptedToken = cipher.update(token, "utf-8", "hex");
  encryptedToken += cipher.final("hex");

  return `${iv.toString("hex")}.${key.toString("hex")}.${encryptedToken}`;
}

/**
 * Decrypts a hex formatted string that was produced by the {@link encryptToken}
 * function. The resulting string can be used to authenticate against the
 * Dynatrace APIs.
 * @param token the hex encoded string to decrypt
 * @returns Dynatrace API Token
 */
export function decryptToken(token: string): string {
  const parts = token.split(".");
  const iv = Buffer.from(parts[0], "hex");
  const key = Buffer.from(parts[1], "hex");
  const decipher = crypto.createDecipheriv(algorithm, key, iv);

  let decryptedToken = decipher.update(parts[2], "hex", "utf-8");
  decryptedToken += decipher.final("utf-8");

  return decryptedToken;
}

/**
 * Given a merged CertKey file, this function separates and returns the RSA Key and
 * PEM Certificate contents.
 * @param filePath path to the merged CertKey file
 * @returns tuple of key content and certificate content
 */
function getContentFromMergedFile(filePath: string): [string, string] {
  const contetLines = fs.readFileSync(filePath).toString().split("\n");
  const keyStart = contetLines.findIndex(l => l.includes("BEGIN RSA PRIVATE KEY"));
  const keyEnd = contetLines.findIndex(l => l.includes("END RSA PRIVATE KEY"));
  const certStart = contetLines.findIndex(l => l.includes("BEGIN CERTIFICATE"));
  const certEnd = contetLines.findIndex(l => l.includes("END CERTIFICATE"));

  if (keyStart === -1 || keyEnd === -1) {
    throw new Error("CertKey file invalid: unable to find RSA Key content");
  }
  if (certStart === -1 || certEnd === -1) {
    throw new Error("CertKey file invalid: unable to find Certificate content");
  }

  return [contetLines.slice(keyStart, keyEnd + 1).join("\n"), contetLines.slice(certStart, certEnd + 1).join("\n")];
}

/**
 * Signs a given file and produces a signature file.
 * @param inputFilePath file path of data to sign
 * @param keyPath path to the file containing RSA Private Key
 * @param certPath path to the file containing Certificate Key
 * @returns signature
 */
export function sign(inputFilePath: string, keyPath: string, certPath: string): string {
  console.log(`Signing extension with certificate ${certPath} and key ${keyPath}`);

  let keyContents: string;
  let certContents: string;

  if (keyPath === certPath) {
    [keyContents, certContents] = getContentFromMergedFile(keyPath);
  } else {
    keyContents = fs.readFileSync(keyPath).toString();
    certContents = fs.readFileSync(certPath).toString();
  }

  const dataToSign = fs.readFileSync(inputFilePath);
  const cert = forge.pki.certificateFromPem(certContents);
  const p7 = forge.pkcs7.createSignedData();

  p7.content = forge.util.createBuffer(dataToSign);
  p7.addCertificate(cert);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(keyContents),
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
  });

  p7.sign({ detached: true });

  return forge.pem.encode({
    type: "CMS",
    body: forge.asn1.toDer(p7.toAsn1()).getBytes(),
  });
}

/**
 * Gets the path of a fused developer cert/key file. The keyPath and certPath are assumed to be taken
 * from Copilot settings so if they already point to the same file we return the path directly.
 * Otherwise a fused certKey is written to storage and that path is used going forward.
 * @param keyPath
 * @param certPath
 * @param workspaceStorage
 * @returns
 */
export function getFusedCertKeyPath(keyPath: string, certPath: string, workspaceStorage: string): string {
  const fusedKeyPath = path.resolve(workspaceStorage, "devCertKey.pem");

  // If credentials already fused just use whichever
  if (keyPath === certPath) {
    return keyPath;
  }

  const keyContents = fs.readFileSync(keyPath).toString();
  const certContents = fs.readFileSync(certPath).toString();
  const fusedContent = certContents + keyContents;

  // If the file doesn't already exist or the content is different
  if (!fs.existsSync(fusedKeyPath) || fs.readFileSync(fusedKeyPath).toString() !== fusedContent) {
    // Write the contents to file
    fs.writeFileSync(fusedKeyPath, fusedContent);
  }

  return fusedKeyPath;
}
