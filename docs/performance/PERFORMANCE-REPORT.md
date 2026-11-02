# WorkTrack performance optimization report

**Scope:** speed only. No UI, styling, route, business-logic, schema, RLS or auth changes.
**Code base:** `main` at `2bce053` (same as GitHub), changes on top in one commit. Nothing pushed.

## How it was measured

- **Environment.** Measurements ran on a local copy of the full stack: PostgreSQL 16, Supabase Auth (GoTrue 2.180), PostgREST 12 and a production Next.js build (`next build` + `next start`). Each page was timed in Chromium.
- **Data volume.** The local database was loaded with realistic volume:
  - 86 employees
  - 7,310 sessions and 7,348 attendance rows
  - 21,930 breaks
  - 175,440 browser-activity rows
  - 5,162 notifications

  Your Supabase data was never touched.
- **Repeats.** Each page was loaded 6 times. The first load was discarded (warm-up) and the median of the other 5 is reported.
- **What is being counted:**
  - **DB req:** requests to the database API during one page view.
  - **auth:** requests to Supabase Auth during one page view.
  - Both counts include everything the page triggers: prefetching, server actions, background calls.
- **Absolute timings.** On Vercel ↔ Supabase every round-trip costs 20–200 ms (more if they are in different regions). So the **reduction in round-trips matters more in production than the local millisecond figures show.**
- **Re-running.** The scripts are in this folder (`bench.py`, `nav-bench.py`), with raw results in `bench-before.json` and `bench-after.json`.

## Results

### Page loads (median of 5)

TTFB = time to first byte from the server. Load = browser load event.

| Signed in as | Page | TTFB ms | Load ms | DB req | Auth req | DB time ms | JS KB (gzip) |
|---|---|---|---|---|---|---|---|
| Super Admin | `/admin/dashboard` | 856 → **52** | 1196 → **264** | 141 → **37** | 13 → **4** | 1720 → **317** | 347 → **308** |
| Super Admin | `/admin/employees` | 601 → **72** | 735 → **194** | 163 → **15** | 14 → **4** | 1675 → **83** | 347 → **303** |
| Super Admin | `/admin/employees/[id]` | 406 → **47** | 712 → **309** | 188 → **27** | 18 → **5** | 1854 → **220** | 452 → **402** |
| Super Admin | `/admin/attendance` | 160 → **45** | 433 → **220** | 175 → **17** | 16 → **4** | 1485 → **104** | 350 → **300** |
| Super Admin | `/admin/productivity` | 290 → **45** | 558 → **229** | 178 → **25** | 17 → **4** | 1697 → **192** | 450 → **300** |
| Super Admin | `/admin/activity` | 113 → **70** | 3080 → **2416** | 192 → **30** | 19 → **4** | 1490 → **312** | 476 → **299** |
| Super Admin | `/admin/leave` | 395 → **48** | 543 → **180** | 177 → **22** | 16 → **4** | 1705 → **160** | 352 → **301** |
| Super Admin | `/admin/payroll` | 449 → **40** | 691 → **160** | 174 → **16** | 15 → **4** | 2063 → **79** | 353 → **302** |
| Super Admin | `/admin/salary-slips` | 287 → **39** | 624 → **232** | 163 → **18** | 16 → **4** | 1490 → **95** | 350 → **298** |
| Super Admin | `/admin/notifications` | 334 → **63** | 440 → **125** | 169 → **13** | 16 → **4** | 1685 → **58** | 347 → **302** |
| Super Admin | `/admin/approvals` | 214 → **60** | 276 → **114** | 143 → **19** | 14 → **4** | 1321 → **118** | 347 → **299** |
| Super Admin | `/admin/compliance` | 370 → **66** | 438 → **151** | 176 → **21** | 16 → **4** | 1443 → **201** | 348 → **297** |
| Super Admin | `/admin/compliance/controls` | 464 → **68** | 594 → **160** | 175 → **24** | 16 → **4** | 1624 → **191** | 348 → **297** |
| Super Admin | `/admin/audit-logs` | 434 → **63** | 566 → **142** | 174 → **14** | 16 → **4** | 2027 → **75** | 348 → **297** |
| Super Admin | `/admin/roles` | 455 → **51** | 597 → **119** | 176 → **16** | 16 → **4** | 1702 → **90** | 351 → **300** |
| Agent (staff) | `/admin/dashboard` | 100 → **78** | 186 → **181** | 102 → **26** | 13 → **4** | 529 → **183** | 446 → **308** |
| Agent (staff) | `/admin/attendance` | 49 → **37** | 116 → **104** | 102 → **11** | 13 → **4** | 632 → **48** | 446 → **300** |
| Agent (staff) | `/admin/productivity` | 50 → **40** | 196 → **214** | 102 → **24** | 13 → **4** | 636 → **225** | 446 → **400** |
| Agent (staff) | `/admin/leave` | 60 → **44** | 115 → **95** | 102 → **15** | 13 → **4** | 627 → **103** | 446 → **301** |
| Agent (staff) | `/admin/notifications` | 63 → **51** | 137 → **111** | 102 → **9** | 13 → **4** | 470 → **42** | 446 → **302** |

