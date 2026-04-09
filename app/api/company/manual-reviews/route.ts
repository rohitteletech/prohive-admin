import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { getAttendanceReportData } from "@/lib/companyReportsAttendance";
import { INDIA_TIME_ZONE } from "@/lib/dateTime";
import {
  ensurePendingPunchReviewCases,
  resolveNonWorkingDayManualReviewCase,
  resolvePunchManualReviewCase,
} from "@/lib/manualReviewCases";

type ManualReviewCaseType = "offline_punch_review" | "punch_on_approved_leave" | "holiday_worked_review" | "weekly_off_worked_review";

function monthBounds(monthKey: string) {
  const start = `${monthKey}-01T00:00:00.000Z`;
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const next = new Date(Date.UTC(year, month, 1)).toISOString();
  return { start, next };
}

function monthMatches(isoText: string, monthKey: string) {
  return String(isoText || "").trim().slice(0, 7) === monthKey;
}

function caseTypeLabel(caseType: ManualReviewCaseType) {
  switch (caseType) {
    case "offline_punch_review":
      return "Offline Punch Review";
    case "punch_on_approved_leave":
      return "Punch On Approved Leave";
    case "holiday_worked_review":
      return "Holiday Worked Review";
    case "weekly_off_worked_review":
      return "Weekly Off Worked Review";
    default:
      return "Manual Review";
  }
}

