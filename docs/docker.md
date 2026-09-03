# Zenith CRM com Docker

O Zenith CRM está em migração do Supabase para infraestrutura própria. O Compose já sobe a infraestrutura alvo (`PostgreSQL + pgvector` e `Redis`) ao lado do app, enquanto o runtime legado ainda depende temporariamente das variáveis Supabase.

## Serviços

```text
app       Next.js 16
postgres  PostgreSQL 16 + pgvector
redis     Redis 7
```

PostgreSQL e Redis são publicados somente em `127.0.0.1` no host, evitando exposição direta pela interface pública da VPS.

## Quick start

1. Copie o template:

   ```bash
   cp .env.local.example .env.local
   ```

2. Troque ao menos `POSTGRES_PASSWORD` e preencha as credenciais legadas do Supabase enquanto a migração não terminou.

3. Suba o ambiente:

   ```bash
   docker compose --env-file .env.local up --build -d
   ```

4. Verifique:

   ```bash
   docker compose --env-file .env.local ps
   npm run infra:check
   ```

## Subir somente PostgreSQL e Redis

Durante a migração é possível iniciar apenas a infraestrutura nova:

```bash
docker compose --env-file .env.local up -d postgres redis
```

Isso permite trabalhar no novo schema sem depender do build do frontend.

## Endpoints no host

Por padrão:

```text
PostgreSQL  127.0.0.1:5432
Redis       127.0.0.1:6379
App         0.0.0.0:3000
```

As portas podem ser alteradas em `.env.local` com `POSTGRES_PORT`, `REDIS_PORT` e `HOST_PORT`.

## Conexão do app

Para execução local via `npm run dev`:

```env
DATABASE_URL=postgresql://zenith:<senha>@127.0.0.1:5432/zenith_crm
REDIS_URL=redis://127.0.0.1:6379
```

Dentro do container `app`, o Compose substitui automaticamente os hosts por:

```text
postgres:5432
redis:6379
```

## Extensões PostgreSQL

No primeiro bootstrap do volume são habilitadas:

- `uuid-ossp`;
- `pgcrypto`;
- `vector`.

O arquivo está em `infra/postgres/init/001_extensions.sql`.

> Os scripts em `docker-entrypoint-initdb.d` são executados somente quando o volume do PostgreSQL é criado pela primeira vez.

## Estado da migração

A infraestrutura nova está pronta, mas o runtime atual ainda utiliza Supabase para:

- Auth;
- queries via SDK;
- Realtime;
- Storage.

A retirada é incremental. Consulte `docs/MIGRATION_SUPABASE_TO_POSTGRES.md` e `docs/PROJECT_STATE.md`.
