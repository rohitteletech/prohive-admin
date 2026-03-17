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

  const { data: historyRows, error: historyError } = await context.admin
    .from("attendance_manual_review_resolution_history")
    .select(
      "id,employee_id,work_date,previous_treatment,new_treatment,action_type,remark,resolved_by,resolved_at,created_at"
    )
    .eq("company_id", context.companyId)
    .gte("work_date", `${monthKey}-01`)
    .lte("work_date", `${monthKey}-31`)
    .order("resolved_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (historyError) {
    return NextResponse.json({ error: historyError.message || "Unable to load manual review history." }, { status: 400 });
  }

  const historyEmployeeIds = Array.from(
    new Set(
      ((historyRows || []) as Array<{ employee_id?: string | null }>)
        .map((row) => String(row.employee_id || "").trim())
        .filter(Boolean)
    )
  );

  const historyEmployeesById = new Map<string, { full_name: string | null; department: string | null }>();
  if (historyEmployeeIds.length > 0) {
    const { data: historyEmployees, error: historyEmployeesError } = await context.admin
      .from("employees")
      .select("id,full_name,department")
      .eq("company_id", context.companyId)
      .in("id", historyEmployeeIds);
    if (historyEmployeesError) {
      return NextResponse.json(
        { error: historyEmployeesError.message || "Unable to load manual review history employees." },
        { status: 400 }
      );
    }
    ((historyEmployees || []) as Array<{ id?: string | null; full_name?: string | null; department?: string | null }>).forEach((row) => {
      const id = String(row.id || "").trim();
      if (!id) return;
      historyEmployeesById.set(id, {
        full_name: row.full_name || null,
        department: row.department || null,
      });
    });
  }

  return NextResponse.json({
    rows: result.rows,
    summary: result.summary,
    scope: result.scope,
    history: ((historyRows || []) as Array<{
      id?: string | null;
      employee_id?: string | null;
      work_date?: string | null;
      previous_treatment?: string | null;
      new_treatment?: string | null;
      action_type?: string | null;
      remark?: string | null;
      resolved_by?: string | null;
      resolved_at?: string | null;
      created_at?: string | null;
    }>).map((row) => {
      const employeeId = String(row.employee_id || "").trim();
      const employee = historyEmployeesById.get(employeeId);
      return {
        id: String(row.id || ""),
        employeeId,
        employee: employee?.full_name?.trim() || "Unknown Employee",
        department: employee?.department?.trim() || "-",
        workDate: String(row.work_date || ""),
        previousTreatment: String(row.previous_treatment || "").trim() || "-",
        newTreatment: String(row.new_treatment || "").trim() || "-",
        actionType: String(row.action_type || "").trim() || "updated",
        remark: String(row.remark || "").trim(),
        resolvedBy: String(row.resolved_by || "").trim() || "-",
        resolvedAt: String(row.resolved_at || row.created_at || "").trim(),
      };
    }),
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
    actionType?: string;
  };

  const employeeId = String(body.employeeId || "").trim();
  const workDate = String(body.workDate || "").trim();
  const resolutionTreatment = normalizeResolvedNonWorkingDayTreatment(body.resolutionTreatment);
  const remark = String(body.remark || "").trim();
  const actionType = String(body.actionType || "").trim().toLowerCase() === "reject" ? "rejected" : "approved";

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
    .select("id,resolution_treatment")
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
    const { error: historyInsertError } = await context.admin.from("attendance_manual_review_resolution_history").insert({
      company_id: context.companyId,
      employee_id: employeeId,
      work_date: workDate,
      previous_treatment: String(existing.resolution_treatment || "").trim() || null,
      new_treatment: resolutionTreatment,
      action_type: actionType,
      remark: remark || null,
      resolved_by: context.adminEmail,
      resolved_at: payload.resolved_at,
    });
    if (historyInsertError) {
      return NextResponse.json(
        { error: historyInsertError.message || "Manual review saved but history could not be recorded." },
        { status: 400 }
      );
    }
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

  const { error: historyInsertError } = await context.admin.from("attendance_manual_review_resolution_history").insert({
    company_id: context.companyId,
    employee_id: employeeId,
    work_date: workDate,
    previous_treatment: null,
    new_treatment: resolutionTreatment,
    action_type: actionType,
    remark: remark || null,
    resolved_by: context.adminEmail,
    resolved_at: payload.resolved_at,
  });
  if (historyInsertError) {
    return NextResponse.json(
      { error: historyInsertError.message || "Manual review saved but history could not be recorded." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, id: created.id, action: "created" });
}
