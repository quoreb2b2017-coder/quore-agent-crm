import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
});

export type VerifiedAuthUser = {
  id: string;
  email: string | null;
};

/**
 * Returns the signed-in user ONLY after the access token's signature has been
 * verified (getClaims verifies against the project's JWKS, or falls back to a
 * round-trip to the Auth server for legacy symmetric keys).
 *
 * SECURITY (finding F-01): never derive identity on the server from
 * `auth.getSession()` or by base64-decoding the cookie. Both read the cookie
 * as-is, so a hand-crafted cookie would be accepted as any user/role.
 */
export const getVerifiedClaims = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims as Record<string, unknown> & { sub: string; email?: string };
});

export const getAuthUser = cache(async (): Promise<VerifiedAuthUser | null> => {
  const claims = await getVerifiedClaims();
  if (!claims) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
});
