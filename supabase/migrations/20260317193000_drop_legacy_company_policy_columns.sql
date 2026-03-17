alter table public.companies
  drop column if exists weekly_off_policy,
  drop column if exists allow_punch_on_holiday,
  drop column if exists allow_punch_on_weekly_off,
  drop column if exists extra_hours_policy,
  drop column if exists half_day_min_work_mins,
  drop column if exists late_penalty_enabled,
  drop column if exists late_penalty_up_to_mins,
  drop column if exists late_penalty_repeat_count,
  drop column if exists late_penalty_repeat_days,
  drop column if exists late_penalty_above_mins,
  drop column if exists late_penalty_above_days,
  drop column if exists login_access_rule;
