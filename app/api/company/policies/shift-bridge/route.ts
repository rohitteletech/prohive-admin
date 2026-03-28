import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { DEFAULT_COMPANY_SHIFTS } from "@/lib/companyShiftDefaults";
import { shiftFromDb } from "@/lib/companyShiftDefinitions";
import { ensureCompanyPolicyDefinitions } from "@/lib/companyPoliciesServer";
import { addYearsToIsoDate, todayISOInIndia } from "@/lib/dateTime";
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
  shiftStructure?: "fixed";
  shiftStartTime?: string;
  shiftEndTime?: string;
  halfDayAvailable?: "Yes" | "No";
  halfDayHours?: string;
  punchAccessRule?: "any_time" | "shift_time_only";
  earlyPunchAllowed?: string;
  loginAccessRule?: "any_time" | "shift_time_only";
  earlyInAllowed?: string;
  gracePeriod?: string;
  minimumWorkBeforePunchOut?: string;
  legacyShiftId?: string;
};

function readPunchAccessRule(config: Record<string, unknown>) {
  return normalizeLoginAccessRule(config.punchAccessRule || config.loginAccessRule);
}

function readEarlyPunchAllowed(config: Record<string, unknown>, fallback: unknown) {
  const primary = config.earlyPunchAllowed;
  const legacy = config.earlyInAllowed;
  return String(primary || legacy || fallback || 15);
}

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

function fallbackLegacyShift() {
  if (DEFAULT_COMPANY_SHIFTS[0]) {
    return {
      id: DEFAULT_COMPANY_SHIFTS[0].id,
      name: DEFAULT_COMPANY_SHIFTS[0].name,
      type: DEFAULT_COMPANY_SHIFTS[0].type,
      start: DEFAULT_COMPANY_SHIFTS[0].start,
      end: DEFAULT_COMPANY_SHIFTS[0].end,
      graceMins: DEFAULT_COMPANY_SHIFTS[0].graceMins,
      earlyWindowMins: DEFAULT_COMPANY_SHIFTS[0].earlyWindowMins,
      minWorkBeforeOutMins: DEFAULT_COMPANY_SHIFTS[0].minWorkBeforeOutMins,
      active: DEFAULT_COMPANY_SHIFTS[0].active,
    };
  }

  return FALLBACK_SHIFT;
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

    const legacyShiftResult = await context.admin
      .from("company_shift_definitions")
      .select("id,name,type,start_time,end_time,grace_mins,early_window_mins,min_work_before_out_mins,active")
      .eq("company_id", context.companyId)
      .order("active", { ascending: false })
      .order("created_at", { ascending: true });

    if (legacyShiftResult.error) {
      return NextResponse.json({ error: legacyShiftResult.error.message || "Unable to load legacy shift definition." }, { status: 400 });
    }
    const config = (shiftPolicy.configJson || {}) as Record<string, unknown>;
    const legacyShiftRows = Array.isArray(legacyShiftResult.data)
      ? legacyShiftResult.data.map((row) => shiftFromDb(row as never))
      : [];
    const linkedLegacyShiftId = String(config.legacyShiftId || "").trim();
    const effectiveLegacy: typeof FALLBACK_SHIFT =
      legacyShiftRows.find((row) => row.id === linkedLegacyShiftId) ||
      legacyShiftRows[0] ||
      fallbackLegacyShift();
    const effectiveLegacyStart = String(effectiveLegacy.start || FALLBACK_SHIFT.start);
    const effectiveLegacyEnd = String(effectiveLegacy.end || FALLBACK_SHIFT.end);
    const derivedShiftMinutes = Number(shiftDurationMinutes(effectiveLegacyStart, effectiveLegacyEnd) || 0);
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
      shiftName: String(config.shiftName || effectiveLegacy.name || "General Shift"),
      shiftType: String(config.shiftType || effectiveLegacy.type || "General"),
      shiftStructure: "fixed",
      shiftStartTime: String(config.shiftStartTime || effectiveLegacyStart || "09:00"),
      shiftEndTime: String(config.shiftEndTime || effectiveLegacyEnd || "18:00"),
      halfDayAvailable: config.halfDayAvailable === "No" ? "No" : "Yes",
      halfDayHours: String(
        config.halfDayHours ||
          minutesToClock(derivedHalfDayMinutes, "04:00")
      ),
      punchAccessRule: readPunchAccessRule(config),
      earlyPunchAllowed: readEarlyPunchAllowed(config, effectiveLegacy.earlyWindowMins),
      // Deprecated aliases kept in the response for backward compatibility with older clients.
      loginAccessRule: readPunchAccessRule(config),
      earlyInAllowed: readEarlyPunchAllowed(config, effectiveLegacy.earlyWindowMins),
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
  const existingConfig = (policy?.configJson || {}) as Partial<ShiftBridgePayload>;

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
    normalizedPunchAccessRule = normalizeLoginAccessRule(body.punchAccessRule || body.loginAccessRule || "any_time");
    earlyPunchAllowed = normalizedPunchAccessRule === "any_time"
      ? 0
      : parseWholeNumber(body.earlyPunchAllowed || body.earlyInAllowed || "15", 0, 240, "Early Punch Allowed");
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
    legacyShiftId: body.legacyShiftId || existingConfig.legacyShiftId || "",
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

  const legacyPayload = {
    company_id: context.companyId,
    name: configJson.shiftName,
    type: configJson.shiftType,
    start_time: configJson.shiftStartTime,
    end_time: configJson.shiftEndTime,
    grace_mins: asNumber(configJson.gracePeriod, 10),
    early_window_mins: asNumber(configJson.earlyPunchAllowed, 15),
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

  const { error: companyMirrorError } = await context.admin
    .from("companies")
    .update({
      login_access_rule: normalizedPunchAccessRule,
    })
    .eq("id", context.companyId);

  if (
    companyMirrorError &&
    !String(companyMirrorError.message || "").toLowerCase().includes("login_access_rule")
  ) {
    return NextResponse.json({ error: companyMirrorError.message || "Unable to mirror company login access rule." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, policyId, legacyShiftId });
}
