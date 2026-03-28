import { NextRequest, NextResponse } from "next/server";
import { createDefaultAttendancePolicyConfig } from "@/lib/attendancePolicyDefaults";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { ensureCompanyPolicyDefinitions } from "@/lib/companyPoliciesServer";
import { todayISOInIndia } from "@/lib/dateTime";
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

function normalizeAttendancePenaltyDayValue(value: unknown, fallback: number) {
  const normalized = normalizePenaltyDayValue(value, fallback);
  if (normalized >= 0.5) return "0.5";
  return "0";
}

function isValidIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseWholeNumberInRange(value: unknown, min: number, max: number) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function comparePolicyPriority(
  a: { effectiveFrom: string; updatedAt: string; createdAt: string },
  b: { effectiveFrom: string; updatedAt: string; createdAt: string }
) {
  if (a.effectiveFrom !== b.effectiveFrom) return b.effectiveFrom.localeCompare(a.effectiveFrom);
  if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
  return b.createdAt.localeCompare(a.createdAt);
}

function hasCurrentEffectiveDefaultAfterSave(params: {
  definitions: Array<{
    id: string;
    policyType: string;
    status: string;
    isDefault: boolean;
    effectiveFrom: string;
  }>;
  targetPolicyId?: string;
  nextStatus: string;
  nextIsDefault: boolean;
  nextEffectiveFrom: string;
  today: string;
}) {
  const currentPolicies = params.definitions
    .filter((policy) => policy.policyType === "attendance")
    .map((policy) => ({
      id: policy.id,
      status: policy.status,
      isDefault: policy.isDefault,
      effectiveFrom: policy.effectiveFrom,
    }));

  const nextPolicies = currentPolicies
    .filter((policy) => policy.id !== params.targetPolicyId)
    .map((policy) => ({ ...policy }));

  if (params.nextStatus === "active" && params.nextEffectiveFrom <= params.today) {
    for (const policy of nextPolicies) {
      if (policy.status === "active" && policy.effectiveFrom <= params.nextEffectiveFrom) {
        policy.status = "archived";
        policy.isDefault = false;
      }
    }
  }

  nextPolicies.push({
    id: params.targetPolicyId || "__new_attendance_policy__",
    status: params.nextStatus,
    isDefault: params.nextIsDefault,
    effectiveFrom: params.nextEffectiveFrom,
  });

  return nextPolicies
    .filter((policy) => policy.status === "active")
    .filter((policy) => policy.effectiveFrom <= params.today)
    .some((policy) => policy.isDefault);
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
    const today = todayISOInIndia();
    const attendancePolicies = definitions.filter((policy) => policy.policyType === "attendance");
    const effectiveAttendancePolicies = attendancePolicies
      .filter((policy) => policy.status === "active")
      .filter((policy) => policy.effectiveFrom <= today)
      .sort(comparePolicyPriority);
    const attendancePolicy =
      effectiveAttendancePolicies.find((policy) => policy.isDefault) ||
      effectiveAttendancePolicies[0] ||
      attendancePolicies.find((policy) => policy.isDefault) ||
      [...attendancePolicies].sort(comparePolicyPriority)[0] ||
      null;
    if (!attendancePolicy) {
      return NextResponse.json({ error: "Attendance policy definition not found." }, { status: 404 });
    }

    const rawConfig = (attendancePolicy.configJson || {}) as Record<string, unknown>;
    const normalizedStatus = String(rawConfig.status || attendancePolicy.status || "draft").toLowerCase();
    const config = {
      ...createDefaultAttendancePolicyConfig({
        effectiveFrom: String(attendancePolicy.effectiveFrom || ""),
        nextReviewDate: String(attendancePolicy.nextReviewDate || ""),
        status: normalizedStatus === "active" ? "active" : normalizedStatus === "archived" ? "archived" : "draft",
        defaultCompanyPolicy: attendancePolicy.isDefault ? "Yes" : "No",
      }),
      ...rawConfig,
    } as Record<string, unknown>;

    return NextResponse.json({
      policyId: attendancePolicy.id,
      policyName: String(config.policyName || attendancePolicy.policyName || "Standard Attendance Policy"),
      policyCode: String(config.policyCode || attendancePolicy.policyCode || "ATT-001"),
      effectiveFrom: String(config.effectiveFrom || attendancePolicy.effectiveFrom),
      nextReviewDate: String(config.nextReviewDate || attendancePolicy.nextReviewDate),
      status: normalizedStatus === "active" ? "Active" : normalizedStatus === "archived" ? "Archived" : "Draft",
      defaultCompanyPolicy:
        normalizedStatus === "active" && config.defaultCompanyPolicy !== "No" && attendancePolicy.isDefault !== false ? "Yes" : "No",
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
      penaltyForRepeatLate: normalizeAttendancePenaltyDayValue(config.penaltyForRepeatLate, 0.5),
      latePunchAboveMinutes: String(normalizeLatePenaltyMinutes(config.latePunchUpToMinutes || config.latePunchAboveMinutes, 60)),
      penaltyForLateAboveLimit: normalizeAttendancePenaltyDayValue(config.penaltyForLateAboveLimit, 0.5),
      earlyGoUpToMinutes: String(normalizeLatePenaltyMinutes(config.earlyGoUpToMinutes, 30)),
      repeatEarlyGoDaysInMonth: String(normalizeLatePenaltyCount(config.repeatEarlyGoDaysInMonth, 3)),
      penaltyForRepeatEarlyGo: normalizeAttendancePenaltyDayValue(config.penaltyForRepeatEarlyGo, 0.5),
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
  const policyName = String(body.policyName || policy?.policyName || "").trim();
  const policyCode = String(body.policyCode || policy?.policyCode || "").trim();
  const effectiveFrom = String(body.effectiveFrom || policy?.effectiveFrom || "").trim();
  const nextReviewDate = String(body.nextReviewDate || policy?.nextReviewDate || "").trim();
  const existingPolicyStatus =
    String(policy?.status || "").trim().toLowerCase() === "active"
      ? "active"
      : String(policy?.status || "").trim().toLowerCase() === "archived"
        ? "archived"
        : "draft";
  const existingConfig = {
    ...createDefaultAttendancePolicyConfig({
      effectiveFrom: effectiveFrom || String(policy?.effectiveFrom || ""),
      nextReviewDate: nextReviewDate || String(policy?.nextReviewDate || ""),
      status: existingPolicyStatus,
      defaultCompanyPolicy: policy?.isDefault ? "Yes" : "No",
    }),
    ...((policy?.configJson || {}) as Record<string, unknown>),
  } as Record<string, unknown>;

  if (!policyName) {
    return NextResponse.json({ error: "Policy Name is required." }, { status: 400 });
  }
  if (!policyCode) {
    return NextResponse.json({ error: "Policy Code is required." }, { status: 400 });
  }
  if (!effectiveFrom || !isValidIsoDate(effectiveFrom)) {
    return NextResponse.json({ error: "Valid Effective From date is required." }, { status: 400 });
  }
  if (!nextReviewDate || !isValidIsoDate(nextReviewDate)) {
    return NextResponse.json({ error: "Valid Next Review Date is required." }, { status: 400 });
  }
  if (nextReviewDate < effectiveFrom) {
    return NextResponse.json({ error: "Next Review Date cannot be earlier than Effective From date." }, { status: 400 });
  }

  const normalizedStatus =
    String(body.status || policy?.status || "Draft").trim().toLowerCase() === "active"
      ? "active"
      : String(body.status || policy?.status || "Draft").trim().toLowerCase() === "archived"
        ? "archived"
        : "draft";
  const requestedDefaultCompanyPolicy =
    String(body.defaultCompanyPolicy || (policy?.isDefault ? "Yes" : "No")).trim() === "Yes" ? "Yes" : "No";
  const normalizedDefaultCompanyPolicy = normalizedStatus === "active" && requestedDefaultCompanyPolicy === "Yes" ? "Yes" : "No";
  const normalizedLatePunchRule =
    String(body.latePunchRule || existingConfig.latePunchRule || "enforce_penalty").trim() === "flag_only"
      ? "flag_only"
      : "enforce_penalty";
  const normalizedEarlyGoRule =
    String(body.earlyGoRule || existingConfig.earlyGoRule || "flag_only").trim() === "enforce_penalty"
      ? "enforce_penalty"
      : "flag_only";
  const latePunchUpToMinutesValue = body.latePunchUpToMinutes ?? existingConfig.latePunchUpToMinutes;
  const repeatLateDaysInMonthValue = body.repeatLateDaysInMonth ?? existingConfig.repeatLateDaysInMonth;
  const earlyGoUpToMinutesValue = body.earlyGoUpToMinutes ?? existingConfig.earlyGoUpToMinutes;
  const repeatEarlyGoDaysInMonthValue = body.repeatEarlyGoDaysInMonth ?? existingConfig.repeatEarlyGoDaysInMonth;

  if (normalizedLatePunchRule === "enforce_penalty") {
    if (parseWholeNumberInRange(latePunchUpToMinutesValue, 0, 180) === null) {
      return NextResponse.json({ error: "Late Arrival Up To (mins) must be between 0 and 180 when late punch penalty is enabled." }, { status: 400 });
    }
    if (parseWholeNumberInRange(repeatLateDaysInMonthValue, 1, 31) === null) {
      return NextResponse.json({ error: "Repeat Late Count In Month must be between 1 and 31 when late punch penalty is enabled." }, { status: 400 });
    }
  }

  if (normalizedEarlyGoRule === "enforce_penalty") {
    if (parseWholeNumberInRange(earlyGoUpToMinutesValue, 0, 180) === null) {
      return NextResponse.json({ error: "Early Go Up To (mins) must be between 0 and 180 when early go penalty is enabled." }, { status: 400 });
    }
    if (parseWholeNumberInRange(repeatEarlyGoDaysInMonthValue, 1, 31) === null) {
      return NextResponse.json({ error: "Repeat Early Go Count In Month must be between 1 and 31 when early go penalty is enabled." }, { status: 400 });
    }
  }

  const configJson = {
    ...createDefaultAttendancePolicyConfig({
      policyName,
      policyCode,
      effectiveFrom,
      nextReviewDate,
      status: normalizedStatus,
      defaultCompanyPolicy: normalizedDefaultCompanyPolicy,
    }),
    policyName,
    policyCode,
    effectiveFrom,
    nextReviewDate,
    status: normalizedStatus,
    defaultCompanyPolicy: normalizedDefaultCompanyPolicy,
    presentTrigger: body.presentTrigger || String(existingConfig.presentTrigger || "punch_in_out"),
    singlePunchHandling: body.singlePunchHandling || String(existingConfig.singlePunchHandling || "absent"),
    extraHoursCountingRule: body.extraHoursCountingRule || String(existingConfig.extraHoursCountingRule || "count"),
    latePunchRule: normalizedLatePunchRule,
    earlyGoRule: normalizedEarlyGoRule,
    presentDaysFormula: body.presentDaysFormula || String(existingConfig.presentDaysFormula || "full_plus_half"),
    halfDayValue: body.halfDayValue || String(existingConfig.halfDayValue || "0.5"),
    latePunchPenaltyEnabled:
      (body.latePunchRule || String(existingConfig.latePunchRule || "enforce_penalty")) === "enforce_penalty"
        ? "Yes"
        : "No",
    latePunchUpToMinutes: String(normalizeLatePenaltyMinutes(body.latePunchUpToMinutes ?? existingConfig.latePunchUpToMinutes, 60)),
    repeatLateDaysInMonth: String(normalizeLatePenaltyCount(body.repeatLateDaysInMonth ?? existingConfig.repeatLateDaysInMonth, 3)),
    penaltyForRepeatLate: normalizeAttendancePenaltyDayValue(body.penaltyForRepeatLate ?? existingConfig.penaltyForRepeatLate, 0.5),
    latePunchAboveMinutes: String(
      normalizeLatePenaltyMinutes(
        body.latePunchUpToMinutes ?? body.latePunchAboveMinutes ?? existingConfig.latePunchUpToMinutes ?? existingConfig.latePunchAboveMinutes,
        60
      )
    ),
    penaltyForLateAboveLimit:
      normalizeAttendancePenaltyDayValue(body.penaltyForLateAboveLimit ?? existingConfig.penaltyForLateAboveLimit, 0.5),
    earlyGoUpToMinutes: String(normalizeLatePenaltyMinutes(body.earlyGoUpToMinutes ?? existingConfig.earlyGoUpToMinutes, 30)),
    repeatEarlyGoDaysInMonth:
      String(normalizeLatePenaltyCount(body.repeatEarlyGoDaysInMonth ?? existingConfig.repeatEarlyGoDaysInMonth, 3)),
    penaltyForRepeatEarlyGo:
      normalizeAttendancePenaltyDayValue(body.penaltyForRepeatEarlyGo ?? existingConfig.penaltyForRepeatEarlyGo, 0.5),
    earlyGoAboveMinutes: String(
      normalizeLatePenaltyMinutes(
        body.earlyGoUpToMinutes ?? body.earlyGoAboveMinutes ?? existingConfig.earlyGoUpToMinutes ?? existingConfig.earlyGoAboveMinutes,
        30
      )
    ),
    penaltyForEarlyGoAboveLimit:
      normalizeAttendancePenaltyDayValue(body.penaltyForEarlyGoAboveLimit ?? existingConfig.penaltyForEarlyGoAboveLimit, 0.5),
  };
  const keepsCurrentEffectiveDefault = hasCurrentEffectiveDefaultAfterSave({
    definitions,
    targetPolicyId: policy?.id,
    nextStatus: configJson.status,
    nextIsDefault: configJson.defaultCompanyPolicy === "Yes",
    nextEffectiveFrom: configJson.effectiveFrom,
    today: todayISOInIndia(),
  });

  if (!keepsCurrentEffectiveDefault) {
    return NextResponse.json(
      { error: "At least one current-effective active attendance policy must remain the default." },
      { status: 400 }
    );
  }

  const savePolicyResult = await context.admin.rpc("save_attendance_policy_definition", {
    p_company_id: context.companyId,
    p_admin_email: context.adminEmail,
    p_policy_id: policy?.id || null,
    p_policy_name: configJson.policyName,
    p_policy_code: configJson.policyCode,
    p_status: configJson.status,
    p_effective_from: configJson.effectiveFrom,
    p_next_review_date: configJson.nextReviewDate,
    p_default_company_policy: configJson.defaultCompanyPolicy === "Yes",
    p_config_json: configJson,
  });

  if (savePolicyResult.error || !savePolicyResult.data) {
    return NextResponse.json(
      { error: savePolicyResult.error?.message || "Unable to save attendance policy definition." },
      { status: 400 }
    );
  }

  const policyId = String(savePolicyResult.data);

  return NextResponse.json({ ok: true, policyId });
}
