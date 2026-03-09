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
    .select("id,company_id,status,mobile_app_status,attendance_mode,bound_device_id")
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
    .select("id,office_lat,office_lon,office_radius_m,status")
    .eq("id", payload.company_id)
    .maybeSingle();

  if (companyError || !company?.id) {
    return json({ code: "COMPANY_NOT_FOUND", error: "Company not found." }, 404);
  }

  if (company.status === "suspended") {
    return json({ code: "COMPANY_SUSPENDED", error: "Company is suspended." }, 403);
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
    const currentPunchAt = toIsoFromMs(payload.device_time_ms) || new Date().toISOString();
    const isPreviousDayOpenPunch =
      payload.punch_type === "in" &&
      Boolean(lastPunchAt) &&
      isoDateInTimeZone(String(lastPunchAt), payload.device_time_zone) !==
        isoDateInTimeZone(currentPunchAt, payload.device_time_zone);

    if (!isPreviousDayOpenPunch) {
      return json({ code: "INVALID_PUNCH_SEQUENCE", error: "Punch sequence is invalid." }, 409);
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

  const serverNowIso = new Date().toISOString();
  const deviceTimeIso = toIsoFromMs(payload.device_time_ms);
  const estimatedTimeIso = toIsoFromMs(payload.estimated_time_ms);
  const trustedAnchorTimeIso = toIsoFromMs(payload.trusted_anchor_time_ms);
  const effectivePunchAt = chooseEffectivePunchAt({
    serverNowIso,
    isOffline: payload.is_offline,
    approvalStatus: approval.approvalStatus,
    estimatedTimeIso,
    deviceTimeIso,
  });

  const insertPayload = {
    company_id: payload.company_id,
    employee_id: payload.employee_id,
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
    requires_approval: approval.approvalStatus === "pending_approval",
    approval_status: approval.approvalStatus,
    approval_reason_codes: approval.approvalReasonCodes,
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
  });
});

