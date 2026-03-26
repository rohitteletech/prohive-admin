This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Supabase Setup (Starter)

1. Install dependencies:

```bash
npm install
```

2. Create local env from template:

```bash
copy .env.example .env.local
```

3. Fill these values in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_COOKIE_SECRET`
- `MSG91_AUTH_KEY`
- `MSG91_OTP_WIDGET_ID`
- `MSG91_OTP_WIDGET_TOKEN`
- `MSG91_COUNTRY_CODE` (default `91`)
- `NEXT_PUBLIC_SUPERADMIN_EMAILS` (comma-separated)
- `SUPERADMIN_EMAILS` (comma-separated, server-side)

Preferred OTP setup:
- MSG91 OTP Widget with Mobile integration enabled
- Android client uses widget/token flow
- Backend verifies MSG91 access token server-side before activation/reset

Legacy fallback:
- `MSG91_FLOW_ID_FIRST_LOGIN`
- `MSG91_FLOW_ID_RESET_PIN`
- `MSG91_OTP_VARIABLE_NAME` (default `OTP`)

4. In Supabase SQL Editor, run:
- [`supabase/schema.sql`](supabase/schema.sql)

## Supabase CLI Workflow

This repo now includes a checked-in [`supabase/config.toml`](supabase/config.toml) with the hosted
project id only. It does not contain secrets.

Recommended GitHub-safe rules:
- Commit `supabase/config.toml`, `supabase/migrations/`, `supabase/functions/`, and `supabase/schema.sql`
- Do not commit `.env.local`, access tokens, service-role keys, or other secrets
- Keep `/supabase/.temp/` ignored

Recommended workflow:

1. Pull latest code

```bash
git pull
```

2. Log in to Supabase CLI locally

```bash
npx supabase@latest login
```

3. Link/check project context if needed

```bash
npx supabase@latest projects list
```

4. Deploy edge functions

```bash
npx supabase@latest functions deploy punch
```

5. Apply database changes when new migrations are added

```bash
npx supabase@latest db push
```

Notes:
- `git push` updates GitHub only. It does not deploy Supabase functions or database changes by itself.
- Use `supabase/schema.sql` as the current schema reference, and `supabase/migrations/` for tracked DB changes.
- If you add a new Edge Function, create it inside `supabase/functions/<name>/`.

Current starter integration:
- Superadmin companies list fetches live data from `companies` table.
- Superadmin login uses Supabase Auth (no dummy fallback).
- Superadmin create company uses server API with token verification, creates company admin auth user, and inserts company row.
- Company admin login uses Supabase Auth and validates company mapping via `companies.admin_email`.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
