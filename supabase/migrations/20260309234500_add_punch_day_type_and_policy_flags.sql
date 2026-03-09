alter table public.companies
  add column if not exists allow_punch_on_holiday boolean not null default true,
  add column if not exists allow_punch_on_weekly_off boolean not null default true;

alter table public.attendance_punch_events
  add column if not exists day_type text not null default 'working_day'
    check (day_type in ('working_day', 'holiday', 'weekly_off')),
  add column if not exists is_extra_work boolean not null default false;