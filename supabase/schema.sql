--
-- PostgreSQL database dump
--

\restrict ShJae796Ub1HtQoR2znPOCeo2eCb23TGNqqG4bbk3GRC9szIwOBcH04vZVFM2X2

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: guard_attendance_policy_active_schedule(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_attendance_policy_active_schedule() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_business_date date := public.policy_business_date_india();
begin
  if new.policy_type <> 'attendance' or new.status <> 'active' then
    return new;
  end if;

  if exists (
    select 1
      from public.company_policy_definitions
     where company_id = new.company_id
       and policy_type = 'attendance'
       and status = 'active'
       and id <> new.id
       and effective_from = new.effective_from
  ) then
    raise exception 'Another active attendance policy is already scheduled for %.', new.effective_from;
  end if;

  if new.effective_from > v_business_date then
    if exists (
      select 1
        from public.company_policy_definitions
       where company_id = new.company_id
         and policy_type = 'attendance'
         and status = 'active'
         and id <> new.id
         and effective_from > v_business_date
    ) then
      raise exception 'Another future active attendance policy is already scheduled for this company.';
    end if;
  else
    if exists (
      select 1
        from public.company_policy_definitions
       where company_id = new.company_id
         and policy_type = 'attendance'
         and status = 'active'
         and id <> new.id
         and effective_from <= v_business_date
    ) then
      raise exception 'Another current active attendance policy already exists for this company.';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: guard_correction_policy_active_schedule(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_correction_policy_active_schedule() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_business_date date := public.policy_business_date_india();
begin
  if new.policy_type <> 'correction' or new.status <> 'active' then
    return new;
  end if;

  if exists (
    select 1
      from public.company_policy_definitions
     where company_id = new.company_id
       and policy_type = 'correction'
       and status = 'active'
       and id <> new.id
       and effective_from = new.effective_from
  ) then
    raise exception 'Another active correction policy is already scheduled for %.', new.effective_from;
  end if;

  if new.effective_from > v_business_date then
    if exists (
      select 1
        from public.company_policy_definitions
       where company_id = new.company_id
         and policy_type = 'correction'
         and status = 'active'
         and id <> new.id
         and effective_from > v_business_date
    ) then
      raise exception 'Another future active correction policy is already scheduled for this company.';
    end if;
  else
    if exists (
      select 1
        from public.company_policy_definitions
       where company_id = new.company_id
         and policy_type = 'correction'
         and status = 'active'
         and id <> new.id
         and effective_from <= v_business_date
    ) then
      raise exception 'Another current active correction policy already exists for this company.';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: guard_holiday_policy_active_schedule(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_holiday_policy_active_schedule() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_business_date date := public.policy_business_date_india();
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

  if new.effective_from > v_business_date then
    if exists (
      select 1
        from public.company_policy_definitions
       where company_id = new.company_id
         and policy_type = 'holiday_weekoff'
         and status = 'active'
         and id <> new.id
         and effective_from > v_business_date
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
         and effective_from <= v_business_date
    ) then
      raise exception 'Another current active holiday policy already exists for this company.';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: guard_leave_policy_active_schedule(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_leave_policy_active_schedule() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_business_date date := public.policy_business_date_india();
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

  if new.effective_from > v_business_date then
    if exists (
      select 1
        from public.company_policy_definitions
       where company_id = new.company_id
         and policy_type = 'leave'
         and status = 'active'
         and id <> new.id
         and effective_from > v_business_date
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
         and effective_from <= v_business_date
    ) then
      raise exception 'Another current active leave policy already exists for this company.';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: guard_shift_policy_active_schedule(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_shift_policy_active_schedule() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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


--
-- Name: policy_business_date_india(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.policy_business_date_india() RETURNS date
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select (timezone('Asia/Kolkata', now()))::date;
$$;


--
-- Name: save_attendance_policy_definition(uuid, text, uuid, text, text, text, date, date, boolean, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_attendance_policy_definition(p_company_id uuid, p_admin_email text, p_policy_id uuid, p_policy_name text, p_policy_code text, p_status text, p_effective_from date, p_next_review_date date, p_default_company_policy boolean, p_config_json jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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
       and policy_type = 'attendance'
     for update;

    if not found then
      raise exception 'Attendance policy not found for this company.';
    end if;
  end if;

  if p_status = 'active' then
    update public.company_policy_definitions
       set status = 'archived',
           is_default = false,
           updated_at = timezone('utc', now())
     where company_id = p_company_id
       and policy_type = 'attendance'
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
       and policy_type = 'attendance'
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
      'attendance',
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


--
-- Name: save_correction_policy_definition(uuid, text, uuid, text, text, text, date, date, boolean, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_correction_policy_definition(p_company_id uuid, p_admin_email text, p_policy_id uuid, p_policy_name text, p_policy_code text, p_status text, p_effective_from date, p_next_review_date date, p_default_company_policy boolean, p_config_json jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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
       and policy_type = 'correction'
     for update;

    if not found then
      raise exception 'Correction policy not found for this company.';
    end if;
  end if;

  if p_status = 'active' then
    update public.company_policy_definitions
       set status = 'archived',
           is_default = false,
           updated_at = timezone('utc', now())
     where company_id = p_company_id
       and policy_type = 'correction'
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
       and policy_type = 'correction'
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
      'correction',
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


--
-- Name: save_holiday_policy_definition(uuid, text, uuid, text, text, text, date, date, boolean, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_holiday_policy_definition(p_company_id uuid, p_admin_email text, p_policy_id uuid, p_policy_name text, p_policy_code text, p_status text, p_effective_from date, p_next_review_date date, p_default_company_policy boolean, p_config_json jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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
       and policy_type = 'holiday_weekoff'
     for update;

    if not found then
      raise exception 'Holiday policy not found for this company.';
    end if;
  end if;

  if p_status = 'active' then
    update public.company_policy_definitions
       set status = 'archived',
           is_default = false,
           updated_at = timezone('utc', now())
     where company_id = p_company_id
       and policy_type = 'holiday_weekoff'
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
       and policy_type = 'holiday_weekoff'
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
      'holiday_weekoff',
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


--
-- Name: save_leave_policy_definition(uuid, text, uuid, text, text, text, date, date, boolean, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_leave_policy_definition(p_company_id uuid, p_admin_email text, p_policy_id uuid, p_policy_name text, p_policy_code text, p_status text, p_effective_from date, p_next_review_date date, p_default_company_policy boolean, p_config_json jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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

  return v_policy_id;
end;
$$;


--
-- Name: save_shift_policy_definition(uuid, text, uuid, text, text, text, date, date, boolean, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_shift_policy_definition(p_company_id uuid, p_admin_email text, p_policy_id uuid, p_policy_name text, p_policy_code text, p_status text, p_effective_from date, p_next_review_date date, p_default_company_policy boolean, p_config_json jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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


--
-- Name: sync_company_policy_default_flags(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_company_policy_default_flags() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;



--
-- Name: attendance_punch_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_punch_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    event_id uuid NOT NULL,
    source text DEFAULT 'mobile'::text NOT NULL,
    punch_type text NOT NULL,
    attendance_mode_snapshot text NOT NULL,
    office_lat_snapshot double precision,
    office_lon_snapshot double precision,
    office_radius_m_snapshot integer,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    address_text text,
    accuracy_m double precision NOT NULL,
    distance_from_office_m double precision,
    is_offline boolean DEFAULT false NOT NULL,
    device_time_ms bigint NOT NULL,
    device_time_at timestamp with time zone,
    estimated_time_ms bigint,
    estimated_time_at timestamp with time zone,
    trusted_anchor_time_ms bigint,
    trusted_anchor_time_at timestamp with time zone,
    trusted_anchor_elapsed_ms bigint,
    elapsed_ms bigint NOT NULL,
    clock_drift_ms bigint,
    server_received_at timestamp with time zone DEFAULT now() NOT NULL,
    effective_punch_at timestamp with time zone,
    requires_approval boolean DEFAULT false NOT NULL,
    approval_status text DEFAULT 'auto_approved'::text NOT NULL,
    approval_reason_codes text[] DEFAULT '{}'::text[] NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    device_id text,
    company_name_snapshot text,
    employee_name_snapshot text,
    day_type text DEFAULT 'working_day'::text NOT NULL,
    is_extra_work boolean DEFAULT false NOT NULL,
    CONSTRAINT attendance_punch_events_approval_status_check CHECK ((approval_status = ANY (ARRAY['auto_approved'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT attendance_punch_events_attendance_mode_snapshot_check CHECK ((attendance_mode_snapshot = ANY (ARRAY['office_only'::text, 'field_staff'::text]))),
    CONSTRAINT attendance_punch_events_day_type_check CHECK ((day_type = ANY (ARRAY['working_day'::text, 'holiday'::text, 'weekly_off'::text]))),
    CONSTRAINT attendance_punch_events_punch_type_check CHECK ((punch_type = ANY (ARRAY['in'::text, 'out'::text]))),
    CONSTRAINT attendance_punch_events_source_check CHECK ((source = 'mobile'::text))
);


--
-- Name: attendance_punch_events_ordered; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.attendance_punch_events_ordered WITH (security_invoker='true') AS
 SELECT company_name_snapshot,
    employee_name_snapshot,
    company_id,
    employee_id,
    device_id,
    event_id,
    source,
    punch_type,
    attendance_mode_snapshot,
    office_lat_snapshot,
    office_lon_snapshot,
    office_radius_m_snapshot,
    lat,
    lon,
    address_text,
    accuracy_m,
    distance_from_office_m,
    is_offline,
    device_time_ms,
    device_time_at,
    estimated_time_ms,
    estimated_time_at,
    trusted_anchor_time_ms,
    trusted_anchor_time_at,
    trusted_anchor_elapsed_ms,
    elapsed_ms,
    clock_drift_ms,
    server_received_at,
    effective_punch_at,
    requires_approval,
    approval_status,
    approval_reason_codes,
    raw_payload,
    created_at,
    id,
    day_type,
    is_extra_work
   FROM public.attendance_punch_events;


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    code text,
    plan_type text,
    plan_start date,
    plan_end date,
    status text,
    size_of_employees text,
    authorized_name text,
    mobile text,
    address text,
    city text,
    state text,
    country text,
    pin_code text,
    admin_email text,
    admin_password text,
    gst text,
    business_nature text,
    office_lat double precision,
    office_lon double precision,
    office_radius_m integer,
    company_tagline text,
    CONSTRAINT companies_plan_type_check CHECK ((plan_type = ANY (ARRAY['trial'::text, 'monthly'::text, 'yearly'::text]))),
    CONSTRAINT companies_status_check CHECK ((status = ANY (ARRAY['trial_active'::text, 'paid_active'::text, 'grace_paid'::text, 'suspended'::text])))
);


--
-- Name: company_holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_holidays (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    holiday_date date NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT company_holidays_type_check CHECK ((type = ANY (ARRAY['national'::text, 'festival'::text, 'company'::text])))
);


--
-- Name: company_policy_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_policy_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    policy_type text NOT NULL,
    policy_id uuid NOT NULL,
    assignment_level text NOT NULL,
    target_id text NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    is_active boolean DEFAULT true NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT company_policy_assignments_date_check CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))),
    CONSTRAINT company_policy_assignments_level_check CHECK ((assignment_level = ANY (ARRAY['company'::text, 'department'::text, 'employee'::text]))),
    CONSTRAINT company_policy_assignments_type_check CHECK ((policy_type = ANY (ARRAY['shift'::text, 'attendance'::text, 'leave'::text, 'holiday_weekoff'::text, 'correction'::text])))
);


--
-- Name: company_policy_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_policy_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    policy_type text NOT NULL,
    policy_name text NOT NULL,
    policy_code text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    effective_from date NOT NULL,
    next_review_date date NOT NULL,
    config_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT company_policy_definitions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]))),
    CONSTRAINT company_policy_definitions_type_check CHECK ((policy_type = ANY (ARRAY['shift'::text, 'attendance'::text, 'leave'::text, 'holiday_weekoff'::text, 'correction'::text])))
);


--
-- Name: employee_attendance_correction_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_attendance_correction_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    correction_id uuid,
    company_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    action text NOT NULL,
    old_status text,
    new_status text,
    old_requested_check_in time without time zone,
    new_requested_check_in time without time zone,
    old_requested_check_out time without time zone,
    new_requested_check_out time without time zone,
    reason_snapshot text,
    performed_by text NOT NULL,
    performed_role text NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employee_attendance_correction_audit_logs_action_check CHECK ((action = ANY (ARRAY['submitted'::text, 'reviewed'::text, 'auto_rejected'::text, 'blocked_monthly_limit'::text]))),
    CONSTRAINT employee_attendance_correction_audit_logs_performed_role_check CHECK ((performed_role = ANY (ARRAY['employee'::text, 'company_admin'::text, 'system'::text])))
);


--
-- Name: employee_attendance_corrections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_attendance_corrections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    correction_date date NOT NULL,
    requested_check_in time without time zone,
    requested_check_out time without time zone,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    admin_remark text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employee_attendance_corrections_reason_len_check CHECK (((char_length(btrim(reason)) >= 10) AND (char_length(btrim(reason)) <= 300))),
    CONSTRAINT employee_attendance_corrections_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'pending_manager'::text, 'pending_hr'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT employee_attendance_corrections_time_order_check CHECK (((requested_check_in IS NULL) OR (requested_check_out IS NULL) OR (requested_check_out > requested_check_in))),
    CONSTRAINT employee_attendance_corrections_time_required_check CHECK (((requested_check_in IS NOT NULL) OR (requested_check_out IS NOT NULL)))
);


--
-- Name: employee_claim_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_claim_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    claim_type text NOT NULL,
    amount numeric(12,2) NOT NULL,
    reason text NOT NULL,
    attachment_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    admin_remark text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    claim_type_other_text text,
    from_date date NOT NULL,
    to_date date NOT NULL,
    days integer NOT NULL,
    CONSTRAINT employee_claim_requests_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT employee_claim_requests_claim_type_check CHECK ((claim_type = ANY (ARRAY['travel'::text, 'meal'::text, 'misc'::text, 'other'::text]))),
    CONSTRAINT employee_claim_requests_not_future_check CHECK (((from_date <= ((now() AT TIME ZONE 'Asia/Kolkata'::text))::date) AND (to_date <= ((now() AT TIME ZONE 'Asia/Kolkata'::text))::date))),
    CONSTRAINT employee_claim_requests_other_type_text_check CHECK (((claim_type <> 'other'::text) OR (NULLIF(btrim(claim_type_other_text), ''::text) IS NOT NULL))),
    CONSTRAINT employee_claim_requests_period_check CHECK (((to_date >= from_date) AND (days = ((to_date - from_date) + 1)))),
    CONSTRAINT employee_claim_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: employee_leave_balance_override_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_leave_balance_override_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    override_id uuid,
    company_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    leave_policy_code text NOT NULL,
    year integer NOT NULL,
    action text NOT NULL,
    old_extra_days numeric(6,2),
    new_extra_days numeric(6,2),
    reason text,
    changed_by text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employee_leave_balance_override_audit_logs_action_check CHECK ((action = ANY (ARRAY['created'::text, 'updated'::text, 'deleted'::text])))
);


--
-- Name: employee_leave_balance_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_leave_balance_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    leave_policy_code text NOT NULL,
    year integer NOT NULL,
    extra_days numeric(6,2) DEFAULT 0 NOT NULL,
    reason text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employee_leave_balance_overrides_year_check CHECK (((year >= 2000) AND (year <= 2100)))
);


--
-- Name: employee_leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_leave_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    leave_policy_code text NOT NULL,
    leave_name_snapshot text NOT NULL,
    from_date date NOT NULL,
    to_date date NOT NULL,
    days numeric(6,2) NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    admin_remark text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_days numeric(6,2) DEFAULT 0 NOT NULL,
    unpaid_days numeric(6,2) DEFAULT 0 NOT NULL,
    leave_mode text DEFAULT 'paid'::text NOT NULL,
    approval_flow_snapshot text DEFAULT 'manager_hr'::text NOT NULL,
    CONSTRAINT employee_leave_requests_approval_flow_snapshot_check CHECK ((approval_flow_snapshot = ANY (ARRAY['manager'::text, 'manager_hr'::text, 'hr'::text]))),
    CONSTRAINT employee_leave_requests_days_check CHECK ((days > (0)::numeric)),
    CONSTRAINT employee_leave_requests_leave_mode_check CHECK ((leave_mode = ANY (ARRAY['paid'::text, 'unpaid'::text, 'mixed'::text]))),
    CONSTRAINT employee_leave_requests_paid_days_check CHECK ((paid_days >= (0)::numeric)),
    CONSTRAINT employee_leave_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'pending_manager'::text, 'pending_hr'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT employee_leave_requests_unpaid_days_check CHECK ((unpaid_days >= (0)::numeric))
);


--
-- Name: employee_login_otps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_login_otps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    employee_code text NOT NULL,
    mobile text NOT NULL,
    purpose text NOT NULL,
    otp_code text NOT NULL,
    requested_device_id text NOT NULL,
    requested_device_name text,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employee_login_otps_purpose_check CHECK ((purpose = ANY (ARRAY['first_login'::text, 'reset_pin'::text])))
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid,
    employee_code text NOT NULL,
    mobile text NOT NULL,
    pin_hash text,
    device_id text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    full_name text,
    email text,
    designation text,
    dob date,
    shift_name text,
    status text DEFAULT 'active'::text,
    joined_on date,
    reporting_manager text,
    perm_address text,
    temp_address text,
    pan text,
    aadhaar_number text,
    emergency_name text,
    emergency_mobile text,
    employment_type text,
    exit_date date,
    updated_at timestamp with time zone DEFAULT now(),
    department text,
    mobile_app_status text DEFAULT 'invited'::text NOT NULL,
    mobile_verified_at timestamp with time zone,
    app_pin_hash text,
    bound_device_id text,
    bound_device_name text,
    bound_device_at timestamp with time zone,
    mobile_last_login_at timestamp with time zone,
    bound_app_version text,
    attendance_mode text DEFAULT 'field_staff'::text NOT NULL,
    gender text,
    CONSTRAINT employees_attendance_mode_check CHECK ((attendance_mode = ANY (ARRAY['office_only'::text, 'field_staff'::text]))),
    CONSTRAINT employees_gender_check CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text]))),
    CONSTRAINT employees_mobile_app_status_check CHECK ((mobile_app_status = ANY (ARRAY['invited'::text, 'active'::text, 'blocked'::text]))),
    CONSTRAINT employees_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: government_holiday_template_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.government_holiday_template_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_set_id uuid NOT NULL,
    holiday_date date NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    scope text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT government_holiday_template_rows_scope_check CHECK ((scope = ANY (ARRAY['national'::text, 'state'::text]))),
    CONSTRAINT government_holiday_template_rows_type_check CHECK ((type = ANY (ARRAY['national'::text, 'festival'::text])))
);


