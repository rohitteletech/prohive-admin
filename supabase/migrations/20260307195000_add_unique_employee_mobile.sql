-- Enforce unique employee mobile number per company.
-- This fails intentionally if duplicates already exist, so data can be cleaned first.
do $$
begin
  if exists (
    select 1
    from public.employees
    group by company_id, mobile
    having count(*) > 1
  ) then
    raise exception 'Cannot create unique index: duplicate mobile numbers exist in employees.';
  end if;
end $$;

create unique index if not exists employees_company_id_mobile_key
  on public.employees(company_id, mobile);
