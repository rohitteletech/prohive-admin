create or replace view public.attendance_punch_events_ordered
with (security_invoker = true) as
select
  company_name_snapshot,
  employee_name_snapshot,
  company_id,
  employee_id,
  device_id,
  event_id,
  source,
  punch_type,
  attendance_mode_snapshot,
  office_lat_snapshot,
  office_lon_snapshot,
  office_radius_m_snapshot,
  lat,
  lon,
  address_text,
  accuracy_m,
  distance_from_office_m,
  is_offline,
  device_time_ms,
  device_time_at,
  estimated_time_ms,
  estimated_time_at,
  trusted_anchor_time_ms,
  trusted_anchor_time_at,
  trusted_anchor_elapsed_ms,
  elapsed_ms,
  clock_drift_ms,
  server_received_at,
  effective_punch_at,
  requires_approval,
  approval_status,
  approval_reason_codes,
  raw_payload,
  created_at,
  id,
  day_type,
  is_extra_work
from public.attendance_punch_events;

create or replace function public.sync_company_policy_default_flags()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_default = true and new.status = 'active' then
    update public.company_policy_definitions
       set is_default = false,
           updated_at = timezone('utc', now())
     where company_id = new.company_id
       and policy_type = new.policy_type
       and id <> new.id
       and is_default = true
       and status = 'active'
       and (
         (new.effective_from > current_date and effective_from = new.effective_from)
         or
         (new.effective_from <= current_date and effective_from <= new.effective_from)
       );
  end if;

  return new;
end;
$$;

create or replace function public.guard_leave_policy_active_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.policy_type <> 'leave' or new.status <> 'active' then
    return new;
  end if;

  if exists (
    select 1
      from public.company_policy_definitions
     where company_id = new.company_id
       and policy_type = 'leave'
       and status = 'active'
       and id <> new.id
       and effective_from = new.effective_from
  ) then
    raise exception 'Another active leave policy is already scheduled for %.', new.effective_from;
  end if;

  if new.effective_from > current_date then
    if exists (
      select 1
        from public.company_policy_definitions
       where company_id = new.company_id
         and policy_type = 'leave'
         and status = 'active'
         and id <> new.id
         and effective_from > current_date
    ) then
      raise exception 'Another future active leave policy is already scheduled for this company.';
    end if;
  else
    if exists (
      select 1
        from public.company_policy_definitions
       where company_id = new.company_id
         and policy_type = 'leave'
         and status = 'active'
         and id <> new.id
         and effective_from <= current_date
    ) then
      raise exception 'Another current active leave policy already exists for this company.';
    end if;
  end if;

  return new;
end;
$$;

create index if not exists attendance_punch_events_employee_id_idx
  on public.attendance_punch_events(employee_id);

create index if not exists attendance_manual_review_resolutions_employee_id_idx
  on public.attendance_manual_review_resolutions(employee_id);

create index if not exists attendance_manual_review_resolution_history_employee_id_idx
  on public.attendance_manual_review_resolution_history(employee_id);

create index if not exists company_policy_assignments_policy_id_idx
  on public.company_policy_assignments(policy_id);

create index if not exists employee_attendance_correction_audit_logs_employee_id_idx
  on public.employee_attendance_correction_audit_logs(employee_id);

create index if not exists employee_attendance_corrections_employee_id_idx
  on public.employee_attendance_corrections(employee_id);

create index if not exists employee_leave_balance_overrides_employee_id_idx
  on public.employee_leave_balance_overrides(employee_id);

create index if not exists employee_leave_balance_override_audit_logs_override_id_idx
  on public.employee_leave_balance_override_audit_logs(override_id);

create index if not exists employee_leave_balance_override_audit_logs_employee_id_idx
  on public.employee_leave_balance_override_audit_logs(employee_id);

create index if not exists employee_leave_requests_employee_id_idx
  on public.employee_leave_requests(employee_id);
