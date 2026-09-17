# Handoff ZC-12 — WaCalls, Zenith Calls e voz

## Resultado

- `VOICE_TECHNICAL_GATE=PASS`
- `VOICE_LIVE_HOMOLOGATION=PENDING_EXTERNAL`
- `READY_FOR_LIVE_CALL=CONDITIONAL`
- `MODULE_STATUS=PARTIAL_NOT_COMPLETE`
- `COMMIT_STATUS=COMMIT_PENDING`

O gate técnico passou para o subconjunto realmente suportado neste SHA: chamadas humanas inbound/outbound, ownership exclusivo, WebRTC, lifecycle, histórico, IVR lógico e handoff do bot para humano. Playback, TTS, DTMF, entrada por voz, recording e transferência não foram inferidos pela UI; permanecem bloqueados conforme a matriz de capability.

O módulo não está completo porque nenhuma chamada real foi autorizada/executada, a homologação de áudio/rede/restart depende de recursos externos e ainda faltam decisões explícitas para retenção e para novo inbound durante suspensão.

## Mudanças aplicadas

1. Estado e concorrência

   - `transitionCallState` agora bloqueia a linha com `FOR UPDATE`, impedindo que entregas concorrentes façam uma chamada terminal regredir.
   - A reconciliação do worker deixou de ignorar finais outbound.
   - `answered_at` continua sendo gravado somente na transição para `active`.

2. Ownership e isolamento

   - WebRTC exige `assigned_agent_id` igual ao usuário autenticado.
   - Ações recusam call atribuída a outro agente.
   - Conta suspensa continua podendo executar apenas `hangup` de call ativa; novos accepts/rejects/originações/WebRTC permanecem bloqueados.
   - Runtime IVR recebeu `accountId` explícito e consulta call por `callId + accountId`.

3. IVR honesto

   - `audio.play` WaCalls mudou de `ready` para `unsupported`: não existe rota `/playback` no gateway vendorizado deste SHA.
   - Um fluxo antigo que alcance áudio falha fechado antes de chamar a rede.
   - `queue.route` passou a representar o handoff terminal que já existe: aceita a chamada, executa `/release`, solta owner/bridge do bot e devolve a call ainda viva aos agentes.
   - `queue.route` não anuncia branches de resultado que o runtime não produz.

4. Recuperação da UI

   - Outbound após F5 recupera call pelo ID persistido, timer por `answered_at`, ringback por estado e recria os AudioWorklets/WebRTC.
   - Mute passa a ser persistido por call e reaplicado ao reconectar.
   - Inbound já ativa após F5 agora renegocia a mídia sem executar `accept` novamente.

5. Privacidade e suspensão

   - Nova origem de call é bloqueada para contato `isBlocked`, `optOut` ou anonimizado, inclusive quando o número conhecido é informado sem `contact_id`.
   - Anonimização remove telefones de `calls`, payload de `call_events` e PII de participantes, mas preserva state/channel/providerCallId para não abandonar a limpeza de uma chamada ativa.
   - Audit log registra somente a presença anterior de telefone, não o número.

Nenhuma mudança ZC-12 foi feita no core Go protegido. Os arquivos Go já estavam dirty antes desta fase; foram apenas lidos e testados. Não foi criado patch de core.

## Evidência de verificação

- Unit/integration geral: 48 arquivos passaram, 4 skipped; 435 testes passaram, 20 skipped.
- Contratos ZC-12: 6 testes passaram.
- PostgreSQL isolado ZC-12: 7 testes passaram.
- WaCalls Go: `go test ./...` passou.
- Cliente WaCalls: `tsc -b && vite build` passou (1746 módulos).
- ESLint direcionado: 0 erros; avisos preexistentes de hooks no dialer e import preexistente sem uso.
- Worker: `node --check scripts/voice-events-worker.mjs` passou.
- Probe local: WaCalls health 200; rota de playback não disponível.
- Typecheck CRM: sem erro ZC-12; bloqueado por três rotas preexistentes de follow-up incompatíveis com `params: Promise<...>` do Next 16.
- Build nativo/integral: não repetido como gate verde; o bloqueio conhecido de follow-up permanece. O cliente standalone WaCalls foi buildado separadamente.

O `npm ci` do cliente WaCalls informou 6 vulnerabilidades agregadas (1 low, 2 moderate, 3 high). Nenhum `npm audit fix` foi aplicado porque atualização automática de dependências foge do escopo e pode alterar o upstream vendorizado.

## O que falta para homologação ao vivo

Disponibilizar, com autorização explícita:

- conta/sessão WaCalls de teste pareada, sem chamadas de terceiros ativas;
- dois números/aparelhos exclusivamente de teste;
- dois usuários/agentes e dois perfis de browser;
- browser Chromium compatível com AudioWorklet, microfone e saída de áudio;
- rede onde seja permitido simular perda/restauração;
- janela autorizada para reiniciar voice worker e, separadamente, WaCalls;
- fluxo publicado apenas com nodes suportados (`trigger`, `answer`, lógica/horário, handoff ou hangup).

Antes de reiniciar WaCalls ou encerrar qualquer sessão, confirmar que não há chamada real ativa. A execução deve seguir os cenários `L01–L10` da [matriz](./ZC-12_VOICE_MATRIX.md), anexando somente horários, estados, IDs sintéticos/mascarados e resultados de áudio — nunca token, SDP, ICE, mídia ou telefone completo.

## Pendências explícitas

- Definir retenção de `calls`, `call_events` e metadados de voz (prazo, base legal, legal hold e rotina de expurgo).
- Definir política para novo inbound entregue quando o tenant já está suspenso: reject, voicemail ou encerramento controlado. O listener não pode ser desligado porque ainda precisa limpar calls previamente ativas.
- Corrigir as três rotas de follow-up do Next 16 para liberar o typecheck/build integral.
- Triar as 6 vulnerabilidades reportadas no lockfile do cliente WaCalls sem atualização automática do upstream.

## Commit

Nenhum commit foi criado. O worktree já continha muitas mudanças de outros módulos e o branch está 14 commits à frente do upstream; fazer commit agora misturaria autoria e escopo. Estado: `COMMIT_PENDING`.

