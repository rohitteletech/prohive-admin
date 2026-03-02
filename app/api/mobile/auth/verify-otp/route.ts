import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildMobileEmployeePayload } from "@/lib/mobileEmployeePayload";
import { normalizeEmployeeCode } from "@/lib/mobileAuth";
import { MobileOtpPurpose, validateOtpChallenge } from "@/lib/mobileOtp";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    challengeId?: string;
    employeeCode?: string;
    otp?: string;
    deviceId?: string;
    purpose?: MobileOtpPurpose;
  };

  const challengeId = (body.challengeId || "").trim();
  const employeeCode = normalizeEmployeeCode(body.employeeCode || "");
  const otp = (body.otp || "").trim();
  const deviceId = (body.deviceId || "").trim();
  const purpose = body.purpose === "reset_pin" ? "reset_pin" : "first_login";

  if (!challengeId || !employeeCode || !/^\d{6}$/.test(otp) || !deviceId) {
    return NextResponse.json({ error: "Invalid OTP verification request." }, { status: 400 });
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
    purpose,
  });

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const employee = validation.employee;

  return NextResponse.json({
    state: "OTP_VERIFIED",
    purpose,
    employee: await buildMobileEmployeePayload(admin, employee),
  });
}
