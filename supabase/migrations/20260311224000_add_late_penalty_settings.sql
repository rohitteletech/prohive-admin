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
