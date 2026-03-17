import { redirect } from "next/navigation";

export default function CompanyLeavePolicyRedirectPage() {
  redirect("/company/settings/policies/leave-policy");
}
