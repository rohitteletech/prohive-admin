import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AssignmentLevel,
  defaultPolicyDefinitions,
  labelAssignmentLevel,
  labelPolicyType,
  policyAssignmentFromDb,
  policyDefinitionFromDb,
  PolicyAssignment,
  PolicyDefinition,
  PolicyType,
  resolvePolicyForEmployee,
} from "@/lib/companyPolicies";

export async function ensureCompanyPolicyDefinitions(admin: SupabaseClient, companyId: string, createdBy: string) {
  const { data, error } = await admin
    .from("company_policy_definitions")
    .select("id,company_id,policy_type,policy_name,policy_code,status,is_default,effective_from,next_review_date,config_json,created_by,created_at,updated_at")
    .eq("company_id", companyId)
    .order("policy_type", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Unable to load company policy definitions.");
  }

  const rows = Array.isArray(data) ? data.map((row) => policyDefinitionFromDb(row as never)) : [];
  const existingTypes = new Set(rows.map((row) => row.policyType));
  const missing = defaultPolicyDefinitions(companyId, createdBy).filter((row) => !existingTypes.has(row.policy_type));

  if (missing.length > 0) {
    const { error: insertError } = await admin.from("company_policy_definitions").insert(missing);
    if (insertError && insertError.code !== "23505") {
      throw new Error(insertError.message || "Unable to seed default company policies.");
    }
  }

  const { data: finalData, error: finalError } = await admin
    .from("company_policy_definitions")
    .select("id,company_id,policy_type,policy_name,policy_code,status,is_default,effective_from,next_review_date,config_json,created_by,created_at,updated_at")
    .eq("company_id", companyId)
    .order("policy_type", { ascending: true })
    .order("created_at", { ascending: true });

  if (finalError) {
    throw new Error(finalError.message || "Unable to load seeded company policies.");
  }

  return Array.isArray(finalData) ? finalData.map((row) => policyDefinitionFromDb(row as never)) : [];
}

export async function listCompanyPolicyAssignments(admin: SupabaseClient, companyId: string) {
  const { data, error } = await admin
    .from("company_policy_assignments")
    .select("id,company_id,policy_type,policy_id,assignment_level,target_id,effective_from,effective_to,is_active,created_by,created_at,updated_at")
    .eq("company_id", companyId)
    .order("is_active", { ascending: false })
    .order("effective_from", { ascending: false });

  if (error) {
    throw new Error(error.message || "Unable to load company policy assignments.");
  }

  return Array.isArray(data) ? data.map((row) => policyAssignmentFromDb(row as never)) : [];
}

export async function listCompanyAssignmentTargets(admin: SupabaseClient, companyId: string) {
  const { data, error } = await admin
    .from("employees")
    .select("id,full_name,employee_code,department,status")
    .eq("company_id", companyId)
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(error.message || "Unable to load employee targets.");
  }

  const employees = (Array.isArray(data) ? data : [])
    .filter((row) => row && typeof row.id === "string")
    .map((row) => ({
      id: String(row.id),
      label: `${String(row.full_name || "Employee")} (${String(row.employee_code || "-")})`,
      department: typeof row.department === "string" ? row.department : "",
      status: String(row.status || ""),
    }));

  const departmentSet = new Set<string>();
  for (const employee of employees) {
    if (employee.department.trim()) departmentSet.add(employee.department.trim());
  }

  return {
    departments: Array.from(departmentSet).sort((a, b) => a.localeCompare(b)).map((name) => ({ id: name, label: name })),
    employees: employees.map((employee) => ({ id: employee.id, label: employee.label })),
  };
}

export async function listCompanyPolicyWorkforceCounts(
  admin: SupabaseClient,
  companyId: string,
  onDate: string,
) {
  const { data, error } = await admin
    .from("employees")
    .select("id,department,status")
    .eq("company_id", companyId)
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(error.message || "Unable to load employees for policy workforce counts.");
  }

  const employees = (Array.isArray(data) ? data : [])
    .filter((row) => row && typeof row.id === "string")
    .filter((row) => String(row.status || "").toLowerCase() === "active")
    .map((row) => ({
      id: String(row.id),
      department: typeof row.department === "string" ? row.department : "",
    }));

  const definitions = await ensureCompanyPolicyDefinitions(admin, companyId, "system@policy.local");
  const assignments = await listCompanyPolicyAssignments(admin, companyId);
  const counts: Record<PolicyType, Record<string, number>> = {
    shift: {},
    attendance: {},
    leave: {},
    holiday_weekoff: {},
    correction: {},
  };

  for (const employee of employees) {
    const department = employee.department || "";
    (["shift", "attendance", "leave", "holiday_weekoff", "correction"] as PolicyType[]).forEach((policyType) => {
      const resolved = resolvePolicyForEmployee({
        policyType,
        employeeId: employee.id,
        department,
        onDate,
        assignments,
        definitions,
      });
      if (!resolved?.id) return;
      counts[policyType][resolved.id] = (counts[policyType][resolved.id] || 0) + 1;
    });
  }

  return {
    activeEmployeeCount: employees.length,
    byPolicyType: counts,
  };
}

