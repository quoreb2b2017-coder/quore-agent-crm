"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { readWorktrackJwtClaims } from "@/lib/auth/jwt-claims";
import { notifyAdminsOfAction, notifySuperAdmins, SECURITY_ALERT_TYPE } from "@/lib/realtime/notify";

/** Wrong passwords for one email inside the window before sign-in stops. */
const LOCK_AFTER = 10;
/** Wrong passwords for one email that alert Super Admin. */
const ALERT_AFTER = 5;
/** Attempts from one address, any email, before it is stopped too. */
const IP_LOCK_AFTER = 30;
const WINDOW_MS = 15 * 60 * 1000;

type SignInResult = { error?: string; roleKey?: string | null };

async function requestOrigin() {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || list.get("x-real-ip") || null,
    userAgent: list.get("user-agent")?.slice(0, 300) ?? null,
  };
}

/** Wrong passwords since the last success inside the window, so a correct sign-in resets the count. */
async function recentFailures(column: "email" | "ip", value: string) {
  const service = createServiceClient();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data } = await service
    .from("auth_sign_in_attempts")
    .select("succeeded, created_at")
    .eq(column, value)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = data ?? [];
  const lastSuccess = rows.findIndex((row) => row.succeeded);
  return (lastSuccess === -1 ? rows : rows.slice(0, lastSuccess)).length;
}

/**
 * Password sign-in on the server, so every attempt is really recorded and the lockout cannot be
 * skipped from the browser. Supabase Auth's own rate limits still apply on top.
 */
export async function signInWithPassword(emailInput: string, password: string): Promise<SignInResult> {
  const email = emailInput.trim().toLowerCase();
  if (!email || !password) return { error: "Email or password was empty. Type both fields, then Continue." };

  const { ip, userAgent } = await requestOrigin();
  const [emailFailures, ipFailures] = await Promise.all([
    recentFailures("email", email),
    ip ? recentFailures("ip", ip) : Promise.resolve(0),
  ]);
  if (emailFailures >= LOCK_AFTER || ipFailures >= IP_LOCK_AFTER) {
    return { error: "Too many wrong passwords. Wait 15 minutes, or use Forgot password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  const service = createServiceClient();
  await service
    .from("auth_sign_in_attempts")
    .insert({ email, ip, user_agent: userAgent, succeeded: !error });

  if (error) {
    const failures = emailFailures + 1;
    if (failures === ALERT_AFTER || failures === LOCK_AFTER) {
      await notifySuperAdmins({
        type: SECURITY_ALERT_TYPE,
        title: failures === LOCK_AFTER ? `Sign-in locked for ${email}` : `${failures} wrong passwords for ${email}`,
        body:
          failures === LOCK_AFTER
            ? `${LOCK_AFTER} wrong passwords in 15 minutes. Sign-in is stopped for 15 minutes.${ip ? ` Last from ${ip}.` : ""}`
            : `${failures} wrong passwords in 15 minutes.${ip ? ` Last from ${ip}.` : ""}`,
      }).catch(() => undefined);
    }
    const message = error.message.toLowerCase();
    if (error.message === "Invalid login credentials") return { error: "Invalid email or password." };
    if (message.includes("banned") || message.includes("blocked")) {
      return { error: "This account is blocked. Contact Super Admin." };
    }
    return { error: error.message };
  }

  if (data.user) {
    const { data: employee } = await service
      .from("employees")
      .select("id, full_name, employee_code")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();
    if (employee) {
      notifyAdminsOfAction(
        { employeeId: employee.id, fullName: employee.full_name, employeeCode: employee.employee_code },
        "logged in",
        { type: "EMPLOYEE_LOGIN" }
      );
    }
  }

  return { roleKey: readWorktrackJwtClaims(data.session?.access_token).roleKey ?? null };
}
