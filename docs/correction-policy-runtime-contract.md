# Correction / Regularization Policy Runtime Contract

This document defines the canonical runtime contract for `correction` policy definitions stored in `company_policy_definitions.config_json`.

## Canonical config owner

- Policy config source of truth: `public.company_policy_definitions`
- Policy type: `correction`
- Operational workflow storage:
  - `public.employee_attendance_corrections`
  - `public.employee_attendance_correction_audit_logs`
  - `public.attendance_manual_review_resolutions`
  - `public.attendance_manual_review_resolution_history`

## Canonical stored shape

```ts
type CorrectionPolicyStoredConfig = {
  policyName: string;
  policyCode: string;
  effectiveFrom: string;
  nextReviewDate: string;
  status: "draft" | "active" | "archived";
  defaultCompanyPolicy: "Yes" | "No";
  attendanceCorrectionEnabled: "Yes" | "No";
  missingPunchCorrectionAllowed: "Yes" | "No";
  latePunchRegularizationAllowed: "Yes" | "No";
  earlyGoRegularizationAllowed: "Yes" | "No";
  maximumBackdatedDays: string;
  approvalRequired: "Yes" | "No";
  approvalFlow: "Manager Approval" | "HR Approval" | "Manager + HR Approval";
  maximumRequestsPerMonth: string;
  reasonMandatory: "Yes" | "No";
};
```

## Contract rules

- `maximumBackdatedDays` is stored as a whole-number string
- `maximumRequestsPerMonth` is stored as a whole-number string
- if `attendanceCorrectionEnabled = "No"` then runtime should behave as fully disabled
- if correction is disabled, request-related flags should normalize to non-operative values
- if `approvalRequired = "No"`, workflow may auto-approve and `approvalFlow` becomes informational only

## Default policy config

New company onboarding and missing-definition seeding should use this default:

- `policyName = "Standard Correction Policy"`
- `status = "active"`
- `defaultCompanyPolicy = "Yes"`
- `attendanceCorrectionEnabled = "Yes"`
- `missingPunchCorrectionAllowed = "Yes"`
- `latePunchRegularizationAllowed = "Yes"`
- `earlyGoRegularizationAllowed = "Yes"`
- `maximumBackdatedDays = "2"`
- `approvalRequired = "Yes"`
- `approvalFlow = "Manager + HR Approval"`
- `maximumRequestsPerMonth = "3"`
- `reasonMandatory = "Yes"`

Onboarding status:

- New company creation seeds the default `correction` policy through `defaultPolicyDefinitions(...)`
- The seed writes directly to `company_policy_definitions`
- No separate correction config storage is involved during onboarding

## Runtime output contract

`resolveCorrectionPolicyRuntime()` should return:

```ts
{
  attendanceCorrectionEnabled: boolean;
  missingPunchCorrectionAllowed: boolean;
  latePunchRegularizationAllowed: boolean;
  earlyGoRegularizationAllowed: boolean;
  maximumBackdatedDays: number;
  approvalRequired: boolean;
  approvalFlow: "Manager Approval" | "HR Approval" | "Manager + HR Approval";
  maximumRequestsPerMonth: number;
  reasonMandatory: boolean;
}
```

## System split

- Policy behavior must resolve from `company_policy_definitions`
- Correction request rows remain operational workflow data
- Audit and manual review rows remain operational workflow data
- Cleanup should remove fallback behavior and broad RLS, not remove the workflow tables themselves
