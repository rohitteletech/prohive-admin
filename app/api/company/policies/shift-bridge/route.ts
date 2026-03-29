import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { createDefaultShiftPolicyConfig } from "@/lib/companyShiftDefaults";
import { ensureCompanyPolicyDefinitions } from "@/lib/companyPoliciesServer";
import { addYearsToIsoDate, todayISOInIndia } from "@/lib/dateTime";
import { normalizePunchAccessRule, shiftDurationMinutes } from "@/lib/shiftWorkPolicy";

type ShiftBridgePayload = {
  policyId?: string;
  policyName?: string;
  policyCode?: string;
  effectiveFrom?: string;
  nextReviewDate?: string;
  status?: "Draft" | "Active" | "Archived";
  defaultCompanyPolicy?: "Yes" | "No";
  shiftName?: string;
  shiftType?: string;
  shiftStructure?: "fixed";
  shiftStartTime?: string;
  shiftEndTime?: string;
  halfDayAvailable?: "Yes" | "No";
  halfDayHours?: string;
  punchAccessRule?: "any_time" | "shift_time_only";
  earlyPunchAllowed?: string;
  gracePeriod?: string;
  minimumWorkBeforePunchOut?: string;
};

function readPunchAccessRule(config: Record<string, unknown>) {
  return normalizePunchAccessRule(config.punchAccessRule);
}

function comparePolicyPriority(
  a: { effectiveFrom: string; updatedAt: string; createdAt: string },
  b: { effectiveFrom: string; updatedAt: string; createdAt: string }
) {
  if (a.effectiveFrom !== b.effectiveFrom) return b.effectiveFrom.localeCompare(a.effectiveFrom);
  if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
  return b.createdAt.localeCompare(a.createdAt);
}

