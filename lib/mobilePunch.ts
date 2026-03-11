import { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_COMPANY_SHIFTS } from "@/lib/companyShiftDefaults";
import { findMatchingShiftRule, isPunchInAllowedByShiftWindow, normalizeLoginAccessRule } from "@/lib/shiftWorkPolicy";

type JsonBody = {
  [key: string]: unknown;
};

type PunchPayload = {
  company_id: string;
  employee_id: string;
  device_id: string;
  event_id: string;
  punch_type: "in" | "out";
  lat: number;
  lon: number;
  address: string | null;
  accuracy_m: number;
  is_offline: boolean;
  device_time_ms: number;
  device_time_zone: string;
  elapsed_ms: number;
  estimated_time_ms: number | null;
  trusted_anchor_time_ms: number | null;
  trusted_anchor_elapsed_ms: number | null;
  clock_drift_ms: number | null;
  requires_approval: boolean;
  approval_reason_codes: unknown;
};

type PunchResponse =
  | { status: number; body: Record<string, unknown> }
  | {
      status: 200;
      body: {
        ok: true;
        eventId: string;
        approvalStatus: string;
        effectivePunchAt: string | null;
        serverReceivedAt: string;
      };
    };

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

function chooseEffectivePunchAt(params: {
  serverNowIso: string;
  isOffline: boolean;
  approvalStatus: string;
  estimatedTimeIso: string | null;
  deviceTimeIso: string | null;
}) {
  if (params.approvalStatus === "pending_approval") return null;
  if (!params.isOffline) return params.serverNowIso;
  return params.estimatedTimeIso || params.deviceTimeIso || params.serverNowIso;
}

function buildApproval(params: {
  payload: PunchPayload;
  employee: Record<string, unknown>;
  company: Record<string, unknown>;
  distanceFromOfficeM: number | null;
}) {
  const reasons: string[] = [];
  const incomingReasonCodes = parseReasonCodes(params.payload.approval_reason_codes);

  if (!params.payload.is_offline && !String(params.payload.address || "").trim()) {
    return {
      ok: false as const,
      status: 400,
      body: {
        code: "ADDRESS_REQUIRED",
        error: "Address is required for online punch.",
      },
    };
  }

  if (incomingReasonCodes.includes("MOCK_LOCATION") || incomingReasonCodes.includes("FAKE_GPS")) {
    return {
      ok: false as const,
      status: 403,
      body: {
        code: "MOCK_LOCATION_DETECTED",
        error: "Mock or fake GPS is not allowed for punch.",
      },
    };
  }

  if (params.employee.attendance_mode === "office_only") {
    if (
      params.company.office_lat == null ||
      params.company.office_lon == null ||
      params.company.office_radius_m == null ||
      Number(params.company.office_radius_m) <= 0
    ) {
      return {
        ok: false as const,
        status: 403,
        body: {
          code: "OFFICE_LOCATION_NOT_CONFIGURED",
          error: "Office location is not configured for this company.",
        },
      };
    }

    if (
      params.distanceFromOfficeM == null ||
      params.distanceFromOfficeM > Number(params.company.office_radius_m)
    ) {
      return {
        ok: false as const,
        status: 403,
        body: {
          code: "OUTSIDE_OFFICE_RADIUS",
          error: "Punch is outside the allowed office area.",
        },
      };
    }
  }

  if (Number(params.payload.accuracy_m) > 80) {
    reasons.push("GPS_WEAK_ACCURACY");
  }

  if (
    params.payload.clock_drift_ms != null &&
    Number.isFinite(Number(params.payload.clock_drift_ms)) &&
    Math.abs(Number(params.payload.clock_drift_ms)) > 120000
  ) {
    reasons.push("CLOCK_DRIFT_EXCEEDED");
  }

  if (params.payload.is_offline) {
    reasons.push(...incomingReasonCodes);
    if (params.payload.requires_approval) {
      reasons.push("CLIENT_MARKED_REQUIRES_APPROVAL");
    }
    if (!params.payload.estimated_time_ms) {
      reasons.push("OFFLINE_NO_ESTIMATED_TIME");
    }
  }

  const approvalReasonCodes = [...new Set(reasons)];
  return {
    ok: true as const,
    approvalStatus: approvalReasonCodes.length ? "pending_approval" : "auto_approved",
    approvalReasonCodes,
  };
}

