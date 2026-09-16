# Zenith CRM — Módulo ZC-08: Follow-ups Automáticos

## 1. Escopo e Propósito
Este módulo introduz suporte a Drip Campaigns e rotinas de acompanhamento de longo prazo ("Follow-ups") para os tenants. Reaproveitando a infraestrutura de validação e disparo construída no motor de automações (ZC-07), o sistema agora suporta ações espaçadas no tempo de forma durável.

Diferente do ZC-07 (onde os eventos são imediatos), os Follow-ups suportam agendamentos (delays), bloqueios noturnos (Quiet Hours) e cancelamento reativo caso o contexto do lead mude.

## 2. Decisões Arquiteturais e Modelo de Dados

### Estrutura Dedicada
Para garantir controle e visibilidade, adotamos as seguintes entidades segregadas no banco de dados (`src/lib/db/schema/followups.ts`):
- **`followup_sequences`**: A campanha de follow-up (gatilho, regras de cancelamento, quiet hours, array de passos com atraso).
- **`followup_sequence_versions`**: Um snapshot imutável da sequência no momento em que foi publicada. Novas inscrições usam sempre o último snapshot, garantindo previsibilidade mesmo se a regra matriz for editada posteriormente.
- **`followup_enrollments`**: A inscrição de um contato/negócio na sequência. Armazena o passo atual, data programada para a próxima ação (`nextStepAt`) e seu status (ativo, cancelado, etc).
- **`followup_enrollment_steps`**: Registro para idempotência e controle transacional de cada envio dentro da sequência.

### Arbítrio de Tempo
Como a biblioteca `date-fns-tz` não estava disponível, implementamos a avaliação de "Quiet Hours" utilizando os recursos nativos do JavaScript (`Intl.DateTimeFormat`), processando a janela em cima do timezone específico configurado no tenant (default: `America/Sao_Paulo`). A engine base localiza-se em `src/lib/followups/engine.ts`.

### Integração com Outbox e Dispatcher
- **Reutilização Total do Dispatcher**: Não criamos workers novos. A engine aproveita o `automation-dispatcher/route.ts` já existente. Quando há inscrição numa campanha, ele lança um evento `followup.execute_step` na outbox com agendamento no futuro (`nextAttemptAt`).
- **Resiliência e Idempotência**: Se o Dispatcher falhar no meio do disparo (ex: provider de WhatsApp indisponível), o passo é marcado como "failed". Como foi projetado sobre a outbox, o evento poderá ser retentado no futuro, garantindo que o disparo não seja perdido.

### Regras Dinâmicas de Cancelamento
Intervenções humanas e respostas do cliente quebram automações rígidas. Foi adicionado um interceptador no `automation-dispatcher`. Sempre que os eventos `message.received` ou `deal.won/deal.lost` ocorrem, o motor procura inscrições ativas daquele cliente/negócio e as converte para `cancelled` antes que as próximas mensagens programadas disparem, evitando envio de robôs após a conversão.

## 3. APIs e Interfaces

O sistema expõe rotas REST protegidas pelo RBAC existente:
- `GET /api/zenith/followups`: Lista campanhas do account logado.
- `POST /api/zenith/followups`: Cria rascunhos.
- `PATCH /api/zenith/followups/[id]`: Edita rascunhos.
- `POST /api/zenith/followups/[id]/publish`: Faz snapshot e ativa a sequência.
- `GET /api/zenith/followups/[id]/history`: Exibe últimas inscrições.

No Frontend, foi construído o **`SequenceBuilder`** (em pt-BR), adaptado a partir do `AutomationBuilderZenith`, que apresenta suporte à interface interativa e permite a visualização detalhada de todo o histórico.

## 4. Próximos Passos (Recomendação)
1. Conectar a interface do `SequenceBuilder` ao menu principal do Dashboard do Zenith, adicionando as páginas em `src/app/(dashboard)/followups/...`.
2. Validar interações multi-tenant: Criar contas filhas e comprovar que as sequências de um inquilino não reagem a `message.received` de outro.
3. Homologar provedor local em conjunto com os módulos de mensageria (ZC-04 e Inbox) para checar formato das payloads nas respostas de clientes.

**Status Final:** Funcionalidades base estruturadas, regras persistentes acopladas no PostgreSQL e Engine 100% livre de lock-in com Supabase.

## 5. Consolidação e gates — 2026-09-16

`MODULE_STATUS=PARTIAL`

- Branch: `main`
- SHA de código validado: `170cf880a5c8e4adcf7ef0ab34bf9da6882975b6`
- Migração associada: `drizzle/0027_outgoing_preak.sql`
- Os contextos de `GET`, `PATCH`, `DELETE`, `publish` e `history` agora recebem `params: Promise<{ id: string }>` e resolvem o parâmetro com `await`, conforme o contrato do Next.js 16.
- As mutações finais de `PATCH`, `DELETE` e `publish` incluem `accountId` no predicado, preservando o isolamento do tenant.

| Gate | Resultado | Evidência |
| --- | --- | --- |
| Rotas de follow-up | `PASS` | 6/6 testes: parâmetros assíncronos, autorização, tenant estrangeiro, mutações com tenant, publish e history. |
| Typecheck | `PASS` | `npm run typecheck`, exit 0. |
| Lint | `PASS` | `npm run lint`, exit 0, 0 erros e 220 warnings. |
| Regressão | `PASS` | 441 aprovados e 20 ignorados. |
| Build Linux | `PASS` | Imagem `app` construída em ambiente Docker isolado. |
| Dispatcher/provider E2E | `NOT_RUN` | Nenhuma mensagem ou API externa foi consumida. |

O bloqueador interno de compilação foi encerrado. Cancelamento reativo, quiet hours, retries, recovery e envio por provider ainda precisam de E2E antes do aceite comercial.
