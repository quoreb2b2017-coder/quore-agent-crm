# Phase B security hardening — deployment notes

Branch: `security/phase-b-hardening`. Source assessment: WorkTrack ISO/IEC 27001:2022 and SOC 2 gap assessment, 29 Oct 2026 (findings F-01 to F-17).

Nothing on this branch changes any control's status by itself. A control moves forward only after the change is deployed and evidence is collected and reviewed in the Security & Compliance page.

## Deploy order

1. **Set `SOCKET_SECRET`** (32+ random characters, e.g. `openssl rand -hex 32`) on Vercel and on the socket host. The socket server now refuses to start without it and no longer falls back to the service-role key.
2. **Apply migrations 0024 to 0027** to a staging project first (`npx supabase db push`), run the app, then production.
3. **Deploy the app.** Next.js moves from 16.3.2 to 16.4.3 (critical advisories, F-17).
4. **Run the checks**: Security & Compliance → *Run automated checks*. Expect failures for MFA (IAM-02) and segregation of duties (IAM-04) until those gaps are closed. Those failures are correct.
5. **Rotate the Supabase service-role key** after deploying. The repository is public and the key was previously shared with the socket host.

## Behaviour changes users will notice

| Who | Change | Why |
|---|---|---|
| Agent / Database / Email Marketing staff | Can no longer read other employees' salaries, payslips, browsing activity or attendance through the API, edit attendance, approve leave, or create work policies | F-03 least privilege |
| HR | Cannot change anyone's role (Super Admin only) and cannot edit their own employee, salary, attendance or leave records | F-04 no self-administration |
| Suspended / terminated employees | Lose access on their next request instead of when their token expires | F-06 timely revocation |
| Everyone | One extra indexed database read per request to load live role and permissions | F-01 / F-06; cached per request |

The application UI for staff mostly already used Super-Admin-only checks, so the visible change is limited to the work policies action; the larger change is closing the direct-API path.

## What is now enforced in the database

- Role, permissions and employment status are read live in RLS helpers; JWT custom claims are treated as hints.
- `audit_logs` is append-only (update, delete and truncate blocked for every API role, including the service role), each row records the acting employee, a request id and a SHA-256 hash chained to the previous row. `verify_audit_chain()` detects edits and removals. A database owner can still disable triggers, so an external copy is backlog item B-06.
- Attendance, roles, permissions, meeting approvals and work settings are now audited.
- Compliance tables: a control cannot be set to *Operating and evidenced* without accepted evidence from the last 12 months and a passing latest test; evidence content is immutable and cannot be accepted by its collector; control tests are append-only and independence is computed, not claimed.

## Tests

`npm run test:security` applies all migrations plus `seed.sql` to an in-memory Postgres and runs 21 acceptance tests. Against the original schema, all 14 tests tied to findings (F-03, F-04, F-05, F-06, F-12) fail, which reproduces those findings.

These tests cover the database layer only. They do not replace a penetration test or test the Next.js layer against a live Supabase Auth server (for example, that a forged cookie is rejected end to end); that needs a staging environment.

## Known gaps left open on purpose

- **F-02**: the app still uses the service-role client for signed-in users (now only after verifying the user). Moving to the RLS-bound client touches most pages and should be done with staging tests (B-05).
- **F-07 / PAY-01**: payroll still auto-generates on the 10th with a single approver. Choose maker-checker or an approved SoD exception (B-07). That is a business decision.
- **F-08**: the repository is still public. Only the owner can change that (B-03).
- **F-09**: MFA is not enforced yet (B-04).
- CSP header (B-14), audit viewer and external log sink (B-06).
