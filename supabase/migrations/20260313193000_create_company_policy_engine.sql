create table if not exists public.company_policy_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  policy_type text not null,
  policy_name text not null,
  policy_code text not null,
  status text not null default 'draft',
  is_default boolean not null default false,
  effective_from date not null,
  next_review_date date not null,
  config_json jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint company_policy_definitions_type_check
    check (policy_type in ('shift', 'attendance', 'leave', 'holiday_weekoff', 'correction')),
  constraint company_policy_definitions_status_check
    check (status in ('draft', 'active', 'archived')),
  constraint company_policy_definitions_code_unique unique (company_id, policy_type, policy_code)
);

create index if not exists company_policy_definitions_company_idx
  on public.company_policy_definitions(company_id, policy_type, status, is_default desc);

create table if not exists public.company_policy_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  policy_type text not null,
  policy_id uuid not null references public.company_policy_definitions(id) on delete cascade,
  assignment_level text not null,
  target_id text not null,
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint company_policy_assignments_type_check
    check (policy_type in ('shift', 'attendance', 'leave', 'holiday_weekoff', 'correction')),
  constraint company_policy_assignments_level_check
    check (assignment_level in ('company', 'department', 'employee')),
  constraint company_policy_assignments_date_check
    check (effective_to is null or effective_to >= effective_from)
);

create index if not exists company_policy_assignments_company_idx
  on public.company_policy_assignments(company_id, policy_type, assignment_level, target_id, is_active desc, effective_from desc);

alter table public.company_policy_definitions enable row level security;
alter table public.company_policy_assignments enable row level security;

drop policy if exists "company_policy_definitions_select_authenticated" on public.company_policy_definitions;
drop policy if exists "company_policy_definitions_insert_authenticated" on public.company_policy_definitions;
drop policy if exists "company_policy_definitions_update_authenticated" on public.company_policy_definitions;
drop policy if exists "company_policy_definitions_delete_authenticated" on public.company_policy_definitions;

create policy "company_policy_definitions_select_authenticated"
on public.company_policy_definitions
for select
to authenticated
using (true);

create policy "company_policy_definitions_insert_authenticated"
on public.company_policy_definitions
for insert
to authenticated
with check (true);

create policy "company_policy_definitions_update_authenticated"
on public.company_policy_definitions
for update
to authenticated
using (true)
with check (true);

create policy "company_policy_definitions_delete_authenticated"
on public.company_policy_definitions
for delete
to authenticated
using (true);

drop policy if exists "company_policy_assignments_select_authenticated" on public.company_policy_assignments;
drop policy if exists "company_policy_assignments_insert_authenticated" on public.company_policy_assignments;
drop policy if exists "company_policy_assignments_update_authenticated" on public.company_policy_assignments;
drop policy if exists "company_policy_assignments_delete_authenticated" on public.company_policy_assignments;

create policy "company_policy_assignments_select_authenticated"
on public.company_policy_assignments
for select
to authenticated
using (true);

create policy "company_policy_assignments_insert_authenticated"
on public.company_policy_assignments
for insert
to authenticated
with check (true);

create policy "company_policy_assignments_update_authenticated"
on public.company_policy_assignments
for update
to authenticated
using (true)
with check (true);

create policy "company_policy_assignments_delete_authenticated"
on public.company_policy_assignments
for delete
to authenticated
using (true);
