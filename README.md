# Zenith CRM

CRM self-hosted multi-tenant para atendimento, vendas, tarefas, broadcasts, automações e voz WhatsApp.

## Stack

- Next.js 16, React 19 e TypeScript;
- PostgreSQL 16 + Drizzle ORM como fonte de verdade;
- Redis 7 para realtime e fila de automações;
- Meta Cloud API e Evolution API para mensagens;
- WaCalls para voz.

O runtime não usa Supabase para banco, autenticação, realtime ou storage. A pasta `supabase/` contém somente o histórico SQL do projeto de origem e não participa do build ou da execução.

## Início rápido

```bash
cp .env.local.example .env.local
npm ci
npm run db:migrate
npm run auth:bootstrap
npm run dev
```

Acesse `http://localhost:3000/zenith-login`. Para o stack completo em contêineres e procedimentos de produção, consulte [docs/docker.md](./docs/docker.md).

## Validação

```bash
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run db:check
npm run infra:check
```

## Documentação

- [Estado do projeto](./docs/PROJECT_STATE.md)
- [Arquitetura](./docs/ZENITH_ARCHITECTURE.md)
- [Migração do legado Supabase](./docs/MIGRATION_SUPABASE_TO_POSTGRES.md)
- [Operação Docker, backup e restore](./docs/docker.md)

Fork de `ArnasDon/wacrm`, mantido sob licença MIT.
