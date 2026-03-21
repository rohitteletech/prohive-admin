type AdminSessionRole = "super_admin" | "company_admin";

export type AdminSessionPayload = {
  role: AdminSessionRole;
  email: string;
  companyId?: string;
  exp: number;
};

const SESSION_COOKIE_NAME = "prohive_admin_session";
const textEncoder = new TextEncoder();

function base64UrlEncode(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return atob(normalized + pad);
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return base64UrlEncode(binary);
}

function base64UrlToBytes(value: string) {
  const binary = base64UrlDecode(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getSessionSecret() {
  return process.env.SESSION_COOKIE_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
}

async function importSigningKey(secret: string) {
  return crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

export function getAdminSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function getAdminSessionMaxAgeSeconds() {
  return 60 * 60 * 12;
}

export async function createAdminSessionCookie(payload: Omit<AdminSessionPayload, "exp">) {
  const secret = getSessionSecret();
  if (!secret) return null;

  const sessionPayload: AdminSessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + getAdminSessionMaxAgeSeconds(),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(sessionPayload));
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(encodedPayload));
  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyAdminSessionCookie(rawValue: string | null | undefined) {
  if (!rawValue) return null;

  const secret = getSessionSecret();
  if (!secret) return null;

  const [encodedPayload, encodedSignature] = rawValue.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  try {
    const key = await importSigningKey(secret);
    const expectedSignature = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, textEncoder.encode(encodedPayload))
    );
    const actualSignature = base64UrlToBytes(encodedSignature);
    if (!timingSafeEqual(expectedSignature, actualSignature)) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as AdminSessionPayload;
    if (!payload?.role || !payload?.email || typeof payload.exp !== "number") return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function clearAdminSessionCookieOptions() {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  };
}
