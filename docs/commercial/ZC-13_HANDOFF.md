# Handoff ZC-13 — gate final e liberação comercial

## Decisão

`RELEASE_DECISION=NO_GO`

O bloqueador interno de compilação foi corrigido e os gates de typecheck, lint, regressão e build Linux passaram. Isso não autoriza liberação comercial: a jornada E2E, recovery completo e homologações externas obrigatórias continuam pendentes.

Nenhum deploy, tag, push, merge, publicação, chamada, mensagem, convite, sincronização Google ou consumo de IA real foi executado.

## Identificação do candidato corrigido

| Item | Evidência |
| --- | --- |
| Data | 2026-09-16, America/Cuiaba |
| Branch | `main` |
| SHA recebido no início | `7980ca772d7a30d3e70247d6514cf05152292618` |
| SHA de código validado | `170cf880a5c8e4adcf7ef0ab34bf9da6882975b6` |
| Commit de código | `feat: consolidate Zenith release candidate` |
| Lockfile | SHA-256 `453e4c330e3776bbb5c296185b7a8fd34ce735d59101aff31772a2b33187656a` |
| Build Linux | Imagem `zenith-crm-app:local`; manifest list `sha256:f27ab8084996bcfa7ef40b235cfc04959d4cef28eede7a3bbe1aa0010b74474d` |
| Migrations verificadas | 0000–0031 em bancos PostgreSQL descartáveis |

O SHA de código acima contém o runtime, testes, configuração, migrations e os módulos usados por todas as validações desta correção. O commit documental posterior não altera o código testado.

## Causa confirmada e correção

As rotas dinâmicas de follow-up ainda tratavam `context.params` como objeto síncrono. No Next.js 16, `params` é uma `Promise`; por isso o typecheck do build rejeitava os módulos `followups/[id]`, `publish` e `history`.

Foram corrigidos:

- `src/app/api/zenith/followups/[id]/route.ts`;
- `src/app/api/zenith/followups/[id]/publish/route.ts`;
- `src/app/api/zenith/followups/[id]/history/route.ts`;
- `src/app/api/zenith/followups/followup-routes.test.ts`;
- `eslint.config.mjs`.

Os handlers agora tipam `params: Promise<{ id: string }>` e aguardam sua resolução. Autenticação, autorização, `accountId`, validação e respostas HTTP foram preservados. As mutações finais de PATCH, DELETE e publish também exigem o `accountId` no predicado.

O lint oficial já executava `eslint`, como requerido no Next.js 16. A configuração foi ajustada para ignorar somente `infra/wacalls/client/dist/**`, artefato minificado gerado; os fontes continuam cobertos. Não foram usados `any`, `ts-ignore`, exclusões de fontes ou `ignoreBuildErrors`.

## Resultado dos gates desta correção

| Gate | Status | Evidência |
| --- | --- | --- |
| `TYPECHECK` | `PASS` | `npm run typecheck`, exit 0. |
| `LINT` | `PASS` | `npm run lint`, exit 0; 0 erros e 220 warnings. |
| `BUILD_LINUX` | `PASS` | `docker compose --env-file .env.local build --progress plain app`, exit 0. |
| `REGRESSION` | `PASS` | 49 arquivos aprovados, 4 ignorados; 441 testes aprovados e 20 ignorados. |
| Rotas de follow-up | `PASS` | 6/6 testes, incluindo parâmetros prometidos, autorização e rejeição de tenant estrangeiro. |
| PostgreSQL condicional | `PASS` | Core 7/7, IA 6/6, voz 7/7 e Calendar sintético PASS. |
| ZC-05 focado | `PASS` | 19 arquivos, 232/232 testes. |
| ZC-07 focado | `PASS` | 2 arquivos, 39/39 testes. |
| `E2E` | `NOT_RUN` | Não existe evidência da jornada integrada obrigatória. |
| `EXTERNAL` | `PENDING_EXTERNAL` | Google, IA, WhatsApp e voz real não foram acionados. |
| Recovery completo | `NOT_RUN` | Reinício/falhas de PostgreSQL, Redis, providers, anexos e `wacalls_data` não foram exercitados nesta correção. |

## Revisão dos 20 testes ignorados

Os 20 testes ignorados por `npm test` são exclusivamente suites PostgreSQL opt-in controladas por `RUN_DB_TESTS=true`:

