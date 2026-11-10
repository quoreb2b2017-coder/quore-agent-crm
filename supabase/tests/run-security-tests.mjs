// Security acceptance tests for the WorkTrack database layer (master prompt §20).
//
// Applies every migration plus seed.sql to an in-memory Postgres (PGlite),
// then exercises RLS, triggers and compliance rules as different callers:
//   asUser(employee)  -> role "authenticated" with that employee's JWT claims
//   asService(actor)  -> role "service_role", optionally with x-worktrack-actor
//
// Run: npm run test:security
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const db = new PGlite({ extensions: { citext, pgcrypto } });

async function applySql(label, sql) {
  try {
    await db.exec(sql);
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

await applySql("stub", readFileSync(join(here, "supabase-stub.sql"), "utf8"));
const migrations = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
for (const file of migrations) {
  await applySql(file, readFileSync(join(root, "migrations", file), "utf8"));
}
// seed.sql runs after migrations in a fresh project; re-apply the staff
// least-privilege cleanup the way `supabase db reset` would see it.
await applySql("seed.sql", readFileSync(join(root, "seed.sql"), "utf8"));

// ------------------------------------------------------------ fixtures
async function makeEmployee(code, roleKey, extra = {}) {
  const authId = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [authId, `${code}@example.test`]);
  const {
    rows: [emp],
  } = await db.query(
    `insert into public.employees (auth_user_id, employee_code, full_name, email, salary, employment_status)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [authId, code, code, `${code}@example.test`, extra.salary ?? 50000, extra.status ?? "ACTIVE"]
  );
  await db.query(
    `insert into public.employee_roles (employee_id, role_id, is_primary)
     select $1, id, true from public.roles where role_key = $2`,
    [emp.id, roleKey]
  );
  return { id: emp.id, authId, code, roleKey };
}

const admin = await makeEmployee("ADM1", "SUPER_ADMIN", { salary: 0 });
const hr = await makeEmployee("HR1", "HR");
const agent = await makeEmployee("AGT1", "AGENT", { salary: 30000 });
const agent2 = await makeEmployee("AGT2", "AGENT", { salary: 32000 });
const leaver = await makeEmployee("LVR1", "AGENT");

await db.query(
  `insert into public.salary_slips (employee_id, period_month, period_year, gross_amount, net_amount)
   values ($1, 9, 2026, 32000, 30000), ($2, 9, 2026, 30000, 28000)`,
  [agent2.id, agent.id]
);

// ------------------------------------------------------------ callers
function claimsFor(emp, overrides = {}) {
  return JSON.stringify({
    sub: emp.authId,
    role: "authenticated",
    employee_id: emp.id,
    role_key: emp.roleKey,
    ...overrides,
  });
}

async function asUser(emp, fn, overrides) {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [claimsFor(emp, overrides)]);
    await db.exec("set local role authenticated");
    return await fn();
  } finally {
    await db.exec("rollback");
  }
}

async function asService(actorId, fn) {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
    await db.query("select set_config('request.headers', $1, true)", [
      JSON.stringify(actorId ? { "x-worktrack-actor": actorId, "x-request-id": "req-test-1" } : {}),
    ]);
    await db.exec("set local role service_role");
    return await fn();
  } finally {
    await db.exec("rollback");
  }
}

async function asServiceCommit(actorId, fn) {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
    await db.query("select set_config('request.headers', $1, true)", [
      JSON.stringify(actorId ? { "x-worktrack-actor": actorId, "x-request-id": "req-test-2" } : {}),
    ]);
    await db.exec("set local role service_role");
    const out = await fn();
    await db.exec("commit");
    return out;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

const q = (sql, params) => db.query(sql, params).then((r) => r.rows);

async function rejects(fn) {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

// ------------------------------------------------------------ tests
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
}
function expect(cond, message) {
  if (!cond) throw new Error(message);
}

await test("F-03 an agent cannot read another employee's payslip", async () => {
  const rows = await asUser(agent, () => q("select employee_id from public.salary_slips"));
  expect(rows.every((r) => r.employee_id === agent.id), `agent saw ${rows.length} slips incl. others`);
  expect(rows.length === 1, "agent should still see their own slip");
});

await test("F-03 an agent cannot read other employees' salary column", async () => {
  const rows = await asUser(agent, () => q("select id from public.employees"));
  expect(rows.length === 1 && rows[0].id === agent.id, `agent saw ${rows.length} employee rows`);
});

await test("F-03 an agent cannot edit attendance", async () => {
  const rows = await asUser(agent, () =>
    q(
      `insert into public.attendance (employee_id, attendance_date, status) values ($1, current_date, 'PRESENT') returning id`,
      [agent2.id]
    ).catch(() => [])
  );
  expect(rows.length === 0, "agent inserted attendance for a colleague");
});

await test("F-03 staff roles hold no restricted permissions after seed", async () => {
  const rows = await q(
    `select r.role_key, p.permission_key from public.role_permissions rp
     join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
     where r.role_key in ('AGENT','DATABASE','EMAIL_MARKETING')
       and p.permission_key in ('salary.view','attendance.manage','activity.manage','leave.approve','policies.manage')`
  );
  expect(rows.length === 0, `found ${rows.length} restricted grants`);
});

await test("F-04 HR cannot make themselves Super Admin", async () => {
  const blocked = await rejects(() =>
    asUser(hr, () =>
      q(
        `update public.employee_roles set role_id = (select id from public.roles where role_key = 'SUPER_ADMIN')
         where employee_id = $1 returning id`,
        [hr.id]
      ).then((rows) => {
        if (rows.length === 0) throw new Error("no rows");
      })
    )
  );
  expect(blocked, "HR changed their own role");
});

await test("F-04 HR cannot change their own salary", async () => {
  const rows = await asUser(hr, () =>
    q("update public.employees set salary = 999999 where id = $1 returning id", [hr.id])
  );
  expect(rows.length === 0, "HR updated own employee row");
});

await test("F-04 a manager-level approver cannot approve their own leave", async () => {
  const rows = await asUser(hr, () =>
    q(
      `select count(*)::int as n from pg_policies where tablename = 'leave_requests'
       and policyname = 'leave_requests_approve' and qual like '%jwt_employee_id%'`
    )
  );
  expect(rows[0].n === 1, "approve policy does not exclude self");
});

await test("F-06 a terminated employee loses API access immediately", async () => {
  await q("update public.employees set employment_status = 'TERMINATED' where id = $1", [leaver.id]);
  const rows = await asUser(leaver, () => q("select id from public.employees"));
  expect(rows.length === 0, "terminated employee still reads their row");
  const perms = await asUser(leaver, () => q("select public.has_permission('attendance.view') as ok"));
  expect(perms[0].ok === false, "terminated employee still holds permissions");
});

await test("F-06 a forged role_key / permissions claim grants nothing", async () => {
  const rows = await asUser(
    agent,
    () => q("select employee_id from public.salary_slips"),
    { role_key: "SUPER_ADMIN", permissions: ["salary.view", "payroll.manage"] }
  );
  expect(rows.every((r) => r.employee_id === agent.id), "claims overrode live permissions");
});

await test("F-12 users cannot enumerate another employee's permissions", async () => {
  const denied = await rejects(() =>
    asUser(agent, () => q("select public.get_employee_permissions($1)", [admin.id]))
  );
  expect(denied, "get_employee_permissions is callable by authenticated");
});

await test("F-05 app writes record the acting employee and request id", async () => {
  await asServiceCommit(admin.id, () =>
    q("update public.employees set phone = '+91-0000000000' where id = $1", [agent.id])
  );
  const [row] = await q(
    `select actor_employee_id, actor_source, request_id, row_hash from public.audit_logs
     where table_name = 'employees' and record_id = $1 order by seq desc limit 1`,
    [agent.id]
  );
  expect(row?.actor_employee_id === admin.id, `actor was ${row?.actor_employee_id}`);
  expect(row.actor_source === "app_server" && row.request_id === "req-test-2", "attribution fields missing");
  expect(/^[0-9a-f]{64}$/.test(row.row_hash ?? ""), "row not sealed into hash chain");
});

await test("F-05 attendance corrections are audited", async () => {
  await asServiceCommit(admin.id, () =>
    q(`insert into public.attendance (employee_id, attendance_date, status) values ($1, current_date, 'HALF_DAY')`, [agent.id])
  );
  const rows = await q("select 1 from public.audit_logs where table_name = 'attendance'");
  expect(rows.length > 0, "no audit row for attendance");
});

await test("F-05 audit log rows cannot be updated or deleted, even by the service role", async () => {
  const upd = await rejects(() => asService(null, () => q("update public.audit_logs set action = 'x'")));
  const del = await rejects(() => asService(null, () => q("delete from public.audit_logs")));
  const usr = await rejects(() => asUser(admin, () => q("delete from public.audit_logs")));
  expect(upd && del && usr, `update blocked=${upd} delete blocked=${del} user delete blocked=${usr}`);
});

await test("F-05 audit chain verifies, and detects tampering by the table owner", async () => {
  const ok = await q("select * from public.verify_audit_chain(1)");
  expect(ok.length === 0, `chain broken: ${JSON.stringify(ok[0])}`);
  // Simulate an owner bypassing the trigger.
  await db.exec("alter table public.audit_logs disable trigger trg_audit_logs_no_update");
  await db.exec(
    "update public.audit_logs set new_data = '{}'::jsonb where seq = (select min(seq) from public.audit_logs where row_hash is not null)"
  );
  await db.exec("alter table public.audit_logs enable trigger trg_audit_logs_no_update");
  const broken = await q("select * from public.verify_audit_chain(1)");
  expect(broken.length === 1 && broken[0].reason === "row content changed", "tampering not detected");
});

await test("Compliance records are hidden from users without compliance permissions", async () => {
  const rows = await asUser(hr, () => q("select id from public.compliance_controls"));
  expect(rows.length === 0, `HR saw ${rows.length} controls`);
  const adminRows = await asUser(admin, () => q("select id from public.compliance_controls"));
  expect(adminRows.length > 30, "Super Admin cannot see the control register");
});

await test("A control cannot be marked operating without accepted evidence and a passing test", async () => {
  const blocked = await rejects(() =>
    asUser(admin, () =>
      q("update public.compliance_controls set status = 'OPERATING_EVIDENCED' where control_code = 'WT-IAM-03'")
    )
  );
  expect(blocked, "status gate allowed OPERATING_EVIDENCED without proof");
});

await test("Evidence cannot be reviewed by its collector and its content is immutable", async () => {
  const [ctl] = await q("select id from public.compliance_controls where control_code = 'WT-IAM-06'");
  const [ev] = await q(
    `insert into public.evidence_items (control_id, title, evidence_type, collection_method, source_system, collected_by)
     values ($1, 'Q3 access review', 'DOCUMENT', 'MANUAL_UPLOAD', 'Google Drive', $2) returning id`,
    [ctl.id, admin.id]
  );
  const selfReview = await rejects(() =>
    asService(admin.id, () =>
      q("update public.evidence_items set status = 'ACCEPTED' where id = $1", [ev.id])
    )
  );
  expect(selfReview, "collector accepted their own evidence");
  const rewrite = await rejects(() =>
    asService(hr.id, () => q("update public.evidence_items set title = 'edited' where id = $1", [ev.id]))
  );
  expect(rewrite, "evidence content was rewritten");
  const del = await rejects(() => q("delete from public.evidence_items where id = $1", [ev.id]));
  expect(del, "evidence was deleted");
});

await test("Control tests are append-only and independence is computed", async () => {
  const [ctl] = await q("select id from public.compliance_controls where control_code = 'WT-IAM-06'");
  await q("update public.compliance_controls set owner_employee_id = $1 where id = $2", [admin.id, ctl.id]);
  const [t] = await q(
    `insert into public.control_tests (control_id, executed_by, execution_identity, method, result, is_independent)
     values ($1, $2, 'manual', 'INSPECTION', 'PASS', true) returning id, is_independent`,
    [ctl.id, admin.id]
  );
  expect(t.is_independent === false, "owner's own test was recorded as independent");
  const upd = await rejects(() => q("update public.control_tests set result = 'FAIL' where id = $1", [t.id]));
  expect(upd, "control test was modified");
});

await test("Automated control checks record real results with evidence", async () => {
  const rows = await asService(null, () => q("select * from public.run_automated_control_checks()"));
  const byCode = Object.fromEntries(rows.map((r) => [r.control_code, r]));
  expect(byCode["WT-IAM-03"]?.result === "PASS", `IAM-03 ${JSON.stringify(byCode["WT-IAM-03"])}`);
  expect(byCode["WT-IAM-04"]?.result === "FAIL", "single Super Admin without SoD exception should fail");
  expect(byCode["WT-IAM-05"]?.result === "FAIL", "terminated employee with live login should fail");
  expect(byCode["WT-IAM-02"]?.result === "FAIL", "Super Admin without MFA should fail");
  expect(byCode["WT-LOG-02"]?.result === "FAIL", "tampered chain from the previous test should fail");
});

await test("Users cannot run the automation or forge control tests", async () => {
  const run = await rejects(() => asUser(hr, () => q("select * from public.run_automated_control_checks()")));
  const forge = await rejects(() =>
    asUser(hr, () =>
      q(
        `insert into public.control_tests (control_id, execution_identity, method, result)
         select id, 'x', 'AUTOMATED', 'PASS' from public.compliance_controls limit 1`
      ).then((rows) => {
        if (rows.length === 0) throw new Error("none");
      })
    )
  );
  expect(run && forge, `run blocked=${run} forge blocked=${forge}`);
});

await test("Statement of Applicability covers all 93 Annex A controls", async () => {
  const [row] = await q("select count(*)::int as n from public.soa_entries");
  expect(row.n === 93, `SoA has ${row.n} rows`);
});

await test("Second-factor status is readable by the server only", async () => {
  await q("insert into auth.mfa_factors (user_id, status) values ($1, 'verified')", [hr.authId]);
  const serverSees = await asService(null, () => q("select public.has_verified_mfa($1) as on", [hr.authId]));
  const userBlocked = await rejects(() => asUser(agent, () => q("select public.has_verified_mfa($1)", [hr.authId])));
  const none = await asService(null, () => q("select public.has_verified_mfa($1) as on", [agent.authId]));
  expect(serverSees[0].on === true && none[0].on === false, "has_verified_mfa returned the wrong answer");
  expect(userBlocked, "a signed-in user could probe other people's two-factor status");
});

await test("Security events are logged with the actor and cannot be forged by users", async () => {
  const forged = await rejects(() =>
    asUser(agent, () => q("select public.log_security_event($1, 'MFA_RESET', '{}'::jsonb)", [agent2.id]))
  );
  const rows = await asService(admin.id, async () => {
    await q("select public.log_security_event($1, 'MFA_RESET', '{\"factors_removed\":1}'::jsonb)", [agent.id]);
    return q("select actor_employee_id, action, record_id from public.audit_logs where action = 'SECURITY_MFA_RESET'");
  });
  expect(forged, "an agent could write a security event");
  expect(rows.length === 1 && rows[0].actor_employee_id === admin.id && rows[0].record_id === agent.id, "security event not attributed");
});

await test("Onboarding changes are audited with identity and bank numbers redacted", async () => {
  const rows = await asService(hr.id, async () => {
    await q(
      `insert into public.employee_onboarding (employee_id, pan_number, aadhaar_number, bank_account_number)
       values ($1, 'ABCDE1234F', '123412341234', '0011223344556677')`,
      [agent.id]
    );
    return q("select actor_employee_id, new_data from public.audit_logs where table_name = 'employee_onboarding'");
  });
  expect(rows.length === 1 && rows[0].actor_employee_id === hr.id, "onboarding change not audited with actor");
  const data = rows[0].new_data;
  expect(data.pan_number === "***4F" && data.aadhaar_number === "***1234" && data.bank_account_number === "***6677", `not redacted: ${JSON.stringify(data)}`);
});

await test("Sign-in attempts, presence, salary requests and acknowledgements are server-only", async () => {
  for (const table of ["auth_sign_in_attempts", "employee_presence", "salary_change_requests", "policy_acknowledgements"]) {
    const read = await rejects(() => asUser(agent, () => q(`select * from public.${table}`)));
    const write = await rejects(() =>
      asUser(admin, () => q(`insert into public.${table} default values`))
    );
    expect(read && write, `${table} is reachable by a signed-in user`);
  }
});

await test("A salary change cannot be decided by the person who asked for it", async () => {
  const selfDecided = await rejects(() =>
    asService(hr.id, () =>
      q(
        `insert into public.salary_change_requests (employee_id, record, requested_by, status, decided_by)
         values ($1, '{}'::jsonb, $2, 'APPROVED', $2)`,
        [agent.id, hr.id]
      )
    )
  );
  const rows = await asService(admin.id, async () => {
    await q(
      `insert into public.salary_change_requests (employee_id, record, requested_by, status, decided_by)
       values ($1, '{}'::jsonb, $2, 'APPROVED', $3)`,
      [agent.id, hr.id, admin.id]
    );
    return q("select 1 from public.audit_logs where table_name = 'salary_change_requests'");
  });
  expect(selfDecided, "the requester approved their own salary change");
  expect(rows.length === 1, "salary change decision not in the audit log");
});

await test("Making someone Super Admin alerts the other Super Admins", async () => {
  const alerts = await asService(admin.id, async () => {
    await q(
      `update public.employee_roles set role_id = (select id from public.roles where role_key = 'SUPER_ADMIN')
       where employee_id = $1`,
      [agent2.id]
    );
    return q("select employee_id, type from public.notifications where title like '%is now a Super Admin'");
  });
  expect(
    alerts.length === 1 && alerts[0].employee_id === admin.id,
    `expected one alert to the existing Super Admin, got ${JSON.stringify(alerts)}`
  );
});

await test("WT-IAM-03 staff roles hold no restricted permission, and cannot be given one", async () => {
  const held = await q(
    `select r.role_key, p.permission_key from public.role_permissions rp
     join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
     where r.role_key not in ('SUPER_ADMIN', 'HR') and public.is_restricted_permission(p.permission_key)`
  );
  const regrant = await rejects(() =>
    asService(admin.id, () =>
      q(
        `insert into public.role_permissions (role_id, permission_id)
         select r.id, p.id from public.roles r, public.permissions p
         where r.role_key = 'AGENT' and p.permission_key = 'salary.view'`
      )
    )
  );
  const hrStillAllowed = await asService(admin.id, async () => {
    await q(
      `insert into public.role_permissions (role_id, permission_id)
       select r.id, p.id from public.roles r, public.permissions p
       where r.role_key = 'HR' and p.permission_key = 'leave.approve'
       on conflict do nothing`
    );
    return true;
  });
  expect(held.length === 0, `staff roles still hold: ${JSON.stringify(held)}`);
  expect(regrant, "salary.view could be given to the Agent role");
  expect(hrStillAllowed, "HR could not be given leave.approve");
});

await test("Role changes outside WorkTrack alert Super Admin once; changes in the app do not", async () => {
  const outside = await asService(null, async () => {
    await q(
      `delete from public.role_permissions
       where role_id = (select id from public.roles where role_key = 'AGENT')`
    );
    return q("select employee_id from public.notifications where title = 'Role permissions changed outside WorkTrack'");
  });
  const inApp = await asService(admin.id, async () => {
    await q(
      `delete from public.role_permissions
       where role_id = (select id from public.roles where role_key = 'AGENT')`
    );
    return q("select 1 from public.notifications where title = 'Role permissions changed outside WorkTrack'");
  });
  expect(outside.length === 1 && outside[0].employee_id === admin.id, `expected one alert, got ${outside.length}`);
  expect(inApp.length === 0, "a change made in the app raised the outside-WorkTrack alert");
});

// F-02: tables the app now reads and writes with the signed-in person's own token.
await test("F-02 chat is private to the two people in it, enforced by the database", async () => {
  const convo = await asUser(agent, async () => {
    const [a, b] = [agent.id, agent2.id].sort();
    const [row] = await q(
      `insert into public.chat_conversations (participant_a, participant_b) values ($1, $2) returning id`,
      [a, b]
    );
    await q(`insert into public.chat_messages (conversation_id, sender_id, body) values ($1, $2, 'hello')`, [row.id, agent.id]);
    await q(
      `insert into public.chat_reads (conversation_id, employee_id, last_read_at) values ($1, $2, now())`,
      [row.id, agent.id]
    );
    const mine = await q(`select body from public.chat_messages where conversation_id = $1`, [row.id]);
    return { id: row.id, mine };
  });
  expect(convo.mine.length === 1, "a participant could not read their own chat");
  const forged = await rejects(() =>
    asUser(agent, () =>
      q(
        `insert into public.chat_conversations (participant_a, participant_b) values ($1, $2)`,
        [hr.id, admin.id].sort()
      )
    )
  );
  expect(forged, "someone could open a chat between two other people");
});

await test("F-02 outsiders and HR cannot read a chat they are not in", async () => {
  const [a, b] = [agent.id, agent2.id].sort();
  await asServiceCommit(null, () =>
    q(`insert into public.chat_conversations (participant_a, participant_b) values ($1, $2) on conflict do nothing`, [a, b])
  );
  await asServiceCommit(null, () =>
    q(
      `insert into public.chat_messages (conversation_id, sender_id, body)
       select id, $1, 'private' from public.chat_conversations where participant_a = $2 and participant_b = $3`,
      [agent.id, a, b]
    )
  );
  const hrSees = await asUser(hr, () => q("select 1 from public.chat_messages where body = 'private'"));
  const leaverSees = await asUser(leaver, () => q("select 1 from public.chat_messages where body = 'private'"));
  const peerSees = await asUser(agent2, () => q("select 1 from public.chat_messages where body = 'private'"));
  expect(hrSees.length === 0 && leaverSees.length === 0, "a non-participant could read a private chat");
  expect(peerSees.length === 1, "the other participant could not read the chat");
});

await test("F-02 departments, leave balances and role permissions follow role rules", async () => {
  const hrDept = await asUser(hr, () => q(`insert into public.departments (name) values ('QA Team') returning id`));
  const staffDept = await rejects(() => asUser(agent, () => q(`insert into public.departments (name) values ('Rogue')`)));
  const staffBalance = await rejects(() =>
    asUser(agent, async () => {
      const rows = await q(`update public.leave_balances set allocated_days = 99 where employee_id = $1 returning id`, [agent.id]);
      if (rows.length === 0) throw new Error("no row changed");
    })
  );
  const staffPerm = await rejects(() =>
    asUser(agent, () =>
      q(
        `insert into public.role_permissions (role_id, permission_id)
         select r.id, p.id from public.roles r, public.permissions p
         where r.role_key = 'AGENT' and p.permission_key = 'tasks.view' on conflict do nothing`
      )
    )
  );
  const adminPerm = await asUser(admin, async () => {
    await q(
      `insert into public.role_permissions (role_id, permission_id)
       select r.id, p.id from public.roles r, public.permissions p
       where r.role_key = 'AGENT' and p.permission_key = 'tasks.view' on conflict do nothing`
    );
    return true;
  });
  const readable = await asUser(agent, () => q("select 1 from public.leave_types limit 1"));
  expect(hrDept.length === 1, "HR could not add a department");
  expect(staffDept, "staff could add a department");
  expect(staffBalance, "staff could change their own leave balance");
  expect(staffPerm, "staff could change role permissions");
  expect(adminPerm, "Super Admin could not change role permissions");
  expect(readable.length === 1, "staff could not read leave types");
});

await test("app_settings can be read by anyone signed in but changed only by Super Admin", async () => {
  const staffRead = await asUser(agent, () => q("select 1 from public.app_settings"));
  const staffWrite = await asUser(agent, () =>
    q("update public.app_settings set login_minutes = 0 returning id")
  );
  const adminWrite = await asUser(admin, () =>
    q("update public.app_settings set login_minutes = login_minutes returning id")
  );
  expect(staffRead.length === 1, "staff could not read settings");
  expect(staffWrite.length === 0, "staff changed the company shift settings");
  expect(adminWrite.length === 1, "Super Admin could not change the settings");
});

// ------------------------------------------------------------ report
let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`  ok    ${r.name}`);
  else {
    failed += 1;
    console.log(`  FAIL  ${r.name}\n        ${r.error}`);
  }
}
console.log(`\n${results.length - failed}/${results.length} security tests passed`);
process.exit(failed ? 1 : 0);
