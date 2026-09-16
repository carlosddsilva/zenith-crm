# Handoff: ZC-06 — Event Log & Transactional Outbox

## Resumo do Módulo
O módulo ZC-06 visou refatorar a arquitetura orientada a eventos do Zenith CRM para adotar o padrão **Transactional Outbox**, garantindo consistência atômica entre mutações de domínio (banco de dados) e a emissão de eventos (automação e webhooks). Anteriormente, a publicação de eventos era feita de forma isolada do commit da transação via Redis (`brpoplpush`), sujeitando o sistema a eventuais inconsistências (dual-write).

## O que foi implementado

### 1. Migração e Schema `automationEventsOutbox`
- **Schema Update (`src/lib/db/schema/automations.ts`)**: Foram adicionadas as colunas necessárias para controlar bloqueios (locks) da tabela de eventos: `lockedAt`, `leaseExpiresAt`, `nextAttemptAt`, e `lastError`.
- **Migração SQL (`0025_dizzy_lilandra.sql`)**: Gerada e aplicada com as alterações do schema.

### 2. Refatoração do Event Bus
- **`src/lib/events/bus.ts`**: Removido o push direto para o Redis. A função `publishEvent` agora exige como parâmetro a transação corrente do PostgreSQL (`tx`) e unicamente insere o evento na tabela `automation_events_outbox`.

### 3. Rotas de Domínio Transacionais
Todas as mutações de domínio foram reescritas para utilizar `db.transaction`, onde a mutação e o `publishEvent` ocorrem na mesma transação atômica. As rotas alteradas foram:
- `src/app/api/zenith/deals/route.ts` (Criação de Deal e Movimentação)
- `src/app/api/zenith/deals/[id]/route.ts` (Atualização/Estágio de Deal)
- `src/app/api/zenith/contacts/route.ts` (Criação de Contato)
- `src/app/api/zenith/tasks/[id]/route.ts` (Atualização de Tarefas)
- `src/app/api/zenith/appointments/route.ts` (Criação de Agendamentos)
- `src/app/api/zenith/appointments/[id]/route.ts` (Edição/Remoção de Agendamentos)
- **`src/lib/automations/engine.ts`**: Atualizadas funções como `executeMoveDealStage` e `executeCompleteTask` para também garantirem que a execução de ação e propagação em cadeia (chaining) ocorram via outbox transacional atômica.
- **`src/lib/messaging/inbound.ts`**: A publicação do evento `message.received` foi embutida dentro da transação `persistInboundMessage`, e removida de `inbound-realtime.ts`.

### 4. Trabalhador (Worker) Refatorado
O script do worker local (`scripts/automation-worker.mjs`) foi completamente reescrito para utilizar *polling* baseado em HTTP na infraestrutura local do Next.js:
- **`src/app/api/zenith/workers/automation-outbox-claim/route.ts`**: Rota responsável por encontrar, bloquear e ceder uma concessão (*lease*) de eventos que falharam ou estão pendentes via `SELECT ... FOR UPDATE SKIP LOCKED`.
- **`src/app/api/zenith/workers/automation-outbox-ack/route.ts`**: Rota acionada pelo worker para fazer "Ack" (marcar como concluído) ou "Nack" (falhar com backoff exponencial).
- **Extinção do Sweep**: O antigo `automation-outbox-sweep` que jogava eventos no Redis para fallback foi deletado, vez que não tem mais serventia nesta arquitetura pull-base relacional pura.

## Pontos de Atenção e Restrições Futuras
- **Atomicity 101**: Sempre que publicar um evento de domínio pelo módulo `events/bus.ts`, deve-se instanciar explicitamente um `db.transaction` e repassar o `tx` ao `publishEvent`.
- **Desempenho**: O worker agora faz polling. O `SKIP LOCKED` assegura que o lock é otimista em concorrência, mas requer tuning para ambientes de altíssimo rendimento ou auto-scaling massivo.

## Próximos Passos
O módulo `ZC-07` já está elegível para desenvolvimento. Este marco conclui as dependências transacionais requisitadas pelo time arquitetural.

## Consolidação e gates — 2026-09-16

`MODULE_STATUS=PARTIAL`

- Branch: `main`
- SHA de código validado: `170cf880a5c8e4adcf7ef0ab34bf9da6882975b6`
- Migração associada: `drizzle/0025_dizzy_lilandra.sql`
- `npm run typecheck`: `PASS`.
- `npm run lint`: `PASS`, 0 erros e 220 warnings.
- `npm test`: `PASS`, 441 aprovados e 20 ignorados.
- Build Linux da imagem `app`: `PASS`.
- Migrações 0000–0031 em PostgreSQL descartável: `PASS`.
- Teste dedicado de concorrência, lease, retry e recovery do outbox: `NOT_RUN`.
- Jornada E2E com dispatcher e provider: `NOT_RUN`.

O gate de compilação está aprovado, mas o módulo não recebe aceite comercial enquanto os testes integrados de outbox, recovery e E2E permanecerem pendentes.
