import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { resolveAttendancePolicyRuntime, resolveHolidayPolicyRuntime, resolveShiftPolicyRuntime } from "@/lib/companyPolicyRuntime";
import { resolvePoliciesForEmployees } from "@/lib/companyPoliciesServer";
import { INDIA_TIME_ZONE, normalizeTimeZoneToIndia } from "@/lib/dateTime";
import { DEFAULT_COMPANY_SHIFTS } from "@/lib/companyShiftDefaults";
import { applyExtraHoursPolicy, shiftDurationMinutes, timeToMinutes, workHoursLabel } from "@/lib/shiftWorkPolicy";
import {
  applyNonWorkingDayTreatment,
  buildAttendanceMetrics,
  buildDailyAttendanceDecision,
  resolveWorkedMinutesForAttendance,
  type NonWorkingDayTreatment,
} from "@/lib/attendancePolicy";
import { isWeeklyOffDate } from "@/lib/weeklyOff";

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

type AttendanceRow = {
  id: string;
  employee: string;
  department: string;
  shift: string;
  date: string;
  checkIn: string;
  checkInAddress: string;
  checkInLatLng: string;
  checkOut: string;
  checkOutAddress: string;
  checkOutLatLng: string;
  workHours: string;
  status: "present" | "late" | "half_day" | "absent" | "off_day_worked" | "manual_review";
  nonWorkingDayTreatment?: NonWorkingDayTreatment;
};

const APPROVED_STATUSES = ["auto_approved", "approved"];
const DEFAULT_SHIFT_GRACE_MINS = 10;

