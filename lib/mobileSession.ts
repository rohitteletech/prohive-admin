import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyMobileSessionToken } from "@/lib/mobileSessionToken";

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

export type MobileSessionContext =
  | {
      ok: true;
      admin: AdminClient;
      employee: {
        id: string;
        company_id: string;
        employee_code: string;
        full_name: string;
        status: "active" | "inactive";
        mobile_app_status: "invited" | "active" | "blocked";
        bound_device_id: string | null;
      };
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function getMobileSessionContext(input: {
  sessionToken?: string;
}): Promise<MobileSessionContext> {
  const sessionToken = (input.sessionToken || "").trim();
  const verifiedToken = await verifyMobileSessionToken(sessionToken);

  if (!verifiedToken) {
    return { ok: false, status: 401, error: "Mobile session token is missing or invalid." };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return { ok: false, status: 500, error: "Server is not configured." };
  }

  const { data, error } = await admin
    .from("employees")
    .select("id,company_id,employee_code,full_name,status,mobile_app_status,bound_device_id")
    .eq("id", verifiedToken.employeeId)
    .eq("company_id", verifiedToken.companyId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, status: 404, error: "Employee session not found." };
  }

  const employee = data as {
    id: string;
    company_id: string;
    employee_code: string;
    full_name: string;
    status: "active" | "inactive";
    mobile_app_status: "invited" | "active" | "blocked";
    bound_device_id: string | null;
  };

  if (employee.status !== "active" || employee.mobile_app_status !== "active") {
    return { ok: false, status: 403, error: "Mobile access is not active for this employee." };
  }

  if (!employee.bound_device_id || employee.bound_device_id !== verifiedToken.deviceId) {
    return { ok: false, status: 409, error: "This device is not authorized for the employee session." };
  }

  return { ok: true, admin, employee };
}
