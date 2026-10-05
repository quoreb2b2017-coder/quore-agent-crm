/**
 * Creates/updates SUPER_ADMIN for --email, then deletes other SUPER_ADMIN employees + auth users.
 *
 *   npx tsx scripts/replace-super-admin.ts --email you@company.com --password "..." --name "Name"
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const email = getArg("--email")?.trim().toLowerCase();
  const password = getArg("--password");
  const fullName = getArg("--name") ?? "Super Admin";

  if (!email || !password) {
    console.error(
      'Usage: npx tsx scripts/replace-super-admin.ts --email you@company.com --password "..." --name "Your Name"'
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("role_key", "SUPER_ADMIN")
    .single();

  if (roleError || !role) {
    console.error("SUPER_ADMIN role missing:", roleError?.message);
    process.exit(1);
  }

  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listError) {
    console.error("Failed to list auth users:", listError.message);
    process.exit(1);
  }

  const already = listed.users.find((u) => u.email?.toLowerCase() === email);
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
    console.log("Created auth user", email);
  } else {
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      ban_duration: "none",
      user_metadata: { full_name: fullName },
    });
    if (updateError) {
      console.error("Failed to update auth user:", updateError.message);
      process.exit(1);
    }
    console.log("Updated auth user", email);
  }

  const { data: existingEmp } = await supabase
    .from("employees")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let employeeId = existingEmp?.id;

  if (!employeeId) {
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
      console.error("Failed to create employee:", employeeError?.message);
      process.exit(1);
    }
    employeeId = employee.id;
    console.log("Created employee", employeeCode);
  } else {
    const { error: empUpdateError } = await supabase
      .from("employees")
      .update({
        auth_user_id: userId,
        full_name: fullName,
        employment_status: "ACTIVE",
      })
      .eq("id", employeeId);
    if (empUpdateError) {
      console.error("Failed to update employee:", empUpdateError.message);
      process.exit(1);
    }
    console.log("Updated employee", email);
  }

  const { data: assignment } = await supabase
    .from("employee_roles")
    .select("id, role_id, is_primary")
    .eq("employee_id", employeeId)
    .eq("is_primary", true)
    .maybeSingle();

  if (!assignment) {
    const { error: assignError } = await supabase.from("employee_roles").insert({
      employee_id: employeeId,
      role_id: role.id,
      is_primary: true,
    });
    if (assignError) {
      console.error("Failed to assign SUPER_ADMIN:", assignError.message);
      process.exit(1);
    }
  } else if (assignment.role_id !== role.id) {
    const { error: assignError } = await supabase
      .from("employee_roles")
      .update({ role_id: role.id })
      .eq("id", assignment.id);
    if (assignError) {
      console.error("Failed to switch role to SUPER_ADMIN:", assignError.message);
      process.exit(1);
    }
  }

  const { data: superAdmins, error: saError } = await supabase
    .from("employee_roles")
    .select("employee_id")
    .eq("role_id", role.id);

  if (saError) {
    console.error("Failed to list Super Admins:", saError.message);
    process.exit(1);
  }

  const otherIds = [...new Set((superAdmins ?? []).map((row) => row.employee_id))].filter(
    (id) => id !== employeeId
  );

  if (otherIds.length > 0) {
    const { data: others, error: othersError } = await supabase
      .from("employees")
      .select("id, email, full_name, auth_user_id")
      .in("id", otherIds);

    if (othersError) {
      console.error("Failed to load Super Admin employees:", othersError.message);
      process.exit(1);
    }

    for (const record of others ?? []) {
      if (record.email.toLowerCase() === email) continue;
      console.log("Deleting Super Admin", record.email, record.full_name);
      const { error: delEmpError } = await supabase.from("employees").delete().eq("id", record.id);
      if (delEmpError) {
        console.error("Failed to delete employee", record.email, delEmpError.message);
        process.exit(1);
      }
      if (record.auth_user_id) {
        const { error: delAuthError } = await supabase.auth.admin.deleteUser(record.auth_user_id);
        if (delAuthError) {
          console.error("Failed to delete auth user", record.email, delAuthError.message);
          process.exit(1);
        }
      }
    }
  }

  console.log("Done. Super Admin is now", email);
}

main();
