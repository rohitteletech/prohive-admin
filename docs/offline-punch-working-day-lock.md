# Offline Punch On Working Day - Locked Context

This note captures the locked product and engineering context for the current offline punch workstream.

## Scope

Current scope is only:

- offline punch
- working day

Out of scope for this note:

- holiday punches
- weekly off punches
- punch on approved leave
- combined scenarios

## Objective

We want a safe and practical offline punch flow that:

- does not treat every offline punch as suspicious by default
- auto-approves clean offline punches on working days
- sends only high-risk suspicious offline punches to manual review
- keeps enough evidence for audit and later debugging

## Broad Network Lock

This is the universal first-level mobile punch gate for all punch flows.

- Wi-Fi must not be forced ON
- Wi-Fi is not a restriction factor by itself
- If Wi-Fi is connected and internet is working, allow normal online punch
- If Wi-Fi is not connected and mobile data is OFF, block punch
- If Wi-Fi is not connected and mobile data is ON but network is weak, unstable, unavailable, or API requests fail, allow offline punch

Meaning:

- `Wi-Fi connected` is enough for online punching
- `No Wi-Fi + mobile data OFF` is not a valid offline case
- `No Wi-Fi + mobile data ON + no usable network` is a valid offline case

## Working-Day Offline Lock

For offline punch on working day:

- offline punch is not suspicious by default
- the app should collect local trust evidence at capture time
- sync time is when the server makes the final decision
- offline capture is not final approval

## Evidence To Collect In App

The mobile app should collect as much local evidence as possible:

- device id
- device time
- estimated time
- trusted anchor time
- trusted anchor elapsed time
- elapsed time
- GPS/location
- mock/fake GPS flag
- auto date/time status
- auto timezone status
- unique event id

## Final Decision Point

Server decides final outcome at sync time.

Expected outcomes:

- clean case -> `auto_approved`
- suspicious case -> `pending_approval` plus manual review case

## Auto-Approve Conditions

Clean offline working-day punches should be auto-approved when all core trust checks are acceptable:

- working day
- registered or trusted device
- valid event id
- estimated time available
- trusted time anchor available
- time consistency acceptable
- no major clock drift
- no fake or mock GPS
- no severe missing evidence
- valid punch sequence

## Manual Review Conditions

Offline working-day punches should go to manual review only for high-risk suspicious signals:

- no trusted time anchor
- no estimated time
- major clock drift
- fake or mock GPS
- serious missing trust evidence
- impossible punch sequence
- clear tampering suspicion

## Medium-Risk Signals

These are not yet locked as automatic manual-review triggers:

- auto date/time OFF
- auto timezone OFF
- weak GPS accuracy

These may remain audit signals unless we later decide otherwise.

## Explicit Review-Reason Locks

- `CLIENT_MARKED_REQUIRES_APPROVAL` alone is not enough to force manual review
- it is only a client hint
- final review decision must be made on the server

## Duplicate / Replay Handling

Duplicate or replay retry is not an HR/admin review case.

- same event submitted again should be technically deduped by the server
- it should not enter manual review only because it is duplicate

## Manual Review Expectations

If a punch goes to manual review:

- exact reason codes must be stored
- vague reasons should not be used
- admin review should exist only where human judgment is actually needed
- normal clean offline punches should not depend on admin action

## Current Architecture Reality

Current implementation is split across Android/mobile client, backend, and Supabase.

### Android / Mobile

This repo does not contain the Android app source code, so Android-side network checks cannot be verified here.

### Backend

Current backend behavior is in:

- [lib/mobilePunch.ts](/c:/Users/rohit/prohive-admin/lib/mobilePunch.ts)

Current backend reality:

- server accepts `is_offline` from client payload
- server also accepts client-provided trust fields such as `estimated_time_ms`, `trusted_anchor_time_ms`, `trusted_anchor_elapsed_ms`, `requires_approval`, and `approval_reason_codes`
- server does not independently determine whether the device was truly offline

### Supabase

Current persistence uses:

- `attendance_punch_events`
- `manual_review_cases`

Current punch-related review case types in code are:

- `offline_punch_review`
- `punch_on_approved_leave`
- `holiday_worked_review`
- `weekly_off_worked_review`

## Current Implementation Gap

The desired locked direction says:

- Android should perform broad network pre-check
- server should perform final trust-based approval classification

Current reality is:

- backend depends on client-sent offline classification
- Android pre-check logic is not visible in this repo

So the most likely implementation gap is:

- universal offline eligibility checks need to be enforced in Android
- trust-signal classification rules need to be tightened in backend

## Suggested Work Breakdown

Break this work into smaller sections:

1. Android broad network pre-check
2. Android offline evidence payload contract
3. Backend trust classification for offline working-day punches
4. Manual review reason-code policy
5. Admin review queue verification for offline punch cases
6. End-to-end test scenarios

## One-Line Lock

For offline punch on working day, the app should collect trust evidence, the server should judge authenticity at sync time, clean cases should be auto-approved, and only high-risk suspicious cases should go to manual review with exact reason codes.
