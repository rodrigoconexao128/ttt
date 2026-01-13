
// Mock types
interface ConversationMemory {
  hasGreeted: boolean;
  hasAskedName: boolean;
  hasExplainedProduct: boolean;
  hasAskedBusiness: boolean;
  hasSentMedia: string[];
  hasPromisedToSend: string[];
  hasAnsweredQuestions: string[];
  clientQuestions: string[];
  clientInfo: {
    name?: string;
    business?: string;
    interests?: string[];
    objections?: string[];
    stage?: string;
  };
  lastTopics: string[];
  pendingActions: string[];
}

// Copy of function from server/aiAgent.ts
export function analyzeConversationHistory(
  conversationHistory: Array<{ fromMe?: boolean; text?: string | null; timestamp?: Date | null; isFromAgent?: boolean }>,
  contactName?: string
): ConversationMemory {
  const memory: ConversationMemory = {
    hasGreeted: false,
    hasAskedName: false,
    hasExplainedProduct: false,
    hasAskedBusiness: false,
    hasSentMedia: [],
    hasPromisedToSend: [],
    hasAnsweredQuestions: [],
    clientQuestions: [],
    clientInfo: { name: contactName },
    lastTopics: [],
    pendingActions: [],
  };

  if (!conversationHistory || conversationHistory.length === 0) {
    return memory;
  }

  // Padrões de detecção
  const greetingPatterns = /^(oi|olá|ola|bom dia|boa tarde|boa noite|e aí|eae|hey|hello|fala|salve)/i;
  const nameQuestionPatterns = /(qual (é |seu |o seu )?nome|como (você |vc |tu )?(se )?chama|posso te chamar de)/i;
  const businessQuestionPatterns = /(qual (é |seu |o seu )?(negócio|ramo|área|empresa|trabalho)|o que (você |vc )?(faz|vende)|que tipo de|qual seu segmento)/i;
  const promisePatterns = /(vou (te )?(enviar|mandar|mostrar)|deixa eu (enviar|mandar)|te (envio|mando)|já já (envio|mando)|segue (o|a) )/i;
  const offerPatterns = /(posso (te )?(enviar|mandar|mostrar)|quer (ver|que eu envie|que eu mostre)|topa (ver|conhecer)|gostaria de (ver|receber))/i;
  const acceptancePatterns = /^(sim|pode|claro|com certeza|quero|manda|envia|aguardo|estou aguardando|ok|blz|tá bom|pode ser)/i;

  const questionPatterns = /\?$/;
  const mediaPatterns = /(vídeo|video|foto|imagem|áudio|audio|documento|pdf|arquivo|demonstração|demo)/i;
  const pricePatterns = /(preço|valor|quanto custa|R\$|\d+,\d{2}|\d+\.\d{2})/i;
  const featurePatterns = /(funcionalidade|recurso|função|como funciona|o que faz|benefício)/i;

  let lastOfferContent: string | null = null;

  for (const msg of conversationHistory) {
    if (!msg.text) continue;
    const text = msg.text.toLowerCase();
    const isFromUs = msg.fromMe === true;

    if (isFromUs) {
      if (greetingPatterns.test(text)) memory.hasGreeted = true;
      if (nameQuestionPatterns.test(text)) memory.hasAskedName = true;
      if (businessQuestionPatterns.test(text)) memory.hasAskedBusiness = true;
      if (pricePatterns.test(text)) {
        memory.hasExplainedProduct = true;
        memory.hasAnsweredQuestions.push("preço/valor");
      }
      if (featurePatterns.test(text)) {
        memory.hasExplainedProduct = true;
        memory.hasAnsweredQuestions.push("funcionalidades");
      }

      if (promisePatterns.test(text)) {
        const mediaMatch = text.match(mediaPatterns);
        if (mediaMatch) memory.hasPromisedToSend.push(mediaMatch[0]);
      }

      if (offerPatterns.test(text)) {
        const mediaMatch = text.match(mediaPatterns);
        if (mediaMatch) {
          lastOfferContent = mediaMatch[0];
        } else if (text.includes("como funciona") || text.includes("demonstra") || text.includes("na prática")) {
            // Added "na prática" based on user log
            lastOfferContent = "explicação/vídeo";
        }
      }

      if (text.includes("[vídeo") || text.includes("[video") || 
          text.includes("enviando vídeo") || text.includes("veja o vídeo") || text.includes("segue o vídeo")) {
        memory.hasSentMedia.push("vídeo");
        lastOfferContent = null; 
      }
      if (text.includes("[imagem") || text.includes("[image") || text.includes("foto")) {
        memory.hasSentMedia.push("imagem");
        lastOfferContent = null;
      }
      if (text.includes("[áudio") || text.includes("[audio")) {
        memory.hasSentMedia.push("áudio");
      }

    } else {
      // User message
      if (lastOfferContent && acceptancePatterns.test(text)) {
        memory.pendingActions.push(`CLIENTE ACEITOU SUA OFERTA! Envie agora: ${lastOfferContent}`);
        memory.hasPromisedToSend.push(lastOfferContent);
        lastOfferContent = null;
      }
      
      if (text.includes("aguardo") || text.includes("esperando")) {
         if (!memory.pendingActions.some(a => a.includes("Envie"))) {
            memory.pendingActions.push(`CLIENTE ESTÁ AGUARDANDO! Se prometeu algo, envie. Se não, pergunte o que ele espera.`);
         }
      }

      if (pricePatterns.test(text)) memory.clientQuestions.push("preço");
    }
  }
  return memory;
}

