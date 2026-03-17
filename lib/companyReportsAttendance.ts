import { INDIA_TIME_ZONE, normalizeTimeZoneToIndia } from "@/lib/dateTime";
import { resolveAttendancePolicyRuntime, resolveHolidayPolicyRuntime, resolveShiftPolicyRuntime } from "@/lib/companyPolicyRuntime";
import { resolvePoliciesForEmployees } from "@/lib/companyPoliciesServer";
import { DEFAULT_COMPANY_SHIFTS } from "@/lib/companyShiftDefaults";
import { fetchManualReviewResolutionMap } from "@/lib/manualReviewResolutions";
import {
  applyExtraHoursPolicy,
  normalizeExtraHoursPolicy,
  shiftDurationMinutes,
  workHoursLabel,
} from "@/lib/shiftWorkPolicy";
import { applyNonWorkingDayTreatment, buildAttendanceMetrics, buildDailyAttendanceDecision, calculateMonthlyLatePenalty, rawWorkedMinutes, type NonWorkingDayTreatment } from "@/lib/attendancePolicy";
import { isWeeklyOffDate } from "@/lib/weeklyOff";

type AdminClientLike = {
  from: (table: string) => any;
};

type EventRow = {
  id: string;
  employee_id: string;
  punch_type: "in" | "out";
  address_text: string | null;
  lat: number;
  lon: number;
  effective_punch_at: string | null;
  server_received_at: string;
};

type EmployeeLookupRow = {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  department: string | null;
  shift_name: string | null;
  status: "active" | "inactive" | null;
};

export type AttendanceReportRow = {
  id: string;
  employeeId: string;
  localDate: string;
  employee: string;
  department: string;
  shift: string;
  date: string;
  checkIn: string;
  checkOut: string;
  workHours: string;
  status: "present" | "late" | "half_day" | "absent" | "off_day_worked" | "manual_review";
  nonWorkingDayTreatment?: NonWorkingDayTreatment;
  dayType: "Working Day" | "Holiday" | "Weekly Off";
  payrollTreatment: string;
  presentCount: string;
  otEligible: "Yes" | "No";
  compOffGranted: "Yes" | "No";
  manualReviewRequired: "Yes" | "No";
};

type AttendanceReportRowWithLate = AttendanceReportRow & {
  lateMinutes: number;
};

export type AttendanceReportInput = {
  mode?: string;
  monthKey?: string;
  startDate?: string;
  endDate?: string;
  employeeQuery?: string;
  department?: string;
  status?: string;
  timeZone?: string;
};

const APPROVED_STATUSES = ["auto_approved", "approved"];
const DEFAULT_SHIFT_GRACE_MINS = 10;

function normalizeDateParam(value: string | null | undefined) {
  const date = (value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizeMonthKey(value: string | null | undefined) {
  const monthKey = (value || "").trim();
  return /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : null;
}

export function parseAttendanceScope(input: {
  mode?: string;
  monthKey?: string;
  startDate?: string;
  endDate?: string;
}) {
  if (input.mode === "date_range") {
    const startDate = normalizeDateParam(input.startDate);
    const endDate = normalizeDateParam(input.endDate);
    if (!startDate || !endDate) return { ok: false as const, error: "Valid date range is required." };
    if (endDate < startDate) return { ok: false as const, error: "End date cannot be before start date." };
    return { ok: true as const, startDate, endDate };
  }

  const monthKey = normalizeMonthKey(input.monthKey);
  if (!monthKey) return { ok: false as const, error: "Valid month is required." };
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  return { ok: true as const, startDate, endDate };
}

function normalizeTimeZone(value: string | null | undefined) {
  return normalizeTimeZoneToIndia(value || INDIA_TIME_ZONE);
}

function partsInTimeZone(iso: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(iso));
  const lookup = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
    hour: lookup("hour"),
    minute: lookup("minute"),
  };
}