--
-- Name: government_holiday_template_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.government_holiday_template_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    year integer NOT NULL,
    state text NOT NULL,
    published boolean DEFAULT false NOT NULL,
    last_published_at timestamp with time zone,
    last_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT government_holiday_template_sets_state_check CHECK ((state = ANY (ARRAY['all_india'::text, 'maharashtra'::text, 'karnataka'::text, 'gujarat'::text, 'tamil_nadu'::text]))),
    CONSTRAINT government_holiday_template_sets_year_check CHECK (((year >= 2000) AND (year <= 2100)))
);




--
-- Name: attendance_punch_events attendance_punch_events_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_punch_events
    ADD CONSTRAINT attendance_punch_events_event_id_key UNIQUE (event_id);


--
-- Name: attendance_punch_events attendance_punch_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_punch_events
    ADD CONSTRAINT attendance_punch_events_pkey PRIMARY KEY (id);


--
-- Name: companies companies_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_code_key UNIQUE (code);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_holidays company_holidays_company_id_holiday_date_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_holidays
    ADD CONSTRAINT company_holidays_company_id_holiday_date_name_key UNIQUE (company_id, holiday_date, name);


--
-- Name: company_holidays company_holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_holidays
    ADD CONSTRAINT company_holidays_pkey PRIMARY KEY (id);


