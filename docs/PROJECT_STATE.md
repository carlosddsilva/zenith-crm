# Zenith CRM — estado do projeto

Data-base: 2026-09-03

## Origem

Fork de `ArnasDon/wacrm`, mantido sob licença MIT e adaptado no repositório `carlosddsilva/zenith-crm`.

## Objetivo do produto

CRM self-hosted em pt-BR com:

- PostgreSQL próprio;
- Redis;
- Meta Cloud API;
- Evolution API existente do operador;
- WaCalls para voz WhatsApp;
- arquitetura multi-tenant e multi-provider.

## Status

### Fundação

- [x] fork recebido e auditado;
- [x] projeto renomeado internamente para `zenith-crm`;
- [x] PostgreSQL 16 + pgvector incluído no Docker Compose;
- [x] Redis 7 incluído no Docker Compose;
- [x] volumes persistentes configurados;
- [x] healthchecks configurados;
- [x] bootstrap de extensões PostgreSQL criado;
- [x] `DATABASE_URL` e `REDIS_URL` documentados;
- [ ] Drizzle ORM instalado;
- [ ] primeira migration standalone;

### Supabase

Status: `LEGACY_ACTIVE / MIGRATION_PLANNED`.

O Supabase ainda é necessário para o runtime atual. Não remover até concluir as camadas equivalentes.

### pt-BR

Status: `NOT_STARTED`.

### Evolution API

Status: `PLANNED`.

A Evolution será consumida como serviço já existente; não será instalada pelo Zenith CRM.

### WaCalls

Status: `PLANNED`.

## Próxima entrega

M1 — introduzir driver PostgreSQL + Drizzle e iniciar a conversão do schema sem afetar o runtime legado.
