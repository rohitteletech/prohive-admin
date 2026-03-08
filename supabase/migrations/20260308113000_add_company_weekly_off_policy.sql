alter table public.companies
  add column if not exists weekly_off_policy text;

update public.companies
set weekly_off_policy = 'sunday_only'
where weekly_off_policy is null;

alter table public.companies
  alter column weekly_off_policy set default 'sunday_only',
  alter column weekly_off_policy set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_weekly_off_policy_check'
  ) then
    alter table public.companies
      add constraint companies_weekly_off_policy_check
      check (
        weekly_off_policy in (
          'sunday_only',
          'saturday_sunday',
          'second_fourth_saturday_sunday'
        )
      );
  end if;
end $$;
