import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildMobileEmployeePayload } from "@/lib/mobileEmployeePayload";
import {
  expiresAtIso,
  generateOtp,
  isProduction,
  isValidEmployeeCode,
  isValidMobile,
  normalizeEmployeeCode,
  normalizeMobile,
} from "@/lib/mobileAuth";

type EmployeeRow = {
  id: string;
  company_id: string;
  employee_code: string;
  full_name: string;
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
    mobile?: string;
    deviceId?: string;
    deviceName?: string;
  };

  const employeeCode = normalizeEmployeeCode(body.employeeCode || "");
  const mobile = normalizeMobile(body.mobile || "");
  const deviceId = (body.deviceId || "").trim();
  const deviceName = (body.deviceName || "").trim() || null;

  if (!isValidEmployeeCode(employeeCode) || !isValidMobile(mobile) || !deviceId) {
    return NextResponse.json({ error: "Invalid employee verification request." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const { data, error } = await admin
    .from("employees")
    .select("id,company_id,employee_code,full_name,mobile,status,mobile_app_status,app_pin_hash,bound_device_id,attendance_mode")
    .eq("employee_code", employeeCode);

  if (error) {
    return NextResponse.json({ error: "Unable to verify employee." }, { status: 500 });
  }

  const employee = (data as EmployeeRow[] | null)?.find((row) => normalizeMobile(row.mobile) === mobile) || null;

  if (!employee || employee.status !== "active") {
    return NextResponse.json(
      { code: "EMPLOYEE_NOT_FOUND", error: "Unable to verify employee details. Contact your company admin." },
      { status: 404 }
    );
  }

  if (employee.mobile_app_status === "blocked") {
    return NextResponse.json(
      { code: "ACCESS_BLOCKED", error: "Mobile access is blocked for this employee. Contact your company admin." },
      { status: 403 }
    );
  }

  if (employee.bound_device_id && employee.bound_device_id !== deviceId) {
    return NextResponse.json(
      { code: "DEVICE_MISMATCH", error: "This account is already linked to another device. Contact admin." },
      { status: 409 }
    );
  }

  if (employee.bound_device_id === deviceId && employee.app_pin_hash) {
    return NextResponse.json({
      state: "PIN_LOGIN",
      employee: await buildMobileEmployeePayload(admin, { ...employee, mobile }),
    });
  }

  const otpCode = generateOtp();
  const expiresAt = expiresAtIso();

  await admin
    .from("employee_login_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("employee_id", employee.id)
    .is("consumed_at", null)
    .eq("purpose", "first_login");

  const { data: otpRow, error: otpError } = await admin
    .from("employee_login_otps")
    .insert({
      employee_id: employee.id,
      employee_code: employee.employee_code,
      mobile,
      purpose: "first_login",
      otp_code: otpCode,
      requested_device_id: deviceId,
      requested_device_name: deviceName,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (otpError || !otpRow?.id) {
    return NextResponse.json({ error: "Unable to start login. Please try again." }, { status: 500 });
  }

  return NextResponse.json({
    state: "FIRST_TIME_OTP_REQUIRED",
    challengeId: otpRow.id,
    expiresAt,
    employee: await buildMobileEmployeePayload(admin, { ...employee, mobile }),
    ...(isProduction() ? {} : { devOtp: otpCode }),
  });
}
