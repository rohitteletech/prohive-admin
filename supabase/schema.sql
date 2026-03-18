create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  plan_type text not null check (plan_type in ('trial', 'monthly', 'yearly')),
  plan_start date not null,
  plan_end date not null,
  status text not null check (status in ('trial_active', 'paid_active', 'grace_paid', 'suspended')),
  size_of_employees text,
  authorized_name text,
  mobile text,
  address text,
  city text,
  state text,
  country text,
  pin_code text,
  admin_email text,
  admin_password text,
  company_tagline text,
  office_lat double precision,
  office_lon double precision,
  office_radius_m integer,
  weekly_off_policy text not null default 'sunday_only'
    check (weekly_off_policy in ('sunday_only', 'saturday_sunday', 'second_fourth_saturday_sunday')),
  allow_punch_on_holiday boolean not null default true,
  allow_punch_on_weekly_off boolean not null default true,
  extra_hours_policy text not null default 'yes'
    check (extra_hours_policy in ('yes', 'no')),
  half_day_min_work_mins integer not null default 240
    check (half_day_min_work_mins >= 0 and half_day_min_work_mins <= 1440),
  late_penalty_enabled boolean not null default false,
  late_penalty_up_to_mins integer not null default 30
    check (late_penalty_up_to_mins >= 0 and late_penalty_up_to_mins <= 180),
  late_penalty_repeat_count integer not null default 3
    check (late_penalty_repeat_count >= 1 and late_penalty_repeat_count <= 31),
  late_penalty_repeat_days numeric(4,1) not null default 1.0
    check (late_penalty_repeat_days >= 0 and late_penalty_repeat_days <= 31),
  late_penalty_above_mins integer not null default 30
    check (late_penalty_above_mins >= 0 and late_penalty_above_mins <= 180),
  late_penalty_above_days numeric(4,1) not null default 0.5
    check (late_penalty_above_days >= 0 and late_penalty_above_days <= 31),
  login_access_rule text not null default 'any_time'
    check (login_access_rule in ('any_time', 'shift_time_only')),
  gst text,
  business_nature text,
  created_at timestamptz not null default now()
);

alter table public.companies
  alter column id set default gen_random_uuid();

alter table public.companies
  add column if not exists weekly_off_policy text not null default 'sunday_only'
    check (weekly_off_policy in ('sunday_only', 'saturday_sunday', 'second_fourth_saturday_sunday'));

alter table public.companies
  add column if not exists allow_punch_on_holiday boolean not null default true,
  add column if not exists allow_punch_on_weekly_off boolean not null default true;

alter table public.companies
  add column if not exists extra_hours_policy text not null default 'yes'
    check (extra_hours_policy in ('yes', 'no'));

alter table public.companies
  add column if not exists half_day_min_work_mins integer not null default 240
    check (half_day_min_work_mins >= 0 and half_day_min_work_mins <= 1440);

alter table public.companies
  add column if not exists late_penalty_enabled boolean not null default false,
  add column if not exists late_penalty_up_to_mins integer not null default 30
    check (late_penalty_up_to_mins >= 0 and late_penalty_up_to_mins <= 180),
  add column if not exists late_penalty_repeat_count integer not null default 3
    check (late_penalty_repeat_count >= 1 and late_penalty_repeat_count <= 31),
  add column if not exists late_penalty_repeat_days numeric(4,1) not null default 1.0
    check (late_penalty_repeat_days >= 0 and late_penalty_repeat_days <= 31),
  add column if not exists late_penalty_above_mins integer not null default 30
    check (late_penalty_above_mins >= 0 and late_penalty_above_mins <= 180),
  add column if not exists late_penalty_above_days numeric(4,1) not null default 0.5
    check (late_penalty_above_days >= 0 and late_penalty_above_days <= 31);

alter table public.companies
  add column if not exists login_access_rule text not null default 'any_time'
    check (login_access_rule in ('any_time', 'shift_time_only'));

alter table public.companies
  add column if not exists company_tagline text;

alter table public.companies enable row level security;

drop policy if exists "companies_select_public" on public.companies;
drop policy if exists "companies_insert_public" on public.companies;
drop policy if exists "companies_select_authenticated" on public.companies;
drop policy if exists "companies_insert_authenticated" on public.companies;

create policy "companies_select_authenticated"
on public.companies
for select
to authenticated
using (true);

