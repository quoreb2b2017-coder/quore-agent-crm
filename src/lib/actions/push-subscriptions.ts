"use server";

import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { vapidPublicKey } from "@/lib/env";
import { sendTestWebPush } from "@/lib/push/web-push-server";

export type PushActionState = { error?: string; success?: boolean };

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(500).optional(),
});

/** Public VAPID key for the browser PushManager.subscribe call. */
export async function getPushPublicKey(): Promise<{ publicKey: string | null }> {
  return { publicKey: vapidPublicKey() };
}

/** Upsert this browser's push subscription for the signed-in employee. */
export async function savePushSubscription(
  input: z.infer<typeof subscriptionSchema>
): Promise<PushActionState> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };

  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid subscription" };

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      employee_id: ctx.employeeId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: parsed.data.userAgent ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  if (error) return { error: error.message };
  return { success: true };
}

/** Test alert to this browser. Only ever reaches a subscription of the signed-in person. */
export async function sendTestPushNotification(endpoint: string): Promise<PushActionState> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { data: subscription } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("employee_id", ctx.employeeId)
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (!subscription) return { error: "This browser is not registered yet. Turn desktop alerts on first." };

  const result = await sendTestWebPush(subscription);
  return result.error ? { error: result.error } : { success: true };
}

/** Remove this browser endpoint (permission revoked or user opted out). */
export async function removePushSubscription(endpoint: string): Promise<PushActionState> {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return { error: "Not authenticated" };
  if (!endpoint) return { error: "Missing endpoint" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("employee_id", ctx.employeeId)
    .eq("endpoint", endpoint);
  if (error) return { error: error.message };
  return { success: true };
}
