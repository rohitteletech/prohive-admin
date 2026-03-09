alter table public.attendance_punch_events
  add column if not exists device_id text;

create index if not exists attendance_punch_events_company_employee_device_idx
  on public.attendance_punch_events(company_id, employee_id, device_id, server_received_at desc);