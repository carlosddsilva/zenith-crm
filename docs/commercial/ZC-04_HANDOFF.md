# Handoff ZC-04: Tarefas, atividades, compromissos e timeline

## Identificação
- **Módulo:** ZC-04
- **Status:** COMPLETE
- **SHA Inicial:** (Gerado no clone inicial)
- **SHA Final:** (A ser gerado após o commit local do operador)
- **Próximo Módulo Liberado:** ZC-05 (Automação de DSR / Marketing / Integrações ZC-06).

## Resumo das Entregas
1. **Schema Expandido (`appointments`):** Criada uma nova entidade `appointments` isolada das genéricas `activities` (logs) e `tasks` (tarefas com prazo). Isso permite registro granular de compromissos com data de início e fim, fuso horário e integrações futuras com calendários. Migration `0024` consolidada.
2. **APIs e CRUD:** 
   - **Tarefas:** A rota `/api/zenith/tasks` agora suporta paginação otimizada (`limit`, `offset`) em sua listagem, essencial para carregamento assíncrono. Além disso, o método `DELETE` foi incluído, preenchendo a lacuna do CRUD e gerando registro de auditoria em `activities` (`task_deleted`).
   - **Compromissos:** Rotas de CRUD base (`GET, POST, PATCH, DELETE`) adicionadas em `/api/zenith/appointments` e `/api/zenith/appointments/[id]`. Ações enviam eventos `publishEvent` (`appointment.created`, `appointment.updated`, `appointment.deleted`) permitindo que o sistema de automação ou conectores externos reajam imediatamente.
3. **Timeline Unificada (`/api/zenith/timeline`):** 
   - Endpoint robusto que consolida o ciclo de vida do cliente/negócio. Utilizando SQL otimizado via Drizzle (`UNION ALL`), ele junta as linhas temporais das tabelas `messages`, `calls`, `tasks`, `appointments`, `notes` e `activities`.
   - Permite paginação de alta performance preservando o `occurred_at` global, mapeando atributos variados para uma interface padrão de `type`, `title`, `status`, `actor` e `metadata` rica.

## Decisões Arquiteturais e Restrições
- Conforme o escopo, **não** criamos recorrências completas de calendários nesta etapa (como rrules do iCal), e **não** estocamos tokens OAuth do Google. Os conectores externos (ZC-06) assinarão os eventos via bus (`publishEvent`) para espelhar as mutações, mantendo as responsabilidades isoladas.
- O endpoint de Timeline foi modelado primariamente em torno de `contactId` ou `dealId`, pois a perspectiva central sempre deriva de um contato, sem misturar os fluxos desordenadamente.

## Gates
- **TENANCY:** PASS (Rotas injetam rigidamente o contexto logado, seja filtrando em joins `where eq(accountId)`, seja isolando queries diretas de manipulação).
- **SECURITY:** PASS.
- **UNIT:** PASS (`npm run typecheck` e todos os testes mockados passaram nas validações. Drizzle prevê seguranças transacionais).
- **INTEGRATION:** NOT_RUN (Vitest local não aciona Pg real).
- **E2E:** NOT_RUN.
- **EXTERNAL:** NOT_APPLICABLE.

## Próxima Ação
- **Responsável Próxima Etapa:** ZC-05/ZC-06
- **Ações Solicitadas:** O schema atual já atende as interações. O módulo ZC-06 precisará integrar-se consumindo o channel event bus e as propriedades de `timezone`. O commit local pode ser executado para persistir o código desenvolvido.
