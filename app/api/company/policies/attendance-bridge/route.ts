import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { ensureCompanyPolicyDefinitions } from "@/lib/companyPoliciesServer";
import {
  normalizeLatePenaltyCount,
  normalizeLatePenaltyMinutes,
  normalizePenaltyDayValue,
} from "@/lib/shiftWorkPolicy";

type AttendanceBridgePayload = {
  policyId?: string;
  policyName?: string;
  policyCode?: string;
  effectiveFrom?: string;
  nextReviewDate?: string;
  status?: "Draft" | "Active" | "Archived";
  defaultCompanyPolicy?: "Yes" | "No";
  presentTrigger?: "punch_in" | "punch_in_out";
  singlePunchHandling?: "present" | "absent";
  extraHoursCountingRule?: "count" | "ignore";
  latePunchRule?: "flag_only" | "enforce_penalty";
  earlyGoRule?: "flag_only" | "enforce_penalty";
  presentDaysFormula?: "full_plus_half" | "full_only";
  halfDayValue?: "0.5" | "1.0";
  latePunchPenaltyEnabled?: "Yes" | "No";
  latePunchUpToMinutes?: string;
  repeatLateDaysInMonth?: string;
  penaltyForRepeatLate?: string;
  latePunchAboveMinutes?: string;
  penaltyForLateAboveLimit?: string;
  earlyGoUpToMinutes?: string;
  repeatEarlyGoDaysInMonth?: string;
  penaltyForRepeatEarlyGo?: string;
  earlyGoAboveMinutes?: string;
  penaltyForEarlyGoAboveLimit?: string;
};

