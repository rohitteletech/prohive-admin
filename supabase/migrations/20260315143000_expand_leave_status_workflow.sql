alter table public.employee_leave_requests
  add column if not exists approval_flow_snapshot text not null default 'manager_hr';

alter table public.employee_leave_requests
  drop constraint if exists employee_leave_requests_status_check;

alter table public.employee_leave_requests
  add constraint employee_leave_requests_status_check
  check (status in ('pending', 'pending_manager', 'pending_hr', 'approved', 'rejected'));

alter table public.employee_leave_requests
  drop constraint if exists employee_leave_requests_approval_flow_snapshot_check;

alter table public.employee_leave_requests
  add constraint employee_leave_requests_approval_flow_snapshot_check
  check (approval_flow_snapshot in ('manager', 'manager_hr', 'hr'));

update public.employee_leave_requests
set approval_flow_snapshot = 'manager_hr'
where approval_flow_snapshot not in ('manager', 'manager_hr', 'hr');
