import { parseAttendanceScope } from "@/lib/companyReportsAttendance";
import { resolveAttendancePolicyRuntime, resolveHolidayPolicyRuntime, resolveShiftPolicyRuntime } from "@/lib/companyPolicyRuntime";
import { resolvePoliciesForEmployees } from "@/lib/companyPoliciesServer";
import { DEFAULT_COMPANY_SHIFTS } from "@/lib/companyShiftDefaults";
import { buildAttendanceMetrics, buildDailyAttendanceDecision } from "@/lib/attendancePolicy";
import { shiftDurationMinutes } from "@/lib/shiftWorkPolicy";
import { isWeeklyOffDate } from "@/lib/weeklyOff";
import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClientLike = Pick<SupabaseClient, "from">;

type EventRow = {
  employee_id: string;
  punch_type: "in" | "out";
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

export type LatePenaltyReportRow = {
  id: string;
  employee: string;
  employeeCode: string;
  department: string;
  shift: string;
  lateCount: number;
  lateUpToCount: number;
  lateAboveCount: number;
  penaltyDays: number;
  ruleApplied: string;
};

export type LatePenaltyReportInput = {
  mode?: string;
  monthKey?: string;
  startDate?: string;
  endDate?: string;
  employeeQuery?: string;
  department?: string;
  status?: string;
  timeZone?: string;
};

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
  };
}

