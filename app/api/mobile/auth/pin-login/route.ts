import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildMobileEmployeePayload } from "@/lib/mobileEmployeePayload";
import { hashPin, isValidPin, normalizeEmployeeCode } from "@/lib/mobileAuth";
import { applyRateLimit, getRequestClientIp } from "@/lib/rateLimit";

type EmployeeRow = {
  id: string;
  company_id: string;
  full_name: string;
  employee_code: string;
  mobile: string;
  status: "active" | "inactive";
  mobile_app_status: "invited" | "active" | "blocked";
  app_pin_hash: string | null;
  bound_device_id: string | null;
  attendance_mode: "office_only" | "field_staff";
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    employeeCode?: string;
    pin?: string;
    deviceId?: string;
    appVersion?: string;
  };

  const employeeCode = normalizeEmployeeCode(body.employeeCode || "");
  const pin = (body.pin || "").trim();
  const deviceId = (body.deviceId || "").trim();
  const appVersion = (body.appVersion || "").trim() || null;
  const ip = getRequestClientIp(req.headers);

  if (!employeeCode || !isValidPin(pin) || !deviceId) {
    return NextResponse.json({ error: "Invalid PIN login request." }, { status: 400 });
  }

  const rateLimit = applyRateLimit({
    key: `mobile-auth-pin:${employeeCode}:${deviceId}:${ip}`,
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: `Too many PIN attempts. Try again in ${rateLimit.retryAfterSec} seconds.` },
      { status: 429 }
    );
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const { data, error } = await admin
    .from("employees")
    .select("id,company_id,full_name,employee_code,mobile,status,mobile_app_status,app_pin_hash,bound_device_id,attendance_mode")
    .eq("employee_code", employeeCode);

  if (error) {
    return NextResponse.json({ error: "Unable to process PIN login." }, { status: 500 });
  }

  const rows = (data as EmployeeRow[] | null) || [];
  const activeRows = rows.filter((row) => row.status === "active");

  if (activeRows.length === 0) {
    return NextResponse.json(
      { code: "EMPLOYEE_NOT_FOUND", error: "PIN login is not available for this employee." },
      { status: 404 }
    );
  }

  const blockedRow = activeRows.find((row) => row.mobile_app_status === "blocked");
  if (blockedRow) {
    return NextResponse.json(
      { code: "ACCESS_BLOCKED", error: "Mobile access is blocked for this employee. Contact your company admin." },
      { status: 403 }
    );
  }

  const eligibleRows = activeRows.filter((row) => row.mobile_app_status === "active");
  if (eligibleRows.length === 0) {
    return NextResponse.json(
      { code: "PIN_LOGIN_UNAVAILABLE", error: "PIN login is not available for this employee." },
      { status: 403 }
    );
  }

  const matchingPinRows = eligibleRows.filter((row) => row.app_pin_hash && row.app_pin_hash === hashPin(pin));
  if (matchingPinRows.length === 0) {
    return NextResponse.json({ code: "INVALID_PIN", error: "Invalid PIN." }, { status: 401 });
  }

  const exactDeviceEmployee = matchingPinRows.find((row) => row.bound_device_id === deviceId) || null;
  if (exactDeviceEmployee) {
    await admin
      .from("employees")
      .update({ mobile_last_login_at: new Date().toISOString(), bound_app_version: appVersion })
      .eq("id", exactDeviceEmployee.id);

    return NextResponse.json({
      state: "PIN_LOGIN_OK",
      employee: await buildMobileEmployeePayload(admin, exactDeviceEmployee),
    });
  }

  const rebindEmployee = matchingPinRows.find((row) => !row.bound_device_id) || null;
  if (rebindEmployee) {
    return NextResponse.json({
      state: "REBIND_REQUIRED",
      employee: await buildMobileEmployeePayload(admin, rebindEmployee),
    });
  }

  if (matchingPinRows.length > 1) {
    return NextResponse.json(
      { code: "EMPLOYEE_AMBIGUOUS", error: "Multiple employee records matched. Contact your company admin." },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { code: "DEVICE_MISMATCH", error: "This account is already linked to another device. Contact admin." },
    { status: 409 }
  );
}
