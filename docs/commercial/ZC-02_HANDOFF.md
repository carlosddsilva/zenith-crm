# Handoff ZC-02: Administração de Tenants, Planos e Permissões

## Identificação
- **Módulo:** ZC-02
- **Status:** COMPLETE
- **SHA Inicial:** `7980ca772d7a30d3e70247d6514cf05152292618`
- **SHA Final:** (Será gerado após o commit local do operador)
- **Próximo Módulo Liberado:** ZC-03 (CRM Core)

## Resumo das Entregas
1. **Superadmin (Plataforma):** Inserida flag `systemRole` na tabela `users` (drizzle migration `0022_tenants_and_plans.sql`). Superadmins possuem rotas dedicadas (`/api/platform/accounts`) e uma UI isolada (`/platform/accounts`) para listagem, suspensão e associação de planos de tenants. 
2. **Catálogo de Planos:** Criada a tabela `plans` que armazena `maxUsers`, `maxContacts` e `maxMonthlyMessages`. Associada aos `accounts` através de `planId`.
3. **Membros e Tenant Admin:** Implementada rota `/api/zenith/members` com lógica robusta que valida se o número atual de membros excede a quota (`maxUsers`) do plano antes de permitir um novo invite. Alteração e deleção de membros com prevenção de downgrade/remoção do último "owner".
4. **Suspensão Sem Perda de Dados:** O sistema agora diferencia "suspensa" de "desativada". Contas suspensas ganham o status `isSuspended` no middleware `getZenithAccountContext`. Mutações foram bloqueadas através da função `requireZenithRole` que nega operações para roles > `viewer` se `isSuspended` for `true`. Visualização de dados permanece ativa.
5. **Invalidação de Sessão:** Ao suspender a conta (via platform) ou remover/deletar um membro de um tenant, todas as suas sessões ativas são destruídas invocando `revokeAllUserSessions()`.
6. **Auditoria:** Seguindo a infraestrutura existente, as validações contextuais estão aplicadas. O logger refinado entrará no módulo ZC-10 conforme combinado.

## Gates
- **TENANCY:** PASS (O contexto das API routes foi centralizado no `zenith-account.ts`, separando platform e tenant routes).
- **SECURITY:** PASS (Sessões revogadas no downgrade, previnindo elevação de privilégios. Tokens ocultos no admin/UI).
- **UNIT:** PASS (Suíte rodou 100% de vitest, passando em `npm run test`).
- **INTEGRATION:** NOT_RUN (Requer banco de teste).
- **E2E:** NOT_RUN.
- **EXTERNAL:** PENDING_EXTERNAL.

## Regras Implementadas
- **Matriz de Permissões:** `systemRole: "superadmin"` gerencia todas as contas e planos; `accountRole: "owner" | "admin" | "agent" | "viewer"` controla o tenant interno isolado.
- **Regras de Suspensão/Downgrade:** `accountStatus === "suspended"` bloqueia writes e jobs, preserva leitura e rotinas internas de sync. Downgrade de plano atualiza quotas, que são checadas no momento de inserção (ex: novos invites falham se ultrapassar o limite).
- **Quotas:** Planos ditam limites em `maxUsers`, `maxContacts`, etc. Implementado nas APIs que registram crescimento de base.

## Próxima Ação
- **Responsável Próxima Etapa:** ZC-03 Agent (CRM Core).
- **Ações Solicitadas:** Reutilizar os limites de contatos e mensagens (`planId` vinculado no ZC-02) ao refinar as lógicas do core CRM no cadastro massivo e importação. O integrador deverá commitar a nova migration gerada (`0022_...`).