--
-- Name: company_policy_assignments company_policy_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_policy_assignments
    ADD CONSTRAINT company_policy_assignments_pkey PRIMARY KEY (id);


--
-- Name: company_policy_definitions company_policy_definitions_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_policy_definitions
    ADD CONSTRAINT company_policy_definitions_code_unique UNIQUE (company_id, policy_type, policy_code);


--
-- Name: company_policy_definitions company_policy_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_policy_definitions
    ADD CONSTRAINT company_policy_definitions_pkey PRIMARY KEY (id);


--
-- Name: employee_attendance_correction_audit_logs employee_attendance_correction_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_attendance_correction_audit_logs
    ADD CONSTRAINT employee_attendance_correction_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: employee_attendance_corrections employee_attendance_corrections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_attendance_corrections
    ADD CONSTRAINT employee_attendance_corrections_pkey PRIMARY KEY (id);


--
-- Name: employee_claim_requests employee_claim_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_claim_requests
    ADD CONSTRAINT employee_claim_requests_pkey PRIMARY KEY (id);


--
-- Name: employee_leave_balance_overrides employee_leave_balance_overri_company_id_employee_id_leave__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_leave_balance_overrides
    ADD CONSTRAINT employee_leave_balance_overri_company_id_employee_id_leave__key UNIQUE (company_id, employee_id, leave_policy_code, year);


