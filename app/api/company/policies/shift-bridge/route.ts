import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { DEFAULT_COMPANY_SHIFTS } from "@/lib/companyShiftDefaults";
import { shiftFromDb } from "@/lib/companyShiftDefinitions";
import { ensureCompanyPolicyDefinitions } from "@/lib/companyPoliciesServer";
import { normalizeLoginAccessRule, shiftDurationMinutes } from "@/lib/shiftWorkPolicy";

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
  shiftStructure?: "fixed" | "rotational";
  shiftStartTime?: string;
  shiftEndTime?: string;
  halfDayAvailable?: "Yes" | "No";
  halfDayHours?: string;
  loginAccessRule?: "any_time" | "shift_time_only";
  earlyInAllowed?: string;
  gracePeriod?: string;
  minimumWorkBeforePunchOut?: string;
  legacyShiftId?: string;
};

const FALLBACK_SHIFT = {
  id: "default-shift",
  name: "General Shift",
  type: "General",
  start: "09:00",
  end: "18:00",
  graceMins: 10,
  earlyWindowMins: 15,
  minWorkBeforeOutMins: 60,
  active: true,
};

function comparePolicyPriority(
  a: { effectiveFrom: string; updatedAt: string; createdAt: string },
  b: { effectiveFrom: string; updatedAt: string; createdAt: string }
) {
  if (a.effectiveFrom !== b.effectiveFrom) return b.effectiveFrom.localeCompare(a.effectiveFrom);
  if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
  return b.createdAt.localeCompare(a.createdAt);
}

function asNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function minutesToClock(value: number, fallback = "04:00") {
  if (!Number.isFinite(value) || value < 0) return fallback;
  const hours = Math.floor(value / 60);
  const minutes = Math.floor(value % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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
    const today = new Date().toISOString().slice(0, 10);
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

    const legacyShiftResult = await context.admin
      .from("company_shift_definitions")
      .select("id,name,type,start_time,end_time,grace_mins,early_window_mins,min_work_before_out_mins,active")
      .eq("company_id", context.companyId)
      .order("active", { ascending: false })
      .order("created_at", { ascending: true });

    if (legacyShiftResult.error) {
      return NextResponse.json({ error: legacyShiftResult.error.message || "Unable to load legacy shift definition." }, { status: 400 });
    }
    const firstLegacyCandidate =
      Array.isArray(legacyShiftResult.data) && legacyShiftResult.data.length > 0
        ? shiftFromDb(legacyShiftResult.data[0] as never)
        : null;
    const effectiveLegacy: typeof FALLBACK_SHIFT =
      firstLegacyCandidate ??
      (DEFAULT_COMPANY_SHIFTS[0]
        ? {
            id: DEFAULT_COMPANY_SHIFTS[0].id,
            name: DEFAULT_COMPANY_SHIFTS[0].name,
            type: DEFAULT_COMPANY_SHIFTS[0].type,
            start: DEFAULT_COMPANY_SHIFTS[0].start,
            end: DEFAULT_COMPANY_SHIFTS[0].end,
            graceMins: DEFAULT_COMPANY_SHIFTS[0].graceMins,
            earlyWindowMins: DEFAULT_COMPANY_SHIFTS[0].earlyWindowMins,
            minWorkBeforeOutMins: DEFAULT_COMPANY_SHIFTS[0].minWorkBeforeOutMins,
            active: DEFAULT_COMPANY_SHIFTS[0].active,
          }
        : FALLBACK_SHIFT);
    const effectiveLegacyStart = String(effectiveLegacy.start || FALLBACK_SHIFT.start);
    const effectiveLegacyEnd = String(effectiveLegacy.end || FALLBACK_SHIFT.end);
    const derivedShiftMinutes = Number(shiftDurationMinutes(effectiveLegacyStart, effectiveLegacyEnd) || 0);
    const derivedHalfDayMinutes = Math.max(0, Math.floor(derivedShiftMinutes / 2));

    const config = (shiftPolicy.configJson || {}) as Record<string, unknown>;
    return NextResponse.json({
      policyId: shiftPolicy.id,
      policyName: String(config.policyName || shiftPolicy.policyName || "Standard Shift Policy"),
      policyCode: String(config.policyCode || shiftPolicy.policyCode || "SFT-001"),
      effectiveFrom: String(config.effectiveFrom || shiftPolicy.effectiveFrom),
      nextReviewDate: String(config.nextReviewDate || shiftPolicy.nextReviewDate),
      status:
        String(config.status || shiftPolicy.status || "draft").toLowerCase() === "active"
          ? "Active"
          : String(config.status || shiftPolicy.status || "draft").toLowerCase() === "archived"
            ? "Archived"
            : "Draft",
      defaultCompanyPolicy: (config.defaultCompanyPolicy === "No" || shiftPolicy.isDefault === false) ? "No" : "Yes",
      shiftName: String(config.shiftName || effectiveLegacy.name || "General Shift"),
      shiftType: String(config.shiftType || effectiveLegacy.type || "General"),
      shiftStructure: config.shiftStructure === "rotational" ? "rotational" : "fixed",
      shiftStartTime: String(config.shiftStartTime || effectiveLegacyStart || "09:00"),
      shiftEndTime: String(config.shiftEndTime || effectiveLegacyEnd || "18:00"),
      halfDayAvailable: config.halfDayAvailable === "No" ? "No" : "Yes",
      halfDayHours: String(
        config.halfDayHours ||
          minutesToClock(derivedHalfDayMinutes, "04:00")
      ),
      loginAccessRule: normalizeLoginAccessRule(config.loginAccessRule),
      earlyInAllowed: String(config.earlyInAllowed || effectiveLegacy.earlyWindowMins || 15),
      gracePeriod: String(config.gracePeriod || effectiveLegacy.graceMins || 10),
      minimumWorkBeforePunchOut: String(config.minimumWorkBeforePunchOut || effectiveLegacy.minWorkBeforeOutMins || 60),
      legacyShiftId: String(config.legacyShiftId || effectiveLegacy.id || ""),
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

  const configJson = {
    policyName: body.policyName || policy?.policyName || "Standard Shift Policy",
    policyCode: body.policyCode || policy?.policyCode || "SFT-001",
    effectiveFrom: body.effectiveFrom || policy?.effectiveFrom || new Date().toISOString().slice(0, 10),
    nextReviewDate: body.nextReviewDate || policy?.nextReviewDate || new Date().toISOString().slice(0, 10),
    status: (body.status || "Draft").toLowerCase(),
    defaultCompanyPolicy: body.defaultCompanyPolicy || (policy?.isDefault ? "Yes" : "No"),
    shiftName: body.shiftName || "General Shift",
    shiftType: body.shiftType || "General",
    shiftStructure: body.shiftStructure || "fixed",
    shiftStartTime: body.shiftStartTime || "09:00",
    shiftEndTime: body.shiftEndTime || "18:00",
    halfDayAvailable: body.halfDayAvailable || "Yes",
    halfDayHours: body.halfDayAvailable === "No" ? "00:00" : String(body.halfDayHours || "04:00"),
    loginAccessRule: body.loginAccessRule || "any_time",
    earlyInAllowed:
      (body.loginAccessRule || "any_time") === "any_time"
        ? "0"
        : String(body.earlyInAllowed || "15"),
    gracePeriod: String(body.gracePeriod || "10"),
    minimumWorkBeforePunchOut: String(body.minimumWorkBeforePunchOut || "60"),
    legacyShiftId: body.legacyShiftId || "",
  };
  const currentPolicyId = policy?.id || "";
  const today = new Date().toISOString().slice(0, 10);
  const isFutureEffectiveActive = configJson.status === "active" && configJson.effectiveFrom > today;

  if (configJson.status === "active") {
    const archiveQuery = context.admin
      .from("company_policy_definitions")
      .update({
        status: "archived",
        is_default: false,
      })
      .eq("company_id", context.companyId)
      .eq("policy_type", "shift")
      .eq("status", "active");
    const scopedArchiveQuery = isFutureEffectiveActive
      ? archiveQuery.eq("effective_from", configJson.effectiveFrom)
      : archiveQuery.lte("effective_from", configJson.effectiveFrom);
    const { error: archiveError } = currentPolicyId ? await scopedArchiveQuery.neq("id", currentPolicyId) : await scopedArchiveQuery;

    if (archiveError) {
      return NextResponse.json({ error: archiveError.message || "Unable to archive existing active shift policies." }, { status: 400 });
    }
  }

  if (configJson.defaultCompanyPolicy === "Yes") {
    const clearDefaultQuery = context.admin
      .from("company_policy_definitions")
      .update({ is_default: false })
      .eq("company_id", context.companyId)
      .eq("policy_type", "shift");
    const scopedDefaultQuery = isFutureEffectiveActive
      ? clearDefaultQuery.eq("effective_from", configJson.effectiveFrom)
      : clearDefaultQuery.lte("effective_from", configJson.effectiveFrom);
    const { error: clearDefaultError } = currentPolicyId ? await scopedDefaultQuery.neq("id", currentPolicyId) : await scopedDefaultQuery;
    if (clearDefaultError) {
      return NextResponse.json({ error: clearDefaultError.message || "Unable to reset existing default shift policy." }, { status: 400 });
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
      return NextResponse.json({ error: policyError.message || "Unable to save shift policy definition." }, { status: 400 });
    }
  } else {
    const { data: insertedPolicy, error: insertPolicyError } = await context.admin
      .from("company_policy_definitions")
      .insert({
        company_id: context.companyId,
        policy_type: "shift",
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
      return NextResponse.json({ error: insertPolicyError?.message || "Unable to create shift policy definition." }, { status: 400 });
    }
    policyId = insertedPolicy.id;
  }

  const legacyPayload = {
    company_id: context.companyId,
    name: configJson.shiftName,
    type: configJson.shiftType,
    start_time: configJson.shiftStartTime,
    end_time: configJson.shiftEndTime,
    grace_mins: asNumber(configJson.gracePeriod, 10),
    early_window_mins: asNumber(configJson.earlyInAllowed, 15),
    min_work_before_out_mins: asNumber(configJson.minimumWorkBeforePunchOut, 60),
    active: true,
  };

  let legacyShiftId = String(body.legacyShiftId || configJson.legacyShiftId || "").trim();
  if (legacyShiftId) {
    const { error: updateLegacyError } = await context.admin
      .from("company_shift_definitions")
      .update(legacyPayload)
      .eq("company_id", context.companyId)
      .eq("id", legacyShiftId);
    if (updateLegacyError) {
      return NextResponse.json({ error: updateLegacyError.message || "Unable to update legacy shift row." }, { status: 400 });
    }
  } else {
    const { data: insertedLegacy, error: insertLegacyError } = await context.admin
      .from("company_shift_definitions")
      .insert({ ...legacyPayload, id: crypto.randomUUID() })
      .select("id")
      .maybeSingle();
    if (insertLegacyError || !insertedLegacy?.id) {
      return NextResponse.json({ error: insertLegacyError?.message || "Unable to insert legacy shift row." }, { status: 400 });
    }
    legacyShiftId = insertedLegacy.id;
  }

  const { error: patchConfigError } = await context.admin
    .from("company_policy_definitions")
    .update({
      config_json: { ...configJson, legacyShiftId },
    })
    .eq("company_id", context.companyId)
    .eq("id", policyId);

  if (patchConfigError) {
    return NextResponse.json({ error: patchConfigError.message || "Unable to finalize shift policy config." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, policyId, legacyShiftId });
}
