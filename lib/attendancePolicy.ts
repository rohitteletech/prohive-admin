import { timeToMinutes } from "@/lib/shiftWorkPolicy";

export type AttendanceStatus = "present" | "late" | "half_day" | "absent" | "off_day_worked" | "manual_review";
export type NonWorkingDayTreatment =
  | "Record Only"
  | "OT Only"
  | "Grant Comp Off"
  | "Present + OT"
  | "Manual Review";

export type DailyAttendanceDecision = {
  status: AttendanceStatus;
  workedMinutes: number;
  lateMinutes: number;
  earlyGoMinutes: number;
  isLate: boolean;
  dayCount: number;
  appliedRuleCode: "late_above_limit" | "repeat_late" | "early_go_above_limit" | "repeat_early_go" | null;
};

export type LatePenaltyPolicy = {
  enabled: boolean;
  upToMins: number;
  repeatCount: number;
  repeatDays: number;
  aboveMins: number;
  aboveDays: number;
};

export type AttendanceStatusPenaltyRuntime = {
  presentTrigger: string;
  singlePunchHandling: string;
  latePunchRule: "flag_only" | "enforce_penalty";
  earlyGoRule: "flag_only" | "enforce_penalty";
  halfDayValue: number;
  latePunchUpToMinutes: number;
  repeatLateDaysInMonth: number;
  dayCountForRepeatLate: number;
  latePunchAboveMinutes: number;
  dayCountForLateAboveLimit: number;
  earlyGoUpToMinutes: number;
  repeatEarlyGoDaysInMonth: number;
  dayCountForRepeatEarlyGo: number;
  earlyGoAboveMinutes: number;
  dayCountForEarlyGoAboveLimit: number;
};

