import "server-only";
import { cache } from "react";
import { randomUUID } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";

/**
 * Tables read and written with the signed-in person's own token, so Row Level Security
 * decides, not the app (finding F-02, backlog item 17). A table is added here only after
 * every query the app makes on it was checked against its policies for each role that
 * makes it; supabase/tests/run-security-tests.mjs covers them. Move more over the same way.
 *
 * Off unless USER_SCOPED_DATA=on: production's policies differ from the migrations here
 * (it has no has_role()), so turn it on only after docs/deploy/check-rls-policies.sql shows
 * these tables have the expected policies on that database.
 */
const USER_SCOPED_TABLES = new Set<string>(process.env.USER_SCOPED_DATA === "on" ? [
  "chat_conversations",
  "chat_messages",
  "chat_reads",
  "departments",
  "designations",
  "permissions",
  "role_permissions",
  "leave_types",
  "leave_balances",
] : []);

/**
 * Database client for Server Components, Server Actions and route handlers.
 *
 * KNOWN GAP (finding F-02), now partly closed: tables in USER_SCOPED_TABLES use the
 * signed-in person's token and are protected by Row Level Security. Every other table
 * still goes through a service-role client, which bypasses RLS, so authorization for
 * those depends on the explicit checks in each action/page.
 *
 * - The caller must be a verified, active employee (getCurrentEmployeeContext);
 *   unauthenticated or blocked callers get the anon, RLS-bound client.
 * - Each request gets its own service client carrying x-worktrack-actor and
 *   x-request-id headers. PostgREST exposes them to Postgres as
 *   request.headers, and public.current_employee_id() reads them only when
 *   the caller is service_role, so audit_logs rows record the real employee
 *   and a correlation id instead of NULL (finding F-05). User-scoped tables are
 *   attributed from the token itself.
 */
export const createDataClient = cache(async () => {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return await createClient();
  const service = createSupabaseClient<Database>(
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
  const user = await createClient();

  // Same client shape for every caller; only .from() picks which connection a table uses.
  return new Proxy(service, {
    get(target, prop) {
      if (prop === "from") {
        return (table: string) =>
          USER_SCOPED_TABLES.has(table) ? user.from(table as never) : target.from(table as never);
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
});
