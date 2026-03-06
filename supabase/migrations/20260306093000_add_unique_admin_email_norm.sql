-- Prevent duplicate normalized admin emails before adding unique index
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT lower(trim(admin_email)) AS normalized_email, count(*) AS cnt
      FROM public.companies
      WHERE admin_email IS NOT NULL
      GROUP BY lower(trim(admin_email))
      HAVING count(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION 'Cannot create unique index: duplicate normalized admin_email values exist in companies.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS companies_admin_email_norm_uniq
ON public.companies ((lower(trim(admin_email))))
WHERE admin_email IS NOT NULL;
