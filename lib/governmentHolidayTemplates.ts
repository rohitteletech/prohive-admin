import { HolidayType } from "@/lib/companyLeaves";
import { GovernmentHolidayState } from "@/lib/governmentHolidays";

type TemplateRow = {
  month: number;
  day: number;
  name: string;
  type: HolidayType;
  scope: "national" | "state";
  state: GovernmentHolidayState;
};

export const GOVERNMENT_TEMPLATE_LAST_UPDATED = "2026-03-09";

const TEMPLATE_ROWS: TemplateRow[] = [
  { month: 1, day: 26, name: "Republic Day", type: "national", scope: "national", state: "all_india" },
  { month: 8, day: 15, name: "Independence Day", type: "national", scope: "national", state: "all_india" },
  { month: 10, day: 2, name: "Gandhi Jayanti", type: "national", scope: "national", state: "all_india" },

  { month: 5, day: 1, name: "Maharashtra Day", type: "festival", scope: "state", state: "maharashtra" },
  { month: 11, day: 1, name: "Karnataka Rajyotsava", type: "festival", scope: "state", state: "karnataka" },
  { month: 5, day: 1, name: "Gujarat Foundation Day", type: "festival", scope: "state", state: "gujarat" },
  { month: 1, day: 15, name: "Pongal", type: "festival", scope: "state", state: "tamil_nadu" },
];

function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function governmentTemplateSuggestions(year: number, state: GovernmentHolidayState) {
  const safeYear = Number.isFinite(year) ? Math.max(2000, Math.min(2100, Math.floor(year))) : new Date().getFullYear();
  const rows = TEMPLATE_ROWS.filter((row) => row.state === "all_india" || (state !== "all_india" && row.state === state));
  return rows
    .map((row) => ({
      key: `${row.state}|${toIsoDate(safeYear, row.month, row.day)}|${row.name.toLowerCase()}`,
      date: toIsoDate(safeYear, row.month, row.day),
      name: row.name,
      type: row.type,
      scope: row.scope,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
}

export type GovernmentTemplateHolidayRow = {
  date: string;
  name: string;
  type: HolidayType;
  scope: "national" | "state";
};

export function sanitizeGovernmentTemplateRows(input: unknown) {
  if (!Array.isArray(input)) {
    throw new Error("Template rows payload must be a list.");
  }
  const seen = new Set<string>();
  return input.map((row) => {
    const source = (row || {}) as Record<string, unknown>;
    const date = String(source.date || "").trim();
    const name = String(source.name || "").trim();
    const type = source.type === "national" || source.type === "festival" ? source.type : "festival";
    const scope = source.scope === "state" ? "state" : "national";
    const dedupe = `${date}|${name.toLowerCase()}`;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid holiday date: ${date || "-"}`);
    if (!name) throw new Error("Holiday name is required.");
    if (seen.has(dedupe)) throw new Error(`Duplicate holiday: ${name} (${date})`);

    seen.add(dedupe);
    return { date, name, type, scope } satisfies GovernmentTemplateHolidayRow;
  });
}
