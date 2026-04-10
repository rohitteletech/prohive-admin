alter table public.companies
  add column if not exists department_options text[] not null default '{}'::text[],
  add column if not exists designation_options text[] not null default '{}'::text[];
