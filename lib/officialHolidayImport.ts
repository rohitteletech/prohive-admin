import { GovernmentHolidayState } from "@/lib/governmentHolidays";
import { GovernmentTemplateHolidayRow } from "@/lib/governmentHolidayTemplates";

type CalendarificHoliday = {
  name?: string;
  type?: string[];
  primary_type?: string;
};

type CalendarificResponse = {
  response?: {
    holidays?: Array<{
      name?: string;
      date?: {
        iso?: string;
      };
      type?: string[];
      primary_type?: string;
    }>;
  };
};

function stateToLocation(state: GovernmentHolidayState) {
  if (state === "maharashtra") return "IN-MH";
  if (state === "karnataka") return "IN-KA";
  if (state === "gujarat") return "IN-GJ";
  if (state === "tamil_nadu") return "IN-TN";
  return "";
}

function classifyHoliday(row: CalendarificHoliday): Pick<GovernmentTemplateHolidayRow, "type" | "scope"> {
  const tokens = [row.primary_type || "", ...(Array.isArray(row.type) ? row.type : [])]
    .join(" ")
    .toLowerCase();
  const isNational = tokens.includes("national");
  return {
    type: isNational ? "national" : "festival",
    scope: isNational ? "national" : "state",
  };
}

export async function importOfficialIndiaHolidays(year: number, state: GovernmentHolidayState) {
  const apiKey = process.env.CALENDARIFIC_API_KEY?.trim() || "";
  if (!apiKey) {
    throw new Error("CALENDARIFIC_API_KEY is not configured.");
  }

  const search = new URLSearchParams({
    api_key: apiKey,
    country: "IN",
    year: String(year),
  });
  const location = stateToLocation(state);
  if (location) {
    search.set("location", location);
  }

  const response = await fetch(`https://calendarific.com/api/v2/holidays?${search.toString()}`, {
    method: "GET",
    headers: {
      accept: "application/json",
    },
    cache: "no-store",
  });

  const result = (await response.json().catch(() => ({}))) as CalendarificResponse & {
    error?: { message?: string };
    meta?: { code?: number };
  };

  if (!response.ok) {
    const apiMessage = result?.error?.message || `Official holiday import failed with status ${response.status}.`;
    throw new Error(apiMessage);
  }

  const holidays = Array.isArray(result.response?.holidays) ? result.response?.holidays : [];
  const seen = new Set<string>();
  const rows = holidays
    .map((row) => {
      const iso = String(row.date?.iso || "").slice(0, 10);
      const name = String(row.name || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !name) return null;
      const dedupe = `${iso}|${name.toLowerCase()}`;
      if (seen.has(dedupe)) return null;
      seen.add(dedupe);
      return {
        date: iso,
        name,
        ...classifyHoliday({
          name: row.name,
          type: row.type,
          primary_type: row.primary_type,
        }),
      } satisfies GovernmentTemplateHolidayRow;
    })
    .filter((row): row is GovernmentTemplateHolidayRow => Boolean(row))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));

  if (rows.length === 0) {
    throw new Error("No official holidays were returned for the selected year/state.");
  }

  return rows;
}
