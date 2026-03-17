import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { getAttendanceReportData } from "@/lib/companyReportsAttendance";
import { INDIA_TIME_ZONE } from "@/lib/dateTime";
import { normalizeResolvedNonWorkingDayTreatment } from "@/lib/manualReviewResolutions";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token, {
    companyIdHint: req.headers.get("x-company-id") || req.cookies.get("prohive_company_id")?.value || "",
  });
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const monthKey = String(req.nextUrl.searchParams.get("monthKey") || "").trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return NextResponse.json({ error: "Valid month is required." }, { status: 400 });
  }

  const result = await getAttendanceReportData({
    admin: context.admin,
    companyId: context.companyId,
    input: {
      mode: "monthly",
      monthKey,
      status: "manual_review",
      timeZone: INDIA_TIME_ZONE,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    rows: result.rows,
    summary: result.summary,
    scope: result.scope,
  });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token, {
    companyIdHint: req.headers.get("x-company-id") || req.cookies.get("prohive_company_id")?.value || "",
  });
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    employeeId?: string;
    workDate?: string;
    resolutionTreatment?: string;
    remark?: string;
  };

  const employeeId = String(body.employeeId || "").trim();
  const workDate = String(body.workDate || "").trim();
  const resolutionTreatment = normalizeResolvedNonWorkingDayTreatment(body.resolutionTreatment);
  const remark = String(body.remark || "").trim();

  if (!employeeId) return NextResponse.json({ error: "Employee is required." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return NextResponse.json({ error: "Valid work date is required." }, { status: 400 });
  if (!resolutionTreatment) {
    return NextResponse.json({ error: "Valid resolution treatment is required." }, { status: 400 });
  }
  if (remark && (remark.length < 5 || remark.length > 300)) {
    return NextResponse.json({ error: "Remark must be 5 to 300 characters." }, { status: 400 });
  }

  const { data: employee, error: employeeError } = await context.admin
    .from("employees")
    .select("id")
    .eq("company_id", context.companyId)
    .eq("id", employeeId)
    .maybeSingle();
  if (employeeError || !employee?.id) {
    return NextResponse.json({ error: employeeError?.message || "Employee not found." }, { status: 400 });
  }

  const { data: existing } = await context.admin
    .from("attendance_manual_review_resolutions")
    .select("id")
    .eq("company_id", context.companyId)
    .eq("employee_id", employeeId)
    .eq("work_date", workDate)
    .maybeSingle();

  const payload = {
    company_id: context.companyId,
    employee_id: employeeId,
    work_date: workDate,
    resolution_treatment: resolutionTreatment,
    remark: remark || null,
    resolved_by: context.adminEmail,
    resolved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await context.admin
      .from("attendance_manual_review_resolutions")
      .update(payload)
      .eq("company_id", context.companyId)
      .eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message || "Unable to update manual review resolution." }, { status: 400 });
    return NextResponse.json({ ok: true, id: existing.id, action: "updated" });
  }

  const { data: created, error } = await context.admin
    .from("attendance_manual_review_resolutions")
    .insert({
      ...payload,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !created?.id) {
    return NextResponse.json({ error: error?.message || "Unable to create manual review resolution." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: created.id, action: "created" });
}
