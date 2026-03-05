import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildMobileEmployeePayload } from "@/lib/mobileEmployeePayload";
import { resolveRequestOrigin } from "@/lib/mobileCompanyLogo";
import { hashPin, isValidPin, normalizeEmployeeCode } from "@/lib/mobileAuth";
import { validateOtpChallenge } from "@/lib/mobileOtp";

export async function POST(req: NextRequest) {
  const requestOrigin = resolveRequestOrigin(req);
  const body = (await req.json().catch(() => ({}))) as {
    challengeId?: string;
    employeeCode?: string;
    otp?: string;
    pin?: string;
    deviceId?: string;
    appVersion?: string;
  };

  const challengeId = (body.challengeId || "").trim();
  const employeeCode = normalizeEmployeeCode(body.employeeCode || "");
  const otp = (body.otp || "").trim();
  const pin = (body.pin || "").trim();
  const deviceId = (body.deviceId || "").trim();
  const appVersion = (body.appVersion || "").trim() || null;

  if (!challengeId || !employeeCode || !/^\d{6}$/.test(otp) || !isValidPin(pin) || !deviceId) {
    return NextResponse.json({ error: "Invalid reset PIN request." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const validation = await validateOtpChallenge(admin, {
    challengeId,
    employeeCode,
    otp,
    deviceId,
    purpose: "reset_pin",
  });

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const employee = validation.employee;
  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("employees")
    .update({
      app_pin_hash: hashPin(pin),
      mobile_last_login_at: now,
      bound_app_version: appVersion,
    })
    .eq("id", employee.id);

  if (updateError) {
    return NextResponse.json({ error: "Unable to reset PIN." }, { status: 500 });
  }

  await admin.from("employee_login_otps").update({ consumed_at: now }).eq("id", challengeId);

  return NextResponse.json({
    state: "PIN_RESET_OK",
    employee: await buildMobileEmployeePayload(admin, employee, { requestOrigin }),
  });
}
