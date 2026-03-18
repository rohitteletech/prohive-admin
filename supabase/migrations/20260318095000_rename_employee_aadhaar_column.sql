alter table public.employees
rename column aadhaar_last4 to aadhaar_number;

update public.employees
set aadhaar_number = null
where aadhaar_number is not null
  and aadhaar_number !~ '^\d{12}$';
