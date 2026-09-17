# Zenith CRM — relatório E2E integrado e isolamento transversal

## Resultado executivo

| Gate | Resultado |
| --- | --- |
| `E2E_INTERNAL` | `PASS` |
| `TENANCY_E2E` | `PARTIAL` |
| `EXTERNAL` | `PENDING_EXTERNAL` |
| `RELEASE_DECISION` | `NO_GO` |

O fluxo interno coberto passou de ponta a ponta em aplicação Next.js de produção, API, PostgreSQL, Redis, outbox, worker e adapter local. A classificação de tenancy permanece `PARTIAL` porque não existe cobertura E2E suficiente de upload/download de anexos, contadores de todas as telas e mutações/WebRTC de chamadas. As homologações reais de Google, IA, WhatsApp e voz, recovery completo e demais aceites obrigatórios continuam pendentes.

## Identificação e ambiente

| Item | Evidência |
| --- | --- |
| Data | 2026-09-17, `America/Cuiaba` |
| Baseline informado | `170cf880a5c8e4adcf7ef0ab34bf9da6882975b6` |
| HEAD encontrado antes desta etapa | `5ad91f1ea72aaba383ebf702c02651083c057124` |
| SHA do candidato E2E | `d10ce57589598cd85626aa39204fa11d994a9044` |
| Imagem final testada | `zenith-crm-app:local`, manifest list `sha256:f096c12ad4acb7036835d24c993b371db031f5b00d609e5ae86e1df81a0f4915` |
| Aplicação | Next.js 16.3.5, imagem Linux Node 22, `127.0.0.1:3100` |
| Worker | `automation-worker`, `127.0.0.1:3102` |
| PostgreSQL | `pgvector/pgvector:pg16`, banco/usuário `zenith_e2e`, loopback `55432` |
| Redis | `redis:7-alpine`, loopback `56379`, `PONG` |
| Storage de teste | dados efêmeros em `tmpfs`; nenhuma integração de objeto externa |
| Projeto Compose | `zenith-crm-e2e` |

Os destinos foram conferidos antes das escritas. O banco, Redis, cookies, usuários, telefones, tokens e chaves usados são exclusivos do E2E e sintéticos. PostgreSQL e Redis foram iniciados primeiro, as migrations 0000–0031 foram aplicadas, e somente então aplicação e worker foram iniciados. Nenhum volume, sessão WhatsApp ou credencial de produção foi reutilizado.

Foram criados dois tenants independentes, cada um com owner/admin e atendente. Admin A, admin B, atendente A e superadmin usaram quatro contextos de navegador separados. E-mails usam o domínio reservado `.invalid`.

## Comandos finais relevantes

```text
docker compose -p zenith-crm-e2e -f e2e/docker-compose.yml up -d --wait postgres redis
npm.cmd run test:e2e:migrate
docker compose -p zenith-crm-e2e -f e2e/docker-compose.yml up -d --wait app automation-worker
node e2e/support/provider-adapter.mjs
npm.cmd run test:e2e
```

Resultado terminal do Playwright:

```text
Running 1 test using 1 worker
ok 1 ... interface, API, worker, persistence and tenant isolation (28.6s)
1 passed (34.2s)
```

Gates adicionais:

| Comando | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | PASS, exit 0 |
| `npm.cmd run lint` | PASS, exit 0; 0 erros e 220 warnings legados |
| `npm.cmd test -- --run` | PASS; 51 arquivos aprovados, 4 ignorados; 445 testes aprovados, 21 ignorados |
| Vitest timeline + export | PASS; 2 arquivos, 3 testes |
| PostgreSQL focado cross-tenant | PASS; 7/7 |
| `docker build --progress=plain -t zenith-crm-app:local .` | PASS; TypeScript e 64 rotas; digest acima |

Os 21 testes ignorados no Vitest global incluem suites opt-in PostgreSQL. A suite cross-tenant alterada nesta etapa foi executada explicitamente com `RUN_DB_TESTS=true` e passou 7/7. Os 20 testes PostgreSQL restantes permanecem respaldados pela baseline informada e não foram ocultados ou enfraquecidos nesta etapa.

