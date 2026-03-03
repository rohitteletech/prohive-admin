export const INDIA_TIME_ZONE = "Asia/Kolkata";

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
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
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
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
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
