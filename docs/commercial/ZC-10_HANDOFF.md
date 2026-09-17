# Handoff — ZC-10 Google Calendar

## Identificação

- Módulo: ZC-10 — Google Calendar
- SHA inicial: `7980ca772d7a30d3e70247d6514cf05152292618`
- SHA final: `7980ca772d7a30d3e70247d6514cf05152292618` (sem commit nesta sessão)
- `MODULE_STATUS=PARTIAL`
- Commit: `COMMIT_PENDING`
- Próximo módulo liberado: nenhum; integração final depende dos gates externos e do build de produção.

O checkout já estava amplamente modificado e com migrations `0021`–`0028` não rastreadas. As alterações alheias foram preservadas. ZC-10 usa as novas migrations `0029` e `0030`; nenhuma migration anterior foi reescrita.

## Entregue

- OAuth server-side por usuário com scopes mínimos para o recorte, state de uso único vinculado a sessão/usuário/tenant, expiração e PKCE S256.
- Tokens AES-256-GCM no PostgreSQL, refresh serializado por lock de linha e revogação tratada sem expor credenciais.
- Um calendário gravável por conexão; listagem/seleção não importa a agenda pessoal.
- Vínculos tenant-aware compromisso/conexão/evento, unicidade e idempotência por ID externo determinístico e dedupe de jobs.
- Push/pull bidirecional para compromissos vinculados, `If-Match`/ETag, prevenção de eco e conflitos explícitos na UI.
- Full/incremental sync paginado; cursor final somente após todas as páginas; HTTP 410 ressincroniza o espelho sem apagar domínio ou pending local.
- Validação de push, renovação de canais, reconciliação periódica e worker PostgreSQL durável com lease/backoff.
- Timezone, datas de dia inteiro com fim exclusivo, cancelamento e recorrência existente somente leitura.
- Desconexão separada de logout, revogação/stop best effort, limpeza local de credenciais e preservação de compromissos/cópias remotas.
- Runbook: [GOOGLE_CALENDAR_RUNBOOK.md](./GOOGLE_CALENDAR_RUNBOOK.md).

## Arquivos principais

- `src/lib/db/schema/google-calendar.ts`, `src/lib/db/schema/activities.ts`, `drizzle/0029_milky_the_stranger.sql`, `drizzle/0030_amused_wild_child.sql`
- `src/lib/google-calendar/{client,config,crypto,mapping,oauth,protocol,queue,sync}.ts`
- `src/app/api/zenith/integrations/google-calendar/**`
- `src/app/api/webhooks/zenith/google-calendar/route.ts`
- `src/app/api/zenith/workers/google-calendar/**`
- `src/components/settings/google-calendar-settings.tsx`
- `scripts/google-calendar-worker.mjs`, `scripts/test-google-calendar-db.mjs`
- ajustes cirúrgicos no CRUD de appointments, settings, proxy, Compose, Dockerfile e exemplos de ambiente.

## Migration e compatibilidade

- `0029`: tabelas de conexão, state OAuth, vínculos e jobs; adiciona `all_day`, `all_day_start`, `all_day_end` em appointments com default compatível.
- `0030`: índices/foreign keys compostos que impedem conexão, compromisso ou job de cruzar `accountId` no banco.
- Aplicação completa em `zc10_calendar_test`: PASS. `drizzle-kit check`: PASS. Nenhuma migration foi aplicada ao banco principal/produção.

## Evidências técnicas sanitizadas

| Comando                                                    | Exit | Resultado                                                                                                                           |
| ---------------------------------------------------------- | ---: | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd run typecheck` (antes de regenerar `.next/types`) |    0 | ZC-10/source PASS                                                                                                                   |
| `npm.cmd run typecheck` (após tipos do build)              |    1 | FAIL global nas três rotas preexistentes de followups; nenhuma falha ZC-10                                                          |
| `npm.cmd test`                                             |    0 | 45 arquivos/421 testes PASS; 2 arquivos/7 testes preexistentes skipped                                                              |
| `npm.cmd run lint`                                         |    0 | PASS sem errors; 226 warnings preexistentes/fora do bloqueio                                                                        |
| `drizzle-kit check`                                        |    0 | PASS                                                                                                                                |
| migrate em `zc10_calendar_test`                            |    0 | 31 migrations aplicadas                                                                                                             |
| `npm.cmd run test:google-calendar-db` no banco isolado     |    0 | tenancy, unicidade e all-day PASS; dados sintéticos com rollback                                                                    |
| `npm.cmd run build`                                        |    1 | FAIL ambiental: Node/FS Windows retorna `EISDIR` para `readlink` de qualquer arquivo regular                                        |
| `next build` (Turbopack)                                   |    1 | FAIL ambiental: filesystem recusou criação de junction para `argon2`                                                                |
| `docker compose --env-file .env.local build app`           |    1 | ZC-10 compilou; gate global falhou depois em rotas preexistentes `followups/[id]` com contrato `params` incompatível com Next.js 16 |
| auditoria de presença das variáveis Google (sem valores)   |    0 | client ID, client secret, callback e push URL ausentes                                                                              |

O primeiro build também encontrou rede bloqueada para Google Fonts; a repetição fora do sandbox removeu essa causa e manteve a falha de filesystem. No Docker/Node 22/Linux, o webpack compilou com sucesso e a falha ocorreu apenas na validação posterior das rotas de followups, fora do escopo ZC-10.

## Gates

- `TENANCY=PASS` — filtros de contexto e constraints compostas; teste PostgreSQL rejeitou vínculo cross-tenant.
- `SECURITY=PASS` — state/replay/troca de tenant testados; PKCE; secrets cifrados; webhook validado; worker secret; auditoria sem token.
- `UNIT=PASS` — criptografia, OAuth binding/replay, paginação/cursor, HTTP 410, timezone, all-day, ETag/conflito, pending local, push inválido/expirado/fora de ordem, refresh concorrente e revogação. Reexecução focada final: 19/19.
- `INTEGRATION=PASS` — migrations e constraints em banco isolado sintético. Não cobre Google real.
- `E2E=NOT_RUN` — credenciais/domínio/conta de teste ausentes; build Windows bloqueado pelo filesystem.
- `EXTERNAL=PENDING_EXTERNAL` — nenhuma chamada, convite ou revogação real executada.
- `GOOGLE_TECHNICAL_GATE=PARTIAL` — código/typecheck/unit/integration aprovados; build de produção e E2E ainda pendentes.
- `GOOGLE_LIVE_GATE=PENDING_EXTERNAL` — requer credenciais, callback HTTPS, push público e conta/calendário de teste autorizados.
- `GOOGLE_COMMERCIAL_ACCESS_GATE=PENDING_EXTERNAL` — requer configuração/publicação/verificação da tela de consentimento e revisão de política do Google.

## Pendências e próxima ação

1. Responsável por followups/integrador: migrar os handlers dinâmicos para `params: Promise<{ id: string }>` conforme Next.js 16 e repetir o build Linux/Docker.
2. Integrador: subir migrations `0029`/`0030` no ambiente de homologação após backup.
3. Operações/Google Cloud: configurar client, callback e push HTTPS conforme runbook.
4. QA autorizado: executar todo o ciclo live do runbook com calendário descartável e registrar evidências sanitizadas.
5. Responsável comercial/compliance: concluir consent screen, verificação e políticas exigidas.
6. Integrador Git: separar e commitar somente os arquivos ZC-10, pois o checkout compartilhado contém muitas alterações de outros módulos.
