alter table public.employee_leave_requests
  add column if not exists paid_days numeric(6,2) not null default 0
  check (paid_days >= 0),
  add column if not exists unpaid_days numeric(6,2) not null default 0
  check (unpaid_days >= 0),
  add column if not exists leave_mode text not null default 'paid'
  check (leave_mode in ('paid', 'unpaid', 'mixed'));

update public.employee_leave_requests
set
  paid_days = coalesce(nullif(paid_days, 0), days),
  unpaid_days = coalesce(unpaid_days, 0),
  leave_mode = case
    when coalesce(unpaid_days, 0) > 0 and coalesce(nullif(paid_days, 0), days) > 0 then 'mixed'
    when coalesce(unpaid_days, 0) > 0 then 'unpaid'
    else 'paid'
  end
where paid_days = 0 and unpaid_days = 0;

