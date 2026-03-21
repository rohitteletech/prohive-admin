import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildMobileEmployeePayload } from "@/lib/mobileEmployeePayload";
import { normalizeEmployeeCode } from "@/lib/mobileAuth";
import { MobileOtpPurpose, validateOtpChallenge } from "@/lib/mobileOtp";
import { createMobileOtpProof } from "@/lib/mobileOtpProof";
import { applyRateLimit, getRequestClientIp } from "@/lib/rateLimit";

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
  const ip = getRequestClientIp(req.headers);

  if (!challengeId || !employeeCode || !/^\d{6}$/.test(otp) || !deviceId) {
    return NextResponse.json({ error: "Invalid OTP verification request." }, { status: 400 });
  }

  const rateLimit = applyRateLimit({
    key: `mobile-auth-verify:${challengeId}:${employeeCode}:${deviceId}:${ip}`,
    limit: 8,
    windowMs: 10 * 60_000,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: `Too many OTP verification attempts. Try again in ${rateLimit.retryAfterSec} seconds.` },
      { status: 429 }
    );
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
  const verificationToken = await createMobileOtpProof({
    challengeId,
    employeeCode,
    deviceId,
    purpose,
  });
  if (!verificationToken) {
    return NextResponse.json({ error: "OTP proof signing is not configured." }, { status: 500 });
  }

  return NextResponse.json({
    state: "OTP_VERIFIED",
    purpose,
    verificationToken,
    employee: await buildMobileEmployeePayload(admin, employee),
  });
}
