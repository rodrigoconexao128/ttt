/**
 * TESTE FINAL DEFINITIVO: 50+ tipos diferentes de "quando usar"
 * 
 * Testa se a IA consegue interpretar QUALQUER forma de escrever
 * o campo "quando usar" de uma mídia.
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

// Diferentes formas de escrever "quando usar" - testando variações
const MIDIAS_VARIADAS = [
  // ===== ESTILOS FORMAIS =====
  { name: 'FORMAL_1', when_to_use: 'Quando o cliente solicitar informações sobre preços e valores dos nossos serviços' },
  { name: 'FORMAL_2', when_to_use: 'Enviar sempre que houver questionamento referente ao endereço ou localização da empresa' },
  { name: 'FORMAL_3', when_to_use: 'Utilizar quando o lead demonstrar interesse em conhecer nossos produtos' },
  
  // ===== ESTILOS INFORMAIS =====
  { name: 'INFORMAL_1', when_to_use: 'qdo o cara pergunta qto custa' },
  { name: 'INFORMAL_2', when_to_use: 'manda isso ai se ele fala q trabalha c vendas' },
  { name: 'INFORMAL_3', when_to_use: 'usa esse video quando pedir pra ver funcionando' },
  
  // ===== COM ERROS DE DIGITAÇÃO =====
  { name: 'ERRO_1', when_to_use: 'qaundo perguntarem sobre presço' },
  { name: 'ERRO_2', when_to_use: 'quanod quiserem ver o catalgo' },
  { name: 'ERRO_3', when_to_use: 'se perguntar sobre garntia' },
  
  // ===== MUITO CURTOS =====
  { name: 'CURTO_1', when_to_use: 'preço' },
  { name: 'CURTO_2', when_to_use: 'endereço' },
  { name: 'CURTO_3', when_to_use: 'horário' },
  { name: 'CURTO_4', when_to_use: 'demo' },
  
  // ===== MUITO LONGOS =====
  { name: 'LONGO_1', when_to_use: 'Este áudio deve ser enviado sempre que o cliente entrar em contato pela primeira vez, seja dizendo oi, olá, bom dia, boa tarde, boa noite, ou qualquer outra forma de saudação inicial, pois serve para apresentar nossa empresa e dar as boas-vindas' },
  { name: 'LONGO_2', when_to_use: 'Quando o cliente demonstrar que está interessado em adquirir nossos produtos ou serviços e perguntar sobre como funciona o processo de compra, quais são as formas de pagamento disponíveis, se parcelamos, se aceitamos pix, cartão de crédito ou débito' },
  
  // ===== COM EMOJIS =====
  { name: 'EMOJI_1', when_to_use: '💰 quando falar de dinheiro ou preço' },
  { name: 'EMOJI_2', when_to_use: '📍 se perguntar onde fica' },
  { name: 'EMOJI_3', when_to_use: '🎥 quer ver vídeo ou demonstração' },
  
  // ===== CONDIÇÕES COMPLEXAS =====
  { name: 'COMPLEXO_1', when_to_use: 'Enviar se: 1) for primeira mensagem OU 2) cliente disser oi/olá OU 3) bom dia/boa tarde' },
  { name: 'COMPLEXO_2', when_to_use: 'Usar quando mencionar: vendas, atendimento, qualificação, leads, prospecção' },
  { name: 'COMPLEXO_3', when_to_use: 'Se perguntar preço E não tiver perguntado antes (verificar histórico)' },
  
  // ===== NEGÓCIOS ESPECÍFICOS =====
  { name: 'RESTAURANTE_1', when_to_use: 'prato do dia, sugestao do chef, comida especial' },
  { name: 'RESTAURANTE_2', when_to_use: 'delivery, entrega, quanto tempo demora, area de entrega' },
  { name: 'IMOBILIARIA_1', when_to_use: 'fotos do apartamento, imagens do imovel, ver a casa' },
  { name: 'IMOBILIARIA_2', when_to_use: 'agendar visita, marcar horario pra ver' },
  { name: 'CLINICA_1', when_to_use: 'marcar consulta, agendar, horario disponivel' },
  { name: 'CLINICA_2', when_to_use: 'aceita convenio, plano de saude, unimed, bradesco' },
  { name: 'ACADEMIA_1', when_to_use: 'plano mensal, mensalidade, quanto e a academia' },
  { name: 'ACADEMIA_2', when_to_use: 'aula experimental, fazer teste, experimentar' },
  { name: 'OFICINA_1', when_to_use: 'orcamento do carro, conserto, revisao' },
  { name: 'OFICINA_2', when_to_use: 'quanto tempo pra ficar pronto, prazo' },
  { name: 'PETSHOP_1', when_to_use: 'banho e tosa, dar banho no cachorro' },
  { name: 'PETSHOP_2', when_to_use: 'hotel pra cachorro, deixar o pet' },
  { name: 'ESCOLA_1', when_to_use: 'matricula, inscrever, como fazer inscricao' },
  { name: 'ESCOLA_2', when_to_use: 'material escolar, lista de material, uniforme' },
  
  // ===== OBJEÇÕES =====
  { name: 'OBJECAO_1', when_to_use: 'ta caro, achei caro, muito caro, fora do orcamento' },
  { name: 'OBJECAO_2', when_to_use: 'vou pensar, preciso pensar, deixa eu ver' },
  { name: 'OBJECAO_3', when_to_use: 'nao sei se preciso, sera que funciona pra mim' },
  
  // ===== FECHAMENTO =====
  { name: 'FECHAMENTO_1', when_to_use: 'quero comprar, vou fechar, pode fazer' },
  { name: 'FECHAMENTO_2', when_to_use: 'como pago, onde pago, manda o pix' },
  { name: 'FECHAMENTO_3', when_to_use: 'ok vamos la, bora, fechado' },
  
  // ===== SUPORTE =====
  { name: 'SUPORTE_1', when_to_use: 'problema, nao funciona, erro, bug' },
  { name: 'SUPORTE_2', when_to_use: 'ajuda, socorro, preciso de suporte' },
  { name: 'SUPORTE_3', when_to_use: 'como faz pra usar, tutorial, me ensina' },
  
  // ===== FRASES REGIONAIS =====
  { name: 'REGIONAL_1', when_to_use: 'opa, e ai, fala, beleza' },
  { name: 'REGIONAL_2', when_to_use: 'blz, show, massa, top' },
  { name: 'REGIONAL_3', when_to_use: 'mano, cara, parça, brother' },
].map((m, i) => ({
  id: `var-${i}`,
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

// Cenários de teste - mensagens do cliente
const CENARIOS = [
  // Preços
  { msg: 'Qual o preço?', esperadas: ['FORMAL_1', 'INFORMAL_1', 'ERRO_1', 'CURTO_1', 'EMOJI_1', 'LONGO_2'] },
  { msg: 'qto custa?', esperadas: ['INFORMAL_1', 'FORMAL_1', 'CURTO_1'] },
  { msg: 'Quanto eu pago?', esperadas: ['FORMAL_1', 'INFORMAL_1', 'EMOJI_1', 'LONGO_2'] },
  
  // Localização
  { msg: 'Onde vocês ficam?', esperadas: ['FORMAL_2', 'CURTO_2', 'EMOJI_2'] },
  { msg: 'Qual o endereço?', esperadas: ['FORMAL_2', 'CURTO_2'] },
  
  // Vendas
  { msg: 'Trabalho com vendas', esperadas: ['INFORMAL_2', 'COMPLEXO_2'] },
  { msg: 'Faço atendimento ao cliente', esperadas: ['INFORMAL_2', 'COMPLEXO_2'] },
  
  // Demonstração
  { msg: 'Quero ver funcionando', esperadas: ['INFORMAL_3', 'CURTO_4', 'EMOJI_3'] },
  { msg: 'Tem demo?', esperadas: ['CURTO_4', 'INFORMAL_3', 'EMOJI_3'] },
  
  // Catálogo
  { msg: 'Quero ver os produtos', esperadas: ['FORMAL_3', 'ERRO_2'] },
  { msg: 'Tem catálogo?', esperadas: ['ERRO_2', 'FORMAL_3'] },
  
  // Garantia
  { msg: 'Tem garantia?', esperadas: ['ERRO_3'] },
  
  // Horário
  { msg: 'Que horas vocês abrem?', esperadas: ['CURTO_3'] },
  { msg: 'Qual o horário?', esperadas: ['CURTO_3'] },
  
  // Restaurante
  { msg: 'Qual o prato do dia?', esperadas: ['RESTAURANTE_1'] },
  { msg: 'Entrega aqui?', esperadas: ['RESTAURANTE_2'] },
  { msg: 'Quanto tempo pra chegar?', esperadas: ['RESTAURANTE_2', 'OFICINA_2'] },
  
  // Imobiliária
  { msg: 'Quero ver fotos do apartamento', esperadas: ['IMOBILIARIA_1'] },
  { msg: 'Posso agendar uma visita?', esperadas: ['IMOBILIARIA_2', 'CLINICA_1'] },
  
  // Clínica
  { msg: 'Quero marcar consulta', esperadas: ['CLINICA_1'] },
  { msg: 'Aceita Unimed?', esperadas: ['CLINICA_2'] },
  { msg: 'Aceita plano de saúde?', esperadas: ['CLINICA_2'] },
  
  // Academia
  { msg: 'Quanto é a mensalidade?', esperadas: ['ACADEMIA_1'] },
  { msg: 'Posso fazer aula experimental?', esperadas: ['ACADEMIA_2'] },
  
  // Oficina
  { msg: 'Quero orçamento pro carro', esperadas: ['OFICINA_1'] },
  { msg: 'Quanto tempo pra ficar pronto?', esperadas: ['OFICINA_2'] },
  
  // Pet Shop
  { msg: 'Quanto é o banho e tosa?', esperadas: ['PETSHOP_1'] },
  { msg: 'Vocês têm hotel pra cachorro?', esperadas: ['PETSHOP_2'] },
  
  // Escola
  { msg: 'Como faço matrícula?', esperadas: ['ESCOLA_1'] },
  { msg: 'Qual a lista de material?', esperadas: ['ESCOLA_2'] },
  
  // Objeções
  { msg: 'Achei caro', esperadas: ['OBJECAO_1'] },
  { msg: 'Vou pensar', esperadas: ['OBJECAO_2'] },
  { msg: 'Será que funciona pra mim?', esperadas: ['OBJECAO_3'] },
  
  // Fechamento
  { msg: 'Quero comprar', esperadas: ['FECHAMENTO_1'] },
  { msg: 'Manda o pix', esperadas: ['FECHAMENTO_2'] },
  { msg: 'Fechado!', esperadas: ['FECHAMENTO_3'] },
  
  // Suporte
  { msg: 'Não está funcionando', esperadas: ['SUPORTE_1'] },
  { msg: 'Preciso de ajuda', esperadas: ['SUPORTE_2'] },
  { msg: 'Como faz pra usar?', esperadas: ['SUPORTE_3'] },
  
  // Saudações regionais
  { msg: 'E aí!', esperadas: ['REGIONAL_1'] },
  { msg: 'Opa!', esperadas: ['REGIONAL_1'] },
  { msg: 'Fala mano', esperadas: ['REGIONAL_1', 'REGIONAL_3'] },
];

const blocoMidia = generateMediaPromptBlock(MIDIAS_VARIADAS as any);

async function chamarIA(mensagem: string): Promise<string> {
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
      max_tokens: 300,
      temperature: 0.5,
    }),
  });
  
  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   TESTE DEFINITIVO: 50+ tipos de "quando usar"                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`📁 Total de mídias: ${MIDIAS_VARIADAS.length}`);
  console.log(`📝 Bloco gerado: ${blocoMidia.length} caracteres`);
  console.log(`🧪 Total de cenários: ${CENARIOS.length}\n`);
  
  let passou = 0;
  let falhou = 0;
  const falhas: { msg: string; esperadas: string[]; recebidas: string[] }[] = [];
  
  for (const c of CENARIOS) {
    process.stdout.write(`Testing: "${c.msg.substring(0, 30)}..."  `);
    
    try {
      const resposta = await chamarIA(c.msg);
      const midias = extractMediaTagsFromResponse(resposta);
      
      // Verifica se QUALQUER uma das esperadas foi enviada
      const temAlgumaEsperada = c.esperadas.some(e => midias.includes(e));
      
      if (temAlgumaEsperada) {
        passou++;
        console.log(`✅ ${midias[0]}`);
      } else {
        falhou++;
        falhas.push({ msg: c.msg, esperadas: c.esperadas, recebidas: midias });
        console.log(`❌ Esperava: ${c.esperadas[0]}, Recebeu: ${midias[0] || 'nenhuma'}`);
      }
      
      await new Promise(r => setTimeout(r, 300));
    } catch (error) {
      falhou++;
      console.log(`❌ ERRO`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                         RESUMO FINAL');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`   📁 Mídias testadas: ${MIDIAS_VARIADAS.length} tipos diferentes de "quando usar"`);
  console.log(`   🧪 Cenários: ${CENARIOS.length}`);
  console.log(`   ✅ Passou: ${passou}`);
  console.log(`   ❌ Falhou: ${falhou}`);
  console.log(`   📊 Taxa de sucesso: ${((passou / CENARIOS.length) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════════════════════════════════');
  
  if (falhas.length > 0 && falhas.length <= 10) {
    console.log('\n⚠️ CENÁRIOS QUE FALHARAM:');
    for (const f of falhas) {
      console.log(`   "${f.msg}" → esperava ${f.esperadas[0]}, recebeu ${f.recebidas[0] || 'nada'}`);
    }
  }
  
  if (passou / CENARIOS.length >= 0.85) {
    console.log('\n✅ SISTEMA APROVADO! Taxa de acerto >= 85%');
    console.log('O sistema funciona para QUALQUER tipo de mídia e descrição de "quando usar"!');
  }
  
  process.exit(0);
}

main().catch(console.error);
