import { mkdirSync, createWriteStream, renameSync, unlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const backupDir = resolve(process.argv[2] || "backups");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const finalPath = join(backupDir, `zenith-${timestamp}.dump`);
const partialPath = `${finalPath}.partial`;
const user = process.env.POSTGRES_USER || "zenith";
const database = process.env.POSTGRES_DB || "zenith_crm";

mkdirSync(backupDir, { recursive: true });
const output = createWriteStream(partialPath, { flags: "wx" });
const child = spawn("docker", [
  "compose", "--env-file", ".env.local", "exec", "-T", "postgres",
  "pg_dump", "-U", user, "-d", database, "--format=custom", "--compress=6",
  "--no-owner", "--no-acl",
], { stdio: ["ignore", "pipe", "inherit"] });

child.stdout.pipe(output);
const outputDone = new Promise((resolveOutput, rejectOutput) => {
  output.on("close", resolveOutput);
  output.on("error", rejectOutput);
});
const exitCode = await new Promise((resolveExit, rejectExit) => {
  child.on("error", rejectExit);
  child.on("close", resolveExit);
});
await outputDone;

if (exitCode !== 0) {
  try { unlinkSync(partialPath); } catch {}
  process.exit(exitCode || 1);
}
renameSync(partialPath, finalPath);
console.log(`Backup created: ${basename(finalPath)}`);