function isoDateInTimeZone(iso: string, timeZone: string) {
  const parts = partsInTimeZone(iso, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function displayDateInTimeZone(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function displayTimeInTimeZone(iso: string, timeZone: string) {
  const parts = partsInTimeZone(iso, timeZone);
  return `${parts.hour}:${parts.minute}`;
}

function findShiftConfig(
  shiftName: string,
  shiftRows: Array<{ name: string; type: string; start: string; end: string; graceMins: number }>
) {
  const normalized = shiftName.trim().toLowerCase();
  return (
    shiftRows.find((row) => {
      const name = row.name.trim().toLowerCase();
      const type = row.type.trim().toLowerCase();
      return normalized ? normalized === name || normalized === type : false;
    }) ||
    shiftRows.find((row) => row.name.trim().toLowerCase() === "general") ||
    shiftRows[0]
  );
}

function buildQueryWindow(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 1);
  end.setUTCDate(end.getUTCDate() + 2);
  return {
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
  };
}

function presentCountForStatus(status: AttendanceReportRow["status"]) {
  if (status === "present" || status === "late") return "1";
  if (status === "half_day") return "0.5";
  return "0";
}

function payrollTreatmentLabel(params: {
  dayType: AttendanceReportRow["dayType"];
  treatment?: NonWorkingDayTreatment;
}) {
  if (params.dayType === "Working Day") return "Normal Day";
  return params.treatment || "Record Only";
}

function aggregateRows(params: {
  events: EventRow[];
  employeesById: Map<string, EmployeeLookupRow>;
  timeZone: string;
  shiftRows: Array<{ name: string; type: string; start: string; end: string; graceMins: number }>;
  extraHoursPolicy: string;
  halfDayMinWorkMins: number;
  latePenaltyPolicy: {
    enabled: boolean;
    upToMins: number;
    repeatCount: number;
    repeatDays: number;
    aboveMins: number;
    aboveDays: number;
  };
  resolvedPoliciesByEmployee: Map<string, { resolved: Record<string, any> }>;
  holidayDates: Set<string>;
  manualReviewResolutionsByEmployeeDate: Map<string, NonWorkingDayTreatment>;
}) {
  const grouped = new Map<string, EventRow[]>();

  for (const event of params.events) {
    const punchAt = event.effective_punch_at || event.server_received_at;
    if (!punchAt) continue;
    const localDate = isoDateInTimeZone(punchAt, params.timeZone);
    const employee = params.employeesById.get(event.employee_id);
    if (!employee?.id || employee.status === "inactive") continue;
    const key = `${employee.id}:${localDate}`;
    const bucket = grouped.get(key) || [];
    bucket.push(event);
    grouped.set(key, bucket);
  }

  const preparedRows = Array.from(grouped.entries())
    .map(([key, bucket]) => {
      const ordered = [...bucket].sort((a, b) => {
        const left = new Date(a.effective_punch_at || a.server_received_at).getTime();
        const right = new Date(b.effective_punch_at || b.server_received_at).getTime();
        return left - right;
      });
      const employee = params.employeesById.get(ordered[0]?.employee_id || "");
      const shift = employee?.shift_name?.trim() || "General";
      const resolvedPolicies = employee ? params.resolvedPoliciesByEmployee.get(employee.id) : null;
      const firstIn = ordered.find((event) => event.punch_type === "in") || null;
      const lastOut = [...ordered].reverse().find((event) => event.punch_type === "out") || null;
      const checkInIso = firstIn?.effective_punch_at || firstIn?.server_received_at || null;
      const checkOutIso = lastOut?.effective_punch_at || lastOut?.server_received_at || null;
      const resolvedShift = resolveShiftPolicyRuntime(resolvedPolicies?.resolved?.shift || null, {
        shiftName: shift,
        halfDayMinWorkMins: params.halfDayMinWorkMins,
      });
      const resolvedAttendance = resolveAttendancePolicyRuntime(resolvedPolicies?.resolved?.attendance || null, {
        extraHoursCountingRule: params.extraHoursPolicy,
      });
      const resolvedHoliday = resolveHolidayPolicyRuntime(resolvedPolicies?.resolved?.holiday_weekoff || null);
      const shiftConfig = resolvedPolicies?.resolved?.shift
        ? {
            name: resolvedShift.shiftName,
            type: resolvedShift.shiftType,
            start: resolvedShift.shiftStartTime,
            end: resolvedShift.shiftEndTime,
            graceMins: resolvedShift.gracePeriod,
          }
        : findShiftConfig(shift, params.shiftRows);
      const scheduledMinutes = shiftConfig ? shiftDurationMinutes(shiftConfig.start, shiftConfig.end) : null;
      const effectiveMinutes = applyExtraHoursPolicy(
        rawWorkedMinutes(checkInIso, checkOutIso),
        scheduledMinutes,
        resolvedAttendance.extraHoursPolicy
      );
      const localDate = key.split(":")[1] || "";
      const metrics = buildAttendanceMetrics({
        checkInIso,
        checkOutIso,
        timeZone: params.timeZone,
        shiftStart: shiftConfig?.start || null,
        shiftEnd: shiftConfig?.end || null,
        scheduledMinutes,
        graceMins: shiftConfig?.graceMins ?? DEFAULT_SHIFT_GRACE_MINS,
        halfDayMinWorkMins: resolvedShift.halfDayMinWorkMins || params.halfDayMinWorkMins,
      });
      const isHoliday = params.holidayDates.has(localDate);
      const isWeeklyOff = !isHoliday && isWeeklyOffDate(localDate, resolvedHoliday.weeklyOffPolicy);

      return {
        id: key,
        employeeId: employee?.id || "",
        localDate,
        employee: employee?.full_name?.trim() || employee?.employee_code?.trim() || "Unknown Employee",
        department: employee?.department?.trim() || "-",
        shift: shiftConfig?.name || resolvedShift.shiftName || shift,
        date: displayDateInTimeZone(checkInIso || checkOutIso || ordered[0].server_received_at, params.timeZone),
        checkIn: checkInIso ? displayTimeInTimeZone(checkInIso, params.timeZone) : "-",
        checkOut: checkOutIso ? displayTimeInTimeZone(checkOutIso, params.timeZone) : "-",
        workHours: effectiveMinutes > 0 ? workHoursLabel(effectiveMinutes) : "-",
        checkInIso,
        checkOutIso,
        shiftStart: shiftConfig?.start || null,
        shiftEnd: shiftConfig?.end || null,
        scheduledMinutes,
        graceMins: shiftConfig?.graceMins ?? DEFAULT_SHIFT_GRACE_MINS,
        halfDayMinWorkMins: resolvedShift.halfDayMinWorkMins || params.halfDayMinWorkMins,
        attendancePolicy: resolvedAttendance,
        metrics,
        dayType: isHoliday ? ("holiday" as const) : isWeeklyOff ? ("weekly_off" as const) : null,
        nonWorkingDayTreatment:
          isHoliday
            ? (resolvedHoliday.holidayWorkedStatus as NonWorkingDayTreatment)
            : isWeeklyOff
              ? (resolvedHoliday.weeklyOffWorkedStatus as NonWorkingDayTreatment)
              : null,
      };
    })
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.employee.localeCompare(b.employee);
    });

  const groupedByEmployeeMonth = new Map<string, typeof preparedRows>();
  for (const row of preparedRows) {
    const monthKey = row.localDate.slice(0, 7);
    const key = `${row.employeeId}:${monthKey}`;
    const bucket = groupedByEmployeeMonth.get(key) || [];
    bucket.push(row);
    groupedByEmployeeMonth.set(key, bucket);
  }

  const rows: AttendanceReportRowWithLate[] = [];
  for (const bucket of groupedByEmployeeMonth.values()) {
    bucket.sort((a, b) => a.localDate.localeCompare(b.localDate));
    let lateCycleCount = 0;
    let earlyCycleCount = 0;
    for (const row of bucket) {
      const qualifiesLateWithinLimit =
        row.metrics.lateMinutes > 0 && row.metrics.lateMinutes <= row.attendancePolicy.latePunchUpToMinutes;
      const qualifiesEarlyWithinLimit =
        row.metrics.earlyGoMinutes > 0 && row.metrics.earlyGoMinutes <= row.attendancePolicy.earlyGoUpToMinutes;
      if (qualifiesLateWithinLimit) lateCycleCount += 1;
      if (qualifiesEarlyWithinLimit) earlyCycleCount += 1;

      const baseDecision = buildDailyAttendanceDecision({
        checkInIso: row.checkInIso,
        checkOutIso: row.checkOutIso,
        timeZone: params.timeZone,
        shiftStart: row.shiftStart,
        shiftEnd: row.shiftEnd,
        scheduledMinutes: row.scheduledMinutes,
        graceMins: row.graceMins,
        halfDayMinWorkMins: row.halfDayMinWorkMins,
        policy: row.attendancePolicy,
        lateCycleOccurrenceCount: qualifiesLateWithinLimit ? lateCycleCount : 0,
        earlyGoCycleOccurrenceCount: qualifiesEarlyWithinLimit ? earlyCycleCount : 0,
      });
      const { decision, treatmentLabel } = applyNonWorkingDayTreatment({
        decision: baseDecision,
        dayType: row.dayType,
        treatment: params.manualReviewResolutionsByEmployeeDate.get(`${row.employeeId}:${row.localDate}`) || row.nonWorkingDayTreatment,
      });
      if (baseDecision.appliedRuleCode === "repeat_late") lateCycleCount = 0;
      if (baseDecision.appliedRuleCode === "repeat_early_go") earlyCycleCount = 0;

      rows.push({
        id: row.id,
        employeeId: row.employeeId,
        localDate: row.localDate,
        employee: row.employee,
        department: row.department,
        shift: row.shift,
        date: row.date,
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        workHours: row.workHours,
        status: decision.status,
        lateMinutes: decision.lateMinutes,
        nonWorkingDayTreatment: treatmentLabel || undefined,
        dayType: row.dayType === "holiday" ? "Holiday" : row.dayType === "weekly_off" ? "Weekly Off" : "Working Day",
        payrollTreatment: payrollTreatmentLabel({
          dayType: row.dayType === "holiday" ? "Holiday" : row.dayType === "weekly_off" ? "Weekly Off" : "Working Day",
          treatment: treatmentLabel || undefined,
        }),
        presentCount: presentCountForStatus(decision.status),
        otEligible: treatmentLabel === "OT Only" || treatmentLabel === "Present + OT" ? "Yes" : "No",
        compOffGranted: treatmentLabel === "Grant Comp Off" ? "Yes" : "No",
        manualReviewRequired: decision.status === "manual_review" ? "Yes" : "No",
      });
    }
  }

  const penalty = calculateMonthlyLatePenalty(
    rows.map((row) => row.lateMinutes || 0),
    params.latePenaltyPolicy
  );

  return {
    rows,
    penalty,
  };
}

