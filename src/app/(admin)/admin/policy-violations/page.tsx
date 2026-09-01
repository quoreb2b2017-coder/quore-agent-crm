import { redirect } from "next/navigation";

export default function AdminPolicyViolationsRedirect() {
  redirect("/admin/dashboard");
}
