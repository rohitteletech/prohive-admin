import { NextRequest, NextResponse } from "next/server";
import { getMobileSessionContext } from "@/lib/mobileSession";

function normalizeIsoDate(value: unknown) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function displayTime(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const hhmm = raw.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : "";
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    sessionToken?: string;
    correctionDate?: string;
  };

  const correctionDate = normalizeIsoDate(body.correctionDate);
  if (!correctionDate) {
    return NextResponse.json({ error: "Invalid correction date." }, { status: 400 });
  }

  const session = await getMobileSessionContext({
    sessionToken: body.sessionToken,
  });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const { data, error } = await session.admin
    .from("attendance_punch_events")
    .select("punch_type,effective_punch_at,server_received_at,approval_status")
    .eq("company_id", session.employee.company_id)
    .eq("employee_id", session.employee.id)
    .gte("server_received_at", `${correctionDate}T00:00:00.000+05:30`)
    .lte("server_received_at", `${correctionDate}T23:59:59.999+05:30`)
    .order("server_received_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load attendance punches." }, { status: 400 });
  }

  const rows = ((data || []) as Array<{
    punch_type: string | null;
    effective_punch_at: string | null;
    server_received_at: string | null;
    approval_status: string | null;
  }>).filter((row) => row.approval_status !== "rejected");

  const firstIn = rows.find((row) => row.punch_type === "in");
  const lastOut = [...rows].reverse().find((row) => row.punch_type === "out");

  return NextResponse.json({
    correctionDate,
    actualPunchIn: displayTime(firstIn?.effective_punch_at || firstIn?.server_received_at),
    actualPunchOut: displayTime(lastOut?.effective_punch_at || lastOut?.server_received_at),
  });
}
