# WorkTrack (quore-agent-crm)

WorkTrack is Quore B2B's workforce platform covering attendance, shifts, activity, productivity, leave, onboarding, payroll and salary slips. It also includes a **Security & Compliance workspace** for ISO/IEC 27001:2022 and SOC 2 Type II readiness.

It is built with Next.js 16 (App Router, TypeScript), Tailwind CSS v4, shadcn/ui and Supabase (Postgres, Auth, Storage, Row Level Security). The realtime socket server is optional.

---

## What is in this version

**New look.** The app has a dark Quore-ink app bar in the mint brand colour, a light grouped side navigation, IBM Plex type and flat white surfaces. Colour is used only for status. The fonts are bundled with the app, so builds need no network access.

**New features**

| Feature | Where | Notes |
|---|---|---|
| Command palette | ⌘K / Ctrl+K anywhere | Jumps to pages, people (Super Admin and HR only) and suggested actions. |
| Approvals inbox | `/admin/approvals` | Meeting requests, leave, evidence reviews and security exceptions in one list. Self-approval is blocked. |
| Command center | `/admin/dashboard` | Key numbers, live shift roster, your approvals, compliance posture, today's hours and upcoming dates. |
| Employee 360 | `/admin/employees/[id]` | Access & security card (role, sign-in, two-factor, last sign-in), recent changes and a two-factor reset for Super Admin. |
| Roles & permissions | `/admin/roles` | Permission matrix with draft changes and separation-of-duties warnings. Super Admin is locked. |
| Audit log | `/admin/audit-logs` | Filterable viewer for the append-only, SHA-256 hash-chained log, with a **Verify integrity** button. |
| Account security | `/admin/security`, `/portal/security` | TOTP two-factor sign-in (set up, remove), sign out of other devices, and changes to your record. |
| Two-factor at sign-in | `/verify` | Users with a factor must enter a code. The server enforces AAL2, so the browser cannot skip the step. |
| Security & Compliance | `/admin/compliance/*` | See below. |
| Campaign Operations | `/admin/campaigns/*` | Campaigns, database repository (quarantine, malware scan, validation, second-person approval) and document repository. Needs the file worker in `workers/campaign-files`. |

**Security & Compliance workspace**

- **Overview:** readiness, findings, governance status, and controls by domain.
- **Controls:** the register with filters and ISO/SOC 2 mapping.
- **Control detail:** edit status, owner and narrative; add evidence (file upload with SHA-256, or a system reference); record tests.
- **Evidence library:** every evidence item, filterable by status, with file download.
- **Risk register:** likelihood × impact scoring, treatment, linked controls, and acceptance with expiry.
- **Statement of Applicability:** all 93 Annex A controls, with a decision, justification and revision for each.
- **Corrective actions:** owner and due date. Closing needs accepted evidence of the fix.
- **Security exceptions:** each needs a compensating control and an expiry, and is approved by someone else.

**Rules the database enforces**, not just the screens:

- **Operating needs proof.** A control can only become *Operating* with accepted evidence from the last 12 months and a passing latest test.
- **Evidence:** it cannot be changed after it is added, and the person who collected it cannot review it.
- **Tests:** they are append-only, and the database decides whether a test was independent.
- **Audit log:**
  - Every change to people, pay, roles, settings, onboarding and compliance records is written to the hash-chained audit log.
  - PAN, Aadhaar and bank numbers are redacted before they reach it.

**Removed:** routes that were unreachable or only redirected (legacy tasks, campaigns, leads, field visits, departments, devices, reports, work policies, policy violations, breaks, live and browser activity). Their database tables are untouched.

---

## Setup

