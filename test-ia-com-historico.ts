/**
 * TESTE FINAL: IA com histórico de conversa
 * 
 * Simula uma conversa REAL onde já houve interação anterior.
 * Isso garante que a IA sabe diferenciar:
 * - Primeira mensagem → Áudio de boas-vindas
 * - Segunda mensagem (cliente diz o que faz) → Áudio explicativo
 */

import { db } from './server/db';
import { systemConfig } from './shared/schema';
import { eq } from 'drizzle-orm';
import { generateMediaPromptBlock } from './server/mediaService';

function extractMediaTagsFromResponse(response: string): string[] {
  const regex = /\[MEDIA:([A-Z0-9_]+)\]/g;
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(response)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

// Mídias simuladas
const MIDIAS = [
  { name: 'AUDIO_BOAS_VINDAS', when_to_use: 'Sempre na primeira mensagem do cliente, quando ele diz oi, olá, bom dia' },
  { name: 'COMO_FUNCIONA', when_to_use: 'Quando o cliente responder que trabalha com vendas, atendimento, qualificação' },
  { name: 'TABELA_PRECOS', when_to_use: 'Quando perguntarem sobre preço ou valor' },
  { name: 'VIDEO_DEMO', when_to_use: 'Quando pedirem demonstração ou demo' },
].map((m, i) => ({
  id: `test-${i}`,
  user_id: 'test-user',
  name: m.name,
  media_type: 'audio' as const,
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

const blocoMidia = generateMediaPromptBlock(MIDIAS as any);

const PROMPT = `
Você é um atendente virtual simpático e profissional.
Responda de forma breve e natural.
`;

// Conversas com histórico
interface Conversa {
  descricao: string;
  historico: { role: 'user' | 'assistant'; content: string }[];
  novaMensagem: string;
  midiaEsperada: string;
}

const CONVERSAS: Conversa[] = [
  {
    descricao: 'Primeira mensagem - deve enviar boas-vindas',
    historico: [],
    novaMensagem: 'Oi',
    midiaEsperada: 'AUDIO_BOAS_VINDAS',
  },
  {
    descricao: 'Segunda mensagem - cliente diz que trabalha com vendas',
    historico: [
      { role: 'user', content: 'Oi' },
      { role: 'assistant', content: 'Olá! Tudo bem? Em que posso ajudar? [MEDIA:AUDIO_BOAS_VINDAS]' },
    ],
    novaMensagem: 'Trabalho com vendas',
    midiaEsperada: 'COMO_FUNCIONA',
  },
  {
    descricao: 'Segunda mensagem - cliente diz que faz atendimento',
    historico: [
      { role: 'user', content: 'Bom dia!' },
      { role: 'assistant', content: 'Bom dia! Com o que você trabalha? [MEDIA:AUDIO_BOAS_VINDAS]' },
    ],
    novaMensagem: 'Faço atendimento ao cliente',
    midiaEsperada: 'COMO_FUNCIONA',
  },
  {
    descricao: 'Terceira mensagem - cliente pergunta preço',
    historico: [
      { role: 'user', content: 'Oi' },
      { role: 'assistant', content: 'Olá! Com o que você trabalha? [MEDIA:AUDIO_BOAS_VINDAS]' },
      { role: 'user', content: 'Vendas online' },
      { role: 'assistant', content: 'Legal! A gente pode ajudar muito. [MEDIA:COMO_FUNCIONA]' },
    ],
    novaMensagem: 'Quanto custa?',
    midiaEsperada: 'TABELA_PRECOS',
  },
  {
    descricao: 'Cliente pede demonstração',
    historico: [
      { role: 'user', content: 'Olá' },
      { role: 'assistant', content: 'Oi! Como posso ajudar? [MEDIA:AUDIO_BOAS_VINDAS]' },
    ],
    novaMensagem: 'Quero ver uma demo',
    midiaEsperada: 'VIDEO_DEMO',
  },
  {
    descricao: 'Cliente trabalha com qualificação de leads',
    historico: [
      { role: 'user', content: 'Boa tarde' },
      { role: 'assistant', content: 'Boa tarde! O que você faz? [MEDIA:AUDIO_BOAS_VINDAS]' },
    ],
    novaMensagem: 'Preciso qualificar leads',
    midiaEsperada: 'COMO_FUNCIONA',
  },
];

async function chamarIA(historico: { role: 'user' | 'assistant'; content: string }[], novaMensagem: string): Promise<string> {
  const config = await db.select().from(systemConfig).where(eq(systemConfig.chave, 'mistral_api_key')).limit(1);
  const apiKey = config[0]?.valor;
  
  if (!apiKey) throw new Error('API key não encontrada');
  
  const messages = [
    { role: 'system' as const, content: `${PROMPT}\n\n${blocoMidia}` },
    ...historico,
    { role: 'user' as const, content: novaMensagem },
  ];
  
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages,
      max_tokens: 300,
      temperature: 0.7,
    }),
  });
  
  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   TESTE FINAL: IA com histórico de conversa                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  
  let passou = 0;
  let falhou = 0;
  
  for (const conv of CONVERSAS) {
    console.log(`┌─ ${conv.descricao}`);
    if (conv.historico.length > 0) {
      console.log(`│  Histórico: ${conv.historico.length} mensagens`);
    }
    console.log(`│  Nova mensagem: "${conv.novaMensagem}"`);
    
    try {
      const resposta = await chamarIA(conv.historico, conv.novaMensagem);
      const midias = extractMediaTagsFromResponse(resposta);
      
      if (midias.includes(conv.midiaEsperada)) {
        passou++;
        console.log(`│  ✅ PASSOU - Mídia: ${conv.midiaEsperada}`);
      } else {
        falhou++;
        console.log(`│  ❌ FALHOU`);
        console.log(`│     Esperada: ${conv.midiaEsperada}`);
        console.log(`│     Recebida: ${midias.join(', ') || 'nenhuma'}`);
        console.log(`│     Resposta: ${resposta.substring(0, 100)}...`);
      }
    } catch (error) {
      falhou++;
      console.log(`│  ❌ ERRO: ${error}`);
    }
    
    console.log('└─────────────────────────────────────────────────────\n');
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('                         RESUMO FINAL');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`   ✅ Passou: ${passou}/${CONVERSAS.length}`);
  console.log(`   ❌ Falhou: ${falhou}/${CONVERSAS.length}`);
  console.log(`   📊 Taxa de sucesso: ${((passou / CONVERSAS.length) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════════════════════════════════');
  
  if (falhou === 0) {
    console.log('\n🎉 PERFEITO! A IA entende o contexto e envia a mídia certa!');
  }
  
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(console.error);
