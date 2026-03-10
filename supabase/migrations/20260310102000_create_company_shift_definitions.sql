create table if not exists public.company_shift_definitions (
  id text primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  type text not null,
  start_time text not null,
  end_time text not null,
  grace_mins integer not null default 10 check (grace_mins >= 0 and grace_mins <= 120),
  early_window_mins integer not null default 15 check (early_window_mins >= 0 and early_window_mins <= 240),
  min_work_before_out_mins integer not null default 60 check (min_work_before_out_mins >= 0 and min_work_before_out_mins <= 1440),
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists company_shift_definitions_company_idx
  on public.company_shift_definitions(company_id, active desc, name asc);

alter table public.company_shift_definitions enable row level security;

drop policy if exists "company_shift_definitions_select_authenticated" on public.company_shift_definitions;
drop policy if exists "company_shift_definitions_insert_authenticated" on public.company_shift_definitions;
drop policy if exists "company_shift_definitions_update_authenticated" on public.company_shift_definitions;
drop policy if exists "company_shift_definitions_delete_authenticated" on public.company_shift_definitions;

create policy "company_shift_definitions_select_authenticated"
on public.company_shift_definitions
for select
to authenticated
using (true);

create policy "company_shift_definitions_insert_authenticated"
on public.company_shift_definitions
for insert
to authenticated
with check (true);

create policy "company_shift_definitions_update_authenticated"
on public.company_shift_definitions
for update
to authenticated
using (true)
with check (true);

create policy "company_shift_definitions_delete_authenticated"
on public.company_shift_definitions
for delete
to authenticated
using (true);