## Jornada comercial coberta

| Cenário | Resultado e evidência |
| --- | --- |
| Login e separação de sessão | PASS; quatro contextos independentes e autenticação real por cookie |
| Contato, negócio, tarefa, nota/atividade | PASS; criação por API real e persistência PostgreSQL; contato A visível na UI e B ausente |
| Timeline | PASS; timeline por contato e por negócio contém tarefa e atividade |
| Mudança de etapa | PASS; duas mudanças executadas e uma única atividade correspondente persistida, sem duplicação |
| Automação | PASS; publicação, evento de domínio, outbox, claim e execução real pelo worker; run `completed` e nota criada |
| Follow-up | PASS; enrollment criado e cancelado com `cancel_reason=customer_replied` após inbound |
| Radar/SLA | PASS; conversa atingiu `overdue`; resposta humana limpou `first_unreplied_message_at`, restaurou `sla_status=ok` e pausou autorresposta de IA |
| Atribuição/transferência | PASS; owner atribuiu ao atendente, atendente transferiu ao owner; atendente recebeu 403 ao tentar administração de membros |
| Reload/reconexão | PASS para reload e nova leitura consistente; contextos independentes autenticaram separadamente. Reinício completo do processo do navegador preservando a mesma sessão não foi exercitado |
| Realtime | PASS no escopo SSE: inbound B não apareceu na sessão A; inbound A publicou evento para A |
| Export e auditoria | PASS; export próprio retornou tenant A; auditoria persistiu autor, tenant, operação `EXPORT` e entidade |
| Interrupção/handoff interno | PASS no escopo de resposta humana: `ai_autoreply_disabled=true` e transferência de ownership. Geração/handoff com provider de IA real não foi homologado |

Agregados sanitizados da persistência final:

```text
Tenant A: contacts=1 deals=1 tasks=1 conversations=1 messages=2 automation_runs_completed=1 cancelled_followups=1
Tenant B: contacts=1 deals=1 tasks=1 conversations=1 messages=1 automation_runs_completed=1 cancelled_followups=1
intrusion_rows=0
export_audits_with_actor_tenant=1
reset_sla_and_ai_paused=1
```

O log limpo do worker registra apenas claims e dispatches bem-sucedidos. A aplicação registra dois cancelamentos de follow-up por `customer_replied`. Não houve retry ou erro após ordenar migrations antes de app/worker.

## Isolamento transversal

Tenant A recebeu IDs conhecidos do tenant B. A cobertura executada foi:

| Superfície | Cobertura | Resultado |
| --- | --- | --- |
| Contatos | leitura por ID, busca e export | PASS; 404/resultado vazio, sem conteúdo B |
| Negócios | PATCH por ID e criação com pipeline/stage B no corpo | PASS; 404/400, sem mutação |
| Tarefas | PATCH por ID e criação com `contactId` B | PASS; 404/400, sem mutação |
| Conversas | leitura por ID, criação com contato B, busca e atribuição com agente B | PASS; 404/400/resultado vazio |
| Mensagens | listagem de conversa B | PASS; 404 |
| Automações | leitura por ID e verificação de outbox B antes/depois | PASS; 404 e nenhum job adicional |
| Follow-ups | leitura por ID | PASS; 404 e nenhum efeito B |
| Radar/SLA | busca de conversa B e evento realtime B→A | PASS; resultado vazio e zero evento na sessão A |
| Auditoria | autoria/tenant/operação do export próprio | PASS por persistência; não existe tela/rota dedicada de auditoria coberta |
| Exportações | export próprio e export de contato B | PASS; 200 próprio e 404 estrangeiro |
| Chamadas | leitura de call B conhecida | PASS; 404 |
| Permissões | atendente tentando criar membro | PASS; 403 |
| Revogação | membro A removido, cookie/sessão já existente reutilizado | PASS; contexto passou a 401 |
| Superadmin | tenant comum em `/api/platform/accounts` e superadmin separado | PASS; 403 comum, 200 superadmin |
| Contadores | agregados sanitizados por tenant e ausência de outbox B indevido | PASS no banco; contadores de todas as telas não cobertos |
| Anexos/downloads | não há fluxo seguro de storage/download exercitado | NOT_RUN |
| Chamadas mutáveis/WebRTC | somente isolamento de leitura de call conhecida | PARTIAL |