create policy "companies_insert_authenticated"
on public.companies
for insert
to authenticated
with check (true);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  gender text check (gender in ('male', 'female', 'other')),
  email text,
  employee_code text not null,
  mobile text not null,
  designation text not null,
  department text,
  shift_name text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  joined_on date not null,
  reporting_manager text,
  perm_address text,
  temp_address text,
  pan text,
  aadhaar_number text,
  emergency_name text,
  emergency_mobile text,
  employment_type text check (employment_type in ('full_time', 'contract', 'intern')),
  exit_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_code),
  unique (company_id, mobile)
);

alter table public.employees
  add column if not exists gender text check (gender in ('male', 'female', 'other'));

alter table public.employees
  add column if not exists mobile_app_status text not null default 'invited'
    check (mobile_app_status in ('invited', 'active', 'blocked')),
  add column if not exists mobile_verified_at timestamptz,
  add column if not exists app_pin_hash text,
  add column if not exists bound_device_id text,
  add column if not exists bound_device_name text,
  add column if not exists bound_app_version text,
  add column if not exists bound_device_at timestamptz,
  add column if not exists mobile_last_login_at timestamptz;

alter table public.employees
  add column if not exists attendance_mode text not null default 'field_staff'
    check (attendance_mode in ('office_only', 'field_staff'));

alter table public.employees enable row level security;

drop policy if exists "employees_select_authenticated" on public.employees;
drop policy if exists "employees_insert_authenticated" on public.employees;
drop policy if exists "employees_update_authenticated" on public.employees;
drop policy if exists "employees_delete_authenticated" on public.employees;

create policy "employees_select_authenticated"
on public.employees
for select
to authenticated
using (true);

create policy "employees_insert_authenticated"
on public.employees
for insert
to authenticated
with check (true);

create policy "employees_update_authenticated"
on public.employees
for update
to authenticated
using (true)
with check (true);

create policy "employees_delete_authenticated"
on public.employees
for delete
to authenticated
using (true);

create table if not exists public.employee_login_otps (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  employee_code text not null,
  mobile text not null,
  purpose text not null check (purpose in ('first_login', 'reset_pin')),
  otp_code text not null,
  requested_device_id text not null,
  requested_device_name text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists employee_login_otps_employee_id_idx
  on public.employee_login_otps(employee_id, created_at desc);

alter table public.employee_login_otps enable row level security;

create table if not exists public.attendance_punch_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  company_name_snapshot text,
  employee_name_snapshot text,
  day_type text not null default 'working_day'
    check (day_type in ('working_day', 'holiday', 'weekly_off')),
  is_extra_work boolean not null default false,
  device_id text,
  event_id uuid not null unique,
  source text not null default 'mobile' check (source in ('mobile')),
  punch_type text not null check (punch_type in ('in', 'out')),
  attendance_mode_snapshot text not null check (attendance_mode_snapshot in ('office_only', 'field_staff')),
  office_lat_snapshot double precision,
  office_lon_snapshot double precision,
  office_radius_m_snapshot integer,
  lat double precision not null,
  lon double precision not null,
  address_text text,
  accuracy_m double precision not null,
  distance_from_office_m double precision,
  is_offline boolean not null default false,
  device_time_ms bigint not null,
  device_time_at timestamptz,
  estimated_time_ms bigint,
  estimated_time_at timestamptz,
  trusted_anchor_time_ms bigint,
  trusted_anchor_time_at timestamptz,
  trusted_anchor_elapsed_ms bigint,
  elapsed_ms bigint not null,
  clock_drift_ms bigint,
  server_received_at timestamptz not null default now(),
  effective_punch_at timestamptz,
  requires_approval boolean not null default false,
  approval_status text not null default 'auto_approved'
    check (approval_status in ('auto_approved', 'pending_approval', 'approved', 'rejected')),
  approval_reason_codes text[] not null default '{}',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.attendance_punch_events
  add column if not exists company_name_snapshot text,
  add column if not exists employee_name_snapshot text,
  add column if not exists day_type text not null default 'working_day'
    check (day_type in ('working_day', 'holiday', 'weekly_off')),
  add column if not exists is_extra_work boolean not null default false,
  add column if not exists device_id text;

create index if not exists attendance_punch_events_company_employee_idx
  on public.attendance_punch_events(company_id, employee_id, server_received_at desc);

create index if not exists attendance_punch_events_company_status_idx
  on public.attendance_punch_events(company_id, approval_status, server_received_at desc);

alter table public.attendance_punch_events enable row level security;

drop policy if exists "attendance_punch_events_select_authenticated" on public.attendance_punch_events;
drop policy if exists "attendance_punch_events_insert_authenticated" on public.attendance_punch_events;
drop policy if exists "attendance_punch_events_update_authenticated" on public.attendance_punch_events;

create policy "attendance_punch_events_select_authenticated"
on public.attendance_punch_events
for select
to authenticated
using (true);

create policy "attendance_punch_events_insert_authenticated"
on public.attendance_punch_events
for insert
to authenticated
with check (true);

create policy "attendance_punch_events_update_authenticated"
on public.attendance_punch_events
for update
to authenticated
using (true)
with check (true);

create or replace view public.attendance_punch_events_ordered as
select
  company_name_snapshot,
  employee_name_snapshot,
  day_type,
  is_extra_work,
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
  id
from public.attendance_punch_events;

create table if not exists public.company_leave_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  code text not null,
  annual_quota integer not null default 0 check (annual_quota >= 0),
  carry_forward integer not null default 0 check (carry_forward >= 0),
  accrual_mode text not null default 'monthly' check (accrual_mode in ('monthly', 'upfront')),
  encashable boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

alter table public.company_leave_policies
  add column if not exists accrual_mode text not null default 'monthly'
    check (accrual_mode in ('monthly', 'upfront'));

create index if not exists company_leave_policies_company_idx
  on public.company_leave_policies(company_id, active desc, name asc);

alter table public.company_leave_policies enable row level security;

drop policy if exists "company_leave_policies_select_authenticated" on public.company_leave_policies;
drop policy if exists "company_leave_policies_insert_authenticated" on public.company_leave_policies;
drop policy if exists "company_leave_policies_update_authenticated" on public.company_leave_policies;
drop policy if exists "company_leave_policies_delete_authenticated" on public.company_leave_policies;

create policy "company_leave_policies_select_authenticated"
on public.company_leave_policies
for select
to authenticated
using (true);

create policy "company_leave_policies_insert_authenticated"
on public.company_leave_policies
for insert
to authenticated
with check (true);

create policy "company_leave_policies_update_authenticated"
on public.company_leave_policies
for update
to authenticated
using (true)
with check (true);

create policy "company_leave_policies_delete_authenticated"
on public.company_leave_policies
for delete
to authenticated
using (true);

create table if not exists public.employee_leave_balance_overrides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_policy_code text not null,
  year integer not null check (year >= 2000 and year <= 9999),
  extra_days numeric(6,2) not null default 0,
  reason text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_id, leave_policy_code, year)
);

