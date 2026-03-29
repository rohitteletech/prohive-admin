# Policy Engine RLS Cleanup

Date: 2026-03-29

## Scope

This cleanup hardens the core policy-engine tables:

- `public.company_policy_definitions`
- `public.company_policy_assignments`

## Why this is needed

Live Supabase currently allows overly broad authenticated access on both tables:

- insert policies use `WITH CHECK (true)`
- update policies use `USING (true)` and `WITH CHECK (true)`
- delete policies use `USING (true)`

That is why security advisor still flags both tables.

## Expected end state

Authenticated access should be limited to the company admin for the row's company:

- `companies.id = <row>.company_id`
- `lower(companies.admin_email) = lower(auth.email())`

## Safety notes

- App routes already use company-admin session validation before touching these tables.
- Service-role flows continue to bypass RLS as before.
- Runtime behavior should not change for normal company-admin use.

## Cleanup result target

After migration:

- security advisor should stop flagging `company_policy_definitions` permissive write/delete policies
- security advisor should stop flagging `company_policy_assignments` permissive write/delete policies
- policy pages and assignment flows should continue to work unchanged
