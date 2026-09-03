# Migração Supabase -> PostgreSQL próprio

## Situação atual

O código upstream usa Supabase em quatro funções diferentes:

- PostgreSQL/API de dados;
- autenticação (`auth.users`, `auth.uid()` e sessão/cookies);
- Realtime;
- Storage.

O schema SQL também contém RLS e foreign keys diretamente vinculadas ao schema `auth`, além de políticas vinculadas ao schema `storage`.

Por isso, remover os pacotes `@supabase/*` antes de substituir essas capacidades quebraria autenticação, acesso a dados, Inbox em tempo real e anexos.

## Estratégia

### M0 — Fundação de infraestrutura

- [x] PostgreSQL 16 próprio no Docker Compose.
- [x] `pgvector` disponível.
- [x] extensões `uuid-ossp`, `pgcrypto` e `vector` inicializadas.
- [x] Redis próprio e persistente.
- [x] healthchecks.
- [x] portas de banco/cache expostas somente em loopback no host.
- [x] variáveis `DATABASE_URL` e `REDIS_URL` preparadas.

### M1 — Camada de banco

- [ ] adicionar Drizzle ORM e driver PostgreSQL;
- [ ] criar `src/lib/db`;
- [ ] converter schema atual para migrations standalone;
- [ ] separar SQL compatível com PostgreSQL de SQL específico de Supabase;
- [ ] manter funções transacionais úteis no banco.

### M2 — Autenticação própria

- [ ] criar `users`;
- [ ] criar `sessions`;
- [ ] consolidar `accounts` e `account_members`;
- [ ] migrar FKs de `auth.users`;
- [ ] substituir login/logout/session do Supabase;
- [ ] preservar RBAC.

### M3 — RLS multi-tenant

- [ ] retirar dependência de `auth.uid()`;
- [ ] definir contexto de tenant/usuário na conexão;
- [ ] reconstruir policies para `account_id`;
- [ ] testar isolamento entre tenants.

### M4 — Data access

- [ ] substituir `.from()`;
- [ ] substituir `.rpc()`;
- [ ] substituir service-role client;
- [ ] remover tipos gerados pelo Supabase quando não forem mais necessários.

### M5 — Realtime

- [ ] Redis Pub/Sub;
- [ ] endpoint SSE/WebSocket;
- [ ] eventos normalizados de Inbox/conversas/chamadas;
- [ ] remover Supabase Realtime.

### M6 — Storage

- [ ] abstração `StorageProvider`;
- [ ] S3 compatível;
- [ ] migrar avatar, flow-media e chat-media;
- [ ] remover políticas `storage.objects`.

### M7 — Remoção final

- [ ] remover `@supabase/ssr`;
- [ ] remover `@supabase/supabase-js`;
- [ ] remover variáveis Supabase;
- [ ] arquivar migrations legadas;
- [ ] confirmar zero referências Supabase no runtime.

## Regra de execução

Cada etapa deve terminar com `lint`, `typecheck`, testes e `build` válidos antes da etapa seguinte. A migração não deve misturar Evolution API ou WaCalls até a fundação de dados/autenticação estar estável.
