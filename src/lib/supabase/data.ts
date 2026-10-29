import "server-only";
import { cache } from "react";
import { randomUUID } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";

/**
 * Database client for Server Components, Server Actions and route handlers.
 *
 * KNOWN GAP (finding F-02): signed-in users still get a service-role client,
 * which bypasses Row Level Security. Authorization therefore depends on the
 * explicit checks in each action/page. Moving reads and writes to the
 * user-scoped client (RLS enforced) is tracked in the readiness backlog.
 *
 * What this version adds:
 * - The caller must be a verified, active employee (getCurrentEmployeeContext);
 *   unauthenticated or blocked callers get the anon, RLS-bound client.
 * - Each request gets its own service client carrying x-worktrack-actor and
 *   x-request-id headers. PostgREST exposes them to Postgres as
 *   request.headers, and public.current_employee_id() reads them only when
 *   the caller is service_role, so audit_logs rows record the real employee
 *   and a correlation id instead of NULL (finding F-05).
 */
export const createDataClient = cache(async () => {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return await createClient();
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          "x-worktrack-actor": ctx.employeeId,
          "x-request-id": randomUUID(),
        },
      },
    }
  );
});
