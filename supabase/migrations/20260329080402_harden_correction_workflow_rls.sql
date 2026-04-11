drop policy if exists "employee_attendance_corrections_select_authenticated" on public.employee_attendance_corrections;
drop policy if exists "employee_attendance_corrections_insert_authenticated" on public.employee_attendance_corrections;
drop policy if exists "employee_attendance_corrections_update_authenticated" on public.employee_attendance_corrections;
drop policy if exists "employee_attendance_corrections_delete_authenticated" on public.employee_attendance_corrections;

create policy "employee_attendance_corrections_select_authenticated"
on public.employee_attendance_corrections
for select
to authenticated
using (
  exists (
    select 1
      from public.companies
     where companies.id = employee_attendance_corrections.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

create policy "employee_attendance_corrections_insert_authenticated"
on public.employee_attendance_corrections
for insert
to authenticated
with check (
  exists (
    select 1
      from public.companies
     where companies.id = employee_attendance_corrections.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

create policy "employee_attendance_corrections_update_authenticated"
on public.employee_attendance_corrections
for update
to authenticated
using (
  exists (
    select 1
      from public.companies
     where companies.id = employee_attendance_corrections.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
)
with check (
  exists (
    select 1
      from public.companies
     where companies.id = employee_attendance_corrections.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

create policy "employee_attendance_corrections_delete_authenticated"
on public.employee_attendance_corrections
for delete
to authenticated
using (
  exists (
    select 1
      from public.companies
     where companies.id = employee_attendance_corrections.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

drop policy if exists "employee_attendance_correction_audit_logs_select_authenticated" on public.employee_attendance_correction_audit_logs;
drop policy if exists "employee_attendance_correction_audit_logs_insert_authenticated" on public.employee_attendance_correction_audit_logs;

create policy "employee_attendance_correction_audit_logs_select_authenticated"
on public.employee_attendance_correction_audit_logs
for select
to authenticated
using (
  exists (
    select 1
      from public.companies
     where companies.id = employee_attendance_correction_audit_logs.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

create policy "employee_attendance_correction_audit_logs_insert_authenticated"
on public.employee_attendance_correction_audit_logs
for insert
to authenticated
with check (
  exists (
    select 1
      from public.companies
     where companies.id = employee_attendance_correction_audit_logs.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

drop policy if exists "attendance_manual_review_resolutions_select_authenticated" on public.attendance_manual_review_resolutions;
drop policy if exists "attendance_manual_review_resolutions_insert_authenticated" on public.attendance_manual_review_resolutions;
drop policy if exists "attendance_manual_review_resolutions_update_authenticated" on public.attendance_manual_review_resolutions;

create policy "attendance_manual_review_resolutions_select_authenticated"
on public.attendance_manual_review_resolutions
for select
to authenticated
using (
  exists (
    select 1
      from public.companies
     where companies.id = attendance_manual_review_resolutions.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

create policy "attendance_manual_review_resolutions_insert_authenticated"
on public.attendance_manual_review_resolutions
for insert
to authenticated
with check (
  exists (
    select 1
      from public.companies
     where companies.id = attendance_manual_review_resolutions.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

create policy "attendance_manual_review_resolutions_update_authenticated"
on public.attendance_manual_review_resolutions
for update
to authenticated
using (
  exists (
    select 1
      from public.companies
     where companies.id = attendance_manual_review_resolutions.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
)
with check (
  exists (
    select 1
      from public.companies
     where companies.id = attendance_manual_review_resolutions.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

drop policy if exists "attendance_manual_review_resolution_history_select_authenticated" on public.attendance_manual_review_resolution_history;
drop policy if exists "attendance_manual_review_resolution_history_insert_authenticated" on public.attendance_manual_review_resolution_history;
drop policy if exists "attendance_manual_review_resolution_history_select_authenticate" on public.attendance_manual_review_resolution_history;
drop policy if exists "attendance_manual_review_resolution_history_insert_authenticate" on public.attendance_manual_review_resolution_history;

create policy "attendance_manual_review_resolution_history_select_authenticated"
on public.attendance_manual_review_resolution_history
for select
to authenticated
using (
  exists (
    select 1
      from public.companies
     where companies.id = attendance_manual_review_resolution_history.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

create policy "attendance_manual_review_resolution_history_insert_authenticated"
on public.attendance_manual_review_resolution_history
for insert
to authenticated
with check (
  exists (
    select 1
      from public.companies
     where companies.id = attendance_manual_review_resolution_history.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);;
