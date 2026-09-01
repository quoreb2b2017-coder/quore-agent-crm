import { cache } from "react";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Database client for Server Components and actions.
 * Signed-in users use the service role so RLS JWT-claim policies do not hide rows.
 */
export const createDataClient = cache(async () => {
  const user = await getAuthUser();
  return user ? createServiceClient() : await createClient();
});
