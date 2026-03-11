import { parseAttendanceScope } from "@/lib/companyReportsAttendance";
import { DEFAULT_COMPANY_SHIFTS } from "@/lib/companyShiftDefaults";
import { buildDailyAttendanceDecision } from "@/lib/attendancePolicy";
import { shiftDurationMinutes } from "@/lib/shiftWorkPolicy";

type AdminClientLike = {
  from: (table: string) => any;
};

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

function rawWorkedMinutes(checkInIso: string | null, checkOutIso: string | null) {
  if (!checkInIso || !checkOutIso) return 0;
  const diffMs = new Date(checkOutIso).getTime() - new Date(checkInIso).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.floor(diffMs / 60000);
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

  const [eventsResult, shiftResult, companyResult] = await Promise.all([
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
      .from("companies")
      .select("half_day_min_work_mins,late_penalty_enabled,late_penalty_up_to_mins,late_penalty_repeat_count,late_penalty_repeat_days,late_penalty_above_mins,late_penalty_above_days")
      .eq("id", params.companyId)
      .maybeSingle(),
  ]);

  if (eventsResult.error) return { ok: false as const, status: 400, error: eventsResult.error.message || "Unable to load attendance events." };
  if (shiftResult.error) return { ok: false as const, status: 400, error: shiftResult.error.message || "Unable to load shift rules." };
  if (companyResult.error) return { ok: false as const, status: 400, error: companyResult.error.message || "Unable to load company rules." };

  const events = Array.isArray(eventsResult.data) ? (eventsResult.data as EventRow[]) : [];
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
  }

  const latePolicy = {
    enabled: companyResult.data?.late_penalty_enabled === true,
    upToMins: Number(companyResult.data?.late_penalty_up_to_mins || 30),
    repeatCount: Number(companyResult.data?.late_penalty_repeat_count || 3),
    repeatDays: Number(companyResult.data?.late_penalty_repeat_days || 1),
    aboveMins: Number(companyResult.data?.late_penalty_above_mins || 30),
    aboveDays: Number(companyResult.data?.late_penalty_above_days || 0.5),
  };

  const employeeLateMap = new Map<string, { upTo: number; above: number }>();

  for (const [key, bucket] of groupedByDay.entries()) {
    const employeeId = key.split(":")[0];
    const employee = employeesById.get(employeeId);
    if (!employee) continue;
    const ordered = [...bucket].sort((a, b) => {
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
    const shiftConfig = findShiftConfig(shift, effectiveShiftRows);
    const scheduledMinutes = shiftConfig ? shiftDurationMinutes(shiftConfig.start, shiftConfig.end) : null;
    const decision = buildDailyAttendanceDecision({
      checkInIso,
      checkOutIso,
      timeZone,
      shiftStart: shiftConfig?.start || null,
      scheduledMinutes,
      graceMins: shiftConfig?.graceMins || 10,
      halfDayMinWorkMins: Number(companyResult.data?.half_day_min_work_mins || 240),
    });

    if (decision.lateMinutes <= 0) continue;
    const current = employeeLateMap.get(employeeId) || { upTo: 0, above: 0 };
    if (decision.lateMinutes <= latePolicy.upToMins) current.upTo += 1;
    if (decision.lateMinutes > latePolicy.aboveMins) current.above += 1;
    employeeLateMap.set(employeeId, current);
  }

  const ruleApplied = latePolicy.enabled
    ? `Up to ${latePolicy.upToMins} min x ${latePolicy.repeatCount} = ${latePolicy.repeatDays} day, above ${latePolicy.aboveMins} min = ${latePolicy.aboveDays} day`
    : "Disabled";

  const rows = Array.from(employeeLateMap.entries()).map(([employeeId, late]) => {
    const employee = employeesById.get(employeeId);
    const totalLateCount = late.upTo + late.above;
    const repeatBlocks = Math.floor(late.upTo / Math.max(1, latePolicy.repeatCount));
    const penaltyDays = latePolicy.enabled ? repeatBlocks * latePolicy.repeatDays + late.above * latePolicy.aboveDays : 0;
    return {
      id: employeeId,
      employee: employee?.full_name?.trim() || "Unknown",
      employeeCode: employee?.employee_code?.trim() || "",
      department: employee?.department?.trim() || "-",
      shift: employee?.shift_name?.trim() || "General",
      lateCount: totalLateCount,
      lateUpToCount: late.upTo,
      lateAboveCount: late.above,
      penaltyDays: Number(penaltyDays.toFixed(1)),
      ruleApplied,
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
