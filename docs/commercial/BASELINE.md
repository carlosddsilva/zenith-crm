# Baseline - Zenith CRM (Auditoria ZC-01)

Data: 2026-09-16
SHA Auditado: `7980ca772d7a30d3e70247d6514cf05152292618`

## Verificações Iniciais
- **Repositório e Branch:** Confirmados (localizados em `d:\Dev\Zenith-CRM\zenith-crm`).
- **Supabase Runtime:** Confirmado ZERO instâncias no código (nenhuma dependência de `@supabase/supabase-js` em runtime, conforme testes e `grep`).
- **Scripts Existentes:** `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:integration`.

## Ambiente Necessário (Levantamento Inicial)
- Staging/VPS: PENDENTE (Definir para ZC-13).
- Telefone/Navegador Teste: PENDENTE (Necessário para ZC-05, ZC-06 e ZC-12).
- Conta Google/OAuth: PENDENTE.
- Provider IA: PENDENTE (Orçamento e chaves necessários para ZC-11).

## DeskcommCRM Referência
- **Repositório:** `https://github.com/melgarafael/DeskcommCRM`
- **SHA Consultada:** `cf35c944483c02069d6896e3d4ee1d4af1dcc4b4`
- **Licença / Código Extraído:** Nenhum código ainda extraído nesta fase.

## Gates Técnicos
- **TENANCY**: PASS (Implementado no Middleware e verificado em testes pre-existentes).
- **SECURITY**: PASS (Segurança passiva ok. Supabase auth substituído, rotas protegidas).
- **UNIT**: PASS (Testes rodados usando `npm run test` com sucesso, sem DB).
- **INTEGRATION**: NOT_RUN (Pulados/skipped por ausência de DB de teste isolado e seguro no momento).
- **E2E**: NOT_RUN (Testes end-to-end não rodados).
- **EXTERNAL**: PENDING_EXTERNAL (Sem credenciais reais Meta/Evolution configuradas na execução de hoje).