export function decorateAssignmentRows(
  assignments: PolicyAssignment[],
  definitions: PolicyDefinition[],
  targetLabels?: Record<string, string>,
) {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  return assignments.map((assignment) => {
    const definition = definitionsById.get(assignment.policyId);
    return {
      id: assignment.id,
      policyType: assignment.policyType,
      policyTypeLabel: labelPolicyType(assignment.policyType),
      policyId: assignment.policyId,
      policyName: definition?.policyName || "Unknown Policy",
      policyCode: definition?.policyCode || "-",
      assignmentLevel: assignment.assignmentLevel,
      assignmentLevelLabel: labelAssignmentLevel(assignment.assignmentLevel),
      targetId: assignment.targetId,
      targetLabel:
        assignment.assignmentLevel === "company" ? "Entire Company" : targetLabels?.[assignment.targetId] || assignment.targetId,
      effectiveFrom: assignment.effectiveFrom,
      effectiveTo: assignment.effectiveTo,
      isActive: assignment.isActive,
      statusLabel: assignment.isActive ? "Active" : "Inactive",
    };
  });
}

export function validatePolicyType(value: unknown): PolicyType | null {
  return value === "shift" || value === "attendance" || value === "leave" || value === "holiday_weekoff" || value === "correction"
    ? value
    : null;
}

export function validateAssignmentLevel(value: unknown): AssignmentLevel | null {
  return value === "company" || value === "department" || value === "employee" ? value : null;
}

export async function resolvePoliciesForEmployee(
  admin: SupabaseClient,
  companyId: string,
  employeeId: string,
  onDate: string,
  policyTypes: PolicyType[],
) {
  const { data: employeeData, error: employeeError } = await admin
    .from("employees")
    .select("id,department,shift_name")
    .eq("company_id", companyId)
    .eq("id", employeeId)
    .maybeSingle();

  if (employeeError || !employeeData?.id) {
    throw new Error(employeeError?.message || "Unable to load employee policy context.");
  }

  const definitions = await ensureCompanyPolicyDefinitions(admin, companyId, "system@policy.local");
  const assignments = await listCompanyPolicyAssignments(admin, companyId);
  const resolved = Object.fromEntries(
    policyTypes.map((policyType) => [
      policyType,
      resolvePolicyForEmployee({
        policyType,
        employeeId,
        department: typeof employeeData.department === "string" ? employeeData.department : null,
        onDate,
        assignments,
        definitions,
      }),
    ]),
  ) as Record<PolicyType, PolicyDefinition | null>;

  return {
    employee: {
      id: String(employeeData.id),
      department: typeof employeeData.department === "string" ? employeeData.department : "",
      shiftName: typeof employeeData.shift_name === "string" ? employeeData.shift_name : "",
    },
    resolved,
  };
}

export async function resolvePoliciesForEmployees(
  admin: SupabaseClient,
  companyId: string,
  employees: Array<{ id: string; department?: string | null; shiftName?: string | null }>,
  onDate: string,
  policyTypes: PolicyType[],
) {
  const definitions = await ensureCompanyPolicyDefinitions(admin, companyId, "system@policy.local");
  const assignments = await listCompanyPolicyAssignments(admin, companyId);
  const resolvedByEmployee = new Map<
    string,
    {
      department: string;
      shiftName: string;
      resolved: Record<PolicyType, PolicyDefinition | null>;
    }
  >();

  for (const employee of employees) {
    if (!employee?.id) continue;
    const department = typeof employee.department === "string" ? employee.department : "";
    const shiftName = typeof employee.shiftName === "string" ? employee.shiftName : "";
    const resolved = Object.fromEntries(
      policyTypes.map((policyType) => [
        policyType,
        resolvePolicyForEmployee({
          policyType,
          employeeId: employee.id,
          department,
          onDate,
          assignments,
          definitions,
        }),
      ]),
    ) as Record<PolicyType, PolicyDefinition | null>;
    resolvedByEmployee.set(employee.id, { department, shiftName, resolved });
  }

  return resolvedByEmployee;
}
