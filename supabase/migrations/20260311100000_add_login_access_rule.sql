alter table public.companies
  add column if not exists login_access_rule text not null default 'any_time'
    check (login_access_rule in ('any_time', 'shift_time_only'));
