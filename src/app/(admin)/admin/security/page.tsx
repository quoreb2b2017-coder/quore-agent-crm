import { redirect } from "next/navigation";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import { AccountSecurity } from "@/components/security/account-security";

export const metadata = { title: "Account security · WorkTrack" };

export default async function SecurityPage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) redirect("/login");
  return <AccountSecurity ctx={ctx} />;
}
