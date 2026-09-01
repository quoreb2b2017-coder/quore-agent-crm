/**
 * One-off bootstrap script: creates the first SUPER_ADMIN auth user +
 * employee record + role assignment. Run once per environment after
 * migrations + seed.sql have been applied.
 *
 *   npx tsx scripts/create-super-admin.ts --email you@company.com --password "..." --name "Your Name"
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const email = getArg("--email");
  const password = getArg("--password");
  const fullName = getArg("--name") ?? "Super Admin";

  if (!email || !password) {
    console.error(
      'Usage: npx tsx scripts/create-super-admin.ts --email you@company.com --password "..." --name "Your Name"'
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing } = await supabase.auth.admin.listUsers();
  const already = existing?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  let userId = already?.id;

  if (!userId) {
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError || !authUser.user) {
      console.error("Failed to create auth user:", authError?.message);
      process.exit(1);
    }
    userId = authUser.user.id;
  } else {
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (updateError) {
      console.error("Failed to update auth user:", updateError.message);
      process.exit(1);
    }
  }

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("role_key", "SUPER_ADMIN")
    .single();

  if (roleError || !role) {
    console.error(
      "Auth user is ready, but employee/role could not be written:",
      roleError?.message
    );
    console.error(
      "Run scripts/create-super-admin.sql in the Supabase SQL Editor, then re-run this script."
    );
    console.log(`Auth user created/updated: ${email} (${userId})`);
    process.exit(1);
  }

  const employeeCode = `EMP-${Date.now().toString().slice(-6)}`;

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .insert({
      auth_user_id: userId,
      employee_code: employeeCode,
      full_name: fullName,
      email,
      employment_status: "ACTIVE",
    })
    .select("id")
    .single();

  if (employeeError || !employee) {
    console.error("Failed to create employee record:", employeeError?.message);
    process.exit(1);
  }

  const { error: assignError } = await supabase.from("employee_roles").insert({
    employee_id: employee.id,
    role_id: role.id,
    is_primary: true,
  });

  if (assignError) {
    console.error("Failed to assign SUPER_ADMIN role:", assignError.message);
    process.exit(1);
  }

  console.log(`Super Admin created: ${email} (employee_code: ${employeeCode})`);
}

main();