### 1. Supabase project
Create a project at [supabase.com](https://supabase.com). From **Project Settings → API**, copy the project URL, the `anon` key and the `service_role` key.

### 2. Environment
```bash
cp .env.local.example .env.local   # or fill in the .env.local shipped in the ZIP
```

| Variable | Required | What it is |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server only. Never prefix it with `NEXT_PUBLIC_`. |
| `CRON_SECRET` | yes | 32+ random characters. Vercel Cron sends it to `/api/cron/salary-slips`. |
| `SOCKET_SECRET` | with socket | 32+ random characters (`openssl rand -hex 32`), shared by Next.js and the socket server |
| `NEXT_PUBLIC_SOCKET_URL`, `SOCKET_INTERNAL_URL`, `SOCKET_PORT` | with socket | Where the realtime server runs |
| `COMPANY_NAME`, `COMPANY_LEGAL_NAME`, `COMPANY_ADDRESS`, `COMPANY_TAGLINE` | no | Payslip, offer letter and app bar text |

### 3. Database
Apply **every** migration in order (`0001` … `0049`), then `seed.sql`:
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
psql "$SUPABASE_DB_URL" -f supabase/seed.sql      # or paste seed.sql into the SQL Editor
```
If you use the SQL Editor instead, paste each file in `supabase/migrations/` in filename order, then `supabase/seed.sql`.

| Migrations | What they add |
|---|---|
| `0001`–`0021` | Core schema: attendance, payroll, leave, chat, meetings, work settings |
| `0022`–`0023` | Onboarding and offer letters |
| `0024` | Security hardening: least privilege, no self-administration, hash-chained audit log |
| `0025`–`0027` | Compliance data model, control register seed (38 controls, 175 mappings, 93 SoA rows, 17 corrective actions) and automated control checks |
| `0028` | Server-side two-factor check, security event log, onboarding audit with redaction |
| `0029`–`0048` | Overtime, push notifications, departments, audit chain, sign-in lockout, salary approval, acknowledgements, staff least privilege |
| `0049` | Campaign Operations: campaigns, members, file and database repository, quarantine and approval (see `docs/campaigns/README.md`) |

### 4. Supabase dashboard settings (cannot be done in SQL)
1. **Authentication → Hooks:** enable *Customize Access Token (JWT) Claims* and select `public.custom_access_token_hook`.
2. **Authentication → Multi-Factor:** make sure **TOTP** enrolment and verification are enabled (they are by default).
3. **Authentication → Providers → Email:** turn off public sign-ups. Admins create every account.
4. **Storage:** confirm the private buckets `compliance-evidence` and `onboarding-documents` exist. The migrations create them.
5. **Database → Extensions:** enable `pg_cron` if you want the automated control checks to run daily. They can always be run from the Compliance page.

### 5. First Super Admin
```bash
npm install
npx tsx scripts/create-super-admin.ts --email you@quoreb2b.com --password "a-strong-password" --name "Your Name"
```
Sign in, open **Account security** and turn on two-factor sign-in. The app shows a banner to Super Admin and HR until it is on.

### 6. Run
```bash
npm run dev        # Next.js on :3000 and the socket server on :3002
```

---

## Deploy (Vercel)
1. Import the repository in Vercel.
2. Add the variables from `vercel.env.example` for Production and Preview.
3. Deploy. `vercel.json` already schedules the payslip cron.
4. **Realtime (optional).** Host `server/socket-server.ts` on Railway or Render with the same `SOCKET_SECRET`. Then set `NEXT_PUBLIC_SOCKET_URL` and `SOCKET_INTERNAL_URL` in Vercel. The app works without it; live chat and notification pings fall back to refresh.

---

## Checks
```bash
npm run lint            # 0 errors
npx tsc --noEmit        # type check
npm run test:security   # 24 database security tests (RLS, audit chain, compliance gates, MFA, redaction)
npm run build           # production build
```
CI (`.github/workflows/ci.yml`) runs all four on every push and pull request.

---

## Project structure
```
supabase/
  migrations/              0001–0049, applied in order
  seed.sql                 roles, permissions, leave types, compliance grants
  tests/                   PGlite security test suite
scripts/create-super-admin.ts
server/socket-server.ts    optional realtime server
src/
  app/(auth)/login, verify             sign-in and two-factor step
  app/(admin)/admin/*                  admin console (Super Admin, HR and staff roles)
    approvals/  audit-logs/  roles/  security/  compliance/{controls,evidence,risks,soa,actions,exceptions}
  app/(employee)/portal/*              limited portal for other roles
  components/layout/                   app bar, side nav, command palette, shell
  components/wt/                       new-look building blocks (panel, pill, KPI strip, segment bar)
  components/security/                 two-factor manager, account security page
  lib/auth/mfa.ts                      server-side AAL2 enforcement
  lib/compliance/                      labels, access guards, summary queries
  lib/queries/approvals.ts             approvals aggregation
  lib/permissions/                     roles, module registry, server context
docs/compliance/PHASE-B-NOTES.md       security hardening notes and remaining backlog
```

## Known limits
- **Server-side data access:** it still uses the service role, behind explicit checks in each page and action (finding F-02 in `docs/compliance/PHASE-B-NOTES.md`). Every write carries the acting employee, so the audit log attributes it correctly.
- **Statuses are not certification:** compliance statuses describe implementation and evidence, not an audit opinion. SOC 2 Type II also needs an observation period, and both frameworks need an external auditor.
