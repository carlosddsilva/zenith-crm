# ZC-12 — Matriz de voz e homologação

## Identificação da execução

| Campo | Valor |
|---|---|
| Data | 2026-09-16 (America/Cuiaba) |
| Branch | `main` |
| SHA auditado | `7980ca772d7a30d3e70247d6514cf05152292618` |
| Estado do repositório | dirty preexistente; nenhuma limpeza, reset, merge, push ou commit |
| WaCalls vendorizado | upstream `edeb31f0427aba896639db503153b777a405eccf` |
| Node / npm | Node `v24.16.0`; npm `11.13.0` |
| Go | `go1.27.0 windows/amd64` |
| Banco técnico | PostgreSQL isolado `zc12_voice_test`, criado, migrado e removido ao final |
| Serviços observados | PostgreSQL/Redis/app/voice worker/WaCalls locais healthy no Compose |
| Alvos usados | somente IDs, telefones e URLs sintéticos; nenhuma chamada real |

Status usados: `PASS`, `BLOCKED`, `NOT_RUN`, `PENDING_EXTERNAL`.

## Matriz técnica

| ID | Cenário | Esperado | Observado | Status | Evidência sanitizada |
|---|---|---|---|---|---|
| V01 | Inventário account → channel → session → call | vínculo explícito e tenant-scoped | `voice_channels.account_id`, `config.sessionId`, `calls.account_id/voice_channel_id/provider_call_id`; consultas de API filtradas por tenant | PASS | inspeção de schema/rotas e teste DB ZC-12 |
| V02 | Build/test do core WaCalls | core compila e testes passam | `go test ./...` passou em todos os pacotes | PASS | execução local; nenhum segredo/telefone exibido |
| V03 | Cliente standalone WaCalls | TypeScript e bundle de produção válidos | `tsc -b && vite build`: 1746 módulos, bundle concluído | PASS | build local; dependências instaladas por `npm ci --ignore-scripts` |
| V04 | Dependências do cliente WaCalls | sem achados conhecidos de auditoria | npm informou 6 vulnerabilidades: 1 low, 2 moderate, 3 high; não foi aplicado `npm audit fix` | BLOCKED | saída agregada do npm, sem detalhes sensíveis |
| V05 | Gateway disponível/indisponível | health determinístico e falha fechada | `/health/live` retornou 200; provider converte falha de rede em 502 e rotas não expõem `error.message` | PASS | probe local e testes de contrato |
| V06 | Playback/TTS/DTMF/recording | somente capacidades comprovadas podem publicar | gateway deste SHA não registra `/playback`; `audio.play` agora é `unsupported`; TTS planned; DTMF/voice/transfer unsupported; recording false | PASS | source audit, probe sintético 404 e validação unitária |
| V07 | Fluxo IVR publicável | fluxo suportado publica sem erro de capability | `trigger.inbound → call.answer → queue.route` validou | PASS | `voice-contract.test.ts` |
| V08 | Execução IVR e handoff humano | bot aceita, libera owner/bridge e não derruba cliente | execução publicada chamou `accept`, depois `release`, nunca `DELETE`; call ficou `ringing`, sem agent e sem `ended_at` | PASS | teste PostgreSQL isolado com fetch sintético |
| V09 | Fluxo antigo com áudio | falha antes de chamar endpoint inexistente | runtime retorna `wacalls_playback_unsupported` 501 e não executa fetch | PASS | teste unitário |
| V10 | Dois tenants com mesmo provider call ID | registros independentes, sem vazamento | deduplicou dentro do channel A e criou registro distinto no tenant B | PASS | teste PostgreSQL isolado |
| V11 | Evento duplicado | um único `call_event` por provider event ID | segunda inserção retornou no-op; uma linha persistida | PASS | teste PostgreSQL isolado |
| V12 | Evento atrasado/fora de ordem | estado terminal nunca regride | `ended → ringing/active` recusado; corrida `active`/`ended` terminou em `ended` | PASS | lock `FOR UPDATE` e teste concorrente |
| V13 | Contagem de atendidas | somente `answered_at`, nunca apenas `ended_at` | timestamp criado apenas ao entrar em `active`; dashboard Zenith Calls conta `answered_at` | PASS | teste DB e inspeção da UI |
| V14 | Capacidade e simultaneidade | último slot reservado uma vez | corrida de 2 agentes para capacidade 1: 1 sucesso e 1 conflito | PASS | teste PostgreSQL isolado |
| V15 | Agente já ocupado | não inicia segunda call ativa | advisory lock + consulta por agent/estados ativos; core WaCalls também verifica owner ativo | PASS | inspeção e suíte Go |
| V16 | Claim exclusivo/segundo agente | segundo owner recebe conflito | `Broker.setOwner` mantém owner inicial e teste Go cobre conflito/release/reclaim | PASS | `broker_test.go` |
| V17 | Outro usuário tenta ação/WebRTC | não pode controlar ou ligar ponte de call atribuída | rotas action/WebRTC agora recusam `assigned_agent_id` divergente | PASS | inspeção, lint e typecheck sem erro ZC-12 |
| V18 | Release/transferência | release não encerra call; novo owner pode assumir | release remove owner e bridge; chamada permanece no registry; A→release→B coberto | PASS | suíte Go e teste IVR DB |
| V19 | Histórico/timeline | ordenado, idempotente e sanitizado | detalhe ordena por occurred/created/id; payload não é exposto; end/failure reason usa vocabulário finito | PASS | testes de contrato e inspeção |
| V20 | Worker após perda de SSE | reconnect com backoff e reconciliação de finais | código usa 2–30 s de backoff e history reconciliation; corrigido para inbound e outbound | PASS | sintaxe JS + inspeção; teste dinâmico fica na homologação |
| V21 | Reinício do provider durante call | não perder estado/media | PostgreSQL preserva call e worker reconcilia fim, mas bridge/owner do broker são memória volátil | PENDING_EXTERNAL | exige call real controlada e restart autorizado |
| V22 | F5 outbound | recuperar call, timer, ringback, worklets e mute | ID/client ID persistem; estado vem do PostgreSQL; mídia/worklets renegociam ao ficar active; mute é reaplicado por call ID | PASS | inspeção e typecheck; áudio real pendente |
| V23 | F5 inbound ativa | call atribuída reaparece e mídia é renegociada | endpoint retorna apenas active do agent; controle agora recria WebRTC sem novo accept e reaplica mute | PASS | inspeção e typecheck; áudio real pendente |
| V24 | Perda de rede do browser | mídia volta sem encerrar call | não houve ensaio browser/network; recuperação após F5 existe, mas reconexão automática sem reload não foi comprovada | PENDING_EXTERNAL | requer browser, microfone e degradação de rede controlada |
| V25 | Tenant suspenso | bloquear novas operações e permitir cleanup ativo | start/WebRTC/accept/reject bloqueados; `hangup` de call já ativa permanece permitido; webhook de lifecycle continua processando fim | PASS | inspeção de guards; live pendente |
| V26 | Contato bloqueado/opt-out/anônimo | não originar nova call; remover PII sem impedir cleanup | POST bloqueia por contact ID ou número conhecido; anonimização zera phones/payload/participante e mantém call active + providerCallId | PASS | teste DB de privacidade |
| V27 | Retenção automática de histórico de voz | política e expurgo verificáveis | não existe política explícita de dias/worker de expurgo para calls/call_events neste SHA | BLOCKED | requer decisão de produto/legal antes de implementação |
| V28 | Logs e respostas | sem token, SDP, ICE, mídia, telefone completo ou erro cru | rotas e worker registram códigos/IDs técnicos; provider errors são respostas genéricas; evidências desta matriz estão sanitizadas | PASS | inspeção e diffs existentes |
| V29 | Suspensão durante IVR inbound novo | não iniciar atendimento automatizado indevido | listener precisa continuar para cleanup; não há hoje política explícita para rejeitar um novo inbound já entregue durante suspensão | BLOCKED | decisão operacional necessária (reject, voicemail ou drop controlado) |
| V30 | Build/typecheck integral do CRM | build integral verde | typecheck chega ao módulo de voz sem erro, mas falha em 3 rotas preexistentes de follow-up com `params` síncrono no Next 16 | BLOCKED | erros em followups `[id]`, `[id]/history`, `[id]/publish` |

