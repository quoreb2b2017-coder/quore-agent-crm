import { redirect } from "next/navigation";

export default function AdminBreaksRedirect() {
  redirect("/admin/dashboard");
}
