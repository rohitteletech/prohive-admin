import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { INDIA_TIME_ZONE, normalizeTimeZoneToIndia } from "@/lib/dateTime";
import { DEFAULT_COMPANY_SHIFTS } from "@/lib/companyShifts";
import { applyExtraHoursPolicy, normalizeExtraHoursPolicy, shiftDurationMinutes, timeToMinutes, workHoursLabel } from "@/lib/shiftWorkPolicy";

type EventRow = {
  id: string;
  employee_id: string;
  punch_type: "in" | "out";
  address_text: string | null;
  lat: number;
  lon: number;
  effective_punch_at: string | null;
  server_received_at: string;
  employees?: {
    id?: string;
    full_name?: string | null;
    employee_code?: string | null;
    department?: string | null;
    shift_name?: string | null;
    status?: "active" | "inactive" | null;
  } | null;
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
  status: "present" | "late" | "absent";
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
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 1);
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

function localMinutesInTimeZone(iso: string, timeZone: string) {
  const parts = partsInTimeZone(iso, timeZone);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function latLngLabel(lat: number | null | undefined, lon: number | null | undefined) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "-";
  return `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
}

function rawWorkMinutes(checkInIso: string | null, checkOutIso: string | null) {
  if (!checkInIso || !checkOutIso) return 0;
  const diffMs = new Date(checkOutIso).getTime() - new Date(checkInIso).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.floor(diffMs / 60000);
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

function rowStatus(firstInIso: string | null, shiftName: string, timeZone: string, shiftRows: Array<{ name: string; type: string; start: string; end: string; graceMins: number }>): AttendanceRow["status"] {
  if (!firstInIso) return "absent";
  const actualMinutes = localMinutesInTimeZone(firstInIso, timeZone);
  const shift = findShiftConfig(shiftName, shiftRows);
  const shiftMinutes = shift ? timeToMinutes(shift.start) : null;
  if (actualMinutes === null || shiftMinutes === null) return "present";
  const grace = shift?.graceMins ?? DEFAULT_SHIFT_GRACE_MINS;
  return actualMinutes > shiftMinutes + grace ? "late" : "present";
}

function aggregateRows(
  events: EventRow[],
  selectedDate: string,
  timeZone: string,
  shiftRows: Array<{ name: string; type: string; start: string; end: string; graceMins: number }>,
  extraHoursPolicy: string
) {
  const grouped = new Map<string, EventRow[]>();

  events.forEach((event) => {
    const punchAt = event.effective_punch_at || event.server_received_at;
    if (!punchAt) return;
    if (isoDateInTimeZone(punchAt, timeZone) !== selectedDate) return;
    const employee = event.employees;
    if (!employee?.id || employee.status === "inactive") return;

    const key = `${employee.id}:${selectedDate}`;
    const bucket = grouped.get(key) || [];
    bucket.push(event);
    grouped.set(key, bucket);
  });

  return Array.from(grouped.entries())
    .map(([key, bucket]) => {
      const ordered = [...bucket].sort((a, b) => {
        const left = new Date(a.effective_punch_at || a.server_received_at).getTime();
        const right = new Date(b.effective_punch_at || b.server_received_at).getTime();
        return left - right;
      });
      const employee = ordered[0]?.employees;
      const shift = employee?.shift_name?.trim() || "General";
      const firstIn = ordered.find((event) => event.punch_type === "in") || null;
      const lastOut = [...ordered].reverse().find((event) => event.punch_type === "out") || null;
      const checkInIso = firstIn?.effective_punch_at || firstIn?.server_received_at || null;
      const checkOutIso = lastOut?.effective_punch_at || lastOut?.server_received_at || null;
      const shiftConfig = findShiftConfig(shift, shiftRows);
      const scheduledMinutes = shiftConfig ? shiftDurationMinutes(shiftConfig.start, shiftConfig.end) : null;
      const effectiveMinutes = applyExtraHoursPolicy(rawWorkMinutes(checkInIso, checkOutIso), scheduledMinutes, extraHoursPolicy);

      return {
        id: key,
        employee: employee?.full_name?.trim() || employee?.employee_code?.trim() || "Unknown Employee",
        department: employee?.department?.trim() || "-",
        shift,
        date: displayDateInTimeZone(checkInIso || checkOutIso || ordered[0].server_received_at, timeZone),
        checkIn: checkInIso ? displayTimeInTimeZone(checkInIso, timeZone) : "-",
        checkInAddress: firstIn?.address_text?.trim() || "-",
        checkInLatLng: firstIn ? latLngLabel(firstIn.lat, firstIn.lon) : "-",
        checkOut: checkOutIso ? displayTimeInTimeZone(checkOutIso, timeZone) : "-",
        checkOutAddress: lastOut?.address_text?.trim() || "-",
        checkOutLatLng: lastOut ? latLngLabel(lastOut.lat, lastOut.lon) : "-",
        workHours: effectiveMinutes > 0 ? workHoursLabel(effectiveMinutes) : "-",
        status: rowStatus(checkInIso, shift, timeZone, shiftRows),
      } satisfies AttendanceRow;
    })
    .sort((a, b) => a.employee.localeCompare(b.employee));
}

export async function GET(req: NextRequest) {
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

  const [eventsResult, shiftResult, companyResult] = await Promise.all([
    context.admin
      .from("attendance_punch_events")
      .select(
        "id,employee_id,punch_type,address_text,lat,lon,effective_punch_at,server_received_at"
        + ",employees(id,full_name,employee_code,department,shift_name,status)"
      )
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
    context.admin.from("companies").select("extra_hours_policy").eq("id", context.companyId).maybeSingle(),
  ]);

  if (eventsResult.error) {
    return NextResponse.json({ error: eventsResult.error.message || "Unable to load attendance." }, { status: 400 });
  }
  if (shiftResult.error) {
    return NextResponse.json({ error: shiftResult.error.message || "Unable to load shift rules." }, { status: 400 });
  }
  if (companyResult.error) {
    return NextResponse.json({ error: companyResult.error.message || "Unable to load extra hour policy." }, { status: 400 });
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
  const extraHoursPolicy = normalizeExtraHoursPolicy(companyResult.data?.extra_hours_policy);
  const rows = aggregateRows(
    Array.isArray(eventsResult.data) ? (eventsResult.data as unknown as EventRow[]) : [],
    date,
    timeZone,
    effectiveShiftRows,
    extraHoursPolicy
  );
  return NextResponse.json({ rows });
}
