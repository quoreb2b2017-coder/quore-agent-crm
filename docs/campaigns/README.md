# Campaign Operations: phase 2 (campaigns, database and document repository)

This replaces the **`Quore_Database`** share and the document side of **`Quore_Production`**. Distribution to callers (phase 3), employee workspaces (phase 4) and QC (phase 5) build on it. The architecture and the full roadmap are in the *WorkTrack Campaign Operations: Phase 1 Architecture* doc.

## What it does

| Screen | Where | Who |
|---|---|---|
| Overview | `/admin/campaigns` | Anyone with `co.campaign.view` |
| All campaigns | `/admin/campaigns/all` | Managers see all; others see campaigns they are a member of |
| New campaign | `/admin/campaigns/new` | `co.campaign.manage` (Super Admin, Operations Manager) |
| Campaign detail | `/admin/campaigns/[id]`, with tabs Overview, Database, Documents, Team and Activity | Members and managers |
| Database repository | `/admin/campaigns/repository` | Uploaders, approvers, downloaders |
| Document repository | `/admin/campaigns/documents` | Everyone in the module, filtered by campaign role |

**A database's path:**

1. **Upload.** The browser sends the file straight to the private `co-quarantine` bucket with a one-time signed URL, so it never passes through Vercel. The limit is 100 MB; only `.csv` and `.xlsx` are accepted, never `.xlsm`.
2. **Scan.** The file worker (`workers/campaign-files`) records the SHA-256 and scans the file with ClamAV. An infected file is blocked permanently and managers are alerted.
3. **Validate.** The worker maps the columns, then checks each row's required fields and email and phone format, and flags duplicates within the file. Every row is stored with its result, and the rejected rows can be downloaded as a CSV with the reasons.
4. **Approve.** An Operations Manager or Super Admin who did **not** upload it reviews the counts, the matched columns and a 10-row preview, then approves or rejects. A rejection needs a reason.
5. **Publish.** The worker copies the file to `co-approved` and re-checks the hash. The version's valid rows become *Available*, and the previous version is superseded. The campaign moves to **Ready for distribution**.

Documents (scripts, SOPs, reports) follow steps 1, 2 and 5 without approval. A campaign member can open a document only if their campaign role is allowed for that file type.

## Who can do what

| | Super Admin | Operations Manager | Database | Everyone else |
|---|---|---|---|---|
| See campaigns | All | All | Their own | No |
| Create, edit, hold, archive | Yes | Yes | No | No |
| Add or remove members | Yes | Yes | No | No |
| Upload a database | Yes | No | To campaigns they are a database member of | No |
| Approve a database | Yes, never their own upload | Yes, never their own upload | No | No |
| Download a full database file | Yes | No | Their campaigns | No |
| Upload documents | Yes | Yes | No | No |

The new role **Operations Manager** (`OPS_MANAGER`) appears under Sales in Teams and in the Add employee form. It uses the staff workspace, with the same clock and attendance as other staff.

## Rules the database enforces

- None of the `co_` tables can be reached through the public API. RLS is on and signed-in users have no grants; the server checks every request and logs each download.
- A version cannot be approved by its uploader, cannot skip a step, and cannot be rejected without a reason.
- Campaign status follows a fixed path. *On hold* returns to where it came from.
- Campaigns, members, files, versions and lead rows are never deleted; they are archived instead.
- A stored file's hash, name and size never change, and an infected file can never be published.
- Every change to campaigns, members, files and versions goes into the hash-chained audit log, along with downloads, refusals and archive actions.

## Deploy

1. **Database.** Run `supabase/migrations/0049_campaign_operations_core.sql` in the SQL editor; it is safe to run twice. Then run `docs/deploy/check-migrations.sql`: the `0049` line must be `true`.
2. **Upload limit.** Supabase → Storage → Settings: set the global upload limit to at least **100 MB**. The free plan caps it at 50 MB, so on that plan files above 50 MB are refused.
3. **File worker.** Deploy `workers/campaign-files` (see its README) as a private background service with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Until it runs, uploads wait safely in quarantine.
4. **People.** Give Operations Managers the *Operations Manager* role, then add database staff to each campaign as **Database** members from the campaign's Team tab.

## How it was tested

- **43 database tests** (`npm run test:security`), 10 of them for this module:
  - the API is closed;
  - the uploader cannot approve;
  - versions only move forward, and a rejection needs a reason;
  - campaigns follow the status path, including hold and resume;
  - nothing can be deleted;
  - file hashes cannot change and infected files stay blocked;
  - publication and supersession;
  - a second upload never leaves the campaign stuck;
  - audit attribution;
  - which roles hold the campaign permissions.
- **12 worker tests** (`cd workers/campaign-files && npm test`):
  - column mapping and validation;
  - CSV with byte-order marks and stray quotes, and the row limit;
  - XLSX read as stored values;
  - macro and zip-bomb refusal;
  - the clamd protocol, including EICAR against a stand-in scanner.
- **28-step browser run** against a full local stack:
  - Ops Manager creates a campaign and adds a Database member;
  - the CSV is validated (3 valid of 6, 2 invalid, 1 duplicate) and the uploader cannot approve it;
  - the invalid-rows report has formulas escaped, and the EICAR file is blocked;
  - Ops Manager approves and the version is published;
  - the Database member downloads through a signed link, while the Ops Manager and an Agent are refused;
  - the Agent cannot read lead rows through the API;
  - the SOP is published;
  - the Activity tab shows downloads and refusals.

**Not tested:** real ClamAV, which runs only in the worker's Docker image (the local run used a stand-in that speaks the same protocol), and real Supabase Storage (the local run used a stand-in for the calls the app makes). Upload the EICAR test file once after deploying to confirm both.
