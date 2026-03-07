alter table public.employee_attendance_corrections
  drop constraint if exists employee_attendance_corrections_time_order_check;

alter table public.employee_attendance_corrections
  add constraint employee_attendance_corrections_time_order_check
  check (
    requested_check_in is null
    or requested_check_out is null
    or requested_check_out > requested_check_in
  );

alter table public.employee_attendance_corrections
  drop constraint if exists employee_attendance_corrections_reason_len_check;

alter table public.employee_attendance_corrections
  add constraint employee_attendance_corrections_reason_len_check
  check (char_length(btrim(reason)) between 10 and 300);

create unique index if not exists employee_attendance_corrections_pending_unique_idx
  on public.employee_attendance_corrections(company_id, employee_id, correction_date)
  where status = 'pending';

create table if not exists public.employee_attendance_correction_audit_logs (
  id uuid primary key default gen_random_uuid(),
  correction_id uuid null references public.employee_attendance_corrections(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  action text not null check (action in ('submitted', 'reviewed', 'auto_rejected', 'blocked_monthly_limit')),
  old_status text null,
  new_status text null,
  old_requested_check_in time null,
  new_requested_check_in time null,
  old_requested_check_out time null,
  new_requested_check_out time null,
  reason_snapshot text null,
  performed_by text not null,
  performed_role text not null check (performed_role in ('employee', 'company_admin', 'system')),
  remark text null,
  created_at timestamptz not null default now()
);

create index if not exists employee_attendance_correction_audit_logs_correction_idx
  on public.employee_attendance_correction_audit_logs(correction_id, created_at desc);

create index if not exists employee_attendance_correction_audit_logs_company_idx
  on public.employee_attendance_correction_audit_logs(company_id, created_at desc);

alter table public.employee_attendance_correction_audit_logs enable row level security;

drop policy if exists "employee_attendance_correction_audit_logs_select_authenticated" on public.employee_attendance_correction_audit_logs;
drop policy if exists "employee_attendance_correction_audit_logs_insert_authenticated" on public.employee_attendance_correction_audit_logs;

create policy "employee_attendance_correction_audit_logs_select_authenticated"
on public.employee_attendance_correction_audit_logs
for select
to authenticated
using (true);

create policy "employee_attendance_correction_audit_logs_insert_authenticated"
on public.employee_attendance_correction_audit_logs
for insert
to authenticated
with check (true);