## Matriz de homologação ao vivo

| ID | Cenário real | Pré-requisitos | Resultado atual |
|---|---|---|---|
| L01 | Outbound real, ringback, accept, áudio bidirecional e hangup | conta WaCalls pareada; dois números autorizados; browser Chromium; mic/fone | PENDING_EXTERNAL |
| L02 | Inbound real, notificação, claim A e conflito B | dois agentes autorizados; segundo browser/perfil | PENDING_EXTERNAL |
| L03 | Busy/simultaneidade real no limite do channel | pelo menos 2 agentes e 2 números de teste | PENDING_EXTERNAL |
| L04 | F5 durante ringing e active | call real ativa; autorização para recarregar browser | PENDING_EXTERNAL |
| L05 | Perda/restauração de rede do browser | controle de rede; call real; janela de indisponibilidade definida | PENDING_EXTERNAL |
| L06 | Restart do voice worker | autorização para reiniciar somente o worker durante call | PENDING_EXTERNAL |
| L07 | Restart do WaCalls | autorização explícita; janela; confirmação de que nenhuma call real alheia está ativa | PENDING_EXTERNAL |
| L08 | IVR publicado: answer → handoff humano | flow sem áudio/TTS/DTMF; fila/agentes; inbound autorizado | PENDING_EXTERNAL |
| L09 | IVR com mídia | endpoint de playback realmente implementado e revisado no gateway | BLOCKED |
| L10 | Rejeição/timeout/busy/duplicidade final do provider | números de teste e roteiro de indução por cenário | PENDING_EXTERNAL |

Nenhum cenário `Lxx` foi executado. Não houve ligação, aceite, rejeição ou encerramento de chamada real.

