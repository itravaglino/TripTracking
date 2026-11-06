import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function encryptionReady(): boolean {
  return (process.env.TOKEN_ENCRYPTION_KEY?.trim().length ?? 0) >= 16;
}

export function encryptSecret(plain: string): { ciphertext: string; iv: string } {
  const secret = process.env.TOKEN_ENCRYPTION_KEY?.trim() ?? "";
  if (secret.length < 16) throw new Error("encryption_unconfigured");
  const salt = randomBytes(16);
  const key = scryptSync(secret, salt, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([body, tag]).toString("base64"),
    iv: `${salt.toString("base64")}.${iv.toString("base64")}`,
  };
}

export function decryptSecret(ciphertext: string, packedIv: string): string {
  const secret = process.env.TOKEN_ENCRYPTION_KEY?.trim() ?? "";
  if (secret.length < 16) throw new Error("encryption_unconfigured");
  const [saltB64, ivB64] = packedIv.split(".");
  if (!saltB64 || !ivB64) throw new Error("encryption_invalid");
  const salt = Buffer.from(saltB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const blob = Buffer.from(ciphertext, "base64");
  const tag = blob.subarray(blob.length - 16);
  const body = blob.subarray(0, blob.length - 16);
  const key = scryptSync(secret, salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
