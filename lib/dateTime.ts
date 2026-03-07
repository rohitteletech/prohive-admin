export const INDIA_TIME_ZONE = "Asia/Kolkata";
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const INDIA_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function formatParts(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: INDIA_TIME_ZONE,
    ...options,
  }).formatToParts(date);
}

function lookupPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value || "";
}

export function todayISOInIndia() {
  const parts = formatParts(new Date(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${lookupPart(parts, "year")}-${lookupPart(parts, "month")}-${lookupPart(parts, "day")}`;
}

export function formatDisplayDate(value: string | Date | null | undefined) {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const isoMatch = String(value).match(ISO_DATE_RE);
    if (isoMatch) {
      return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
    }
    const indiaMatch = String(value).match(INDIA_DATE_RE);
    if (indiaMatch) {
      return `${indiaMatch[1].padStart(2, "0")}/${indiaMatch[2].padStart(2, "0")}/${indiaMatch[3]}`;
    }
    return String(value);
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: INDIA_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

export function formatDisplayTime(value: string | Date | null | undefined) {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
}

export function formatDisplayDateTime(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = formatDisplayDate(value);
  const time = formatDisplayTime(value);
  return [date, time].filter(Boolean).join(", ");
}

export function normalizeTimeZoneToIndia(value: unknown) {
  const timeZone = String(value || "").trim();
  if (!timeZone) return INDIA_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone }).format(new Date());
    return timeZone === INDIA_TIME_ZONE ? INDIA_TIME_ZONE : INDIA_TIME_ZONE;
  } catch {
    return INDIA_TIME_ZONE;
  }
}

export function isoDateInIndia(value: string | Date) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const parts = formatParts(parsed, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${lookupPart(parts, "year")}-${lookupPart(parts, "month")}-${lookupPart(parts, "day")}`;
}

export function normalizeDateInputToIso(value: unknown) {
  const input = String(value || "").trim();
  if (!input) return "";

  const indiaMatch = input.match(INDIA_DATE_RE);
  if (!indiaMatch) return "";

  const day = Number(indiaMatch[1]);
  const month = Number(indiaMatch[2]);
  const year = Number(indiaMatch[3]);
  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) return "";
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 9999) return "";

  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) return "";
  return iso;
}