create index if not exists employee_leave_balance_overrides_company_year_idx
  on public.employee_leave_balance_overrides(company_id, year desc, employee_id);

alter table public.employee_leave_balance_overrides enable row level security;

drop policy if exists "employee_leave_balance_overrides_select_authenticated" on public.employee_leave_balance_overrides;
drop policy if exists "employee_leave_balance_overrides_insert_authenticated" on public.employee_leave_balance_overrides;
drop policy if exists "employee_leave_balance_overrides_update_authenticated" on public.employee_leave_balance_overrides;
drop policy if exists "employee_leave_balance_overrides_delete_authenticated" on public.employee_leave_balance_overrides;

create policy "employee_leave_balance_overrides_select_authenticated"
on public.employee_leave_balance_overrides
for select
to authenticated
using (true);

create policy "employee_leave_balance_overrides_insert_authenticated"
on public.employee_leave_balance_overrides
for insert
to authenticated
with check (true);

create policy "employee_leave_balance_overrides_update_authenticated"
on public.employee_leave_balance_overrides
for update
to authenticated
using (true)
with check (true);

create policy "employee_leave_balance_overrides_delete_authenticated"
on public.employee_leave_balance_overrides
for delete
to authenticated
using (true);

create table if not exists public.company_holidays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  type text not null check (type in ('national', 'festival', 'company')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, holiday_date, name)
);

create index if not exists company_holidays_company_date_idx
  on public.company_holidays(company_id, holiday_date asc);

alter table public.company_holidays enable row level security;

drop policy if exists "company_holidays_select_authenticated" on public.company_holidays;
drop policy if exists "company_holidays_insert_authenticated" on public.company_holidays;
drop policy if exists "company_holidays_update_authenticated" on public.company_holidays;
drop policy if exists "company_holidays_delete_authenticated" on public.company_holidays;

create policy "company_holidays_select_authenticated"
on public.company_holidays
for select
to authenticated
using (true);

create policy "company_holidays_insert_authenticated"
on public.company_holidays
for insert
to authenticated
with check (true);

