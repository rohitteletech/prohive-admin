# Attendance Policy Runtime Contract

Date: 2026-03-29

## Source of truth

Attendance policy behavior is owned by:

- `public.company_policy_definitions`
  - `policy_type = 'attendance'`
- `public.company_policy_assignments`
  - for employee / department / company targeting

Runtime resolution happens through:

- `resolvePoliciesForEmployee(...)`
- `resolvePoliciesForEmployees(...)`
- `resolveAttendancePolicyRuntime(...)`

## Canonical attendance behavior fields

The attendance runtime contract is:

- `presentTrigger`
  - `punch_in` or `punch_in_out`
- `singlePunchHandling`
  - `present` or `absent`
- `extraHoursPolicy`
  - normalized runtime value derived from `extraHoursCountingRule`
- `presentDaysFormula`
  - `full_plus_half` or `full_only`
- `latePunchRule`
  - `flag_only` or `enforce_penalty`
- `earlyGoRule`
  - `flag_only` or `enforce_penalty`
- `halfDayValue`
  - numeric runtime value `0.5` or `1`
- `latePunchUpToMinutes`
- `repeatLateDaysInMonth`
- `dayCountForRepeatLate`
- `latePunchAboveMinutes`
- `dayCountForLateAboveLimit`
- `earlyGoUpToMinutes`
- `repeatEarlyGoDaysInMonth`
- `dayCountForRepeatEarlyGo`
- `earlyGoAboveMinutes`
- `dayCountForEarlyGoAboveLimit`

## Execution model

- Shift timing inputs come from resolved shift policy.
- Holiday / weekly-off treatment comes from resolved holiday policy plus `company_holidays`.
- Attendance event history comes from `attendance_punch_events`.
- Manual overrides for off-day treatment come from manual-review workflow tables.
- Attendance policy itself does not own holiday permission flags anymore.

## Default config owner

- `lib/attendancePolicyDefaults.ts`
  - defines default attendance behavior for:
    - new company seeding
    - bridge fallback normalization
    - policy editing defaults

## Write contract

- Attendance policy saves must go through:
  - `app/api/company/policies/attendance-bridge/route.ts`
  - `public.save_attendance_policy_definition(...)`
- Save path writes only to:
  - `company_policy_definitions`
- Save path must not mirror attendance config into `public.companies`

## Non-goals

These remain operational data and should not be treated as attendance-policy config storage:

- `attendance_punch_events`
- `attendance_manual_review_resolutions`
- `attendance_manual_review_resolution_history`
- `company_holidays`

## Cleanup implication

Attendance policy migration is functionally in engine-only mode already.

The remaining work is:

- remove stale migration-map assumptions
- harden policy-engine RLS globally
- review policy assignments as a separate concern
