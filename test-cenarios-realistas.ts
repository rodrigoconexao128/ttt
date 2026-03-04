/**
 * TESTE REALISTA: Cenário de cliente real com 5-10 mídias
 * 
 * Simula um cliente REAL que configurou algumas mídias com
 * diferentes estilos de escrita no "quando usar"
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

// ===== CLIENTE 1: RESTAURANTE =====
const RESTAURANTE_MIDIAS = [
  { name: 'BOAS_VINDAS', when_to_use: 'primeira mensagem, oi, olá, bom dia, boa tarde, boa noite' },
  { name: 'CARDAPIO', when_to_use: 'quando pedir cardápio ou menu ou quiser ver o que tem' },
  { name: 'PRATO_DIA', when_to_use: 'prato do dia ou sugestão do chef' },
  { name: 'DELIVERY_INFO', when_to_use: 'entrega, delivery, quanto tempo demora, área de entrega' },
  { name: 'HORARIO', when_to_use: 'horário de funcionamento, que horas abre ou fecha' },
  { name: 'LOCALIZACAO', when_to_use: 'onde fica, endereço, localização' },
];

const RESTAURANTE_TESTES = [
  { msg: 'Oi', esperada: 'BOAS_VINDAS' },
  { msg: 'Bom dia!', esperada: 'BOAS_VINDAS' },
  { msg: 'Tem cardápio?', esperada: 'CARDAPIO' },
  { msg: 'O que vocês têm?', esperada: 'CARDAPIO' },
  { msg: 'Qual o prato do dia?', esperada: 'PRATO_DIA' },
  { msg: 'Tem sugestão?', esperada: 'PRATO_DIA' },
  { msg: 'Vocês entregam?', esperada: 'DELIVERY_INFO' },
  { msg: 'Quanto tempo pra chegar?', esperada: 'DELIVERY_INFO' },
  { msg: 'Que horas vocês abrem?', esperada: 'HORARIO' },
  { msg: 'Onde vocês ficam?', esperada: 'LOCALIZACAO' },
  { msg: 'Qual o endereço?', esperada: 'LOCALIZACAO' },
];

// ===== CLIENTE 2: CLÍNICA ESTÉTICA =====
const CLINICA_MIDIAS = [
  { name: 'APRESENTACAO', when_to_use: 'quando mandarem a primeira mensagem' },
  { name: 'ANTES_DEPOIS', when_to_use: 'resultados, antes e depois, fotos de resultado' },
  { name: 'PRECOS', when_to_use: 'preço, valor, quanto custa, investimento' },
  { name: 'PROCEDIMENTOS', when_to_use: 'quais procedimentos, o que vocês fazem, serviços' },
  { name: 'AGENDAMENTO', when_to_use: 'agendar, marcar, horário disponível, avaliação' },
];

const CLINICA_TESTES = [
  { msg: 'Olá!', esperada: 'APRESENTACAO' },
  { msg: 'Quero ver resultados', esperada: 'ANTES_DEPOIS' },
  { msg: 'Tem antes e depois?', esperada: 'ANTES_DEPOIS' },
  { msg: 'Quanto custa?', esperada: 'PRECOS' },
  { msg: 'Qual o valor?', esperada: 'PRECOS' },
  { msg: 'O que vocês fazem?', esperada: 'PROCEDIMENTOS' },
  { msg: 'Quais procedimentos?', esperada: 'PROCEDIMENTOS' },
  { msg: 'Quero agendar', esperada: 'AGENDAMENTO' },
  { msg: 'Tem horário amanhã?', esperada: 'AGENDAMENTO' },
];

// ===== CLIENTE 3: IMOBILIÁRIA =====
const IMOBILIARIA_MIDIAS = [
  { name: 'AUDIO_INICIO', when_to_use: 'oi, olá, bom dia, primeira mensagem' },
  { name: 'VIDEO_APARTAMENTO', when_to_use: 'fotos do apartamento, ver o imóvel, tour virtual' },
  { name: 'DOCUMENTACAO', when_to_use: 'documentos necessários, documentação, papelada' },
  { name: 'VALORES', when_to_use: 'preço, valor do imóvel, aluguel, mensalidade' },
  { name: 'VISITA', when_to_use: 'visitar, agendar visita, ver pessoalmente' },
];

const IMOBILIARIA_TESTES = [
  { msg: 'Boa tarde', esperada: 'AUDIO_INICIO' },
  { msg: 'Quero ver fotos do apto', esperada: 'VIDEO_APARTAMENTO' },
  { msg: 'Tem tour virtual?', esperada: 'VIDEO_APARTAMENTO' },
  { msg: 'Qual documentação preciso?', esperada: 'DOCUMENTACAO' },
  { msg: 'Qual o valor do aluguel?', esperada: 'VALORES' },
  { msg: 'Posso agendar uma visita?', esperada: 'VISITA' },
];

// ===== CLIENTE 4: E-COMMERCE =====
const ECOMMERCE_MIDIAS = [
  { name: 'OLA', when_to_use: 'saudação inicial, oi, olá' },
  { name: 'CATALOGO', when_to_use: 'produtos, catálogo, o que vocês vendem' },
  { name: 'PRECO', when_to_use: 'preço, valor, quanto' },
  { name: 'ENTREGA', when_to_use: 'frete, entrega, prazo, quando chega' },
  { name: 'TROCA', when_to_use: 'troca, devolução, garantia, não gostei' },
  { name: 'PAGAMENTO', when_to_use: 'pagar, pix, cartão, parcelar, forma de pagamento' },
];

const ECOMMERCE_TESTES = [
  { msg: 'Oi!', esperada: 'OLA' },
  { msg: 'O que vocês vendem?', esperada: 'CATALOGO' },
  { msg: 'Quero ver os produtos', esperada: 'CATALOGO' },
  { msg: 'Quanto custa?', esperada: 'PRECO' },
  { msg: 'Qual o frete?', esperada: 'ENTREGA' },
  { msg: 'Quando chega?', esperada: 'ENTREGA' },
  { msg: 'Posso trocar se não gostar?', esperada: 'TROCA' },
  { msg: 'Aceita pix?', esperada: 'PAGAMENTO' },
  { msg: 'Parcela em quantas vezes?', esperada: 'PAGAMENTO' },
];

// ===== CLIENTE 5: AGENTEZAP (CENÁRIO REAL) =====
const AGENTEZAP_MIDIAS = [
  { name: 'AUDIO_INICIO', when_to_use: 'Sempre a primeira mensagem que enviamos. Quando o cliente manda oi, olá, bom dia, etc' },
  { name: 'COMO_FUNCIONA', when_to_use: 'Quando o cliente responder que trabalha com vendas, atendimento, qualificação ou algo relacionado' },
];

const AGENTEZAP_TESTES = [
  { msg: 'Oi', esperada: 'AUDIO_INICIO' },
  { msg: 'Olá, boa tarde', esperada: 'AUDIO_INICIO' },
  { msg: 'Bom dia!', esperada: 'AUDIO_INICIO' },
  { msg: 'Trabalho com vendas', esperada: 'COMO_FUNCIONA' },
  { msg: 'Faço atendimento ao cliente', esperada: 'COMO_FUNCIONA' },
  { msg: 'Preciso qualificar leads', esperada: 'COMO_FUNCIONA' },
];

function criarMidias(lista: { name: string; when_to_use: string }[]) {
  return lista.map((m, i) => ({
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
}

async function chamarIA(blocoMidia: string, mensagem: string): Promise<string> {
  const config = await db.select().from(systemConfig).where(eq(systemConfig.chave, 'mistral_api_key')).limit(1);
  const apiKey = config[0]?.valor;
  if (!apiKey) throw new Error('API key não encontrada');
  
  const prompt = `Você é um atendente virtual. Responda brevemente.\n\n${blocoMidia}`;
  
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: mensagem },
      ],
      max_tokens: 200,
      temperature: 0.5,
    }),
  });
  
  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

async function testarCliente(
  nome: string,
  midias: ReturnType<typeof criarMidias>,
  testes: { msg: string; esperada: string }[]
) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🏪 CLIENTE: ${nome}`);
  console.log(`📁 Mídias: ${midias.length}`);
  console.log(`${'═'.repeat(60)}`);
  
  const blocoMidia = generateMediaPromptBlock(midias as any);
  let passou = 0;
  let falhou = 0;
  
  for (const t of testes) {
    const resposta = await chamarIA(blocoMidia, t.msg);
    const tags = extractMediaTagsFromResponse(resposta);
    const acertou = tags.includes(t.esperada);
    
    if (acertou) {
      passou++;
      console.log(`  ✅ "${t.msg}" → ${t.esperada}`);
    } else {
      falhou++;
      console.log(`  ❌ "${t.msg}" → esperava ${t.esperada}, recebeu ${tags[0] || 'nada'}`);
    }
    
    await new Promise(r => setTimeout(r, 300));
  }
  
  const taxa = (passou / testes.length) * 100;
  console.log(`  📊 Resultado: ${passou}/${testes.length} (${taxa.toFixed(0)}%)`);
  
  return { passou, falhou, total: testes.length };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   TESTE REALISTA: Cenários de clientes reais                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  
  const resultados = [];
  
  // Testar cada cliente
  resultados.push(await testarCliente('RESTAURANTE', criarMidias(RESTAURANTE_MIDIAS), RESTAURANTE_TESTES));
  resultados.push(await testarCliente('CLÍNICA ESTÉTICA', criarMidias(CLINICA_MIDIAS), CLINICA_TESTES));
  resultados.push(await testarCliente('IMOBILIÁRIA', criarMidias(IMOBILIARIA_MIDIAS), IMOBILIARIA_TESTES));
  resultados.push(await testarCliente('E-COMMERCE', criarMidias(ECOMMERCE_MIDIAS), ECOMMERCE_TESTES));
  resultados.push(await testarCliente('AGENTEZAP', criarMidias(AGENTEZAP_MIDIAS), AGENTEZAP_TESTES));
  
  // Resumo geral
  const totalPassou = resultados.reduce((a, b) => a + b.passou, 0);
  const totalFalhou = resultados.reduce((a, b) => a + b.falhou, 0);
  const totalTestes = resultados.reduce((a, b) => a + b.total, 0);
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log('                    RESUMO GERAL');
  console.log(`${'═'.repeat(60)}`);
  console.log(`   🏪 Clientes testados: 5`);
  console.log(`   📁 Total de cenários: ${totalTestes}`);
  console.log(`   ✅ Passou: ${totalPassou}`);
  console.log(`   ❌ Falhou: ${totalFalhou}`);
  console.log(`   📊 Taxa de sucesso: ${((totalPassou / totalTestes) * 100).toFixed(1)}%`);
  console.log(`${'═'.repeat(60)}`);
  
  if (totalPassou / totalTestes >= 0.85) {
    console.log('\n🎉 SISTEMA APROVADO! O sistema funciona para diferentes tipos de cliente!');
  } else if (totalPassou / totalTestes >= 0.70) {
    console.log('\n✅ SISTEMA BOM! Taxa aceitável, pode melhorar com "quando usar" mais claros.');
  } else {
    console.log('\n⚠️ PRECISA MELHORAR! Revisar descrições de "quando usar" das mídias.');
  }
  
  process.exit(0);
}

main().catch(console.error);
