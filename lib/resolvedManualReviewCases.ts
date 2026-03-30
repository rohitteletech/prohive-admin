import type { NonWorkingDayTreatment } from "@/lib/attendancePolicy";
import { fetchResolvedNonWorkingDayTreatmentMap } from "@/lib/manualReviewCases";
import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClientLike = SupabaseClient;

export async function fetchResolvedManualReviewCaseMap(params: {
  admin: AdminClientLike;
  companyId: string;
  employeeIds: string[];
  startDate: string;
  endDate: string;
}) {
  return fetchResolvedNonWorkingDayTreatmentMap(params);
}

export async function fetchResolvedManualReviewCaseMapForEmployee(params: {
  admin: AdminClientLike;
  companyId: string;
  employeeId: string;
  startDate: string;
  endDate: string;
}) {
  const result = await fetchResolvedManualReviewCaseMap({
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
