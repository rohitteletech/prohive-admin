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
  { value: "all_india", label: "All India (Official Central List)" },
  { value: "maharashtra", label: "Maharashtra (Official State Source)" },
  { value: "karnataka", label: "Karnataka (Pending Official Parser)" },
  { value: "gujarat", label: "Gujarat (Pending Official Parser)" },
  { value: "tamil_nadu", label: "Tamil Nadu (Pending Official Parser)" },
];
