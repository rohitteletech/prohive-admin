import { NextRequest, NextResponse } from "next/server";
import { INDIA_TIME_ZONE, isoDateInIndia, normalizeTimeZoneToIndia } from "@/lib/dateTime";
import { getMobileSessionContext } from "@/lib/mobileSession";
import { buildCompanyLogoUrl, resolveRequestOrigin } from "@/lib/mobileCompanyLogo";

const APPROVED_STATUSES = ["auto_approved", "approved"];

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

function workMinutes(checkInIso: string | null, checkOutIso: string | null) {
  if (!checkInIso || !checkOutIso) return 0;
  const diffMs = new Date(checkOutIso).getTime() - new Date(checkInIso).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.floor(diffMs / 60000);
}

export async function POST(req: NextRequest) {
  const requestOrigin = resolveRequestOrigin(req);
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

  const [employeeResult, companyResult, eventsResult] = await Promise.all([
    session.admin
      .from("employees")
      .select("full_name,employee_code,designation")
      .eq("id", session.employee.id)
      .eq("company_id", session.employee.company_id)
      .maybeSingle(),
    session.admin
      .from("companies")
      .select("name,company_logo_url,company_logo_header_url")
      .eq("id", session.employee.company_id)
      .maybeSingle(),
    session.admin
      .from("attendance_punch_events")
      .select("punch_type,effective_punch_at,server_received_at")
      .eq("company_id", session.employee.company_id)
      .eq("employee_id", session.employee.id)
      .in("approval_status", APPROVED_STATUSES)
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
  if (eventsResult.error) {
    return NextResponse.json({ error: eventsResult.error.message || "Unable to load today attendance." }, { status: 400 });
  }

  const events = ((eventsResult.data || []) as Array<{
    punch_type: "in" | "out";
    effective_punch_at: string | null;
    server_received_at: string;
  }>).filter((row) => {
    const punchAt = row.effective_punch_at || row.server_received_at;
    return punchAt ? isoDateInIndia(punchAt) === today : false;
  });

  const firstIn = events.find((row) => row.punch_type === "in") || null;
  const lastOut = [...events].reverse().find((row) => row.punch_type === "out") || null;
  const checkInAt = firstIn?.effective_punch_at || firstIn?.server_received_at || null;
  const checkOutAt = lastOut?.effective_punch_at || lastOut?.server_received_at || null;
  const currentStatus = checkInAt ? (checkOutAt ? "COMPLETED" : "PUNCHED_IN") : "NOT_PUNCHED_IN";
  const companyLogoUrl = buildCompanyLogoUrl({
    logoValue: companyResult.data?.company_logo_header_url || companyResult.data?.company_logo_url,
    companyId: session.employee.company_id,
    requestOrigin,
  });

  return NextResponse.json({
    employee: {
      id: session.employee.id,
      employeeCode: employeeResult.data?.employee_code || session.employee.employee_code,
      fullName: employeeResult.data?.full_name || session.employee.full_name,
      designation: employeeResult.data?.designation || "",
      companyName: companyResult.data?.name || "",
      companyLogoUrl,
      company_logo_url: companyLogoUrl,
    },
    today: {
      date: today,
      status: currentStatus,
      punchInAt: checkInAt,
      punchOutAt: checkOutAt,
      workingMinutes: workMinutes(checkInAt, checkOutAt),
    },
  });
}
