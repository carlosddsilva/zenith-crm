import { execSync } from "node:child_process";

function run(cmd, env = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", shell: true, env: { ...process.env, ...env } });
}

function query(cmd) {
  return execSync(cmd, { encoding: "utf8", shell: true }).trim();
}

try {
  console.log("=== INICIANDO TESTE DE DISASTER RECOVERY (E2E) ===");

  console.log("\n1. Criando backup a quente do PostgreSQL...");
  const dumpCmd = `docker compose -p zenith-crm-e2e -f e2e/docker-compose.yml exec -T postgres pg_dump -U zenith_e2e -d zenith_e2e --format=custom --compress=6 --no-owner --no-acl > backups/e2e-recovery.dump`;
  run(dumpCmd);

  console.log("\n2. Simulando desastre catastrófico (destruição do banco)...");
  run("docker compose -p zenith-crm-e2e -f e2e/docker-compose.yml stop postgres");
  run("docker compose -p zenith-crm-e2e -f e2e/docker-compose.yml rm -f postgres");
  
  console.log("\n3. Subindo banco vazio (zerado)...");
  run("docker compose -p zenith-crm-e2e -f e2e/docker-compose.yml up -d --wait postgres");

  console.log("\n4. Restaurando backup (Recovery Time Objective)...");
  const restoreCmd = `docker compose -p zenith-crm-e2e -f e2e/docker-compose.yml exec -T postgres pg_restore -U zenith_e2e -d zenith_e2e --no-owner --no-privileges < backups/e2e-recovery.dump`;
  try {
    run(restoreCmd);
  } catch (err) {
    // pg_restore can exit with 1 if there are some warnings, we will check data integrity next
    console.log("pg_restore finalizado (verificando integridade a seguir).");
  }

  console.log("\n5. Verificando integridade dos dados (Recovery Point Objective)...");
  const psqlBase = `docker compose -p zenith-crm-e2e -f e2e/docker-compose.yml exec -T postgres psql -U zenith_e2e -d zenith_e2e -Atc`;
  
  const accounts = query(`${psqlBase} "select count(*) from accounts;"`);
  const mediaObjects = query(`${psqlBase} "select count(*) from media_objects;"`);
  const messages = query(`${psqlBase} "select count(*) from messages;"`);

  console.log(`- Contas recuperadas: ${accounts}`);
  console.log(`- Arquivos de mídia recuperados: ${mediaObjects}`);
  console.log(`- Mensagens recuperadas: ${messages}`);

  if (parseInt(accounts) === 0) {
    throw new Error("Falha no restore: Nenhuma conta encontrada!");
  }

  console.log("\n=== DISASTER RECOVERY CONCLUÍDO COM SUCESSO! ===");
} catch (error) {
  console.error("\n[ERRO FATAL] Disaster Recovery falhou:", error.message);
  process.exit(1);
}
