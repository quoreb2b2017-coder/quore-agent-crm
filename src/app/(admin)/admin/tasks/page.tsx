import { redirect } from "next/navigation";

export default function AdminTasksRedirect() {
  redirect("/admin/dashboard");
}
