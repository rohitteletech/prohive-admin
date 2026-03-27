create or replace function public.guard_holiday_policy_active_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.policy_type <> 'holiday_weekoff' or new.status <> 'active' then
    return new;
  end if;

  if exists (
    select 1
      from public.company_policy_definitions
     where company_id = new.company_id
       and policy_type = 'holiday_weekoff'
       and status = 'active'
       and id <> new.id
       and effective_from = new.effective_from
  ) then
    raise exception 'Another active holiday policy is already scheduled for %.', new.effective_from;
  end if;

  if new.effective_from > current_date then
    if exists (
      select 1
        from public.company_policy_definitions
       where company_id = new.company_id
         and policy_type = 'holiday_weekoff'
         and status = 'active'
         and id <> new.id
         and effective_from > current_date
    ) then
      raise exception 'Another future active holiday policy is already scheduled for this company.';
    end if;
  else
    if exists (
      select 1
        from public.company_policy_definitions
       where company_id = new.company_id
         and policy_type = 'holiday_weekoff'
         and status = 'active'
         and id <> new.id
         and effective_from <= current_date
    ) then
      raise exception 'Another current active holiday policy already exists for this company.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_holiday_policy_active_schedule on public.company_policy_definitions;

create trigger guard_holiday_policy_active_schedule
before insert or update of policy_type, status, effective_from
on public.company_policy_definitions
for each row
when (new.policy_type = 'holiday_weekoff' and new.status = 'active')
execute function public.guard_holiday_policy_active_schedule();
