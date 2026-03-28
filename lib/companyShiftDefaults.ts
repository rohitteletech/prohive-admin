import { shiftDurationMinutes } from "@/lib/shiftWorkPolicy";

export type DefaultCompanyShift = {
  id: string;
  name: string;
  type: string;
  start: string;
  end: string;
  graceMins: number;
  earlyWindowMins: number;
  minWorkBeforeOutMins: number;
  active: boolean;
};

export const DEFAULT_COMPANY_SHIFTS: DefaultCompanyShift[] = [
  {
    id: "default-general",
    name: "General",
    type: "Day",
    start: "09:00",
    end: "18:00",
    graceMins: 10,
    earlyWindowMins: 15,
    minWorkBeforeOutMins: 60,
    active: true,
  },
  {
    id: "default-morning",
    name: "Morning",
    type: "Early",
    start: "06:00",
    end: "15:00",
    graceMins: 10,
    earlyWindowMins: 15,
    minWorkBeforeOutMins: 60,
    active: true,
  },
  {
    id: "default-evening",
    name: "Evening",
    type: "Late",
    start: "14:00",
    end: "22:00",
    graceMins: 10,
    earlyWindowMins: 15,
    minWorkBeforeOutMins: 60,
    active: true,
  },
];

export function getPrimaryDefaultCompanyShift(): DefaultCompanyShift {
  return (
    DEFAULT_COMPANY_SHIFTS[0] || {
      id: "default-general",
      name: "General Shift",
      type: "General",
      start: "09:00",
      end: "18:00",
      graceMins: 10,
      earlyWindowMins: 15,
      minWorkBeforeOutMins: 60,
      active: true,
    }
  );
}

function minutesToClock(totalMinutes: number, fallback = "04:00") {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return fallback;
  const safe = Math.floor(totalMinutes);
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function createDefaultShiftPolicyConfig(params?: {
  policyName?: string;
  policyCode?: string;
  effectiveFrom?: string;
  nextReviewDate?: string;
  status?: "draft" | "active" | "archived";
  defaultCompanyPolicy?: "Yes" | "No";
}) {
  const base = getPrimaryDefaultCompanyShift();
  const duration = shiftDurationMinutes(base.start, base.end) || 480;

  return {
    policyName: params?.policyName || "Standard Shift Policy",
    policyCode: params?.policyCode || "SFT-001",
    effectiveFrom: params?.effectiveFrom || "",
    nextReviewDate: params?.nextReviewDate || "",
    status: params?.status || "active",
    defaultCompanyPolicy: params?.defaultCompanyPolicy || "Yes",
    shiftName: base.name,
    shiftType: base.type,
    shiftStructure: "fixed",
    shiftStartTime: base.start,
    shiftEndTime: base.end,
    halfDayAvailable: "Yes",
    halfDayHours: minutesToClock(Math.max(0, Math.floor(duration / 2)), "04:00"),
    punchAccessRule: "any_time",
    earlyPunchAllowed: "15",
    gracePeriod: String(base.graceMins),
    minimumWorkBeforePunchOut: String(base.minWorkBeforeOutMins),
  } as const;
}
