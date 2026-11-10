# Campaign Operations file worker

Every file uploaded in **Campaign Operations** lands in the private `co-quarantine` bucket. Nobody can open it until this worker has finished with it:

1. **Scan.** It downloads the file, checks the size, records its SHA-256 and scans it with ClamAV.
   - An infected file is blocked for good, and the uploader and campaign managers are alerted.
   - After 3 failed scan attempts the file is marked *Scan failed*.
2. **Validate (databases only).** It reads the first sheet of a `.csv` or `.xlsx`, maps the columns and checks every row:
   - required fields;
   - email and phone format;
   - duplicates within the file.

   Every row is stored with its result. The version then waits for approval by someone other than the uploader.
3. **Publish.** It copies the file to the private `co-approved` bucket and re-checks the hash. A document is published straight after its scan; a database only after approval. For a database, the clean rows then become available to the campaign.

Several limits are refused rather than cut short:
- macro-enabled workbooks;
- archives that unpack past 1 GB, and compression bombs;
- more than 500,000 rows.

Formulas are never evaluated; the stored value is read.

## Run it

Deploy the `Dockerfile` in this folder as a **background worker with no public port**, on Railway, Render or any Docker host. It needs about **2 GB of memory**, because ClamAV keeps its signatures in RAM.

| Variable | Required | Value |
|---|---|---|
| `SUPABASE_URL` | yes | Same as `NEXT_PUBLIC_SUPABASE_URL` in the app |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | The service-role key. Server only. |
| `CLAMD_HOST`, `CLAMD_PORT` | no | Default `127.0.0.1:3310` (clamd inside the same container) |
| `POLL_INTERVAL_MS` | no | Default `5000` |
| `MAX_ROWS` | no | Default `500000` |
| `MAX_UNPACKED_BYTES` | no | Default `1073741824` (1 GB) |

Run **one** instance. If the worker is stopped, uploads wait in quarantine and are picked up when it starts again. A scan left half-done for 30 minutes is retried automatically.

Logs are one JSON line per event (`clean`, `infected`, `validated`, `published`, …), so the host's log viewer can filter them.

## Test it

```bash
npm install
npm test        # parsing, validation, macro and zip-bomb refusal, clamd protocol (fake clamd)
```

To test with real ClamAV after deploying, upload the standard EICAR test file, which is harmless and recognised by every antivirus. It must show **Malware blocked**.
