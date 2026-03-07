alter table public.employee_claim_requests
  add column if not exists from_date date;

alter table public.employee_claim_requests
  add column if not exists to_date date;

alter table public.employee_claim_requests
  add column if not exists days integer;

update public.employee_claim_requests
set
  from_date = coalesce(from_date, claim_date),
  to_date = coalesce(to_date, claim_date),
  days = coalesce(days, 1);

alter table public.employee_claim_requests
  alter column from_date set not null;

alter table public.employee_claim_requests
  alter column to_date set not null;

alter table public.employee_claim_requests
  alter column days set not null;

alter table public.employee_claim_requests
  drop constraint if exists employee_claim_requests_period_check;

alter table public.employee_claim_requests
  add constraint employee_claim_requests_period_check
  check (to_date >= from_date and days = ((to_date - from_date) + 1));

alter table public.employee_claim_requests
  drop column if exists claim_date;
