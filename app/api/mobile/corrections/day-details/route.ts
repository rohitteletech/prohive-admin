import { NextRequest, NextResponse } from "next/server";
import { dateRangeForIndiaIsoDate, isSameIndiaDate } from "@/lib/attendanceCorrections";
import { formatDisplayTime } from "@/lib/dateTime";
import { getMobileSessionContext } from "@/lib/mobileSession";

function normalizeIsoDate(value: unknown) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
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
  const { fromIso, toIso } = dateRangeForIndiaIsoDate(correctionDate);

  const { data, error } = await session.admin
    .from("attendance_punch_events")
    .select("punch_type,effective_punch_at,server_received_at,approval_status")
    .eq("company_id", session.employee.company_id)
    .eq("employee_id", session.employee.id)
    .gte("effective_punch_at", fromIso)
    .lte("effective_punch_at", toIso)
    .order("server_received_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load attendance punches." }, { status: 400 });
  }

  const rows = ((data || []) as Array<{
    punch_type: string | null;
    effective_punch_at: string | null;
    server_received_at: string | null;
    approval_status: string | null;
  }>)
    .filter((row) => row.approval_status !== "rejected")
    .filter((row) => {
      const sourceIso = row.effective_punch_at || row.server_received_at || "";
      return sourceIso ? isSameIndiaDate(sourceIso, correctionDate) : false;
    });

  const firstIn = rows.find((row) => row.punch_type === "in");
  const lastOut = [...rows].reverse().find((row) => row.punch_type === "out");

  return NextResponse.json({
    correctionDate,
    actualPunchIn: formatDisplayTime(firstIn?.effective_punch_at || firstIn?.server_received_at),
    actualPunchOut: formatDisplayTime(lastOut?.effective_punch_at || lastOut?.server_received_at),
  });
}
