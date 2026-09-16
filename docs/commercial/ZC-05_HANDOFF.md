# Handoff ZC-05 — mensageria, Inbox e WhatsApp

`MODULE_STATUS=PARTIAL`

## Identificação

- Data da consolidação: 2026-09-16 (America/Cuiaba)
- Branch: `main`
- SHA de código validado: `170cf880a5c8e4adcf7ef0ab34bf9da6882975b6`

## Escopo consolidado

O candidato contém os módulos de mensageria, Inbox, mídia e integração WhatsApp em `src/lib/messaging`, `src/lib/inbox`, `src/lib/media` e `src/lib/whatsapp`, além das rotas e webhooks correspondentes. Autenticação, isolamento por `accountId`, outbox PostgreSQL/Drizzle e Redis existentes foram preservados.

## Evidências executadas

| Gate | Resultado | Evidência |
| --- | --- | --- |
| Unitário focado | `PASS` | 19 arquivos, 232 testes aprovados. |
| Typecheck global | `PASS` | `npm run typecheck`, exit 0. |
| Lint oficial | `PASS` | `npm run lint`, exit 0, 0 erros e 220 warnings. |
| Regressão global | `PASS` | 49 arquivos aprovados, 4 ignorados; 441 testes aprovados e 20 ignorados. |
| Build Linux | `PASS` | `docker compose --env-file .env.local build --progress plain app`, exit 0. |
| E2E de canal | `NOT_RUN` | Nenhuma mensagem, callback ou canal real foi acionado. |
| Homologação externa | `PENDING_EXTERNAL` | WhatsApp e provedores reais dependem de credenciais, consentimento e ambiente autorizado. |

Os testes ignorados da regressão são suítes PostgreSQL condicionais de core, IA e voz; foram executados separadamente contra bancos descartáveis e passaram. Eles não substituem o E2E de mensageria.

## Pendências

- Jornada E2E de envio, recebimento, anexos, opt-out, callback e handoff humano.
- Homologação de provedor real em destino sintético autorizado.
- Recovery integrado de banco, Redis, anexos e provider.

Este handoff registra evidência técnica, mas não concede aceite comercial.
