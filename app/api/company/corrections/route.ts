import { NextRequest, NextResponse } from "next/server";
import { resolveCorrectionPolicyRuntime } from "@/lib/companyPolicyRuntime";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { ensureCompanyPolicyDefinitions, listCompanyPolicyAssignments } from "@/lib/companyPoliciesServer";
import { expirePendingCorrections } from "@/lib/attendanceCorrections";
import { correctionRowFromDb } from "@/lib/companyCorrections";
import { resolvePolicyForEmployee } from "@/lib/companyPolicies";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }
  await expirePendingCorrections(context.admin, context.companyId);

  const { data, error } = await context.admin
    .from("employee_attendance_corrections")
    .select(
      "id,employee_id,correction_date,requested_check_in,requested_check_out,reason,status,admin_remark,submitted_at"
      + ",employees(full_name,employee_code,department)"
    )
    .eq("company_id", context.companyId)
    .order("submitted_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load correction requests." }, { status: 400 });
  }

  const definitions = await ensureCompanyPolicyDefinitions(context.admin, context.companyId, context.adminEmail);
  const assignments = await listCompanyPolicyAssignments(context.admin, context.companyId);

  return NextResponse.json({
    rows: Array.isArray(data)
      ? data.map((row) => {
          const source = row as unknown as Record<string, unknown>;
          const employee = (source.employees || {}) as Record<string, unknown>;
          const resolvedPolicy = resolvePolicyForEmployee({
            policyType: "correction",
            employeeId: String(source.employee_id || ""),
            department: String(employee.department || ""),
            onDate: String(source.correction_date || ""),
            assignments,
            definitions,
          });
          const runtime = resolveCorrectionPolicyRuntime(resolvedPolicy);
          return correctionRowFromDb({
            ...source,
            policy_name: resolvedPolicy?.policyName || "Standard Correction Policy",
            policy_code: resolvedPolicy?.policyCode || "COR-001",
            approval_mode: runtime.approvalRequired ? runtime.approvalFlow : "Auto Approval",
          });
        })
      : [],
  });
}
