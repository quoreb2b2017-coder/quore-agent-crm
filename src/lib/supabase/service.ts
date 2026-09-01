import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

let serviceClient: ReturnType<typeof createSupabaseClient<Database>> | null = null;

/**
 * Service-role client. Bypasses RLS entirely — never import this from a
 * Client Component and never forward its results without an explicit
 * authorization check.
 */
export function createServiceClient() {
  if (serviceClient) return serviceClient;
  serviceClient = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  return serviceClient;
}
