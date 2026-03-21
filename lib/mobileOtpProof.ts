import { MobileOtpPurpose } from "@/lib/mobileOtp";

type MobileOtpProofPayload = {
  challengeId: string;
  employeeCode: string;
  deviceId: string;
  purpose: MobileOtpPurpose;
  exp: number;
};

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

function getProofSecret() {
  return process.env.SESSION_COOKIE_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
}

async function importSigningKey(secret: string) {
  return crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

export async function createMobileOtpProof(input: {
  challengeId: string;
  employeeCode: string;
  deviceId: string;
  purpose: MobileOtpPurpose;
}) {
  const secret = getProofSecret();
  if (!secret) return null;

  const payload: MobileOtpProofPayload = {
    challengeId: input.challengeId,
    employeeCode: input.employeeCode,
    deviceId: input.deviceId,
    purpose: input.purpose,
    exp: Math.floor(Date.now() / 1000) + 60 * 10,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(encodedPayload));
  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyMobileOtpProof(proof: string | null | undefined) {
  if (!proof) return null;

  const secret = getProofSecret();
  if (!secret) return null;

  const [encodedPayload, encodedSignature] = proof.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  try {
    const key = await importSigningKey(secret);
    const expectedSignature = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, textEncoder.encode(encodedPayload))
    );
    const actualSignature = base64UrlToBytes(encodedSignature);
    if (!timingSafeEqual(expectedSignature, actualSignature)) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as MobileOtpProofPayload;
    if (!payload?.challengeId || !payload?.employeeCode || !payload?.deviceId || !payload?.purpose || typeof payload.exp !== "number") {
      return null;
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
