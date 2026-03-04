/**
 * 🖼️ Test script para Mistral Vision API
 * Testa se a API de visão está funcionando corretamente
 * 
 * Executar com: npx tsx test-vision.ts
 */

import { Mistral } from "@mistralai/mistralai";
import dotenv from "dotenv";

// Carregar variáveis de ambiente
dotenv.config();

const apiKey = process.env.MISTRAL_API_KEY;

if (!apiKey) {
  console.error("❌ MISTRAL_API_KEY não configurada!");
  process.exit(1);
}

const client = new Mistral({ apiKey });

// URL de imagem de teste do próprio Supabase (uma das imagens recentes)
const testImageUrl = "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/whatsapp-media/1768104134983_imagem.jpeg";

async function testVision() {
  console.log("🖼️ Testando Mistral Vision API...\n");
  
  // Testar com modelo pixtral-12b-2409
  const model = "pixtral-12b-2409";
  
  try {
    console.log(`📡 Modelo: ${model}`);
    console.log(`🔗 URL: ${testImageUrl}\n`);
    
    const response = await client.chat.complete({
      model,
      messages: [
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Descreva esta imagem em português de forma clara e objetiva. Se for um comprovante de pagamento, extraia as informações relevantes (valor, data, beneficiário). Se for outro tipo de imagem, descreva o que você vê."
            },
            { 
              type: "image_url", 
              imageUrl: testImageUrl 
            }
          ]
        }
      ],
      maxTokens: 500,
      temperature: 0.1,
    });

    const content = response?.choices?.[0]?.message?.content;
    
    if (content) {
      console.log("✅ SUCESSO! Resposta da API:\n");
      console.log("─".repeat(50));
      console.log(content);
      console.log("─".repeat(50));
    } else {
      console.log("⚠️ Resposta vazia da API");
    }
    
  } catch (error: any) {
    console.error("❌ ERRO:", error.message);
    if (error.body) {
      console.error("Detalhes:", error.body);
    }
  }
}

// Testar também com uma imagem em base64 (simular um caso real)
async function testVisionBase64() {
  console.log("\n\n🖼️ Testando com outro modelo (mistral-small-latest com vision)...\n");
  
  // Vamos testar os modelos disponíveis com vision
  const models = [
    "pixtral-12b-2409",
    "mistral-small-latest",
    "pixtral-large-latest",
  ];
  
  for (const model of models) {
    console.log(`\n📡 Testando modelo: ${model}`);
    
    try {
      const response = await client.chat.complete({
        model,
        messages: [
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: "O que você vê nesta imagem? Responda em português."
              },
              { 
                type: "image_url", 
                imageUrl: testImageUrl 
              }
            ]
          }
        ],
        maxTokens: 200,
      });

      const content = response?.choices?.[0]?.message?.content;
      console.log(`✅ ${model}: ${content?.substring(0, 100)}...`);
      
    } catch (error: any) {
      console.log(`❌ ${model}: ${error.message}`);
    }
  }
}

// Executar testes
(async () => {
  await testVision();
  await testVisionBase64();
  console.log("\n✅ Testes concluídos!");
})();
