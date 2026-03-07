alter table public.company_leave_policies
  add column if not exists accrual_mode text not null default 'monthly'
    check (accrual_mode in ('monthly', 'upfront'));

create table if not exists public.employee_leave_balance_overrides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_policy_code text not null,
  year integer not null check (year between 2000 and 2100),
  extra_days numeric(6,2) not null default 0,
  reason text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_id, leave_policy_code, year)
);

create index if not exists employee_leave_balance_overrides_company_year_idx
  on public.employee_leave_balance_overrides(company_id, year desc, employee_id);

alter table public.employee_leave_balance_overrides enable row level security;

drop policy if exists "employee_leave_balance_overrides_select_authenticated" on public.employee_leave_balance_overrides;
drop policy if exists "employee_leave_balance_overrides_insert_authenticated" on public.employee_leave_balance_overrides;
drop policy if exists "employee_leave_balance_overrides_update_authenticated" on public.employee_leave_balance_overrides;
drop policy if exists "employee_leave_balance_overrides_delete_authenticated" on public.employee_leave_balance_overrides;

create policy "employee_leave_balance_overrides_select_authenticated"
on public.employee_leave_balance_overrides
for select
to authenticated
using (true);

create policy "employee_leave_balance_overrides_insert_authenticated"
on public.employee_leave_balance_overrides
for insert
to authenticated
with check (true);

create policy "employee_leave_balance_overrides_update_authenticated"
on public.employee_leave_balance_overrides
for update
to authenticated
using (true)
with check (true);

create policy "employee_leave_balance_overrides_delete_authenticated"
on public.employee_leave_balance_overrides
for delete
to authenticated
using (true);

create table if not exists public.employee_leave_balance_override_audit_logs (
  id uuid primary key default gen_random_uuid(),
  override_id uuid references public.employee_leave_balance_overrides(id) on delete set null,
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_policy_code text not null,
  year integer not null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  old_extra_days numeric(6,2),
  new_extra_days numeric(6,2),
  reason text,
  changed_by text not null,
  changed_at timestamptz not null default now()
);

create index if not exists employee_leave_balance_override_audit_company_idx
  on public.employee_leave_balance_override_audit_logs(company_id, changed_at desc);

alter table public.employee_leave_balance_override_audit_logs enable row level security;

drop policy if exists "employee_leave_balance_override_audit_logs_select_authenticated" on public.employee_leave_balance_override_audit_logs;
drop policy if exists "employee_leave_balance_override_audit_logs_insert_authenticated" on public.employee_leave_balance_override_audit_logs;

create policy "employee_leave_balance_override_audit_logs_select_authenticated"
on public.employee_leave_balance_override_audit_logs
for select
to authenticated
using (true);

create policy "employee_leave_balance_override_audit_logs_insert_authenticated"
on public.employee_leave_balance_override_audit_logs
for insert
to authenticated
with check (true);
