# Attendance Policy Read Audit

Date: 2026-03-29

## Summary

- Attendance policy configuration already reads from `company_policy_definitions`.
- Attendance policy save path is already engine-backed through `save_attendance_policy_definition(...)`.
- Attendance runtime behavior is resolved from the new policy engine across company, mobile, and reporting flows.
- Holiday and weekly-off behavior is no longer part of attendance policy execution; those reads come from `holiday_weekoff` policy plus `company_holidays`.
- Legacy company-level attendance columns have already been removed from live `public.companies`.

## Frontend

- `/company/settings/policies/attendance-policy`
  - Loads and saves through `/api/company/policies/attendance-bridge`
  - Loads policy register through `/api/company/policies?policy_type=attendance`
  - Loads workforce counts through `/api/company/policy-assignments`

## Policy config reads already on the new engine

- `app/api/company/policies/attendance-bridge/route.ts`
  - Reads attendance policy definitions using `ensureCompanyPolicyDefinitions`
  - Selects the active `attendance` policy from `company_policy_definitions`
  - Loads `config_json` as the primary source for:
    - `presentTrigger`
    - `singlePunchHandling`
    - `extraHoursCountingRule`
    - `latePunchRule`
    - `earlyGoRule`
    - `presentDaysFormula`
    - `halfDayValue`
    - `latePunchUpToMinutes`
    - `repeatLateDaysInMonth`
    - `penaltyForRepeatLate`
    - `latePunchAboveMinutes`
    - `penaltyForLateAboveLimit`
    - `earlyGoUpToMinutes`
    - `repeatEarlyGoDaysInMonth`
    - `penaltyForRepeatEarlyGo`
    - `earlyGoAboveMinutes`
    - `penaltyForEarlyGoAboveLimit`
- `lib/companyPolicyRuntime.ts`
  - `resolveAttendancePolicyRuntime()` resolves runtime behavior from attendance policy definition config
- `lib/attendancePolicyDefaults.ts`
  - owns canonical attendance defaults used for engine seeding and normalization

## Runtime reads already on the new engine

- `app/api/company/attendance/route.ts`
  - resolves attendance, shift, and holiday policy context through `resolvePoliciesForEmployees(...)`
  - uses `resolveAttendancePolicyRuntime(...)` for day-status and penalty calculation
- `app/api/mobile/home/summary/route.ts`
  - resolves employee attendance policy from engine and uses it for today summary calculations
- `app/api/mobile/calendar/summary/route.ts`
  - resolves attendance policy runtime for daily calendar attendance classification
- `lib/companyReportsAttendance.ts`
  - resolves attendance policy per employee for reports and late-penalty math
- `lib/companyReportsLatePenalty.ts`
  - resolves attendance policy per employee for late-penalty reporting
- `lib/attendancePolicy.ts`
  - contains pure attendance calculation logic
  - accepts runtime policy input but does not read legacy DB config directly

## Legacy company-column findings

- Historical attendance fields from `public.companies` are no longer present on live Supabase:
  - `half_day_min_work_mins`
  - `late_penalty_enabled`
  - `late_penalty_up_to_mins`
  - `late_penalty_repeat_count`
  - `late_penalty_repeat_days`
  - `late_penalty_above_mins`
  - `late_penalty_above_days`
  - `extra_hours_policy`
  - `allow_punch_on_holiday`
  - `allow_punch_on_weekly_off`
- The remaining mentions are schema-history artifacts in:
  - `docs/policy-migration-map.md`
  - old migration files
  - local `supabase/schema.sql` snapshot

## Current write-path status

- `app/api/company/policies/attendance-bridge/route.ts`
  - saves attendance policy definitions through `save_attendance_policy_definition`
- live `save_attendance_policy_definition(...)`
  - writes only to `company_policy_definitions`
  - does not mirror config back into `public.companies`

This means attendance policy save cutover is already engine-only.

## Current read-path status

- Attendance behavior reads are already engine-backed across primary app flows:
  - `app/api/company/policies/attendance-bridge/route.ts`
  - `app/api/company/attendance/route.ts`
  - `app/api/mobile/home/summary/route.ts`
  - `app/api/mobile/calendar/summary/route.ts`
  - `lib/companyReportsAttendance.ts`
  - `lib/companyReportsLatePenalty.ts`
- Remaining reads on:
  - `company_holidays`
  - `attendance_punch_events`
  - manual review tables

These are operational data reads, not attendance-policy-config reads.

## Cutover implication

- Attendance policy cleanup is further along than the original migration map suggests.
- The correct split is:
  - keep `company_policy_definitions` as the attendance policy config source
  - keep punch events and manual review tables as operational attendance workflow data
  - keep holiday-day detection under holiday policy + holiday-date storage
  - remove stale docs and any remaining fallback assumptions

## Recommended next task

- Finalize the canonical attendance runtime contract in docs.
- Then move to policy-assignment cleanup and global policy-engine RLS hardening, because attendance config cutover itself is already effectively complete.
