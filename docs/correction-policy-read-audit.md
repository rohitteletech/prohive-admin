# Correction / Regularization Policy Read Audit

This audit captures where the current project reads correction / regularization policy behavior across frontend, backend, mobile flows, and Supabase.

## Summary

- Correction policy configuration already reads from `company_policy_definitions`.
- Correction request execution still depends on operational workflow tables.
- Manual review flow is a separate operational subsystem that also depends on dedicated tables.
- This area is a mixed architecture:
  - policy behavior is engine-backed
  - request lifecycle is workflow-table-backed
  - manual review resolution is workflow-table-backed

## Frontend

- `/company/settings/policies/correction-regularization-policy`
  - Loads and saves through `/api/company/policies/correction-bridge`
  - Loads policy register through `/api/company/policies?policy_type=correction`
  - Loads workforce counts through `/api/company/policy-assignments`
- `/company/manual-reviews`
  - Uses `/api/company/manual-reviews`
  - Reads attendance manual review queue and resolution history
- Company corrections pages also depend on correction workflow APIs:
  - `/api/company/corrections`
  - `/api/company/corrections/[id]`

## Policy config reads already on the new engine

- `app/api/company/policies/correction-bridge/route.ts`
  - Reads correction policy definitions using `ensureCompanyPolicyDefinitions`
  - Selects the active `correction` policy from `company_policy_definitions`
  - Loads `config_json` as the primary source for:
    - `attendanceCorrectionEnabled`
    - `missingPunchCorrectionAllowed`
    - `latePunchRegularizationAllowed`
    - `earlyGoRegularizationAllowed`
    - `maximumBackdatedDays`
    - `approvalRequired`
    - `approvalFlow`
    - `maximumRequestsPerMonth`
    - `reasonMandatory`
- `lib/companyPolicyRuntime.ts`
  - `resolveCorrectionPolicyRuntime()` resolves runtime behavior from policy definition config
- `lib/correctionPolicyDefaults.ts`
  - Owns default and normalization logic for correction config

## Workflow reads still on operational correction tables

- `app/api/mobile/corrections/validate/route.ts`
  - Resolves assigned correction policy from engine
  - Reads existing requests from `employee_attendance_corrections`
- `app/api/mobile/corrections/apply/route.ts`
  - Resolves assigned correction policy from engine
  - Creates and updates rows in `employee_attendance_corrections`
  - Writes audit entries to `employee_attendance_correction_audit_logs`
- `app/api/mobile/corrections/summary/route.ts`
  - Reads correction request history from `employee_attendance_corrections`
- `app/api/company/corrections/route.ts`
  - Reads company correction requests from `employee_attendance_corrections`
- `app/api/company/corrections/[id]/route.ts`
  - Resolves assigned correction policy
  - Updates correction requests in `employee_attendance_corrections`
  - Writes audit entries to `employee_attendance_correction_audit_logs`
- `lib/attendanceCorrections.ts`
  - Encapsulates correction workflow behavior on `employee_attendance_corrections`
  - Writes audit rows to `employee_attendance_correction_audit_logs`
- `lib/companyReportsCorrections.ts`
  - Reads `employee_attendance_corrections` for reports

## Manual review reads still on dedicated workflow tables

- `app/api/company/manual-reviews/route.ts`
  - Reads and writes `attendance_manual_review_resolutions`
  - Writes `attendance_manual_review_resolution_history`
- `lib/manualReviewResolutions.ts`
  - Reads `attendance_manual_review_resolutions`
- Attendance and holiday-related reporting reads manual review outcomes indirectly through helper lookups

## Supabase tables involved

- `company_policy_definitions`
  - Correction policy config source
- `company_policy_assignments`
  - Assigned correction policy source
- `employee_attendance_corrections`
  - Correction request workflow
- `employee_attendance_correction_audit_logs`
  - Correction workflow audit trail
- `attendance_manual_review_resolutions`
  - Manual review resolution state
- `attendance_manual_review_resolution_history`
  - Manual review history log

## Supabase findings

- Correction-related operational tables now use company-admin-scoped authenticated RLS
- Broad permissive write policies were removed for:
  - `employee_attendance_corrections`
  - `employee_attendance_correction_audit_logs`
  - `attendance_manual_review_resolutions`
  - `attendance_manual_review_resolution_history`
- Security advisor no longer flags permissive correction-table write policies

## Current write-path status

- `app/api/company/policies/correction-bridge/route.ts`
  - saves correction policy definitions through `save_correction_policy_definition`
- Correction policy save path is already engine-backed
- Live `save_correction_policy_definition(...)` writes only to `company_policy_definitions`
- No correction config mirror table is written during policy save
- Company/mobile correction workflow writes remain on operational workflow tables by design
- The remaining complexity is not a config mirror table
- The remaining complexity is workflow-table behavior only

## Current read-path status

- Correction policy behavior reads are already engine-backed across primary app flows:
  - `app/api/company/policies/correction-bridge/route.ts`
  - `app/api/mobile/corrections/validate/route.ts`
  - `app/api/mobile/corrections/apply/route.ts`
  - `app/api/mobile/corrections/summary/route.ts`
  - `app/api/company/corrections/route.ts`
  - `app/api/company/corrections/[id]/route.ts`
  - `app/api/mobile/home/summary/route.ts`
- These routes resolve correction behavior through:
  - `resolvePoliciesForEmployee(...)`
  - `resolvePolicyForEmployee(...)`
  - `resolveCorrectionPolicyRuntime(...)`
- Remaining reads on correction workflow tables are operational, not policy-config reads.

## Cutover implication

- Correction cleanup is not a simple table removal task
- The correct split is:
  - keep `company_policy_definitions` as the source of correction policy behavior
  - keep workflow tables for request lifecycle and audit
  - keep manual review tables for manual-review state and history
  - remove broad RLS and any hidden fallback behavior

## Recommended next task

- Finalize the canonical correction runtime contract and default config assumptions.
- Then cut all policy behavior reads to the engine while preserving workflow tables as operational storage only.
