import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type MobileOtpPurpose = "first_login" | "reset_pin";

type OtpRow = {
  id: string;
  employee_id: string;
  employee_code: string;
  otp_code: string;
  purpose: MobileOtpPurpose;
  requested_device_id: string;
  requested_device_name: string | null;
  expires_at: string;
  consumed_at: string | null;
  employees: {
    id: string;
    company_id: string;
    full_name: string;
    mobile: string | null;
    employee_code: string;
    attendance_mode: "office_only" | "field_staff";
    mobile_app_status: "invited" | "active" | "blocked";
    bound_device_id: string | null;
  } | null;
};

export type OtpValidationResult =
  | {
      ok: true;
      employee: NonNullable<OtpRow["employees"]>;
      otpRow: OtpRow;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

export async function validateOtpChallenge(
  admin: AdminClient,
  input: {
    challengeId: string;
    employeeCode: string;
    otp: string;
    deviceId: string;
    purpose: MobileOtpPurpose;
    skipOtpMatch?: boolean;
  }
): Promise<OtpValidationResult> {
  const { challengeId, employeeCode, otp, deviceId, purpose, skipOtpMatch = false } = input;

  const { data, error } = await admin
    .from("employee_login_otps")
    .select(
      "id,employee_id,employee_code,otp_code,purpose,requested_device_id,requested_device_name,expires_at,consumed_at,employees(id,company_id,full_name,mobile,employee_code,attendance_mode,mobile_app_status,bound_device_id)"
    )
    .eq("id", challengeId)
    .eq("purpose", purpose)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, status: 404, error: "OTP session not found. Request a new OTP." };
  }

  const otpRow = data as unknown as OtpRow;
  const employee = otpRow.employees;

  if (!employee || employee.employee_code !== employeeCode) {
    return { ok: false, status: 400, error: "Employee verification failed." };
  }

  if (purpose === "first_login") {
    if (employee.mobile_app_status === "blocked") {
      return { ok: false, status: 403, error: "Mobile access is blocked for this employee." };
    }

    if (employee.bound_device_id && employee.bound_device_id !== deviceId) {
      return { ok: false, status: 409, error: "This account is already linked to another device. Contact admin." };
    }
  } else {
    if (employee.mobile_app_status !== "active" || employee.bound_device_id !== deviceId) {
      return { ok: false, status: 403, error: "PIN reset is not allowed on this device." };
    }
  }

  if (otpRow.requested_device_id !== deviceId) {
    return { ok: false, status: 400, error: "OTP request is tied to another device." };
  }

  if (otpRow.consumed_at) {
    return { ok: false, status: 400, error: "OTP already used. Request a new OTP." };
  }

  if (new Date(otpRow.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 400, error: "OTP expired. Request a new OTP." };
  }

  if (!skipOtpMatch && otpRow.otp_code !== otp) {
    return { ok: false, status: 400, error: "Invalid OTP." };
  }

  return { ok: true, employee, otpRow };
}
