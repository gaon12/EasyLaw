import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";

const algorithm = "aes-256-gcm";

function encryptionKey() {
  const configured = process.env.EASYLAW_ENCRYPTION_KEY;
  if (configured) {
    return createHash("sha256").update(configured).digest();
  }

  return createHash("sha256")
    .update("easylaw-development-encryption-key")
    .digest();
}

function hmacKey() {
  return (
    process.env.EASYLAW_HASH_KEY ??
    process.env.EASYLAW_ENCRYPTION_KEY ??
    "easylaw-development-hash-key"
  );
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
