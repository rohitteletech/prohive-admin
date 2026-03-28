alter table public.companies
  drop column if exists login_access_rule;

drop policy if exists "company_shift_definitions_select_authenticated" on public.company_shift_definitions;
drop policy if exists "company_shift_definitions_insert_authenticated" on public.company_shift_definitions;
drop policy if exists "company_shift_definitions_update_authenticated" on public.company_shift_definitions;
drop policy if exists "company_shift_definitions_delete_authenticated" on public.company_shift_definitions;

drop table if exists public.company_shift_definitions;