function normalizeDateParam(value: string | null) {
  const date = (value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizeTimeZone(value: string | null) {
  return normalizeTimeZoneToIndia(value);
}

function buildQueryWindow(date: string) {
  const [yearText, monthText] = date.split("-");
  const start = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, 1));
  const end = new Date(`${date}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 2);
  return {
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
  };
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

function latLngLabel(lat: number | null | undefined, lon: number | null | undefined) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "-";
  return `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
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

function aggregateRows(
  events: EventRow[],
  employeesById: Map<string, EmployeeLookupRow>,
  selectedDate: string,
  timeZone: string,
  shiftRows: Array<{ name: string; type: string; start: string; end: string; graceMins: number }>,
  resolvedPoliciesByEmployee: Map<string, { resolved: Record<string, any> }>,
  holidayDates: Set<string>
) {
  const grouped = new Map<string, EventRow[]>();

  events.forEach((event) => {
    const punchAt = event.effective_punch_at || event.server_received_at;
    if (!punchAt) return;
    if (isoDateInTimeZone(punchAt, timeZone) !== selectedDate) return;
    const employee = employeesById.get(event.employee_id);
    if (!employee?.id || employee.status === "inactive") return;

    const key = `${employee.id}:${selectedDate}`;
    const bucket = grouped.get(key) || [];
    bucket.push(event);
    grouped.set(key, bucket);
  });

  const preparedRows = Array.from(grouped.entries())
    .map(([key, bucket]) => {
      const ordered = [...bucket].sort((a, b) => {
        const left = new Date(a.effective_punch_at || a.server_received_at).getTime();
        const right = new Date(b.effective_punch_at || b.server_received_at).getTime();
        return left - right;
      });
      const employee = employeesById.get(ordered[0]?.employee_id || "");
      const shift = employee?.shift_name?.trim() || "General";
      const resolvedPolicies = employee ? resolvedPoliciesByEmployee.get(employee.id) : null;
      const firstIn = ordered.find((event) => event.punch_type === "in") || null;
      const lastOut = [...ordered].reverse().find((event) => event.punch_type === "out") || null;
      const checkInIso = firstIn?.effective_punch_at || firstIn?.server_received_at || null;
      const checkOutIso = lastOut?.effective_punch_at || lastOut?.server_received_at || null;
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
        : findShiftConfig(shift, shiftRows);
      const scheduledMinutes = shiftConfig ? shiftDurationMinutes(shiftConfig.start, shiftConfig.end) : null;
      const rawMinutes = resolveWorkedMinutesForAttendance({
        checkInIso,
        checkOutIso,
        scheduledMinutes,
        policy: resolvedAttendance,
      });
      const effectiveMinutes = applyExtraHoursPolicy(rawMinutes, scheduledMinutes, resolvedAttendance.extraHoursPolicy);
      const metrics = buildAttendanceMetrics({
        checkInIso,
        checkOutIso,
        timeZone,
        shiftStart: shiftConfig?.start || null,
        shiftEnd: shiftConfig?.end || null,
        scheduledMinutes,
        graceMins: shiftConfig?.graceMins ?? DEFAULT_SHIFT_GRACE_MINS,
        halfDayMinWorkMins: resolvedShift.halfDayMinWorkMins,
      });
      const isHoliday = holidayDates.has(selectedDate);
      const isWeeklyOff = !isHoliday && isWeeklyOffDate(selectedDate, resolvedHoliday.weeklyOffPolicy);
      return {
        id: key,
        employeeId: employee?.id || "",
        localDate: selectedDate,
        employee: employee?.full_name?.trim() || employee?.employee_code?.trim() || "Unknown Employee",
        department: employee?.department?.trim() || "-",
        shift: shiftConfig?.name || resolvedShift.shiftName || shift,
        date: displayDateInTimeZone(checkInIso || checkOutIso || ordered[0].server_received_at, timeZone),
        checkIn: checkInIso ? displayTimeInTimeZone(checkInIso, timeZone) : "-",
        checkInAddress: firstIn?.address_text?.trim() || "-",
        checkInLatLng: firstIn ? latLngLabel(firstIn.lat, firstIn.lon) : "-",
        checkOut: checkOutIso ? displayTimeInTimeZone(checkOutIso, timeZone) : "-",
        checkOutAddress: lastOut?.address_text?.trim() || "-",
        checkOutLatLng: lastOut ? latLngLabel(lastOut.lat, lastOut.lon) : "-",
        workHours: effectiveMinutes > 0 ? workHoursLabel(effectiveMinutes) : "-",
        shiftStart: shiftConfig?.start || null,
        shiftEnd: shiftConfig?.end || null,
        graceMins: shiftConfig?.graceMins ?? DEFAULT_SHIFT_GRACE_MINS,
        scheduledMinutes,
        halfDayMinWorkMins: resolvedShift.halfDayMinWorkMins,
        metrics,
        attendancePolicy: resolvedAttendance,
        checkInIso,
        checkOutIso,
        dayType: isHoliday ? ("holiday" as const) : isWeeklyOff ? ("weekly_off" as const) : null,
        nonWorkingDayTreatment:
          isHoliday
            ? (resolvedHoliday.holidayWorkedStatus as NonWorkingDayTreatment)
            : isWeeklyOff
              ? (resolvedHoliday.weeklyOffWorkedStatus as NonWorkingDayTreatment)
              : null,
      };
    })
    .sort((a, b) => a.employee.localeCompare(b.employee));

  const groupedByEmployeeMonth = new Map<string, typeof preparedRows>();
  for (const row of preparedRows) {
    const monthKey = row.localDate.slice(0, 7);
    const key = `${row.employeeId}:${monthKey}`;
    const bucket = groupedByEmployeeMonth.get(key) || [];
    bucket.push(row);
    groupedByEmployeeMonth.set(key, bucket);
  }

  const resolvedRows: AttendanceRow[] = [];
  for (const bucket of groupedByEmployeeMonth.values()) {
    bucket.sort((a, b) => a.localDate.localeCompare(b.localDate) || a.employee.localeCompare(b.employee));
    let lateCycleCount = 0;
    let earlyCycleCount = 0;
    for (const row of bucket) {
      const qualifiesLateWithinLimit =
        row.metrics.lateMinutes > 0 &&
        row.metrics.lateMinutes <= row.attendancePolicy.latePunchUpToMinutes;
      const qualifiesEarlyWithinLimit =
        row.metrics.earlyGoMinutes > 0 &&
        row.metrics.earlyGoMinutes <= row.attendancePolicy.earlyGoUpToMinutes;

      if (qualifiesLateWithinLimit) lateCycleCount += 1;
      if (qualifiesEarlyWithinLimit) earlyCycleCount += 1;

      const baseDecision = buildDailyAttendanceDecision({
        checkInIso: row.checkInIso,
        checkOutIso: row.checkOutIso,
        timeZone,
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
        treatment: row.nonWorkingDayTreatment,
      });

      if (baseDecision.appliedRuleCode === "repeat_late") lateCycleCount = 0;
      if (baseDecision.appliedRuleCode === "repeat_early_go") earlyCycleCount = 0;

      if (row.localDate === selectedDate) {
        resolvedRows.push({
          id: row.id,
          employee: row.employee,
          department: row.department,
          shift: row.shift,
          date: row.date,
          checkIn: row.checkIn,
          checkInAddress: row.checkInAddress,
          checkInLatLng: row.checkInLatLng,
          checkOut: row.checkOut,
          checkOutAddress: row.checkOutAddress,
          checkOutLatLng: row.checkOutLatLng,
          workHours: row.workHours,
          status: decision.status,
          nonWorkingDayTreatment: treatmentLabel || undefined,
        });
      }
    }
  }

  return resolvedRows.sort((a, b) => a.employee.localeCompare(b.employee));
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const context = await getCompanyAdminContext(token, {
      companyIdHint: req.headers.get("x-company-id") || req.cookies.get("prohive_company_id")?.value || "",
    });
    if (!context.ok) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const date = normalizeDateParam(req.nextUrl.searchParams.get("date"));
    if (!date) {
      return NextResponse.json({ error: "Valid date is required." }, { status: 400 });
    }

    const timeZone = normalizeTimeZone(req.nextUrl.searchParams.get("timeZone") || INDIA_TIME_ZONE);
    const { fromIso, toIso } = buildQueryWindow(date);

    const [eventsResult, shiftResult, holidayResult] = await Promise.all([
      context.admin
        .from("attendance_punch_events")
        .select("id,employee_id,punch_type,address_text,lat,lon,effective_punch_at,server_received_at")
        .eq("company_id", context.companyId)
        .in("approval_status", APPROVED_STATUSES)
        .gte("effective_punch_at", fromIso)
        .lt("effective_punch_at", toIso)
        .order("effective_punch_at", { ascending: true }),
      context.admin
        .from("company_shift_definitions")
        .select("name,type,start_time,end_time,grace_mins,active")
        .eq("company_id", context.companyId)
        .order("created_at", { ascending: true }),
      context.admin.from("company_holidays").select("holiday_date").eq("company_id", context.companyId).eq("holiday_date", date),
    ]);

    if (eventsResult.error) {
      return NextResponse.json({ error: eventsResult.error.message || "Unable to load attendance." }, { status: 400 });
    }
    if (shiftResult.error) {
      return NextResponse.json({ error: shiftResult.error.message || "Unable to load shift rules." }, { status: 400 });
    }
    if (holidayResult.error) {
      return NextResponse.json({ error: holidayResult.error.message || "Unable to load holiday markers." }, { status: 400 });
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
      const { data: employeeRows, error: employeeError } = await context.admin
        .from("employees")
        .select("id,full_name,employee_code,department,shift_name,status")
        .eq("company_id", context.companyId)
        .in("id", employeeIds);

      if (employeeError) {
        return NextResponse.json({ error: employeeError.message || "Unable to load employee details." }, { status: 400 });
      }

      for (const row of (employeeRows || []) as EmployeeLookupRow[]) {
        if (row?.id) employeesById.set(row.id, row);
      }
    }

    const resolvedPoliciesByEmployee = await resolvePoliciesForEmployees(
      context.admin,
      context.companyId,
      Array.from(employeesById.values()).map((row) => ({
        id: row.id,
        department: row.department,
        shiftName: row.shift_name,
      })),
      date,
      ["shift", "attendance", "holiday_weekoff"],
    );

    const rows = aggregateRows(
      events,
      employeesById,
      date,
      timeZone,
      effectiveShiftRows,
      resolvedPoliciesByEmployee,
      new Set(((holidayResult.data || []) as Array<{ holiday_date: string }>).map((row) => row.holiday_date))
    );
    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected attendance error.";
    return NextResponse.json({ error: `Attendance route crashed: ${message}` }, { status: 500 });
  }
}
