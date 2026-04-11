drop policy if exists "company_holidays_select_authenticated" on public.company_holidays;
 drop policy if exists "company_holidays_insert_authenticated" on public.company_holidays;
 drop policy if exists "company_holidays_update_authenticated" on public.company_holidays;
 drop policy if exists "company_holidays_delete_authenticated" on public.company_holidays;

 create policy "company_holidays_select_authenticated"
 on public.company_holidays
 for select
 to authenticated
 using (
   exists (
     select 1
       from public.companies
      where companies.id = company_holidays.company_id
        and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
   )
 );

 create policy "company_holidays_insert_authenticated"
 on public.company_holidays
 for insert
 to authenticated
 with check (
   exists (
     select 1
       from public.companies
      where companies.id = company_holidays.company_id
        and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
   )
 );

 create policy "company_holidays_update_authenticated"
 on public.company_holidays
 for update
 to authenticated
 using (
   exists (
     select 1
       from public.companies
      where companies.id = company_holidays.company_id
        and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
   )
 )
 with check (
   exists (
     select 1
       from public.companies
      where companies.id = company_holidays.company_id
        and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
   )
 );

 create policy "company_holidays_delete_authenticated"
 on public.company_holidays
 for delete
 to authenticated
 using (
   exists (
     select 1
       from public.companies
      where companies.id = company_holidays.company_id
        and lower(coalesce(companies.admin_email, '')) = lower(coalesce(auth.email(), ''))
   )
 );;
