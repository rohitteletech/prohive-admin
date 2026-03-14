import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { DEFAULT_COMPANY_SHIFTS } from "@/lib/companyShiftDefaults";
import { shiftFromDb } from "@/lib/companyShiftDefinitions";
import { ensureCompanyPolicyDefinitions } from "@/lib/companyPoliciesServer";
import {
  normalizeExtraHoursPolicy,
  normalizeHalfDayMinWorkMins,
  normalizeLatePenaltyCount,
  normalizeLatePenaltyMinutes,
  normalizePenaltyDayValue,
  shiftDurationMinutes,
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
  singlePunchHandling?: "incomplete_punch" | "half_day" | "absent";
  fullDayMinimumHours?: string;
  halfDayMinimumHours?: string;
  absentRule?: "no_punch_or_below_minimum" | "below_half_day_threshold" | "manual_override";
  extraHoursCountingRule?: "count" | "ignore";
  latePunchRule?: "flag_only" | "affects_penalty";
  earlyGoRule?: "flag_only" | "affects_penalty";
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

    const [companyResult, shiftResult] = await Promise.all([
      context.admin
        .from("companies")
        .select(
          "half_day_min_work_mins,extra_hours_policy,late_penalty_enabled,late_penalty_up_to_mins,late_penalty_repeat_count,late_penalty_repeat_days,late_penalty_above_mins,late_penalty_above_days"
        )
        .eq("id", context.companyId)
        .maybeSingle(),
      context.admin
        .from("company_shift_definitions")
        .select("id,name,type,start_time,end_time,grace_mins,early_window_mins,min_work_before_out_mins,active")
        .eq("company_id", context.companyId)
        .order("active", { ascending: false })
        .order("created_at", { ascending: true }),
    ]);

    if (companyResult.error) {
      return NextResponse.json({ error: companyResult.error.message || "Unable to load legacy attendance settings." }, { status: 400 });
    }
    if (shiftResult.error) {
      return NextResponse.json({ error: shiftResult.error.message || "Unable to load supporting shift settings." }, { status: 400 });
    }

    const firstShift =
      (Array.isArray(shiftResult.data) && shiftResult.data.length > 0
        ? shiftFromDb(shiftResult.data[0] as never)
        : DEFAULT_COMPANY_SHIFTS[0]) || DEFAULT_COMPANY_SHIFTS[0];
    const fullDayMinutes = shiftDurationMinutes(firstShift.start, firstShift.end) || 480;
    const halfDayMinutes = normalizeHalfDayMinWorkMins(companyResult.data?.half_day_min_work_mins, 240);
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
      singlePunchHandling: config.singlePunchHandling === "half_day" || config.singlePunchHandling === "absent" ? config.singlePunchHandling : "incomplete_punch",
      fullDayMinimumHours: String(config.fullDayMinimumHours || minutesToClock(fullDayMinutes, "08:00")),
      halfDayMinimumHours: String(config.halfDayMinimumHours || minutesToClock(halfDayMinutes, "04:00")),
      absentRule:
        config.absentRule === "below_half_day_threshold" || config.absentRule === "manual_override"
          ? config.absentRule
          : "no_punch_or_below_minimum",
      extraHoursCountingRule:
        config.extraHoursCountingRule === "ignore"
          ? "ignore"
          : normalizeExtraHoursPolicy(companyResult.data?.extra_hours_policy) === "no"
            ? "ignore"
            : "count",
      latePunchRule: config.latePunchRule === "flag_only" ? "flag_only" : "affects_penalty",
      earlyGoRule: config.earlyGoRule === "affects_penalty" ? "affects_penalty" : "flag_only",
      presentDaysFormula: config.presentDaysFormula === "full_only" ? "full_only" : "full_plus_half",
      halfDayValue: config.halfDayValue === "1.0" ? "1.0" : "0.5",
      latePunchPenaltyEnabled:
        config.latePunchPenaltyEnabled === "No" || companyResult.data?.late_penalty_enabled !== true ? "No" : "Yes",
      latePunchUpToMinutes: String(config.latePunchUpToMinutes || normalizeLatePenaltyMinutes(companyResult.data?.late_penalty_up_to_mins)),
      repeatLateDaysInMonth: String(config.repeatLateDaysInMonth || normalizeLatePenaltyCount(companyResult.data?.late_penalty_repeat_count)),
      penaltyForRepeatLate: String(config.penaltyForRepeatLate || normalizePenaltyDayValue(companyResult.data?.late_penalty_repeat_days, 1)),
      latePunchAboveMinutes: String(config.latePunchAboveMinutes || normalizeLatePenaltyMinutes(companyResult.data?.late_penalty_above_mins)),
      penaltyForLateAboveLimit: String(config.penaltyForLateAboveLimit || normalizePenaltyDayValue(companyResult.data?.late_penalty_above_days, 0.5)),
      earlyGoUpToMinutes: String(config.earlyGoUpToMinutes || "30"),
      repeatEarlyGoDaysInMonth: String(config.repeatEarlyGoDaysInMonth || "3"),
      penaltyForRepeatEarlyGo: String(config.penaltyForRepeatEarlyGo || "1"),
      earlyGoAboveMinutes: String(config.earlyGoAboveMinutes || "60"),
      penaltyForEarlyGoAboveLimit: String(config.penaltyForEarlyGoAboveLimit || "0.5"),
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
    singlePunchHandling: body.singlePunchHandling || "incomplete_punch",
    fullDayMinimumHours: body.fullDayMinimumHours || "08:00",
    halfDayMinimumHours: body.halfDayMinimumHours || "04:00",
    absentRule: body.absentRule || "no_punch_or_below_minimum",
    extraHoursCountingRule: body.extraHoursCountingRule || "count",
    latePunchRule: body.latePunchRule || "affects_penalty",
    earlyGoRule: body.earlyGoRule || "flag_only",
    presentDaysFormula: body.presentDaysFormula || "full_plus_half",
    halfDayValue: body.halfDayValue || "0.5",
    latePunchPenaltyEnabled:
      (body.latePunchRule || "affects_penalty") === "affects_penalty"
        ? "Yes"
        : "No",
    latePunchUpToMinutes: String(body.latePunchUpToMinutes || "60"),
    repeatLateDaysInMonth: String(body.repeatLateDaysInMonth || "3"),
    penaltyForRepeatLate: String(body.penaltyForRepeatLate || "1"),
    latePunchAboveMinutes: String(body.latePunchAboveMinutes || "60"),
    penaltyForLateAboveLimit: String(body.penaltyForLateAboveLimit || "0.5"),
    earlyGoUpToMinutes: String(body.earlyGoUpToMinutes || "30"),
    repeatEarlyGoDaysInMonth: String(body.repeatEarlyGoDaysInMonth || "3"),
    penaltyForRepeatEarlyGo: String(body.penaltyForRepeatEarlyGo || "1"),
    earlyGoAboveMinutes: String(body.earlyGoAboveMinutes || "60"),
    penaltyForEarlyGoAboveLimit: String(body.penaltyForEarlyGoAboveLimit || "0.5"),
  };

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

  const { error: companyError } = await context.admin
    .from("companies")
    .update({
      half_day_min_work_mins: normalizeHalfDayMinWorkMins(clockToMinutes(configJson.halfDayMinimumHours, 240), 240),
      extra_hours_policy: configJson.extraHoursCountingRule === "ignore" ? "no" : "yes",
      late_penalty_enabled: configJson.latePunchPenaltyEnabled === "Yes",
      late_penalty_up_to_mins: normalizeLatePenaltyMinutes(configJson.latePunchUpToMinutes, 60),
      late_penalty_repeat_count: normalizeLatePenaltyCount(configJson.repeatLateDaysInMonth, 3),
      late_penalty_repeat_days: normalizePenaltyDayValue(configJson.penaltyForRepeatLate, 1),
      late_penalty_above_mins: normalizeLatePenaltyMinutes(configJson.latePunchAboveMinutes, 60),
      late_penalty_above_days: normalizePenaltyDayValue(configJson.penaltyForLateAboveLimit, 0.5),
    })
    .eq("id", context.companyId);

  if (companyError) {
    return NextResponse.json({ error: companyError.message || "Unable to sync legacy attendance settings." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, policyId });
}
