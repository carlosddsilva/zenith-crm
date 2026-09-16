import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

const globalForDb = globalThis as unknown as {
  postgresClient?: ReturnType<typeof postgres>;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const client =
  globalForDb.postgresClient ??
  postgres(databaseUrl, {
    max: positiveInteger(process.env.DATABASE_POOL_MAX, 10),
    idle_timeout: positiveInteger(process.env.DATABASE_IDLE_TIMEOUT_SECONDS, 20),
    connect_timeout: positiveInteger(process.env.DATABASE_CONNECT_TIMEOUT_SECONDS, 10),
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.postgresClient = client;
}

export const db = drizzle(client, {
  schema,
});
