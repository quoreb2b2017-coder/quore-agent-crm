# quore-agent-crm

WorkTrack is a role-based Employee Management, Attendance, Activity Tracking, Payroll, and Productivity platform built with [Next.js](https://nextjs.org) (App Router, TypeScript), [Tailwind CSS](https://tailwindcss.com) v4, [shadcn/ui](https://ui.shadcn.com), and [Supabase](https://supabase.com) (Postgres, Auth, Storage, Realtime, Row Level Security).

One codebase serves two panels — a Super Admin Panel and a single Employee Panel whose modules and navigation are generated at runtime from each employee's role and permissions (see `src/lib/permissions/`). Adding a new role is a data change (Roles & Permissions page), not a new app.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Configure env vars**:
   ```bash
   cp .env.local.example .env.local
   ```
   Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from Project Settings → API.
3. **Apply the database schema**. Link the CLI to your project and push the migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   (Or paste each file in `supabase/migrations/` into the Supabase SQL Editor, in order, followed by `supabase/seed.sql`.)
4. **Register the Auth Hook** (cannot be done via SQL migration): in the Supabase Dashboard go to Authentication → Hooks → "Customize Access Token (JWT) Claims hook", and select `public.custom_access_token_hook`. This injects `employee_id`, `role_key`, and `permissions[]` into every session's JWT, which is what the app's RLS policies and role-based UI read.
5. **Regenerate types** (optional, once your project is linked):
   ```bash
   npx supabase gen types typescript --project-id <your-project-ref> --schema public > src/types/supabase.ts
   ```
6. **Create the first Super Admin**:
   ```bash
   npx tsx scripts/create-super-admin.ts --email you@company.com --password "a-strong-password" --name "Your Name"
   ```
7. **Run the app**:
   ```bash
   npm install
   npm run dev
   ```
   Sign in at `/login` with the Super Admin account you just created.

## Project structure

```
supabase/
  migrations/            versioned SQL — schema, RLS policies, auth hook
  seed.sql                roles, permissions, role_permissions, departments, leave types
scripts/
  create-super-admin.ts   one-off bootstrap script (service-role)
src/
  app/
    (auth)/login/         public sign-in
    (admin)/admin/*        Super Admin Panel routes (guarded by role)
    (employee)/portal/*    Employee Panel routes (guarded by auth; modules vary by role)
  components/
    ui/                    shadcn/ui primitives
    layout/                sidebar/topbar/shell shared by both panels
    dashboard/              stat cards, status badges, live status table
    dashboards/             role-specific dashboard building blocks
    attendance/              clock in/out + break widget
    tasks/                    shared task status control
  lib/
    supabase/{client,server,middleware,service}.ts   browser/server/middleware/service-role clients
    permissions/            the centralized RBAC system:
      modules.ts               single source of truth for sidebar modules + required permissions
      server.ts                 resolves the signed-in employee's role/permissions (Server Components)
      context.tsx, guard.tsx     client-side permission context + <RequirePermission>
    queries/                 read-heavy data-fetching helpers (dashboard stats, live status)
    actions/                 Server Actions shared across panels (attendance, tasks, leave, notifications)
  types/supabase.ts          hand-written to match the migrations (regenerate once linked)
middleware.ts                 session refresh + route protection
```

## How the role system works

1. Employee signs in → Supabase Auth issues a session.
2. The Custom Access Token Hook (`supabase/migrations/0006_auth_hook.sql`) embeds the employee's `employee_id`, `role_key`, and resolved `permissions[]` into the JWT at sign-in/refresh.
3. `getCurrentEmployeeContext()` (`src/lib/permissions/server.ts`) reads those claims in Server Components/layouts.
4. `filterModules()` (`src/lib/permissions/modules.ts`) filters the module registry against the employee's permissions to build the sidebar — no hardcoded role checks in the UI.
5. Every table is protected by Postgres Row Level Security (`supabase/migrations/0005_rls_policies.sql`), so even a compromised or buggy UI cannot read another employee's data — enforcement lives in the database, not the frontend.

Creating a new role (e.g. "Customer Support") from Roles & Permissions writes to the `roles`/`role_permissions` tables — no code changes or redeploy needed for the new role to see its permitted modules.

## What's implemented vs. planned

This build covers Phase 1 (schema, auth, RLS) and Phase 2 (both panel shells, role-based navigation, employee/department/role management, attendance & break self-service, tasks, leave, campaigns/leads, notifications) end-to-end against real Supabase tables.

Explicitly deferred to follow-up phases: automatic attendance/productivity aggregation (`pg_cron` rollups), payroll runs and PDF salary slip generation, the Chrome Extension and its activity-ingest endpoint, the policy-violation detection engine, and deeper reporting/analytics. Their tables and permissions already exist so the corresponding admin pages show real (currently empty) data rather than mocks.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com/docs)
- [Supabase Auth — Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)

## Deploy on Vercel

1. Import [quore-agent-crm](https://github.com/quoreb2b2017-coder/quore-agent-crm) on Vercel.
2. Copy variables from `vercel.env.example` into **Project → Settings → Environment Variables** (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (required)
   - `CRON_SECRET` (required for salary slip cron on the 10th)
   - `COMPANY_*` (optional; payslip header defaults exist)
3. Deploy. Live chat/notifications need a separate socket host — leave `NEXT_PUBLIC_SOCKET_URL` unset until then (app works without it).
4. Apply Supabase migrations and enable the Auth Hook (see Setup above).
