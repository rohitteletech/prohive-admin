import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildMobileEmployeePayload } from "@/lib/mobileEmployeePayload";
import {
  expiresAtIso,
  generateOtp,
  hashOtp,
  isProduction,
  isValidEmployeeCode,
  isValidMobile,
  normalizeEmployeeCode,
  normalizeMobile,
} from "@/lib/mobileAuth";
import { sendOtpViaMsg91 } from "@/lib/msg91";
import { applyRateLimit, getRequestClientIp } from "@/lib/rateLimit";

type EmployeeRow = {
  id: string;
  company_id: string;
  employee_code: string;
  full_name: string;
  mobile: string;
  status: "active" | "inactive";
  mobile_app_status: "invited" | "active" | "blocked";
  bound_device_id: string | null;
  attendance_mode: "office_only" | "field_staff";
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    employeeCode?: string;
    mobile?: string;
    deviceId?: string;
    deviceName?: string;
  };

  const employeeCode = normalizeEmployeeCode(body.employeeCode || "");
  const mobile = normalizeMobile(body.mobile || "");
  const deviceId = (body.deviceId || "").trim();
  const deviceName = (body.deviceName || "").trim() || null;
  const ip = getRequestClientIp(req.headers);

  if (!isValidEmployeeCode(employeeCode) || !isValidMobile(mobile) || !deviceId) {
    return NextResponse.json({ error: "Invalid forgot PIN request." }, { status: 400 });
  }

  const rateLimit = applyRateLimit({
    key: `mobile-auth-forgot:${employeeCode}:${mobile}:${deviceId}:${ip}`,
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: `Too many OTP requests. Try again in ${rateLimit.retryAfterSec} seconds.` },
      { status: 429 }
    );
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const { data, error } = await admin
    .from("employees")
    .select("id,company_id,employee_code,full_name,mobile,status,mobile_app_status,bound_device_id,attendance_mode")
    .eq("employee_code", employeeCode);

  if (error) {
    return NextResponse.json({ error: "Unable to verify employee." }, { status: 500 });
  }

  const employee = (data as EmployeeRow[] | null)?.find((row) => normalizeMobile(row.mobile) === mobile) || null;

  if (!employee || employee.status !== "active" || employee.mobile_app_status !== "active") {
    return NextResponse.json(
      { code: "EMPLOYEE_NOT_FOUND", error: "Unable to verify employee details. Contact your company admin." },
      { status: 404 }
    );
  }

  if (!employee.bound_device_id || employee.bound_device_id !== deviceId) {
    return NextResponse.json(
      { code: "DEVICE_MISMATCH", error: "This account is already linked to another device. Contact admin." },
      { status: 409 }
    );
  }

  const otpCode = generateOtp();
  const expiresAt = expiresAtIso();

  await admin
    .from("employee_login_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("employee_id", employee.id)
    .is("consumed_at", null)
    .eq("purpose", "reset_pin");

  const { data: otpRow, error: otpError } = await admin
    .from("employee_login_otps")
    .insert({
      employee_id: employee.id,
      employee_code: employee.employee_code,
      mobile,
      purpose: "reset_pin",
      otp_code: hashOtp(otpCode),
      requested_device_id: deviceId,
      requested_device_name: deviceName,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (otpError || !otpRow?.id) {
    return NextResponse.json({ error: "Unable to start forgot PIN flow." }, { status: 500 });
  }

  const smsResult = await sendOtpViaMsg91({
    mobile,
    otp: otpCode,
    purpose: "reset_pin",
  });
  if (!smsResult.ok) {
    await admin.from("employee_login_otps").delete().eq("id", otpRow.id);
    return NextResponse.json({ error: smsResult.error }, { status: 502 });
  }

  return NextResponse.json({
    state: "RESET_PIN_OTP_REQUIRED",
    challengeId: otpRow.id,
    expiresAt,
    employee: await buildMobileEmployeePayload(admin, { ...employee, mobile }),
    ...(isProduction() || !smsResult.skipped ? {} : { devOtp: otpCode }),
  });
}
