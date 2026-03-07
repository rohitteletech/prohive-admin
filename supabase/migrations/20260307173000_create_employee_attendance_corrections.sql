create table if not exists public.employee_attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  correction_date date not null,
  requested_check_in time null,
  requested_check_out time null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_remark text null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_attendance_corrections_time_required_check
    check (requested_check_in is not null or requested_check_out is not null)
);

create index if not exists employee_attendance_corrections_company_status_idx
  on public.employee_attendance_corrections(company_id, status, submitted_at desc);

create index if not exists employee_attendance_corrections_company_employee_idx
  on public.employee_attendance_corrections(company_id, employee_id, submitted_at desc);

alter table public.employee_attendance_corrections enable row level security;

drop policy if exists "employee_attendance_corrections_select_authenticated" on public.employee_attendance_corrections;
drop policy if exists "employee_attendance_corrections_insert_authenticated" on public.employee_attendance_corrections;
drop policy if exists "employee_attendance_corrections_update_authenticated" on public.employee_attendance_corrections;
drop policy if exists "employee_attendance_corrections_delete_authenticated" on public.employee_attendance_corrections;

create policy "employee_attendance_corrections_select_authenticated"
on public.employee_attendance_corrections
for select
to authenticated
using (true);

create policy "employee_attendance_corrections_insert_authenticated"
on public.employee_attendance_corrections
for insert
to authenticated
with check (true);

create policy "employee_attendance_corrections_update_authenticated"
on public.employee_attendance_corrections
for update
to authenticated
using (true)
with check (true);

create policy "employee_attendance_corrections_delete_authenticated"
on public.employee_attendance_corrections
for delete
to authenticated
using (true);
