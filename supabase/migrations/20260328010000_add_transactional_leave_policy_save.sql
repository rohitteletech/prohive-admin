create or replace function public.save_leave_policy_definition(
  p_company_id uuid,
  p_admin_email text,
  p_policy_id uuid,
  p_policy_name text,
  p_policy_code text,
  p_status text,
  p_effective_from date,
  p_next_review_date date,
  p_default_company_policy boolean,
  p_config_json jsonb,
  p_legacy_leave_rows jsonb
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
  if jsonb_typeof(coalesce(p_legacy_leave_rows, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_legacy_leave_rows, '[]'::jsonb)) = 0 then
    raise exception 'At least one legacy leave row is required.';
  end if;

  if p_policy_id is not null then
    select *
      into v_existing_policy
      from public.company_policy_definitions
     where company_id = p_company_id
       and id = p_policy_id
       and policy_type = 'leave'
     for update;

    if not found then
      raise exception 'Leave policy not found for this company.';
    end if;
  end if;

  if p_status = 'active' then
    update public.company_policy_definitions
       set status = 'archived',
           is_default = false,
           updated_at = timezone('utc', now())
     where company_id = p_company_id
       and policy_type = 'leave'
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
       and policy_type = 'leave'
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
      'leave',
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

  delete from public.company_leave_policies
   where company_id = p_company_id;

  insert into public.company_leave_policies (
    company_id,
    name,
    code,
    annual_quota,
    carry_forward,
    accrual_mode,
    encashable,
    active
  )
  select
    p_company_id,
    row_data.name,
    row_data.code,
    row_data.annual_quota,
    row_data.carry_forward,
    row_data.accrual_mode,
    row_data.encashable,
    row_data.active
  from jsonb_to_recordset(p_legacy_leave_rows) as row_data(
    name text,
    code text,
    annual_quota integer,
    carry_forward integer,
    accrual_mode text,
    encashable boolean,
    active boolean
  );

  return v_policy_id;
end;
$$;
