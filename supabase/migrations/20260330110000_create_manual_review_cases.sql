create table if not exists public.manual_review_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  case_type text not null
    check (case_type in (
      'offline_punch_review',
      'punch_on_approved_leave',
      'holiday_worked_review',
      'weekly_off_worked_review'
    )),
  source_table text not null,
  source_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'resolved')),
  title text,
  reason_codes text[] not null default '{}'::text[],
  payload_json jsonb not null default '{}'::jsonb,
  review_note text,
  resolution_action text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists manual_review_cases_pending_source_idx
  on public.manual_review_cases (source_table, source_id, case_type)
  where status = 'pending';

create index if not exists manual_review_cases_company_status_created_idx
  on public.manual_review_cases (company_id, status, created_at desc);

create index if not exists manual_review_cases_company_case_type_created_idx
  on public.manual_review_cases (company_id, case_type, created_at desc);

create index if not exists manual_review_cases_employee_created_idx
  on public.manual_review_cases (employee_id, created_at desc);

alter table public.manual_review_cases enable row level security;

drop policy if exists "manual_review_cases_select_authenticated" on public.manual_review_cases;
drop policy if exists "manual_review_cases_insert_authenticated" on public.manual_review_cases;
drop policy if exists "manual_review_cases_update_authenticated" on public.manual_review_cases;

create policy "manual_review_cases_select_authenticated"
on public.manual_review_cases
for select
to authenticated
using (
  exists (
    select 1
      from public.companies
     where companies.id = manual_review_cases.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

create policy "manual_review_cases_insert_authenticated"
on public.manual_review_cases
for insert
to authenticated
with check (
  exists (
    select 1
      from public.companies
     where companies.id = manual_review_cases.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);

create policy "manual_review_cases_update_authenticated"
on public.manual_review_cases
for update
to authenticated
using (
  exists (
    select 1
      from public.companies
     where companies.id = manual_review_cases.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
)
with check (
  exists (
    select 1
      from public.companies
     where companies.id = manual_review_cases.company_id
       and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
  )
);
