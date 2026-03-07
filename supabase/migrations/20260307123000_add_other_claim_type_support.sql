alter table public.employee_claim_requests
  add column if not exists claim_type_other_text text null;

alter table public.employee_claim_requests
  drop constraint if exists employee_claim_requests_claim_type_check;

alter table public.employee_claim_requests
  add constraint employee_claim_requests_claim_type_check
  check (claim_type in ('travel', 'meal', 'misc', 'other'));

alter table public.employee_claim_requests
  drop constraint if exists employee_claim_requests_other_type_text_check;

alter table public.employee_claim_requests
  add constraint employee_claim_requests_other_type_text_check
  check (
    claim_type <> 'other'
    or nullif(btrim(claim_type_other_text), '') is not null
  );