create policy "company_holidays_update_authenticated"
on public.company_holidays
for update
to authenticated
using (true)
with check (true);

create policy "company_holidays_delete_authenticated"
on public.company_holidays
for delete
to authenticated
using (true);

create table if not exists public.company_shift_definitions (
  id text primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  type text not null,
  start_time text not null,
  end_time text not null,
  grace_mins integer not null default 10 check (grace_mins >= 0 and grace_mins <= 120),
  early_window_mins integer not null default 15 check (early_window_mins >= 0 and early_window_mins <= 240),
  min_work_before_out_mins integer not null default 60 check (min_work_before_out_mins >= 0 and min_work_before_out_mins <= 1440),
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists company_shift_definitions_company_idx
  on public.company_shift_definitions(company_id, active desc, name asc);

alter table public.company_shift_definitions enable row level security;

drop policy if exists "company_shift_definitions_select_authenticated" on public.company_shift_definitions;
drop policy if exists "company_shift_definitions_insert_authenticated" on public.company_shift_definitions;
drop policy if exists "company_shift_definitions_update_authenticated" on public.company_shift_definitions;
drop policy if exists "company_shift_definitions_delete_authenticated" on public.company_shift_definitions;

create policy "company_shift_definitions_select_authenticated"
on public.company_shift_definitions
for select
to authenticated
using (true);

create policy "company_shift_definitions_insert_authenticated"
on public.company_shift_definitions
for insert
to authenticated
with check (true);

create policy "company_shift_definitions_update_authenticated"
on public.company_shift_definitions
for update
to authenticated
using (true)
with check (true);

create policy "company_shift_definitions_delete_authenticated"
on public.company_shift_definitions
for delete
to authenticated
using (true);

create table if not exists public.employee_leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_policy_code text not null,
  leave_name_snapshot text not null,
  from_date date not null,
  to_date date not null,
  days numeric(6,2) not null check (days > 0),
  paid_days numeric(6,2) not null default 0 check (paid_days >= 0),
  unpaid_days numeric(6,2) not null default 0 check (unpaid_days >= 0),
  leave_mode text not null default 'paid' check (leave_mode in ('paid', 'unpaid', 'mixed')),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_remark text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employee_leave_requests
  add column if not exists paid_days numeric(6,2) not null default 0 check (paid_days >= 0),
  add column if not exists unpaid_days numeric(6,2) not null default 0 check (unpaid_days >= 0),
  add column if not exists leave_mode text not null default 'paid' check (leave_mode in ('paid', 'unpaid', 'mixed'));

create index if not exists employee_leave_requests_company_status_idx
  on public.employee_leave_requests(company_id, status, submitted_at desc);

create index if not exists employee_leave_requests_company_employee_idx
  on public.employee_leave_requests(company_id, employee_id, submitted_at desc);

alter table public.employee_leave_requests enable row level security;

drop policy if exists "employee_leave_requests_select_authenticated" on public.employee_leave_requests;
drop policy if exists "employee_leave_requests_insert_authenticated" on public.employee_leave_requests;
drop policy if exists "employee_leave_requests_update_authenticated" on public.employee_leave_requests;
drop policy if exists "employee_leave_requests_delete_authenticated" on public.employee_leave_requests;

create policy "employee_leave_requests_select_authenticated"
on public.employee_leave_requests
for select
to authenticated
using (true);

create policy "employee_leave_requests_insert_authenticated"
on public.employee_leave_requests
for insert
to authenticated
with check (true);

create policy "employee_leave_requests_update_authenticated"
on public.employee_leave_requests
for update
to authenticated
using (true)
with check (true);

create policy "employee_leave_requests_delete_authenticated"
on public.employee_leave_requests
for delete
to authenticated
using (true);

create table if not exists public.government_holiday_template_sets (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year >= 2000 and year <= 9999),
  state text not null,
  source_name text not null default 'Super Admin',
  source_url text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (year, state)
);

create table if not exists public.government_holiday_template_items (
  id uuid primary key default gen_random_uuid(),
  template_set_id uuid not null references public.government_holiday_template_sets(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  scope text not null default 'state' check (scope in ('national', 'state')),
  type text not null default 'national' check (type in ('national', 'festival', 'company')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists govt_holiday_template_sets_year_state_idx
  on public.government_holiday_template_sets(year asc, state asc);

create index if not exists govt_holiday_template_items_template_idx
  on public.government_holiday_template_items(template_set_id, holiday_date asc);

alter table public.government_holiday_template_sets enable row level security;
alter table public.government_holiday_template_items enable row level security;
