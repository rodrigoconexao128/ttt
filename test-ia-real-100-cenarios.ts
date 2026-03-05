/**
 * TESTE COM IA REAL: Verificar se a IA entende QUALQUER "quando usar"
 * 
 * Este teste usa a IA Mistral REAL para verificar se ela consegue
 * interpretar corretamente o campo "quando usar" de cada mídia.
 */

import { db } from './server/db';
import { users, aiAgentConfig, agentMediaLibrary, systemConfig } from './shared/schema';
import { eq } from 'drizzle-orm';
import { generateMediaPromptBlock } from './server/mediaService';

// Função para extrair tags de mídia da resposta
function extractMediaTagsFromResponse(response: string): string[] {
  const regex = /\[MEDIA:([A-Z0-9_]+)\]/g;
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(response)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

// Cenários de teste com mídias diversas
interface MidiaSimulada {
  name: string;
  media_type: 'audio' | 'image' | 'video' | 'document';
  when_to_use: string;
}

const MIDIAS_TESTE: MidiaSimulada[] = [
  // Saudações
  { name: 'AUDIO_BOAS_VINDAS', media_type: 'audio', when_to_use: 'Sempre na primeira mensagem do cliente, quando ele diz oi, olá, bom dia, boa tarde, boa noite' },
  { name: 'COMO_FUNCIONA', media_type: 'audio', when_to_use: 'Quando o cliente disser que trabalha com vendas, atendimento, qualificação ou algo relacionado a negócios' },
  { name: 'TABELA_PRECOS', media_type: 'image', when_to_use: 'Quando perguntarem sobre preço, valor, quanto custa, investimento' },
  { name: 'CATALOGO', media_type: 'document', when_to_use: 'Quando quiser ver produtos, catálogo, cardápio, menu' },
  { name: 'MAPA_LOCALIZACAO', media_type: 'image', when_to_use: 'Quando perguntarem onde fica, endereço, localização, como chegar' },
  { name: 'VIDEO_DEMONSTRACAO', media_type: 'video', when_to_use: 'Quando pedirem demonstração, demo, ver funcionando' },
  { name: 'DEPOIMENTOS', media_type: 'video', when_to_use: 'Quando perguntarem sobre resultados, depoimentos, cases' },
  { name: 'FORMAS_PAGAMENTO', media_type: 'image', when_to_use: 'Quando perguntarem como pagar, aceita pix, aceita cartão, parcelamento' },
  { name: 'HORARIO_FUNCIONAMENTO', media_type: 'image', when_to_use: 'Quando perguntarem horário, que horas abre, quando atende' },
  { name: 'GARANTIA', media_type: 'audio', when_to_use: 'Quando perguntarem sobre garantia, devolução, troca' },
];

// Cenários de mensagens para testar
const CENARIOS = [
  { mensagem: 'Oi', midiaEsperada: 'AUDIO_BOAS_VINDAS', descricao: 'Saudação oi' },
  { mensagem: 'Olá, tudo bem?', midiaEsperada: 'AUDIO_BOAS_VINDAS', descricao: 'Saudação olá' },
  { mensagem: 'Bom dia!', midiaEsperada: 'AUDIO_BOAS_VINDAS', descricao: 'Bom dia' },
  { mensagem: 'Trabalho com vendas', midiaEsperada: 'COMO_FUNCIONA', descricao: 'Trabalha com vendas' },
  { mensagem: 'Faço atendimento ao cliente', midiaEsperada: 'COMO_FUNCIONA', descricao: 'Faz atendimento' },
  { mensagem: 'Preciso qualificar leads', midiaEsperada: 'COMO_FUNCIONA', descricao: 'Qualifica leads' },
  { mensagem: 'Qual o preço?', midiaEsperada: 'TABELA_PRECOS', descricao: 'Pergunta preço' },
  { mensagem: 'Quanto custa?', midiaEsperada: 'TABELA_PRECOS', descricao: 'Quanto custa' },
  { mensagem: 'Qual o valor?', midiaEsperada: 'TABELA_PRECOS', descricao: 'Qual valor' },
  { mensagem: 'Quero ver os produtos', midiaEsperada: 'CATALOGO', descricao: 'Ver produtos' },
  { mensagem: 'Tem catálogo?', midiaEsperada: 'CATALOGO', descricao: 'Catálogo' },
  { mensagem: 'Me manda o cardápio', midiaEsperada: 'CATALOGO', descricao: 'Cardápio' },
  { mensagem: 'Onde vocês ficam?', midiaEsperada: 'MAPA_LOCALIZACAO', descricao: 'Onde fica' },
  { mensagem: 'Qual o endereço?', midiaEsperada: 'MAPA_LOCALIZACAO', descricao: 'Endereço' },
  { mensagem: 'Como faço pra chegar?', midiaEsperada: 'MAPA_LOCALIZACAO', descricao: 'Como chegar' },
  { mensagem: 'Quero ver uma demonstração', midiaEsperada: 'VIDEO_DEMONSTRACAO', descricao: 'Demonstração' },
  { mensagem: 'Tem demo?', midiaEsperada: 'VIDEO_DEMONSTRACAO', descricao: 'Demo' },
  { mensagem: 'Posso ver funcionando?', midiaEsperada: 'VIDEO_DEMONSTRACAO', descricao: 'Ver funcionando' },
  { mensagem: 'Tem depoimentos de clientes?', midiaEsperada: 'DEPOIMENTOS', descricao: 'Depoimentos' },
  { mensagem: 'Quero ver resultados', midiaEsperada: 'DEPOIMENTOS', descricao: 'Resultados' },
  { mensagem: 'Aceita pix?', midiaEsperada: 'FORMAS_PAGAMENTO', descricao: 'Aceita pix' },
  { mensagem: 'Como faço pra pagar?', midiaEsperada: 'FORMAS_PAGAMENTO', descricao: 'Como pagar' },
  { mensagem: 'Posso parcelar?', midiaEsperada: 'FORMAS_PAGAMENTO', descricao: 'Parcelar' },
  { mensagem: 'Que horas abre?', midiaEsperada: 'HORARIO_FUNCIONAMENTO', descricao: 'Que horas' },
  { mensagem: 'Qual o horário de atendimento?', midiaEsperada: 'HORARIO_FUNCIONAMENTO', descricao: 'Horário' },
  { mensagem: 'Tem garantia?', midiaEsperada: 'GARANTIA', descricao: 'Garantia' },
  { mensagem: 'Posso devolver se não gostar?', midiaEsperada: 'GARANTIA', descricao: 'Devolução' },
];

async function chamarIAReal(prompt: string, mensagem: string, blocoMidia: string): Promise<string> {
  // Buscar API key do banco
  const config = await db.select().from(systemConfig).where(eq(systemConfig.chave, 'mistral_api_key')).limit(1);
  const apiKey = config[0]?.valor;
  
  if (!apiKey) {
    throw new Error('API key não encontrada');
  }
  
  const promptCompleto = `${prompt}\n\n${blocoMidia}`;
  
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: promptCompleto },
        { role: 'user', content: mensagem },
      ],
      max_tokens: 300,
      temperature: 0.7,
    }),
  });
  
  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   TESTE COM IA REAL: Qualquer "quando usar" funciona?            ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  
  // Montar mídias simuladas como objetos completos
  const midias = MIDIAS_TESTE.map((m, i) => ({
    id: `test-${i}`,
    user_id: 'test-user',
    name: m.name,
    media_type: m.media_type,
    storage_url: `https://example.com/${m.name}.ogg`,
    file_name: `${m.name}.ogg`,
    file_size: 1000,
    mime_type: 'audio/ogg',
    duration_seconds: 30,
    description: m.name,
    when_to_use: m.when_to_use,
    caption: null,
    transcription: null,
    is_ptt: true,
    send_alone: false,
    is_active: true,
    display_order: i,
    wapi_media_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  }));
  
  // Gerar bloco de mídia
  const blocoMidia = generateMediaPromptBlock(midias as any);
  console.log(`📁 Total de mídias: ${midias.length}`);
  console.log(`📝 Bloco gerado: ${blocoMidia.length} caracteres\n`);
  
  // Prompt simples (sem instruções de mídia!)
  const promptLimpo = `
Você é um atendente virtual simpático e profissional.
Responda de forma breve e natural.
Use frases curtas.
`;
  
  let passou = 0;
  let falhou = 0;
  const falhas: { cenario: typeof CENARIOS[0]; resposta: string }[] = [];
  
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('EXECUTANDO TESTES COM IA REAL (Mistral)');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  for (const cenario of CENARIOS) {
    process.stdout.write(`Testing: ${cenario.descricao}...`);
    
    try {
      const resposta = await chamarIAReal(promptLimpo, cenario.mensagem, blocoMidia);
      const midiasEnviadas = extractMediaTagsFromResponse(resposta);
      
      const temMidiaCorreta = midiasEnviadas.includes(cenario.midiaEsperada);
      
      if (temMidiaCorreta) {
        passou++;
        console.log(` ✅`);
        console.log(`   📩 "${cenario.mensagem}"`);
        console.log(`   📁 Mídia: ${cenario.midiaEsperada}`);
      } else {
        falhou++;
        falhas.push({ cenario, resposta });
        console.log(` ❌`);
        console.log(`   📩 "${cenario.mensagem}"`);
        console.log(`   ❌ Esperada: ${cenario.midiaEsperada}`);
        console.log(`   ❌ Recebida: ${midiasEnviadas.length > 0 ? midiasEnviadas.join(', ') : 'nenhuma'}`);
      }
      console.log('');
      
      // Delay para não sobrecarregar API
      await new Promise(r => setTimeout(r, 500));
      
    } catch (error) {
      falhou++;
      console.log(` ❌ ERRO: ${error}`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                         RESUMO FINAL');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`   📁 Total de mídias: ${midias.length}`);
  console.log(`   🧪 Total de cenários: ${CENARIOS.length}`);
  console.log(`   ✅ Passou: ${passou}`);
  console.log(`   ❌ Falhou: ${falhou}`);
  console.log(`   📊 Taxa de sucesso: ${((passou / CENARIOS.length) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════════════════════════════════');
  
  if (falhas.length > 0 && falhas.length <= 5) {
    console.log('\n⚠️ CENÁRIOS QUE FALHARAM:');
    for (const f of falhas) {
      console.log(`   - "${f.cenario.mensagem}" (esperava ${f.cenario.midiaEsperada})`);
      console.log(`     Resposta: ${f.resposta.substring(0, 100)}...`);
    }
  }
  
  process.exit(0);
}

main().catch(console.error);
