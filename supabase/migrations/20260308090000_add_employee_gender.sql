alter table public.employees
  add column if not exists gender text
  check (gender in ('male', 'female', 'other'));