### Totals and other measurements

| Measurement | Before | After |
|---|---|---|
| All database statements during the benchmark | 55,879 statements, 5,156 ms | **9,511 statements, 770 ms** (−83 % / −85 %) |
| Sign-in → dashboard loaded (Super Admin) | 868 ms | **587 ms** |
| Sign-in → dashboard loaded (Agent) | 432 ms | 445 ms (no change) |
| Supabase sign-in call itself | 179 ms | 159 ms (unchanged; Supabase Auth) |
| `/api/time` (called by every open tab) | 37 ms | **7 ms** |
| JS on staff pages without charts | 446 KB | **300 KB** (−33 %) |

### Menu navigation (client-side, no full page reload)

| Item | Before | After, click right away | After, pointer rests 250 ms first |
|---|---|---|---|
| Employees | 386 / 252 ms | 260 ms | 244 ms |
| Attendance | 572 / 242 ms | 436 ms | **153 ms** |
| Command center | 312 / 174 ms | 461 ms | **165 ms** |
| Leave | 492 / 135 ms | 423 ms | 134 ms |
| Payroll runs | 602 / 215 ms | 253 ms | **193 ms** |

"Before" shows two figures: an immediate click / a click after a 250 ms rest.

- **Before:** every page in the menu was rendered in advance on every view. That made navigation fast when the pre-rendering had finished, and slow when it was still running.
- **After:** a page is prefetched only when the pointer moves over its menu item (or it gets keyboard focus or a touch). A real click usually comes 150–400 ms later, so navigation is as fast as or faster than before.
- **One trade-off:** in a synthetic test that clicks the instant the pointer arrives, after the earlier pages have already finished pre-rendering, a click can take up to about 200 ms longer than before (about 300 → 500 ms).

## Bottlenecks found (prioritised)

| # | Bottleneck | Impact | Fixed? |
|---|---|---|---|
| 1 | Every side-menu link used `prefetch` (full). All pages are dynamic, so **each page view rendered ~18 other pages on the server**: 100–190 DB requests and 13–19 auth calls per view. | Very high | ✅ |
| 2 | Loading the signed-in user took **3 sequential queries** (employee+role, role permissions, permission names). This runs on every server render and every 20-second presence heartbeat of every open tab. | High | ✅ |
| 3 | The approvals badge on every admin page loaded the **whole approvals list**: meetings, leave, evidence, exceptions, all employees, all controls. | Medium | ✅ |
| 4 | The birthday/anniversary popup queried **all employees and onboarding records on every page render**. | Medium | ✅ |
| 5 | Chat retention clean-up ran **before** the chat page could render, on every chat page load. | Medium (chat) | ✅ |
| 6 | Chart library (recharts, ~100 KB gzip) loaded for staff on every page, through the prefetch. | Medium (staff) | ✅ |
| 7 | Employees page fetched role assignments **after** the employee list instead of alongside it. | Low | ✅ |
| 8 | Activity timeline repeated each employee's id, name and code on every event sent to the browser. | Low | ✅ |
| 9 | "Open breaks" query is a **full table scan** that grows with history. | Low now, grows | ⏸ needs approval (index) |
| 10 | Supabase Auth check costs a network call per server render (see recommendation B). | Medium in production | ⏸ settings change |
| 11 | Activity page renders every event in range (3,363 rows, 4 MB of markup in the test). | High on that page | ⏸ needs a UI change |

Checked and left as is:
- **List pages** already select specific columns, filter by date range and set limits.
- **Notifications and audit log** are already paginated or limited.
- **Main lookups are indexed:** attendance, sessions, notifications, activity and chat queries all have matching indexes.
- **RLS:** the app reads through the server with explicit checks, so RLS policy cost is not on the hot path. The RLS helper functions are simple indexed lookups.

## Changes made (every file)

