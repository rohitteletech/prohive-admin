alter table public.attendance_punch_events
  add column if not exists company_name_snapshot text,
  add column if not exists employee_name_snapshot text;