function isoDateInTimeZone(iso: string, timeZone: string) {
  const parts = partsInTimeZone(iso, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizeText(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function findShiftConfig(
  shiftName: string,
  shiftRows: Array<{ name: string; type: string; start: string; end: string; graceMins: number }>
) {
  const normalized = normalizeText(shiftName);
  return (
    shiftRows.find((row) => {
      const name = normalizeText(row.name);
      const type = normalizeText(row.type);
      return normalized ? normalized === name || normalized === type : false;
    }) ||
    shiftRows.find((row) => normalizeText(row.name) === "general") ||
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

function buildLateRuleLabel(policy: ReturnType<typeof resolveAttendancePolicyRuntime>) {
  if (policy.latePunchRule !== "enforce_penalty") return "Flag Only";
  return `Up to ${policy.latePunchUpToMinutes} min x ${policy.repeatLateDaysInMonth} free, next = ${policy.dayCountForRepeatLate} day; above ${policy.latePunchAboveMinutes} min = ${policy.dayCountForLateAboveLimit} day`;
}

export async function getLatePenaltyReportData(params: {
  admin: AdminClientLike;
  companyId: string;
  input: LatePenaltyReportInput;
}) {
  const scope = parseAttendanceScope(params.input);
  if (!scope.ok) {
    return { ok: false as const, status: 400, error: scope.error };
  }

  const timeZone = params.input.timeZone || "Asia/Kolkata";
  const employeeQuery = String(params.input.employeeQuery || "").trim().toLowerCase();
  const departmentFilter = String(params.input.department || "all").trim().toLowerCase();
  const statusFilter = String(params.input.status || "all").trim().toLowerCase();
  const { fromIso, toIso } = buildQueryWindow(scope.startDate, scope.endDate);

  const [eventsResult, shiftResult, holidayResult] = await Promise.all([
    params.admin
      .from("attendance_punch_events")
      .select("employee_id,punch_type,effective_punch_at,server_received_at,approval_status")
      .eq("company_id", params.companyId)
      .in("approval_status", ["auto_approved", "approved"])
      .gte("effective_punch_at", fromIso)
      .lt("effective_punch_at", toIso)
      .order("effective_punch_at", { ascending: true }),
    params.admin
      .from("company_shift_definitions")
      .select("name,type,start_time,end_time,grace_mins,active")
      .eq("company_id", params.companyId)
      .order("created_at", { ascending: true }),
    params.admin
      .from("company_holidays")
      .select("holiday_date")
      .eq("company_id", params.companyId)
      .gte("holiday_date", scope.startDate)
      .lte("holiday_date", scope.endDate),
  ]);

  if (eventsResult.error) return { ok: false as const, status: 400, error: eventsResult.error.message || "Unable to load attendance events." };
  if (shiftResult.error) return { ok: false as const, status: 400, error: shiftResult.error.message || "Unable to load shift rules." };
  if (holidayResult.error) return { ok: false as const, status: 400, error: holidayResult.error.message || "Unable to load holiday markers." };

  const events = Array.isArray(eventsResult.data) ? (eventsResult.data as EventRow[]) : [];
  const holidayDates = new Set(((holidayResult.data || []) as Array<{ holiday_date: string }>).map((row) => row.holiday_date));
  const employeeIds = Array.from(new Set(events.map((row) => row.employee_id).filter(Boolean)));
  const employeesById = new Map<string, EmployeeLookupRow>();

  if (employeeIds.length > 0) {
    const { data: employeeRows, error: employeeError } = await params.admin
      .from("employees")
      .select("id,full_name,employee_code,department,shift_name,status")
      .eq("company_id", params.companyId)
      .in("id", employeeIds);

    if (employeeError) return { ok: false as const, status: 400, error: employeeError.message || "Unable to load employees." };
    for (const row of (employeeRows || []) as EmployeeLookupRow[]) {
      if (row?.id) employeesById.set(row.id, row);
    }
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

  const groupedByDay = new Map<string, EventRow[]>();
  const employeeContextsByDate = new Map<
    string,
    Map<string, { id: string; department: string | null; shiftName: string | null }>
  >();
  for (const event of events) {
    const punchAt = event.effective_punch_at || event.server_received_at;
    if (!punchAt) continue;
    const employee = employeesById.get(event.employee_id);
    if (!employee?.id || employee.status === "inactive") continue;
    const localDate = isoDateInTimeZone(punchAt, timeZone);
    const key = `${employee.id}:${localDate}`;
    const bucket = groupedByDay.get(key) || [];
    bucket.push(event);
    groupedByDay.set(key, bucket);

    const byDate = employeeContextsByDate.get(localDate) || new Map<string, { id: string; department: string | null; shiftName: string | null }>();
    if (!byDate.has(employee.id)) {
      byDate.set(employee.id, {
        id: employee.id,
        department: employee.department,
        shiftName: employee.shift_name,
      });
      employeeContextsByDate.set(localDate, byDate);
    }
  }

  const resolvedPoliciesByDate = new Map<string, Awaited<ReturnType<typeof resolvePoliciesForEmployees>>>();
  await Promise.all(
    Array.from(employeeContextsByDate.entries()).map(async ([localDate, contextsByEmployee]) => {
      const resolved = await resolvePoliciesForEmployees(
        params.admin as never,
        params.companyId,
        Array.from(contextsByEmployee.values()),
        localDate,
        ["shift", "attendance", "holiday_weekoff"],
      );
      resolvedPoliciesByDate.set(localDate, resolved);
    }),
  );

  const groupedByEmployeeMonth = new Map<string, Array<{ employeeId: string; localDate: string; bucket: EventRow[] }>>();
  for (const [key, bucket] of groupedByDay.entries()) {
    const [employeeId, localDate] = key.split(":");
    const monthKey = localDate.slice(0, 7);
    const employeeMonthKey = `${employeeId}:${monthKey}`;
    const rows = groupedByEmployeeMonth.get(employeeMonthKey) || [];
    rows.push({ employeeId, localDate, bucket });
    groupedByEmployeeMonth.set(employeeMonthKey, rows);
  }

  const employeeLateMap = new Map<string, { upTo: number; above: number; penaltyDays: number }>();
  const employeeShiftLabelMap = new Map<string, Set<string>>();
  const employeeRuleLabelsMap = new Map<string, Set<string>>();

  for (const monthBucket of groupedByEmployeeMonth.values()) {
    monthBucket.sort((left, right) => left.localDate.localeCompare(right.localDate));
    let lateCycleCount = 0;

    for (const row of monthBucket) {
      const employee = employeesById.get(row.employeeId);
      if (!employee) continue;
      const resolvedPolicies = resolvedPoliciesByDate.get(row.localDate)?.get(row.employeeId);
      const ordered = [...row.bucket].sort((a, b) => {
        const left = new Date(a.effective_punch_at || a.server_received_at).getTime();
        const right = new Date(b.effective_punch_at || b.server_received_at).getTime();
        return left - right;
      });
      const firstIn = ordered.find((event) => event.punch_type === "in") || null;
      if (!firstIn) continue;
      const lastOut = [...ordered].reverse().find((event) => event.punch_type === "out") || null;
      const checkInIso = firstIn.effective_punch_at || firstIn.server_received_at || null;
      const checkOutIso = lastOut?.effective_punch_at || lastOut?.server_received_at || null;
      const shift = employee.shift_name?.trim() || "General";
      const resolvedShift = resolveShiftPolicyRuntime(resolvedPolicies?.resolved?.shift || null, {
        shiftName: shift,
      });
      const resolvedAttendance = resolveAttendancePolicyRuntime(resolvedPolicies?.resolved?.attendance || null);
      const resolvedHoliday = resolveHolidayPolicyRuntime(resolvedPolicies?.resolved?.holiday_weekoff || null);
      const shiftConfig = resolvedPolicies?.resolved?.shift
        ? {
            name: resolvedShift.shiftName,
            type: resolvedShift.shiftType,
            start: resolvedShift.shiftStartTime,
            end: resolvedShift.shiftEndTime,
            graceMins: resolvedShift.gracePeriod,
          }
        : findShiftConfig(shift, effectiveShiftRows);
      const scheduledMinutes = shiftConfig ? shiftDurationMinutes(shiftConfig.start, shiftConfig.end) : null;
      const metrics = buildAttendanceMetrics({
        checkInIso,
        checkOutIso,
        timeZone,
        shiftStart: shiftConfig?.start || null,
        shiftEnd: shiftConfig?.end || null,
        scheduledMinutes,
        graceMins: shiftConfig?.graceMins || resolvedShift.gracePeriod || 10,
        halfDayMinWorkMins: resolvedShift.halfDayMinWorkMins,
      });
      const isHoliday = holidayDates.has(row.localDate);
      const isWeeklyOff = !isHoliday && isWeeklyOffDate(row.localDate, resolvedHoliday.weeklyOffPolicy);
      if (isHoliday || isWeeklyOff) continue;
      const qualifiesLateWithinLimit =
        metrics.lateMinutes > 0 && metrics.lateMinutes <= Math.max(0, resolvedAttendance.latePunchUpToMinutes || 0);
      if (qualifiesLateWithinLimit) lateCycleCount += 1;

      const decision = buildDailyAttendanceDecision({
        checkInIso,
        checkOutIso,
        timeZone,
        shiftStart: shiftConfig?.start || null,
        shiftEnd: shiftConfig?.end || null,
        scheduledMinutes,
        graceMins: shiftConfig?.graceMins || resolvedShift.gracePeriod || 10,
        halfDayMinWorkMins: resolvedShift.halfDayMinWorkMins,
        policy: resolvedAttendance,
        lateCycleOccurrenceCount: qualifiesLateWithinLimit ? lateCycleCount : 0,
      });

      if (decision.lateMinutes <= 0) continue;

      const current = employeeLateMap.get(row.employeeId) || { upTo: 0, above: 0, penaltyDays: 0 };
      if (decision.lateMinutes <= Math.max(0, resolvedAttendance.latePunchUpToMinutes || 0)) current.upTo += 1;
      if (decision.lateMinutes > Math.max(0, resolvedAttendance.latePunchAboveMinutes || 0)) current.above += 1;
      if (resolvedAttendance.latePunchRule === "enforce_penalty") {
        if (decision.appliedRuleCode === "repeat_late") {
          current.penaltyDays += resolvedAttendance.dayCountForRepeatLate;
        } else if (decision.appliedRuleCode === "late_above_limit") {
          current.penaltyDays += resolvedAttendance.dayCountForLateAboveLimit;
        }
      }
      employeeLateMap.set(row.employeeId, current);

      const shiftLabels = employeeShiftLabelMap.get(row.employeeId) || new Set<string>();
      shiftLabels.add(shiftConfig?.name || resolvedShift.shiftName || shift);
      employeeShiftLabelMap.set(row.employeeId, shiftLabels);

      const ruleLabels = employeeRuleLabelsMap.get(row.employeeId) || new Set<string>();
      ruleLabels.add(buildLateRuleLabel(resolvedAttendance));
      employeeRuleLabelsMap.set(row.employeeId, ruleLabels);

      if (decision.resetLateCycle) lateCycleCount = 0;
    }
  }

  const rows = Array.from(employeeLateMap.entries()).map(([employeeId, late]) => {
    const employee = employeesById.get(employeeId);
    const totalLateCount = late.upTo + late.above;
    const shiftLabels = Array.from(employeeShiftLabelMap.get(employeeId) || []);
    const ruleLabels = Array.from(employeeRuleLabelsMap.get(employeeId) || []);
    return {
      id: employeeId,
      employee: employee?.full_name?.trim() || "Unknown",
      employeeCode: employee?.employee_code?.trim() || "",
      department: employee?.department?.trim() || "-",
      shift: shiftLabels.length === 0 ? employee?.shift_name?.trim() || "General" : shiftLabels.length === 1 ? shiftLabels[0] : "Multiple Shifts",
      lateCount: totalLateCount,
      lateUpToCount: late.upTo,
      lateAboveCount: late.above,
      penaltyDays: Number(late.penaltyDays.toFixed(1)),
      ruleApplied: ruleLabels.length === 0 ? "Flag Only" : ruleLabels.length === 1 ? ruleLabels[0] : "Mixed Rules In Range",
    } satisfies LatePenaltyReportRow;
  });

  const filteredRows = rows.filter((row) => {
    const matchesEmployee = employeeQuery
      ? `${row.employee} ${row.employeeCode} ${row.department} ${row.shift}`.toLowerCase().includes(employeeQuery)
      : true;
    const matchesDepartment = departmentFilter === "all" ? true : row.department.trim().toLowerCase() === departmentFilter;
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "with_penalty"
          ? row.penaltyDays > 0
          : statusFilter === "late_only"
            ? row.lateCount > 0
            : row.penaltyDays <= 0;
    return matchesEmployee && matchesDepartment && matchesStatus;
  });

  return {
    ok: true as const,
    scope: { startDate: scope.startDate, endDate: scope.endDate },
    rows: filteredRows,
    summary: {
      total: filteredRows.length,
      totalLateMarks: filteredRows.reduce((sum, row) => sum + row.lateCount, 0),
      totalLateUpTo: filteredRows.reduce((sum, row) => sum + row.lateUpToCount, 0),
      totalLateAbove: filteredRows.reduce((sum, row) => sum + row.lateAboveCount, 0),
      totalPenaltyDays: Number(filteredRows.reduce((sum, row) => sum + row.penaltyDays, 0).toFixed(1)),
    },
  };
}

function csvEscape(value: string | number) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

export function toLatePenaltyCsv(rows: LatePenaltyReportRow[]) {
  const headers = [
    "Employee",
    "Employee Code",
    "Department",
    "Shift",
    "Late Count",
    "Late Up To Count",
    "Late Above Count",
    "Penalty Days",
    "Rule Applied",
  ];
  const lines = rows.map((row) =>
    [
      row.employee,
      row.employeeCode,
      row.department,
      row.shift,
      row.lateCount,
      row.lateUpToCount,
      row.lateAboveCount,
      row.penaltyDays,
      row.ruleApplied,
    ].map(csvEscape).join(",")
  );
  return [headers.join(","), ...lines].join("\n");
}
