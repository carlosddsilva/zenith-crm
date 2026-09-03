# Zenith CRM — arquitetura alvo

## Objetivo

Transformar o fork do WaCRM em uma plataforma self-hosted, multi-tenant e multi-provider, sem dependência estrutural do Supabase.

## Arquitetura alvo

```text
Browser / PWA
    |
    v
Next.js 16 / React 19
    |
    +-- PostgreSQL 16 + pgvector
    +-- Redis
    +-- S3 compatível
    |
    +-- MessagingProvider
    |      +-- Meta Cloud API
    |      +-- Evolution API
    |
    +-- VoiceProvider
           +-- WaCalls
```

## Princípios

1. PostgreSQL é a fonte de verdade do CRM.
2. Todo dado de negócio pertence a um `account_id`.
3. Providers de mensageria não podem contaminar a regra de negócio da Inbox.
4. Voz é um domínio separado de mensagens.
5. Credenciais externas são armazenadas cifradas.
6. O isolamento multi-tenant será aplicado na aplicação e reforçado pelo PostgreSQL.
7. Evolution API é uma integração externa; o Zenith CRM não administra a instalação da Evolution.
8. WaCalls é um serviço de voz separado do core do CRM.

## Camadas previstas

```text
src/lib/
  auth/
  db/
  tenant/
  redis/
  realtime/
  storage/
  messaging/
    contracts/
    meta/
    evolution/
  voice/
    contracts/
    wacalls/
```

## Estado de transição

Nesta primeira fase, PostgreSQL e Redis próprios já existem no Compose, mas o código legado ainda utiliza Supabase para banco/auth/realtime/storage. A substituição será incremental para manter o projeto compilável durante a migração.
