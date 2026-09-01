import { requireViewer } from "@/lib/permissions/server";
import { SettingsNav } from "@/components/profile/settings-nav";
import { ChangePasswordForm } from "@/components/profile/change-password-form";

export default async function AdminPasswordPage() {
  await requireViewer();

  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <SettingsNav
        profileHref="/admin/settings"
        passwordHref="/admin/password"
        active="password"
      />
      <div className="px-6 py-6 sm:max-w-xl sm:px-8 sm:py-8">
        <h1 className="text-lg font-semibold tracking-tight">Password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use at least 4 characters. You can show the password while typing. You stay signed in after updating.
        </p>
        <div className="mt-6">
          <ChangePasswordForm />
        </div>
      </div>
    </section>
  );
}
