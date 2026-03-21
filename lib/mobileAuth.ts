import { createHash, randomInt } from "crypto";

export const OTP_EXPIRY_MINUTES = 10;

export function normalizeEmployeeCode(value: string) {
  return value.trim().toUpperCase();
}

export function normalizeMobile(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidEmployeeCode(value: string) {
  return normalizeEmployeeCode(value).length >= 3;
}

export function isValidMobile(value: string) {
  return normalizeMobile(value).length === 10;
}

export function isValidPin(value: string) {
  return /^\d{6}$/.test(value.trim());
}

export function hashPin(pin: string) {
  return createHash("sha256").update(pin.trim()).digest("hex");
}

export function hashOtp(otp: string) {
  return createHash("sha256").update(otp.trim()).digest("hex");
}

export function generateOtp() {
  return String(randomInt(100000, 1000000));
}

export function expiresAtIso(minutes = OTP_EXPIRY_MINUTES) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}
