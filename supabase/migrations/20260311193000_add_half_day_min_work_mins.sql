alter table public.companies
  add column if not exists half_day_min_work_mins integer not null default 240
    check (half_day_min_work_mins >= 0 and half_day_min_work_mins <= 1440);
