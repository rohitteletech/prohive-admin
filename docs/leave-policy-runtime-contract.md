# Leave Policy Runtime Contract

Date: 2026-03-29

## Purpose

This document freezes the canonical leave-policy config shape that the new policy engine owns.

From this point forward, leave-policy reads should treat `public.company_policy_definitions.config_json`
for `policy_type = 'leave'` as the single source of truth.

## Canonical Stored Config

```ts
type LeavePolicyStoredConfig = {
  policyName: string;
  policyCode: string;
  effectiveFrom: string;
  nextReviewDate: string;
  status: "draft" | "active" | "archived";
  defaultCompanyPolicy: "Yes" | "No";
  leaveCycleType: "Calendar Year" | "Financial Year";
  approvalFlow: "manager" | "manager_hr" | "hr";
  noticePeriodDays: string;
  backdatedLeaveAllowed: "Yes" | "No";
  maximumBackdatedLeaveDays: string;
  ifEmployeePunchesOnApprovedLeave: "Allow Punch and Send for Approval" | "Keep Leave" | "Block Punch";
  sandwichLeave: "Enabled" | "Disabled";
  leaveTypes: LeaveTypeStoredConfig[];
}

type LeaveTypeStoredConfig = {
  id: string;
  name: string;
  code: string;
  paymentMode: "Paid" | "Unpaid";
  annualQuota: string;
  halfDayAllowed: "Yes" | "No";
  accrualRule: "Yearly Upfront" | "Monthly Accrual";
  carryForwardAllowed: "Yes" | "No";
  maximumCarryForwardDays: string;
  carryForwardExpiryDays: string;
}
```

## Engine-Owned Fields

These fields are now canonical and must come from the new engine:

- `leaveCycleType`
- `approvalFlow`
- `noticePeriodDays`
- `backdatedLeaveAllowed`
- `maximumBackdatedLeaveDays`
- `ifEmployeePunchesOnApprovedLeave`
- `sandwichLeave`
- `leaveTypes[].id`
- `leaveTypes[].name`
- `leaveTypes[].code`
- `leaveTypes[].paymentMode`
- `leaveTypes[].annualQuota`
- `leaveTypes[].halfDayAllowed`
- `leaveTypes[].accrualRule`
- `leaveTypes[].carryForwardAllowed`
- `leaveTypes[].maximumCarryForwardDays`
- `leaveTypes[].carryForwardExpiryDays`

## Runtime Interpretation

At runtime the app resolves these normalized values:

- `annualQuota` -> whole number
- `halfDayAllowed` -> boolean
- `accrualRule` -> `"Yearly Upfront"` or `"Monthly Accrual"`
- `carryForwardAllowed` -> boolean
- `maximumCarryForwardDays` -> whole number
- `carryForwardExpiryDays` -> whole number
- `noticePeriodDays` -> whole number
- `maximumBackdatedLeaveDays` -> whole number

## Operational Tables That Stay

These are not config sources and remain operational:

- `employee_leave_requests`
- `employee_leave_balance_overrides`
- `employee_leave_balance_override_audit_logs`

## Legacy Table Status

`company_leave_policies` is no longer the target config model.
It has been removed from the runtime database in the leave engine cutover.

During cutover it may still exist temporarily, but app logic should stop depending on it for:

- leave type list
- annual quota
- accrual mode
- carry forward settings
- leave type validation

## Default Seed Expectation

A newly onboarded company should receive a default leave policy directly in the policy engine with:

- one default leave type
- non-empty `config_json`
- no requirement to infer leave behavior from `company_leave_policies`
