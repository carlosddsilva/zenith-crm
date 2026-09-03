import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("ERROR DATABASE_URL is not configured");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 5,
  idle_timeout: 5,
  prepare: false,
});

try {
  const [database] = await sql`
    select
      current_database() as database,
      current_user as username,
      current_setting('server_version') as postgres_version
  `;

  const extensions = await sql`
    select extname
    from pg_extension
    where extname in ('pgcrypto', 'uuid-ossp', 'vector')
    order by extname
  `;

  console.log(`OK  Database: ${database.database}`);
  console.log(`OK  User: ${database.username}`);
  console.log(`OK  PostgreSQL: ${database.postgres_version}`);
  console.log(
    `OK  Extensions: ${extensions.map((row) => row.extname).join(", ") || "none"}`
  );
} catch (error) {
  console.error("ERROR PostgreSQL direct connection failed");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
