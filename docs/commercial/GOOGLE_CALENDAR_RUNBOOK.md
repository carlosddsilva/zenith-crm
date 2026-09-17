# Runbook — Google Calendar

## Escopo operacional

Cada usuário do tenant pode autorizar uma conexão OAuth e escolher exatamente um calendário gravável. O backend sincroniza somente eventos que possuem vínculo com um compromisso Zenith; eventos pessoais sem vínculo são ignorados. Convites nunca são enviados pelo conector (`sendUpdates=none`). Séries recorrentes encontradas em vínculos existentes ficam somente leitura.

## Google Cloud

1. Crie ou selecione um projeto Google Cloud separado para o ambiente.
2. Ative a Google Calendar API.
3. Configure a tela de consentimento e os usuários de teste. A publicação/verificação é uma etapa comercial externa.
4. Crie um OAuth Client do tipo **Web application**.
5. Cadastre exatamente o callback do ambiente:
   `https://CRM_HOST/api/zenith/integrations/google-calendar/oauth/callback`.
6. Cadastre domínio, homepage, política de privacidade e termos conforme a política de produção do Google.

Scopes usados:

- `https://www.googleapis.com/auth/calendar.events` — CRUD dos eventos vinculados;
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly` — seleção de um calendário gravável.

O fluxo usa `state` aleatório vinculado a sessão, usuário e tenant, consumo único, expiração de 10 minutos, PKCE S256, acesso offline e consentimento explícito. O refresh token nunca é enviado ao navegador.

Referências oficiais vigentes na implementação: [OAuth para aplicações web](https://developers.google.com/identity/protocols/oauth2/web-server), [sincronização incremental](https://developers.google.com/workspace/calendar/api/guides/sync), [push notifications](https://developers.google.com/workspace/calendar/api/guides/push), [quotas e backoff](https://developers.google.com/workspace/calendar/api/guides/quota) e [ETag/versões](https://developers.google.com/calendar/api/guides/version-resources).

## Variáveis de ambiente

```dotenv
GOOGLE_CALENDAR_CLIENT_ID=...
GOOGLE_CALENDAR_CLIENT_SECRET=...
GOOGLE_CALENDAR_REDIRECT_URI=https://crm.example.com/api/zenith/integrations/google-calendar/oauth/callback
GOOGLE_CALENDAR_PUSH_URL=https://crm.example.com/api/webhooks/zenith/google-calendar
# Opcional; se ausente, usa ENCRYPTION_KEY.
GOOGLE_CALENDAR_ENCRYPTION_KEY=<64 caracteres hexadecimais>
```

`GOOGLE_CALENDAR_PUSH_URL` deve ser HTTPS público e encaminhar o corpo/headers sem alteração. Nunca use uma variável `NEXT_PUBLIC_*` para credenciais. A rotação da chave de criptografia exige reautorização ou uma rotina explícita de recifragem; não troque a chave silenciosamente.

## Deploy

1. Faça backup do PostgreSQL.
2. Execute `npm run db:migrate`. As migrations ZC-10 são `0029_milky_the_stranger.sql` e `0030_amused_wild_child.sql`; a segunda acrescenta constraints compostas de tenant.
3. Suba app e `google-calendar-worker`. No Compose, o worker chama os endpoints internos com `ZENITH_WORKER_SECRET` e expõe `/live` e `/ready` apenas dentro do container.
4. Confirme que o callback configurado no Google é byte a byte igual a `GOOGLE_CALENDAR_REDIRECT_URI`.
5. Em **Configurações → Google Calendar**, conecte a conta de teste e escolha um calendário descartável.

## Comportamento e recuperação

- A fila `google_calendar_sync_jobs` é a fonte durável. Jobs usam lease, oito tentativas e backoff exponencial truncado com jitter.
- Push somente sinaliza mudança. O webhook valida canal, resource ID, token hash, expiração e monotonicidade do message number, então enfileira um pull.
- O scheduler faz reconciliação periódica e renova o canal antes da expiração.
- `nextSyncToken` só é salvo depois que todas as páginas foram aplicadas. HTTP 410 limpa apenas o cursor/espelho da integração e inicia full sync; compromissos e edições locais pendentes permanecem.
- ETag divergente enquanto há edição local vira `conflict`; o usuário escolhe **Usar Zenith** ou **Usar Google**.
- 403 `rateLimitExceeded`, 429 e 5xx voltam para a fila com backoff. `invalid_grant` marca a conexão como revogada e elimina as credenciais locais inutilizáveis.
- Desconectar tenta parar o canal e revogar o grant, elimina credenciais locais e cancela jobs. Compromissos Zenith e cópias remotas existentes são preservados. Logout comum não desconecta a integração.

## Homologação ao vivo

Use apenas uma conta e calendário de teste autorizados, sem clientes reais:

1. conectar e confirmar que o refresh token não aparece no browser/log;
2. selecionar um calendário vazio;
3. criar, editar e cancelar um compromisso Zenith e confirmar a cópia no Google;
4. editar o evento no Google e confirmar a atualização no Zenith;
5. produzir uma edição concorrente e resolver cada lado na UI;
6. validar evento com timezone e evento de dia inteiro (fim exclusivo);
7. revogar o acesso no Google e confirmar o estado `revoked`;
8. interromper o worker, editar no Google, religar e confirmar reconciliação;
9. observar renovação do canal e simular mensagem inválida/fora de ordem;
10. desconectar e confirmar preservação dos compromissos/cópias e ausência de credenciais locais.

Sem esse ciclo e sem aprovação da tela de consentimento, use respectivamente `GOOGLE_LIVE_GATE=PENDING_EXTERNAL` e `GOOGLE_COMMERCIAL_ACCESS_GATE=PENDING_EXTERNAL`.
