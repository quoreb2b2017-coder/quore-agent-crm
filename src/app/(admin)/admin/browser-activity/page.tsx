import { redirect } from "next/navigation";

export default function BrowserActivityRemovedPage() {
  redirect("/admin/dashboard");
}
