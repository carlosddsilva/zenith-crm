# Estado do Zenith CRM

Data-base: 2026-09-14

## Status oficial

- CRM Core Native (CRM-02 a CRM-09): `COMPLETE`;
- CRM-10 — remoção global do Supabase e hardening: `COMPLETE`;
- Supabase Database/Auth/Realtime/Storage no runtime: `ZERO`;
- Voice/IVR técnico: `COMPLETE`;
- `VOICE_LIVE_HOMOLOGATION=PENDING`.

A homologação física de voz ainda deve cobrir inbound, IVR, handoff, RX, TX e hangup. Ela não altera o status técnico do core, mas impede declarar voz homologada em ambiente real.

## Fonte de verdade e serviços

PostgreSQL armazena todos os dados de negócio. Redis contém eventos efêmeros de realtime e as filas `zenith:automation:events`, `zenith:automation:events:processing` e `zenith:automation:events:dead`; o outbox PostgreSQL recupera eventos de automação quando Redis fica indisponível. Broadcasts e recipients vivem integralmente no PostgreSQL. O volume `wacalls_data:/data` preserva as sessões WaCalls.

O pool PostgreSQL usa no máximo 10 conexões por processo por padrão, idle timeout de 20 segundos e connect timeout de 10 segundos, todos configuráveis. App e workers reutilizam conexões Redis e aplicam reconnect/backoff; Redis não é fonte de verdade de negócio.

## Controle de acesso

Hierarquia: `owner > admin > agent > viewer`.

| Ação | Agent | Admin | Owner |
|---|---:|---:|---:|
| Ler contacts, companies, deals, tasks, inbox, broadcasts e automations | sim | sim | sim |
| Criar/editar operação CRM | sim | sim | sim |
| Criar/iniciar/cancelar broadcast | não | sim | sim |
| Criar/ativar/editar automação | não | sim | sim |
| Configurar canais de mensagens/voz, IVR, pipelines, tags e campos | não | sim | sim |
| Administrar conta e membros | não | sim | sim |

Cookies de sessão são `httpOnly`, `SameSite=Lax`, `Secure` em produção, limitados a 1–90 dias e armazenados no banco somente como SHA-256 do token. Logout revoga a sessão atual e expira o cookie. O proxy verifica origem em mutações autenticadas por cookie, rejeita UUIDs malformados e deixa a autenticação/autorização definitiva para os handlers.

Endpoints internos de automação e broadcast usam `ZENITH_WORKER_SECRET` com comparação timing-safe e não aceitam cookie humano. Webhooks Evolution e WaCalls usam tokens próprios com comparação timing-safe; Meta valida `x-hub-signature-256` e falha fechado sem secret.

## Auditoria de tenancy

| Rotas | Escopo aplicado | Risco residual |
|---|---|---|
| account/members | membership da sessão | baixo |
| contacts/companies | `accountId` em leitura e mutação; relações validadas | baixo |
| pipelines/deals | pipeline, stage, contact, company e assignee validados no tenant | baixo |
| tasks/notes/activities | `accountId` e relações controladas | baixo |
| conversations/messages | conversation, contact e channel no tenant | baixo |
| calls/voice/IVR | call, channel e flow no tenant | baixo |
| broadcasts/recipients | campaign, channel, audience e recipient no tenant | baixo |
| automations/runs | automation, evento e execução no tenant | baixo |
| dashboard | todos os agregados filtrados por `accountId` | baixo |

O teste de integração reutilizável cobre foreign UUID em Contact, Company, Deal, Task, Conversation, Call, Broadcast e Automation, além de filtros estrangeiros e tentativas de vincular deal/stage de outro tenant. IDs estrangeiros retornam 404/resultado vazio ou validação controlada, sem revelar dados.

## Segurança e operação

- respostas 5xx são genéricas; logs registram IDs/status/errorCode sem tokens, payloads, SDP, corpo de mensagem ou telefone completo;
- CORS do WaCalls permite apenas a origem configurada em `WACALLS_ALLOWED_ORIGIN`; endpoints autenticados não usam wildcard;
- URLs buscadas pelo backend passam por proteção SSRF, redirects manuais, HTTPS/destino público quando exigido e limites de tamanho;
- bulk contacts é limitado a 1.000 rows por request, deduplica e grava em chunks de 200;
- exports CSV neutralizam prefixos de fórmula; mídia valida tipo/tamanho e não grava em filesystem local;
- security headers incluem `X-Content-Type-Options`, frame restriction, `Referrer-Policy`, HSTS e CSP report-only compatível com WebRTC;
- rate limit cobre login, envio de mensagem, início de broadcast, atualização/ativação de automação, início de chamada e bulk contacts;
- PostgreSQL/Redis/WaCalls são publicados apenas em loopback; app roda como usuário não-root e a imagem copia dependências de produção.

## Banco e performance

Migrations Drizzle mantêm sequência e snapshots imutáveis; `0021` adiciona somente índices comprovados para tasks, deals, broadcasts/recipients, automations/outbox/runs. Execução repetida de `db:migrate` é no-op. `drizzle-kit check` não aponta drift.

`EXPLAIN` confirmou index scan/bitmap index scan para contacts por tenant, conversations por tenant/última mensagem, recipients por tenant+broadcast+status e outbox por status+createdAt. Listagens principais têm paginação ou limite defensivo; não foi encontrado N+1 crítico nas páginas principais. Valores monetários usam `numeric(12,2)`/parser decimal e datas persistem com timezone.

## Gates desta validação

- testes unitários e integração: `PASS`;
- typecheck: `PASS`;
- lint: `PASS` sem errors; warnings existentes classificados como não bloqueantes;
- diff check: `PASS`;
- database/infra checks: `PASS`;
- migrations repetidas e drift: `PASS`;
- build WaCalls: `PASS`;
- build app Linux, restart controlado, health, logs e smoke final: `PASS`;
- backup PostgreSQL em formato custom e restore real em instância isolada: `PASS` (35 tabelas públicas restauradas).

## Legado preservado

- `supabase/migrations/`: histórico SQL, sem imports ou tooling ativo;
- arquivos `*.bak*`/`*.backup*` fora do runtime: material histórico sem segredo conhecido;
- migrations Drizzle aplicadas: imutáveis; novas alterações entram somente em números posteriores.

Procedimentos de deploy, backup, restore, recovery e health estão em [docker.md](./docker.md).
