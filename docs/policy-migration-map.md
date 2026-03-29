# Policy Migration Map

This document tracks how the old operational settings model should map into the new generic policy engine.

## 1. Shift Policy

### Current operational sources

- `public.company_shift_definitions`
- `public.companies.login_access_rule`

### Current new policy page

- `/company/settings/policies/shift-policy`

### Old to new field mapping

| Old source | Old field | New policy field | Notes |
|---|---|---|---|
| `company_shift_definitions` | `name` | `shiftName` | Direct mapping |
| `company_shift_definitions` | `type` | `shiftType` | Direct mapping |
| `company_shift_definitions` | `start_time` | `shiftStartTime` | Direct mapping |
| `company_shift_definitions` | `end_time` | `shiftEndTime` | Direct mapping |
| `company_shift_definitions` | derived from `start_time` + `end_time` | `shiftDuration` | Derived field, do not persist separately |
| `company_shift_definitions` | `grace_mins` | `gracePeriod` | Direct mapping |
| `company_shift_definitions` | `early_window_mins` | `earlyInAllowed` | Direct mapping |
| `company_shift_definitions` | `min_work_before_out_mins` | `minimumWorkBeforePunchOut` | Direct mapping |
| `companies` | `login_access_rule` | `loginAccessRule` | Company-level legacy field, should move into shift policy config |
| none | none | `shiftStructure` | New field, default to `fixed` until roster logic exists |
| none | none | `policyName` | New governance field |
| none | none | `policyCode` | New governance field |
| none | none | `effectiveFrom` | New governance field |
| none | none | `nextReviewDate` | New governance field |
| none | none | `status` | New governance field |
| none | none | `defaultCompanyPolicy` | New governance field |

### Mapping notes

- Old operational model stores multiple shift rows per company.
- New policy page currently models one policy record with one primary shift definition.
- For bridge phase, the safest interpretation is:
  - one active primary shift row becomes one `shift` policy definition
  - additional shift rows remain in legacy storage until multi-shift policy modeling is introduced
- `shiftStructure = rotational` should not be backfilled from old data because legacy model does not represent roster cycles.

### Bridge save strategy

When new shift policy is saved:

1. Save full policy metadata to `company_policy_definitions`
2. Mirror operational fields into:
   - `company_shift_definitions`
   - `companies.login_access_rule`
3. Keep `config_json` as the full policy source
4. Keep legacy tables as execution source until resolver cutover

### Bridge read strategy

When loading the new shift policy:

1. Read policy from `company_policy_definitions` if present
2. If no saved policy config exists:
   - read first active row from `company_shift_definitions`
   - read `companies.login_access_rule`
   - hydrate new shift policy form

### Gaps before cutover

- Multi-shift support is still legacy-first
- No rotational roster storage in new engine yet
- Workforce assignment still needs resolver integration

## 2. Attendance Policy

### Current operational sources

- `public.companies`
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
- current attendance calculation logic in:
  - `lib/attendancePolicy.ts`

### Current new policy page

- `/company/settings/policies/attendance-policy`

### Old to new field mapping

