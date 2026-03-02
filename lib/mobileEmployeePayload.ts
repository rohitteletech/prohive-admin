import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

export type MobileEmployeeBase = {
  id: string;
  company_id: string;
  employee_code: string;
  full_name: string;
  mobile?: string | null;
  attendance_mode?: "office_only" | "field_staff" | null;
};

type CompanyAttendanceRow = {
  office_lat: number | null;
  office_lon: number | null;
  office_radius_m: number | null;
};

export async function loadCompanyAttendanceConfig(admin: AdminClient, companyId: string) {
  const { data } = await admin
    .from("companies")
    .select("office_lat,office_lon,office_radius_m")
    .eq("id", companyId)
    .maybeSingle();

  return (data as CompanyAttendanceRow | null) || null;
}

export async function buildMobileEmployeePayload(admin: AdminClient, employee: MobileEmployeeBase) {
  const company = await loadCompanyAttendanceConfig(admin, employee.company_id);

  return {
    id: employee.id,
    companyId: employee.company_id,
    employeeCode: employee.employee_code,
    fullName: employee.full_name,
    ...(employee.mobile ? { mobile: employee.mobile } : {}),
    attendanceMode: employee.attendance_mode === "office_only" ? "office_only" : "field_staff",
    ...(company?.office_lat != null ? { officeLat: company.office_lat } : {}),
    ...(company?.office_lon != null ? { officeLon: company.office_lon } : {}),
    ...(company?.office_radius_m != null ? { officeRadiusM: company.office_radius_m } : {}),
  };
}
