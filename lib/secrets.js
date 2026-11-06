import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_SALT = "trip-tracking-v1";

function keyFor(secret) {
  return scryptSync(secret, KEY_SALT, 32);
}

export function encryptString(plain, secret) {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptString(payload, secret) {
  if (!payload) return "";
  const buffer = Buffer.from(payload, "base64");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function newId() {
  return randomBytes(16).toString("hex");
}

export function hashPassphrase(passphrase, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(passphrase, salt, 32).toString("hex") };
}

export function verifyPassphrase(passphrase, salt, hash) {
  const next = scryptSync(String(passphrase), salt, 32);
  const stored = Buffer.from(hash, "hex");
  if (next.length !== stored.length) return false;
  return timingSafeEqual(next, stored);
}

export function validName(name) {
  return typeof name === "string" && /^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,39}$/u.test(name.trim());
}

export function validPassphrase(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 200;
}
