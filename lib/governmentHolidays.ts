import { HolidayType } from "@/lib/companyLeaves";

export type GovernmentHolidayState = "all_india" | "maharashtra" | "karnataka" | "gujarat" | "tamil_nadu";

export type GovernmentHolidayItem = {
  key: string;
  date: string;
  name: string;
  type: HolidayType;
  scope: "national" | "state";
  state: GovernmentHolidayState;
};

type Template = {
  month: number;
  day: number;
  name: string;
  type: HolidayType;
  state: GovernmentHolidayState;
};

export const GOVERNMENT_HOLIDAY_STATE_OPTIONS: Array<{ value: GovernmentHolidayState; label: string }> = [
  { value: "all_india", label: "All India" },
  { value: "maharashtra", label: "Maharashtra" },
  { value: "karnataka", label: "Karnataka" },
  { value: "gujarat", label: "Gujarat" },
  { value: "tamil_nadu", label: "Tamil Nadu" },
];

const NATIONAL_TEMPLATES: Template[] = [
  { month: 1, day: 26, name: "Republic Day", type: "national", state: "all_india" },
  { month: 8, day: 15, name: "Independence Day", type: "national", state: "all_india" },
  { month: 10, day: 2, name: "Gandhi Jayanti", type: "national", state: "all_india" },
];

const STATE_TEMPLATES: Template[] = [
  { month: 5, day: 1, name: "Maharashtra Day", type: "festival", state: "maharashtra" },
  { month: 11, day: 1, name: "Karnataka Rajyotsava", type: "festival", state: "karnataka" },
  { month: 5, day: 1, name: "Gujarat Foundation Day", type: "festival", state: "gujarat" },
  { month: 1, day: 15, name: "Pongal", type: "festival", state: "tamil_nadu" },
];

function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function governmentHolidaySuggestions(year: number, state: GovernmentHolidayState): GovernmentHolidayItem[] {
  const safeYear = Number.isFinite(year) ? Math.max(2000, Math.min(2100, Math.floor(year))) : new Date().getFullYear();
  const stateRows = state === "all_india" ? [] : STATE_TEMPLATES.filter((row) => row.state === state);
  const merged = [...NATIONAL_TEMPLATES, ...stateRows];

  return merged
    .map((row) => {
      const date = toIsoDate(safeYear, row.month, row.day);
      return {
        key: `${row.state}|${date}|${row.name.toLowerCase()}`,
        date,
        name: row.name,
        type: row.type,
        scope: row.state === "all_india" ? "national" : "state",
        state: row.state,
      } as GovernmentHolidayItem;
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
}