function normalizePunchPayload(body: JsonBody | null): PunchPayload | null {
  if (!body || typeof body !== "object") return null;

  const punchType = String(body.punch_type || "").trim();
  if (punchType !== "in" && punchType !== "out") return null;

  const payload: PunchPayload = {
    company_id: String(body.company_id || "").trim(),
    employee_id: String(body.employee_id || "").trim(),
    device_id: String(body.device_id || "").trim(),
    event_id: String(body.event_id || "").trim(),
    punch_type: punchType,
    lat: Number(body.lat),
    lon: Number(body.lon),
    address: typeof body.address === "string" ? body.address.trim() : null,
    accuracy_m: Number(body.accuracy_m),
    is_offline: Boolean(body.is_offline),
    device_time_ms: Number(body.device_time_ms),
    device_time_zone: normalizeTimeZone(body.device_time_zone),
    elapsed_ms: Number(body.elapsed_ms),
    estimated_time_ms: body.estimated_time_ms == null || body.estimated_time_ms === "" ? null : Number(body.estimated_time_ms),
    trusted_anchor_time_ms:
      body.trusted_anchor_time_ms == null || body.trusted_anchor_time_ms === "" ? null : Number(body.trusted_anchor_time_ms),
    trusted_anchor_elapsed_ms:
      body.trusted_anchor_elapsed_ms == null || body.trusted_anchor_elapsed_ms === "" ? null : Number(body.trusted_anchor_elapsed_ms),
    clock_drift_ms: body.clock_drift_ms == null || body.clock_drift_ms === "" ? null : Number(body.clock_drift_ms),
    requires_approval: Boolean(body.requires_approval),
    approval_reason_codes: body.approval_reason_codes,
  };

  if (
    !payload.company_id ||
    !payload.employee_id ||
    !payload.device_id ||
    !payload.event_id ||
    !Number.isFinite(payload.lat) ||
    !Number.isFinite(payload.lon) ||
    !Number.isFinite(payload.accuracy_m) ||
    !Number.isFinite(payload.device_time_ms) ||
    !Number.isFinite(payload.elapsed_ms)
  ) {
    return null;
  }

  return payload;
}

