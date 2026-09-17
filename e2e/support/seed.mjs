import argon2 from "argon2";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = postgres(databaseUrl, { max: 1, prepare: false });

export const E2E_PASSWORD = "Zenith-E2E-Only-2026!";

export const E2E_USERS = {
  ownerA: "owner-a@zenith-e2e.invalid",
  agentA: "agent-a@zenith-e2e.invalid",
  ownerB: "owner-b@zenith-e2e.invalid",
  agentB: "agent-b@zenith-e2e.invalid",
  superadmin: "superadmin@zenith-e2e.invalid",
};

export async function seedE2e() {
  const [{ current_database: databaseName }] =
    await sql`select current_database()`;
  if (databaseName !== "zenith_e2e") {
    throw new Error(`Refusing to seed unexpected database: ${databaseName}`);
  }

  const passwordHash = await argon2.hash(E2E_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  return sql.begin(async (tx) => {
    await tx`delete from auth_sessions`;
    await tx`delete from accounts where name like 'Zenith E2E Tenant %'`;
    await tx`delete from users where email like '%@zenith-e2e.invalid'`;

    const insertUser = async (email, name, systemRole = "user") => {
      const [row] = await tx`
        insert into users (email, name, password_hash, status, system_role)
        values (${email}, ${name}, ${passwordHash}, 'active', ${systemRole})
        returning id, email
      `;
      return row;
    };

    const ownerA = await insertUser(E2E_USERS.ownerA, "Owner A");
    const agentA = await insertUser(E2E_USERS.agentA, "Agent A");
    const ownerB = await insertUser(E2E_USERS.ownerB, "Owner B");
    const agentB = await insertUser(E2E_USERS.agentB, "Agent B");
    const superadmin = await insertUser(
      E2E_USERS.superadmin,
      "Platform E2E",
      "superadmin",
    );

    const [accountA] = await tx`
      insert into accounts (name, owner_user_id, status)
      values ('Zenith E2E Tenant A', ${ownerA.id}, 'active')
      returning id, name
    `;
    const [accountB] = await tx`
      insert into accounts (name, owner_user_id, status)
      values ('Zenith E2E Tenant B', ${ownerB.id}, 'active')
      returning id, name
    `;

    await tx`
      insert into account_members (account_id, user_id, role)
      values
        (${accountA.id}, ${ownerA.id}, 'owner'),
        (${accountA.id}, ${agentA.id}, 'agent'),
        (${accountB.id}, ${ownerB.id}, 'owner'),
        (${accountB.id}, ${agentB.id}, 'agent')
    `;

    await tx`
      insert into sla_policies (
        account_id, name, warning_threshold_minutes,
        overdue_threshold_minutes, time_zone, is_default, is_active
      ) values
        (${accountA.id}, 'E2E immediate', 0, 0, 'UTC', true, true),
        (${accountB.id}, 'E2E immediate', 0, 0, 'UTC', true, true)
    `;

    return {
      accountA,
      accountB,
      ownerA,
      agentA,
      ownerB,
      agentB,
      superadmin,
    };
  });
}

export async function closeSeedConnection() {
  await sql.end({ timeout: 2 });
}
