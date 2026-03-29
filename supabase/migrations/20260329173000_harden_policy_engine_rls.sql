drop policy if exists "company_policy_definitions_select_authenticated" on public.company_policy_definitions;
drop policy if exists "company_policy_definitions_insert_authenticated" on public.company_policy_definitions;
drop policy if exists "company_policy_definitions_update_authenticated" on public.company_policy_definitions;
drop policy if exists "company_policy_definitions_delete_authenticated" on public.company_policy_definitions;

create policy "company_policy_definitions_select_authenticated"
on public.company_policy_definitions
for select
to authenticated
using (
  exists (
    select 1
      from public.companies
     where companies.id = company_policy_definitions.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

create policy "company_policy_definitions_insert_authenticated"
on public.company_policy_definitions
for insert
to authenticated
with check (
  exists (
    select 1
      from public.companies
     where companies.id = company_policy_definitions.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

create policy "company_policy_definitions_update_authenticated"
on public.company_policy_definitions
for update
to authenticated
using (
  exists (
    select 1
      from public.companies
     where companies.id = company_policy_definitions.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
)
with check (
  exists (
    select 1
      from public.companies
     where companies.id = company_policy_definitions.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

create policy "company_policy_definitions_delete_authenticated"
on public.company_policy_definitions
for delete
to authenticated
using (
  exists (
    select 1
      from public.companies
     where companies.id = company_policy_definitions.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

drop policy if exists "company_policy_assignments_select_authenticated" on public.company_policy_assignments;
drop policy if exists "company_policy_assignments_insert_authenticated" on public.company_policy_assignments;
drop policy if exists "company_policy_assignments_update_authenticated" on public.company_policy_assignments;
drop policy if exists "company_policy_assignments_delete_authenticated" on public.company_policy_assignments;

create policy "company_policy_assignments_select_authenticated"
on public.company_policy_assignments
for select
to authenticated
using (
  exists (
    select 1
      from public.companies
     where companies.id = company_policy_assignments.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

create policy "company_policy_assignments_insert_authenticated"
on public.company_policy_assignments
for insert
to authenticated
with check (
  exists (
    select 1
      from public.companies
     where companies.id = company_policy_assignments.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

create policy "company_policy_assignments_update_authenticated"
on public.company_policy_assignments
for update
to authenticated
using (
  exists (
    select 1
      from public.companies
     where companies.id = company_policy_assignments.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
)
with check (
  exists (
    select 1
      from public.companies
     where companies.id = company_policy_assignments.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

create policy "company_policy_assignments_delete_authenticated"
on public.company_policy_assignments
for delete
to authenticated
using (
  exists (
    select 1
      from public.companies
     where companies.id = company_policy_assignments.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);
