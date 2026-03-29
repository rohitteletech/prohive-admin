# Leave Policy Read Audit

Date: 2026-03-29

## Goal

Map every current leave-policy-related read path and classify whether it uses:

- new policy engine
- legacy `company_leave_policies`
- both
- transactional leave data

This audit is the input for the leave single-source-of-truth cutover.

## Summary

Current leave reads were originally in a mixed state.

- Policy resolution already exists in the new engine via `company_policy_definitions` and `company_policy_assignments`.
- Those app/lib read dependencies have now been removed during Task 3.
- The remaining legacy coupling was the save-time mirror write in `save_leave_policy_definition`.
- Transactional leave data remains in `employee_leave_requests` and `employee_leave_balance_overrides`, which should stay operational after the refactor.

## New Engine Read Paths

These paths already consume leave policy data through the new policy engine:

- `lib/companyPolicyRuntime.ts`
  - `resolveLeaveTypesRuntime`
  - `resolveLeavePolicyRuntime`
- `lib/companyPoliciesServer.ts`
  - `resolvePoliciesForEmployee`
  - `resolvePoliciesForEmployees`
- `app/api/mobile/leaves/summary/route.ts`
  - resolves assigned leave policy and leave types from the engine
- `app/api/mobile/leaves/apply/route.ts`
  - resolves assigned leave policy and leave types from the engine
- `app/api/company/leaves/[id]/route.ts`
  - resolves leave policy for approval-time calculations
- `lib/companyReportsLeaves.ts`
  - resolves leave policies per employee for report balance calculation
- `lib/mobilePunch.ts`
  - reads leave policy runtime for punch-on-approved-leave handling

## Legacy Table Read Paths

These paths previously read `company_leave_policies` before Task 3 cutover:

- `app/api/mobile/leaves/summary/route.ts`
  - queries active legacy leave rows
  - uses engine-resolved leave types when present, otherwise falls back to legacy rows
- `app/api/mobile/leaves/apply/route.ts`
  - queries active legacy leave rows
  - uses engine-resolved leave types when present, otherwise falls back to legacy rows
- `app/api/company/leaves/[id]/route.ts`
  - queries `company_leave_policies` during approval validation for non-comp-off leave
- `app/api/company/leaves/overrides/route.ts`
  - loads policy code/name list from `company_leave_policies`
  - validates override leave type existence against `company_leave_policies`
- `lib/companyReportsLeaves.ts`
  - loads active leave policies from `company_leave_policies`
  - uses resolved leave type if available, otherwise falls back to legacy policy rows

## Transactional Read Paths

These are not legacy config reads. They are valid operational data reads that should remain:

- `employee_leave_requests`
  - `app/api/company/leaves/route.ts`
  - `app/api/company/leaves/[id]/route.ts`
  - `app/api/mobile/leaves/summary/route.ts`
  - `app/api/mobile/leaves/apply/route.ts`
  - `lib/leaveAccrual.ts`
  - `lib/companyReportsLeaves.ts`
- `employee_leave_balance_overrides`
  - `app/api/company/leaves/overrides/route.ts`
  - `lib/leaveAccrual.ts`
- `employee_leave_balance_override_audit_logs`
  - `app/api/company/leaves/overrides/route.ts`

## Bridge / Legacy Write Source That Creates Future Coupling

The legacy table was still being written by the leave save function until Task 4:

- `supabase/migrations/20260328010000_add_transactional_leave_policy_save.sql`
- `supabase/schema.sql`
  - `save_leave_policy_definition`
  - deletes and reinserts rows into `public.company_leave_policies`

This is the main reason new-engine-only cutover is not complete yet.

## Read Classification By Area

### Company leave policy page

- Page UI reads via `/api/company/policies/leave-bridge`
- Source today: new engine
- Status: mostly ready

### Mobile leave summary

- Source today: engine + legacy fallback
- Status: mixed

### Mobile leave apply

- Source today: engine + legacy fallback
- Status: mixed

### Company leave approval

- Source today: engine + direct legacy validation read
- Status: mixed

### Leave overrides admin

- Source today: legacy only for leave type list and validation
- Status: blocker for engine-only cutover

### Leave reports

- Source today: engine + legacy fallback
- Status: mixed

## Main Cutover Blockers

These are the concrete blockers before `company_policy_definitions` can become the only leave config source:

1. `save_leave_policy_definition`
   - was still mirroring policy config into `company_leave_policies`

Task 3 removed the app/lib read dependencies.
Task 4 removes the save-time mirror write.

## Recommended Task 2 Scope

Task 2 should finalize the leave runtime contract and declare the engine-owned fields that all reads must use:

- leave cycle type
- approval flow
- notice period days
- backdated leave settings
- leave type code
- leave type name
- annual quota
- accrual rule
- half day allowed
- carry forward allowed
- maximum carry forward days
- carry forward expiry days
- payment mode

Task 3 safely replaced the app/lib `company_leave_policies` reads.
Task 4 removes the save-time mirror write.

## End-State Target

After leave cutover:

- config reads come only from `company_policy_definitions`
- targeting comes only from `company_policy_assignments`
- `company_leave_policies` is no longer queried by app logic
- leave saves no longer write mirror rows into `company_leave_policies`
- the legacy `company_leave_policies` table and its RLS policies have been dropped from the live database
- `employee_leave_requests` and override/audit tables remain operational
