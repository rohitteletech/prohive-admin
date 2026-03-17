import { redirect } from "next/navigation";

export default function CompanyAttendancePolicyRedirectPage() {
  redirect("/company/settings/policies/attendance-policy");
}
