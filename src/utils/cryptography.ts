import * as crypto from "crypto";

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
