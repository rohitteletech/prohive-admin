import type { NonWorkingDayTreatment } from "@/lib/attendancePolicy";
import type { SupabaseClient } from "@supabase/supabase-js";

export const RESOLVABLE_NON_WORKING_TREATMENTS: NonWorkingDayTreatment[] = [
  "Record Only",
  "OT Only",
  "Grant Comp Off",
  "Present + OT",
];
type AdminClientLike = SupabaseClient;

export function normalizeResolvedNonWorkingDayTreatment(value: unknown): NonWorkingDayTreatment | null {
  const text = String(value || "").trim();
  return RESOLVABLE_NON_WORKING_TREATMENTS.includes(text as NonWorkingDayTreatment)
    ? (text as NonWorkingDayTreatment)
    : null;
}

export async function fetchManualReviewResolutionMap(params: {
  admin: AdminClientLike;
  companyId: string;
  employeeIds: string[];
  startDate: string;
  endDate: string;
}) {
  const employeeIds = Array.from(new Set(params.employeeIds.filter(Boolean)));
  if (employeeIds.length === 0) return { byEmployeeDate: new Map<string, NonWorkingDayTreatment>(), error: null as string | null };

  const { data, error } = await params.admin
    .from("attendance_manual_review_resolutions")
    .select("employee_id,work_date,resolution_treatment")
    .eq("company_id", params.companyId)
    .in("employee_id", employeeIds)
    .gte("work_date", params.startDate)
    .lte("work_date", params.endDate);

  if (error) {
    return { byEmployeeDate: new Map<string, NonWorkingDayTreatment>(), error: error.message || "Unable to load manual review resolutions." };
  }

  const byEmployeeDate = new Map<string, NonWorkingDayTreatment>();
  ((data || []) as Array<{ employee_id?: string | null; work_date?: string | null; resolution_treatment?: string | null }>).forEach((row) => {
    const employeeId = String(row.employee_id || "");
    const workDate = String(row.work_date || "");
    const treatment = normalizeResolvedNonWorkingDayTreatment(row.resolution_treatment);
    if (!employeeId || !workDate || !treatment) return;
    byEmployeeDate.set(`${employeeId}:${workDate}`, treatment);
  });

  return { byEmployeeDate, error: null as string | null };
}

export async function fetchManualReviewResolutionMapForEmployee(params: {
  admin: AdminClientLike;
  companyId: string;
  employeeId: string;
  startDate: string;
  endDate: string;
}) {
  const result = await fetchManualReviewResolutionMap({
    admin: params.admin,
    companyId: params.companyId,
    employeeIds: [params.employeeId],
    startDate: params.startDate,
    endDate: params.endDate,
  });
  const byDate = new Map<string, NonWorkingDayTreatment>();
  result.byEmployeeDate.forEach((value, key) => {
    const [, date] = key.split(":");
    if (date) byDate.set(date, value);
  });
  return { byDate, error: result.error };
}
