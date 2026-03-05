
import { analyzeConversationHistory } from './server/aiAgent';

// Simulating the user's conversation log
const conversationLog = [
  { fromMe: true, text: "Oi Roberta! Fico feliz em saber que você está animada com o AgenteZap! 😊 Vou te contar como funciona o plano completo..." },
  { fromMe: true, text: "Oi Roberta, me fala qual o seu segmento de atuação? Assim posso te mostrar como o AgenteZap pode ser útil pra você!" },
  { fromMe: true, text: "Veja o video [VIDEO_ENVIADO]" },
  // Hours later
  { fromMe: true, text: "Oi Roberta! Já deu para fazer seu cadastro no AgenteZap? Se ainda não, é bem rápido e não custa nada: https://agentezap.online. Se precisar de ajuda com algo, é só chamar! 😊" },
  { fromMe: false, text: "Como fazer o cadastro" },
  { fromMe: false, text: "Eu preciso entender se teu trabalho me atende" },
  { fromMe: true, text: "Roberta, fiquei feliz em esclarecer sua questão! O processo de cadastro é bem rápido... Quanto a saber se o AgenteZap se encaixa..." },
  { fromMe: true, text: "Já viu o vídeo que mandei? Ele demonstra como o sistema opera no dia a dia. Se quiser, posso detalhar algum ponto específico que te interesse!" },
  { fromMe: false, text: "Vi mas pelo que entendi realmente não é isto" },
  { fromMe: true, text: "Claro, entendi sua dúvida! Como Rodrigo, da AgenteZap, meu papel é justamente te auxiliar com nossos serviços. Tem algo específico que posso te ajudar hoje?" },
  { fromMe: false, text: "Eu preciso de um atendimento de IA respondendo as dúvidas enviando vídeos áudios etc" },
  { fromMe: true, text: "Roberta, fique tranquila! O AgenteZap realmente pode resolver essa questão. Nossa inteligência artificial consegue tirar dúvidas..." },
  { fromMe: true, text: "É possível desenvolver um assistente exclusivo... Posso mandar um vídeo demonstrativo ou te explicar passo a passo como configurar o seu. Qual opção você prefere? 😊" },
  { fromMe: false, text: "Aguardo" }
];

console.log("=== RODANDO TESTE DE ANTI-AMNÉSIA ===");

const memory = analyzeConversationHistory(conversationLog, "Roberta");

console.log("\nRESULTADO DA ANÁLISE:");
console.log("Has Greeted:", memory.hasGreeted);
console.log("Has Asked Name:", memory.hasAskedName);
console.log("Has Explained Product:", memory.hasExplainedProduct);
console.log("Pending Actions:", JSON.stringify(memory.pendingActions, null, 2));

// Test Assertions
let passed = true;

if (!memory.hasGreeted) {
    console.error("❌ FALHA: Não detectou que já cumprimentou!");
    passed = false;
}

const hasPendingVideo = memory.pendingActions.some(a => a.toLowerCase().includes("vídeo") || a.toLowerCase().includes("video"));
if (!hasPendingVideo) {
    console.error("❌ FALHA: Não detectou ação pendente de enviar vídeo após 'Aguardo'!");
    passed = false;
} else {
    console.log("✅ SUCESSO: Detectou pendência de envio de vídeo!");
}

if (passed) {
    console.log("\n✅ TESTE PASSOU: O sistema anti-amnésia está detectando corretamente o contexto!");
} else {
    console.error("\n❌ TESTE FALHOU: O sistema ainda está com amnésia.");
    process.exit(1);
}
