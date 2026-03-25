export const INDIA_TIME_ZONE = "Asia/Kolkata";
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const INDIA_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const INDIA_TEXT_DATE_RE = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/;

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function formatParts(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: INDIA_TIME_ZONE,
    ...options,
  }).formatToParts(date);
}

function lookupPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value || "";
}

function toDisplayFromParts(year: number, month: number, day: number) {
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: INDIA_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function todayISOInIndia() {
  const parts = formatParts(new Date(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${lookupPart(parts, "year")}-${lookupPart(parts, "month")}-${lookupPart(parts, "day")}`;
}

export function addYearsToIsoDate(value: string, years: number) {
  const match = String(value || "").match(ISO_DATE_RE);
  if (!match) return "";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const offsetYears = Number.isFinite(years) ? Math.trunc(years) : 0;
  const targetYear = year + offsetYears;
  const maxDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  const targetDay = Math.min(day, maxDay);

  return `${String(targetYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

export function formatDisplayDate(value: string | Date | null | undefined) {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const isoMatch = String(value).match(ISO_DATE_RE);
    if (isoMatch) {
      const rendered = toDisplayFromParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
      if (rendered) return rendered;
    }

    const indiaMatch = String(value).match(INDIA_DATE_RE);
    if (indiaMatch) {
      const rendered = toDisplayFromParts(Number(indiaMatch[3]), Number(indiaMatch[2]), Number(indiaMatch[1]));
      if (rendered) return rendered;
    }

    const indiaTextMatch = String(value).match(INDIA_TEXT_DATE_RE);
    if (indiaTextMatch) {
      const month = MONTH_MAP[indiaTextMatch[2].toLowerCase()];
      if (month) {
        const rendered = toDisplayFromParts(Number(indiaTextMatch[3]), month, Number(indiaTextMatch[1]));
        if (rendered) return rendered;
      }
    }

    return String(value);
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: INDIA_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function formatDisplayDateShort(value: string | Date | null | undefined) {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = formatDisplayDate(value);
    return fallback ? fallback.replace(/\s+/g, "-") : "";
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: INDIA_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatToParts(parsed);

  const day = lookupPart(parts, "day");
  const month = lookupPart(parts, "month");
  const year = lookupPart(parts, "year");
  return [day, month, year].filter(Boolean).join("-");
}

export function formatDayName(value: string | Date | null | undefined) {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const isoMatch = String(value).match(ISO_DATE_RE);
    if (!isoMatch) return "";
    const reparsed = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00Z`);
    if (Number.isNaN(reparsed.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: INDIA_TIME_ZONE,
      weekday: "long",
    }).format(reparsed);
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: INDIA_TIME_ZONE,
    weekday: "long",
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

export function formatMilitaryTimeInIndia(value: string | Date | null | undefined) {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: INDIA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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
  if (indiaMatch) {
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

  const indiaTextMatch = input.match(INDIA_TEXT_DATE_RE);
  if (!indiaTextMatch) return "";

  const day = Number(indiaTextMatch[1]);
  const month = MONTH_MAP[indiaTextMatch[2].toLowerCase()];
  const year = Number(indiaTextMatch[3]);
  if (!month || !Number.isInteger(day) || !Number.isInteger(year)) return "";
  if (day < 1 || day > 31 || year < 1900 || year > 9999) return "";

  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) return "";
  return iso;
}
