import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import {
  decorateAssignmentRows,
  ensureCompanyPolicyDefinitions,
  listCompanyAssignmentTargets,
  listCompanyPolicyAssignments,
  validateAssignmentLevel,
  validatePolicyType,
} from "@/lib/companyPoliciesServer";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  try {
    const policies = await ensureCompanyPolicyDefinitions(context.admin, context.companyId, context.adminEmail);
    const assignments = await listCompanyPolicyAssignments(context.admin, context.companyId);
    const targets = await listCompanyAssignmentTargets(context.admin, context.companyId);
    const targetLabels = Object.fromEntries([
      ...targets.departments.map((target) => [target.id, target.label] as const),
      ...targets.employees.map((target) => [target.id, target.label] as const),
      [context.companyId, "Entire Company"] as const,
    ]);
    return NextResponse.json({
      policies,
      assignments: decorateAssignmentRows(assignments, policies, targetLabels),
      targets: {
        company: [{ id: context.companyId, label: "Entire Company" }],
        departments: targets.departments,
        employees: targets.employees,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load policy assignments." }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const policyType = validatePolicyType(body.policyType);
  const assignmentLevel = validateAssignmentLevel(body.assignmentLevel);
  const policyId = String(body.policyId || "").trim();
  const effectiveFrom = String(body.effectiveFrom || "").trim();
  const effectiveTo = body.effectiveTo == null ? null : String(body.effectiveTo).trim() || null;
  let targetId = String(body.targetId || "").trim();

  if (!policyType || !assignmentLevel || !policyId || !effectiveFrom) {
    return NextResponse.json({ error: "Policy type, policy, assignment level, target, and effective date are required." }, { status: 400 });
  }
  if (effectiveTo && effectiveTo < effectiveFrom) {
    return NextResponse.json({ error: "Effective To date cannot be earlier than Effective From date." }, { status: 400 });
  }

  if (assignmentLevel === "company") {
    targetId = context.companyId;
  }
  if (!targetId) {
    return NextResponse.json({ error: "Assignment target is required." }, { status: 400 });
  }

  const definitions = await ensureCompanyPolicyDefinitions(context.admin, context.companyId, context.adminEmail);
  const selectedPolicy = definitions.find((policy) => policy.id === policyId && policy.policyType === policyType);
  if (!selectedPolicy) {
    return NextResponse.json({ error: "Selected policy was not found for this company." }, { status: 400 });
  }
  if (selectedPolicy.status === "archived") {
    return NextResponse.json({ error: "Archived policy cannot be assigned." }, { status: 400 });
  }

  const existingAssignments = await listCompanyPolicyAssignments(context.admin, context.companyId);
  const overlap = existingAssignments.find((assignment) => {
    if (!assignment.isActive) return false;
    if (assignment.policyType !== policyType) return false;
    if (assignment.assignmentLevel !== assignmentLevel) return false;
    if (assignment.targetId !== targetId) return false;
    const existingEnd = assignment.effectiveTo || "9999-12-31";
    const nextEnd = effectiveTo || "9999-12-31";
    return assignment.effectiveFrom <= nextEnd && effectiveFrom <= existingEnd;
  });

  if (overlap) {
    return NextResponse.json({ error: "An active assignment already exists for this target and policy type in the selected date range." }, { status: 400 });
  }

  const { data, error } = await context.admin
    .from("company_policy_assignments")
    .insert({
      company_id: context.companyId,
      policy_type: policyType,
      policy_id: policyId,
      assignment_level: assignmentLevel,
      target_id: targetId,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      is_active: true,
      created_by: context.adminEmail,
    })
    .select("id,company_id,policy_type,policy_id,assignment_level,target_id,effective_from,effective_to,is_active,created_by,created_at,updated_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Unable to create policy assignment." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, assignment: data });
}