--
-- Name: employee_leave_balance_override_audit_logs employee_leave_balance_override_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_leave_balance_override_audit_logs
    ADD CONSTRAINT employee_leave_balance_override_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: employee_leave_balance_overrides employee_leave_balance_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_leave_balance_overrides
    ADD CONSTRAINT employee_leave_balance_overrides_pkey PRIMARY KEY (id);


--
-- Name: employee_leave_requests employee_leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_leave_requests
    ADD CONSTRAINT employee_leave_requests_pkey PRIMARY KEY (id);


--
-- Name: employee_login_otps employee_login_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_login_otps
    ADD CONSTRAINT employee_login_otps_pkey PRIMARY KEY (id);


--
-- Name: employees employees_company_id_emp_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_company_id_emp_code_key UNIQUE (company_id, employee_code);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: government_holiday_template_rows government_holiday_template_r_template_set_id_holiday_date__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.government_holiday_template_rows
    ADD CONSTRAINT government_holiday_template_r_template_set_id_holiday_date__key UNIQUE (template_set_id, holiday_date, name);


--
-- Name: government_holiday_template_rows government_holiday_template_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.government_holiday_template_rows
    ADD CONSTRAINT government_holiday_template_rows_pkey PRIMARY KEY (id);


--
-- Name: government_holiday_template_sets government_holiday_template_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.government_holiday_template_sets
    ADD CONSTRAINT government_holiday_template_sets_pkey PRIMARY KEY (id);


