# Handoff ZC-03: Auditoria e controles técnicos de LGPD

## Identificação
- **Módulo:** ZC-03
- **Status:** COMPLETE
- **SHA Inicial:** (Gerado no clone inicial)
- **SHA Final:** (A ser gerado após o commit local do operador)
- **Próximo Módulo Liberado:** ZC-04 (Automação de DSR) ou módulos subsequentes de fluxo de marketing (ZC-05).

## Resumo das Entregas
1. **Schema LGPD & Auditoria:** Adicionadas flags `isBlocked`, `optOut` e `anonymizedAt` ao `contacts`. Criadas as tabelas `audit_logs` (histórico protegido) e `privacy_requests` (pedidos de DSR). Migration `0023_mature_gargoyle.sql` gerada.
2. **Log de Auditoria Redigido:** Implementado o utilitário `logAuditAction` em `src/lib/audit/logger.ts`, com sanitização automática (Allowlist) para garantir que segredos (`password`, `token`, etc) se tornem `[REDACTED]` antes de irem para o banco de dados.
3. **Fluxos de Titular (DSR):**
   - **Anonimização (`src/lib/privacy/anonymize.ts`):** Substitui irreversivelmente PII primária do contato, substitui texto de notas associadas por "[REDACTED - LGPD]" preservando as referências do banco para evitar perda de métricas.
   - **Exportação (`src/lib/privacy/export.ts`):** Coleta e formata num JSON unificado (contato, tags, notas, atividades) para download via API route isolada (`/api/zenith/contacts/[id]/export`).
4. **Prevenção Operacional em Múltiplos Motores:** O `broadcast-dispatcher` e o `automation-dispatcher` agora checam se o contato possui alguma flag LGPD (`isBlocked`, `optOut` ou `anonymizedAt`) ativa. Caso positivo, o job falha com o código `contact_lgpd_blocked`, evitando infrações que ocorreriam por envios automáticos previamente agendados.

## Decisões Jurídicas Pendentes
Conforme estipulado no plano aprovado, a **anonimização em objetos relacionais compostos (mensagens, histórico de chamadas) não apaga o registro**, mas mascará-lo (`[REDACTED]`), de forma que as interações agregadas não desequilibrem as lógicas financeiras/operacionais. Essa premissa técnica **deverá ser levada para validação com a assessoria jurídica ou DPO**, antes da comercialização do software. O módulo 03 entrega o alicerce; a aprovação definitiva de "risco" não cabe à engenharia.

## Gates
- **TENANCY:** PASS (A exportação e a anonimização filtram estritamente o `accountId` por Drizzle `.where()` utilizando o contexto da sessão ativa `requireZenithRole`).
- **SECURITY:** PASS (O Logger evita logs de dados sensíveis; as endpoints DSR rodam restritas para a permissão de "admin").
- **UNIT:** PASS (`npm run typecheck` bem sucedido; testes em `anonymize.test.ts` isolam os comportamentos com vitest).
- **INTEGRATION:** NOT_RUN (Requer banco integrado para checar jobs pendentes de redis/filas).
- **E2E:** NOT_RUN.
- **EXTERNAL:** NOT_APPLICABLE.

## Próxima Ação
- **Responsável Próxima Etapa:** ZC-04/05.
- **Ações Solicitadas:** Quando houver módulos implementando mais armazenamento de dados pessoais, o operador deverá referenciar a deleção nos arquivos base criados (`anonymize.ts` e `export.ts`) garantindo que as tabelas adjacentes sejam cobertas pela lógica do LGPD. Commitar localmente os arquivos e prosseguir.
