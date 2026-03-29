update public.company_policy_definitions
set config_json =
  (
    jsonb_strip_nulls(
      config_json
      || jsonb_build_object(
        'punchAccessRule',
        coalesce(config_json->>'punchAccessRule', config_json->>'loginAccessRule', 'any_time'),
        'earlyPunchAllowed',
        coalesce(config_json->>'earlyPunchAllowed', config_json->>'earlyInAllowed', '15')
      )
    )
    - 'loginAccessRule'
    - 'earlyInAllowed'
  ),
  updated_at = timezone('utc', now())
where policy_type = 'shift'
  and (
    config_json ? 'loginAccessRule'
    or config_json ? 'earlyInAllowed'
  );