Nenhuma resposta incluiu conteúdo B na sessão A e `intrusion_rows=0`. A cobertura transversal é `PARTIAL`, não `PASS`, por causa das lacunas explícitas acima.

## Dependências simuladas

- WhatsApp/Evolution: adapter HTTP local implementa somente o contrato `sendText`; inbound é injetado por endpoint de teste protegido por token e opt-in explícito `ZENITH_E2E_TEST_ADAPTERS=true`.
- Google Calendar: não foi necessário para a jornada executada e nenhum endpoint Google real foi chamado.
- IA: nenhum provider real foi chamado. Foi validada apenas a interrupção interna da autorresposta após mensagem humana e a transferência de ownership.
- Voz: nenhum provider/chamada real foi acionado. Um canal e uma call sintéticos foram persistidos diretamente apenas para testar isolamento de leitura.
- Storage: PostgreSQL/Redis usam `tmpfs`; upload/download de objeto não foi simulado nem aprovado.

Esses adapters comprovam contratos internos apenas. Eles não aprovam homologação externa, qualidade/latência de IA, entrega WhatsApp, OAuth/sync Google, telefonia, IVR ou WebRTC reais. Nenhuma mensagem, convite, chamada ou despesa real foi gerada.

## Defeitos encontrados e corrigidos

1. Timeline PostgreSQL retornava 500 porque o `UNION ALL` misturava enums e texto, e o caminho vazio por `dealId` tinha shape incompatível. Foram adicionados casts explícitos e shape uniforme. Regressão por contato e negócio incluída.
2. Inbound abortava a transação ao interpolar um objeto `Date` em SQL bruto no `COALESCE` de SLA. O instante agora é ISO com cast `timestamptz`.
3. Export cross-tenant protegia os dados, mas convertia “not found/access denied” em HTTP 500. Foi criado erro de domínio com status 404 e teste de regressão.
4. Busca de conversas ignorava `search`, retornando conversas do próprio tenant sem correspondência. O filtro agora usa nome/telefone/e-mail/empresa do contato, com join tenant-aware também no contador. Regressão PostgreSQL adicionada.
5. Sidebar em inglês/coreano não possuía `Sidebar.companies`, causando erro de tradução em UI. As duas chaves foram adicionadas.
6. Lint não declarava `eslint-plugin-react-hooks` no mesmo bloco flat-config da regra e incluía backup `.cache` de build. Plugin e ignore de artefato foram declarados; lint passou com 0 erros.
7. Harness E2E podia ficar preso no teardown e iniciava worker antes das migrations. Páginas/contextos agora fecham explicitamente e a subida foi dividida em infra → migrate → services.

O endpoint inbound de teste continua 404 em produção por padrão; somente fica disponível com o opt-in explícito do ambiente E2E e ainda exige token e UUID do canal.

## Pendências e próximo bloqueador

1. Implementar/exercitar armazenamento, upload, download autorizado e isolamento de anexos.
2. Ampliar tenancy E2E para contadores de todas as telas e mutações/ações/WebRTC de calls.
3. Executar recovery completo de PostgreSQL, Redis, filas/outbox, anexos, providers e `wacalls_data`, com RTO/RPO.
4. Homologar externamente, com destinos e autorização explícitos, Google, IA, WhatsApp e voz/IVR.
5. Obter os aceites comerciais/formais restantes e revisar observabilidade, concorrência, carga e licenças.

Próximo bloqueador recomendado: recovery completo e cobertura de anexos/download autorizado. Até sua conclusão e as homologações externas, `RELEASE_DECISION=NO_GO`.
