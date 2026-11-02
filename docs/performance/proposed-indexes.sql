-- PROPOSED, NOT APPLIED. Needs your approval before it goes into supabase/migrations.
-- Adds an index only: no table, column, relationship, policy or data changes.
-- CONCURRENTLY builds it without locking writes; run it outside a transaction
-- (Supabase SQL Editor runs each statement on its own, which is fine).

-- Open breaks: "breaks where ended_at is null".
-- Used by the idle-session sweep (dashboard and every presence heartbeat, at
-- most once a minute per server) and the clock-in/out break checks.
-- Today this is a full table scan that grows with every break ever taken:
--   local test, 21,930 breaks: Seq Scan, 1.6 ms -> with this index: Index Scan, 0.06 ms.
--   At 100 staff x 3 breaks x 250 days ≈ 75,000 rows a year, the scan keeps growing; the index stays constant.
create index concurrently if not exists idx_breaks_open
  on public.breaks (employee_id)
  where ended_at is null;