function minutesToClock(value: number, fallback = "04:00") {
  if (!Number.isFinite(value) || value < 0) return fallback;
  const hours = Math.floor(value / 60);
  const minutes = Math.floor(value % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function createShiftPolicyCode() {
  return `SFT-${Date.now().toString().slice(-6)}`;
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeValue(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function parseWholeNumber(value: unknown, min: number, max: number, label: string) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} must be a whole number.`);
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }

  return parsed;
}

function fallbackShiftPolicyCode(policyId?: string) {
  const normalized = String(policyId || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (normalized) return `SFT-${normalized.slice(0, 6)}`;
  return createShiftPolicyCode();
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
    const shiftPolicies = definitions.filter((policy) => policy.policyType === "shift");
    const effectiveShiftPolicies = shiftPolicies
      .filter((policy) => policy.status === "active")
      .filter((policy) => policy.effectiveFrom <= today)
      .sort(comparePolicyPriority);
    const shiftPolicy =
      effectiveShiftPolicies.find((policy) => policy.isDefault) ||
      effectiveShiftPolicies[0] ||
      shiftPolicies.find((policy) => policy.isDefault) ||
      [...shiftPolicies].sort(comparePolicyPriority)[0] ||
      null;

    if (!shiftPolicy) {
      return NextResponse.json({ error: "Shift policy definition not found." }, { status: 404 });
    }

    const fallbackConfig = createDefaultShiftPolicyConfig({
      policyName: shiftPolicy.policyName,
      policyCode: shiftPolicy.policyCode,
      effectiveFrom: shiftPolicy.effectiveFrom,
      nextReviewDate: shiftPolicy.nextReviewDate,
      status: shiftPolicy.status,
      defaultCompanyPolicy: shiftPolicy.isDefault ? "Yes" : "No",
    }) as Record<string, unknown>;
    const config = { ...fallbackConfig, ...((shiftPolicy.configJson || {}) as Record<string, unknown>) };
    const shiftStartTime = String(config.shiftStartTime || "09:00");
    const shiftEndTime = String(config.shiftEndTime || "18:00");
    const derivedShiftMinutes = Number(shiftDurationMinutes(shiftStartTime, shiftEndTime) || 0);
    const derivedHalfDayMinutes = Math.max(0, Math.floor(derivedShiftMinutes / 2));
    return NextResponse.json({
      policyId: shiftPolicy.id,
      policyName: String(config.policyName || shiftPolicy.policyName || "Standard Shift Policy"),
      policyCode: String(config.policyCode || shiftPolicy.policyCode || fallbackShiftPolicyCode(shiftPolicy.id)),
      effectiveFrom: String(config.effectiveFrom || shiftPolicy.effectiveFrom),
      nextReviewDate: String(config.nextReviewDate || shiftPolicy.nextReviewDate),
      status:
        String(config.status || shiftPolicy.status || "draft").toLowerCase() === "active"
          ? "Active"
          : String(config.status || shiftPolicy.status || "draft").toLowerCase() === "archived"
            ? "Archived"
            : "Draft",
      defaultCompanyPolicy: (config.defaultCompanyPolicy === "No" || shiftPolicy.isDefault === false) ? "No" : "Yes",
      shiftName: String(config.shiftName || "General Shift"),
      shiftType: String(config.shiftType || "General"),
      shiftStructure: "fixed",
      shiftStartTime,
      shiftEndTime,
      halfDayAvailable: config.halfDayAvailable === "No" ? "No" : "Yes",
      halfDayHours: String(
        config.halfDayHours ||
          minutesToClock(derivedHalfDayMinutes, "04:00")
      ),
      punchAccessRule: readPunchAccessRule(config),
      earlyPunchAllowed: String(config.earlyPunchAllowed || 15),
      gracePeriod: String(config.gracePeriod || 10),
      minimumWorkBeforePunchOut: String(config.minimumWorkBeforePunchOut || 60),
    } satisfies ShiftBridgePayload);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load shift policy bridge." }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as ShiftBridgePayload;
  const definitions = await ensureCompanyPolicyDefinitions(context.admin, context.companyId, context.adminEmail);
  const policy = body.policyId
    ? definitions.find((definition) => definition.id === body.policyId && definition.policyType === "shift")
    : null;
  let policyCode = "";
  let policyName = "";
  let effectiveFrom = "";
  let nextReviewDate = "";
  let shiftName = "";
  let shiftType = "";
  let shiftStartTime = "";
  let shiftEndTime = "";
  let halfDayAvailable: "Yes" | "No" = "Yes";
  let normalizedPunchAccessRule: "any_time" | "shift_time_only" = "any_time";
  let earlyPunchAllowed = 0;
  let gracePeriod = 10;
  let minimumWorkBeforePunchOut = 60;
  let shiftDuration: number | null = null;

  try {
    policyCode = String(body.policyCode || policy?.policyCode || "").trim() || createShiftPolicyCode();
    policyName = String(body.policyName || policy?.policyName || "Standard Shift Policy").trim();
    effectiveFrom = String(body.effectiveFrom || policy?.effectiveFrom || todayISOInIndia()).trim();
    nextReviewDate = String(body.nextReviewDate || policy?.nextReviewDate || addYearsToIsoDate(effectiveFrom, 1)).trim();
    shiftName = String(body.shiftName || "General Shift").trim();
    shiftType = String(body.shiftType || "General").trim();
    shiftStartTime = String(body.shiftStartTime || "09:00").trim();
    shiftEndTime = String(body.shiftEndTime || "18:00").trim();
    halfDayAvailable = body.halfDayAvailable === "No" ? "No" : "Yes";
    normalizedPunchAccessRule = normalizePunchAccessRule(body.punchAccessRule || "any_time");
    earlyPunchAllowed = normalizedPunchAccessRule === "any_time"
      ? 0
      : parseWholeNumber(body.earlyPunchAllowed || "15", 0, 240, "Early Punch Allowed");
    gracePeriod = parseWholeNumber(body.gracePeriod || "10", 0, 120, "Grace Period");
    minimumWorkBeforePunchOut = parseWholeNumber(body.minimumWorkBeforePunchOut || "60", 0, 1440, "Minimum Work Before Punch Out");
    shiftDuration = shiftDurationMinutes(shiftStartTime, shiftEndTime);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid shift policy input." }, { status: 400 });
  }

  if (!policyName) {
    return NextResponse.json({ error: "Policy Name is required." }, { status: 400 });
  }
  if (!policyCode) {
    return NextResponse.json({ error: "Policy Code is required." }, { status: 400 });
  }
  if (!isIsoDate(effectiveFrom)) {
    return NextResponse.json({ error: "Effective From date is required in YYYY-MM-DD format." }, { status: 400 });
  }
  if (!isIsoDate(nextReviewDate)) {
    return NextResponse.json({ error: "Next Review Date is required in YYYY-MM-DD format." }, { status: 400 });
  }
  if (nextReviewDate < effectiveFrom) {
    return NextResponse.json({ error: "Next Review Date cannot be earlier than Effective From date." }, { status: 400 });
  }
  if (!shiftName) {
    return NextResponse.json({ error: "Shift Name is required." }, { status: 400 });
  }
  if (!shiftType) {
    return NextResponse.json({ error: "Shift Type is required." }, { status: 400 });
  }
  if (!isTimeValue(shiftStartTime)) {
    return NextResponse.json({ error: "Shift Start Time must be a valid HH:MM value." }, { status: 400 });
  }
  if (!isTimeValue(shiftEndTime)) {
    return NextResponse.json({ error: "Shift End Time must be a valid HH:MM value." }, { status: 400 });
  }
  if (shiftStartTime === shiftEndTime || !shiftDuration) {
    return NextResponse.json({ error: "Shift Start Time and Shift End Time cannot be the same." }, { status: 400 });
  }

  const configJson = {
    policyName,
    policyCode,
    effectiveFrom,
    nextReviewDate,
    status: (body.status || "Draft").toLowerCase(),
    defaultCompanyPolicy:
      String(body.status || "Draft").toLowerCase() === "active" &&
      (body.defaultCompanyPolicy || (policy?.isDefault ? "Yes" : "No")) === "Yes"
        ? "Yes"
        : "No",
    shiftName,
    shiftType,
    shiftStructure: "fixed",
    shiftStartTime,
    shiftEndTime,
    halfDayAvailable,
    halfDayHours: halfDayAvailable === "No" ? "00:00" : minutesToClock(Math.max(0, Math.floor(shiftDuration / 2)), "04:00"),
    punchAccessRule: normalizedPunchAccessRule,
    earlyPunchAllowed: String(earlyPunchAllowed),
    gracePeriod: String(gracePeriod),
    minimumWorkBeforePunchOut: String(minimumWorkBeforePunchOut),
  };
  const savePolicyResult = await context.admin.rpc("save_shift_policy_definition", {
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
      { error: savePolicyResult.error?.message || "Unable to save shift policy definition." },
      { status: 400 }
    );
  }

  const policyId = String(savePolicyResult.data);

  return NextResponse.json({ ok: true, policyId });
}
