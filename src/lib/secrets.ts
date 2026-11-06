import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function material(name: string): Buffer | null {
  const raw = process.env[name]?.trim() ?? "";
  if (raw === "") return null;
  return createHash("sha256").update(raw).digest();
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function sessionSecret(): string | null {
  const value = process.env.SESSION_SECRET?.trim() ?? "";
  return value === "" ? null : value;
}

export function cronConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET?.trim());
}

export function encryptSecret(plain: string): string | null {
  const key = material("TOKEN_ENCRYPTION_KEY");
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(payload: string | null): string | null {
  if (!payload) return null;
  const key = material("TOKEN_ENCRYPTION_KEY");
  if (!key) return null;
  const [version, ivB64, tagB64, dataB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}
