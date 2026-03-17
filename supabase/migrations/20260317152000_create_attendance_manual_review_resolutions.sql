create table if not exists public.attendance_manual_review_resolutions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  resolution_treatment text not null
    check (resolution_treatment in ('Record Only', 'OT Only', 'Grant Comp Off', 'Present + OT')),
  remark text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_id, work_date)
);

create index if not exists attendance_manual_review_resolutions_company_date_idx
  on public.attendance_manual_review_resolutions(company_id, work_date desc, employee_id);

alter table public.attendance_manual_review_resolutions enable row level security;

drop policy if exists "attendance_manual_review_resolutions_select_authenticated" on public.attendance_manual_review_resolutions;
drop policy if exists "attendance_manual_review_resolutions_insert_authenticated" on public.attendance_manual_review_resolutions;
drop policy if exists "attendance_manual_review_resolutions_update_authenticated" on public.attendance_manual_review_resolutions;

create policy "attendance_manual_review_resolutions_select_authenticated"
on public.attendance_manual_review_resolutions
for select
to authenticated
using (true);

create policy "attendance_manual_review_resolutions_insert_authenticated"
on public.attendance_manual_review_resolutions
for insert
to authenticated
with check (true);

create policy "attendance_manual_review_resolutions_update_authenticated"
on public.attendance_manual_review_resolutions
for update
to authenticated
using (true)
with check (true);