--
-- Name: government_holiday_template_sets government_holiday_template_sets_year_state_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.government_holiday_template_sets
    ADD CONSTRAINT government_holiday_template_sets_year_state_key UNIQUE (year, state);




--
-- Name: attendance_punch_events_company_employee_device_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_punch_events_company_employee_device_idx ON public.attendance_punch_events USING btree (company_id, employee_id, device_id, server_received_at DESC);


--
-- Name: attendance_punch_events_company_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_punch_events_company_employee_idx ON public.attendance_punch_events USING btree (company_id, employee_id, server_received_at DESC);


--
-- Name: attendance_punch_events_company_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_punch_events_company_status_idx ON public.attendance_punch_events USING btree (company_id, approval_status, server_received_at DESC);


--
-- Name: attendance_punch_events_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_punch_events_employee_id_idx ON public.attendance_punch_events USING btree (employee_id);


--
-- Name: companies_admin_email_norm_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX companies_admin_email_norm_uniq ON public.companies USING btree (lower(TRIM(BOTH FROM admin_email))) WHERE (admin_email IS NOT NULL);


--
-- Name: company_holidays_company_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_holidays_company_date_idx ON public.company_holidays USING btree (company_id, holiday_date);


--
-- Name: company_policy_assignments_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_policy_assignments_company_idx ON public.company_policy_assignments USING btree (company_id, policy_type, assignment_level, target_id, is_active DESC, effective_from DESC);


--
-- Name: company_policy_assignments_policy_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_policy_assignments_policy_id_idx ON public.company_policy_assignments USING btree (policy_id);


--
-- Name: company_policy_definitions_active_default_effective_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX company_policy_definitions_active_default_effective_idx ON public.company_policy_definitions USING btree (company_id, policy_type, effective_from) WHERE ((is_default = true) AND (status = 'active'::text));


--
-- Name: company_policy_definitions_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_policy_definitions_company_idx ON public.company_policy_definitions USING btree (company_id, policy_type, status, is_default DESC);


--
-- Name: employee_attendance_correction_audit_logs_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_attendance_correction_audit_logs_company_idx ON public.employee_attendance_correction_audit_logs USING btree (company_id, created_at DESC);


--
-- Name: employee_attendance_correction_audit_logs_correction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_attendance_correction_audit_logs_correction_idx ON public.employee_attendance_correction_audit_logs USING btree (correction_id, created_at DESC);


--
-- Name: employee_attendance_correction_audit_logs_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_attendance_correction_audit_logs_employee_id_idx ON public.employee_attendance_correction_audit_logs USING btree (employee_id);


--
-- Name: employee_attendance_corrections_company_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_attendance_corrections_company_employee_idx ON public.employee_attendance_corrections USING btree (company_id, employee_id, submitted_at DESC);


