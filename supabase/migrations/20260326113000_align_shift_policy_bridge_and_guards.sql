alter table public.companies
  add column if not exists login_access_rule text not null default 'any_time'
    check (login_access_rule in ('any_time', 'shift_time_only'));

create unique index if not exists company_policy_definitions_active_default_effective_idx
  on public.company_policy_definitions(company_id, policy_type, effective_from)
  where is_default = true and status = 'active';

create or replace function public.sync_company_policy_default_flags()
returns trigger
language plpgsql
as $$
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
         (new.effective_from > current_date and effective_from = new.effective_from)
         or
         (new.effective_from <= current_date and effective_from <= new.effective_from)
       );
  end if;

  return new;
end;
$$;

drop trigger if exists sync_company_policy_default_flags on public.company_policy_definitions;

create trigger sync_company_policy_default_flags
after insert or update of is_default, status, effective_from
on public.company_policy_definitions
for each row
when (new.is_default = true and new.status = 'active')
execute function public.sync_company_policy_default_flags();