function triggerCaseTypeLabel(caseType: string) {
  if (caseType === "offline_punch_review") return "Offline Punch Review";
  if (caseType === "punch_on_approved_leave") return "Approved Leave Punch Review";
  return "Approved Punch Review";
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

  const monthKey = String(req.nextUrl.searchParams.get("monthKey") || "").trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return NextResponse.json({ error: "Valid month is required." }, { status: 400 });
  }

  const ensureResult = await getAttendanceReportData({
    admin: context.admin,
    companyId: context.companyId,
    input: {
      mode: "monthly",
      monthKey,
      timeZone: INDIA_TIME_ZONE,
    },
  });
  if (!ensureResult.ok) {
    return NextResponse.json({ error: ensureResult.error }, { status: ensureResult.status });
  }

  const ensurePunchReviewResult = await ensurePendingPunchReviewCases({
    admin: context.admin,
    companyId: context.companyId,
    monthKey,
  });
  if (!ensurePunchReviewResult.ok) {
    return NextResponse.json({ error: ensurePunchReviewResult.error }, { status: 400 });
  }

  const { data: cases, error } = await context.admin
    .from("manual_review_cases")
    .select(
      "id,case_type,source_id,source_table,status,title,reason_codes,payload_json,review_note,resolution_action,reviewed_by,reviewed_at,created_at,updated_at,employee_id"
    )
    .eq("company_id", context.companyId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load manual review queue." }, { status: 400 });
  }

  const pendingCases = ((cases || []) as Array<Record<string, unknown>>).filter((row) => {
    if (String(row.status || "") !== "pending") return false;
    const caseType = String(row.case_type || "") as ManualReviewCaseType;
    const payload = (row.payload_json || {}) as Record<string, unknown>;
    const monthSource =
      caseType === "holiday_worked_review" || caseType === "weekly_off_worked_review"
        ? String(payload.workDate || "")
        : String(payload.workDate || payload.punchAt || row.created_at || "");
    return monthMatches(monthSource, monthKey);
  });
  const employeeIds = Array.from(new Set(((cases || []) as Array<Record<string, unknown>>).map((row) => String(row.employee_id || "")).filter(Boolean)));
  const punchIds = Array.from(
    new Set(
      pendingCases
        .filter((row) => String(row.source_table || "") === "attendance_punch_events")
        .map((row) => String(row.source_id || ""))
        .filter(Boolean)
    )
  );

  const [employeeResult, punchResult] = await Promise.all([
    employeeIds.length > 0
      ? context.admin
          .from("employees")
          .select("id,full_name,department")
          .eq("company_id", context.companyId)
          .in("id", employeeIds)
      : Promise.resolve({ data: [], error: null }),
    punchIds.length > 0
      ? context.admin
          .from("attendance_punch_events")
          .select("id,punch_type,device_time_at,estimated_time_at,server_received_at,address_text,is_offline,approval_status")
          .eq("company_id", context.companyId)
          .in("id", punchIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (employeeResult.error) {
    return NextResponse.json({ error: employeeResult.error.message || "Unable to load manual review employees." }, { status: 400 });
  }
  if (punchResult.error) {
    return NextResponse.json({ error: punchResult.error.message || "Unable to load manual review punches." }, { status: 400 });
  }

  const employeesById = new Map<string, { full_name: string | null; department: string | null }>();
  ((employeeResult.data || []) as Array<{ id?: string | null; full_name?: string | null; department?: string | null }>).forEach((row) => {
    const id = String(row.id || "").trim();
    if (!id) return;
    employeesById.set(id, { full_name: row.full_name || null, department: row.department || null });
  });

  const punchesById = new Map<string, Record<string, unknown>>();
  ((punchResult.data || []) as Array<Record<string, unknown>>).forEach((row) => {
    const id = String(row.id || "").trim();
    if (!id) return;
    punchesById.set(id, row);
  });

  const rows = pendingCases.map((row) => {
    const employeeId = String(row.employee_id || "").trim();
    const employee = employeesById.get(employeeId);
    const sourceId = String(row.source_id || "").trim();
    const punch = punchesById.get(sourceId);
    const payload = (row.payload_json || {}) as Record<string, unknown>;
    const punchAt =
      String(payload.punchAt || "").trim() ||
      String(punch?.estimated_time_at || "").trim() ||
      String(punch?.device_time_at || "").trim() ||
      String(punch?.server_received_at || "").trim() ||
      String(row.created_at || "").trim();
    return {
      id: String(row.id || ""),
      caseType: String(row.case_type || "") as ManualReviewCaseType,
      caseTypeLabel: caseTypeLabel(String(row.case_type || "") as ManualReviewCaseType),
      title: String(row.title || "").trim() || caseTypeLabel(String(row.case_type || "") as ManualReviewCaseType),
      employeeId,
      employee: employee?.full_name?.trim() || "Unknown Employee",
      department: employee?.department?.trim() || "-",
      sourceId,
      sourceTable: String(row.source_table || "").trim(),
      punchType: String(payload.punchType || "").trim() || String(punch?.punch_type || "").trim() || "-",
      punchAt,
      workDate: String(payload.workDate || "").trim(),
      addressText: String(payload.addressText || "").trim() || String(punch?.address_text || "").trim() || "-",
      isOffline: payload.isOffline == null ? Boolean(punch?.is_offline) : Boolean(payload.isOffline),
      approvalStatus: String(punch?.approval_status || "").trim() || "pending_approval",
      reasonCodes: Array.isArray(row.reason_codes) ? row.reason_codes.map((value) => String(value)) : [],
      suggestedTreatment: String(payload.suggestedTreatment || "").trim() || "",
      workHours: String(payload.workHours || "").trim() || "-",
      dayTypeLabel: String(payload.dayType || "").trim() || "",
      workflowHint:
        String(payload.triggerSourceCaseType || "").trim()
          ? `Step 2 after ${triggerCaseTypeLabel(String(payload.triggerSourceCaseType || "").trim())}`
          : row.case_type === "holiday_worked_review" || row.case_type === "weekly_off_worked_review"
            ? "Final non-working-day treatment required"
            : "Punch validity review required",
      createdAt: String(row.created_at || "").trim(),
    };
  });

  return NextResponse.json({
    rows,
    summary: {
      total: rows.length,
      pending: rows.length,
      offlinePunchReview: rows.filter((row) => row.caseType === "offline_punch_review").length,
      approvedLeavePunchReview: rows.filter((row) => row.caseType === "punch_on_approved_leave").length,
      holidayWorkedReview: rows.filter((row) => row.caseType === "holiday_worked_review").length,
      weeklyOffWorkedReview: rows.filter((row) => row.caseType === "weekly_off_worked_review").length,
    },
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
    caseId?: string;
    action?: string;
    reviewNote?: string;
    resolutionTreatment?: string;
  };

  const caseId = String(body.caseId || "").trim();
  const action = String(body.action || "").trim().toLowerCase();
  const reviewNote = String(body.reviewNote || "").trim();
  const resolutionTreatment = String(body.resolutionTreatment || "").trim();

  if (!caseId) return NextResponse.json({ error: "Manual review case is required." }, { status: 400 });
  if (action !== "approve" && action !== "reject" && action !== "resolve") {
    return NextResponse.json({ error: "Valid action is required." }, { status: 400 });
  }
  if (reviewNote.length < 5 || reviewNote.length > 300) {
    return NextResponse.json({ error: "Review note must be 5 to 300 characters." }, { status: 400 });
  }

  const { data: reviewCase, error: reviewCaseError } = await context.admin
    .from("manual_review_cases")
    .select("id,case_type,source_id,source_table,status,employee_id,payload_json")
    .eq("company_id", context.companyId)
    .eq("id", caseId)
    .maybeSingle();

  if (reviewCaseError || !reviewCase?.id) {
    return NextResponse.json({ error: reviewCaseError?.message || "Manual review case not found." }, { status: 404 });
  }
  if (reviewCase.status !== "pending") {
    return NextResponse.json({ error: "This review case is already resolved." }, { status: 400 });
  }

  if (reviewCase.case_type === "holiday_worked_review" || reviewCase.case_type === "weekly_off_worked_review") {
    if (
      resolutionTreatment !== "Record Only" &&
      resolutionTreatment !== "OT Only" &&
      resolutionTreatment !== "Grant Comp Off" &&
      resolutionTreatment !== "Present + OT"
    ) {
      return NextResponse.json({ error: "Valid resolution treatment is required." }, { status: 400 });
    }
    const result = await resolveNonWorkingDayManualReviewCase({
      admin: context.admin,
      companyId: context.companyId,
      caseId: reviewCase.id,
      resolutionTreatment,
      reviewNote,
      reviewedBy: context.adminEmail,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (reviewCase.source_table !== "attendance_punch_events") {
    return NextResponse.json({ error: "Unsupported manual review source." }, { status: 400 });
  }

  const result = await resolvePunchManualReviewCase({
    admin: context.admin,
    companyId: context.companyId,
    caseId: reviewCase.id,
    caseType: reviewCase.case_type,
    employeeId: String(reviewCase.employee_id || "").trim(),
    workDate: String((reviewCase.payload_json as Record<string, unknown> | null)?.workDate || "").trim(),
    sourceId: String(reviewCase.source_id),
    action: action === "approve" ? "approve" : "reject",
    reviewNote,
    reviewedBy: context.adminEmail,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
