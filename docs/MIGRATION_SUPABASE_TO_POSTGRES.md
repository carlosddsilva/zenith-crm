# Migração Supabase para PostgreSQL próprio

Status: `COMPLETE`.

## Resultado

- Banco: PostgreSQL 16 próprio, acessado por Drizzle;
- Auth: tabelas `users` e `auth_sessions`, senha Argon2 e cookie Zenith;
- Realtime: Redis Pub/Sub/SSE;
- Storage: nenhum SDK/bucket Supabase ativo; mídia inbound sem URL disponível permanece indisponível até o provider entregar uma URL utilizável;
- Packages `@supabase/ssr` e `@supabase/supabase-js`: removidos;
- variáveis `SUPABASE_*` e build args: removidos;
- rotas, páginas, hooks e componentes antigos dependentes de Supabase: removidos.

`supabase/migrations/` é um arquivo histórico do upstream. Não é executado por `npm run db:migrate`, não é importado pelo app e não representa dependência de runtime. O histórico autoritativo atual é `drizzle/` + `drizzle/meta/_journal.json`.

## Regra futura

Não reintroduzir SDK Supabase no runtime. Alterações de schema devem modificar `src/lib/db/schema`, gerar migration Drizzle aditiva e validar idempotência com duas execuções consecutivas de `npm run db:migrate`.