- core contacts/dashboard: 7 testes;
- IA: 6 testes;
- voz: 7 testes.

Todos foram executados separadamente em bancos descartáveis, depois das migrations 0000–0031, e passaram. Nenhum teste obrigatório foi convertido em opcional. O teste sintético de Google Calendar também passou para tenancy, unicidade e evento all-day.

## Handoffs consolidados

| Módulo | Estado após esta correção |
| --- | --- |
| ZC-05 | Handoff criado; evidência unitária e gates globais registrados; E2E/provider pendentes. |
| ZC-06 | SHA e gates acrescentados; concorrência/recovery do outbox e E2E pendentes. |
| ZC-07 | Handoff criado; builder/validação e gates globais registrados; worker/E2E pendentes. |
| ZC-08 | SHA, correção de params, testes de autorização/tenancy e gates registrados; dispatcher/provider E2E pendente. |
| ZC-09 | SHA e gates registrados; suíte dedicada de SLA e jornada temporal ainda não executadas. |
| ZC-10 | Parcial; Google OAuth/sync real e E2E pendentes. |
| ZC-11 | Parcial; provider, orçamento, qualidade/latência e E2E pendentes. |
| ZC-12 | Parcial; voz real, retenção e homologação de IVR/handoff pendentes. |

Os handoffs documentam o que foi efetivamente comprovado; gates não executados permanecem `NOT_RUN` ou `PENDING_EXTERNAL`.

## Bloqueadores restantes

1. Jornada E2E integrada e transversal entre tenant/plano/membros, canal, CRM, automações, follow-up, SLA, Calendar, IA, voz e auditoria.
2. Recovery completo, incluindo PostgreSQL, Redis, anexos, `wacalls_data`, configuração e material de recuperação de segredos, com RTO/RPO.
3. Homologações externas autorizadas de Google, IA, WhatsApp e voz/IVR.
4. Testes de restart, indisponibilidade, concorrência, carga, alertas e observabilidade operacional.
5. Aceites formais dos módulos e revisão de licenças já apontada no gate anterior.

Compilação aprovada encerra este bloqueador interno, não a liberação comercial.

## Atualização 2026-09-17 — E2E integrado e tenancy transversal

Esta seção preserva o registro anterior e o atualiza com a etapa posterior executada sobre o HEAD `5ad91f1ea72aaba383ebf702c02651083c057124`. O relatório detalhado está em `docs/commercial/E2E_REPORT.md`.

| Gate | Estado atualizado | Evidência |
| --- | --- | --- |
| `E2E_INTERNAL` | `PASS` | Playwright 1/1, 34,2 s, exit 0; UI, API, worker, PostgreSQL, Redis e outbox reais |
| `TENANCY_E2E` | `PARTIAL` | contatos, deals, tarefas, conversas, mensagens, automações, follow-ups, radar/SLA, export, calls-read, realtime, papéis, superadmin e revogação cobertos; anexos e calls mutáveis/WebRTC pendentes |
| `TYPECHECK` | `PASS` | `npm.cmd run typecheck`, exit 0 |
| `LINT` | `PASS` | `npm.cmd run lint`, 0 erros e 220 warnings |
| `REGRESSION` | `PASS` | 51 arquivos aprovados, 4 ignorados; 445 testes aprovados, 21 ignorados; PostgreSQL cross-tenant 7/7 |
| `BUILD_LINUX` | `PASS` | imagem `zenith-crm-app:local`, manifest list `sha256:f096c12ad4acb7036835d24c993b371db031f5b00d609e5ae86e1df81a0f4915` |
| `EXTERNAL` | `PENDING_EXTERNAL` | nenhum provider real acionado |
| Recovery completo | `NOT_RUN` | permanece bloqueador |

Foram corrigidos defeitos reproduzidos na timeline PostgreSQL, persistência inbound/SLA, status do export cross-tenant e busca do radar/conversas. Também foram corrigidos duas traduções ausentes e o harness/configuração de lint. A execução final usou somente dados sintéticos, adapter WhatsApp local e infraestrutura E2E isolada.

`RELEASE_DECISION=NO_GO` permanece inalterado. O próximo bloqueador é recovery completo e cobertura de anexos/download autorizado, seguido pelas homologações externas e demais aceites formais.