function minutesToClock(value: number, fallback = "00:00") {
  if (!Number.isFinite(value) || value < 0) return fallback;
  const hours = Math.floor(value / 60);
  const minutes = Math.floor(value % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function clockToMinutes(value: unknown, fallback: number) {
  const text = String(value || "").trim();
  const [hours, minutes] = text.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return Math.max(0, hours * 60 + minutes);
}

function normalizeAttendancePenaltyDayValue(value: unknown, fallback: number) {
  const normalized = normalizePenaltyDayValue(value, fallback);
  if (normalized >= 0.5) return "0.5";
  return "0";
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  try {
    const definitions = await ensureCompanyPolicyDefinitions(context.admin, context.companyId, context.adminEmail);
    const attendancePolicy =
      definitions.find((policy) => policy.policyType === "attendance" && policy.isDefault) ||
      definitions.find((policy) => policy.policyType === "attendance") ||
      null;
    if (!attendancePolicy) {
      return NextResponse.json({ error: "Attendance policy definition not found." }, { status: 404 });
    }

    const config = (attendancePolicy.configJson || {}) as Record<string, unknown>;

    return NextResponse.json({
      policyId: attendancePolicy.id,
      policyName: String(config.policyName || attendancePolicy.policyName || "Standard Attendance Policy"),
      policyCode: String(config.policyCode || attendancePolicy.policyCode || "ATT-001"),
      effectiveFrom: String(config.effectiveFrom || attendancePolicy.effectiveFrom),
      nextReviewDate: String(config.nextReviewDate || attendancePolicy.nextReviewDate),
      status:
        String(config.status || attendancePolicy.status || "draft").toLowerCase() === "active"
          ? "Active"
          : String(config.status || attendancePolicy.status || "draft").toLowerCase() === "archived"
            ? "Archived"
            : "Draft",
      defaultCompanyPolicy: (config.defaultCompanyPolicy === "No" || attendancePolicy.isDefault === false) ? "No" : "Yes",
      presentTrigger: config.presentTrigger === "punch_in" ? "punch_in" : "punch_in_out",
      singlePunchHandling: config.singlePunchHandling === "present" ? "present" : "absent",
      extraHoursCountingRule:
        config.extraHoursCountingRule === "ignore"
          ? "ignore"
          : "count",
      latePunchRule: config.latePunchRule === "flag_only" ? "flag_only" : "enforce_penalty",
      earlyGoRule: config.earlyGoRule === "enforce_penalty" || config.earlyGoRule === "affects_penalty" ? "enforce_penalty" : "flag_only",
      presentDaysFormula: config.presentDaysFormula === "full_only" ? "full_only" : "full_plus_half",
      halfDayValue: config.halfDayValue === "1.0" ? "1.0" : "0.5",
      latePunchPenaltyEnabled: config.latePunchPenaltyEnabled === "No" ? "No" : "Yes",
      latePunchUpToMinutes: String(normalizeLatePenaltyMinutes(config.latePunchUpToMinutes, 60)),
      repeatLateDaysInMonth: String(normalizeLatePenaltyCount(config.repeatLateDaysInMonth, 3)),
      penaltyForRepeatLate: normalizeAttendancePenaltyDayValue(config.penaltyForRepeatLate, 1),
      latePunchAboveMinutes: String(normalizeLatePenaltyMinutes(config.latePunchUpToMinutes || config.latePunchAboveMinutes, 60)),
      penaltyForLateAboveLimit: normalizeAttendancePenaltyDayValue(config.penaltyForLateAboveLimit, 0.5),
      earlyGoUpToMinutes: String(normalizeLatePenaltyMinutes(config.earlyGoUpToMinutes, 30)),
      repeatEarlyGoDaysInMonth: String(normalizeLatePenaltyCount(config.repeatEarlyGoDaysInMonth, 3)),
      penaltyForRepeatEarlyGo: normalizeAttendancePenaltyDayValue(config.penaltyForRepeatEarlyGo, 1),
      earlyGoAboveMinutes: String(normalizeLatePenaltyMinutes(config.earlyGoUpToMinutes || config.earlyGoAboveMinutes, 30)),
      penaltyForEarlyGoAboveLimit: normalizeAttendancePenaltyDayValue(config.penaltyForEarlyGoAboveLimit, 0.5),
    } satisfies AttendanceBridgePayload);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load attendance policy bridge." }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as AttendanceBridgePayload;
  const definitions = await ensureCompanyPolicyDefinitions(context.admin, context.companyId, context.adminEmail);
  const policy = body.policyId
    ? definitions.find((definition) => definition.id === body.policyId && definition.policyType === "attendance")
    : null;

  const configJson = {
    policyName: body.policyName || policy?.policyName || "Standard Attendance Policy",
    policyCode: body.policyCode || policy?.policyCode || "ATT-001",
    effectiveFrom: body.effectiveFrom || policy?.effectiveFrom || new Date().toISOString().slice(0, 10),
    nextReviewDate: body.nextReviewDate || policy?.nextReviewDate || new Date().toISOString().slice(0, 10),
    status: (body.status || "Draft").toLowerCase(),
    defaultCompanyPolicy: body.defaultCompanyPolicy || (policy?.isDefault ? "Yes" : "No"),
    presentTrigger: body.presentTrigger || "punch_in_out",
    singlePunchHandling: body.singlePunchHandling || "absent",
    extraHoursCountingRule: body.extraHoursCountingRule || "count",
    latePunchRule: body.latePunchRule || "enforce_penalty",
    earlyGoRule: body.earlyGoRule || "flag_only",
    presentDaysFormula: body.presentDaysFormula || "full_plus_half",
    halfDayValue: body.halfDayValue || "0.5",
    latePunchPenaltyEnabled:
      (body.latePunchRule || "enforce_penalty") === "enforce_penalty"
        ? "Yes"
        : "No",
    latePunchUpToMinutes: String(normalizeLatePenaltyMinutes(body.latePunchUpToMinutes, 60)),
    repeatLateDaysInMonth: String(normalizeLatePenaltyCount(body.repeatLateDaysInMonth, 3)),
    penaltyForRepeatLate: normalizeAttendancePenaltyDayValue(body.penaltyForRepeatLate, 1),
    latePunchAboveMinutes: String(normalizeLatePenaltyMinutes(body.latePunchUpToMinutes || body.latePunchAboveMinutes, 60)),
    penaltyForLateAboveLimit: normalizeAttendancePenaltyDayValue(body.penaltyForLateAboveLimit, 0.5),
    earlyGoUpToMinutes: String(normalizeLatePenaltyMinutes(body.earlyGoUpToMinutes, 30)),
    repeatEarlyGoDaysInMonth: String(normalizeLatePenaltyCount(body.repeatEarlyGoDaysInMonth, 3)),
    penaltyForRepeatEarlyGo: normalizeAttendancePenaltyDayValue(body.penaltyForRepeatEarlyGo, 1),
    earlyGoAboveMinutes: String(normalizeLatePenaltyMinutes(body.earlyGoUpToMinutes || body.earlyGoAboveMinutes, 30)),
    penaltyForEarlyGoAboveLimit: normalizeAttendancePenaltyDayValue(body.penaltyForEarlyGoAboveLimit, 0.5),
  };

  if (configJson.status === "active") {
    const archiveQuery = context.admin
      .from("company_policy_definitions")
      .update({
        status: "archived",
        is_default: false,
      })
      .eq("company_id", context.companyId)
      .eq("policy_type", "attendance")
      .eq("status", "active");

    const { error: archiveError } = policy?.id ? await archiveQuery.neq("id", policy.id) : await archiveQuery;
    if (archiveError) {
      return NextResponse.json({ error: archiveError.message || "Unable to archive existing active attendance policies." }, { status: 400 });
    }
  }

  if (configJson.defaultCompanyPolicy === "Yes") {
    const { error: clearDefaultError } = await context.admin
      .from("company_policy_definitions")
      .update({ is_default: false })
      .eq("company_id", context.companyId)
      .eq("policy_type", "attendance");
    if (clearDefaultError) {
      return NextResponse.json({ error: clearDefaultError.message || "Unable to reset existing default attendance policy." }, { status: 400 });
    }
  }

  let policyId = policy?.id || "";
  if (policy) {
    const { error: policyError } = await context.admin
      .from("company_policy_definitions")
      .update({
        policy_name: configJson.policyName,
        policy_code: configJson.policyCode,
        status: configJson.status,
        is_default: configJson.defaultCompanyPolicy === "Yes",
        effective_from: configJson.effectiveFrom,
        next_review_date: configJson.nextReviewDate,
        config_json: configJson,
      })
      .eq("company_id", context.companyId)
      .eq("id", policy.id);

    if (policyError) {
      return NextResponse.json({ error: policyError.message || "Unable to save attendance policy definition." }, { status: 400 });
    }
  } else {
    const { data: insertedPolicy, error: insertPolicyError } = await context.admin
      .from("company_policy_definitions")
      .insert({
        company_id: context.companyId,
        policy_type: "attendance",
        policy_name: configJson.policyName,
        policy_code: configJson.policyCode,
        status: configJson.status,
        is_default: configJson.defaultCompanyPolicy === "Yes",
        effective_from: configJson.effectiveFrom,
        next_review_date: configJson.nextReviewDate,
        config_json: configJson,
        created_by: context.adminEmail,
      })
      .select("id")
      .maybeSingle();

    if (insertPolicyError || !insertedPolicy?.id) {
      return NextResponse.json({ error: insertPolicyError?.message || "Unable to create attendance policy definition." }, { status: 400 });
    }
    policyId = insertedPolicy.id;
  }

  return NextResponse.json({ ok: true, policyId });
}
