import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const dumpPath = resolve(process.argv[2] || "");
if (!process.argv[2] || !existsSync(dumpPath)) {
  console.error("Usage: npm run db:restore:test -- <backup.dump>");
  process.exit(2);
}

const container = `zenith-restore-test-${Date.now()}`;
function run(args, options = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", stdio: "pipe", ...options });
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `docker ${args[0]} failed`);
  return result.stdout?.trim() || "";
}

try {
  run(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=restore-test-only", "pgvector/pgvector:pg16"]);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const check = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], { stdio: "ignore" });
    if (check.status === 0) { ready = true; break; }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }
  if (!ready) throw new Error("Temporary PostgreSQL did not become ready");

  await new Promise((resolveRestore, rejectRestore) => {
    const restore = spawn("docker", ["exec", "-i", container, "pg_restore", "-U", "postgres", "-d", "postgres", "--no-owner", "--no-privileges"], { stdio: ["pipe", "inherit", "inherit"] });
    createReadStream(dumpPath).pipe(restore.stdin);
    restore.on("error", rejectRestore);
    restore.on("close", (code) => code === 0 ? resolveRestore() : rejectRestore(new Error(`pg_restore exited ${code}`)));
  });

  const tableCount = Number(run(["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-Atc", "select count(*) from pg_catalog.pg_tables where schemaname='public'"]));
  if (!Number.isFinite(tableCount) || tableCount === 0) throw new Error("Restore produced no public tables");
  console.log(`Restore test passed: ${tableCount} public tables`);
} finally {
  spawnSync("docker", ["stop", container], { stdio: "ignore" });
}
