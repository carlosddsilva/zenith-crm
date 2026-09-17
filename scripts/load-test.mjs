import autocannon from "autocannon";

/**
 * Script de Teste de Carga E Concorrência
 * Utiliza o Autocannon para bombardear as rotas críticas de API 
 * para garantir observabilidade e licenças.
 */

const targetUrl = process.env.ZENITH_APP_URL || "http://127.0.0.1:3100";

const instance = autocannon({
  url: targetUrl,
  connections: 50,
  pipelining: 1,
  duration: 10,
  requests: [
    {
      method: "GET",
      path: "/api/health/ready",
    }
    // Adicionar rotas autenticadas enviando headers com Cookie de sessão aqui.
  ]
}, console.log);

autocannon.track(instance, { renderProgressBar: true });

instance.on("done", (result) => {
  console.log("=== TESTE DE CARGA CONCLUÍDO ===");
  if (result.non2xx > 0 || result.errors > 0) {
    console.error(`ALERTA: Tivemos ${result.non2xx} respostas não 200 e ${result.errors} erros de rede!`);
  } else {
    console.log("SUCESSO: A aplicação sustentou a carga sem erros.");
  }
});
