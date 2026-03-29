# Legacy Policy Cleanup Inventory

Date: 2026-03-29

## Goal

Identify leftover code, docs, aliases, and schema artifacts that can still mislead future maintenance after policy-engine cutover.

This inventory is intentionally strict:

- if something suggests a legacy policy source still exists when it does not
- if something exposes a deprecated alias in runtime payloads
- if a local schema snapshot no longer matches live Supabase

it should be treated as cleanup work.

## Summary

The main remaining complexity is not active runtime fallback anymore.

The main remaining complexity is:

- outdated migration-era documentation
- stale local schema snapshot content
- a small number of deprecated compatibility aliases still exposed in runtime code

## Bucket A: Remove or replace outdated docs

These are the highest-value cleanup items because they directly mislead future development.

### `docs/policy-migration-map.md`

Status:

- strongly outdated
- still describes bridge-phase behavior that is no longer true

Examples of outdated statements:

- shift saves mirror into `company_shift_definitions` and `companies.login_access_rule`
- attendance saves mirror into `public.companies`
- leave saves mirror into `company_leave_policies`
- holiday rows still have broad authenticated RLS
- workforce assignment still needs resolver integration

Cleanup recommendation:

- replace with a final post-cutover status document
- or archive it clearly as historical migration context only

Risk if kept unchanged:

- future developers may reintroduce removed bridge behavior
- future maintenance may assume legacy sources still exist

## Bucket B: Remove deprecated runtime aliases

These are low-risk code cleanups that reduce confusion in app contracts.

### `app/api/mobile/home/summary/route.ts`

Current issue:

- response `config` still returns:
  - `loginAccessRule: punchAccessRule`

Why misleading:

- `loginAccessRule` is a deprecated legacy name
- actual policy field is now `punchAccessRule`

Cleanup recommendation:

- remove `loginAccessRule` from response payload if mobile app no longer depends on it
- if compatibility is still needed, document a removal deadline

### `supabase/functions/punch/index.ts`

Current issue:

- runtime still accepts old config aliases:
  - `config.loginAccessRule`
  - `config.earlyInAllowed`

Why misleading:

- they imply old field shapes are still first-class

Reality:

- this is compatibility logic, not active legacy source-of-truth behavior

Cleanup recommendation:

- decide whether to keep a temporary backward-compat read window
- if no old rows remain, remove these aliases

### `lib/companyPolicyRuntime.ts`

Current issue:

- shift runtime still accepts old config aliases:
  - `config.loginAccessRule`
  - `config.earlyInAllowed`

Cleanup recommendation:

- same as edge function:
  - either keep explicitly as temporary compatibility
  - or remove once data is verified clean

## Bucket C: Stale local schema snapshot

### `supabase/schema.sql`

Current issue:

- local snapshot still contains removed legacy company columns:
  - `weekly_off_policy`
  - `allow_punch_on_holiday`
  - `allow_punch_on_weekly_off`
  - `extra_hours_policy`
  - `half_day_min_work_mins`
  - `late_penalty_*`
- local snapshot also still contains older permissive RLS definitions for many tables

Why misleading:

- it no longer reflects live production schema
- future developers may read it as current truth

Cleanup recommendation:

- regenerate or refresh `supabase/schema.sql` from current live schema
- do not keep it as a stale hybrid of old and new states

Priority:

- high

## Bucket D: Historical migration files that are noisy but acceptable

These are not active maintenance blockers by themselves.

### Old migration SQL files under `supabase/migrations/`

Examples:

- `20260310102000_create_company_shift_definitions.sql`
- `20260311224000_add_late_penalty_settings.sql`
- `20260328010000_add_transactional_leave_policy_save.sql`

Why they appear misleading:

- they still contain old bridge or legacy schema history

Why they should usually stay:

- they are historical migration records
- deleting or rewriting them would create migration-history drift

Cleanup recommendation:

- keep them
- do not treat them as current schema truth
- rely on current docs plus refreshed schema snapshot instead

## Bucket E: Operational tables that are legitimate and should stay

These are not legacy policy config sources.

They should remain, but their role should stay explicit in docs.

### Leave workflow

- `employee_leave_requests`
- `employee_leave_balance_overrides`
- `employee_leave_balance_override_audit_logs`

### Holiday calendar storage

- `company_holidays`

### Correction workflow

- `employee_attendance_corrections`
- `employee_attendance_correction_audit_logs`
- `attendance_manual_review_resolutions`
- `attendance_manual_review_resolution_history`

### Attendance event storage

- `attendance_punch_events`

Why they are acceptable:

- they are transactional or workflow tables
- they are not the policy config source of truth

Required rule:

- docs and runtime code should never imply that these tables are fallback policy config storage

## Recommended execution order

### Phase 1: very low risk

- clean deprecated response aliases like `loginAccessRule`
- add or tighten docs that distinguish config tables from operational tables

### Phase 2: medium risk

- refresh `supabase/schema.sql` to match live schema
- replace or archive `docs/policy-migration-map.md`

### Phase 3: medium risk with verification

- remove deprecated config alias reads:
  - `loginAccessRule`
  - `earlyInAllowed`
- only after confirming no live policy rows still depend on them

## Short conclusion

The remaining complexity is now mostly representational, not architectural.

That is good news:

- policy-engine cutover is done
- what remains is making the codebase impossible to misread

The biggest sources of confusion today are:

1. `docs/policy-migration-map.md`
2. `supabase/schema.sql`
3. deprecated alias exposure such as `loginAccessRule`
