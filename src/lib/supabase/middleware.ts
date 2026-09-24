import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  accessTokenFromCookieList,
  hasAuthCookie,
  isAccessTokenExpiringSoon,
  postLoginPath,
  readWorktrackJwtClaims,
} from "@/lib/auth/jwt-claims";

const PROTECTED_PREFIXES = ["/admin", "/portal"];

function redirectTo(
  request: NextRequest,
  pathname: string,
  cookies?: NextResponse["cookies"],
  params?: Record<string, string>
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  const response = NextResponse.redirect(url);
  if (cookies) {
    cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie);
    });
  }
  return response;
}

/**
 * Fast path: gate protected routes from cookies/JWT locally.
 * Only talks to Supabase Auth when the access token is missing or near expiry.
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes handle their own auth; skip session refresh overhead.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const cookieList = request.cookies.getAll();
  const signedIn = hasAuthCookie(cookieList);
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!signedIn && isProtected) {
    return redirectTo(request, "/login", undefined, { next: pathname });
  }

  if (!signedIn) {
    return NextResponse.next();
  }

  const accessToken = accessTokenFromCookieList(cookieList);
  const claims = readWorktrackJwtClaims(accessToken);
  const needsRefresh = isAccessTokenExpiringSoon(accessToken, 120);

  if (!needsRefresh) {
    if (pathname === "/login" || pathname === "/") {
      return redirectTo(request, postLoginPath(claims.roleKey));
    }
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user && isProtected) {
    return redirectTo(request, "/login", supabaseResponse.cookies, { next: pathname });
  }

  if (session?.user && (pathname === "/login" || pathname === "/")) {
    const refreshedClaims = readWorktrackJwtClaims(session.access_token);
    return redirectTo(
      request,
      postLoginPath(refreshedClaims.roleKey ?? claims.roleKey),
      supabaseResponse.cookies
    );
  }

  return supabaseResponse;
}
