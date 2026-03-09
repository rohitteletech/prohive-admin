import { HolidayType } from "@/lib/companyLeaves";

export type GovernmentHolidayState = "all_india" | "maharashtra" | "karnataka" | "gujarat" | "tamil_nadu";

export type GovernmentHolidayItem = {
  key: string;
  date: string;
  name: string;
  type: HolidayType;
  scope: "national" | "state";
};

export const GOVERNMENT_HOLIDAY_STATE_OPTIONS: Array<{ value: GovernmentHolidayState; label: string }> = [
  { value: "all_india", label: "All India (Template)" },
  { value: "maharashtra", label: "Maharashtra (Template)" },
  { value: "karnataka", label: "Karnataka (Template)" },
  { value: "gujarat", label: "Gujarat (Template)" },
  { value: "tamil_nadu", label: "Tamil Nadu (Template)" },
];
