/**
 * 🖼️ Test de integração Vision + AI Response
 * Simula o fluxo completo: imagem -> análise -> resposta da IA
 * 
 * Executar com: npx tsx test-vision-integration.ts
 */

import { Mistral } from "@mistralai/mistralai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.MISTRAL_API_KEY;
if (!apiKey) {
  console.error("❌ MISTRAL_API_KEY não configurada!");
  process.exit(1);
}

const client = new Mistral({ apiKey });

// Simular uma imagem de comprovante do sistema
const testImageUrl = "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/whatsapp-media/1768104134983_imagem.jpeg";

async function analyzeImage(imageUrl: string): Promise<string> {
  const analysisPrompt = `Analise esta imagem e descreva em português de forma clara e objetiva.

IMPORTANTE:
- Se for um COMPROVANTE DE PAGAMENTO: extraia valor, data, nome do pagador/recebedor, tipo (PIX, transferência, boleto)
- Se for um PRODUTO: descreva características visuais, marca se visível
- Se for uma DÚVIDA/PERGUNTA: descreva o que a pessoa parece querer saber
- Se for DOCUMENTO: identifique o tipo e informações relevantes

Responda de forma concisa (máximo 3 frases) descrevendo o que você vê.`;

  const response = await client.chat.complete({
    model: "pixtral-12b-2409",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: analysisPrompt },
          { type: "image_url", imageUrl }
        ]
      }
    ],
    maxTokens: 300,
    temperature: 0.1,
  });

  return response?.choices?.[0]?.message?.content as string || "";
}

async function generateAIResponse(imageDescription: string): Promise<string> {
  // Simular prompt de um agente de vendas
  const systemPrompt = `Você é um assistente de vendas amigável da "Rastreadores XYZ".
Sua missão é atender clientes de forma profissional e resolver suas solicitações.

REGRA CRÍTICA SOBRE IMAGENS:
- Você CONSEGUE VER e ANALISAR imagens! Elas são processadas automaticamente.
- Quando receber "(Cliente enviou uma imagem: ...)" - USE essa descrição para responder!
- Se for comprovante de pagamento: agradeça e confirme os dados que você consegue ver
- NUNCA diga "não consigo ver imagens"

Responda de forma curta e natural (2-3 linhas).`;

  const userMessage = `(Cliente enviou uma imagem: ${imageDescription})`;
  
  console.log(`\n📨 Mensagem do usuário para IA: "${userMessage.substring(0, 100)}..."\n`);

  const response = await client.chat.complete({
    model: "mistral-small-latest",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    maxTokens: 200,
    temperature: 0.7,
  });

  return response?.choices?.[0]?.message?.content as string || "";
}

async function runIntegrationTest() {
  console.log("═".repeat(60));
  console.log("🧪 TESTE DE INTEGRAÇÃO: Imagem → Vision → Resposta IA");
  console.log("═".repeat(60));
  
  console.log("\n📷 ETAPA 1: Analisando imagem com Mistral Vision...\n");
  console.log(`URL: ${testImageUrl.substring(0, 60)}...\n`);
  
  try {
    // Etapa 1: Analisar imagem
    const imageDescription = await analyzeImage(testImageUrl);
    console.log("✅ Descrição da imagem:");
    console.log("─".repeat(50));
    console.log(imageDescription);
    console.log("─".repeat(50));
    
    // Etapa 2: Gerar resposta da IA
    console.log("\n🤖 ETAPA 2: Gerando resposta da IA...\n");
    const aiResponse = await generateAIResponse(imageDescription);
    
    console.log("✅ Resposta da IA para o cliente:");
    console.log("─".repeat(50));
    console.log(aiResponse);
    console.log("─".repeat(50));
    
    // Verificar se a IA entendeu a imagem
    const responseCheck = aiResponse.toLowerCase();
    const understandsImage = 
      responseCheck.includes("comprovante") ||
      responseCheck.includes("pagamento") ||
      responseCheck.includes("r$") ||
      responseCheck.includes("pix") ||
      responseCheck.includes("transferência") ||
      responseCheck.includes("recebemos") ||
      responseCheck.includes("obrigado");
    
    console.log("\n" + "═".repeat(60));
    if (understandsImage) {
      console.log("✅ SUCESSO! A IA entendeu e respondeu baseada na imagem!");
    } else {
      console.log("⚠️ A IA respondeu mas pode não ter usado a informação da imagem");
    }
    console.log("═".repeat(60));
    
  } catch (error: any) {
    console.error("❌ ERRO:", error.message);
  }
}

// Executar
runIntegrationTest();