--
-- Name: employee_attendance_corrections_company_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_attendance_corrections_company_status_idx ON public.employee_attendance_corrections USING btree (company_id, status, submitted_at DESC);


--
-- Name: employee_attendance_corrections_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_attendance_corrections_employee_id_idx ON public.employee_attendance_corrections USING btree (employee_id);


--
-- Name: employee_attendance_corrections_pending_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employee_attendance_corrections_pending_unique_idx ON public.employee_attendance_corrections USING btree (company_id, employee_id, correction_date) WHERE (status = ANY (ARRAY['pending'::text, 'pending_manager'::text, 'pending_hr'::text]));


--
-- Name: employee_leave_balance_override_audit_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_leave_balance_override_audit_company_idx ON public.employee_leave_balance_override_audit_logs USING btree (company_id, changed_at DESC);


--
-- Name: employee_leave_balance_override_audit_logs_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_leave_balance_override_audit_logs_employee_id_idx ON public.employee_leave_balance_override_audit_logs USING btree (employee_id);


--
-- Name: employee_leave_balance_override_audit_logs_override_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_leave_balance_override_audit_logs_override_id_idx ON public.employee_leave_balance_override_audit_logs USING btree (override_id);


--
-- Name: employee_leave_balance_overrides_company_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_leave_balance_overrides_company_year_idx ON public.employee_leave_balance_overrides USING btree (company_id, year DESC, employee_id);


--
-- Name: employee_leave_balance_overrides_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_leave_balance_overrides_employee_id_idx ON public.employee_leave_balance_overrides USING btree (employee_id);


--
-- Name: employee_leave_requests_company_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_leave_requests_company_employee_idx ON public.employee_leave_requests USING btree (company_id, employee_id, submitted_at DESC);


--
-- Name: employee_leave_requests_company_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_leave_requests_company_status_idx ON public.employee_leave_requests USING btree (company_id, status, submitted_at DESC);


--
-- Name: employee_leave_requests_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_leave_requests_employee_id_idx ON public.employee_leave_requests USING btree (employee_id);


--
-- Name: employee_login_otps_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_login_otps_employee_id_idx ON public.employee_login_otps USING btree (employee_id, created_at DESC);


--
-- Name: employees_company_code_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_company_code_uniq ON public.employees USING btree (company_id, employee_code);


--
-- Name: employees_company_id_mobile_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_company_id_mobile_key ON public.employees USING btree (company_id, mobile);


--
-- Name: govt_holiday_template_rows_set_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX govt_holiday_template_rows_set_date_idx ON public.government_holiday_template_rows USING btree (template_set_id, holiday_date);


--
-- Name: govt_holiday_template_sets_year_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX govt_holiday_template_sets_year_state_idx ON public.government_holiday_template_sets USING btree (year, state);


--
-- Name: idx_employee_claim_requests_company_submitted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_claim_requests_company_submitted ON public.employee_claim_requests USING btree (company_id, submitted_at DESC);


--
-- Name: idx_employee_claim_requests_employee_submitted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_claim_requests_employee_submitted ON public.employee_claim_requests USING btree (employee_id, submitted_at DESC);


--
-- Name: idx_employee_claim_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_claim_requests_status ON public.employee_claim_requests USING btree (company_id, status);


--
-- Name: company_policy_definitions guard_attendance_policy_active_schedule; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_attendance_policy_active_schedule BEFORE INSERT OR UPDATE OF policy_type, status, effective_from ON public.company_policy_definitions FOR EACH ROW WHEN (((new.policy_type = 'attendance'::text) AND (new.status = 'active'::text))) EXECUTE FUNCTION public.guard_attendance_policy_active_schedule();


--
-- Name: company_policy_definitions guard_correction_policy_active_schedule; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_correction_policy_active_schedule BEFORE INSERT OR UPDATE OF policy_type, status, effective_from ON public.company_policy_definitions FOR EACH ROW WHEN (((new.policy_type = 'correction'::text) AND (new.status = 'active'::text))) EXECUTE FUNCTION public.guard_correction_policy_active_schedule();


--
-- Name: company_policy_definitions guard_holiday_policy_active_schedule; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_holiday_policy_active_schedule BEFORE INSERT OR UPDATE OF policy_type, status, effective_from ON public.company_policy_definitions FOR EACH ROW WHEN (((new.policy_type = 'holiday_weekoff'::text) AND (new.status = 'active'::text))) EXECUTE FUNCTION public.guard_holiday_policy_active_schedule();


--
-- Name: company_policy_definitions guard_leave_policy_active_schedule; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_leave_policy_active_schedule BEFORE INSERT OR UPDATE OF policy_type, status, effective_from ON public.company_policy_definitions FOR EACH ROW WHEN (((new.policy_type = 'leave'::text) AND (new.status = 'active'::text))) EXECUTE FUNCTION public.guard_leave_policy_active_schedule();


--
-- Name: company_policy_definitions guard_shift_policy_active_schedule; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_shift_policy_active_schedule BEFORE INSERT OR UPDATE OF policy_type, status, effective_from ON public.company_policy_definitions FOR EACH ROW WHEN (((new.policy_type = 'shift'::text) AND (new.status = 'active'::text))) EXECUTE FUNCTION public.guard_shift_policy_active_schedule();


