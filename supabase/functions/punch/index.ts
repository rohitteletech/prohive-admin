import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function toIsoFromMs(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value).toISOString();
}

function normalizeTimeZone(value: unknown) {
  const timeZone = String(value || "").trim();
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

function isoDateInTimeZone(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const lookup = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${lookup("year")}-${lookup("month")}-${lookup("day")}`;
}

function parseReasonCodes(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isWeeklyOffDate(dateIso: string, policy: unknown) {
  const weeklyPolicy = String(policy || "sunday_only");
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  const day = date.getUTCDay();
  if (weeklyPolicy === "sunday_only") return day === 0;
  if (weeklyPolicy === "saturday_sunday") return day === 0 || day === 6;
  if (weeklyPolicy === "second_fourth_saturday_sunday") {
    if (day === 0) return true;
    if (day !== 6) return false;
    const weekOfMonth = Math.floor((date.getUTCDate() - 1) / 7) + 1;
    return weekOfMonth === 2 || weekOfMonth === 4;
  }
  return day === 0;
}

function normalizeLoginAccessRule(value: unknown) {
  return String(value || "").trim().toLowerCase() === "shift_time_only" ? "shift_time_only" : "any_time";
}

function normalizeWeeklyOffPolicy(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "saturday_sunday") return "saturday_sunday";
  if (normalized === "second_fourth_saturday_sunday") return "second_fourth_saturday_sunday";
  return "sunday_only";
}

function text(value: unknown, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function wholeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function yesNo(value: unknown, fallback: "Yes" | "No" = "No") {
  return String(value || "").trim() === "Yes" ? "Yes" : fallback;
}

type PolicyType = "shift" | "attendance" | "leave" | "holiday_weekoff" | "correction";
type AssignmentLevel = "company" | "department" | "employee";

type PolicyDefinition = {
  id: string;
  policyType: PolicyType;
  isDefault: boolean;
  effectiveFrom: string;
  configJson: Record<string, unknown>;
};

type PolicyAssignment = {
  policyType: PolicyType;
  policyId: string;
  assignmentLevel: AssignmentLevel;
  targetId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
};

function compareAssignmentPriority(level: AssignmentLevel) {
  if (level === "employee") return 3;
  if (level === "department") return 2;
  return 1;
}

function isAssignmentEffective(
  assignment: Pick<PolicyAssignment, "effectiveFrom" | "effectiveTo" | "isActive">,
  onDate: string,
) {
  if (!assignment.isActive) return false;
  if (assignment.effectiveFrom > onDate) return false;
  if (assignment.effectiveTo && assignment.effectiveTo < onDate) return false;
  return true;
}

function resolvePolicyForEmployee(params: {
  policyType: PolicyType;
  employeeId: string;
  department?: string | null;
  onDate: string;
  assignments: PolicyAssignment[];
  definitions: PolicyDefinition[];
}) {
  const applicable = params.assignments
    .filter((assignment) => assignment.policyType === params.policyType)
    .filter((assignment) => isAssignmentEffective(assignment, params.onDate))
    .filter((assignment) => {
      if (assignment.assignmentLevel === "employee") return assignment.targetId === params.employeeId;
      if (assignment.assignmentLevel === "department") return Boolean(params.department) && assignment.targetId === params.department;
      return true;
    })
    .sort((a, b) => compareAssignmentPriority(b.assignmentLevel) - compareAssignmentPriority(a.assignmentLevel));

  const matched = applicable[0];
  if (matched) {
    return params.definitions.find((definition) => definition.id === matched.policyId) || null;
  }
  return params.definitions.find((definition) => definition.policyType === params.policyType && definition.isDefault) || null;
}

function resolveShiftPolicyRuntime(policy: PolicyDefinition | null, fallback?: {
  shiftName?: string;
  shiftType?: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  loginAccessRule?: string;
  earlyInAllowed?: number;
  minimumWorkBeforePunchOut?: number;
}) {
  const config = (policy?.configJson || {}) as Record<string, unknown>;
  return {
    shiftName: text(config.shiftName, fallback?.shiftName || "General Shift"),
    shiftType: text(config.shiftType, fallback?.shiftType || "General"),
    shiftStartTime: text(config.shiftStartTime, fallback?.shiftStartTime || "09:00"),
    shiftEndTime: text(config.shiftEndTime, fallback?.shiftEndTime || "18:00"),
    loginAccessRule: normalizeLoginAccessRule(config.loginAccessRule || fallback?.loginAccessRule),
    earlyInAllowed: wholeNumber(config.earlyInAllowed, fallback?.earlyInAllowed ?? 15),
    minimumWorkBeforePunchOut: wholeNumber(config.minimumWorkBeforePunchOut, fallback?.minimumWorkBeforePunchOut ?? 60),
  };
}

function resolveHolidayPolicyRuntime(policy: PolicyDefinition | null, fallback?: {
  weeklyOffPolicy?: unknown;
  allowPunchOnHoliday?: boolean;
  allowPunchOnWeeklyOff?: boolean;
}) {
  const config = (policy?.configJson || {}) as Record<string, unknown>;
  const weeklyOffPattern = text(config.weeklyOffPattern);
  const weeklyOffPolicy =
    weeklyOffPattern === "Saturday + Sunday"
      ? "saturday_sunday"
      : weeklyOffPattern === "2nd and 4th Saturday + Sunday" || weeklyOffPattern === "Alternate Saturday + Sunday"
        ? "second_fourth_saturday_sunday"
        : normalizeWeeklyOffPolicy(fallback?.weeklyOffPolicy);

  return {
    weeklyOffPolicy,
    allowPunchOnHoliday:
      yesNo(config.holidayPunchAllowed, fallback?.allowPunchOnHoliday === false ? "No" : "Yes") === "Yes",
    allowPunchOnWeeklyOff:
      yesNo(config.weeklyOffPunchAllowed, fallback?.allowPunchOnWeeklyOff === false ? "No" : "Yes") === "Yes",
  };
}

function resolveLeavePolicyRuntime(policy: PolicyDefinition | null) {
  const config = (policy?.configJson || {}) as Record<string, unknown>;
  const action = text(
    config.ifEmployeePunchesOnApprovedLeave,
    text(config.leaveOverridesAttendance) === "Yes" ? "Keep Leave" : "Allow Punch and Send for Approval",
  );
  return {
    ifEmployeePunchesOnApprovedLeave:
      action === "Keep Leave" || action === "Block Punch" || action === "Allow Punch and Send for Approval"
        ? action
        : "Allow Punch and Send for Approval",
  } as const;
}

function normalizeText(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findMatchingShiftRule(
  shiftName: string,
  shiftRows: Array<{ name: string; type: string; startTime: string; endTime: string; earlyWindowMins: number }>
) {
  const normalizedShiftName = normalizeText(shiftName);
  return (
    shiftRows.find((row) => {
      const name = normalizeText(row.name);
      const type = normalizeText(row.type);
      return normalizedShiftName ? normalizedShiftName === name || normalizedShiftName === type : false;
    }) ||
    shiftRows.find((row) => normalizeText(row.name) === "general") ||
    shiftRows[0] ||
    null
  );
}

function minutesOfDayInTimeZone(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const lookup = (type: string) => Number(parts.find((part) => part.type === type)?.value || "0");
  return lookup("hour") * 60 + lookup("minute");
}

function timeToMinutes(value: string) {
  const [h, m] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function rawWorkedMinutes(checkInIso: string | null, checkOutIso: string | null) {
  if (!checkInIso || !checkOutIso) return 0;
  const diffMs = new Date(checkOutIso).getTime() - new Date(checkInIso).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.floor(diffMs / 60000);
}

function isMinuteInWrappedRange(value: number, start: number, end: number) {
  if (start <= end) return value >= start && value <= end;
  return value >= start || value <= end;
}

function isPunchInAllowedByShiftWindow(params: {
  punchIso: string;
  timeZone: string;
  shiftStart: string;
  shiftEnd: string;
  earlyWindowMins: number;
}) {
  const shiftStartMin = timeToMinutes(params.shiftStart);
  const shiftEndMin = timeToMinutes(params.shiftEnd);
  if (shiftStartMin === null || shiftEndMin === null) return true;
  const currentMin = minutesOfDayInTimeZone(params.punchIso, params.timeZone);
  const earlyWindow = Math.max(0, Math.min(1440, Math.floor(params.earlyWindowMins || 0)));
  const windowStart = ((shiftStartMin - earlyWindow) % 1440 + 1440) % 1440;
  return isMinuteInWrappedRange(currentMin, windowStart, shiftEndMin);
}

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function chooseEffectivePunchAt({
  serverNowIso,
  isOffline,
  approvalStatus,
  estimatedTimeIso,
  deviceTimeIso,
}: {
  serverNowIso: string;
  isOffline: boolean;
  approvalStatus: string;
  estimatedTimeIso: string | null;
  deviceTimeIso: string | null;
}) {
  if (approvalStatus === "pending_approval") return null;
  if (!isOffline) return serverNowIso;
  return estimatedTimeIso || deviceTimeIso || serverNowIso;
}

function buildApproval({
  payload,
  employee,
  company,
  distanceFromOfficeM,
}: {
  payload: Record<string, unknown>;
  employee: Record<string, unknown>;
  company: Record<string, unknown>;
  distanceFromOfficeM: number | null;
}) {
  const reasons: string[] = [];
  const incomingReasonCodes = parseReasonCodes(payload.approval_reason_codes);

  if (!payload.is_offline && !String(payload.address || "").trim()) {
    return {
      ok: false,
      status: 400,
      body: {
        code: "ADDRESS_REQUIRED",
        error: "Address is required for online punch.",
      },
    };
  }

  if (incomingReasonCodes.includes("MOCK_LOCATION") || incomingReasonCodes.includes("FAKE_GPS")) {
    return {
      ok: false,
      status: 403,
      body: {
        code: "MOCK_LOCATION_DETECTED",
        error: "Mock or fake GPS is not allowed for punch.",
      },
    };
  }

  if (employee.attendance_mode === "office_only") {
    if (
      company.office_lat == null ||
      company.office_lon == null ||
      company.office_radius_m == null ||
      Number(company.office_radius_m) <= 0
    ) {
      return {
        ok: false,
        status: 403,
        body: {
          code: "OFFICE_LOCATION_NOT_CONFIGURED",
          error: "Office location is not configured for this company.",
        },
      };
    }

    if (distanceFromOfficeM == null || distanceFromOfficeM > Number(company.office_radius_m)) {
      return {
        ok: false,
        status: 403,
        body: {
          code: "OUTSIDE_OFFICE_RADIUS",
          error: "Punch is outside the allowed office area.",
        },
      };
    }
  }

  if (Number(payload.accuracy_m) > 80) {
    reasons.push("GPS_WEAK_ACCURACY");
  }

  if (
    payload.clock_drift_ms != null &&
    Number.isFinite(Number(payload.clock_drift_ms)) &&
    Math.abs(Number(payload.clock_drift_ms)) > 120000
  ) {
    reasons.push("CLOCK_DRIFT_EXCEEDED");
  }

  if (payload.is_offline) {
    reasons.push(...incomingReasonCodes);
    if (payload.requires_approval) {
      reasons.push("CLIENT_MARKED_REQUIRES_APPROVAL");
    }
    if (!payload.estimated_time_ms) {
      reasons.push("OFFLINE_NO_ESTIMATED_TIME");
    }
  }

  const dedupedReasons = [...new Set(reasons)];
  return {
    ok: true,
    approvalStatus: dedupedReasons.length ? "pending_approval" : "auto_approved",
    approvalReasonCodes: dedupedReasons,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Supabase environment is not configured." }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "Invalid JSON payload." }, 400);
  }

  const payload = {
    company_id: String(body.company_id || "").trim(),
    employee_id: String(body.employee_id || "").trim(),
    device_id: String(body.device_id || "").trim(),
    event_id: String(body.event_id || "").trim(),
    punch_type: String(body.punch_type || "").trim(),
    lat: Number(body.lat),
    lon: Number(body.lon),
    address: typeof body.address === "string" ? body.address.trim() : null,
    accuracy_m: Number(body.accuracy_m),
    is_offline: Boolean(body.is_offline),
    device_time_ms: Number(body.device_time_ms),
    device_time_zone: normalizeTimeZone(body.device_time_zone),
    elapsed_ms: Number(body.elapsed_ms),
    estimated_time_ms:
      body.estimated_time_ms == null || body.estimated_time_ms === "" ? null : Number(body.estimated_time_ms),
    trusted_anchor_time_ms:
      body.trusted_anchor_time_ms == null || body.trusted_anchor_time_ms === ""
        ? null
        : Number(body.trusted_anchor_time_ms),
    trusted_anchor_elapsed_ms:
      body.trusted_anchor_elapsed_ms == null || body.trusted_anchor_elapsed_ms === ""
        ? null
        : Number(body.trusted_anchor_elapsed_ms),
    clock_drift_ms:
      body.clock_drift_ms == null || body.clock_drift_ms === "" ? null : Number(body.clock_drift_ms),
    requires_approval: Boolean(body.requires_approval),
    approval_reason_codes: body.approval_reason_codes,
  };

  if (
    !payload.company_id ||
    !payload.employee_id ||
    !payload.device_id ||
    !payload.event_id ||
    (payload.punch_type !== "in" && payload.punch_type !== "out") ||
    !Number.isFinite(payload.lat) ||
    !Number.isFinite(payload.lon) ||
    !Number.isFinite(payload.accuracy_m) ||
    !Number.isFinite(payload.device_time_ms) ||
    !Number.isFinite(payload.elapsed_ms)
  ) {
    return json({ error: "Invalid punch payload." }, 400);
  }

  const { data: duplicate } = await supabase
    .from("attendance_punch_events")
    .select("id,event_id")
    .eq("event_id", payload.event_id)
    .maybeSingle();

  if (duplicate?.id) {
    return json({ code: "DUPLICATE_EVENT", error: "Duplicate event already processed." }, 409);
  }

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id,company_id,full_name,status,mobile_app_status,attendance_mode,bound_device_id,shift_name,department")
    .eq("id", payload.employee_id)
    .eq("company_id", payload.company_id)
    .maybeSingle();

  if (employeeError || !employee?.id) {
    return json({ code: "EMPLOYEE_NOT_FOUND", error: "Employee not found for this company." }, 404);
  }

  if (employee.status !== "active" || employee.mobile_app_status === "blocked") {
    return json({ code: "ACCESS_BLOCKED", error: "Employee is not allowed to punch." }, 403);
  }

  const boundDeviceId = String(employee.bound_device_id || "").trim();
  if (!boundDeviceId) {
    return json({ code: "DEVICE_NOT_BOUND", error: "Device is not registered for this employee." }, 403);
  }

  if (boundDeviceId !== payload.device_id) {
    return json({ code: "DEVICE_MISMATCH", error: "Punch is not allowed from this device." }, 403);
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select(
      "id,name,office_lat,office_lon,office_radius_m,status"
    )
    .eq("id", payload.company_id)
    .maybeSingle();

  if (companyError || !company?.id) {
    return json({ code: "COMPANY_NOT_FOUND", error: "Company not found." }, 404);
  }

  if (company.status === "suspended") {
    return json({ code: "COMPANY_SUSPENDED", error: "Company is suspended." }, 403);
  }

  const [policyDefinitionResult, policyAssignmentResult] = await Promise.all([
    supabase
      .from("company_policy_definitions")
      .select("id,policy_type,is_default,effective_from,config_json")
      .eq("company_id", payload.company_id)
      .in("policy_type", ["shift", "holiday_weekoff", "leave"])
      .order("created_at", { ascending: true }),
    supabase
      .from("company_policy_assignments")
      .select("policy_type,policy_id,assignment_level,target_id,effective_from,effective_to,is_active")
      .eq("company_id", payload.company_id)
      .in("policy_type", ["shift", "holiday_weekoff", "leave"])
      .eq("is_active", true),
  ]);

  if (policyDefinitionResult.error) {
    return json({ error: policyDefinitionResult.error.message || "Unable to load company policies." }, 500);
  }
  if (policyAssignmentResult.error) {
    return json({ error: policyAssignmentResult.error.message || "Unable to load policy assignments." }, 500);
  }

  const policyDefinitions = ((policyDefinitionResult.data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id || ""),
    policyType: String(row.policy_type || "") as PolicyType,
    isDefault: row.is_default === true,
    effectiveFrom: String(row.effective_from || ""),
    configJson: (row.config_json || {}) as Record<string, unknown>,
  })) satisfies PolicyDefinition[];
  const policyAssignments = ((policyAssignmentResult.data || []) as Array<Record<string, unknown>>).map((row) => ({
    policyType: String(row.policy_type || "") as PolicyType,
    policyId: String(row.policy_id || ""),
    assignmentLevel: String(row.assignment_level || "company") as AssignmentLevel,
    targetId: String(row.target_id || ""),
    effectiveFrom: String(row.effective_from || ""),
    effectiveTo: row.effective_to ? String(row.effective_to) : null,
    isActive: row.is_active === true,
  })) satisfies PolicyAssignment[];

  const currentPunchIso = toIsoFromMs(payload.device_time_ms) || new Date().toISOString();
  const punchDate = isoDateInTimeZone(currentPunchIso, payload.device_time_zone);
  const resolvedShiftPolicy = resolvePolicyForEmployee({
    policyType: "shift",
    employeeId: payload.employee_id,
    department: typeof employee.department === "string" ? employee.department : null,
    onDate: punchDate,
    assignments: policyAssignments,
    definitions: policyDefinitions,
  });
  const resolvedHolidayPolicy = resolvePolicyForEmployee({
    policyType: "holiday_weekoff",
    employeeId: payload.employee_id,
    department: typeof employee.department === "string" ? employee.department : null,
    onDate: punchDate,
    assignments: policyAssignments,
    definitions: policyDefinitions,
  });
  const resolvedLeavePolicy = resolvePolicyForEmployee({
    policyType: "leave",
    employeeId: payload.employee_id,
    department: typeof employee.department === "string" ? employee.department : null,
    onDate: punchDate,
    assignments: policyAssignments,
    definitions: policyDefinitions,
  });
  const resolvedShift = resolveShiftPolicyRuntime(resolvedShiftPolicy, {
    shiftName: String(employee.shift_name || "General"),
    shiftType: String(employee.shift_name || "General"),
  });
  const resolvedHoliday = resolveHolidayPolicyRuntime(resolvedHolidayPolicy);
  const resolvedLeave = resolveLeavePolicyRuntime(resolvedLeavePolicy);

  const { data: leaveOnDate } = await supabase
    .from("employee_leave_requests")
    .select("id")
    .eq("company_id", payload.company_id)
    .eq("employee_id", payload.employee_id)
    .eq("status", "approved")
    .lte("from_date", punchDate)
    .gte("to_date", punchDate)
    .limit(1)
    .maybeSingle();

  const punchOnApprovedLeave = Boolean(leaveOnDate?.id);
  if (punchOnApprovedLeave && resolvedLeave.ifEmployeePunchesOnApprovedLeave === "Block Punch") {
    return json(
      {
        code: "ON_APPROVED_LEAVE",
        error: "You have an approved leave today. Punch is blocked by company policy.",
      },
      409
    );
  }

  if (punchOnApprovedLeave && resolvedLeave.ifEmployeePunchesOnApprovedLeave === "Keep Leave") {
    return json(
      {
        code: "KEEP_APPROVED_LEAVE",
        error: "You have an approved leave today. Your leave remains final for this date.",
      },
      409
    );
  }

  const { data: holidayOnDate } = await supabase
    .from("company_holidays")
    .select("id,name")
    .eq("company_id", payload.company_id)
    .eq("holiday_date", punchDate)
    .limit(1)
    .maybeSingle();

  const weeklyOff = isWeeklyOffDate(punchDate, resolvedHoliday.weeklyOffPolicy);
  const isHoliday = Boolean(holidayOnDate?.id);
  const dayType = isHoliday ? "holiday" : weeklyOff ? "weekly_off" : "working_day";
  const isExtraWork = dayType !== "working_day";
  const allowOnHoliday = resolvedHoliday.allowPunchOnHoliday;
  const allowOnWeeklyOff = resolvedHoliday.allowPunchOnWeeklyOff;

  if (isHoliday && !allowOnHoliday) {
    return json(
      {
        code: "HOLIDAY_PUNCH_BLOCKED",
        error: "Punch is not allowed on company holidays.",
      },
      403
    );
  }

  if (weeklyOff && !allowOnWeeklyOff) {
    return json(
      {
        code: "WEEKLY_OFF_PUNCH_BLOCKED",
        error: "Punch is not allowed on weekly off.",
      },
      403
    );
  }

  if (payload.punch_type === "in" && normalizeLoginAccessRule(resolvedShift.loginAccessRule) === "shift_time_only") {
    const { data: shiftRows, error: shiftError } = await supabase
      .from("company_shift_definitions")
      .select("name,type,start_time,end_time,early_window_mins,active")
      .eq("company_id", payload.company_id)
      .eq("active", true)
      .order("created_at", { ascending: true });

    if (shiftError) {
      return json({ error: shiftError.message || "Unable to load shift window policy." }, 500);
    }

    const effectiveShiftRows = ((shiftRows || []) as Array<{
      name: string;
      type: string;
      start_time: string;
      end_time: string;
      early_window_mins: number;
    }>).map((row) => ({
      name: row.name,
      type: row.type,
      startTime: row.start_time,
      endTime: row.end_time,
      earlyWindowMins: Number(row.early_window_mins || 0),
    }));

    const fallbackShiftRows = [
      { name: "General", type: "Day", startTime: "09:00", endTime: "18:00", earlyWindowMins: 15 },
      { name: "Morning", type: "Early", startTime: "06:00", endTime: "15:00", earlyWindowMins: 15 },
      { name: "Evening", type: "Late", startTime: "14:00", endTime: "22:00", earlyWindowMins: 15 },
    ];

    const matchedShift = resolvedShiftPolicy
      ? {
          name: resolvedShift.shiftName,
          type: resolvedShift.shiftType,
          startTime: resolvedShift.shiftStartTime,
          endTime: resolvedShift.shiftEndTime,
          earlyWindowMins: resolvedShift.earlyInAllowed,
        }
      : findMatchingShiftRule(String(employee.shift_name || "General"), effectiveShiftRows.length ? effectiveShiftRows : fallbackShiftRows);
    if (
      matchedShift &&
      !isPunchInAllowedByShiftWindow({
        punchIso: currentPunchIso,
        timeZone: payload.device_time_zone,
        shiftStart: matchedShift.startTime,
        shiftEnd: matchedShift.endTime,
        earlyWindowMins: matchedShift.earlyWindowMins,
      })
    ) {
      return json(
        {
          code: "SHIFT_TIME_ONLY_LOGIN_BLOCKED",
          error: "Punch In is allowed only during the configured shift window.",
        },
        403
      );
    }
  }

  const { data: lastEvent } = await supabase
    .from("attendance_punch_events")
    .select("id,punch_type,approval_status,effective_punch_at,server_received_at")
    .eq("company_id", payload.company_id)
    .eq("employee_id", payload.employee_id)
    .neq("approval_status", "rejected")
    .order("server_received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastEvent && payload.punch_type === "out") {
    return json({ code: "PUNCH_IN_REQUIRED", error: "Punch In is required before Punch Out." }, 409);
  }

  if (lastEvent?.punch_type === payload.punch_type) {
    const lastPunchAt = lastEvent.effective_punch_at || lastEvent.server_received_at || null;
    const currentPunchAt = currentPunchIso;
    const isPreviousDayOpenPunch =
      payload.punch_type === "in" &&
      Boolean(lastPunchAt) &&
      isoDateInTimeZone(String(lastPunchAt), payload.device_time_zone) !==
        isoDateInTimeZone(currentPunchAt, payload.device_time_zone);

    if (!isPreviousDayOpenPunch) {
      return json({ code: "INVALID_PUNCH_SEQUENCE", error: "Punch sequence is invalid." }, 409);
    }
  }

  if (payload.punch_type === "out" && lastEvent?.punch_type === "in") {
    const { data: shiftRows, error: shiftError } = await supabase
      .from("company_shift_definitions")
      .select("name,type,start_time,end_time,early_window_mins,min_work_before_out_mins,active")
      .eq("company_id", payload.company_id)
      .eq("active", true)
      .order("created_at", { ascending: true });

    if (shiftError) {
      return json({ error: shiftError.message || "Unable to load shift work-out policy." }, 500);
    }

    const effectiveShiftRows = ((shiftRows || []) as Array<{
      name: string;
      type: string;
      start_time: string;
      end_time: string;
      early_window_mins: number;
      min_work_before_out_mins: number;
    }>).map((row) => ({
      name: row.name,
      type: row.type,
      startTime: row.start_time,
      endTime: row.end_time,
      earlyWindowMins: Number(row.early_window_mins || 0),
      minWorkBeforeOutMins: Number(row.min_work_before_out_mins || 0),
    }));

    const fallbackShiftRows = [
      { name: "General", type: "Day", startTime: "09:00", endTime: "18:00", earlyWindowMins: 15, minWorkBeforeOutMins: 60 },
      { name: "Morning", type: "Early", startTime: "06:00", endTime: "15:00", earlyWindowMins: 15, minWorkBeforeOutMins: 60 },
      { name: "Evening", type: "Late", startTime: "14:00", endTime: "22:00", earlyWindowMins: 15, minWorkBeforeOutMins: 60 },
    ];

    const matchedShift = resolvedShiftPolicy
      ? {
          name: resolvedShift.shiftName,
          type: resolvedShift.shiftType,
          startTime: resolvedShift.shiftStartTime,
          endTime: resolvedShift.shiftEndTime,
          earlyWindowMins: resolvedShift.earlyInAllowed,
          minWorkBeforeOutMins: resolvedShift.minimumWorkBeforePunchOut,
        }
      : findMatchingShiftRule(
          String(employee.shift_name || "General"),
          effectiveShiftRows.length ? effectiveShiftRows : fallbackShiftRows
        );
    const lastPunchAt = lastEvent.effective_punch_at || lastEvent.server_received_at || null;
    const workedMinutes = rawWorkedMinutes(lastPunchAt, currentPunchIso);
    const minWorkBeforeOut = Math.max(0, Math.floor(Number(matchedShift?.minWorkBeforeOutMins || 0)));

    if (workedMinutes < minWorkBeforeOut) {
      return json(
        {
          code: "MIN_WORK_OUT_NOT_REACHED",
          error: `Punch Out is allowed only after ${minWorkBeforeOut} minutes of work.`,
        },
        403
      );
    }
  }

  let distanceFromOfficeM: number | null = null;
  if (company.office_lat != null && company.office_lon != null) {
    distanceFromOfficeM = haversineDistanceMeters(
      Number(company.office_lat),
      Number(company.office_lon),
      payload.lat,
      payload.lon
    );
  }

  const approval = buildApproval({
    payload,
    employee,
    company,
    distanceFromOfficeM,
  });

  if (!approval.ok) {
    return json(approval.body, approval.status);
  }

  let approvalStatus = approval.approvalStatus;
  const approvalReasonCodes = [...approval.approvalReasonCodes];
  let noticeMessage: string | null = null;
  if (punchOnApprovedLeave && resolvedLeave.ifEmployeePunchesOnApprovedLeave === "Allow Punch and Send for Approval") {
    if (!approvalReasonCodes.includes("PUNCH_ON_APPROVED_LEAVE")) {
      approvalReasonCodes.push("PUNCH_ON_APPROVED_LEAVE");
    }
    approvalStatus = "pending_approval";
    noticeMessage = "You have an approved leave today. This punch has been sent for approval review.";
  }

  const serverNowIso = new Date().toISOString();
  const deviceTimeIso = toIsoFromMs(payload.device_time_ms);
  const estimatedTimeIso = toIsoFromMs(payload.estimated_time_ms);
  const trustedAnchorTimeIso = toIsoFromMs(payload.trusted_anchor_time_ms);
  const effectivePunchAt = chooseEffectivePunchAt({
    serverNowIso,
    isOffline: payload.is_offline,
    approvalStatus,
    estimatedTimeIso,
    deviceTimeIso,
  });

  const insertPayload = {
    company_id: payload.company_id,
    employee_id: payload.employee_id,
    company_name_snapshot: String(company.name || "").trim() || null,
    employee_name_snapshot: String(employee.full_name || "").trim() || null,
    day_type: dayType,
    is_extra_work: isExtraWork,
    device_id: payload.device_id,
    event_id: payload.event_id,
    source: "mobile",
    punch_type: payload.punch_type,
    attendance_mode_snapshot: employee.attendance_mode === "office_only" ? "office_only" : "field_staff",
    office_lat_snapshot: company.office_lat,
    office_lon_snapshot: company.office_lon,
    office_radius_m_snapshot: company.office_radius_m,
    lat: payload.lat,
    lon: payload.lon,
    address_text: payload.address || null,
    accuracy_m: payload.accuracy_m,
    distance_from_office_m: distanceFromOfficeM,
    is_offline: payload.is_offline,
    device_time_ms: payload.device_time_ms,
    device_time_at: deviceTimeIso,
    estimated_time_ms: payload.estimated_time_ms,
    estimated_time_at: estimatedTimeIso,
    trusted_anchor_time_ms: payload.trusted_anchor_time_ms,
    trusted_anchor_time_at: trustedAnchorTimeIso,
    trusted_anchor_elapsed_ms: payload.trusted_anchor_elapsed_ms,
    elapsed_ms: payload.elapsed_ms,
    clock_drift_ms: payload.clock_drift_ms,
    server_received_at: serverNowIso,
    effective_punch_at: effectivePunchAt,
    requires_approval: approvalStatus === "pending_approval",
    approval_status: approvalStatus,
    approval_reason_codes: approvalReasonCodes,
    raw_payload: body,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("attendance_punch_events")
    .insert(insertPayload)
    .select("id,event_id,approval_status,effective_punch_at,server_received_at")
    .single();

  if (insertError) {
    if ((insertError.message || "").toLowerCase().includes("duplicate")) {
      return json({ code: "DUPLICATE_EVENT", error: "Duplicate event already processed." }, 409);
    }
    return json({ error: insertError.message || "Unable to save punch event." }, 500);
  }

  return json({
    ok: true,
    eventId: inserted.event_id,
    approvalStatus: inserted.approval_status,
    effectivePunchAt: inserted.effective_punch_at,
    serverReceivedAt: inserted.server_received_at,
    notice: noticeMessage,
  });
});

