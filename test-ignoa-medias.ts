/**
 * 🧪 TESTE DE MÍDIAS DO AGENTE IGNOA
 * 
 * Testa se o agente envia as imagens dos cursos corretamente
 */

import dotenv from "dotenv";
dotenv.config();

import { testAgentResponse } from "./server/aiAgent";
import { getAgentMediaLibrary } from "./server/mediaService";

const IGNOA_USER_ID = "9833fb4b-c51a-44ee-8618-8ddd6a999bb3";

interface Message {
  id: string;
  chatId: string;
  text: string;
  fromMe: boolean;
  timestamp: Date;
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testComMedia(titulo: string, mensagens: string[]) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`🖼️  ${titulo}`);
  console.log(`${"═".repeat(70)}`);

  const conversationHistory: Message[] = [];
  
  for (let i = 0; i < mensagens.length; i++) {
    const mensagem = mensagens[i];
    console.log(`\n👤 Cliente: ${mensagem}`);
    
    const result = await testAgentResponse(
      IGNOA_USER_ID,
      mensagem,
      undefined,
      conversationHistory,
      []
    );
    
    console.log(`🤖 Rita: ${result.text}`);
    
    // Verificar se há mídias
    if (result.mediaActions && result.mediaActions.length > 0) {
      console.log(`\n📸 MÍDIA DETECTADA!`);
      for (const media of result.mediaActions) {
        console.log(`   ✅ ${media.media_name} (${media.type})`);
        if (media.caption) console.log(`   📝 Caption: ${media.caption}`);
      }
    } else {
      // Verificar se tem tag [MEDIA:] na resposta
      const mediaMatch = result.text?.match(/\[MEDIA:([^\]]+)\]/g);
      if (mediaMatch) {
        console.log(`\n📸 TAG DE MÍDIA NA RESPOSTA: ${mediaMatch.join(', ')}`);
      }
    }
    
    conversationHistory.push({
      id: `c_${i}`,
      chatId: "test",
      text: mensagem,
      fromMe: false,
      timestamp: new Date()
    });
    
    conversationHistory.push({
      id: `r_${i}`,
      chatId: "test",
      text: result.text || "",
      fromMe: true,
      timestamp: new Date()
    });
    
    await delay(800);
  }
  
  console.log(`\n${"─".repeat(70)}\n`);
}

async function main() {
  console.log("\n" + "🖼️ ".repeat(20));
  console.log("🖼️  TESTE DE MÍDIAS - AGENTE IGNOA/FACOP");
  console.log("🖼️ ".repeat(20) + "\n");

  // Verificar mídias cadastradas
  console.log("📋 Verificando mídias cadastradas...\n");
  const medias = await getAgentMediaLibrary(IGNOA_USER_ID);
  
  if (medias.length === 0) {
    console.log("❌ Nenhuma mídia encontrada!");
    process.exit(1);
  }
  
  console.log(`✅ ${medias.length} mídias encontradas:`);
  for (const m of medias) {
    console.log(`   • ${m.name}: ${m.description?.substring(0, 50)}...`);
  }

  // Teste 1: Perguntar sobre Ortodontia (deve enviar IMG_ORTODONTIA)
  await testComMedia(
    "TESTE 1: ORTODONTIA - Deve enviar imagem",
    [
      "Oi bom dia",
      "Quero saber sobre ortodontia"
    ]
  );

  // Teste 2: Perguntar sobre Endodontia (deve enviar IMG_ENDODONTIA)
  await testComMedia(
    "TESTE 2: ENDODONTIA - Deve enviar imagem",
    [
      "Olá",
      "Curso de pós",
      "Endodontia"
    ]
  );

  // Teste 3: Perguntar sobre Implantodontia
  await testComMedia(
    "TESTE 3: IMPLANTODONTIA - Deve enviar imagem",
    [
      "Oi",
      "Quero saber sobre implantes"
    ]
  );

  // Teste 4: Perguntar sobre HOF
  await testComMedia(
    "TESTE 4: HARMONIZAÇÃO OROFACIAL - Deve enviar imagem",
    [
      "Boa tarde",
      "Vocês têm curso de harmonização facial?"
    ]
  );

  // Teste 5: Perguntar sobre Bichectomia
  await testComMedia(
    "TESTE 5: BICHECTOMIA - Deve enviar imagem",
    [
      "Olá",
      "Tem curso de bichectomia?"
    ]
  );

  // Teste 6: Perguntar sobre vários cursos
  await testComMedia(
    "TESTE 6: LISTA DE CURSOS",
    [
      "Oi",
      "Quais cursos vocês têm?",
      "Me fala mais sobre o de HOF"
    ]
  );

  console.log("\n" + "✅".repeat(35));
  console.log("✅ TESTE DE MÍDIAS FINALIZADO!");
  console.log("✅".repeat(35) + "\n");

  // Resumo
  console.log("📊 RESUMO DAS MÍDIAS CADASTRADAS:");
  console.log("─".repeat(50));
  console.log("✅ IMG_ORTODONTIA - Ortodontia (36 meses)");
  console.log("✅ IMG_ENDODONTIA - Endodontia (24 meses)");
  console.log("✅ IMG_IMPLANTODONTIA - Implantodontia (24 meses)");
  console.log("✅ IMG_HOF - Harmonização Orofacial (24 meses)");
  console.log("✅ IMG_BICHECTOMIA - Bichectomia (Abril/2026)");
  console.log("─".repeat(50));
}

main().catch(console.error);
