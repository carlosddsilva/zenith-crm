import { test, expect } from "@playwright/test";

test.describe.serial("Homologação de Providers Externos (Em Produção/Staging)", () => {
  // Estes testes exigem que variáveis de ambiente reais sejam preenchidas no .env.local
  // Tais como META_APP_SECRET, GOOGLE_CALENDAR_CLIENT_ID, API de IA, etc.

  test("Google Calendar - Auth e sincronização", async ({ page }) => {
    test.skip(!process.env.GOOGLE_CALENDAR_CLIENT_ID, "GOOGLE_CALENDAR_CLIENT_ID não configurado");
    // TODO: Implementar fluxo real de login via Google OAuth e validação de calendário
  });

  test("WhatsApp Cloud API - Envio e Recebimento", async ({ page }) => {
    test.skip(!process.env.META_APP_SECRET, "META_APP_SECRET não configurado");
    // TODO: Implementar envio para número de teste e verificação de retorno
  });

  test("Provider de IA - Resposta e handoff", async ({ page }) => {
    test.skip(!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY, "Chave de IA não configurada");
    // TODO: Implementar disparo de gatilho para IA e validação da resposta semântica
  });

  test("Asterisk / Voice IVR - Fluxo de ura e gravação", async ({ page }) => {
    test.skip(!process.env.SIP_TRUNK_URL, "SIP_TRUNK_URL não configurado");
    // TODO: Discar para a URA, testar input e verificar gravação de chamada
  });
});
