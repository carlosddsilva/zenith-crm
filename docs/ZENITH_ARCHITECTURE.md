# Arquitetura Zenith CRM

```text
Browser
  -> Next.js 16 (Zenith session + account context)
       -> PostgreSQL 16 / Drizzle (dados duráveis)
       -> Redis 7 (realtime + fila efêmera)
       -> MessagingProvider
            -> Meta Cloud API
            -> Evolution API
       -> VoiceProvider -> WaCalls
       -> workers de automação, broadcast e voz
```

## Princípios

1. PostgreSQL é a fonte de verdade; Redis nunca é a única cópia de um efeito de negócio.
2. Toda query de recurso combina o identificador com `account_id` ou passa por relação já limitada ao tenant.
3. Sessões usam token aleatório de 256 bits, apenas o SHA-256 é persistido, e o cookie é `httpOnly`, `sameSite=lax`, `secure` em produção.
4. Credenciais de provider são cifradas no banco e nunca usam variável `NEXT_PUBLIC_*`.
5. Endpoints `/api/zenith/workers/*` exigem `ZENITH_WORKER_SECRET` com comparação timing-safe e não aceitam cookie humano como autenticação.
6. Mensageria e voz dependem de adapters; regras da Inbox não dependem de SDK de provider.

## Filas e recuperação

- `zenith:automation:events`: fila principal;
- `zenith:automation:events:processing`: itens em processamento;
- `zenith:automation:events:dead`: DLQ após três tentativas.

O worker devolve a fila `processing` para a principal no startup. A constraint `(automation_id, trigger_event_id)` torna repetição segura. O outbox PostgreSQL recupera falha de publicação no Redis.

Broadcast não usa Redis: recipients são reclamados atomicamente no PostgreSQL como `processing`. Um restart não reenvia rows `sent` nem `processing`; itens ambíguos exigem reconciliação manual para privilegiar ausência de duplicata.

## Segurança de borda

O Proxy do Next protege páginas por presença otimista do cookie, valida Origin nas mutações cookie-authenticated e rejeita UUIDs malformados antes do PostgreSQL. A autorização real continua nos Route Handlers. APIs não emitem CORS público; WaCalls nega CORS cross-origin por padrão e aceita somente `WACALLS_ALLOWED_ORIGIN` explícito.
