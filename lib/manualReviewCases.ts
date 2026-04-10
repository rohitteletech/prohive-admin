import type { SupabaseClient } from "@supabase/supabase-js";
import type { NonWorkingDayTreatment } from "@/lib/attendancePolicy";
import { isoDateInIndia } from "@/lib/dateTime";
import { resolveHolidayPolicyRuntime } from "@/lib/companyPolicyRuntime";
import { resolvePoliciesForEmployee } from "@/lib/companyPoliciesServer";
import { rawWorkedMinutes } from "@/lib/attendancePolicy";

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

function workedHoursLabelFromMinutes(workedMinutes: number) {
  if (!Number.isFinite(workedMinutes) || workedMinutes <= 0) return "-";
  const safeMinutes = Math.max(Math.floor(workedMinutes), 0);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

type PunchReviewEventRow = {
  id?: string | null;
  employee_id?: string | null;
  punch_type?: "in" | "out" | null;
  address_text?: string | null;
  is_offline?: boolean | null;
  approval_reason_codes?: string[] | null;
  day_type?: string | null;
  effective_punch_at?: string | null;
  estimated_time_at?: string | null;
  device_time_at?: string | null;
  server_received_at?: string | null;
};

function punchEventAtForReview(row: PunchReviewEventRow) {
  return String(
    row.effective_punch_at ||
      row.estimated_time_at ||
      row.device_time_at ||
      row.server_received_at ||
      "",
  ).trim();
}

function punchEventWorkDate(row: PunchReviewEventRow) {
  const punchAt = punchEventAtForReview(row);
  return punchAt ? isoDateInIndia(punchAt) : "";
}

function reasonCodesFromUnknown(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return trimReasonCodes(value.map((item) => String(item || "")));
}

function reviewCaseWorkDate(payloadJson: Record<string, JsonValue> | null | undefined) {
  const direct = String(payloadJson?.workDate || "").trim();
  if (direct) return direct;
  const punchAt = String(payloadJson?.punchAt || "").trim();
  return punchAt ? isoDateInIndia(punchAt) : "";
}

function buildDailyPunchReviewPayload(rows: PunchReviewEventRow[], workDate: string) {
  const ordered = [...rows].sort((a, b) => punchEventAtForReview(a).localeCompare(punchEventAtForReview(b)));
  const firstIn = ordered.find((row) => row.punch_type === "in") || null;
  const lastOut = [...ordered].reverse().find((row) => row.punch_type === "out") || null;
  const firstPunch = ordered[0] || null;
  const lastPunch = ordered[ordered.length - 1] || null;
  const firstPunchAt = firstIn ? punchEventAtForReview(firstIn) : firstPunch ? punchEventAtForReview(firstPunch) : "";
  const lastPunchAt = lastOut ? punchEventAtForReview(lastOut) : lastPunch ? punchEventAtForReview(lastPunch) : "";
  const workedMinutes = rawWorkedMinutes(firstIn ? punchEventAtForReview(firstIn) : null, lastOut ? punchEventAtForReview(lastOut) : null);
  const reasonCodes = trimReasonCodes(
    ordered.flatMap((row) => reasonCodesFromUnknown(row.approval_reason_codes)),
  );
  const hasApprovedLeaveReason = reasonCodes.includes("PUNCH_ON_APPROVED_LEAVE");
  const punchTypes = Array.from(new Set(ordered.map((row) => String(row.punch_type || "").trim()).filter(Boolean)));
  const punchTypeLabel =
    punchTypes.length === 2
      ? "IN + OUT"
      : punchTypes.length === 1
        ? punchTypes[0].toUpperCase()
        : "-";
  const dayTypeLabel = (() => {
    const dayType = String(firstPunch?.day_type || lastPunch?.day_type || "").trim();
    if (dayType === "holiday") return "Holiday";
    if (dayType === "weekly_off") return "Weekly Off";
    if (dayType === "working_day") return "Working Day";
    return "";
  })();
  const caseType = (() => {
    if (hasApprovedLeaveReason) return "punch_on_approved_leave" as const;
    const normalizedDayType = String(firstPunch?.day_type || lastPunch?.day_type || "").trim();
    if (normalizedDayType === "holiday") return "holiday_worked_review" as const;
    if (normalizedDayType === "weekly_off") return "weekly_off_worked_review" as const;
    return "offline_punch_review" as const;
  })();

  return {
    caseType,
    sourceId: String(lastPunch?.id || firstPunch?.id || "").trim(),
    reasonCodes,
    payloadJson: {
      workDate,
      punchAt: lastPunchAt || firstPunchAt || null,
      firstPunchAt: firstPunchAt || null,
      lastPunchAt: lastPunchAt || null,
      checkIn: firstIn ? punchEventAtForReview(firstIn) : null,
      checkOut: lastOut ? punchEventAtForReview(lastOut) : null,
      workHours: workedHoursLabelFromMinutes(workedMinutes),
      workedMinutes,
      punchType: punchTypeLabel,
      dayType: dayTypeLabel,
      addressText:
        String(firstIn?.address_text || "").trim() ||
        String(lastOut?.address_text || "").trim() ||
        String(firstPunch?.address_text || "").trim() ||
        String(lastPunch?.address_text || "").trim() ||
        null,
      isOffline: ordered.some((row) => Boolean(row.is_offline)),
      pendingPunchIds: ordered.map((row) => String(row.id || "").trim()).filter(Boolean),
      hasPunchOut: Boolean(lastOut),
      triggerPunchId: String(lastPunch?.id || "").trim() || null,
    } satisfies Record<string, JsonValue>,
  };
}

export async function upsertPendingDailyPunchReviewCase(params: {
  admin: AdminClientLike;
  companyId: string;
  employeeId: string;
  workDate: string;
  caseType: "offline_punch_review" | "punch_on_approved_leave";
  sourceId: string;
  reasonCodes: string[];
  payloadJson: Record<string, JsonValue>;
  title?: string | null;
}) {
  const { data: existingRows, error: existingError } = await params.admin
    .from("manual_review_cases")
    .select("id,payload_json")
    .eq("company_id", params.companyId)
    .eq("employee_id", params.employeeId)
    .in("case_type", ["offline_punch_review", "punch_on_approved_leave"])
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  if (existingError) return { ok: false as const, error: existingError.message || "Unable to load manual review cases." };

  const sameDayRows = ((existingRows || []) as Array<{ id?: string | null; payload_json?: Record<string, JsonValue> | null }>).filter((row) => {
    return reviewCaseWorkDate(row.payload_json) === params.workDate;
  });
  const matchingExisting = sameDayRows[0];

  const payload = {
    company_id: params.companyId,
    employee_id: params.employeeId,
    case_type: params.caseType,
    source_table: "attendance_punch_events" as const,
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

    const duplicateIds = sameDayRows
      .map((row) => String(row.id || "").trim())
      .filter((id) => id && id !== matchingExisting.id);
    if (duplicateIds.length > 0) {
      const { error: deleteError } = await params.admin
        .from("manual_review_cases")
        .delete()
        .eq("company_id", params.companyId)
        .in("id", duplicateIds);
      if (deleteError) return { ok: false as const, error: deleteError.message || "Unable to delete duplicate manual review cases." };
    }

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

  const duplicateIds = sameDayRows
    .map((row) => String(row.id || "").trim())
    .filter(Boolean);
  if (duplicateIds.length > 0) {
    const { error: deleteError } = await params.admin
      .from("manual_review_cases")
      .delete()
      .eq("company_id", params.companyId)
      .in("id", duplicateIds);
    if (deleteError) return { ok: false as const, error: deleteError.message || "Unable to delete duplicate manual review cases." };
  }

  return { ok: true as const, id: String(data.id), action: "created" as const };
}

export async function ensurePendingPunchReviewCases(params: {
  admin: AdminClientLike;
  companyId?: string;
  monthKey?: string;
}) {
  let query = params.admin
    .from("attendance_punch_events")
    .select("id,company_id,employee_id,punch_type,address_text,is_offline,approval_reason_codes,day_type,effective_punch_at,estimated_time_at,device_time_at,server_received_at")
    .eq("approval_status", "pending_approval")
    .order("server_received_at", { ascending: true })
    .limit(5000);

  if (params.companyId) {
    query = query.eq("company_id", params.companyId);
  }

  const { data, error } = await query;

  if (error) {
    return { ok: false as const, error: error.message || "Unable to load pending punch reviews." };
  }

  const todayIndia = isoDateInIndia(new Date().toISOString());
  const groups = new Map<string, (PunchReviewEventRow & { company_id?: string | null })[]>();
  let touchedGroups = 0;

  ((data || []) as Array<PunchReviewEventRow & { company_id?: string | null }>).forEach((row) => {
    const workDate = punchEventWorkDate(row);
    if (!workDate) return;
    if (params.monthKey && !workDate.startsWith(`${params.monthKey}-`)) return;
    const companyId = String(row.company_id || "").trim();
    const employeeId = String(row.employee_id || "").trim();
    if (!companyId || !employeeId) return;
    const key = `${companyId}:${employeeId}:${workDate}`;
    const bucket = groups.get(key) || [];
    bucket.push(row);
    groups.set(key, bucket);
  });

  for (const [key, rows] of groups.entries()) {
    const [companyId, employeeId, workDate] = key.split(":");
    const hasPunchOut = rows.some((row) => row.punch_type === "out");
    if (!hasPunchOut && workDate >= todayIndia) continue;

    const payload = buildDailyPunchReviewPayload(rows, workDate);
    const result =
      payload.caseType === "holiday_worked_review" || payload.caseType === "weekly_off_worked_review"
        ? await upsertPendingNonWorkingDayReviewCase({
            admin: params.admin,
            companyId,
            employeeId,
            workDate,
            caseType: payload.caseType,
            sourceId: payload.sourceId,
            reasonCodes: payload.reasonCodes,
            payloadJson: payload.payloadJson,
          })
        : await upsertPendingDailyPunchReviewCase({
            admin: params.admin,
            companyId,
            employeeId,
            workDate,
            caseType: payload.caseType,
            sourceId: payload.sourceId,
            reasonCodes: payload.reasonCodes,
            payloadJson: payload.payloadJson,
          });
    if (!result.ok) return result;
    touchedGroups += 1;
  }

  return { ok: true as const, touchedGroups };
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

export async function ensureNonWorkingDayReviewCaseForApprovedDate(params: {
  admin: AdminClientLike;
  companyId: string;
  employeeId: string;
  workDate: string;
  triggerSourceId: string;
  triggerSourceCaseId?: string | null;
  triggerSourceCaseType?: ManualReviewCaseType | null;
}) {
  const { data: employee, error: employeeError } = await params.admin
    .from("employees")
    .select("id,full_name,department,shift_name")
    .eq("company_id", params.companyId)
    .eq("id", params.employeeId)
    .maybeSingle();

  if (employeeError || !employee?.id) {
    return { ok: false as const, error: employeeError?.message || "Unable to load employee for non-working day review." };
  }

  const policyContext = await resolvePoliciesForEmployee(
    params.admin,
    params.companyId,
    params.employeeId,
    params.workDate,
    ["holiday_weekoff"],
  );
  const resolvedHoliday = resolveHolidayPolicyRuntime(policyContext.resolved.holiday_weekoff);

  const { data: dayPunches, error: dayPunchesError } = await params.admin
    .from("attendance_punch_events")
    .select("id,event_id,punch_type,address_text,is_offline,day_type,effective_punch_at,server_received_at")
    .eq("company_id", params.companyId)
    .eq("employee_id", params.employeeId)
    .in("approval_status", ["auto_approved", "approved"])
    .gte("effective_punch_at", `${params.workDate}T00:00:00.000Z`)
    .lt("effective_punch_at", `${params.workDate}T23:59:59.999Z`)
    .order("server_received_at", { ascending: true });

  if (dayPunchesError) {
    return { ok: false as const, error: dayPunchesError.message || "Unable to load day punches for non-working day review." };
  }

  const approvedDayPunches = ((dayPunches || []) as Array<{
    id?: string | null;
    event_id?: string | null;
    punch_type?: "in" | "out" | null;
    address_text?: string | null;
    is_offline?: boolean | null;
    day_type?: string | null;
    effective_punch_at?: string | null;
    server_received_at?: string | null;
  }>).filter((row) => {
    const punchAt = String(row.effective_punch_at || row.server_received_at || "").trim();
    return Boolean(punchAt) && isoDateInIndia(punchAt) === params.workDate;
  });

  if (approvedDayPunches.length === 0) {
    return { ok: true as const, action: "skipped" as const };
  }

  const dayType = String(approvedDayPunches[0]?.day_type || "").trim();
  if (dayType !== "holiday" && dayType !== "weekly_off") {
    return { ok: true as const, action: "skipped" as const };
  }

  const requiredCaseType =
    dayType === "holiday"
      ? "holiday_worked_review"
      : "weekly_off_worked_review";

  const firstIn = approvedDayPunches.find((row) => row.punch_type === "in") || null;
  const lastOut = [...approvedDayPunches].reverse().find((row) => row.punch_type === "out") || null;
  const firstPunchAt = String(firstIn?.effective_punch_at || firstIn?.server_received_at || "").trim();
  const lastPunchAt = String(lastOut?.effective_punch_at || lastOut?.server_received_at || "").trim();
  const workedMinutes = rawWorkedMinutes(firstPunchAt || null, lastPunchAt || null);
  const suggestedTreatment = dayType === "holiday" ? resolvedHoliday.holidayWorkedStatus : resolvedHoliday.weeklyOffWorkedStatus;

  return upsertPendingNonWorkingDayReviewCase({
    admin: params.admin,
    companyId: params.companyId,
    employeeId: params.employeeId,
    caseType: requiredCaseType,
    sourceId: params.triggerSourceId,
    workDate: params.workDate,
    reasonCodes: [
      requiredCaseType.toUpperCase(),
      "NON_WORKING_DAY_TREATMENT_REVIEW",
      params.triggerSourceCaseType ? `TRIGGERED_BY_${params.triggerSourceCaseType.toUpperCase()}` : "TRIGGERED_BY_APPROVED_PUNCH",
    ],
    payloadJson: {
      workDate: params.workDate,
      employeeId: params.employeeId,
      employee: String(employee.full_name || "").trim() || "Unknown Employee",
      department: String(employee.department || "").trim() || "-",
      shift: String(employee.shift_name || "").trim() || "General",
      dayType: dayType === "holiday" ? "Holiday" : "Weekly Off",
      checkIn: firstPunchAt || null,
      checkOut: lastPunchAt || null,
      workedMinutes,
      workHours: workedHoursLabelFromMinutes(workedMinutes),
      suggestedTreatment,
      triggerSourceId: params.triggerSourceId,
      triggerSourceCaseId: params.triggerSourceCaseId || null,
      triggerSourceCaseType: params.triggerSourceCaseType || null,
      offlinePunchPresent: approvedDayPunches.some((row) => Boolean(row.is_offline)),
      addressText:
        String(firstIn?.address_text || "").trim() ||
        String(lastOut?.address_text || "").trim() ||
        null,
    },
  });
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
  caseType: "offline_punch_review" | "punch_on_approved_leave";
  employeeId: string;
  workDate: string;
  sourceId: string;
  action: "approve" | "reject";
  reviewNote: string;
  reviewedBy: string;
}) {
  const reviewedAt = new Date().toISOString();
  const approvalStatus = params.action === "approve" ? "approved" : "rejected";
  const caseStatus = params.action === "approve" ? "approved" : "rejected";

  const { data: punchEvents, error: punchLoadError } = await params.admin
    .from("attendance_punch_events")
    .select("id,employee_id,is_offline,estimated_time_at,device_time_at,server_received_at,effective_punch_at,requires_approval,approval_status,day_type")
    .eq("company_id", params.companyId)
    .eq("employee_id", params.employeeId)
    .eq("approval_status", "pending_approval")
    .order("server_received_at", { ascending: true });

  if (punchLoadError) {
    return { ok: false as const, error: punchLoadError?.message || "Unable to load punch events for review resolution." };
  }

  const dayPunches = ((punchEvents || []) as Array<{
    id?: string | null;
    employee_id?: string | null;
    is_offline?: boolean | null;
    estimated_time_at?: string | null;
    device_time_at?: string | null;
    server_received_at?: string | null;
    effective_punch_at?: string | null;
    requires_approval?: boolean | null;
    approval_status?: string | null;
    day_type?: string | null;
  }>);

  const resolvedWorkDate =
    params.workDate ||
    (() => {
      const sourcePunch = dayPunches.find((row) => String(row.id || "").trim() === params.sourceId);
      return sourcePunch ? punchEventWorkDate(sourcePunch) : "";
    })();

  const matchedDayPunches = dayPunches.filter((row) => punchEventWorkDate(row) === resolvedWorkDate);

  if (matchedDayPunches.length === 0) {
    return { ok: false as const, error: "No pending punch events found for this attendance date." };
  }

  const previousState = matchedDayPunches.map((row) => ({
    id: String(row.id || "").trim(),
    approval_status: row.approval_status || null,
    requires_approval: row.requires_approval ?? null,
    effective_punch_at: row.effective_punch_at || null,
  }));

  for (const punchEvent of matchedDayPunches) {
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
      .eq("id", String(punchEvent.id || "").trim());

    if (punchError) {
      for (const previous of previousState) {
        if (!previous.id) continue;
        await params.admin
          .from("attendance_punch_events")
          .update({
            approval_status: previous.approval_status,
            requires_approval: previous.requires_approval,
            effective_punch_at: previous.effective_punch_at,
          })
          .eq("company_id", params.companyId)
          .eq("id", previous.id);
      }
      return { ok: false as const, error: punchError.message || "Unable to update punch approval status." };
    }
  }

  if (params.action === "approve") {
    const followUpResult = await ensureNonWorkingDayReviewCaseForApprovedDate({
      admin: params.admin,
      companyId: params.companyId,
      employeeId: params.employeeId,
      workDate: resolvedWorkDate,
      triggerSourceId: params.sourceId,
      triggerSourceCaseId: params.caseId,
      triggerSourceCaseType: params.caseType,
    });
    if (!followUpResult.ok) {
      for (const previous of previousState) {
        if (!previous.id) continue;
        await params.admin
          .from("attendance_punch_events")
          .update({
            approval_status: previous.approval_status,
            requires_approval: previous.requires_approval,
            effective_punch_at: previous.effective_punch_at,
          })
          .eq("company_id", params.companyId)
          .eq("id", previous.id);
      }
      return { ok: false as const, error: followUpResult.error };
    }
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
