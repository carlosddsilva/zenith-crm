# Contratos e Compartilhamentos - Zenith CRM

Este documento define os limites e contratos a serem respeitados na implementação dos módulos (ZC-01 a ZC-13).

## 1. Resolução de Tenant e Permissões
- **Fonte da verdade:** Token/Sessão baseada em Postgres/Redis com cache restrito.
- **Contrato:** Todo endpoint protegido deve resolver `accountId` da sessão. Em mutações, validar pertinência do recurso (`company`, `deal`, `contact`) ao `accountId`.

## 2. Auditoria
- **Contrato:** Mutações cruciais e deleções precisam persistir um evento de log apontando o `userId` responsável. Não deve logar senhas, tokens ou payload sensível.

## 3. Atividades
- **Contrato:** Tasks e notes são polimórficos. Ao consultar, certifique-se de que o recurso raiz pertence ao tenant.

## 4. Eventos e Outbox
- **Contrato:** Processos assíncronos não devem falhar silenciosamente se o Redis cair. Uso do Outbox (Postgres) é obrigatório como contingência. 

## 5. Envio de Mensagens
- **Contrato:** Interfaces de abstração de provider em `lib/messaging/providers` devem ser usadas. 

## 6. Arbitragem Humano / Automação / IA
- **Contrato:** Operador humano sempre pausa bots automaticamente para a conversa em questão. Automações de broadcast via template ou sistema fogem dessa pausa (envio sistêmico).

## Ordem de Migrations e Integração
- **Contrato:** Apenas 1 agente atualiza o esquema do banco de dados e gera o arquivo Drizzle de migration (por ex. `0022_...`) por vez. Um integrador central deve revisar arquivos de migração caso haja concorrência entre ZCs.
