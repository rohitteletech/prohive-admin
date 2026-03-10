alter table public.companies
  add column if not exists extra_hours_policy text not null default 'yes'
    check (extra_hours_policy in ('yes', 'no'));

alter table public.companies
  drop column if exists company_logo_url,
  drop column if exists company_logo_header_url,
  drop column if exists company_tagline;