export async function getAttendanceReportData(params: {
  admin: AdminClientLike;
  companyId: string;
  input: AttendanceReportInput;
}) {
  const scope = parseAttendanceScope(params.input);
  if (!scope.ok) {
    return { ok: false as const, status: 400, error: scope.error };
  }

  const timeZone = normalizeTimeZone(params.input.timeZone);
  const employeeQuery = String(params.input.employeeQuery || "").trim().toLowerCase();
  const departmentFilter = String(params.input.department || "all").trim().toLowerCase();
  const statusFilter = String(params.input.status || "all").trim().toLowerCase();
  const { fromIso, toIso } = buildQueryWindow(scope.startDate, scope.endDate);

  const [eventsResult, shiftResult, companyResult] = await Promise.all([
    params.admin
      .from("attendance_punch_events")
      .select("id,employee_id,punch_type,address_text,lat,lon,effective_punch_at,server_received_at")
      .eq("company_id", params.companyId)
      .in("approval_status", APPROVED_STATUSES)
      .gte("effective_punch_at", fromIso)
      .lt("effective_punch_at", toIso)
      .order("effective_punch_at", { ascending: true }),
    params.admin
      .from("company_shift_definitions")
      .select("name,type,start_time,end_time,grace_mins,active")
      .eq("company_id", params.companyId)
      .order("created_at", { ascending: true }),
    params.admin
      .from("companies")
      .select(
        "extra_hours_policy,half_day_min_work_mins,late_penalty_enabled,late_penalty_up_to_mins,late_penalty_repeat_count,late_penalty_repeat_days,late_penalty_above_mins,late_penalty_above_days"
      )
      .eq("id", params.companyId)
      .maybeSingle(),
  ]);

  if (eventsResult.error) {
    return { ok: false as const, status: 400, error: eventsResult.error.message || "Unable to load attendance events." };
  }
  if (shiftResult.error) {
    return { ok: false as const, status: 400, error: shiftResult.error.message || "Unable to load shift rules." };
  }
  if (companyResult.error) {
    return { ok: false as const, status: 400, error: companyResult.error.message || "Unable to load company rules." };
  }

  const shiftRows =
    ((shiftResult.data || []) as Array<{ name: string; type: string; start_time: string; end_time: string; grace_mins: number; active: boolean }>)
      .filter((row) => row.active !== false)
      .map((row) => ({
        name: row.name,
        type: row.type,
        start: row.start_time,
        end: row.end_time,
        graceMins: Number(row.grace_mins || 0),
      }));
  const effectiveShiftRows = shiftRows.length
    ? shiftRows
    : DEFAULT_COMPANY_SHIFTS.map((row) => ({
        name: row.name,
        type: row.type,
        start: row.start,
        end: row.end,
        graceMins: row.graceMins,
      }));

  const events = Array.isArray(eventsResult.data) ? (eventsResult.data as EventRow[]) : [];
  const employeeIds = Array.from(new Set(events.map((row) => row.employee_id).filter(Boolean)));
  const employeesById = new Map<string, EmployeeLookupRow>();

  if (employeeIds.length > 0) {
    const { data: employeeRows, error: employeeError } = await params.admin
      .from("employees")
      .select("id,full_name,employee_code,department,shift_name,status")
      .eq("company_id", params.companyId)
      .in("id", employeeIds);

    if (employeeError) {
      return { ok: false as const, status: 400, error: employeeError.message || "Unable to load employees." };
    }

    for (const row of (employeeRows || []) as EmployeeLookupRow[]) {
      if (row?.id) employeesById.set(row.id, row);
    }
  }

  const resolvedPoliciesByEmployee = await resolvePoliciesForEmployees(
    params.admin as never,
    params.companyId,
    Array.from(employeesById.values()).map((row) => ({
      id: row.id,
      department: row.department,
      shiftName: row.shift_name,
    })),
    scope.startDate,
    ["shift", "attendance", "holiday_weekoff"],
  );

  const { data: holidayRows, error: holidayError } = await params.admin
    .from("company_holidays")
    .select("holiday_date")
    .eq("company_id", params.companyId)
    .gte("holiday_date", scope.startDate)
    .lte("holiday_date", scope.endDate);

  if (holidayError) {
    return { ok: false as const, status: 400, error: holidayError.message || "Unable to load holiday markers." };
  }
  const manualResolutionResult = await fetchManualReviewResolutionMap({
    admin: params.admin,
    companyId: params.companyId,
    employeeIds,
    startDate: scope.startDate,
    endDate: scope.endDate,
  });
  if (manualResolutionResult.error) {
    return { ok: false as const, status: 400, error: manualResolutionResult.error };
  }

  const aggregation = aggregateRows({
    events,
    employeesById,
    timeZone,
    shiftRows: effectiveShiftRows,
    extraHoursPolicy: normalizeExtraHoursPolicy(companyResult.data?.extra_hours_policy),
    halfDayMinWorkMins: Number(companyResult.data?.half_day_min_work_mins || 240),
    latePenaltyPolicy: {
      enabled: companyResult.data?.late_penalty_enabled === true,
      upToMins: Number(companyResult.data?.late_penalty_up_to_mins || 30),
      repeatCount: Number(companyResult.data?.late_penalty_repeat_count || 3),
      repeatDays: Number(companyResult.data?.late_penalty_repeat_days || 1),
      aboveMins: Number(companyResult.data?.late_penalty_above_mins || 30),
      aboveDays: Number(companyResult.data?.late_penalty_above_days || 0.5),
    },
    resolvedPoliciesByEmployee,
    holidayDates: new Set(((holidayRows || []) as Array<{ holiday_date: string }>).map((row) => row.holiday_date)),
    manualReviewResolutionsByEmployeeDate: manualResolutionResult.byEmployeeDate,
  });
  const filteredRows = aggregation.rows.filter((row) => {
    const matchesEmployee = employeeQuery
      ? `${row.employee} ${row.department} ${row.shift}`.toLowerCase().includes(employeeQuery)
      : true;
    const matchesDepartment = departmentFilter === "all" ? true : row.department.trim().toLowerCase() === departmentFilter;
    const matchesStatus = statusFilter === "all" ? true : row.status === statusFilter;
    return matchesEmployee && matchesDepartment && matchesStatus;
  });
  const filteredPenalty = calculateMonthlyLatePenalty(
    filteredRows.map((row) => row.lateMinutes),
    {
      enabled: companyResult.data?.late_penalty_enabled === true,
      upToMins: Number(companyResult.data?.late_penalty_up_to_mins || 30),
      repeatCount: Number(companyResult.data?.late_penalty_repeat_count || 3),
      repeatDays: Number(companyResult.data?.late_penalty_repeat_days || 1),
      aboveMins: Number(companyResult.data?.late_penalty_above_mins || 30),
      aboveDays: Number(companyResult.data?.late_penalty_above_days || 0.5),
    }
  );
  const rows = filteredRows.map(({ lateMinutes, ...row }) => row);

  return {
    ok: true as const,
    scope: { startDate: scope.startDate, endDate: scope.endDate },
    rows,
    summary: {
      total: rows.length,
      present: rows.filter((row) => row.status === "present").length,
      late: rows.filter((row) => row.status === "late").length,
      halfDay: rows.filter((row) => row.status === "half_day").length,
      absent: rows.filter((row) => row.status === "absent").length,
      offDayWorked: rows.filter((row) => row.status === "off_day_worked").length,
      manualReview: rows.filter((row) => row.status === "manual_review").length,
      latePenaltyDays: filteredPenalty.penaltyDays,
    },
  };
}

export function toAttendanceCsv(rows: AttendanceReportRow[]) {
  const headers = [
    "Employee",
    "Department",
    "Shift",
    "Date",
    "Check In",
    "Check Out",
    "Work Hours",
    "Status",
    "Day Type",
    "Payroll Treatment",
    "Present Count",
    "OT Eligible",
    "Comp Off Granted",
    "Manual Review Required",
  ];
  const escape = (value: string) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((row) =>
      [
        row.employee,
        row.department,
        row.shift,
        row.date,
        row.checkIn,
        row.checkOut,
        row.workHours,
        row.status,
        row.dayType,
        row.payrollTreatment,
        row.presentCount,
        row.otEligible,
        row.compOffGranted,
        row.manualReviewRequired,
      ].map(escape).join(",")
    ),
  ];
  return lines.join("\r\n");
}
