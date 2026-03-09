create table if not exists public.government_holiday_template_sets (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2000 and 2100),
  state text not null check (state in ('all_india', 'maharashtra', 'karnataka', 'gujarat', 'tamil_nadu')),
  published boolean not null default false,
  last_published_at timestamptz,
  last_updated_at timestamptz not null default now(),
  updated_by text,
  created_at timestamptz not null default now(),
  unique (year, state)
);

create table if not exists public.government_holiday_template_rows (
  id uuid primary key default gen_random_uuid(),
  template_set_id uuid not null references public.government_holiday_template_sets(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  type text not null check (type in ('national', 'festival')),
  scope text not null check (scope in ('national', 'state')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_set_id, holiday_date, name)
);

create index if not exists govt_holiday_template_sets_year_state_idx
  on public.government_holiday_template_sets(year asc, state asc);

create index if not exists govt_holiday_template_rows_set_date_idx
  on public.government_holiday_template_rows(template_set_id, holiday_date asc);

alter table public.government_holiday_template_sets enable row level security;
alter table public.government_holiday_template_rows enable row level security;
