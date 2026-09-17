# Operação Docker e produção

## Pré-requisitos e configuração

Use Docker com Compose v2, copie `.env.local.example` para `.env.local` e substitua todos os placeholders. Obrigatórias: `POSTGRES_PASSWORD`, `DATABASE_URL`, `REDIS_URL`, `MESSAGING_CREDENTIALS_KEY`, `ENCRYPTION_KEY`, `ZENITH_WORKER_SECRET`, `MESSAGING_WEBHOOK_TOKEN` e `VOICE_WEBHOOK_TOKEN`. `META_APP_SECRET` é obrigatório para canal Meta. `NEXT_PUBLIC_SITE_URL`, locale, portas, `META_APP_ID` e `WACALLS_ALLOWED_ORIGIN` são opcionais conforme o recurso.

Senhas inseridas em `DATABASE_URL` devem estar URL-encoded. Nunca coloque credenciais em variáveis `NEXT_PUBLIC_*`.

## Serviços e persistência

| Serviço | Função | Health |
|---|---|---|
| app | Next.js | `/api/health/live` e `/api/health/ready` |
| postgres | dados duráveis | `pg_isready` |
| redis | realtime/fila | `redis-cli ping` |
| wacalls | voz | `/health/live` |
| voice-events-worker | discovery/eventos | porta interna 3002 `/live`, `/ready` |
| automation-events-worker | fila/outbox | porta interna 3002 `/live`, `/ready` |
| broadcast-worker | recipients PostgreSQL | porta interna 3002 `/live`, `/ready` |

Volumes: `postgres_data`, `redis_data` e `wacalls_data`. Preserve especialmente `postgres_data` e `wacalls_data`; remover volumes perde dados e sessões pareadas.

PostgreSQL, Redis e WaCalls são publicados somente em `127.0.0.1`. A porta do app é pública para receber tráfego do reverse proxy. Em produção, coloque nginx/Caddy/Traefik com TLS, limites de body/timeout e rate limit na frente dela.

## Startup e migrations

```bash
npm ci
npm run db:migrate
docker compose --env-file .env.local build app
docker compose --env-file .env.local up -d
docker compose --env-file .env.local ps
```

Ordem de recuperação: PostgreSQL, Redis, app, workers e WaCalls. `depends_on` ajuda no primeiro startup, mas workers também aplicam reconnect/retry. Execute migrations uma vez antes de promover o app; uma segunda execução deve ser no-op.

## Backup PostgreSQL

```bash
npm run db:backup
# ou destino explícito
npm run db:backup -- D:/backups/zenith
```

O script usa `pg_dump --format=custom`, inclui timestamp, grava primeiro `.partial`, propaga exit code e só renomeia após sucesso. Copie os dumps para armazenamento externo cifrado. Retenção sugerida: 7 diários, 5 semanais e 12 mensais; aplique retenção no destino, não no servidor do banco.

## Teste seguro de restore

```bash
npm run db:restore:test -- backups/zenith-AAAA-MM-DDTHH-MM-SS.dump
```

O teste sobe um contêiner pgvector temporário sem volume nem porta host, restaura o dump, confirma tabelas no schema público e encerra o contêiner. Ele nunca aponta para o banco de desenvolvimento/produção.

## Redis e disaster recovery

Redis usa AOF, mas contém estado transitório. Não restaure Redis como se fosse fonte de verdade. Após perda do Redis, suba PostgreSQL e app; o outbox repõe automações ainda pendentes. A fila `processing` é devolvida no startup do worker. Broadcasts retomam recipients `pending` do PostgreSQL; rows `sent`/`processing` não são reexpedidas automaticamente.

## Restart controlado e diagnóstico

```bash
docker compose --env-file .env.local up -d --no-deps --force-recreate app
docker compose --env-file .env.local up -d --no-deps --force-recreate automation-events-worker broadcast-worker voice-events-worker
docker compose --env-file .env.local ps
docker compose --env-file .env.local logs --since 5m app automation-events-worker broadcast-worker voice-events-worker
```

Não reinicie PostgreSQL, Redis ou WaCalls durante uma promoção normal. Nunca use `docker compose down -v` em ambiente com dados.

## Homologação de voz

`VOICE_LIVE_HOMOLOGATION=PENDING`: validar inbound, IVR, handoff, RX, TX e hangup com aparelhos reais antes de declarar o canal homologado.
