alter table public.employee_attendance_corrections
  drop constraint if exists employee_attendance_corrections_status_check;

alter table public.employee_attendance_corrections
  add constraint employee_attendance_corrections_status_check
  check (status in ('pending', 'pending_manager', 'pending_hr', 'approved', 'rejected'));

drop index if exists employee_attendance_corrections_pending_unique_idx;

create unique index if not exists employee_attendance_corrections_pending_unique_idx
  on public.employee_attendance_corrections(company_id, employee_id, correction_date)
  where status in ('pending', 'pending_manager', 'pending_hr');
