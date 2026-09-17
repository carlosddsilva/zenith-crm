# Handoff ZC-11 — Agentes de IA, RAG, memória e orçamento

## Identificação

- **Módulo:** ZC-11
- **MODULE_STATUS:** PARTIAL
- **SHA inicial:** `7980ca772d7a30d3e70247d6514cf05152292618`
- **SHA final:** `7980ca772d7a30d3e70247d6514cf05152292618` (worktree não commitado)
- **Commit:** `COMMIT_PENDING` — a sessão não autorizou commit e o checkout já continha mudanças extensas de outros módulos.
- **AI_TECHNICAL_GATE:** PASS
- **AI_LIVE_GATE:** PENDING_EXTERNAL

`MODULE_STATUS` permanece `PARTIAL`: o núcleo técnico foi implementado e testado sem chamadas externas, mas não houve autorização de gasto, credencial real, modelo/preço real, canal real ou homologação E2E. Mock/fake não é evidência de prontidão comercial.

## Decisão de provider e limites

O `HEAD` continha uma implementação histórica BYO-key com um contrato de geração desacoplado e adapters HTTP para OpenAI/Anthropic, além de embeddings OpenAI e fallback lexical. Essa implementação estava removida no worktree e dependia de Supabase. O ZC-11 reaproveita o contrato, timeout, normalização de uso e estratégia híbrida, reimplementados sobre PostgreSQL/Drizzle.

Decisão registrada antes da integração específica:

- existe **um adapter de geração provider-neutral**; ele preserva os dois backends historicamente aceitos (`openai` e `anthropic`), sem SDK novo;
- embeddings preservam o mecanismo OpenAI compatível histórico e o índice `vector(1536)` já compatível com a imagem `pgvector/pgvector:pg16`;
- **não existe modelo, preço, chave ou moeda de custo presumidos** no runtime;
- cada versão exige provider, modelos, preços em micros por milhão, limites por chamada/período/tokens/concorrência e chaves BYO criptografadas;
- configuração inválida ou incompleta não pode ativar o agente; o estado inicial no banco é `inactive`;
- nenhum request real foi enviado a OpenAI, Anthropic, Meta ou Evolution nesta entrega.

## Modelo de isolamento e controle

- Um agente por `accountId`, garantido por índice único em `ai_agents`.
- Instruções e políticas ficam em snapshots imutáveis em `ai_agent_versions`; o agente aponta para `currentVersion`.
- Documentos, versões, chunks, embeddings, memória, jobs, runs, períodos orçamentários e fontes de run carregam `accountId` e são filtrados antes de uso.
- Retrieval faz join simultaneamente por tenant em chunk, documento e versão; exige documento/versão `ready` e a versão corrente.
- Fonte removida deixa de ser recuperável imediatamente. Antes do envio, todas as citações são revalidadas contra tenant, estado e versão.
- Mensagens, memória e conteúdo recuperado entram no prompt como dados não confiáveis. A camada fixa proíbe mudança de autoridade, revelação de segredos e tools fora da allowlist.
- O único tool server-side permitido neste recorte é `create_task`, apenas quando explicitamente autorizado na versão do agente. Nenhum shell, browser, comando arbitrário ou runtime de voz foi acrescentado.

## Ingestão e RAG

Fluxo:

1. `POST /api/zenith/ai/documents` e `PUT /api/zenith/ai/documents/[id]` validam tenant autenticado, MIME allowlisted, texto não vazio, conteúdo não binário e limite de 1 MB.
2. Documento e versão são persistidos, com SHA-256, tamanho, status e erro sanitizado.
3. Um `ai_job` idempotente é criado na mesma transação. O worker usa lease e `FOR UPDATE SKIP LOCKED`; job abandonado volta a ser elegível após expiração.
4. O texto é dividido deterministicamente em chunks. Conteúdo nunca é executado.
5. Se embeddings, preço e orçamento estiverem válidos, a chamada é reservada/medida e os vetores são persistidos. Falha semântica degrada para lexical e fica visível como `errorCode`.
6. Retrieval é híbrido: cosine search quando há embedding da consulta e `tsvector/plainto_tsquery` como caminho autônomo/fallback.