| Old source | Old field | New policy field | Notes |
|---|---|---|---|
| `companies` | `half_day_min_work_mins` | `halfDayMinimumHours` | Convert minutes to `HH:MM` |
| `companies` | none | `fullDayMinimumHours` | New field, no direct legacy source yet |
| `companies` | `extra_hours_policy` | `extraHoursCountingRule` | `yes` -> `count`, `no` -> `ignore` |
| `companies` | `late_penalty_enabled` | `latePunchPenaltyEnabled` | Boolean to `Yes/No` |
| `companies` | `late_penalty_up_to_mins` | `latePunchUpToMinutes` | Direct mapping |
| `companies` | `late_penalty_repeat_count` | `repeatLateDaysInMonth` | Direct mapping |
| `companies` | `late_penalty_repeat_days` | `penaltyForRepeatLate` | Day value mapping |
| `companies` | `late_penalty_above_mins` | `latePunchAboveMinutes` | Direct mapping |
| `companies` | `late_penalty_above_days` | `penaltyForLateAboveLimit` | Day value mapping |
| `companies` | `allow_punch_on_holiday` | moved out | Belongs to `holiday_weekoff` policy in new model |
| `companies` | `allow_punch_on_weekly_off` | moved out | Belongs to `holiday_weekoff` policy in new model |
| `lib/attendancePolicy.ts` | punch completeness rule | `presentTrigger` | Must be inferred from current calculation behavior |
| `lib/attendancePolicy.ts` | incomplete punch handling | `singlePunchHandling` | Must be inferred from current calculation behavior |
| `lib/attendancePolicy.ts` | absent fallback behavior | `absentRule` | Must be inferred from current calculation behavior |
| `lib/attendancePolicy.ts` | late flag behavior | `latePunchRule` | Must be inferred from current calculation behavior |
| `lib/attendancePolicy.ts` | early-go flag behavior | `earlyGoRule` | Must be inferred from current calculation behavior |
| none | none | `policyName` | New governance field |
| none | none | `policyCode` | New governance field |
| none | none | `effectiveFrom` | New governance field |
| none | none | `nextReviewDate` | New governance field |
| none | none | `status` | New governance field |
| none | none | `defaultCompanyPolicy` | New governance field |
| none | none | `presentDaysFormula` | New policy engine field |
| none | none | `halfDayValue` | New policy engine field |

### Mapping notes

- Legacy attendance settings are split between database columns and code-level decision logic.
- Not every new attendance field has a direct stored source today.
- `fullDayMinimumHours` appears to be a new explicit policy field and may need a default until old logic is fully mapped.
- Holiday and weekly-off punch permissions should not remain in attendance policy after migration; they belong in holiday policy.

### Bridge save strategy

When new attendance policy is saved:

1. Save full policy metadata to `company_policy_definitions`
2. Mirror legacy-supported fields into `public.companies`
3. Keep non-legacy fields in `config_json`
4. Do not write holiday/weekly-off permission fields back into attendance config

### Bridge read strategy

When loading the new attendance policy:

1. Read policy from `company_policy_definitions` if present
2. If no saved policy config exists:
   - read legacy attendance columns from `public.companies`
   - infer code-driven behavior from current defaults
   - hydrate attendance policy form using bridge defaults

### Gaps before cutover

- `fullDayMinimumHours` has no direct legacy column
- code-level behavior in `lib/attendancePolicy.ts` still needs explicit extraction into config
- holiday-related flags currently live in old company settings and must be separated cleanly

## 3. Leave Policy

### Current operational sources

- `public.company_leave_policies`
- leave accrual / override related logic in:
  - `lib/leaveAccrual.ts`
  - leave APIs under `app/api/company/leaves`

### Current new policy page

- `/company/settings/policies/leave-policy`

### Old to new field mapping

| Old source | Old field | New policy field | Notes |
|---|---|---|---|
| `company_leave_policies` | `name` | `leaveTypes[].name` | Each legacy row becomes one leave type row |
| `company_leave_policies` | `code` | `leaveTypes[].code` | Direct mapping |
| `company_leave_policies` | `annual_quota` | `leaveTypes[].annualQuota` | Direct mapping |
| `company_leave_policies` | `carry_forward` | `leaveTypes[].carryForwardAllowed` | Boolean to `Yes/No` |
| `company_leave_policies` | `accrual_mode` | `leaveTypes[].accrualRule` | Map legacy accrual enum to new labels |
| `company_leave_policies` | `encashable` | not in first version | Keep in `config_json` later if needed |
| `company_leave_policies` | `active` | implicit + policy status | Row-level active state may need carry into leave type metadata later |
| legacy leave rows | paid/unpaid support from recent schema | `leaveTypes[].paymentMode` | Must be mapped from old paid/unpaid fields if present |
| none | none | `leaveTypes[].halfDayAllowed` | New explicit field, default required during bridge |
| none | none | `leaveTypes[].minimumDays` | New explicit field, default required during bridge |
| none | none | `leaveTypes[].maximumDays` | New explicit field, default required during bridge |
| none | none | `policyName` | New governance field |
| none | none | `policyCode` | New governance field |
| none | none | `effectiveFrom` | New governance field |
| none | none | `nextReviewDate` | New governance field |
| none | none | `status` | New governance field |
| none | none | `defaultCompanyPolicy` | New governance field |
| none | none | `approvalFlow` | New policy-level field |
| none | none | `noticePeriodDays` | New policy-level field |
| none | none | `backdatedLeaveAllowed` | New policy-level field |
| none | none | `leaveOverridesAttendance` | New policy-level field |
| none | none | `sandwichLeave` | New policy-level field |
| none | none | `carryForwardEnabled` | New policy-level field |
| none | none | `maximumCarryForwardDays` | New policy-level field |
| none | none | `carryForwardExpiryDays` | New policy-level field |

