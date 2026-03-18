import { isoDateInIndia } from "@/lib/dateTime";
import { isWeeklyOffDate, type WeeklyOffPolicy } from "@/lib/weeklyOff";
import type { NonWorkingDayTreatment } from "@/lib/attendancePolicy";
import { fetchManualReviewResolutionMapForEmployee } from "@/lib/manualReviewResolutions";

export type LeaveAccrualMode = "monthly" | "upfront";
export type LeaveCycleType = "Calendar Year" | "Financial Year";

export function normalizeAccrualMode(value: unknown): LeaveAccrualMode {
  return value === "upfront" ? "upfront" : "monthly";
}

export function normalizeLeaveCycleType(value: unknown, fallback: LeaveCycleType = "Calendar Year"): LeaveCycleType {
  return value === "Financial Year" || value === "Calendar Year" ? value : fallback;
}

export function getLeaveCycleBounds(asOfIsoDate: string, leaveCycleType: LeaveCycleType) {
  const year = Number(String(asOfIsoDate || "").slice(0, 4));
  const month = Number(String(asOfIsoDate || "").slice(5, 7));
  const safeYear = Number.isFinite(year) ? year : new Date().getUTCFullYear();
  const safeMonth = Number.isFinite(month) ? month : 1;

  if (leaveCycleType === "Financial Year") {
    const startYear = safeMonth >= 4 ? safeYear : safeYear - 1;
    return {
      start: `${startYear}-04-01`,
      end: `${startYear + 1}-03-31`,
      keyYear: startYear,
    };
  }

  return {
    start: `${safeYear}-01-01`,
    end: `${safeYear}-12-31`,
    keyYear: safeYear,
  };
}