| File | Change | Why |
|---|---|---|
| `src/components/layout/app-sidebar.tsx` | Menu links use the default prefetch, upgraded to a full prefetch on hover / focus / touch. | Fix #1. Stops rendering ~18 pages per view while keeping navigation fast. Same links, same look. |
| `src/lib/permissions/server.ts` | Employee, primary role and permission keys loaded in **one** nested query instead of three sequential ones. | Fix #2. Checked to return identical role and permission sets for every user (6/6 identical). Still read live from the database on every request, so blocking or role changes still apply immediately. |
| `src/lib/queries/approvals.ts` | `countApprovals` now runs four count-only queries in parallel with the same filters (and the same 200 cap on evidence). | Fix #3. Badge verified equal to the inbox total (8 = 8; after two approvals 6). |
| `src/lib/queries/celebrations.ts` | Result cached per date for 10 minutes per server instance. | Fix #4. The data only changes with the date, new joiners or edited birth dates. |
| `src/lib/chat/send.ts` | `purgeExpiredChat` runs at most every 10 minutes per instance (`force` option to run now), using the service client. | Fix #5. The function was already only granted to the service role, which the data client used. |
| `src/lib/queries/chat.ts` | Clean-up scheduled with `after()` so it runs after the page is sent. | Fix #5. Messages and previews were already filtered by the retention date, so what users see is unchanged. |
| `src/app/api/chat/purge/route.ts` | Calls the purge with `force: true`. | Keeps this endpoint's behaviour: it always purges immediately. |
| `src/components/dashboard/productivity-chart.tsx` (new wrapper) and `productivity-chart-impl.tsx` (renamed original, unchanged) | Chart loaded with `next/dynamic`, with a 240 px placeholder. | Fix #6. Recharts never rendered on the server anyway (it measures in the browser), so first paint is identical; the library now downloads only where a chart is shown. |
| `src/app/(admin)/admin/employees/page.tsx` | Three independent queries in one `Promise.all`. | Fix #7. |
| `src/components/activity/shift-timeline.tsx`, `activity-feed.tsx`, `src/lib/activity-detail.ts` | The browser receives only the fields the feed renders (`id, at, label, detail, tone`). | Fix #8. Types narrowed to match; output unchanged. |
| `docs/performance/*` | This report, the proposed index, benchmark scripts and raw results. | Documentation only. |

No database migrations, schema, RLS policies, routes, styles or texts were changed.

## Verification

All checks ran on the optimized production build:
- `npm run lint`: 0 errors (the same 21 existing warnings).
- `tsc --noEmit`: clean.
- `npm run test:security`: 24/24 pass.
- `npm run build`: passes.

Workflows checked in the browser:
- **Sign-in:**
  - Super Admin and Agent sign in successfully.
  - Two-factor sign-in works, and going straight to a page without the code still redirects to `/verify`.
- **Approvals:** the badge equals the inbox count; approving leave and accepting a meeting both save correctly.
- **Compliance:** adding evidence and recording a test work; the "Operating" gate still refuses without evidence; creating a risk works.
- **Page loads:**
  - Employees list, employee profile with chart, Agent productivity chart, activity page and chat page all load with no browser errors.
  - Chat clean-up still runs (after the response).
- **Command palette:** people search works.
- **Hover prefetch:** hovering a menu item prefetches that page only.
- **Staff session:** the presence heartbeat works and staff auto clock-in is active.

## Recommendations that need your decision

**A. Add one index (database change, needs approval).** The SQL is in `proposed-indexes.sql`. It changes no tables or data. In the local test the open-breaks lookup went from **1.6 ms (full scan) to 0.06 ms**, and it will not grow with history.

**B. Switch Supabase to asymmetric JWT signing keys (Supabase dashboard setting, no code change).** Go to Supabase → Project Settings → JWT Keys and migrate to the new signing keys.
- Each server render currently verifies the session with a call to Supabase Auth. That is the "Auth req" column: 4 per page after these changes, down from 13–19.
- With asymmetric keys, `getClaims()` verifies tokens locally with a cached public key, so those calls disappear.
- Do it at a quiet time; Supabase rotates keys without logging users out.

**C. Put Vercel functions in the same region as Supabase (Vercel setting).**
- Check your Supabase project's region (Project Settings → General).
- Set the Vercel Functions region to match (Project → Settings → Functions → Region), for example `bom1` for Mumbai (Supabase `ap-south-1`) or `iad1` for Supabase `us-east-1`.
- If they differ today, every database call crosses continents, and this alone can be the biggest win in production.

**D. Activity page: show fewer rows by default (UI change, needs approval).** With all employees over a multi-day range it renders every event (3,363 rows in the test). Showing the latest 20 per person with a "Show all" button, or a narrower default range, would cut that page from about 2.4 s to under 0.5 s.
