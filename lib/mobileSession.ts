import { getSupabaseAdminClient } from "@/lib/supabase/admin";

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
  employeeId?: string;
  companyId?: string;
  deviceId?: string;
}): Promise<MobileSessionContext> {
  const employeeId = (input.employeeId || "").trim();
  const companyId = (input.companyId || "").trim();
  const deviceId = (input.deviceId || "").trim();

  if (!employeeId || !companyId || !deviceId) {
    return { ok: false, status: 400, error: "Missing mobile session identifiers." };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return { ok: false, status: 500, error: "Server is not configured." };
  }

  const { data, error } = await admin
    .from("employees")
    .select("id,company_id,employee_code,full_name,status,mobile_app_status,bound_device_id")
    .eq("id", employeeId)
    .eq("company_id", companyId)
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

  if (!employee.bound_device_id || employee.bound_device_id !== deviceId) {
    return { ok: false, status: 409, error: "This device is not authorized for the employee session." };
  }

  return { ok: true, admin, employee };
}
