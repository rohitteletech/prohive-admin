# Holiday / Weekly Off Policy Runtime Contract

This document defines the canonical runtime contract for `holiday_weekoff` policy definitions stored in `company_policy_definitions.config_json`.

## Canonical config owner

- Policy config source of truth: `public.company_policy_definitions`
- Policy type: `holiday_weekoff`
- Operational holiday date storage: `public.company_holidays`

## Canonical stored shape

```ts
type HolidayPolicyStoredConfig = {
  policyName: string;
  policyCode: string;
  effectiveFrom: string;
  nextReviewDate: string;
  status: "draft" | "active" | "archived";
  defaultCompanyPolicy: "Yes" | "No";
  holidaySource: "Company";
  weeklyOffPattern: "Sunday Only" | "Saturday + Sunday" | "2nd and 4th Saturday + Sunday";
  holidayPunchAllowed: "Yes" | "No";
  weeklyOffPunchAllowed: "Yes" | "No";
  holidayWorkedStatus: "Record Only" | "OT Only" | "Grant Comp Off" | "Present + OT" | "Manual Review";
  weeklyOffWorkedStatus: "Record Only" | "OT Only" | "Grant Comp Off" | "Present + OT" | "Manual Review";
  compOffValidityDays: string;
};
```

## Contract rules

- `holidaySource` is currently fixed to `Company`
- `weeklyOffPattern` is the human-readable stored value used by the policy page
- runtime conversion maps `weeklyOffPattern` to:
  - `sunday_only`
  - `saturday_sunday`
  - `second_fourth_saturday_sunday`
- if `holidayPunchAllowed = "No"`, then `holidayWorkedStatus` is normalized to `Record Only`
- if `weeklyOffPunchAllowed = "No"`, then `weeklyOffWorkedStatus` is normalized to `Record Only`
- `compOffValidityDays` is stored as:
  - positive whole-number string when comp-off is applicable
  - `"0"` when comp-off is not applicable

## Default policy config

New company onboarding and missing-definition seeding should use this default:

- `policyName = "Standard Holiday Policy"`
- `policyCode = "HOL-001"`
- `status = "active"`
- `defaultCompanyPolicy = "Yes"`
- `holidaySource = "Company"`
- `weeklyOffPattern = "Sunday Only"`
- `holidayPunchAllowed = "Yes"`
- `weeklyOffPunchAllowed = "Yes"`
- `holidayWorkedStatus = "Grant Comp Off"`
- `weeklyOffWorkedStatus = "Grant Comp Off"`
- `compOffValidityDays = "60"`

## Onboarding status

- New company creation already seeds `holiday_weekoff` through `defaultPolicyDefinitions()`
- The onboarding route writes that default definition into `company_policy_definitions`
- Onboarding does not create policy behavior in `companies`
- Holiday dates remain separate operational rows in `company_holidays`

## Runtime output contract

`resolveHolidayPolicyRuntime()` should return:

```ts
{
  weeklyOffPolicy: "sunday_only" | "saturday_sunday" | "second_fourth_saturday_sunday";
  allowPunchOnHoliday: boolean;
  allowPunchOnWeeklyOff: boolean;
  holidayWorkedStatus: "Record Only" | "OT Only" | "Grant Comp Off" | "Present + OT" | "Manual Review";
  weeklyOffWorkedStatus: "Record Only" | "OT Only" | "Grant Comp Off" | "Present + OT" | "Manual Review";
  compOffValidityDays: number;
}
```

## Implication for cleanup

- Policy behavior must resolve only from this config contract.
- `company_holidays` remains operational holiday date storage only.
- Future cleanup should remove fallback assumptions based on old company-level policy fields rather than replacing `company_holidays`.