### Mapping notes

- Legacy model is already per-leave-type row based, which aligns well with the new `Leave Type Register`.
- New model separates:
  - policy-level governance fields
  - leave-type-level entitlement fields
- Old table does not appear to store all new leave-type controls such as:
  - half-day allowed
  - minimum days
  - maximum days
- These should be bridged with defaults first, then persisted in new `config_json`.

### Bridge save strategy

When new leave policy is saved:

1. Save full leave policy to `company_policy_definitions`
2. Mirror each leave type row into `company_leave_policies`
3. Keep policy-level governance fields in `config_json`
4. Keep unsupported legacy fields available for later expansion, not hard-deleted

### Bridge read strategy

When loading the new leave policy:

1. Read policy from `company_policy_definitions` if present
2. If no saved policy config exists:
   - read all rows from `company_leave_policies`
   - map each row into `leaveTypes[]`
   - hydrate policy-level fields using bridge defaults

### Gaps before cutover

- old table may not hold all new governance fields
- leave override and sandwich rules are new config-level decisions
- leave type metadata may need expansion beyond the old row structure

## 4. Holiday / Weekly Off Policy

### Current operational sources

- holiday settings APIs under:
  - `app/api/company/settings/holidays`
  - `app/api/company/settings/holidays/government`
- company holiday data tables used by the existing holidays page
- `public.company_holidays`
- holiday policy behavior in `public.company_policy_definitions`

### Current new policy page

- `/company/settings/policies/holiday-weekly-off-policy`

### Old to new field mapping

| Old source | Old field | New policy field | Notes |
|---|---|---|---|
| holiday settings tables | holiday source selection | `holidaySource` | Must be inferred from old holiday import/setup behavior |
| historical company settings | `weekly_off_policy` | `weeklyOffPattern` | No longer stored on `companies`; now engine-owned |
| historical company settings | `allow_punch_on_holiday` | `holidayPunchAllowed` | No longer stored on `companies`; now engine-owned |
| historical company settings | `allow_punch_on_weekly_off` | `weeklyOffPunchAllowed` | No longer stored on `companies`; now engine-owned |
| none | none | `holidayWorkedStatus` | New explicit field, default needed for bridge |
| none | none | `weeklyOffWorkedStatus` | New explicit field, default needed for bridge |
| none | none | `compOffEnabled` | New explicit field, may need bridge default |
| none | none | `compOffValidityDays` | New explicit field, no direct legacy source yet |
| none | none | `customWeeklyOffPattern` | New explicit field when pattern = custom |
| none | none | `policyName` | New governance field |
| none | none | `policyCode` | New governance field |
| none | none | `effectiveFrom` | New governance field |
| none | none | `nextReviewDate` | New governance field |
| none | none | `status` | New governance field |
| none | none | `defaultCompanyPolicy` | New governance field |

### Mapping notes

