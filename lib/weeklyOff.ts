export type WeeklyOffPolicy = "sunday_only" | "saturday_sunday" | "second_fourth_saturday_sunday";

export const WEEKLY_OFF_POLICY_VALUES: WeeklyOffPolicy[] = [
  "sunday_only",
  "saturday_sunday",
  "second_fourth_saturday_sunday",
];

export function normalizeWeeklyOffPolicy(value: unknown): WeeklyOffPolicy {
  const policy = String(value || "").trim() as WeeklyOffPolicy;
  if (WEEKLY_OFF_POLICY_VALUES.includes(policy)) return policy;
  return "sunday_only";
}

export function weeklyOffPolicyLabel(policy: WeeklyOffPolicy) {
  if (policy === "saturday_sunday") return "Saturday + Sunday";
  if (policy === "second_fourth_saturday_sunday") return "2nd & 4th Saturday + Sunday";
  return "Sunday Only";
}

export function isWeeklyOffDate(isoDate: string, policy: WeeklyOffPolicy) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getUTCDay(); // 0=Sunday, 6=Saturday
  if (day === 0) return true;
  if (policy === "sunday_only") return false;
  if (policy === "saturday_sunday") return day === 6;
  if (day !== 6) return false;

  const dateOfMonth = date.getUTCDate();
  const saturdayOccurrence = Math.floor((dateOfMonth - 1) / 7) + 1;
  return saturdayOccurrence === 2 || saturdayOccurrence === 4;
}
