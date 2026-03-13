# Company Policy Model

This document is the source of truth for aligning `Shift Policy`, `Attendance Policy`, and `Leave Policy`.

## 1. Decision Order

Daily status should be decided in this order:

1. Shift context
2. Holiday / weekly off context
3. Approved leave context
4. Punch completeness
5. Worked-hours evaluation
6. Late punch / early go flags
7. Monthly deduction formula

This order prevents one module from silently overriding another.

## 2. Shift Policy

Shift Policy defines the operating window for the day. It does not decide final attendance status by itself.

Required fields:

- Shift name
- Shift type
- Shift start time
- Shift end time
- Working duration
- Grace period after shift start
- Early-in allowed window
- Minimum work before punch-out
- Active / inactive status
- Weekly off mapping by employee or shift group

Shift Policy outcomes:

- Whether a punch is within an allowed shift window
- Scheduled working minutes for the day
- Grace limit for late punch detection
- Earliest allowed punch-in
- Earliest allowed punch-out

## 3. Attendance Policy

Attendance Policy converts shift + punch data into day status and monthly counts.

Required fields:

- Present trigger
  `Punch In` or `Punch In + Punch Out`
- Login access rule
  `Any time` or `Shift time only`
- Full day minimum hours
- Half day minimum hours
- Grace period allowed
- Early-in allowed minutes
- Early-go buffer
- Minimum work before punch-out
- Extra hours policy
- Allow punch on holidays
- Allow punch on weekly offs
- Late punch penalty enabled / disabled
- Late punch up-to minutes
- Repeat late days in month
- Penalty for repeat late
- Late punch above minutes
- Penalty for late above limit
- Present-days monthly formula
- Half-day value in present count

Attendance final day statuses:

- Present
- Half Day
- Absent
- Holiday Worked
- Weekly Off Worked
- Paid Leave
- Unpaid Leave

Attendance flags:

- Late Punch
- Early Go
- Incomplete Punch
- Extra Hours

## 4. Leave Policy

Leave Policy decides whether leave should override attendance calculation.

Required fields:

- Leave type
  `Paid`, `Unpaid`, `Half Day`, `Special`
- Leave approval status
- Leave session
  `Full day`, `First half`, `Second half`
- Sandwich leave rule
- Holiday / weekly off bridging rule
- Whether leave can coexist with punch data
- Whether leave converts day to paid/unpaid when punch is missing

Leave Policy outcomes:

- Whether leave overrides attendance
- Whether half-day leave combines with worked half-day
- Whether holidays / weekly offs in between count as leave

## 5. Final Status Matrix

These rules should be locked before API wiring.

### Base rules

- No punch and no approved leave = `Absent`
- Approved full-day paid leave = `Paid Leave`
- Approved full-day unpaid leave = `Unpaid Leave`
- Worked minutes >= full-day threshold = `Present`
- Worked minutes >= half-day threshold and below full-day threshold = `Half Day`
- Worked minutes below half-day threshold = `Absent`

### Punch completeness

- If policy is `Punch In + Punch Out`, single punch should mark `Incomplete Punch`
- `Incomplete Punch` should not count as `Present` unless admin correction is applied

### Holiday / weekly off

- Holiday with no punch = `Holiday`
- Weekly off with no punch = `Weekly Off`
- Holiday with punch and policy allows holiday punch = `Holiday Worked`
- Weekly off with punch and policy allows weekly off punch = `Weekly Off Worked`

### Leave override

- Approved leave should override `Absent`
- Approved leave should not override `Holiday Worked` unless business rule explicitly says so
- Half-day leave can combine with worked half-day to avoid marking the day absent

### Late / early flags

- Late Punch should be a flag first, not a final status
- Early Go should be a flag first, not a final status
- Monthly deduction can happen from repeated late events without changing the day status from `Present`

## 6. Monthly Count Rules

Recommended monthly formulas:

- Present Days = `Full Present + (Half Day x Half Day Value)`
- Absent Days = `Total Working Days - Present Equivalent - Paid Leave - Approved Holiday/Weekly Off`
- Late penalties should be tracked separately from day status

Recommended defaults:

- Half Day Value = `0.5`
- Repeat Late Block = `3 late days`
- Penalty for Repeat Late = `1 day`
- Late Above Limit = `60 minutes`
- Penalty Above Limit = `0.5 day` or `1 day` based on HR decision

## 7. Ownership By Page

To avoid duplication:

- `Shift Control` page owns shift timings and workforce mapping
- `Attendance Policy` page owns day-status logic and monthly formulas
- `Leave Policy` page owns leave override rules

Pages must not duplicate each other's editable controls.

## 8. Open Decisions

These must be confirmed before backend sync:

- Does single punch become `Incomplete Punch`, `Half Day`, or `Absent`?
- Does Early Go ever downgrade status, or stay a flag only?
- Does Late Punch ever downgrade status, or only create monthly deduction?
- On holiday / weekly off punch, do we count `Present`, `Worked Special Day`, or `Overtime Only`?
- How should half-day leave + worked hours combine?
- Is sandwich leave enabled?

## 9. Recommended Next Implementation Order

1. Lock this document with final business decisions
2. Build dedicated storage/API for attendance policy
3. Build dedicated storage/API for leave policy
4. Refactor reports and mobile summary to use the same policy model
5. Add admin-facing policy preview for final daily status simulation
