import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildCompanyLogoUrl } from "@/lib/mobileCompanyLogo";

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

export type MobileEmployeeBase = {
  id: string;
  company_id: string;
  employee_code: string;
  full_name: string;
  mobile?: string | null;
  designation?: string | null;
  attendance_mode?: "office_only" | "field_staff" | null;
};

type CompanyAttendanceRow = {
  name: string | null;
  company_logo_url: string | null;
  office_lat: number | null;
  office_lon: number | null;
  office_radius_m: number | null;
};

export async function loadCompanyAttendanceConfig(admin: AdminClient, companyId: string) {
  const { data } = await admin
    .from("companies")
    .select("name,company_logo_url,office_lat,office_lon,office_radius_m")
    .eq("id", companyId)
    .maybeSingle();

  return (data as CompanyAttendanceRow | null) || null;
}

export async function buildMobileEmployeePayload(
  admin: AdminClient,
  employee: MobileEmployeeBase,
  options?: { requestOrigin?: string }
) {
  let designation = (employee.designation || "").trim();
  if (!designation) {
    const { data } = await admin
      .from("employees")
      .select("designation")
      .eq("id", employee.id)
      .eq("company_id", employee.company_id)
      .maybeSingle();
    designation = typeof data?.designation === "string" ? data.designation.trim() : "";
  }

  const company = await loadCompanyAttendanceConfig(admin, employee.company_id);
  const companyLogoUrl = buildCompanyLogoUrl({
    logoValue: company?.company_logo_url,
    companyId: employee.company_id,
    requestOrigin: options?.requestOrigin,
  });

  return {
    id: employee.id,
    companyId: employee.company_id,
    companyName: company?.name?.trim() || "",
    companyLogoUrl,
    company_logo_url: companyLogoUrl,
    employeeCode: employee.employee_code,
    fullName: employee.full_name,
    ...(designation ? { designation } : {}),
    ...(employee.mobile ? { mobile: employee.mobile } : {}),
    attendanceMode: employee.attendance_mode === "office_only" ? "office_only" : "field_staff",
    ...(company?.office_lat != null ? { officeLat: company.office_lat } : {}),
    ...(company?.office_lon != null ? { officeLon: company.office_lon } : {}),
    ...(company?.office_radius_m != null ? { officeRadiusM: company.office_radius_m } : {}),
  };
}
