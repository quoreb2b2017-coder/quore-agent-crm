# Going live: steps outside the code

Everything here is a dashboard setting, a secret or a decision. None of it can be done from the repository.
Work top to bottom. Tick each box when it is done.

## 1. Database (Supabase → SQL Editor)

- [ ] Run [check-migrations.sql](check-migrations.sql). It is read only and shows which migrations are applied.
- [ ] If any of 0042–0048 is `false`, run [pending-migrations-0042-0048.sql](pending-migrations-0042-0048.sql). It is safe to run twice.
      **0046 first if you do only one:** today staff roles can read every salary through the database API.
- [ ] If 0024–0028 shows `false`, run those files from `supabase/migrations` in order first, then
      **Security & Compliance → Run automated checks**.
- [ ] Enable **pg_cron** (Database → Extensions). Then run the `0042` section again, so the daily clean-up is scheduled.
      It also runs the daily control checks and the chat purge.

## 2. Supabase Auth settings

- [ ] Authentication → URL Configuration → Redirect URLs: add
      `https://quore-agent-crm.vercel.app/reset-password` and `http://localhost:3000/reset-password`.
      Without this, the Forgot password email link does not work.
- [ ] Authentication → Emails → SMTP: set your own mail server. The built-in one sends only a few emails an hour,
      so reset links stop arriving after a handful of requests.
- [ ] Turn off public sign-ups (Authentication → Providers → Email → "Allow new users to sign up").
      Accounts are created by Super Admin only.
- [ ] Turn on the custom access-token hook, so role and employee id are in every sign-in token.
- [ ] Confirm TOTP two-factor is enabled (Authentication → Multi-factor).
- [ ] Switch to the new JWT signing keys (Settings → JWT Keys). No code change is needed.

## 3. Secrets

- [ ] Rotate the service-role key (Settings → API), then update `SUPABASE_SERVICE_ROLE_KEY` on Vercel and on the socket host.
      The old key was shared with the socket host and the repository has been public.
- [ ] Vercel → Environment Variables (Production): `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- [ ] Remove `NEXT_PUBLIC_SOCKET_URL` and `SOCKET_INTERNAL_URL` from Vercel unless a socket server is really hosted.
      If one is: set `SOCKET_SECRET` to the same 64-character value on Vercel and on the socket host.
- [ ] Redeploy after changing any variable. `NEXT_PUBLIC_` values are fixed at build time.

## 4. Speed

- [ ] Put Vercel Functions in the same region as the Supabase project (Vercel → Settings → Functions → Region).
      This is the biggest single speed gain: each page makes several database calls, and each one crosses that distance.

## 5. Security headers

- [ ] After a week on the live site, open the browser console on a few pages. If there are no
      `Content-Security-Policy` reports, set `CSP_ENFORCE=true` on Vercel and redeploy. Until then the policy only reports.

## 6. GitHub (owner only)

- [ ] Make the repository private.
- [ ] Turn on Dependabot alerts and security updates (Settings → Code security). `.github/dependabot.yml` is already in place.
- [ ] Branch protection on `main`: require the `ci` check. Requiring a review too means every change needs a pull request
      and a second person, so decide that when there is a second developer.

## 7. Decisions still open

- **Two-factor sign-in** is switched off on purpose (`src/lib/auth/mfa-flags.ts`, `MFA_ENFORCED = false`).
  Setting it to `true` makes Super Admin and HR set up an authenticator before they can work. Do this only after
  step 2's TOTP check, and make sure every admin has their phone ready.
- **Retention for business records** (attendance, leave, pay, audit log) needs your legal adviser. Short-lived data is
  already cleaned up daily (sign-in attempts and read notifications 180 days, online status 30 days, chat 7 days).
- **Old tables with no screens**: `tasks`, `campaigns`, `leads`, `field_visits`, `devices`, `work_policies`,
  `policy_violations`, `activity_events`, `browser_activities`. Keep them, or drop them in a migration after a backup.
- **A copy of the audit log outside the database** needs a place to send it (for example a storage bucket in another
  account that the database owner cannot delete from).
- **Staging**: a second Supabase project plus Vercel preview deployments pointed at it, before the IAM work.

## 8. Campaign Operations (migration 0049)

- [ ] Run [0049_campaign_operations_core.sql](../../supabase/migrations/0049_campaign_operations_core.sql), then
      [0050_campaign_database_full_access.sql](../../supabase/migrations/0050_campaign_database_full_access.sql) in the SQL Editor,
      then check-migrations.sql: the `0049` and `0050` lines must be `true`.
- [ ] Storage → Settings: global upload limit at least 100 MB (the free plan stops at 50 MB).
- [ ] Run [0051_campaign_members_and_empty_delete.sql](../../supabase/migrations/0051_campaign_members_and_empty_delete.sql): people added to a campaign can see it, Database members can upload to it, and an empty campaign made by mistake can be deleted.
- [ ] Deploy the file worker (`workers/campaign-files`, see its README) as a private background service on Railway or Render,
      about 2 GB of memory, with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Uploads wait in quarantine until it runs.
- [ ] After deploying, upload the EICAR test file to a test campaign: it must show **Blocked: malware**.
- [ ] Give campaign leads the **Operations Manager** role; add database staff to each campaign as **Database** members.