export type AttendanceMetrics = {
  workedMinutes: number;
  lateMinutes: number;
  earlyGoMinutes: number;
  isLate: boolean;
  hasPunchIn: boolean;
  hasPunchOut: boolean;
  scheduledMinutes: number | null;
  halfDayThreshold: number;
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

function statusToDayCount(status: AttendanceStatus) {
  if (status === "present" || status === "late") return 1;
  if (status === "half_day") return 0.5;
  return 0;
}

function dayCountToStatus(dayCount: number, isLate: boolean) {
  if (dayCount >= 1) return isLate ? "late" : "present";
  if (dayCount >= 0.5) return "half_day";
  return "absent";
}

function clampDayCount(value: number) {
  if (!Number.isFinite(value)) return 1;
  if (value <= 0) return 0;
  if (value < 1) return 0.5;
  return 1;
}

export function buildAttendanceMetrics(params: {
  checkInIso: string | null;
  checkOutIso: string | null;
  timeZone: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  scheduledMinutes: number | null;
  graceMins: number;
  halfDayMinWorkMins: number;
}) {
  const workedMinutes = rawWorkedMinutes(params.checkInIso, params.checkOutIso);
  const actualCheckInMinutes = params.checkInIso ? localMinutesInTimeZone(params.checkInIso, params.timeZone) : null;
  const actualCheckOutMinutes = params.checkOutIso ? localMinutesInTimeZone(params.checkOutIso, params.timeZone) : null;
  const shiftStartMins = params.shiftStart ? timeToMinutes(params.shiftStart) : null;
  const shiftEndMins = params.shiftEnd ? timeToMinutes(params.shiftEnd) : null;
  const grace = Math.max(0, Math.floor(params.graceMins || 0));
  const lateMinutes =
    actualCheckInMinutes !== null && shiftStartMins !== null
      ? Math.max(0, actualCheckInMinutes - (shiftStartMins + grace))
      : 0;
  const earlyGoMinutes =
    actualCheckOutMinutes !== null && shiftEndMins !== null && params.checkOutIso
      ? Math.max(0, shiftEndMins - actualCheckOutMinutes)
      : 0;
  return {
    workedMinutes,
    lateMinutes,
    earlyGoMinutes,
    isLate: lateMinutes > 0,
    hasPunchIn: Boolean(params.checkInIso),
    hasPunchOut: Boolean(params.checkOutIso),
    scheduledMinutes:
      typeof params.scheduledMinutes === "number" && Number.isFinite(params.scheduledMinutes) && params.scheduledMinutes > 0
        ? Math.floor(params.scheduledMinutes)
        : null,
    halfDayThreshold: Math.max(0, Math.floor(params.halfDayMinWorkMins || 0)),
  } satisfies AttendanceMetrics;
}

export function buildDailyAttendanceDecision(params: {
  checkInIso: string | null;
  checkOutIso: string | null;
  timeZone: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  scheduledMinutes: number | null;
  graceMins: number;
  halfDayMinWorkMins: number;
  policy?: AttendanceStatusPenaltyRuntime | null;
  lateCycleOccurrenceCount?: number;
  earlyGoCycleOccurrenceCount?: number;
}) {
  const metrics = buildAttendanceMetrics(params);

  if (!metrics.hasPunchIn) {
    return {
      status: "absent",
      workedMinutes: 0,
      lateMinutes: 0,
      earlyGoMinutes: 0,
      isLate: false,
      dayCount: 0,
      appliedRuleCode: null,
    } satisfies DailyAttendanceDecision;
  }

  let baseStatus: AttendanceStatus;

  if (metrics.scheduledMinutes !== null && metrics.workedMinutes >= metrics.scheduledMinutes) {
    baseStatus = metrics.isLate ? "late" : "present";
  } else if (metrics.workedMinutes >= metrics.halfDayThreshold && metrics.workedMinutes > 0) {
    baseStatus = "half_day";
  } else {
    baseStatus = "absent";
  }

  let finalDayCount = statusToDayCount(baseStatus);
  let appliedRuleCode: DailyAttendanceDecision["appliedRuleCode"] = null;

  if (params.policy) {
    const lateRepeatThreshold = Math.max(0, Math.floor(params.policy.repeatLateDaysInMonth || 0));
    const earlyRepeatThreshold = Math.max(0, Math.floor(params.policy.repeatEarlyGoDaysInMonth || 0));

    if (
      params.policy.latePunchRule === "enforce_penalty" &&
      metrics.lateMinutes > Math.max(0, params.policy.latePunchAboveMinutes || 0)
    ) {
      finalDayCount = Math.min(finalDayCount, clampDayCount(params.policy.dayCountForLateAboveLimit));
      appliedRuleCode = "late_above_limit";
    } else if (
      params.policy.latePunchRule === "enforce_penalty" &&
      metrics.lateMinutes > 0 &&
      metrics.lateMinutes <= Math.max(0, params.policy.latePunchUpToMinutes || 0) &&
      lateRepeatThreshold > 0 &&
      (params.lateCycleOccurrenceCount || 0) > lateRepeatThreshold
    ) {
      finalDayCount = Math.min(finalDayCount, clampDayCount(params.policy.dayCountForRepeatLate));
      appliedRuleCode = "repeat_late";
    }

    if (
      params.policy.earlyGoRule === "enforce_penalty" &&
      metrics.earlyGoMinutes > Math.max(0, params.policy.earlyGoAboveMinutes || 0)
    ) {
      finalDayCount = Math.min(finalDayCount, clampDayCount(params.policy.dayCountForEarlyGoAboveLimit));
      appliedRuleCode = appliedRuleCode || "early_go_above_limit";
    } else if (
      params.policy.earlyGoRule === "enforce_penalty" &&
      metrics.earlyGoMinutes > 0 &&
      metrics.earlyGoMinutes <= Math.max(0, params.policy.earlyGoUpToMinutes || 0) &&
      earlyRepeatThreshold > 0 &&
      (params.earlyGoCycleOccurrenceCount || 0) > earlyRepeatThreshold
    ) {
      finalDayCount = Math.min(finalDayCount, clampDayCount(params.policy.dayCountForRepeatEarlyGo));
      appliedRuleCode = appliedRuleCode || "repeat_early_go";
    }
  }

  const finalStatus = dayCountToStatus(finalDayCount, metrics.isLate);
  return {
    status: finalStatus,
    workedMinutes: metrics.workedMinutes,
    lateMinutes: metrics.lateMinutes,
    earlyGoMinutes: metrics.earlyGoMinutes,
    isLate: metrics.isLate,
    dayCount: finalDayCount,
    appliedRuleCode,
  } satisfies DailyAttendanceDecision;
}

export function applyNonWorkingDayTreatment(params: {
  decision: DailyAttendanceDecision;
  dayType: "holiday" | "weekly_off" | null;
  treatment: NonWorkingDayTreatment | null;
}): {
  decision: DailyAttendanceDecision;
  treatmentLabel: NonWorkingDayTreatment | null;
} {
  if (!params.dayType || !params.treatment) {
    return {
      decision: params.decision,
      treatmentLabel: null,
    };
  }

  if (params.treatment === "Present + OT") {
    return {
      decision: {
        ...params.decision,
        status: "present" as const,
        dayCount: 1,
        isLate: false,
      },
      treatmentLabel: "Present + OT",
    };
  }

  if (params.treatment === "Manual Review") {
    return {
      decision: {
        ...params.decision,
        status: "manual_review" as const,
        dayCount: 0,
        isLate: false,
      },
      treatmentLabel: "Manual Review",
    };
  }

  return {
    decision: {
      ...params.decision,
      status: "off_day_worked" as const,
      dayCount: 0,
      isLate: false,
    },
    treatmentLabel:
      params.treatment === "Grant Comp Off"
        ? "Grant Comp Off"
        : params.treatment === "OT Only"
          ? "OT Only"
          : "Record Only",
  };
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
  const repeatPenaltyBlocks = Math.floor(repeatLateCount / Math.max(1, policy.repeatCount + 1));
  const penaltyDays = repeatPenaltyBlocks * policy.repeatDays + aboveLimitCount * policy.aboveDays;

  return {
    repeatLateCount,
    aboveLimitCount,
    penaltyDays,
  };
}
