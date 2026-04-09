# Offline Punch Special-Day Implementation Blueprint

This document locks the implementation blueprint for offline punch handling beyond normal working-day flow.

Scope covered here:

- holiday offline punch
- weekly-off offline punch
- approved-leave offline punch
- combination cases
- employee-facing summary intent
- admin queue intent
- implementation order

This document is intended to be the source of truth during implementation.

## Primary Goal

Build a predictable end-to-end offline punch flow for:

- working day
- holiday
- weekly off
- approved leave
- combinations of the above

without losing consistency across:

- Android punch UX
- backend decision logic
- admin review queue
- mobile summary and calendar
- final attendance treatment

## Core Principles

1. Do not rely on memory during implementation.
2. Resolve day context first, then policy, then trust, then final treatment.
3. Keep employee-facing wording simple.
4. Keep backend decision states explicit and machine-friendly.
5. Only one case should auto-approve by default:
   - clean offline punch on working day

## Decision Pipeline

Every punch should move through these steps in this order:

1. Resolve day context
2. Apply policy gate
3. Apply trust gate
4. Decide approval path
5. Decide final HR treatment

### Step 1: Day Context

Resolve the final day context using this precedence:

1. `approved_leave`
2. `holiday`
3. `weekly_off`
4. `working_day`

Meaning:

- if a day has approved leave plus holiday, treat it as approved leave context first
- if a day has holiday plus weekly off, treat it as holiday context first

## Policy Inputs

### Holiday / Weekly Off Policy

Derived from holiday-weekoff runtime policy:

- `allowPunchOnHoliday`
- `allowPunchOnWeeklyOff`
- `holidayWorkedStatus`
- `weeklyOffWorkedStatus`

Possible worked-day treatments:

- `Record Only`
- `OT Only`
- `Grant Comp Off`
- `Present + OT`
- `Manual Review`

### Leave Policy

Derived from leave runtime policy:

- `ifEmployeePunchesOnApprovedLeave`

Possible actions:

- `Block Punch`
- `Keep Leave`
- `Allow Punch and Send for Approval`

## Trust Inputs

These should be evaluated independently from policy context.

Examples:

- trusted anchor missing
- estimated time missing
- clock drift exceeded
- mock or fake GPS
- severe evidence gaps
- invalid punch sequence

Trust outcomes:

- `clean`
- `suspicious`

## Employee-Facing Language Lock

Employee-facing UI should use simple wording:

- `Punch In`
- `Punch Out`
- `Punch Pending Sync`
- `Approval Pending`
- `Completed`

Do not expose backend internal terms such as:

- `manual_review`
- `offline_punch_review`
- `holiday_worked_review`

Those are admin/backend terms only.

## Approval Rules

### Auto-Approve

Only this case auto-approves by default:

- `working_day + offline + clean`

### Approval Pending

Use `Approval Pending` for all allowed cases below:

- `working_day + offline + suspicious`
- `holiday + offline + allowed`
- `weekly_off + offline + allowed`
- `approved_leave + offline + allowed`
- all allowed combination cases

### Block

Block punch immediately when policy blocks it:

- holiday punch not allowed
- weekly-off punch not allowed
- approved-leave punch blocked by leave policy

## Implementation Matrix

| Scenario | Policy Input | Backend Decision | Employee Label | Admin Queue Type | Final Outcome |
|---|---|---|---|---|---|
| Working day + offline + clean | none | `auto_approved` | normal state | none | normal attendance |
| Working day + offline + suspicious | trust fail | `pending_approval` | `Approval Pending` | `offline_punch_review` | approve/reject after review |
| Holiday + offline | `allowPunchOnHoliday = No` | `block` | block message | none | no attendance effect |
| Holiday + offline + clean | `allowPunchOnHoliday = Yes` | `pending_approval` | `Approval Pending` | `holiday_worked_review` | final treatment per policy |
| Holiday + offline + suspicious | `allowPunchOnHoliday = Yes` | `pending_approval` | `Approval Pending` | `holiday_worked_review` | final treatment after review |
| Weekly off + offline | `allowPunchOnWeeklyOff = No` | `block` | block message | none | no attendance effect |
| Weekly off + offline + clean | `allowPunchOnWeeklyOff = Yes` | `pending_approval` | `Approval Pending` | `weekly_off_worked_review` | final treatment per policy |
| Weekly off + offline + suspicious | `allowPunchOnWeeklyOff = Yes` | `pending_approval` | `Approval Pending` | `weekly_off_worked_review` | final treatment after review |
| Approved leave + offline | `Block Punch` | `block` | block message | none | leave remains |
| Approved leave + offline | `Keep Leave` | `block` attendance effect | leave-related message | none | leave remains final |
| Approved leave + offline + clean | `Allow Punch and Send for Approval` | `pending_approval` | `Approval Pending` | `punch_on_approved_leave` | resolve leave-vs-attendance in approval flow |
| Approved leave + offline + suspicious | `Allow Punch and Send for Approval` | `pending_approval` | `Approval Pending` | `punch_on_approved_leave` | resolve leave-vs-attendance in approval flow |
| Approved leave + holiday + offline | leave precedence | block or `pending_approval` per leave policy | block or `Approval Pending` | `punch_on_approved_leave` first | resolve leave conflict before holiday treatment |
| Approved leave + weekly off + offline | leave precedence | block or `pending_approval` per leave policy | block or `Approval Pending` | `punch_on_approved_leave` first | resolve leave conflict before weekly-off treatment |
| Holiday + weekly off same date + offline | holiday precedence | block or `pending_approval` per holiday policy | block or `Approval Pending` | `holiday_worked_review` | holiday policy outcome |

