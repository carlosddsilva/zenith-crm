# Matriz de Lacunas (Gap Matrix) - Zenith CRM

## Recursos Solicitados vs Módulos

| Recurso Solicitado | Módulo Relacionado | Status Atual | Evidências | Bloqueadores |
| :--- | :--- | :--- | :--- | :--- |
| 1. Tarefas | ZC-04 | EXISTENTE_VALIDADO | schema/activities.ts | Nenhum |
| 2. Empresas | ZC-03 | EXISTENTE_VALIDADO | schemas Drizzle | Nenhum |
| 3. Agenda | ZC-04 | PARCIAL | Drizzle/Postgres base | Falta endpoints Google Cal |
| 4. Automações | ZC-08 | EXISTENTE_VALIDADO | engine.ts, automations.ts | Nenhum |
| 5. Outbox | ZC-08 | EXISTENTE_VALIDADO | outbox Drizzle schema | Nenhum |
| 6. Tenants | ZC-02 | EXISTENTE_VALIDADO | auth middleware, UUID checks | Nenhum |
| 7. Permissões | ZC-02 | EXISTENTE_VALIDADO | roles.test.ts, API context | Nenhum |
| 8. Auditoria | ZC-10 | PARCIAL | Auditoria logs via middleware | Falta painel/rotas de log |
| 9. Armazenamento | ZC-09 | EXISTENTE_VALIDADO | media/gallery.test.ts | Nenhum |
| 10. Chamadas e IA | ZC-06, ZC-11 | EXISTENTE_NAO_VALIDADO | Voice channel-store, ai configs | Homologação real de voz |

## Definição dos Módulos ZC-01 a ZC-13

- **ZC-01: Auditoria e congelamento do baseline**: COMPLETO.
- **ZC-02: Tenancy, Permissões e Segurança**: Setup inicial, garantir isolamento de `accountId`. EXISTENTE_VALIDADO. 
- **ZC-03: CRM Core**: Contacts, Companies, Deals, Pipelines. EXISTENTE_VALIDADO.
- **ZC-04: Gestão de Tarefas e Agenda**: Tarefas, lembretes e sincronização externa. PARCIAL.
- **ZC-05: Messaging**: WhatsApp, Inbox, Templates. EXISTENTE_VALIDADO.
- **ZC-06: Voice & IVR**: WaCalls integration. EXISTENTE_NAO_VALIDADO (requer homologação física).
- **ZC-07: Broadcast & Campaigns**: Outbox de envios em massa. EXISTENTE_VALIDADO.
- **ZC-08: Automações e Outbox**: Workers de Redis/Postgres. EXISTENTE_VALIDADO.
- **ZC-09: Armazenamento e Mídia**: Gestão de arquivos. EXISTENTE_VALIDADO.
- **ZC-10: Auditoria de Eventos e Logs**: Log extensivo de mutações. PARCIAL.
- **ZC-11: IA Integrada**: Auto-reply, Summarization (Claude/OpenAI). PARCIAL.
- **ZC-12: Homologação e E2E**: Testes reais. AUSENTE.
- **ZC-13: Deployment e Release 1.0**: Scripts VPS e empacotamento. PARCIAL.
