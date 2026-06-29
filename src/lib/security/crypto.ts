import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { masterKeyPath } from "../runtime-paths";

const algorithm = "aes-256-gcm";
let cachedMasterKey: Buffer | null = null;

function masterKey() {
  if (cachedMasterKey) {
    return cachedMasterKey;
  }

  const keyPath = masterKeyPath();
  mkdirSync(path.dirname(keyPath), { recursive: true });

  try {
    const stored = Buffer.from(
      readFileSync(keyPath, "utf8").trim(),
      "base64url",
    );
    if (stored.length !== 32) {
      throw new Error("Invalid master key length");
    }
    cachedMasterKey = stored;
    return stored;
  } catch (error) {
    const missing =
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT";
    if (!missing) {
      throw error;
    }
  }

  const generated = randomBytes(32);
  try {
    writeFileSync(keyPath, generated.toString("base64url"), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    const alreadyExists =
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "EEXIST";
    if (!alreadyExists) {
      throw error;
    }
    const stored = Buffer.from(
      readFileSync(keyPath, "utf8").trim(),
      "base64url",
    );
    if (stored.length !== 32) {
      throw new Error("Invalid master key length");
    }
    cachedMasterKey = stored;
    return stored;
  }

  try {
    chmodSync(keyPath, 0o600);
  } catch {
    // Windows file access is controlled by the service account ACL.
  }
  cachedMasterKey = generated;
  return generated;
}

function encryptionKey() {
  return createHash("sha256")
    .update(masterKey())
    .update("easylaw:encryption:v1")
    .digest();
}

function hmacKey() {
  return createHash("sha256")
    .update(masterKey())
    .update("easylaw:hmac:v1")
    .digest();
}

export function encryptSecret(plainText: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(cipherText: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = cipherText.split(".");

  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Unsupported encrypted secret format");
  }

  const decipher = createDecipheriv(
    algorithm,
    encryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function hashToken(token: string) {
  return createHmac("sha256", hmacKey()).update(token).digest("hex");
}

export function newId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

export function newUrlToken() {
  return randomBytes(32).toString("base64url");
}

export function newRecoveryCode() {
  const raw = randomBytes(6).toString("base64url").toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export function newNumericCode(length = 6) {
  const upperBound = 10 ** length;
  const value =
    Number.parseInt(randomBytes(6).toString("hex"), 16) % upperBound;
  return value.toString().padStart(length, "0");
}

export function resetCryptoForTests() {
  if (process.env.EASYLAW_TEST_MODE !== "1") {
    throw new Error("Crypto reset is only available in test mode");
  }
  cachedMasterKey = null;
}
