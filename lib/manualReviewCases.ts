import type { SupabaseClient } from "@supabase/supabase-js";
import type { NonWorkingDayTreatment } from "@/lib/attendancePolicy";

type AdminClientLike = SupabaseClient;

export type ManualReviewCaseType =
  | "offline_punch_review"
  | "punch_on_approved_leave"
  | "holiday_worked_review"
  | "weekly_off_worked_review";

export type ManualReviewCaseStatus = "pending" | "approved" | "rejected" | "resolved";

export type ManualReviewSourceTable = "attendance_punch_events";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type ManualReviewCaseRow = {
  id: string;
  company_id: string;
  employee_id: string;
  case_type: ManualReviewCaseType;
  source_table: string;
  source_id: string;
  status: ManualReviewCaseStatus;
  title: string | null;
  reason_codes: string[] | null;
  payload_json: Record<string, JsonValue> | null;
  review_note: string | null;
  resolution_action: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

function trimReasonCodes(reasonCodes: string[]) {
  return Array.from(new Set(reasonCodes.map((code) => String(code || "").trim()).filter(Boolean)));
}

function normalizeResolvedNonWorkingDayTreatment(value: unknown): NonWorkingDayTreatment | null {
  const text = String(value || "").trim();
  if (text === "Record Only" || text === "OT Only" || text === "Grant Comp Off" || text === "Present + OT") {
    return text;
  }
  return null;
}

function buildReviewTitle(caseType: ManualReviewCaseType) {
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

export async function upsertPendingManualReviewCase(params: {
  admin: AdminClientLike;
  companyId: string;
  employeeId: string;
  caseType: ManualReviewCaseType;
  sourceTable: ManualReviewSourceTable;
  sourceId: string;
  reasonCodes: string[];
  payloadJson: Record<string, JsonValue>;
  title?: string | null;
}) {
  const payload = {
    company_id: params.companyId,
    employee_id: params.employeeId,
    case_type: params.caseType,
    source_table: params.sourceTable,
    source_id: params.sourceId,
    status: "pending" as const,
    title: params.title?.trim() || buildReviewTitle(params.caseType),
    reason_codes: trimReasonCodes(params.reasonCodes),
    payload_json: params.payloadJson,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: existingError } = await params.admin
    .from("manual_review_cases")
    .select("id")
    .eq("company_id", params.companyId)
    .eq("source_table", params.sourceTable)
    .eq("source_id", params.sourceId)
    .eq("case_type", params.caseType)
    .eq("status", "pending")
    .maybeSingle();

  if (existingError) return { ok: false as const, error: existingError.message || "Unable to load manual review case." };

  if (existing?.id) {
    const { error } = await params.admin
      .from("manual_review_cases")
      .update(payload)
      .eq("company_id", params.companyId)
      .eq("id", existing.id);
    if (error) return { ok: false as const, error: error.message || "Unable to update manual review case." };
    return { ok: true as const, id: existing.id, action: "updated" as const };
  }

  const { data, error } = await params.admin
    .from("manual_review_cases")
    .insert({
      ...payload,
      created_at: payload.updated_at,
    })
    .select("id")
    .single();

  if (error || !data?.id) return { ok: false as const, error: error?.message || "Unable to create manual review case." };
  return { ok: true as const, id: String(data.id), action: "created" as const };
}

export async function upsertPendingNonWorkingDayReviewCase(params: {
  admin: AdminClientLike;
  companyId: string;
  employeeId: string;
  caseType: "holiday_worked_review" | "weekly_off_worked_review";
  sourceId: string;
  workDate: string;
  reasonCodes: string[];
  payloadJson: Record<string, JsonValue>;
  title?: string | null;
}) {
  const { data: existingRows, error: existingError } = await params.admin
    .from("manual_review_cases")
    .select("id,payload_json")
    .eq("company_id", params.companyId)
    .eq("employee_id", params.employeeId)
    .eq("case_type", params.caseType)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  if (existingError) return { ok: false as const, error: existingError.message || "Unable to load manual review cases." };

  const matchingExisting = ((existingRows || []) as Array<{ id?: string | null; payload_json?: Record<string, JsonValue> | null }>).find((row) => {
    const workDate = String(row.payload_json?.workDate || "").trim();
    return workDate === params.workDate;
  });

  const payload = {
    company_id: params.companyId,
    employee_id: params.employeeId,
    case_type: params.caseType,
    source_table: "attendance_punch_events",
    source_id: params.sourceId,
    status: "pending" as const,
    title: params.title?.trim() || buildReviewTitle(params.caseType),
    reason_codes: trimReasonCodes(params.reasonCodes),
    payload_json: params.payloadJson,
    updated_at: new Date().toISOString(),
  };

  if (matchingExisting?.id) {
    const { error } = await params.admin
      .from("manual_review_cases")
      .update(payload)
      .eq("company_id", params.companyId)
      .eq("id", matchingExisting.id);
    if (error) return { ok: false as const, error: error.message || "Unable to update manual review case." };
    return { ok: true as const, id: matchingExisting.id, action: "updated" as const };
  }

  const { data, error } = await params.admin
    .from("manual_review_cases")
    .insert({
      ...payload,
      created_at: payload.updated_at,
    })
    .select("id")
    .single();

  if (error || !data?.id) return { ok: false as const, error: error?.message || "Unable to create manual review case." };
  return { ok: true as const, id: String(data.id), action: "created" as const };
}

export async function fetchResolvedNonWorkingDayTreatmentMap(params: {
  admin: AdminClientLike;
  companyId: string;
  employeeIds: string[];
  startDate: string;
  endDate: string;
}) {
  const employeeIds = Array.from(new Set(params.employeeIds.filter(Boolean)));
  if (employeeIds.length === 0) return { byEmployeeDate: new Map<string, NonWorkingDayTreatment>(), error: null as string | null };

  const { data, error } = await params.admin
    .from("manual_review_cases")
    .select("employee_id,case_type,status,resolution_action,payload_json")
    .eq("company_id", params.companyId)
    .in("employee_id", employeeIds)
    .in("case_type", ["holiday_worked_review", "weekly_off_worked_review"])
    .eq("status", "resolved");

  if (error) {
    return { byEmployeeDate: new Map<string, NonWorkingDayTreatment>(), error: error.message || "Unable to load resolved manual review cases." };
  }

  const byEmployeeDate = new Map<string, NonWorkingDayTreatment>();
  ((data || []) as Array<{
    employee_id?: string | null;
    resolution_action?: string | null;
    payload_json?: Record<string, JsonValue> | null;
  }>).forEach((row) => {
    const employeeId = String(row.employee_id || "").trim();
    const workDate = String(row.payload_json?.workDate || "").trim();
    if (!employeeId || !workDate || workDate < params.startDate || workDate > params.endDate) return;
    const treatment = normalizeResolvedNonWorkingDayTreatment(row.resolution_action);
    if (!treatment) return;
    byEmployeeDate.set(`${employeeId}:${workDate}`, treatment);
  });

  return { byEmployeeDate, error: null as string | null };
}

export async function resolvePunchManualReviewCase(params: {
  admin: AdminClientLike;
  companyId: string;
  caseId: string;
  sourceId: string;
  action: "approve" | "reject";
  reviewNote: string;
  reviewedBy: string;
}) {
  const reviewedAt = new Date().toISOString();
  const approvalStatus = params.action === "approve" ? "approved" : "rejected";
  const caseStatus = params.action === "approve" ? "approved" : "rejected";

  const { data: punchEvent, error: punchLoadError } = await params.admin
    .from("attendance_punch_events")
    .select("id,is_offline,estimated_time_at,device_time_at,server_received_at,effective_punch_at")
    .eq("company_id", params.companyId)
    .eq("id", params.sourceId)
    .maybeSingle();

  if (punchLoadError || !punchEvent?.id) {
    return { ok: false as const, error: punchLoadError?.message || "Punch event not found for review resolution." };
  }

  const effectivePunchAt =
    params.action === "approve"
      ? punchEvent.effective_punch_at ||
        (punchEvent.is_offline
          ? punchEvent.estimated_time_at || punchEvent.device_time_at || punchEvent.server_received_at
          : punchEvent.server_received_at)
      : null;

  const { error: punchError } = await params.admin
    .from("attendance_punch_events")
    .update({
      approval_status: approvalStatus,
      requires_approval: false,
      effective_punch_at: effectivePunchAt,
    })
    .eq("company_id", params.companyId)
    .eq("id", params.sourceId);

  if (punchError) {
    return { ok: false as const, error: punchError.message || "Unable to update punch approval status." };
  }

  const { error: caseError } = await params.admin
    .from("manual_review_cases")
    .update({
      status: caseStatus,
      review_note: params.reviewNote || null,
      resolution_action: params.action === "approve" ? "approve_punch" : "reject_punch",
      reviewed_by: params.reviewedBy,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt,
    })
    .eq("company_id", params.companyId)
    .eq("id", params.caseId);

  if (caseError) {
    return { ok: false as const, error: caseError.message || "Punch updated but manual review case could not be resolved." };
  }

  return { ok: true as const };
}

export async function resolveNonWorkingDayManualReviewCase(params: {
  admin: AdminClientLike;
  companyId: string;
  caseId: string;
  resolutionTreatment: NonWorkingDayTreatment;
  reviewNote: string;
  reviewedBy: string;
}) {
  const reviewedAt = new Date().toISOString();
  const { error } = await params.admin
    .from("manual_review_cases")
    .update({
      status: "resolved",
      review_note: params.reviewNote || null,
      resolution_action: params.resolutionTreatment,
      reviewed_by: params.reviewedBy,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt,
    })
    .eq("company_id", params.companyId)
    .eq("id", params.caseId);

  if (error) {
    return { ok: false as const, error: error.message || "Unable to resolve manual review case." };
  }

  return { ok: true as const };
}