Migration `0031_red_carnage.sql` cria a extensão vetorial se ausente, tabelas/índices de IA, GIN para FTS, HNSW cosine e a chave idempotente `messages.ai_run_id`. Ela foi aplicada com sucesso em um banco PostgreSQL 16/pgvector vazio contendo toda a cadeia 0000–0031.

## Orçamento e contabilização

- Unidade: micros da moeda operacional do tenant; preços por milhão de tokens são fornecidos explicitamente pelo administrador.
- Antes de geração, embedding de documento ou embedding de consulta, uma transação atualiza atomicamente `reservedMicros` e `activeReservations`, condicionada ao limite mensal e à concorrência.
- A reserva de geração considera entrada estimada e o máximo configurado de saída; limite por chamada é verificado antes da reserva.
- Após a resposta, tokens e custo real são reconciliados. Quando o provider omite uso, ocorre timeout ou o estado de entrega é incerto, cobra-se conservadoramente a reserva inteira.
- Reservations expiradas são recuperadas e reconciliadas pelo worker; Redis não é fonte de verdade.
- Replay usa chaves únicas por tenant. Um estado externo incerto nunca dispara reenvio: o run é cobrado conservadoramente e transferido para humano.

## Handoff, ownership e envio

- `ai_conversation_controls.generation` é monotônico. Takeover humano, mensagem humana e handoff incrementam/inutilizam gerações em voo.
- Antes de enviar, o runtime revalida conta ativa, agente ativo, ownership sem humano, controle ativo/mesma geração, opt-out, bloqueio e anonimização.
- Retomar IA exige `POST /api/zenith/ai/conversations/[id]` com `mode=active`; isso limpa assignment/pause e incrementa a geração.
- Mensagem gerada usa `messages.ai_run_id` único. Replay normal não duplica envio; estado de entrega incerto vira handoff em vez de retry externo.
- Autoresponder determinístico ativo tem precedência. Follow-ups ativos são cancelados por takeover/resposta/handoff para não competirem.
- Não houve qualquer alteração em WaCalls, WebRTC, dialer, IVR ou runtime de voz.

## Memória, retenção e privacidade

- Memória é escopada por `accountId + contactId + conversationId`, limitada a 1.000 caracteres e tipos allowlisted.
- Cada item recebe `expiresAt` conforme a versão do agente (1–365 dias); consultas excluem expirados e apagados.
- `DELETE /api/zenith/ai/memory?contactId=...` redige conteúdo e marca `deletedAt`.
- A anonimização LGPD do contato também redige memória de IA.
- A exportação DSR inclui memória do contato e passou a filtrar tags/notas explicitamente pelo tenant.
- Prompts completos não são persistidos. Runs guardam versão, duração, tokens/custo, códigos de resultado/erro e referências mínimas; `outputText` permanece nulo.

## APIs e UI

- `GET|PUT|DELETE /api/zenith/ai/config`
- `GET|POST /api/zenith/ai/documents`
- `PUT|DELETE /api/zenith/ai/documents/[id]`
- `POST /api/zenith/ai/conversations/[id]`
- `POST|DELETE /api/zenith/ai/memory`
- `GET /api/zenith/ai/runs`
- `POST /api/zenith/workers/ai/process` (segredo de worker)
- `/agents`: estado, versão, base/erros, orçamento, custo, handoffs, falhas e latência recente.

O worker `scripts/ai-worker.mjs` tem health endpoints e serviço Compose dedicado. Jobs de resposta são enfileirados transacionalmente depois de uma mensagem inbound realmente nova.

## Avaliação e evidências

Conjunto versionado: `src/lib/ai/evaluation-set.json`, com FAQ fundamentada, ausência de informação, prompt injection, pedido humano e criação autorizada de tarefa.

Resultado técnico sintético:

- decisão esperada: **5/5 (100%)**;
- reserva sintética total: **5.500 micros** usando preços exclusivamente sintéticos do teste;
- latência local p95 da camada de decisão: **< 50 ms**;
- qualidade, custo e latência de modelo real: **não medidos** (`PENDING_EXTERNAL`).

Testes obrigatórios cobertos:

