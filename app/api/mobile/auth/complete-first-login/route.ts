import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildMobileEmployeePayload } from "@/lib/mobileEmployeePayload";
import { hashPin, isValidPin, normalizeEmployeeCode } from "@/lib/mobileAuth";
import { validateOtpChallenge } from "@/lib/mobileOtp";
import { verifyMobileOtpProof } from "@/lib/mobileOtpProof";
import { createMobileSessionToken } from "@/lib/mobileSessionToken";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    challengeId?: string;
    employeeCode?: string;
    pin?: string;
    deviceId?: string;
    deviceName?: string;
    appVersion?: string;
    verificationToken?: string;
  };

  const challengeId = (body.challengeId || "").trim();
  const employeeCode = normalizeEmployeeCode(body.employeeCode || "");
  const pin = (body.pin || "").trim();
  const deviceId = (body.deviceId || "").trim();
  const deviceName = (body.deviceName || "").trim() || null;
  const appVersion = (body.appVersion || "").trim() || null;
  const verificationToken = (body.verificationToken || "").trim();

  if (!challengeId || !employeeCode || !verificationToken || !isValidPin(pin) || !deviceId) {
    return NextResponse.json({ error: "Invalid activation request." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const proof = await verifyMobileOtpProof(verificationToken);
  if (
    !proof ||
    proof.challengeId !== challengeId ||
    proof.employeeCode !== employeeCode ||
    proof.deviceId !== deviceId ||
    proof.purpose !== "first_login"
  ) {
    return NextResponse.json({ error: "OTP verification proof is invalid or expired." }, { status: 401 });
  }

  const validation = await validateOtpChallenge(admin, {
    challengeId,
    employeeCode,
    otp: "000000",
    deviceId,
    purpose: "first_login",
    skipOtpMatch: true,
  });

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const employee = validation.employee;
  const pinHash = hashPin(pin);
  const now = new Date().toISOString();

  const { error: updateError } = await admin
    .from("employees")
    .update({
      app_pin_hash: pinHash,
      mobile_app_status: "active",
      mobile_verified_at: now,
      bound_device_id: deviceId,
      bound_device_name: deviceName,
      bound_app_version: appVersion,
      bound_device_at: now,
      mobile_last_login_at: now,
    })
    .eq("id", employee.id);

  if (updateError) {
    return NextResponse.json({ error: "Unable to complete first-time login." }, { status: 500 });
  }

  await admin.from("employee_login_otps").update({ consumed_at: now }).eq("id", challengeId);
  const sessionToken = await createMobileSessionToken({
    employeeId: employee.id,
    companyId: employee.company_id,
    deviceId,
  });
  if (!sessionToken) {
    return NextResponse.json({ error: "Mobile session signing is not configured." }, { status: 500 });
  }

  return NextResponse.json({
    state: "ACTIVATED",
    sessionToken,
    employee: await buildMobileEmployeePayload(admin, employee),
  });
}