--
-- Name: company_policy_definitions sync_company_policy_default_flags; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_company_policy_default_flags AFTER INSERT OR UPDATE OF is_default, status, effective_from ON public.company_policy_definitions FOR EACH ROW WHEN (((new.is_default = true) AND (new.status = 'active'::text))) EXECUTE FUNCTION public.sync_company_policy_default_flags();




--
-- Name: attendance_punch_events attendance_punch_events_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_punch_events
    ADD CONSTRAINT attendance_punch_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: attendance_punch_events attendance_punch_events_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_punch_events
    ADD CONSTRAINT attendance_punch_events_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: company_holidays company_holidays_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_holidays
    ADD CONSTRAINT company_holidays_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_policy_assignments company_policy_assignments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_policy_assignments
    ADD CONSTRAINT company_policy_assignments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_policy_assignments company_policy_assignments_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_policy_assignments
    ADD CONSTRAINT company_policy_assignments_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.company_policy_definitions(id) ON DELETE CASCADE;


--
-- Name: company_policy_definitions company_policy_definitions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_policy_definitions
    ADD CONSTRAINT company_policy_definitions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: employee_attendance_correction_audit_logs employee_attendance_correction_audit_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_attendance_correction_audit_logs
    ADD CONSTRAINT employee_attendance_correction_audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: employee_attendance_correction_audit_logs employee_attendance_correction_audit_logs_correction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_attendance_correction_audit_logs
    ADD CONSTRAINT employee_attendance_correction_audit_logs_correction_id_fkey FOREIGN KEY (correction_id) REFERENCES public.employee_attendance_corrections(id) ON DELETE CASCADE;


--
-- Name: employee_attendance_correction_audit_logs employee_attendance_correction_audit_logs_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_attendance_correction_audit_logs
    ADD CONSTRAINT employee_attendance_correction_audit_logs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_attendance_corrections employee_attendance_corrections_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_attendance_corrections
    ADD CONSTRAINT employee_attendance_corrections_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: employee_attendance_corrections employee_attendance_corrections_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_attendance_corrections
    ADD CONSTRAINT employee_attendance_corrections_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_claim_requests employee_claim_requests_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_claim_requests
    ADD CONSTRAINT employee_claim_requests_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: employee_claim_requests employee_claim_requests_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_claim_requests
    ADD CONSTRAINT employee_claim_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_leave_balance_override_audit_logs employee_leave_balance_override_audit_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_leave_balance_override_audit_logs
    ADD CONSTRAINT employee_leave_balance_override_audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: employee_leave_balance_override_audit_logs employee_leave_balance_override_audit_logs_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_leave_balance_override_audit_logs
    ADD CONSTRAINT employee_leave_balance_override_audit_logs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_leave_balance_override_audit_logs employee_leave_balance_override_audit_logs_override_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_leave_balance_override_audit_logs
    ADD CONSTRAINT employee_leave_balance_override_audit_logs_override_id_fkey FOREIGN KEY (override_id) REFERENCES public.employee_leave_balance_overrides(id) ON DELETE SET NULL;


--
-- Name: employee_leave_balance_overrides employee_leave_balance_overrides_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_leave_balance_overrides
    ADD CONSTRAINT employee_leave_balance_overrides_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: employee_leave_balance_overrides employee_leave_balance_overrides_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_leave_balance_overrides
    ADD CONSTRAINT employee_leave_balance_overrides_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_leave_requests employee_leave_requests_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_leave_requests
    ADD CONSTRAINT employee_leave_requests_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: employee_leave_requests employee_leave_requests_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_leave_requests
    ADD CONSTRAINT employee_leave_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_login_otps employee_login_otps_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_login_otps
    ADD CONSTRAINT employee_login_otps_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employees employees_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: government_holiday_template_rows government_holiday_template_rows_template_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.government_holiday_template_rows
    ADD CONSTRAINT government_holiday_template_rows_template_set_id_fkey FOREIGN KEY (template_set_id) REFERENCES public.government_holiday_template_sets(id) ON DELETE CASCADE;




--
-- Name: attendance_punch_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_punch_events ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_punch_events attendance_punch_events_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_punch_events_insert_authenticated ON public.attendance_punch_events FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: attendance_punch_events attendance_punch_events_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_punch_events_select_authenticated ON public.attendance_punch_events FOR SELECT TO authenticated USING (true);


--
-- Name: attendance_punch_events attendance_punch_events_update_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_punch_events_update_authenticated ON public.attendance_punch_events FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: companies companies_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_insert_authenticated ON public.companies FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: companies companies_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_select_authenticated ON public.companies FOR SELECT TO authenticated USING (true);


--
-- Name: company_holidays; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;

