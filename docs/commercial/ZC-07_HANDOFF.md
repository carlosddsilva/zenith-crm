# Handoff ZC-07 — automações e versionamento

`MODULE_STATUS=PARTIAL`

## Identificação

- Data da consolidação: 2026-09-16 (America/Cuiaba)
- Branch: `main`
- SHA de código validado: `170cf880a5c8e4adcf7ef0ab34bf9da6882975b6`
- Migração associada: `drizzle/0026_funny_puma.sql`

## Escopo consolidado

O candidato contém o construtor e a validação de automações, versionamento persistente, dispatcher e integração com a outbox transacional. PostgreSQL/Drizzle, Redis e os contratos existentes de mensageria foram preservados.

## Evidências executadas

| Gate | Resultado | Evidência |
| --- | --- | --- |
| Builder/validação | `PASS` | `src/lib/automations/builder-tree.test.ts` e `src/lib/automations/validate.test.ts`: 39/39 testes aprovados. |
| Migração | `PASS` | Migrações 0000–0031 aplicadas com sucesso em bancos PostgreSQL descartáveis. |
| Typecheck global | `PASS` | `npm run typecheck`, exit 0. |
| Lint oficial | `PASS` | `npm run lint`, exit 0, 0 erros e 220 warnings. |
| Regressão global | `PASS` | 441 testes aprovados e 20 ignorados. |
| Build Linux | `PASS` | Build isolado da imagem `app`, exit 0. |
| Worker/provider integrado | `NOT_RUN` | Não foi feita execução E2E do dispatcher com canal externo. |
| E2E | `NOT_RUN` | Não existe evidência da jornada completa no mesmo candidato. |

## Pendências

- Exercitar claim, lease, ack/nack, retry e idempotência em stack descartável com reinício dos workers.
- Validar automação encadeada até mensageria e auditoria sem serviço pago.
- Executar jornada E2E e recovery antes de aceite comercial.

Este handoff registra evidência verificável do candidato, mas mantém o módulo parcial.
