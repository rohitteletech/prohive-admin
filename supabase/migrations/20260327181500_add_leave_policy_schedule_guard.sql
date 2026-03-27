create or replace function public.guard_leave_policy_active_schedule()
returns trigger
language plpgsql
as $$
begin
  if new.policy_type <> 'leave' or new.status <> 'active' then
    return new;
  end if;

  if exists (
    select 1
      from public.company_policy_definitions
     where company_id = new.company_id
       and policy_type = 'leave'
       and status = 'active'
       and id <> new.id
       and effective_from = new.effective_from
  ) then
    raise exception 'Another active leave policy is already scheduled for %.', new.effective_from;
  end if;

  if new.effective_from > current_date then
    if exists (
      select 1
        from public.company_policy_definitions
       where company_id = new.company_id
         and policy_type = 'leave'
         and status = 'active'
         and id <> new.id
         and effective_from > current_date
    ) then
      raise exception 'Another future active leave policy is already scheduled for this company.';
    end if;
  else
    if exists (
      select 1
        from public.company_policy_definitions
       where company_id = new.company_id
         and policy_type = 'leave'
         and status = 'active'
         and id <> new.id
         and effective_from <= current_date
    ) then
      raise exception 'Another current active leave policy already exists for this company.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_leave_policy_active_schedule on public.company_policy_definitions;

create trigger guard_leave_policy_active_schedule
before insert or update of policy_type, status, effective_from
on public.company_policy_definitions
for each row
when (new.policy_type = 'leave' and new.status = 'active')
execute function public.guard_leave_policy_active_schedule();
