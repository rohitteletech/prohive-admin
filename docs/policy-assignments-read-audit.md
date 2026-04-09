# Policy Assignments Read Audit

Date: 2026-03-29

## Summary

- Policy assignments are already fully modeled in the new policy engine.
- Assignment creation, listing, resolution, and deactivation all use `company_policy_assignments`.
- There is no legacy assignment table or mirror-write path still in use.
- The main remaining risk is security:
  - `company_policy_assignments` still has broad authenticated RLS on live Supabase
  - `company_policy_definitions` also still has broad authenticated RLS

## Frontend

- `/company/settings/policies/assignments`
  - loads through `/api/company/policy-assignments`
  - creates override assignments through `/api/company/policy-assignments`
  - deactivates assignments through `/api/company/policy-assignments/[id]`
- Individual policy pages also read assignment-derived workforce counts through `/api/company/policy-assignments`

## App/API reads already on the new engine

- `app/api/company/policy-assignments/route.ts`
  - loads policy definitions using `ensureCompanyPolicyDefinitions(...)`
  - loads assignments using `listCompanyPolicyAssignments(...)`
  - loads assignment targets from employees
  - computes workforce counts using engine resolution
- `app/api/company/policy-assignments/[id]/route.ts`
  - updates `company_policy_assignments` directly
  - validates overlap rules before keeping an assignment active
- `lib/companyPoliciesServer.ts`
  - `listCompanyPolicyAssignments(...)`
  - `listCompanyPolicyWorkforceCounts(...)`
  - `resolvePoliciesForEmployee(...)`
  - `resolvePoliciesForEmployees(...)`
- `lib/companyPolicies.ts`
  - `resolvePolicyForEmployee(...)`
  - assignment priority and date-effectiveness logic
  - reads `company_policy_assignments` directly for mobile punch policy resolution

## Current write-path status

- Assignment create path writes directly to `company_policy_assignments`
- Assignment update/deactivation path updates `company_policy_assignments`
- No legacy assignment mirror table exists
- No old company-level assignment fallback storage exists

## Current runtime status

- Policy assignment resolution is already active in:
  - attendance
  - mobile home summary
  - mobile calendar
  - leave flows
  - correction flows
  - reports
  - live `punch` edge function

This means assignment behavior is already operationally cut over.

## Live Supabase findings

- `company_policy_assignments` exists and is actively used
- `company_policy_definitions` exists and is actively used
- both tables still use permissive authenticated RLS policies:
  - `USING (true)` for update/delete
  - `WITH CHECK (true)` for insert/update

## Cutover implication

- Policy assignments are not blocked by legacy storage cleanup.
- The remaining work is:
  - harden RLS on `company_policy_assignments`
  - harden RLS on `company_policy_definitions`
  - keep the assignment page and resolution logic as-is

## Recommended next task

- Apply global policy-engine RLS cleanup for:
  - `company_policy_definitions`
  - `company_policy_assignments`
