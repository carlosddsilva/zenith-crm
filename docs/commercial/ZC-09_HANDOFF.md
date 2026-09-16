# Handoff: Módulo ZC-09 - Radar de conversas sem resposta e SLA

## Resumo da Implementação

Este módulo implementa as funcionalidades de monitoramento de SLA e Radar para identificar conversas atrasadas ou esquecidas.
Toda a base do radar opera através do campo `firstUnrepliedMessageAt` persistido em cada conversa e atualizado proativamente a cada nova mensagem enviada ou recebida.

## Principais Alterações

1. **Esquema de Banco de Dados**
   - Criação da tabela `sla_policies` (`src/lib/db/schema/sla.ts`) para suportar a definição de múltiplos níveis de SLA por tenant com limiares personalizáveis (warning e overdue).
   - Adição dos campos `firstUnrepliedMessageAt`, `slaStatus`, `slaPolicyId`, e `lastSlaBreachAt` na tabela de `conversations` (`src/lib/db/schema/inbox.ts`).

2. **Lógica de SLA**
   - O SLA se inicia no momento da **primeira mensagem de um cliente sem resposta**. Isso ocorre em `src/lib/messaging/inbound.ts` verificando a inexistência de `firstUnrepliedMessageAt`.
   - Se disparado, despachamos um evento transacional `conversation.sla_started` para o Outbox. O timer NÃO reseta caso o cliente mande mensagens subsequentes.
   - O SLA reseta apenas quando o agente envia uma resposta (limpando o `firstUnrepliedMessageAt` para null e o status para 'ok' em `src/app/api/zenith/conversations/[id]/messages/route.ts`).

3. **Orquestração pelo Motor**
   - O Automation Dispatcher intercepta `conversation.sla_started`.
   - O Dispatcher calcula dinamicamente os horários dos limites `warning` e `overdue` baseando-se na apólice (Policy) da conta.
   - O agendamento é feito de forma segura e paralela utilizando o `automationEventsOutbox`, de onde as execuções de checagem ocorrerão como trigger `conversation.sla_breach_check`.
   - Quando ativados, modificam `slaStatus` (warning/overdue) e injetam `conversation.sla_breached` para desencadear as automações clássicas se desejado pelo usuário (Ex: Automação "Ao estourar o SLA").

4. **Painel de Inbox (Frontend)**
   - O tipo da API `ConversationsResponse` foi atualizado para retornar o `sla_status` e o carimbo temporal.
   - Foram implementados Badges de alerta (vermelhos e amarelos) tanto na listagem lateral quanto no cabeçalho das conversas ativas.
   - Uma nova funcionalidade de filtro dinâmico SLA foi introduzida abaixo da barra de pesquisa, permitindo focar em **"SLA: Atrasados"** ou **"SLA: Todos"**.
   - As modificações suportam navegação sem prejudicar os mecanismos pré-existentes do WebSocket (pois as atualizações reagem às listagens).

## Como Testar

1. Entre no Inbox do CRM Zenith.
2. Inicie uma interação a partir de um cliente teste (Webhooks via Postman ou Chat-widget).
3. Observe que um webhook de SLA deve agendar os limites no outbox (verificar DB).
4. Usando uma query para encurtar os deadlines de outbox, processe-os.
5. Verifique a lista do Inbox para notar a presença de Badges vermelhos e/ou amarelos sobre aquela conversa.
6. Teste o filtro recém-criado **"SLA: Atrasados"**. Somente conversas nesta condição devem aparecer.
7. Em seguida, responda à conversa com a interface do Agente Humano. O SLA é resetado imediatamente e limpo.

## Consolidação e gates — 2026-09-16

`MODULE_STATUS=PARTIAL`

- Branch: `main`
- SHA de código validado: `170cf880a5c8e4adcf7ef0ab34bf9da6882975b6`
- Migração associada: `drizzle/0028_keen_starfox.sql`
- Migrações 0000–0031 em PostgreSQL descartável: `PASS`.
- `npm run typecheck`: `PASS`.
- `npm run lint`: `PASS`, 0 erros e 220 warnings.
- `npm test`: `PASS`, 441 aprovados e 20 ignorados.
- Build Linux da imagem `app`: `PASS`.
- Suíte automatizada dedicada ao ciclo SLA/radar: `NOT_RUN` (não localizada no candidato).
- Jornada Inbox → timer → warning/overdue → resposta humana: `NOT_RUN`.

Não há evidência suficiente para aceite funcional do módulo. O build verde apenas encerra o bloqueador de compilação; o comportamento temporal, concorrência, isolamento transversal e recuperação do SLA continuam pendentes.
