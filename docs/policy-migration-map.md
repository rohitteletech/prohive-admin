# Policy Migration Map

Date: 2026-03-29

## Status

This file is no longer the source of truth for current policy behavior.

It previously described bridge-phase migration assumptions while the project was moving from legacy policy storage to the generic policy engine.

That bridge phase is now complete for policy configuration.

## Current source of truth

Use these documents instead of this file for current maintenance:

- `docs/attendance-policy-read-audit.md`
- `docs/attendance-policy-runtime-contract.md`
- `docs/leave-policy-read-audit.md`
- `docs/leave-policy-runtime-contract.md`
- `docs/holiday-policy-read-audit.md`
- `docs/holiday-policy-runtime-contract.md`
- `docs/correction-policy-read-audit.md`
- `docs/correction-policy-runtime-contract.md`
- `docs/policy-assignments-read-audit.md`
- `docs/policy-engine-rls-cleanup.md`
- `docs/legacy-policy-cleanup-inventory.md`

## Final cutover position

- policy config source of truth is:
  - `public.company_policy_definitions`
- policy targeting source of truth is:
  - `public.company_policy_assignments`
- operational tables may still exist for:
  - attendance events
  - holiday calendar rows
  - leave requests and balance overrides
  - correction workflow and manual review workflow

Those operational tables are not legacy policy-config sources.

## Important maintenance rule

Do not use this file to reintroduce bridge behavior such as:

- reading policy config from old company columns
- mirroring policy config into removed legacy policy tables
- treating operational workflow tables as policy config storage

## Historical note

This file is intentionally retained only as a migration-history marker so references do not break.

If new migration work is needed, create a new task-specific audit doc rather than expanding this bridge-era map.
