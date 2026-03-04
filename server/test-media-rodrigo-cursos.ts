/**
 * Teste de mídias - Cursos Unopar (Rodrigo)
 * Verifica se o sistema escolhe a mídia correta por curso, valores e PagFácil
 */

import 'dotenv/config';
import { generateAIResponse } from "./aiAgent";
import { getAgentMediaLibrary } from "./mediaService";

const USER_ID = "84170f76-0076-4878-a31d-28b58dfb2365";

type HistoryMsg = { id: string; conversationId: string; messageId: string; fromMe: boolean; text: string; timestamp: Date; status: 'delivered'; isFromAgent: boolean };

const baseHistory: HistoryMsg[] = [];

function makeMsg(text: string, fromMe = false, idx = 0): HistoryMsg {
  return {
    id: `msg-${idx}`,
    conversationId: "test-rodrigo",
    messageId: `test-${idx}`,
    fromMe,
    text,
    timestamp: new Date(),
    status: 'delivered',
    isFromAgent: false,
  };
}

async function runCase(label: string, message: string, sentMedias: string[] = [], history: HistoryMsg[] = []) {
  const result = await generateAIResponse(
    USER_ID,
    history,
    message,
    { sentMedias }
  );

  const mediaActions = result?.mediaActions || [];
  const mediaNames = mediaActions.map(a => a.media_name);

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🧪 ${label}`);
  console.log(`👤 Cliente: ${message}`);
  console.log(`📎 Mídias escolhidas: ${mediaNames.length > 0 ? mediaNames.join(', ') : 'NENHUMA'}`);

  return { mediaNames, resultText: result?.bubbles?.map(b => b.text).join(' ') || '' };
}

async function main() {
  console.log("\n🔎 Teste de Mídias - Rodrigo (Cursos)\n");

  const mediaLibrary = await getAgentMediaLibrary(USER_ID);
  console.log(`📦 Mídias ativas: ${mediaLibrary.length}`);

  // Caso 1: Pergunta sobre curso (Administração)
  const c1 = await runCase(
    "Curso Administração",
    "Quero saber sobre o curso de Administração",
    [],
    baseHistory
  );

  // Caso 2: Pergunta por valores do curso (seguindo o caso 1)
  const c2 = await runCase(
    "Valores Administração",
    "E os valores do curso de Administração?",
    c1.mediaNames,
    [makeMsg("Quero saber sobre o curso de Administração", false, 1)]
  );

  // Caso 3: Pergunta PagFácil
  const c3 = await runCase(
    "PagFácil",
    "O que é o PagFácil?",
    [],
    baseHistory
  );

  // Caso 4: Curso sem explicação (Ciências de Dados)
  const c4 = await runCase(
    "Curso sem explicação",
    "Tem curso de Ciências de Dados?",
    [],
    baseHistory
  );

  // Caso 5: Curso inexistente (Medicina)
  const c5 = await runCase(
    "Curso inexistente",
    "Quero fazer Medicina",
    [],
    baseHistory
  );

  // Resumo esperado
  console.log(`\n✅ RESUMO ESPERADO (MÍDIAS):`);
  console.log(`- Administração: IMAGEM_CURSO_ADMINISTRACAO + VALORES_CURSO_ADMINISTRACAO`);
  console.log(`- PagFácil: VIDEO_PAGFACIL`);
  console.log(`- Ciências de Dados: SEM MÍDIA (curso sem explicação)`);
  console.log(`- Medicina: SEM MÍDIA (curso inexistente)`);

  console.log(`\n📊 RESULTADO (detectado):`);
  console.log(`- Administração (1): ${c1.mediaNames.join(', ') || 'NENHUMA'}`);
  console.log(`- Administração (valores): ${c2.mediaNames.join(', ') || 'NENHUMA'}`);
  console.log(`- PagFácil: ${c3.mediaNames.join(', ') || 'NENHUMA'}`);
  console.log(`- Ciências de Dados: ${c4.mediaNames.join(', ') || 'NENHUMA'}`);
  console.log(`- Medicina: ${c5.mediaNames.join(', ') || 'NENHUMA'}`);

  // Aviso sobre áudio
  const hasAudio = mediaLibrary.some(m => m.mediaType === 'audio');
  if (!hasAudio) {
    console.log(`\n⚠️ Não há mídias de ÁUDIO cadastradas para este usuário.`);
    console.log(`   Se quiser envio de explicação em áudio, envie os arquivos (.mp3/.wav) por curso.`);
  }
}

main().catch(console.error);