function shiftIsoDate(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function monthsElapsedInCycle(isoDate: string, leaveCycleType: LeaveCycleType) {
  const month = Number(String(isoDate || "").slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) return 12;
  if (leaveCycleType === "Financial Year") {
    return month >= 4 ? month - 3 : month + 9;
  }
  return month;
}

export function accruedAnnualQuota(
  annualQuota: number,
  accrualMode: LeaveAccrualMode,
  asOfIsoDate: string,
  leaveCycleType: LeaveCycleType = "Calendar Year",
) {
  const quota = Number.isFinite(annualQuota) ? Math.max(Number(annualQuota), 0) : 0;
  if (accrualMode === "upfront") return quota;
  const elapsed = monthsElapsedInCycle(asOfIsoDate, leaveCycleType);
  return Math.floor((quota * elapsed) / 12);
}

export function roundLeaveDays(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export type LeaveRequestUsageRow = {
  from_date: string;
  to_date: string;
  days: number;
  paid_days?: number | null;
  status: "pending" | "pending_manager" | "pending_hr" | "approved" | "rejected";
};

function enumerateIsoDates(fromDate: string, toDate: string) {
  const start = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const dates: string[] = [];
  while (start <= end) {
    dates.push(start.toISOString().slice(0, 10));
    start.setUTCDate(start.getUTCDate() + 1);
  }
  return dates;
}

function addDaysToIsoDate(isoDate: string, days: number) {
  return shiftIsoDate(isoDate, days);
}

export async function fetchApprovedAttendanceDatesForYear(params: {
  admin: any;
  companyId: string;
  employeeId: string;
  year: number;
}) {
  const yearStart = `${params.year}-01-01`;
  const yearNextStart = `${params.year + 1}-01-01`;
  const attendanceResult = await params.admin
    .from("attendance_punch_events")
    .select("effective_punch_at,server_received_at,approval_status")
    .eq("company_id", params.companyId)
    .eq("employee_id", params.employeeId)
    .in("approval_status", ["auto_approved", "approved"])
    .gte("server_received_at", `${yearStart}T00:00:00.000Z`)
    .lt("server_received_at", `${yearNextStart}T00:00:00.000Z`);

  if (attendanceResult.error) {
    return { approvedAttendanceDates: new Set<string>(), error: attendanceResult.error.message || "Unable to load attendance overrides." };
  }

  const approvedAttendanceDates = new Set(
    ((attendanceResult.data || []) as Array<{ effective_punch_at?: string | null; server_received_at?: string | null }>)
      .map((row) => row.effective_punch_at || row.server_received_at || "")
      .map((value) => (value ? isoDateInIndia(value) : ""))
      .filter(Boolean),
  );

  return { approvedAttendanceDates, error: null as string | null };
}

export async function fetchApprovedAttendanceDatesForCycle(params: {
  admin: any;
  companyId: string;
  employeeId: string;
  asOfIsoDate: string;
  leaveCycleType: LeaveCycleType;
}) {
  const bounds = getLeaveCycleBounds(params.asOfIsoDate, params.leaveCycleType);
  const attendanceResult = await params.admin
    .from("attendance_punch_events")
    .select("effective_punch_at,server_received_at,approval_status")
    .eq("company_id", params.companyId)
    .eq("employee_id", params.employeeId)
    .in("approval_status", ["auto_approved", "approved"])
    .gte("server_received_at", `${bounds.start}T00:00:00.000Z`)
    .lt("server_received_at", `${bounds.end}T23:59:59.999Z`);

  if (attendanceResult.error) {
    return { approvedAttendanceDates: new Set<string>(), error: attendanceResult.error.message || "Unable to load attendance overrides." };
  }

  const approvedAttendanceDates = new Set(
    ((attendanceResult.data || []) as Array<{ effective_punch_at?: string | null; server_received_at?: string | null }>)
      .map((row) => row.effective_punch_at || row.server_received_at || "")
      .map((value) => (value ? isoDateInIndia(value) : ""))
      .filter(Boolean),
  );

  return { approvedAttendanceDates, error: null as string | null };
}

export async function fetchApprovedAttendanceDatesForRange(params: {
  admin: any;
  companyId: string;
  employeeId: string;
  startDate: string;
  endDate: string;
}) {
  const attendanceResult = await params.admin
    .from("attendance_punch_events")
    .select("effective_punch_at,server_received_at,approval_status")
    .eq("company_id", params.companyId)
    .eq("employee_id", params.employeeId)
    .in("approval_status", ["auto_approved", "approved"])
    .gte("server_received_at", `${params.startDate}T00:00:00.000Z`)
    .lt("server_received_at", `${params.endDate}T23:59:59.999Z`);

  if (attendanceResult.error) {
    return { approvedAttendanceDates: new Set<string>(), error: attendanceResult.error.message || "Unable to load attendance overrides." };
  }

  const approvedAttendanceDates = new Set(
    ((attendanceResult.data || []) as Array<{ effective_punch_at?: string | null; server_received_at?: string | null }>)
      .map((row) => row.effective_punch_at || row.server_received_at || "")
      .map((value) => (value ? isoDateInIndia(value) : ""))
      .filter((value) => Boolean(value) && value >= params.startDate && value <= params.endDate),
  );

  return { approvedAttendanceDates, error: null as string | null };
}

export async function fetchCompOffEarnedDays(params: {
  admin: any;
  companyId: string;
  employeeId: string;
  asOfIsoDate: string;
  weeklyOffPolicy: WeeklyOffPolicy;
  holidayWorkedStatus: NonWorkingDayTreatment;
  weeklyOffWorkedStatus: NonWorkingDayTreatment;
  compOffValidityDays: number;
  leaveCycleType?: LeaveCycleType;
}) {
  const grantsOnHoliday = params.holidayWorkedStatus === "Grant Comp Off";
  const grantsOnWeeklyOff = params.weeklyOffWorkedStatus === "Grant Comp Off";
  const mayResolveGrantOnHoliday = params.holidayWorkedStatus === "Manual Review";
  const mayResolveGrantOnWeeklyOff = params.weeklyOffWorkedStatus === "Manual Review";
  const validityDays = Math.max(Number(params.compOffValidityDays || 0), 0);
  const leaveCycleType = normalizeLeaveCycleType(params.leaveCycleType, "Calendar Year");

  if (!grantsOnHoliday && !grantsOnWeeklyOff && !mayResolveGrantOnHoliday && !mayResolveGrantOnWeeklyOff) {
    return { earnedDates: new Set<string>(), earnedDays: 0, error: null as string | null };
  }

  const rangeStart =
    validityDays > 0
      ? addDaysToIsoDate(params.asOfIsoDate, -validityDays)
      : getLeaveCycleBounds(params.asOfIsoDate, leaveCycleType).start;
  const rangeEnd = addDaysToIsoDate(params.asOfIsoDate, 1);

  const [attendanceResult, holidayResult] = await Promise.all([
    params.admin
      .from("attendance_punch_events")
      .select("effective_punch_at,server_received_at,approval_status")
      .eq("company_id", params.companyId)
      .eq("employee_id", params.employeeId)
      .in("approval_status", ["auto_approved", "approved"])
      .gte("server_received_at", `${rangeStart}T00:00:00.000Z`)
      .lt("server_received_at", `${rangeEnd}T00:00:00.000Z`),
    params.admin
      .from("company_holidays")
      .select("holiday_date")
      .eq("company_id", params.companyId)
      .gte("holiday_date", rangeStart)
      .lte("holiday_date", params.asOfIsoDate),
  ]);

  if (attendanceResult.error) {
    return { earnedDates: new Set<string>(), earnedDays: 0, error: attendanceResult.error.message || "Unable to load comp off attendance." };
  }
  if (holidayResult.error) {
    return { earnedDates: new Set<string>(), earnedDays: 0, error: holidayResult.error.message || "Unable to load holiday markers." };
  }
  const resolutionResult = await fetchManualReviewResolutionMapForEmployee({
    admin: params.admin,
    companyId: params.companyId,
    employeeId: params.employeeId,
    startDate: rangeStart,
    endDate: params.asOfIsoDate,
  });
  if (resolutionResult.error) {
    return { earnedDates: new Set<string>(), earnedDays: 0, error: resolutionResult.error };
  }

  const holidayDates = new Set(
    ((holidayResult.data || []) as Array<{ holiday_date: string }>).map((row) => String(row.holiday_date || "")).filter(Boolean),
  );
  const attendanceDates = new Set(
    ((attendanceResult.data || []) as Array<{ effective_punch_at?: string | null; server_received_at?: string | null }>)
      .map((row) => row.effective_punch_at || row.server_received_at || "")
      .map((value) => (value ? isoDateInIndia(value) : ""))
      .filter((value) => Boolean(value) && value >= rangeStart && value <= params.asOfIsoDate),
  );

  const earnedDates = new Set<string>();
  attendanceDates.forEach((isoDate) => {
    const resolvedTreatment = resolutionResult.byDate.get(isoDate) || null;
    if (holidayDates.has(isoDate)) {
      if ((resolvedTreatment || params.holidayWorkedStatus) === "Grant Comp Off") earnedDates.add(isoDate);
      return;
    }
    if ((resolvedTreatment || params.weeklyOffWorkedStatus) === "Grant Comp Off" && isWeeklyOffDate(isoDate, params.weeklyOffPolicy)) {
      earnedDates.add(isoDate);
    }
  });

  return { earnedDates, earnedDays: roundLeaveDays(earnedDates.size), error: null as string | null };
}

export function deriveCompOffEarnedDates(params: {
  attendanceDates: Iterable<string>;
  holidayDates: Set<string>;
  weeklyOffPolicy: WeeklyOffPolicy;
  holidayWorkedStatus: NonWorkingDayTreatment;
  weeklyOffWorkedStatus: NonWorkingDayTreatment;
  manualReviewResolutionsByDate?: Map<string, NonWorkingDayTreatment>;
}) {
  const grantsOnHoliday = params.holidayWorkedStatus === "Grant Comp Off";
  const grantsOnWeeklyOff = params.weeklyOffWorkedStatus === "Grant Comp Off";
  const earnedDates = new Set<string>();

  for (const isoDate of params.attendanceDates) {
    const resolvedTreatment = params.manualReviewResolutionsByDate?.get(isoDate) || null;
    if (params.holidayDates.has(isoDate)) {
      if ((resolvedTreatment || params.holidayWorkedStatus) === "Grant Comp Off") earnedDates.add(isoDate);
      continue;
    }
    if ((resolvedTreatment || params.weeklyOffWorkedStatus) === "Grant Comp Off" && isWeeklyOffDate(isoDate, params.weeklyOffPolicy)) {
      earnedDates.add(isoDate);
    }
  }

  return earnedDates;
}

export function restoredDaysForLeaveRequest(
  row: Pick<LeaveRequestUsageRow, "from_date" | "to_date" | "status">,
  approvedAttendanceDates: Set<string>,
) {
  if (row.status !== "approved") return 0;
  return enumerateIsoDates(String(row.from_date || ""), String(row.to_date || "")).filter((iso) => approvedAttendanceDates.has(iso)).length;
}

export function computeLeaveEntitlement(params: {
  annualQuota: number;
  carryForward: number;
  accrualMode: LeaveAccrualMode;
  overrideDays: number;
  asOfIsoDate: string;
  leaveCycleType?: LeaveCycleType;
}) {
  const annualAccrued = accruedAnnualQuota(
    params.annualQuota,
    params.accrualMode,
    params.asOfIsoDate,
    normalizeLeaveCycleType(params.leaveCycleType, "Calendar Year"),
  );
  const carryForward = Number.isFinite(params.carryForward) ? Math.max(Number(params.carryForward), 0) : 0;
  const overrideDays = Number.isFinite(params.overrideDays) ? Number(params.overrideDays) : 0;
  const accruedTotal = roundLeaveDays(annualAccrued + carryForward + overrideDays);
  return {
    annualAccrued: roundLeaveDays(annualAccrued),
    carryForward: roundLeaveDays(carryForward),
    overrideDays: roundLeaveDays(overrideDays),
    accruedTotal,
  };
}

export async function fetchLeaveUsageForCycle(params: {
  admin: any;
  companyId: string;
  employeeId: string;
  leavePolicyCode: string;
  asOfIsoDate: string;
  leaveCycleType: LeaveCycleType;
}) {
  const bounds = getLeaveCycleBounds(params.asOfIsoDate, params.leaveCycleType);
  const [leaveUsageResult, attendanceDatesResult] = await Promise.all([
    params.admin
    .from("employee_leave_requests")
    .select("from_date,to_date,days,paid_days,status")
    .eq("company_id", params.companyId)
    .eq("employee_id", params.employeeId)
    .eq("leave_policy_code", params.leavePolicyCode)
    .gte("from_date", bounds.start)
    .lte("from_date", bounds.end),
    fetchApprovedAttendanceDatesForCycle({
      admin: params.admin,
      companyId: params.companyId,
      employeeId: params.employeeId,
      asOfIsoDate: params.asOfIsoDate,
      leaveCycleType: params.leaveCycleType,
    }),
  ]);
  if (leaveUsageResult.error) {
    return { approvedUsed: 0, pendingUsed: 0, error: leaveUsageResult.error.message || "Unable to load leave usage." };
  }
  if (attendanceDatesResult.error) {
    return { approvedUsed: 0, pendingUsed: 0, error: attendanceDatesResult.error };
  }

  let approvedUsed = 0;
  let pendingUsed = 0;
  const approvedAttendanceDates = attendanceDatesResult.approvedAttendanceDates;
  ((leaveUsageResult.data || []) as LeaveRequestUsageRow[]).forEach((row) => {
    const consumed = Number((row.paid_days ?? row.days) || 0);
    const restoredDays = restoredDaysForLeaveRequest(row, approvedAttendanceDates);
    const effectiveConsumed = Math.max(roundLeaveDays(consumed - restoredDays), 0);
    if (row.status === "approved") approvedUsed += effectiveConsumed;
    if (row.status === "pending" || row.status === "pending_manager" || row.status === "pending_hr") pendingUsed += consumed;
  });
  return { approvedUsed: roundLeaveDays(approvedUsed), pendingUsed: roundLeaveDays(pendingUsed), error: null as string | null };
}

export async function fetchLeaveUsageForRange(params: {
  admin: any;
  companyId: string;
  employeeId: string;
  leavePolicyCode: string;
  startDate: string;
  endDate: string;
}) {
  const [leaveUsageResult, attendanceDatesResult] = await Promise.all([
    params.admin
      .from("employee_leave_requests")
      .select("from_date,to_date,days,paid_days,status")
      .eq("company_id", params.companyId)
      .eq("employee_id", params.employeeId)
      .eq("leave_policy_code", params.leavePolicyCode)
      .gte("from_date", params.startDate)
      .lte("from_date", params.endDate),
    fetchApprovedAttendanceDatesForRange({
      admin: params.admin,
      companyId: params.companyId,
      employeeId: params.employeeId,
      startDate: params.startDate,
      endDate: params.endDate,
    }),
  ]);

  if (leaveUsageResult.error) {
    return { approvedUsed: 0, pendingUsed: 0, error: leaveUsageResult.error.message || "Unable to load leave usage." };
  }
  if (attendanceDatesResult.error) {
    return { approvedUsed: 0, pendingUsed: 0, error: attendanceDatesResult.error };
  }

  let approvedUsed = 0;
  let pendingUsed = 0;
  const approvedAttendanceDates = attendanceDatesResult.approvedAttendanceDates;
  ((leaveUsageResult.data || []) as LeaveRequestUsageRow[]).forEach((row) => {
    const consumed = Number((row.paid_days ?? row.days) || 0);
    const restoredDays = restoredDaysForLeaveRequest(row, approvedAttendanceDates);
    const effectiveConsumed = Math.max(roundLeaveDays(consumed - restoredDays), 0);
    if (row.status === "approved") approvedUsed += effectiveConsumed;
    if (row.status === "pending" || row.status === "pending_manager" || row.status === "pending_hr") pendingUsed += consumed;
  });

  return { approvedUsed: roundLeaveDays(approvedUsed), pendingUsed: roundLeaveDays(pendingUsed), error: null as string | null };
}

export async function fetchLeaveOverrideDays(params: {
  admin: any;
  companyId: string;
  employeeId: string;
  leavePolicyCode: string;
  asOfIsoDate: string;
  leaveCycleType: LeaveCycleType;
}) {
  const bounds = getLeaveCycleBounds(params.asOfIsoDate, params.leaveCycleType);
  const { data, error } = await params.admin
    .from("employee_leave_balance_overrides")
    .select("extra_days")
    .eq("company_id", params.companyId)
    .eq("employee_id", params.employeeId)
    .eq("leave_policy_code", params.leavePolicyCode)
    .eq("year", bounds.keyYear)
    .maybeSingle();
  if (error) return { overrideDays: 0, error: error.message || "Unable to load leave overrides." };
  return { overrideDays: roundLeaveDays(Number(data?.extra_days || 0)), error: null as string | null };
}

export async function fetchLeaveCarryForwardDays(params: {
  admin: any;
  companyId: string;
  employeeId: string;
  leavePolicyCode: string;
  policyEffectiveFrom?: string;
  annualQuota: number;
  accrualMode: LeaveAccrualMode;
  carryForwardAllowed: boolean;
  maximumCarryForwardDays: number;
  carryForwardExpiryDays: number;
  asOfIsoDate: string;
  leaveCycleType: LeaveCycleType;
}) {
  if (!params.carryForwardAllowed || params.maximumCarryForwardDays <= 0) {
    return {
      grantedDays: 0,
      effectiveDays: 0,
      expiredDays: 0,
      previousCycleUnused: 0,
      expiryDate: "",
      error: null as string | null,
    };
  }

  const currentBounds = getLeaveCycleBounds(params.asOfIsoDate, params.leaveCycleType);
  const previousCycleEnd = shiftIsoDate(currentBounds.start, -1);
  if (!previousCycleEnd) {
    return {
      grantedDays: 0,
      effectiveDays: 0,
      expiredDays: 0,
      previousCycleUnused: 0,
      expiryDate: "",
      error: "Unable to determine previous leave cycle.",
    };
  }
  if (params.policyEffectiveFrom && params.policyEffectiveFrom > previousCycleEnd) {
    return {
      grantedDays: 0,
      effectiveDays: 0,
      expiredDays: 0,
      previousCycleUnused: 0,
      expiryDate: "",
      error: null as string | null,
    };
  }

  const [previousUsage, previousOverride] = await Promise.all([
    fetchLeaveUsageForCycle({
      admin: params.admin,
      companyId: params.companyId,
      employeeId: params.employeeId,
      leavePolicyCode: params.leavePolicyCode,
      asOfIsoDate: previousCycleEnd,
      leaveCycleType: params.leaveCycleType,
    }),
    fetchLeaveOverrideDays({
      admin: params.admin,
      companyId: params.companyId,
      employeeId: params.employeeId,
      leavePolicyCode: params.leavePolicyCode,
      asOfIsoDate: previousCycleEnd,
      leaveCycleType: params.leaveCycleType,
    }),
  ]);

  if (previousUsage.error) {
    return {
      grantedDays: 0,
      effectiveDays: 0,
      expiredDays: 0,
      previousCycleUnused: 0,
      expiryDate: "",
      error: previousUsage.error,
    };
  }
  if (previousOverride.error) {
    return {
      grantedDays: 0,
      effectiveDays: 0,
      expiredDays: 0,
      previousCycleUnused: 0,
      expiryDate: "",
      error: previousOverride.error,
    };
  }

  const previousEntitlement = computeLeaveEntitlement({
    annualQuota: params.annualQuota,
    carryForward: 0,
    accrualMode: params.accrualMode,
    overrideDays: previousOverride.overrideDays,
    asOfIsoDate: previousCycleEnd,
    leaveCycleType: params.leaveCycleType,
  });
  const previousCycleUnused = Math.max(
    roundLeaveDays(previousEntitlement.accruedTotal - previousUsage.approvedUsed - previousUsage.pendingUsed),
    0,
  );
  const grantedDays = Math.min(previousCycleUnused, Math.max(params.maximumCarryForwardDays, 0));

  if (grantedDays <= 0) {
    return {
      grantedDays: 0,
      effectiveDays: 0,
      expiredDays: 0,
      previousCycleUnused,
      expiryDate: "",
      error: null as string | null,
    };
  }

  if (params.carryForwardExpiryDays <= 0) {
    return {
      grantedDays,
      effectiveDays: grantedDays,
      expiredDays: 0,
      previousCycleUnused,
      expiryDate: "",
      error: null as string | null,
    };
  }

  const expiryDate = shiftIsoDate(currentBounds.start, params.carryForwardExpiryDays - 1);
  if (!expiryDate || params.asOfIsoDate <= expiryDate) {
    return {
      grantedDays,
      effectiveDays: grantedDays,
      expiredDays: 0,
      previousCycleUnused,
      expiryDate,
      error: null as string | null,
    };
  }

  const currentUsageUntilExpiry = await fetchLeaveUsageForRange({
    admin: params.admin,
    companyId: params.companyId,
    employeeId: params.employeeId,
    leavePolicyCode: params.leavePolicyCode,
    startDate: currentBounds.start,
    endDate: expiryDate,
  });

  if (currentUsageUntilExpiry.error) {
    return {
      grantedDays: 0,
      effectiveDays: 0,
      expiredDays: 0,
      previousCycleUnused,
      expiryDate,
      error: currentUsageUntilExpiry.error,
    };
  }

  const consumedBeforeExpiry = Math.min(
    grantedDays,
    roundLeaveDays(currentUsageUntilExpiry.approvedUsed + currentUsageUntilExpiry.pendingUsed),
  );
  const expiredDays = Math.max(roundLeaveDays(grantedDays - consumedBeforeExpiry), 0);

  return {
    grantedDays,
    effectiveDays: consumedBeforeExpiry,
    expiredDays,
    previousCycleUnused,
    expiryDate,
    error: null as string | null,
  };
}

export async function fetchLeaveUsageForYear(params: {
  admin: any;
  companyId: string;
  employeeId: string;
  leavePolicyCode: string;
  year: number;
}) {
  return fetchLeaveUsageForCycle({
    admin: params.admin,
    companyId: params.companyId,
    employeeId: params.employeeId,
    leavePolicyCode: params.leavePolicyCode,
    asOfIsoDate: `${params.year}-12-31`,
    leaveCycleType: "Calendar Year",
  });
}
