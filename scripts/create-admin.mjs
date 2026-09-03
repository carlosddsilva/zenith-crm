import argon2 from "argon2";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

const email =
  process.env.ZENITH_BOOTSTRAP_EMAIL
    ?.trim()
    .toLowerCase();

const password =
  process.env.ZENITH_BOOTSTRAP_PASSWORD;

const name =
  process.env.ZENITH_BOOTSTRAP_NAME?.trim();

const accountName =
  process.env.ZENITH_BOOTSTRAP_ACCOUNT?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL não configurada.");
}

if (!email || !password || !name || !accountName) {
  throw new Error(
    "Configure ZENITH_BOOTSTRAP_EMAIL, ZENITH_BOOTSTRAP_PASSWORD, ZENITH_BOOTSTRAP_NAME e ZENITH_BOOTSTRAP_ACCOUNT.",
  );
}

if (password.length < 12) {
  throw new Error(
    "A senha inicial deve possuir pelo menos 12 caracteres.",
  );
}

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
});

try {
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const result = await sql.begin(async (tx) => {
    const existing = await tx`
      select id
      from users
      where lower(email) = lower(${email})
      limit 1
    `;

    if (existing.length > 0) {
      throw new Error(
        `Já existe um usuário com o e-mail ${email}.`,
      );
    }

    const [user] = await tx`
      insert into users (
        email,
        name,
        password_hash,
        status
      )
      values (
        ${email},
        ${name},
        ${passwordHash},
        'active'
      )
      returning id, email, name
    `;

    const [account] = await tx`
      insert into accounts (
        name,
        owner_user_id,
        status
      )
      values (
        ${accountName},
        ${user.id},
        'active'
      )
      returning id, name
    `;

    await tx`
      insert into account_members (
        account_id,
        user_id,
        role
      )
      values (
        ${account.id},
        ${user.id},
        'owner'
      )
    `;

    return {
      user,
      account,
    };
  });

  console.log("OK  Zenith administrator created");
  console.log(`OK  User: ${result.user.email}`);
  console.log(`OK  Account: ${result.account.name}`);
} finally {
  await sql.end({ timeout: 2 });
}
