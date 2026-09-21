import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function signature(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(username, secret, now = Date.now()) {
  const payload = encode(JSON.stringify({
    username,
    expiresAt: now + SESSION_DURATION_MS,
    nonce: randomBytes(16).toString("hex"),
  }));
  return `${payload}.${signature(payload, secret)}`;
}

export function verifySessionToken(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;

  const expectedSignature = signature(payload, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.username || !Number.isFinite(session.expiresAt) || session.expiresAt <= now) return null;
    return session;
  } catch {
    return null;
  }
}

export function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return [part, ""];
      return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
    }),
  );
}

export function secureStringEqual(first = "", second = "") {
  const left = Buffer.from(String(first));
  const right = Buffer.from(String(second));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export const sessionDurationSeconds = SESSION_DURATION_MS / 1000;