--
-- Name: company_holidays company_holidays_delete_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_holidays_delete_authenticated ON public.company_holidays FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = company_holidays.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: company_holidays company_holidays_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_holidays_insert_authenticated ON public.company_holidays FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = company_holidays.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: company_holidays company_holidays_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_holidays_select_authenticated ON public.company_holidays FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = company_holidays.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: company_holidays company_holidays_update_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_holidays_update_authenticated ON public.company_holidays FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = company_holidays.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = company_holidays.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: company_policy_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_policy_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: company_policy_assignments company_policy_assignments_delete_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_policy_assignments_delete_authenticated ON public.company_policy_assignments FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = company_policy_assignments.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: company_policy_assignments company_policy_assignments_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_policy_assignments_insert_authenticated ON public.company_policy_assignments FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = company_policy_assignments.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: company_policy_assignments company_policy_assignments_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_policy_assignments_select_authenticated ON public.company_policy_assignments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = company_policy_assignments.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: company_policy_assignments company_policy_assignments_update_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_policy_assignments_update_authenticated ON public.company_policy_assignments FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = company_policy_assignments.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = company_policy_assignments.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: company_policy_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_policy_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: company_policy_definitions company_policy_definitions_delete_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_policy_definitions_delete_authenticated ON public.company_policy_definitions FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = company_policy_definitions.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: company_policy_definitions company_policy_definitions_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_policy_definitions_insert_authenticated ON public.company_policy_definitions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = company_policy_definitions.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: company_policy_definitions company_policy_definitions_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_policy_definitions_select_authenticated ON public.company_policy_definitions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = company_policy_definitions.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: company_policy_definitions company_policy_definitions_update_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_policy_definitions_update_authenticated ON public.company_policy_definitions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = company_policy_definitions.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = company_policy_definitions.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: employee_attendance_correction_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_attendance_correction_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_attendance_correction_audit_logs employee_attendance_correction_audit_logs_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_attendance_correction_audit_logs_insert_authenticated ON public.employee_attendance_correction_audit_logs FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = employee_attendance_correction_audit_logs.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: employee_attendance_correction_audit_logs employee_attendance_correction_audit_logs_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_attendance_correction_audit_logs_select_authenticated ON public.employee_attendance_correction_audit_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = employee_attendance_correction_audit_logs.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: employee_attendance_corrections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_attendance_corrections ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_attendance_corrections employee_attendance_corrections_delete_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_attendance_corrections_delete_authenticated ON public.employee_attendance_corrections FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = employee_attendance_corrections.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: employee_attendance_corrections employee_attendance_corrections_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_attendance_corrections_insert_authenticated ON public.employee_attendance_corrections FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = employee_attendance_corrections.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: employee_attendance_corrections employee_attendance_corrections_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_attendance_corrections_select_authenticated ON public.employee_attendance_corrections FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = employee_attendance_corrections.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: employee_attendance_corrections employee_attendance_corrections_update_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_attendance_corrections_update_authenticated ON public.employee_attendance_corrections FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = employee_attendance_corrections.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = employee_attendance_corrections.company_id) AND (lower(COALESCE(companies.admin_email, ''::text)) = lower(COALESCE(auth.email(), ''::text)))))));


--
-- Name: employee_claim_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_claim_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_leave_balance_override_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_leave_balance_override_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_leave_balance_override_audit_logs employee_leave_balance_override_audit_logs_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_leave_balance_override_audit_logs_insert_authenticated ON public.employee_leave_balance_override_audit_logs FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: employee_leave_balance_override_audit_logs employee_leave_balance_override_audit_logs_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_leave_balance_override_audit_logs_select_authenticated ON public.employee_leave_balance_override_audit_logs FOR SELECT TO authenticated USING (true);


--
-- Name: employee_leave_balance_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_leave_balance_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_leave_balance_overrides employee_leave_balance_overrides_delete_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_leave_balance_overrides_delete_authenticated ON public.employee_leave_balance_overrides FOR DELETE TO authenticated USING (true);


--
-- Name: employee_leave_balance_overrides employee_leave_balance_overrides_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_leave_balance_overrides_insert_authenticated ON public.employee_leave_balance_overrides FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: employee_leave_balance_overrides employee_leave_balance_overrides_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_leave_balance_overrides_select_authenticated ON public.employee_leave_balance_overrides FOR SELECT TO authenticated USING (true);


--
-- Name: employee_leave_balance_overrides employee_leave_balance_overrides_update_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_leave_balance_overrides_update_authenticated ON public.employee_leave_balance_overrides FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: employee_leave_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_leave_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_leave_requests employee_leave_requests_delete_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_leave_requests_delete_authenticated ON public.employee_leave_requests FOR DELETE TO authenticated USING (true);


--
-- Name: employee_leave_requests employee_leave_requests_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_leave_requests_insert_authenticated ON public.employee_leave_requests FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: employee_leave_requests employee_leave_requests_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_leave_requests_select_authenticated ON public.employee_leave_requests FOR SELECT TO authenticated USING (true);


--
-- Name: employee_leave_requests employee_leave_requests_update_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_leave_requests_update_authenticated ON public.employee_leave_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: employee_login_otps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_login_otps ENABLE ROW LEVEL SECURITY;

--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: employees employees_delete_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_delete_authenticated ON public.employees FOR DELETE TO authenticated USING (true);


--
-- Name: employees employees_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_insert_authenticated ON public.employees FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: employees employees_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_select_authenticated ON public.employees FOR SELECT TO authenticated USING (true);


--
-- Name: employees employees_update_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_update_authenticated ON public.employees FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: government_holiday_template_rows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.government_holiday_template_rows ENABLE ROW LEVEL SECURITY;

--
-- Name: government_holiday_template_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.government_holiday_template_sets ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict ShJae796Ub1HtQoR2znPOCeo2eCb23TGNqqG4bbk3GRC9szIwOBcH04vZVFM2X2

