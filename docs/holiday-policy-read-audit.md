# Holiday / Weekly Off Policy Read Audit

This audit captures where the current project reads holiday / weekly off policy behavior across frontend, backend, and Supabase.

## Summary

- Holiday / weekly off policy configuration already reads primarily from `company_policy_definitions`.
- Operational holiday calendar data still reads from `company_holidays`.
- The current architecture is mixed but not in the same way as leave:
  - policy behavior is engine-backed
  - holiday date storage is still an operational table
- `company_holidays` should be treated as operational data, not as a policy-source table.

## Frontend

- `/company/settings/policies/holiday-weekly-off-policy`
  - Loads and saves through `/api/company/policies/holiday-bridge`
  - Loads policy register through `/api/company/policies?policy_type=holiday_weekoff`
  - Loads workforce counts through `/api/company/policy-assignments`
- The page itself does not read `company_holidays` directly.
- The page currently treats `Holiday Source` as fixed `Company Holidays`.

## Policy config reads already on the new engine

- `app/api/company/policies/holiday-bridge/route.ts`
  - Reads holiday policy definitions using `ensureCompanyPolicyDefinitions`
  - Selects the active `holiday_weekoff` policy from `company_policy_definitions`
  - Loads `config_json` as the primary source for:
    - `weeklyOffPattern`
    - `holidayPunchAllowed`
    - `weeklyOffPunchAllowed`
    - `holidayWorkedStatus`
    - `weeklyOffWorkedStatus`
    - `compOffValidityDays`
- `lib/companyPolicyRuntime.ts`
  - `resolveHolidayPolicyRuntime()` resolves runtime behavior from policy definition config
- `lib/mobilePunch.ts`
  - Resolves employee policy context using `resolvePoliciesForEmployee`
  - Applies holiday policy runtime from the new engine
- Holiday policy driven runtime behavior is also used in:
  - `app/api/company/attendance/route.ts`
  - `app/api/company/comp-off-ledger/route.ts`
  - `app/api/mobile/home/summary/route.ts`
  - `app/api/mobile/calendar/summary/route.ts`
  - `app/api/mobile/leaves/summary/route.ts`
  - `app/api/mobile/leaves/apply/route.ts`
  - `app/api/company/leaves/[id]/route.ts`
  - `lib/companyReportsAttendance.ts`
  - `lib/companyReportsLatePenalty.ts`
  - `lib/leaveAccrual.ts`

## Operational holiday date reads still on `company_holidays`

- `app/api/company/settings/holidays/route.ts`
  - Reads, replaces, and returns company holiday rows from `company_holidays`
- `lib/mobilePunch.ts`
  - Reads whether the punch date is an actual holiday from `company_holidays`
- `app/api/company/attendance/route.ts`
  - Reads holiday dates from `company_holidays`
- `app/api/company/comp-off-ledger/route.ts`
  - Reads holiday dates from `company_holidays`
- `app/api/mobile/home/summary/route.ts`
  - Reads holiday dates from `company_holidays`
- `app/api/mobile/calendar/summary/route.ts`
  - Reads holiday dates from `company_holidays`
- `app/api/mobile/leaves/summary/route.ts`
  - Reads holiday dates from `company_holidays`
- `lib/companyReportsAttendance.ts`
  - Reads holiday dates from `company_holidays`
- `lib/companyReportsLatePenalty.ts`
  - Reads holiday dates from `company_holidays`
- `lib/leaveAccrual.ts`
  - Reads holiday dates from `company_holidays` for comp-off earning logic
  - Reads holiday dates from `company_holidays`

## Remaining bridge or fallback assumptions

- `lib/companyPolicies.ts`
  - Default `holiday_weekoff` policy now seeds a canonical holiday config
- `lib/companyPolicyRuntime.ts`
  - Holiday runtime now normalizes from canonical engine config instead of old fallback values
  - Holiday runtime now reads policy behavior directly from engine config instead of old fallback values
- `supabase/schema.sql`
  - local snapshot now reflects company-admin-scoped RLS for `company_holidays`

## Supabase findings

- `company_holidays` now has company-admin-scoped authenticated RLS policies based on `companies.admin_email = auth.email()`
- `company_policy_definitions` and `company_policy_assignments` still have broad authenticated policies
- Security advisor no longer flags `company_holidays` for permissive write/delete policies

## Current write-path status

- `app/api/company/policies/holiday-bridge/route.ts`
  - saves holiday policy definitions through `save_holiday_policy_definition`
- live `save_holiday_policy_definition(...)`
  - writes only to `company_policy_definitions`
  - does not mirror into `companies.weekly_off_policy`
  - does not mirror into `companies.allow_punch_on_holiday`
  - does not mirror into `companies.allow_punch_on_weekly_off`
- live `public.companies`
  - no longer contains:
    - `weekly_off_policy`
    - `allow_punch_on_holiday`
    - `allow_punch_on_weekly_off`

This means holiday policy write cutover is already engine-only. The remaining holiday cleanup is about operational holiday rows and RLS hardening, not about removing a config mirror table.

## Cutover implication

- Holiday / weekly off cleanup is not a straight table removal like leave.
- The correct split is:
  - keep `company_policy_definitions` as the single source of truth for holiday policy behavior
  - keep `company_holidays` as operational holiday calendar storage
  - remove fallback and bridge behavior that depends on old company-level policy fields or empty policy config
- This means the cleanup target is:
  - engine-only policy config
  - operational-only holiday rows
  - no hidden fallback behavior

## Recommended next task

- Finalize a canonical holiday runtime contract and default config.
- That will let all holiday behavior resolve from explicit engine config instead of fallback assumptions.
