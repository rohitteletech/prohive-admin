import { timeToMinutes } from "@/lib/shiftWorkPolicy";

export type AttendanceStatus = "present" | "late" | "half_day" | "absent";

export type DailyAttendanceDecision = {
  status: AttendanceStatus;
  workedMinutes: number;
  lateMinutes: number;
  isLate: boolean;
};

export type LatePenaltyPolicy = {
  enabled: boolean;
  upToMins: number;
  repeatCount: number;
  repeatDays: number;
  aboveMins: number;
  aboveDays: number;
};

export function rawWorkedMinutes(checkInIso: string | null, checkOutIso: string | null) {
  if (!checkInIso || !checkOutIso) return 0;
  const diffMs = new Date(checkOutIso).getTime() - new Date(checkInIso).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.floor(diffMs / 60000);
}

function localMinutesInTimeZone(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

export function buildDailyAttendanceDecision(params: {
  checkInIso: string | null;
  checkOutIso: string | null;
  timeZone: string;
  shiftStart: string | null;
  scheduledMinutes: number | null;
  graceMins: number;
  halfDayMinWorkMins: number;
}) {
  if (!params.checkInIso) {
    return {
      status: "absent",
      workedMinutes: 0,
      lateMinutes: 0,
      isLate: false,
    } satisfies DailyAttendanceDecision;
  }

  const workedMinutes = rawWorkedMinutes(params.checkInIso, params.checkOutIso);
  const actualMinutes = localMinutesInTimeZone(params.checkInIso, params.timeZone);
  const shiftStartMins = params.shiftStart ? timeToMinutes(params.shiftStart) : null;
  const grace = Math.max(0, Math.floor(params.graceMins || 0));
  const lateMinutes =
    actualMinutes !== null && shiftStartMins !== null ? Math.max(0, actualMinutes - (shiftStartMins + grace)) : 0;
  const isLate = lateMinutes > 0;
  const halfDayThreshold = Math.max(0, Math.floor(params.halfDayMinWorkMins || 0));
  const scheduledMinutes =
    typeof params.scheduledMinutes === "number" && Number.isFinite(params.scheduledMinutes) && params.scheduledMinutes > 0
      ? Math.floor(params.scheduledMinutes)
      : null;

  if (scheduledMinutes !== null && workedMinutes >= scheduledMinutes) {
    return {
      status: isLate ? "late" : "present",
      workedMinutes,
      lateMinutes,
      isLate,
    } satisfies DailyAttendanceDecision;
  }

  if (workedMinutes >= halfDayThreshold && workedMinutes > 0) {
    return {
      status: "half_day",
      workedMinutes,
      lateMinutes,
      isLate,
    } satisfies DailyAttendanceDecision;
  }

  return {
    status: "absent",
    workedMinutes,
    lateMinutes,
    isLate,
  } satisfies DailyAttendanceDecision;
}

export function calculateMonthlyLatePenalty(
  lateMinutesList: number[],
  policy: LatePenaltyPolicy
) {
  if (!policy.enabled) {
    return {
      repeatLateCount: 0,
      aboveLimitCount: 0,
      penaltyDays: 0,
    };
  }

  const repeatLateCount = lateMinutesList.filter((mins) => mins > 0 && mins <= policy.upToMins).length;
  const aboveLimitCount = lateMinutesList.filter((mins) => mins > policy.aboveMins).length;
  const repeatPenaltyBlocks = Math.floor(repeatLateCount / Math.max(1, policy.repeatCount));
  const penaltyDays = repeatPenaltyBlocks * policy.repeatDays + aboveLimitCount * policy.aboveDays;

  return {
    repeatLateCount,
    aboveLimitCount,
    penaltyDays,
  };
}
