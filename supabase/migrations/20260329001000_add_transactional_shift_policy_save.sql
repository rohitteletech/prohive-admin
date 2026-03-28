create or replace function public.sync_company_policy_default_flags()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_business_date date := public.policy_business_date_india();
begin
  if new.is_default = true and new.status = 'active' then
    update public.company_policy_definitions
       set is_default = false,
           updated_at = timezone('utc', now())
     where company_id = new.company_id
       and policy_type = new.policy_type
       and id <> new.id
       and is_default = true
       and status = 'active'
       and (
         (new.effective_from > v_business_date and effective_from = new.effective_from)
         or
         (new.effective_from <= v_business_date and effective_from <= new.effective_from)
       );
  end if;

  return new;
end;
$$;

create or replace function public.guard_shift_policy_active_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_business_date date := public.policy_business_date_india();
begin
  if new.policy_type <> 'shift' or new.status <> 'active' then
    return new;
  end if;

  if exists (
    select 1
      from public.company_policy_definitions
     where company_id = new.company_id
       and policy_type = 'shift'
       and status = 'active'
       and id <> new.id
       and effective_from = new.effective_from
  ) then
    raise exception 'Another active shift policy is already scheduled for %.', new.effective_from;
  end if;

  if new.effective_from > v_business_date then
    if exists (
      select 1
        from public.company_policy_definitions
       where company_id = new.company_id
         and policy_type = 'shift'
         and status = 'active'
         and id <> new.id
         and effective_from > v_business_date
    ) then
      raise exception 'Another future active shift policy is already scheduled for this company.';
    end if;
  else
    if exists (
      select 1
        from public.company_policy_definitions
       where company_id = new.company_id
         and policy_type = 'shift'
         and status = 'active'
         and id <> new.id
         and effective_from <= v_business_date
    ) then
      raise exception 'Another current active shift policy already exists for this company.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_shift_policy_active_schedule on public.company_policy_definitions;

create trigger guard_shift_policy_active_schedule
before insert or update of policy_type, status, effective_from
on public.company_policy_definitions
for each row
when (new.policy_type = 'shift' and new.status = 'active')
execute function public.guard_shift_policy_active_schedule();

create or replace function public.save_shift_policy_definition(
  p_company_id uuid,
  p_admin_email text,
  p_policy_id uuid,
  p_policy_name text,
  p_policy_code text,
  p_status text,
  p_effective_from date,
  p_next_review_date date,
  p_default_company_policy boolean,
  p_config_json jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_existing_policy public.company_policy_definitions%rowtype;
  v_policy_id uuid;
  v_business_date date := public.policy_business_date_india();
  v_is_future_effective_active boolean := p_status = 'active' and p_effective_from > v_business_date;
  v_should_set_default boolean := coalesce(p_default_company_policy, false) and p_status = 'active';
begin
  if p_policy_id is not null then
    select *
      into v_existing_policy
      from public.company_policy_definitions
     where company_id = p_company_id
       and id = p_policy_id
       and policy_type = 'shift'
     for update;

    if not found then
      raise exception 'Shift policy not found for this company.';
    end if;
  end if;

  if p_status = 'active' then
    update public.company_policy_definitions
       set status = 'archived',
           is_default = false,
           updated_at = timezone('utc', now())
     where company_id = p_company_id
       and policy_type = 'shift'
       and status = 'active'
       and (p_policy_id is null or id <> p_policy_id)
       and (
         (v_is_future_effective_active and effective_from = p_effective_from)
         or
         (not v_is_future_effective_active and effective_from <= p_effective_from)
       );
  end if;

  if v_should_set_default then
    update public.company_policy_definitions
       set is_default = false,
           updated_at = timezone('utc', now())
     where company_id = p_company_id
       and policy_type = 'shift'
       and is_default = true
       and status = 'active'
       and (p_policy_id is null or id <> p_policy_id)
       and (
         (v_is_future_effective_active and effective_from = p_effective_from)
         or
         (not v_is_future_effective_active and effective_from <= p_effective_from)
       );
  end if;

  if p_policy_id is not null then
    update public.company_policy_definitions
       set policy_name = p_policy_name,
           policy_code = p_policy_code,
           status = p_status,
           is_default = v_should_set_default,
           effective_from = p_effective_from,
           next_review_date = p_next_review_date,
           config_json = p_config_json,
           updated_at = timezone('utc', now())
     where company_id = p_company_id
       and id = p_policy_id
     returning id into v_policy_id;
  else
    insert into public.company_policy_definitions (
      company_id,
      policy_type,
      policy_name,
      policy_code,
      status,
      is_default,
      effective_from,
      next_review_date,
      config_json,
      created_by
    )
    values (
      p_company_id,
      'shift',
      p_policy_name,
      p_policy_code,
      p_status,
      v_should_set_default,
      p_effective_from,
      p_next_review_date,
      p_config_json,
      p_admin_email
    )
    returning id into v_policy_id;
  end if;

  return v_policy_id;
end;
$$;
