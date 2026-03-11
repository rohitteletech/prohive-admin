import { NextRequest, NextResponse } from "next/server";
import { INDIA_TIME_ZONE, isoDateInIndia, normalizeTimeZoneToIndia } from "@/lib/dateTime";
import { getMobileSessionContext } from "@/lib/mobileSession";
import { DEFAULT_COMPANY_SHIFTS } from "@/lib/companyShiftDefaults";
import {
  applyExtraHoursPolicy,
  findMatchingShiftRule,
  normalizeExtraHoursPolicy,
  normalizeLoginAccessRule,
  shiftDurationMinutes,
  timeToMinutes,
} from "@/lib/shiftWorkPolicy";

function normalizeTimeZone(value: unknown) {
  return normalizeTimeZoneToIndia(value);
}

function currentDateInTimeZone(timeZone: string) {
  return isoDateInIndia(new Date().toISOString());
}

function buildQueryWindow(date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 1);
  end.setUTCDate(end.getUTCDate() + 2);
  return {
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
  };
}

function rawWorkMinutes(checkInIso: string | null, checkOutIso: string | null) {
  if (!checkInIso || !checkOutIso) return 0;
  const diffMs = new Date(checkOutIso).getTime() - new Date(checkInIso).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.floor(diffMs / 60000);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    employeeId?: string;
    companyId?: string;
    deviceId?: string;
    timeZone?: string;
  };

  const session = await getMobileSessionContext({
    employeeId: body.employeeId,
    companyId: body.companyId,
    deviceId: body.deviceId,
  });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const timeZone = normalizeTimeZone(body.timeZone || INDIA_TIME_ZONE);
  const today = currentDateInTimeZone(timeZone);
  const { fromIso, toIso } = buildQueryWindow(today);

  const [employeeResult, companyResult, shiftResult, eventsResult] = await Promise.all([
    session.admin
      .from("employees")
      .select("full_name,employee_code,designation,shift_name")
      .eq("id", session.employee.id)
      .eq("company_id", session.employee.company_id)
      .maybeSingle(),
    session.admin
      .from("companies")
      .select("name,company_tagline,weekly_off_policy,allow_punch_on_holiday,allow_punch_on_weekly_off,extra_hours_policy,login_access_rule")
      .eq("id", session.employee.company_id)
      .maybeSingle(),
    session.admin
      .from("company_shift_definitions")
      .select("id,name,type,start_time,end_time,grace_mins,early_window_mins,min_work_before_out_mins,active")
      .eq("company_id", session.employee.company_id)
      .order("created_at", { ascending: true }),
    session.admin
      .from("attendance_punch_events")
      .select("punch_type,effective_punch_at,server_received_at,approval_status")
      .eq("company_id", session.employee.company_id)
      .eq("employee_id", session.employee.id)
      .neq("approval_status", "rejected")
      .gte("server_received_at", fromIso)
      .lt("server_received_at", toIso)
      .order("server_received_at", { ascending: true }),
  ]);

  if (employeeResult.error) {
    return NextResponse.json({ error: employeeResult.error.message || "Unable to load employee profile." }, { status: 400 });
  }
  if (companyResult.error) {
    return NextResponse.json({ error: companyResult.error.message || "Unable to load company profile." }, { status: 400 });
  }
  if (shiftResult.error) {
    return NextResponse.json({ error: shiftResult.error.message || "Unable to load shift configuration." }, { status: 400 });
  }
  if (eventsResult.error) {
    return NextResponse.json({ error: eventsResult.error.message || "Unable to load today attendance." }, { status: 400 });
  }

  const events = ((eventsResult.data || []) as Array<{
    punch_type: "in" | "out";
    effective_punch_at: string | null;
    server_received_at: string;
    approval_status: "auto_approved" | "pending_approval" | "approved" | "rejected";
  }>).filter((row) => {
    const punchAt = row.effective_punch_at || row.server_received_at;
    return punchAt ? isoDateInIndia(punchAt) === today : false;
  });

  const firstIn = events.find((row) => row.punch_type === "in") || null;
  const lastOut = [...events].reverse().find((row) => row.punch_type === "out") || null;
  const checkInAt = firstIn?.effective_punch_at || firstIn?.server_received_at || null;
  const checkOutAt = lastOut?.effective_punch_at || lastOut?.server_received_at || null;
  const currentStatus = checkInAt ? (checkOutAt ? "COMPLETED" : "PUNCHED_IN") : "NOT_PUNCHED_IN";
  const employeeShiftName = employeeResult.data?.shift_name || "General";

  const availableShifts = ((shiftResult.data || []) as Array<{
    id: string;
    name: string;
    type: string;
    start_time: string;
    end_time: string;
    grace_mins: number;
    early_window_mins: number;
    min_work_before_out_mins: number;
    active: boolean;
    }>)
    .filter((row) => row.active !== false)
    .map((row) => ({
      name: row.name,
      type: row.type,
      startTime: row.start_time,
      endTime: row.end_time,
      graceMins: Number(row.grace_mins || 0),
      earlyWindowMins: Number(row.early_window_mins || 0),
      minWorkBeforeOutMins: Number(row.min_work_before_out_mins || 0),
    }));

  const defaultShifts = DEFAULT_COMPANY_SHIFTS.map((row) => ({
    name: row.name,
    type: row.type,
    startTime: row.start,
    endTime: row.end,
    graceMins: row.graceMins,
    earlyWindowMins: row.earlyWindowMins,
    minWorkBeforeOutMins: row.minWorkBeforeOutMins,
  }));

  const shiftPool = availableShifts.length ? availableShifts : defaultShifts;
  const matchedShift = findMatchingShiftRule(employeeShiftName, shiftPool);
  const shiftStartMin = matchedShift ? timeToMinutes(matchedShift.startTime) || 600 : 600;
  const effectiveScheduledWorkMin = matchedShift ? shiftDurationMinutes(matchedShift.startTime, matchedShift.endTime) : null;
  const extraHoursPolicy = normalizeExtraHoursPolicy(companyResult.data?.extra_hours_policy);
  const loginAccessRule = normalizeLoginAccessRule(companyResult.data?.login_access_rule);
  const workingMinutes = applyExtraHoursPolicy(rawWorkMinutes(checkInAt, checkOutAt), effectiveScheduledWorkMin, extraHoursPolicy);

  return NextResponse.json({
    employee: {
      id: session.employee.id,
      employeeCode: employeeResult.data?.employee_code || session.employee.employee_code,
      fullName: employeeResult.data?.full_name || session.employee.full_name,
      designation: employeeResult.data?.designation || "",
      shiftName: employeeShiftName,
      companyName: companyResult.data?.name || "",
      companyTagline: companyResult.data?.company_tagline || "",
      company_tagline: companyResult.data?.company_tagline || "",
    },
    today: {
      date: today,
      status: currentStatus,
      punchInAt: checkInAt,
      punchOutAt: checkOutAt,
      workingMinutes,
    },
    config: {
      shiftName: employeeShiftName,
      shiftStartMin,
      graceMins: matchedShift?.graceMins || 10,
      earlyWindowMin: matchedShift?.earlyWindowMins || 15,
      minWorkBeforeOutMin: matchedShift?.minWorkBeforeOutMins || 60,
      scheduledWorkMin: effectiveScheduledWorkMin || 0,
      extraHoursPolicy,
      loginAccessRule,
      weeklyOffPolicy: companyResult.data?.weekly_off_policy || "sunday_only",
      allowPunchOnHoliday: companyResult.data?.allow_punch_on_holiday !== false,
      allowPunchOnWeeklyOff: companyResult.data?.allow_punch_on_weekly_off !== false,
    },
  });
}