## Working Hours Lock

Working hours should not be the first gate.

Working hours are:

- evidence first
- final treatment input later

Meaning:

1. first decide if the punch enters the flow
2. then capture raw worked minutes
3. then decide attendance / OT / comp-off / leave effect later

### Working-Day Rule

- if approved, worked hours can contribute directly to attendance outcome
- if approval is pending, raw hours may be shown internally but final effect is not settled

### Holiday / Weekly-Off Rule

- raw worked minutes should still be captured
- final meaning depends on:
  - `Record Only`
  - `OT Only`
  - `Grant Comp Off`
  - `Present + OT`
  - `Manual Review`

### Approved-Leave Rule

- raw worked minutes may be captured
- final attendance meaning depends on leave resolution policy

## Admin Queue Mapping

Use these queue types:

- `offline_punch_review`
  - working-day suspicious offline punch

- `holiday_worked_review`
  - holiday punch allowed by policy

- `weekly_off_worked_review`
  - weekly-off punch allowed by policy

- `punch_on_approved_leave`
  - approved-leave punch allowed by leave policy

## Combination Handling Lock

Combination cases should not be handled with ad-hoc branching everywhere.

Implementation must first resolve a single context using precedence, then apply the queue rules above.

Recommended interpretation:

- leave conflict is resolved first
- non-working-day treatment comes after leave conflict when applicable

## Implementation Phases

### Phase 1: Lock Spec

Use this document as the frozen implementation blueprint.

### Phase 2: Backend Decision Engine

Primary file:

- `lib/mobilePunch.ts`

Responsibilities:

- resolve context
- apply policy gate
- apply trust gate
- decide approval state
- decide queue type

### Phase 3: Review Queue Layer

Primary file:

- `lib/manualReviewCases.ts`

Responsibilities:

- create correct queue type
- preserve work date
- avoid duplicate queue spam
- support combination flow ordering

### Phase 4: Summary / Reporting APIs

Primary files:

- `app/api/mobile/home/summary/route.ts`
- `app/api/mobile/calendar/summary/route.ts`
- `app/api/mobile/corrections/validate/route.ts`
- `app/api/mobile/corrections/day-details/route.ts`
- `lib/companyReportsAttendance.ts`

Responsibilities:

- keep pending approval visible where required
- keep compact calendar behavior
- keep attendance summary informative

### Phase 5: Android UI

Primary files:

- `HomeActivity.kt`
- `CalendarActivity.kt`
- `CorrectionActivity.kt`

Responsibilities:

- show `Approval Pending`
- prevent repeated same-action punching
- show compact approval signals in calendar

### Phase 6: Final Treatment Resolution

Primary logic areas:

- holiday worked treatment
- weekly-off worked treatment
- leave conflict treatment
- comp-off / OT / present outcomes

## Verification Checklist

At minimum verify:

1. working day + clean offline
2. working day + suspicious offline
3. holiday + offline + allowed
4. holiday + offline + blocked
5. weekly off + offline + allowed
6. weekly off + offline + blocked
7. approved leave + block punch
8. approved leave + keep leave
9. approved leave + allow punch and send for approval
10. approved leave + holiday combination
11. approved leave + weekly-off combination
12. duplicate retry does not create duplicate queue cases

## One-Line Lock

Policy decides whether a punch can enter the flow, trust decides whether it is clean or suspicious, and only clean offline working-day punches auto-approve; all other allowed special-day or leave-conflict offline punches go through `Approval Pending`.