function generateMemoryContextBlock(memory: ConversationMemory, contactName?: string): string {
    // Simplified verison for display
    return JSON.stringify(memory, null, 2);
}

// Mock Data
const history = [
    { fromMe: false, text: "Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.", timestamp: new Date("2026-01-12T00:06:00") },
    { fromMe: true, text: "Oi Roberta! Fico feliz em saber que você está animada com o AgenteZap! 😊 Vou te contar como funciona o plano completo por R$49... Topico te mostrar um vídeo demonstrando como o sistema funciona?", timestamp: new Date("2026-01-12T00:07:00") },
    { fromMe: true, text: "Oi Roberta, me fala qual o seu segmento de atuação? Assim posso te mostrar como o AgenteZap pode ser útil pra você!", timestamp: new Date("2026-01-12T00:07:00") },
    { fromMe: true, text: "Veja o video [vídeo]", timestamp: new Date("2026-01-12T00:07:00") }, // Assuming this was sent
    { fromMe: true, text: "Oi Roberta! Já deu para fazer seu cadastro no AgenteZap? ...", timestamp: new Date("2026-01-12T07:03:00") },
    { fromMe: false, text: "Como fazer o cadastro", timestamp: new Date("2026-01-12T07:04:00") },
    { fromMe: false, text: "Eu preciso entender se teu trabalho me atende", timestamp: new Date("2026-01-12T07:04:00") },
    { fromMe: true, text: "Roberta, fiquei feliz em esclarecer sua questão! ... seria ótimo se você me desse mais detalhes sobre seu negócio... Já viu o vídeo que mandei?", timestamp: new Date("2026-01-12T07:05:00") },
    { fromMe: false, text: "Vi mas pelo que entendi realmente não é isto", timestamp: new Date("2026-01-12T07:08:00") },
    { fromMe: true, text: "Claro, entendi sua dúvida! ... Tem algo específico que posso te ajudar hoje?", timestamp: new Date("2026-01-12T07:08:00") },
    { fromMe: false, text: "Eu preciso de um atendimento de IA respondendo as dúvidas enviando vídeos áudios etc", timestamp: new Date("2026-01-12T07:13:00") },
    { fromMe: true, text: "Roberta, fique tranquila! O AgenteZap realmente pode resolver essa questão. ... Topico te mostrar na prática como isso funciona? Posso mandar um vídeo demonstrativo ou te explicar passo a passo como configurar o seu. Qual opção você prefere? 😊", timestamp: new Date("2026-01-12T07:14:00") },
    { fromMe: false, text: "Aguardo", timestamp: new Date("2026-01-12T07:15:00") }
];

const memory = analyzeConversationHistory(history, "Roberta");
console.log("MEMORY STATE:");
console.log(JSON.stringify(memory, null, 2));

if (memory.pendingActions.length > 0) {
    console.log("\n✅ PENDING ACTIONS FOUND:");
    console.log(memory.pendingActions);
} else {
    console.log("\n❌ NO PENDING ACTIONS FOUND - FAILURE CASE");
}