| Cenário | Evidência |
| --- | --- |
| vazamento entre tenants | integração PostgreSQL filtra fonte A/B |
| prompt injection | unitário de prompt + ação proibida + handoff determinístico |
| fonte removida | integração de retrieval e revalidação pré-envio |
| informação ausente | parser exige fonte/citação e transfere |
| memória limpa | integração redige e deixa de recuperar |
| corrida de orçamento | oito reservas paralelas, somente duas aceitas |
| timeout/custo desconhecido | adapter classifica timeout; integração cobra reserva integral |
| replay | unique por tenant e reserva sem dupla contabilização |
| handoff durante geração | geração do controle muda e bloqueia o envio |
| opt-out | elegibilidade bloqueada no banco real |
| tenant suspenso | elegibilidade bloqueada no banco real |
| worker reiniciado | lease expirado é recuperado e attempts incrementa |

## Comandos e resultados

- `npm.cmd run db:generate` → exit 0; gerou `0031_red_carnage.sql` e snapshot.
- cadeia `drizzle-kit migrate` contra `zc11_ai_test` isolado → exit 0; migrations 0000–0031 aplicadas.
- `vitest ... ai.test.ts evaluation.test.ts` → exit 0; **8 testes passaram**.
- `vitest --config vitest.integration.config.ts ai-db.integration.test.ts` com `RUN_DB_TESTS=true` e DB isolado → exit 0; **6 testes passaram**.
- `npm.cmd test` → exit 0; **47 arquivos passaram, 3 skipped; 429 testes passaram, 13 skipped**.
- `npm.cmd run lint` → exit 0; **0 erros, 221 avisos legados**.
- `tsc --noEmit` → exit 1; apenas 3 handlers de follow-up pré-existentes usam `params` síncrono incompatível com Next 16.
- `npm.cmd run build` no Windows → exit 1 antes de compilar por `EISDIR/readlink` em `src/app/api/account/members/route.ts`.
- `docker compose build app` → webpack **compilou com sucesso**; typecheck parou exclusivamente nos mesmos handlers pré-existentes de follow-up.
- `docker compose config --quiet` → exit 0 (com aviso local de permissão para `~/.docker/config.json`).
- banco sintético `zc11_ai_test` foi removido com `dropdb --force` ao final; não continha dados reais e não é recuperável.

## Gates

- **TENANCY: PASS** — filtros/join por `accountId` e teste real de fonte cross-tenant.
- **SECURITY: PASS** — agente inativo por padrão, chaves criptografadas, prompt/documentos não confiáveis, allowlist de tool, opt-out/suspensão/ownership e auditoria sanitizada.
- **UNIT: PASS** — 8/8 testes específicos; suíte global 429/429.
- **INTEGRATION: PASS** — 6/6 em PostgreSQL/pgvector isolado, incluindo concorrência e lease.
- **E2E: NOT_RUN** — não houve browser, canal real nem envio externo autorizado.
- **EXTERNAL: PENDING_EXTERNAL** — faltam credenciais, seleção explícita de modelos/preços reais, gasto autorizado e tenants/canais sintéticos homologados.

### AI_TECHNICAL_GATE: PASS

Schema, migration, isolamento, ingestão, retrieval híbrido, memória, budgets, idempotência/recovery, handoff, UI e worker têm evidência unitária e PostgreSQL. O build Linux compilou todo o código; o gate global de typecheck continua bloqueado somente pelo contrato antigo de três rotas de follow-up, fora do ZC-11.

### AI_LIVE_GATE: PENDING_EXTERNAL

Responsável: operador/admin do tenant, com revisão de segurança/financeiro. Próximas ações:

1. escolher provider/modelos e registrar preços reais na moeda operacional;
2. fornecer chaves BYO e um canal sandbox, sem dados pessoais reais;
3. autorizar teto de gasto explícito;
4. rodar o conjunto de avaliação com modelo real, medir precisão, custo e p95;
5. homologar envio/handoff/replay com um destino sintético explícito;
6. revisar retenção com DPO e corrigir o gate global das rotas de follow-up.

## Próximo módulo

O trabalho técnico pode seguir para o responsável do **ZC-12 (Voz/IVR/WaCalls)** sem alteração do core de voz por este módulo. Liberação comercial permanece bloqueada pelo `AI_LIVE_GATE`, pelo E2E e pelos gates live já pendentes de Voz/IVR. Nenhum push, merge ou publicação foi realizado.