export async function submitMobilePunch(admin: SupabaseClient, rawBody: JsonBody | null): Promise<PunchResponse> {
  if (!rawBody || typeof rawBody !== "object") {
    return { status: 400, body: { error: "Invalid JSON payload." } };
  }

  const payload = normalizePunchPayload(rawBody);
  if (!payload) {
    return { status: 400, body: { error: "Invalid punch payload." } };
  }

  const { data: duplicate } = await admin
    .from("attendance_punch_events")
    .select("id,event_id")
    .eq("event_id", payload.event_id)
    .maybeSingle();

  if (duplicate?.id) {
    return { status: 409, body: { code: "DUPLICATE_EVENT", error: "Duplicate event already processed." } };
  }

  const { data: employee, error: employeeError } = await admin
    .from("employees")
    .select("id,company_id,full_name,status,mobile_app_status,attendance_mode,bound_device_id,shift_name")
    .eq("id", payload.employee_id)
    .eq("company_id", payload.company_id)
    .maybeSingle();

  if (employeeError || !employee?.id) {
    return { status: 404, body: { code: "EMPLOYEE_NOT_FOUND", error: "Employee not found for this company." } };
  }

  if (employee.status !== "active" || employee.mobile_app_status === "blocked") {
    return { status: 403, body: { code: "ACCESS_BLOCKED", error: "Employee is not allowed to punch." } };
  }

  const boundDeviceId = String(employee.bound_device_id || "").trim();
  if (!boundDeviceId) {
    return { status: 403, body: { code: "DEVICE_NOT_BOUND", error: "Device is not registered for this employee." } };
  }

  if (boundDeviceId !== payload.device_id) {
    return { status: 403, body: { code: "DEVICE_MISMATCH", error: "Punch is not allowed from this device." } };
  }

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id,name,office_lat,office_lon,office_radius_m,status,weekly_off_policy,allow_punch_on_holiday,allow_punch_on_weekly_off,login_access_rule")
    .eq("id", payload.company_id)
    .maybeSingle();

  if (companyError || !company?.id) {
    return { status: 404, body: { code: "COMPANY_NOT_FOUND", error: "Company not found." } };
  }

  if (company.status === "suspended") {
    return { status: 403, body: { code: "COMPANY_SUSPENDED", error: "Company is suspended." } };
  }

  const currentPunchIso = toIsoFromMs(payload.device_time_ms) || new Date().toISOString();
  const punchDate = isoDateInTimeZone(currentPunchIso, payload.device_time_zone);

  const { data: leaveOnDate } = await admin
    .from("employee_leave_requests")
    .select("id")
    .eq("company_id", payload.company_id)
    .eq("employee_id", payload.employee_id)
    .eq("status", "approved")
    .lte("from_date", punchDate)
    .gte("to_date", punchDate)
    .limit(1)
    .maybeSingle();

  if (leaveOnDate?.id) {
    return {
      status: 409,
      body: {
        code: "ON_APPROVED_LEAVE",
        error: "You are on approved leave for this date. Punch is not allowed.",
      },
    };
  }

  const { data: holidayOnDate } = await admin
    .from("company_holidays")
    .select("id,name")
    .eq("company_id", payload.company_id)
    .eq("holiday_date", punchDate)
    .limit(1)
    .maybeSingle();

  const weeklyOff = isWeeklyOffDate(punchDate, company.weekly_off_policy);
  const isHoliday = Boolean(holidayOnDate?.id);
  const dayType = isHoliday ? "holiday" : weeklyOff ? "weekly_off" : "working_day";
  const isExtraWork = dayType !== "working_day";

  if (isHoliday && company.allow_punch_on_holiday === false) {
    return {
      status: 403,
      body: {
        code: "HOLIDAY_PUNCH_BLOCKED",
        error: "Punch is not allowed on company holidays.",
      },
    };
  }

  if (weeklyOff && company.allow_punch_on_weekly_off === false) {
    return {
      status: 403,
      body: {
        code: "WEEKLY_OFF_PUNCH_BLOCKED",
        error: "Punch is not allowed on weekly off.",
      },
    };
  }

  if (payload.punch_type === "in" && normalizeLoginAccessRule(company.login_access_rule) === "shift_time_only") {
    const { data: shiftRows, error: shiftError } = await admin
      .from("company_shift_definitions")
      .select("name,type,start_time,end_time,early_window_mins,active")
      .eq("company_id", payload.company_id)
      .eq("active", true)
      .order("created_at", { ascending: true });

    if (shiftError) {
      return { status: 500, body: { error: shiftError.message || "Unable to load shift window policy." } };
    }

    const effectiveShiftRows =
      ((shiftRows || []) as Array<{
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
      })) ||
      [];

    const fallbackShiftRows = DEFAULT_COMPANY_SHIFTS.map((row) => ({
      name: row.name,
      type: row.type,
      startTime: row.start,
      endTime: row.end,
      earlyWindowMins: row.earlyWindowMins,
    }));

    const matchedShift = findMatchingShiftRule(String(employee.shift_name || "General"), effectiveShiftRows.length ? effectiveShiftRows : fallbackShiftRows);

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
      return {
        status: 403,
        body: {
          code: "SHIFT_TIME_ONLY_LOGIN_BLOCKED",
          error: "Punch In is allowed only during the configured shift window.",
        },
      };
    }
  }

  const { data: lastEvent } = await admin
    .from("attendance_punch_events")
    .select("id,punch_type,approval_status,effective_punch_at,server_received_at")
    .eq("company_id", payload.company_id)
    .eq("employee_id", payload.employee_id)
    .neq("approval_status", "rejected")
    .order("server_received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastEvent && payload.punch_type === "out") {
    return { status: 409, body: { code: "PUNCH_IN_REQUIRED", error: "Punch In is required before Punch Out." } };
  }

  if (lastEvent?.punch_type === payload.punch_type) {
    const lastPunchAt = lastEvent.effective_punch_at || lastEvent.server_received_at || null;
    const isPreviousDayOpenPunch =
      payload.punch_type === "in" &&
      Boolean(lastPunchAt) &&
      isoDateInTimeZone(String(lastPunchAt), payload.device_time_zone) !==
        isoDateInTimeZone(currentPunchIso, payload.device_time_zone);

    if (!isPreviousDayOpenPunch) {
      return { status: 409, body: { code: "INVALID_PUNCH_SEQUENCE", error: "Punch sequence is invalid." } };
    }
  }

  let distanceFromOfficeM: number | null = null;
  if (company.office_lat != null && company.office_lon != null) {
    distanceFromOfficeM = haversineDistanceMeters(Number(company.office_lat), Number(company.office_lon), payload.lat, payload.lon);
  }

  const approval = buildApproval({
    payload,
    employee,
    company,
    distanceFromOfficeM,
  });

  if (!approval.ok) {
    return { status: approval.status, body: approval.body };
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

  const { data: inserted, error: insertError } = await admin
    .from("attendance_punch_events")
    .insert({
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
      requires_approval: approval.approvalStatus === "pending_approval",
      approval_status: approval.approvalStatus,
      approval_reason_codes: approval.approvalReasonCodes,
      raw_payload: rawBody,
    })
    .select("event_id,approval_status,effective_punch_at,server_received_at")
    .single();

  if (insertError) {
    if ((insertError.message || "").toLowerCase().includes("duplicate")) {
      return { status: 409, body: { code: "DUPLICATE_EVENT", error: "Duplicate event already processed." } };
    }
    return { status: 500, body: { error: insertError.message || "Unable to save punch event." } };
  }

  return {
    status: 200,
    body: {
      ok: true,
      eventId: inserted.event_id,
      approvalStatus: inserted.approval_status,
      effectivePunchAt: inserted.effective_punch_at,
      serverReceivedAt: inserted.server_received_at,
    },
  };
}
