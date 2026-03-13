export type PolicyType = "shift" | "attendance" | "leave" | "holiday_weekoff" | "correction";
export type PolicyStatus = "draft" | "active" | "archived";
export type AssignmentLevel = "company" | "department" | "employee";

export type PolicyDefinition = {
  id: string;
  companyId: string;
  policyType: PolicyType;
  policyName: string;
  policyCode: string;
  status: PolicyStatus;
  isDefault: boolean;
  effectiveFrom: string;
  nextReviewDate: string;
  configJson: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PolicyAssignment = {
  id: string;
  companyId: string;
  policyType: PolicyType;
  policyId: string;
  assignmentLevel: AssignmentLevel;
  targetId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type PolicyDefinitionDbRow = {
  id: string;
  company_id: string;
  policy_type: PolicyType;
  policy_name: string;
  policy_code: string;
  status: PolicyStatus;
  is_default: boolean;
  effective_from: string;
  next_review_date: string;
  config_json: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type PolicyAssignmentDbRow = {
  id: string;
  company_id: string;
  policy_type: PolicyType;
  policy_id: string;
  assignment_level: AssignmentLevel;
  target_id: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export function policyDefinitionFromDb(row: PolicyDefinitionDbRow): PolicyDefinition {
  return {
    id: row.id,
    companyId: row.company_id,
    policyType: row.policy_type,
    policyName: row.policy_name,
    policyCode: row.policy_code,
    status: row.status,
    isDefault: row.is_default,
    effectiveFrom: row.effective_from,
    nextReviewDate: row.next_review_date,
    configJson: row.config_json || {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function policyAssignmentFromDb(row: PolicyAssignmentDbRow): PolicyAssignment {
  return {
    id: row.id,
    companyId: row.company_id,
    policyType: row.policy_type,
    policyId: row.policy_id,
    assignmentLevel: row.assignment_level,
    targetId: row.target_id,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function defaultPolicyDefinitions(companyId: string, createdBy: string): Omit<PolicyDefinitionDbRow, "created_at" | "updated_at">[] {
  const today = "2026-03-13";
  const nextReview = "2027-03-13";
  return [
    {
      id: crypto.randomUUID(),
      company_id: companyId,
      policy_type: "shift",
      policy_name: "Standard Shift Policy",
      policy_code: "SFT-001",
      status: "active",
      is_default: true,
      effective_from: today,
      next_review_date: nextReview,
      config_json: {},
      created_by: createdBy,
    },
    {
      id: crypto.randomUUID(),
      company_id: companyId,
      policy_type: "attendance",
      policy_name: "Standard Attendance Policy",
      policy_code: "ATT-001",
      status: "active",
      is_default: true,
      effective_from: today,
      next_review_date: nextReview,
      config_json: {},
      created_by: createdBy,
    },
    {
      id: crypto.randomUUID(),
      company_id: companyId,
      policy_type: "leave",
      policy_name: "Standard Leave Policy",
      policy_code: "LEV-001",
      status: "active",
      is_default: true,
      effective_from: today,
      next_review_date: nextReview,
      config_json: {},
      created_by: createdBy,
    },
    {
      id: crypto.randomUUID(),
      company_id: companyId,
      policy_type: "holiday_weekoff",
      policy_name: "Standard Holiday Policy",
      policy_code: "HOL-001",
      status: "active",
      is_default: true,
      effective_from: today,
      next_review_date: nextReview,
      config_json: {},
      created_by: createdBy,
    },
    {
      id: crypto.randomUUID(),
      company_id: companyId,
      policy_type: "correction",
      policy_name: "Standard Correction Policy",
      policy_code: "COR-001",
      status: "active",
      is_default: true,
      effective_from: today,
      next_review_date: nextReview,
      config_json: {},
      created_by: createdBy,
    },
  ];
}

export function compareAssignmentPriority(level: AssignmentLevel) {
  if (level === "employee") return 3;
  if (level === "department") return 2;
  return 1;
}

export function isAssignmentEffective(assignment: Pick<PolicyAssignment, "effectiveFrom" | "effectiveTo" | "isActive">, onDate: string) {
  if (!assignment.isActive) return false;
  if (assignment.effectiveFrom > onDate) return false;
  if (assignment.effectiveTo && assignment.effectiveTo < onDate) return false;
  return true;
}

export function resolvePolicyForEmployee(params: {
  policyType: PolicyType;
  employeeId: string;
  department?: string | null;
  onDate: string;
  assignments: PolicyAssignment[];
  definitions: PolicyDefinition[];
}) {
  const { policyType, employeeId, department, onDate, assignments, definitions } = params;
  const applicable = assignments
    .filter((assignment) => assignment.policyType === policyType)
    .filter((assignment) => isAssignmentEffective(assignment, onDate))
    .filter((assignment) => {
      if (assignment.assignmentLevel === "employee") return assignment.targetId === employeeId;
      if (assignment.assignmentLevel === "department") return Boolean(department) && assignment.targetId === department;
      return true;
    })
    .sort((a, b) => compareAssignmentPriority(b.assignmentLevel) - compareAssignmentPriority(a.assignmentLevel));

  const matched = applicable[0];
  if (matched) {
    return definitions.find((definition) => definition.id === matched.policyId) || null;
  }

  return definitions.find((definition) => definition.policyType === policyType && definition.isDefault) || null;
}

export function labelPolicyType(value: PolicyType) {
  switch (value) {
    case "shift":
      return "Shift Policy";
    case "attendance":
      return "Attendance Policy";
    case "leave":
      return "Leave Policy";
    case "holiday_weekoff":
      return "Holiday / Weekly Off Policy";
    case "correction":
      return "Correction / Regularization Policy";
    default:
      return value;
  }
}

export function labelAssignmentLevel(value: AssignmentLevel) {
  switch (value) {
    case "company":
      return "Company";
    case "department":
      return "Department";
    case "employee":
      return "Employee";
    default:
      return value;
  }
}
