import { isoDateInIndia } from "@/lib/dateTime";
import { isWeeklyOffDate, type WeeklyOffPolicy } from "@/lib/weeklyOff";
import type { NonWorkingDayTreatment } from "@/lib/attendancePolicy";

export type LeaveAccrualMode = "monthly" | "upfront";

export function normalizeAccrualMode(value: unknown): LeaveAccrualMode {
  return value === "upfront" ? "upfront" : "monthly";
}

export function monthsElapsedInYear(isoDate: string) {
  const month = Number(String(isoDate || "").slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) return 12;
  return month;
}

export function accruedAnnualQuota(annualQuota: number, accrualMode: LeaveAccrualMode, asOfIsoDate: string) {
  const quota = Number.isFinite(annualQuota) ? Math.max(Number(annualQuota), 0) : 0;
  if (accrualMode === "upfront") return quota;
  const elapsed = monthsElapsedInYear(asOfIsoDate);
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
  const start = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return "";
  start.setUTCDate(start.getUTCDate() + days);
  return start.toISOString().slice(0, 10);
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

export async function fetchCompOffEarnedDays(params: {
  admin: any;
  companyId: string;
  employeeId: string;
  asOfIsoDate: string;
  weeklyOffPolicy: WeeklyOffPolicy;
  holidayWorkedStatus: NonWorkingDayTreatment;
  weeklyOffWorkedStatus: NonWorkingDayTreatment;
  compOffValidityDays: number;
}) {
  const grantsOnHoliday = params.holidayWorkedStatus === "Grant Comp Off";
  const grantsOnWeeklyOff = params.weeklyOffWorkedStatus === "Grant Comp Off";
  const validityDays = Math.max(Number(params.compOffValidityDays || 0), 0);

  if ((!grantsOnHoliday && !grantsOnWeeklyOff) || validityDays <= 0) {
    return { earnedDates: new Set<string>(), earnedDays: 0, error: null as string | null };
  }

  const rangeStart = addDaysToIsoDate(params.asOfIsoDate, -validityDays);
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
    if (holidayDates.has(isoDate)) {
      if (grantsOnHoliday) earnedDates.add(isoDate);
      return;
    }
    if (grantsOnWeeklyOff && isWeeklyOffDate(isoDate, params.weeklyOffPolicy)) {
      earnedDates.add(isoDate);
    }
  });

  return { earnedDates, earnedDays: roundLeaveDays(earnedDates.size), error: null as string | null };
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
}) {
  const annualAccrued = accruedAnnualQuota(params.annualQuota, params.accrualMode, params.asOfIsoDate);
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

export async function fetchLeaveUsageForYear(params: {
  admin: any;
  companyId: string;
  employeeId: string;
  leavePolicyCode: string;
  year: number;
}) {
  const yearStart = `${params.year}-01-01`;
  const yearNextStart = `${params.year + 1}-01-01`;
  const [leaveUsageResult, attendanceDatesResult] = await Promise.all([
    params.admin
    .from("employee_leave_requests")
    .select("from_date,to_date,days,paid_days,status")
    .eq("company_id", params.companyId)
    .eq("employee_id", params.employeeId)
    .eq("leave_policy_code", params.leavePolicyCode)
    .gte("from_date", yearStart)
    .lt("from_date", yearNextStart),
    fetchApprovedAttendanceDatesForYear({
      admin: params.admin,
      companyId: params.companyId,
      employeeId: params.employeeId,
      year: params.year,
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
  year: number;
}) {
  const { data, error } = await params.admin
    .from("employee_leave_balance_overrides")
    .select("extra_days")
    .eq("company_id", params.companyId)
    .eq("employee_id", params.employeeId)
    .eq("leave_policy_code", params.leavePolicyCode)
    .eq("year", params.year)
    .maybeSingle();
  if (error) return { overrideDays: 0, error: error.message || "Unable to load leave overrides." };
  return { overrideDays: roundLeaveDays(Number(data?.extra_days || 0)), error: null as string | null };
}