- Holiday / weekly off behavior is now a dedicated policy object in `company_policy_definitions`.
- Holiday source may be derived from whether company uses:
  - only custom holidays
  - only government holiday suggestions
  - mixed import/manual model
- `holidayWorkedStatus`, `weeklyOffWorkedStatus`, and `compOffValidityDays` appear to be new model-only fields and need defaults until legacy behavior is fully externalized.

### Current save strategy

When new holiday / weekly off policy is saved:

1. Save full policy metadata to `company_policy_definitions`
2. Keep policy behavior in `config_json`
3. Do not mirror policy behavior back into `companies`
4. Maintain holiday date rows separately in `company_holidays`

### Current read strategy

When loading the new holiday policy:

1. Read policy behavior from `company_policy_definitions`
2. Read holiday date rows from `company_holidays`
3. Do not read policy behavior from `companies`

### Remaining gaps

- holiday source detection depends on current holiday import/storage behavior
- `company_holidays` is still an operational table with broad authenticated RLS policies
- historical docs and schema snapshots may still mention old company-level holiday fields

## 5. Correction / Regularization Policy

### Current operational sources

- attendance correction request tables and APIs:
  - `app/api/company/corrections`
  - `app/api/company/corrections/[id]`
- related business logic in:
  - `lib/attendanceCorrections.ts`
- existing correction page behavior under:
  - `/company/corrections`

### Current new policy page

- `/company/settings/policies/correction-regularization-policy`

### Old to new field mapping

| Old source | Old field / behavior | New policy field | Notes |
|---|---|---|---|
| correction request rules | correction enablement behavior | `attendanceCorrectionEnabled` | May need inferred default if not explicitly stored |
| correction request rules | missing punch handling | `missingPunchCorrectionAllowed` | Must be inferred from current correction acceptance rules |
| correction request rules | late regularization handling | `latePunchRegularizationAllowed` | Must be inferred from current correction acceptance rules |
| correction request rules | early-go regularization handling | `earlyGoRegularizationAllowed` | Must be inferred from current correction acceptance rules |
| correction request rules | allowed request window | `correctionRequestWindow` | Direct mapping if available, otherwise bridge default |
| correction request rules | backdated behavior | `backdatedCorrectionAllowed` | Direct mapping if available, otherwise bridge default |
| correction request rules | maximum backdated days | `maximumBackdatedDays` | Direct mapping if available, otherwise bridge default |
| correction request rules | approval required behavior | `approvalRequired` | Inferred from current approval workflow |
| correction request rules | manager / HR reviewer path | `approvalFlow` | Inferred from current approval workflow |
| correction request rules | monthly submission threshold | `maximumRequestsPerMonth` | Direct mapping if available, otherwise bridge default |
| correction request rules | reason validation | `reasonMandatory` | Inferred from current correction submission validation |
| none | none | `policyName` | New governance field |
| none | none | `policyCode` | New governance field |
| none | none | `effectiveFrom` | New governance field |
| none | none | `nextReviewDate` | New governance field |
| none | none | `status` | New governance field |
| none | none | `defaultCompanyPolicy` | New governance field |

### Mapping notes

- Correction policy appears more behavior-driven than schema-driven in the current system.
- Some first-version fields may not exist as explicit DB columns yet and will need defaults until correction rules are externalized.
- This policy is likely the last one to bridge fully because it depends on active workflow behavior, not only static config.

### Bridge save strategy

When new correction policy is saved:

1. Save full policy metadata to `company_policy_definitions`
2. Mirror any legacy-supported fields into correction rule storage if dedicated rule columns/tables exist
3. Keep unsupported first-version fields in `config_json`

### Bridge read strategy

When loading the new correction policy:

1. Read policy from `company_policy_definitions` if present
2. If no saved policy config exists:
   - inspect current correction rule defaults / validation behavior
   - hydrate the page using bridge defaults

### Gaps before cutover

- correction rule storage may not be fully externalized yet
- approval logic may still be route/service-driven rather than config-driven
- backdated and monthly limit rules may need a dedicated persistence layer before complete migration
