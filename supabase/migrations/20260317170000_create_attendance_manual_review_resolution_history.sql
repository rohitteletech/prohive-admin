create table if not exists public.attendance_manual_review_resolution_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  previous_treatment text,
  new_treatment text not null
    check (new_treatment in ('Record Only', 'OT Only', 'Grant Comp Off', 'Present + OT')),
  action_type text not null
    check (action_type in ('approved', 'rejected')),
  remark text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists attendance_manual_review_resolution_history_company_date_idx
  on public.attendance_manual_review_resolution_history(company_id, work_date desc, created_at desc);

alter table public.attendance_manual_review_resolution_history enable row level security;

drop policy if exists "attendance_manual_review_resolution_history_select_authenticated" on public.attendance_manual_review_resolution_history;
drop policy if exists "attendance_manual_review_resolution_history_insert_authenticated" on public.attendance_manual_review_resolution_history;

create policy "attendance_manual_review_resolution_history_select_authenticated"
on public.attendance_manual_review_resolution_history
for select
to authenticated
using (true);

create policy "attendance_manual_review_resolution_history_insert_authenticated"
on public.attendance_manual_review_resolution_history
for insert
to authenticated
with check (true);
