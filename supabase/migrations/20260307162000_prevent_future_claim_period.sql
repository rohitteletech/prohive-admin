alter table public.employee_claim_requests
  drop constraint if exists employee_claim_requests_not_future_check;

alter table public.employee_claim_requests
  add constraint employee_claim_requests_not_future_check
  check (
    from_date <= ((now() at time zone 'Asia/Kolkata')::date)
    and to_date <= ((now() at time zone 'Asia/Kolkata')::date)
  );
