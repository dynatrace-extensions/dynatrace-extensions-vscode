import * as crypto from "crypto";
import * as pvtsutils from "pvtsutils";
import * as pkijs from "pkijs";
import * as asn1js from "asn1js";
import * as fs from "fs";

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
 * Adds the buffer to a PEM formatted string
 * @param buffer The data to be added to the PEM format
 * @param tag The tag for the BEGIN and END sessions, examples: CMS, CERTIFICATE, RSA PRIVATE KEY
 * @returns The PEM formatted string
 */
export function toPEM(buffer: ArrayBuffer, tag: string): string {
  return [
    `-----BEGIN ${tag}-----`,
    formatPEM(pvtsutils.Convert.ToBase64(buffer)),
    `-----END ${tag}-----`,
    "",
  ].join("\n");
}

export function fromPEM(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-{5}(BEGIN|END) .*-{5}/gm, "")
    .replace(/\s/gm, "");
  return pvtsutils.Convert.FromBase64(base64);
}

/**
 * Format string in order to have each line with length equal to 64
 * @param pemString String to format
 * @returns Formatted string
 */
export function formatPEM(pemString: string): string {
  const PEM_STRING_LENGTH = pemString.length, LINE_LENGTH = 64;
  const wrapNeeded = PEM_STRING_LENGTH > LINE_LENGTH;

  if (wrapNeeded) {
    let formattedString = "", wrapIndex = 0;

    for (let i = LINE_LENGTH; i < PEM_STRING_LENGTH; i += LINE_LENGTH) {
      formattedString += pemString.substring(wrapIndex, i) + "\r\n";
      wrapIndex = i;
    }

    formattedString += pemString.substring(wrapIndex, PEM_STRING_LENGTH);
    return formattedString;
  }
  else {
    return pemString;
  }
}

/**
 * Converts a PEM formatted string to a Buffer with the PEM data
 * @param pem the PEM formatted string
 * @param tag the tag that is enclosing the data, like CMS, CERTIFICATE, RSA PRIVATE KEY
 * @returns An ArrayBuffer with the data
*/
function decodePEM(pem: string, tag = "[A-Z0-9 ]+"): ArrayBuffer[] {
  const pattern = new RegExp(`-{5}BEGIN ${tag}-{5}([a-zA-Z0-9=+\\/\\n\\r]+)-{5}END ${tag}-{5}`, "g");

  const res: ArrayBuffer[] = [];
  let matches: RegExpExecArray | null = null;
  // eslint-disable-next-line no-cond-assign
  while (matches = pattern.exec(pem)) {
    const base64 = matches[1]
      .replace(/\r/g, "")
      .replace(/\n/g, "");
    res.push(pvtsutils.Convert.FromBase64(base64));
  }

  return res;
}

/**
 * Extracts certificates from a PEM formatted string
 * @param source The data to extract the certificates from, usually read from a .pem file
 * @returns An array of {@link pkijs.Certificate}
*/
export function parseCertificate(source: ArrayBuffer): pkijs.Certificate[] {
  const buffers: ArrayBuffer[] = [];

  const buffer = pvtsutils.BufferSourceConverter.toArrayBuffer(source);
  const pem = pvtsutils.Convert.ToBinary(buffer);
  if (/----BEGIN CERTIFICATE-----/.test(pem)) {
    buffers.push(...decodePEM(pem, "CERTIFICATE"));
  } else {
    buffers.push(buffer);
  }

  const res: pkijs.Certificate[] = [];
  for (const item of buffers) {
    res.push(pkijs.Certificate.fromBER(item));
  }

  return res;
}


export function sign(inputFilePath: string, outputFilePath: string, keyPath: string, certPath: string): string {

  console.log(`Signing extension with certificate ${certPath} and key ${keyPath}`);
  // Sign the data with sha256
  const data = fs.readFileSync(inputFilePath);
  const key = fs.readFileSync(keyPath);
  const signature = crypto.sign('sha256', data, key);

  // Gets the first certificate from the certificate file, there should be only one certificate there anyways
  const cert = parseCertificate(fs.readFileSync(certPath))[0];

  // Create the CMS metadata
  const signedData = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: pkijs.id_ContentType_Data }),  // "data" content type
    digestAlgorithms: [new pkijs.AlgorithmIdentifier({ algorithmId: pkijs.id_sha256 })],  // SHA-256

    signerInfos: [
      new pkijs.SignerInfo({
        version: 1,
        digestAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: pkijs.id_sha256 }),  // SHA-256
        signatureAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: "1.2.840.113549.1.1.1" }),  // rsassa_pkcs1v15  RSASSA-PKCS1-V1_5
        signature: new asn1js.OctetString({ valueHex: signature }),
        sid: new pkijs.IssuerAndSerialNumber({
          issuer: cert.issuer,
          serialNumber: cert.serialNumber
        }),

      })
    ],
    certificates: [cert]
  });

  // This is the content of the CMS pem file
  const asn1obj = new pkijs.ContentInfo({
    contentType: pkijs.id_ContentType_SignedData, // "signed-data" content type ContentInfo.SIGNED_DATA
    content: signedData.toSchema()
  });

  // The raw data for the CMS signature
  const ber_bytes = asn1obj.toSchema().toBER();

  // Put it around a CMS tag (pem file)
  const cmsPem = toPEM(ber_bytes, "CMS");
  return cmsPem;

}