create table if not exists public.employee_claim_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  claim_date date not null,
  claim_type text not null check (claim_type in ('travel', 'meal', 'misc')),
  amount numeric(12,2) not null check (amount > 0),
  reason text not null,
  attachment_url text null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_remark text null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employee_claim_requests_company_submitted
  on public.employee_claim_requests(company_id, submitted_at desc);

create index if not exists idx_employee_claim_requests_employee_submitted
  on public.employee_claim_requests(employee_id, submitted_at desc);

create index if not exists idx_employee_claim_requests_status
  on public.employee_claim_requests(company_id, status);
