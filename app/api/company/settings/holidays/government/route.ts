import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { HolidayType } from "@/lib/companyLeaves";
import { GovernmentHolidayState } from "@/lib/governmentHolidays";

type ParsedHoliday = {
  date: string;
  name: string;
  type: HolidayType;
  scope: "national" | "state";
};

const MONTH_MAP: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function normalizeYear(value: string | null) {
  const numeric = Number(value || "");
  if (!Number.isFinite(numeric)) return new Date().getFullYear();
  return Math.max(2000, Math.min(2100, Math.floor(numeric)));
}

function normalizeState(value: string | null): GovernmentHolidayState {
  if (value === "maharashtra" || value === "karnataka" || value === "gujarat" || value === "tamil_nadu") {
    return value;
  }
  return "all_india";
}

function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseLongDate(raw: string) {
  const cleaned = raw.replace(/(\d)(st|nd|rd|th)\b/gi, "$1").trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length < 3) return null;
  const day = Number(parts[0] || "");
  const month = MONTH_MAP[String(parts[1] || "").toLowerCase()] || 0;
  const year = Number(parts[2] || "");
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null;
  return { day, month, year };
}

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function splitHolidayNames(raw: string) {
  const chunks = raw.split("/").map((item) => item.trim()).filter(Boolean);
  return chunks.map((chunk) => {
    const tagMatch = chunk.match(/\((GH|RH)\)\s*$/i);
    const tag = tagMatch?.[1]?.toUpperCase() || "";
    const name = chunk.replace(/\((GH|RH)\)\s*$/i, "").replace(/\*+/g, "").trim();
    const type: HolidayType = tag === "GH" ? "national" : "festival";
    return { name, type };
  }).filter((row) => Boolean(row.name));
}

function parseCalendarText(rawHtml: string, year: number) {
  const text = stripHtml(rawHtml);
  const rowRegex = /(?:^|\s)(\d{1,2})\.\s+(\d{1,2})\s+([A-Za-z]+)\s+(.+?)(?=(?:\s+\d{1,2}\.\s+\d{1,2}\s+[A-Za-z]+\s+)|$)/g;
  const rows: ParsedHoliday[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null = rowRegex.exec(text);
  while (match) {
    const day = Number(match[2] || "");
    const monthName = String(match[3] || "").toLowerCase();
    const month = MONTH_MAP[monthName] || 0;
    const description = String(match[4] || "").trim();
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && description) {
      const date = toIsoDate(year, month, day);
      splitHolidayNames(description).forEach((item) => {
        const dedupe = `${date}|${item.name.toLowerCase()}`;
        if (seen.has(dedupe)) return;
        seen.add(dedupe);
        rows.push({
          date,
          name: item.name,
          type: item.type,
          scope: "national",
        });
      });
    }
    match = rowRegex.exec(text);
  }

  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
}

async function fetchOfficialHolidays(year: number) {
  const response = await fetch(`https://mpa.gov.in/media/calendar?date=${year}-01`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Official holiday source is unavailable.");
  }
  const html = await response.text();
  const parsed = parseCalendarText(html, year);
  if (parsed.length === 0) {
    throw new Error("Unable to parse holidays from official source.");
  }
  return parsed;
}

function parseMaharashtraCalendarText(rawHtml: string, year: number) {
  const text = stripHtml(rawHtml);
  const rows: ParsedHoliday[] = [];
  const seen = new Set<string>();

  const patterns = [
    /([A-Za-z][A-Za-z0-9 .,&()'/-]{2,}?)\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/g, // Name Date
    /(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})\s+([A-Za-z][A-Za-z0-9 .,&()'/-]{2,}?)(?=\s+\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4}|$)/g, // Date Name
  ];

  patterns.forEach((regex, idx) => {
    let match: RegExpExecArray | null = regex.exec(text);
    while (match) {
      const parsedDate = parseLongDate(String(match[idx === 0 ? 2 : 1] || ""));
      const name = String(match[idx === 0 ? 1 : 2] || "").replace(/\s+/g, " ").trim();
      if (!parsedDate || parsedDate.year !== year) {
        match = regex.exec(text);
        continue;
      }
      if (name.length < 3) {
        match = regex.exec(text);
        continue;
      }
      if (/public holiday|bank holiday|sr\.?\s*no|day|date|maharashtra/i.test(name)) {
        match = regex.exec(text);
        continue;
      }
      const date = toIsoDate(parsedDate.year, parsedDate.month, parsedDate.day);
      const dedupe = `${date}|${name.toLowerCase()}`;
      if (!seen.has(dedupe)) {
        seen.add(dedupe);
        rows.push({
          date,
          name,
          type: "festival",
          scope: "state",
        });
      }
      match = regex.exec(text);
    }
  });

  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
}

async function fetchMaharashtraOfficialHolidays(year: number) {
  const response = await fetch("https://mmrda.maharashtra.gov.in/en/public-holidays", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Maharashtra official holiday source is unavailable.");
  }
  const html = await response.text();
  const parsed = parseMaharashtraCalendarText(html, year);
  if (parsed.length === 0) {
    throw new Error("Unable to parse Maharashtra holidays from official source.");
  }
  return parsed;
}

async function fetchMaharashtraWithFallback(year: number) {
  try {
    const rows = await fetchMaharashtraOfficialHolidays(year);
    return {
      rows,
      source: {
        name: "Maharashtra Government Public Holidays",
        url: "https://mmrda.maharashtra.gov.in/en/public-holidays",
      },
      fallbackUsed: false,
    };
  } catch {
    const rows = await fetchOfficialHolidays(year);
    return {
      rows,
      source: {
        name: "Ministry of Parliamentary Affairs (Government of India) - fallback",
        url: `https://mpa.gov.in/media/calendar?date=${year}-01`,
      },
      fallbackUsed: true,
    };
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const year = normalizeYear(req.nextUrl.searchParams.get("year"));
  const state = normalizeState(req.nextUrl.searchParams.get("state"));

  try {
    if (state === "all_india") {
      const rows = await fetchOfficialHolidays(year);
      return NextResponse.json({
        year,
        state,
        source: {
          name: "Ministry of Parliamentary Affairs (Government of India)",
          url: `https://mpa.gov.in/media/calendar?date=${year}-01`,
        },
        rows: rows.map((row) => ({
          key: `${row.date}|${row.name.toLowerCase()}`,
          date: row.date,
          name: row.name,
          type: row.type,
          scope: row.scope,
        })),
      });
    }

    if (state === "maharashtra") {
      const resolved = await fetchMaharashtraWithFallback(year);
      return NextResponse.json({
        year,
        state,
        source: resolved.source,
        fallbackUsed: resolved.fallbackUsed,
        rows: resolved.rows.map((row) => ({
          key: `${row.date}|${row.name.toLowerCase()}`,
          date: row.date,
          name: row.name,
          type: row.type,
          scope: row.scope,
        })),
      });
    }

    return NextResponse.json({
      error: `Official parser not configured for state: ${state}.`,
      year,
      state,
      source: {
        name: "Pending State Source Integration",
        url: "",
      },
      rows: [],
    }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load government holidays." },
      { status: 400 }
    );
  }
}
