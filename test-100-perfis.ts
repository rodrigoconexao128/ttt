/**
 * 🧪 TESTE 100 PERFIS - IA VS IA
 * 
 * Executa testes com 100 perfis diferentes de clientes.
 * 
 * Uso: 
 *   npx tsx test-100-perfis.ts [numero]     # Testa perfil específico
 *   npx tsx test-100-perfis.ts range 21 30  # Testa range de perfis
 *   npx tsx test-100-perfis.ts quentes      # Testa só leads quentes
 *   npx tsx test-100-perfis.ts frios        # Testa só leads frios
 *   npx tsx test-100-perfis.ts mornos       # Testa só leads mornos
 */

import 'dotenv/config';
import { db } from './server/db';
import { aiAgentConfig, systemConfig } from './shared/schema';
import { eq } from 'drizzle-orm';
import { Mistral } from "@mistralai/mistralai";
import { PERFIS_CLIENTES_100, getPerfilById, getPerfisByTemperatura, PerfilCliente } from './perfis-clientes-100';

const USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735';
const MAX_TURNOS = 12;

// Cores
const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
};

async function getMistralClient(): Promise<Mistral> {
  const config = await db.select().from(systemConfig).where(eq(systemConfig.chave, 'mistral_api_key')).limit(1);
  if (!config[0]?.valor) throw new Error("MISTRAL_API_KEY não encontrada");
  return new Mistral({ apiKey: config[0].valor });
}

async function getPromptAgente(): Promise<string> {
  const config = await db.select().from(aiAgentConfig).where(eq(aiAgentConfig.userId, USER_ID)).limit(1);
  return config[0]?.prompt || 'Você é um assistente de vendas.';
}

function criarPromptCliente(perfil: PerfilCliente): string {
  return `Você é um CLIENTE simulado. NUNCA revele que é IA.

PERFIL: ${perfil.tipo}
TEMPERATURA: ${perfil.temperatura}
SEGMENTO: ${perfil.segmento}
PERSONALIDADE: ${perfil.personalidade}
COMPORTAMENTO: ${perfil.comportamento}

REGRAS:
1. Aja como esse cliente agiria
2. Use WhatsApp informal
3. Respostas curtas (não parágrafos)
4. Se convencer, diga que quer testar/assinar
5. NUNCA mencione que é simulação

OBJETIVO: ${perfil.metaConversao === 'criar_conta_gratuita' ? 'Criar conta gratuita' : perfil.metaConversao === 'assinar_plano' ? 'Assinar plano' : 'Aceitar implementação'}

Responda APENAS como cliente:`;
}

async function simularCliente(
  mistral: Mistral,
  perfil: PerfilCliente,
  historico: Array<{ role: string; msg: string }>,
  ultimaMsg: string
): Promise<string> {
  const hist = historico.map(h => `${h.role}: ${h.msg}`).join('\n');
  
  const response = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages: [{ role: "user", content: `${criarPromptCliente(perfil)}\n\nHISTÓRICO:\n${hist}\n\nVENDEDOR: "${ultimaMsg}"\n\nResponda:` }],
    maxTokens: 150,
    temperature: 0.8,
  });
  
  return response.choices?.[0]?.message?.content?.toString()?.trim() || "ok";
}

async function obterRespostaAgente(
  mistral: Mistral,
  prompt: string,
  historico: Array<{ role: string; msg: string }>,
  msgCliente: string
): Promise<string> {
  const hist = historico.map(h => `${h.role}: ${h.msg}`).join('\n');
  
  const response = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages: [{ role: "user", content: `${prompt}\n\nHISTÓRICO:\n${hist}\n\nCLIENTE: "${msgCliente}"\n\nResponda:` }],
    maxTokens: 300,
    temperature: 0.7,
  });
  
  return response.choices?.[0]?.message?.content?.toString()?.trim() || "Como posso ajudar?";
}

function analisarConversa(historico: Array<{ role: string; msg: string }>): {
  converteu: boolean;
  tipo: string;
  pontos: number;
  observacoes: string[];
} {
  const resultado = { converteu: false, tipo: '', pontos: 0, observacoes: [] as string[] };
  
  const textosCliente = historico.filter(h => h.role === 'CLIENTE').map(h => h.msg.toLowerCase());
  const ultimasMsgs = textosCliente.slice(-3).join(' ');
  
  // Sinais positivos
  const sinaisPositivos = [
    { regex: /vou (testar|criar|fazer|assinar|contratar)/, pts: 30, obs: 'intenção de ação' },
    { regex: /(manda|envia|passa).*(link|código|cupom)/, pts: 25, obs: 'pediu link' },
    { regex: /(fechado|beleza|bora|vamos)/, pts: 20, obs: 'aprovação' },
    { regex: /(gostei|interessante|parece bom)/, pts: 15, obs: 'interesse' },
    { regex: /quanto custa\?|qual (o )?(preço|valor)/, pts: 10, obs: 'perguntou preço' },
  ];
  
  // Sinais negativos
  const sinaisNegativos = [
    { regex: /(não quero|não preciso|não tenho interesse)/, pts: -30, obs: 'rejeição' },
    { regex: /(caro|muito caro|não tenho grana)/, pts: -15, obs: 'objeção preço' },
    { regex: /(depois|outra hora|não agora)/, pts: -10, obs: 'adiamento' },
    { regex: /(tchau|até mais|valeu)(?!.*link)/, pts: -5, obs: 'despedida sem ação' },
  ];
  
  for (const txt of textosCliente) {
    for (const sinal of sinaisPositivos) {
      if (sinal.regex.test(txt)) {
        resultado.pontos += sinal.pts;
        resultado.observacoes.push(`✅ ${sinal.obs}`);
      }
    }
    for (const sinal of sinaisNegativos) {
      if (sinal.regex.test(txt)) {
        resultado.pontos += sinal.pts;
        resultado.observacoes.push(`❌ ${sinal.obs}`);
      }
    }
  }
  
  // Verifica conversão
  const conversaoRegex = /(vou|quero|bora).*(testar|criar|assinar|fazer|contratar)|manda.*(link|código)|fechado|beleza.*link/;
  if (conversaoRegex.test(ultimasMsgs)) {
    resultado.converteu = true;
    resultado.tipo = ultimasMsgs.includes('assinar') ? 'plano' : 
                     ultimasMsgs.includes('implementa') ? 'implementacao' : 'conta_gratuita';
  }
  
  resultado.pontos = Math.max(0, Math.min(100, 50 + resultado.pontos));
  
  return resultado;
}

async function executarTeste(perfil: PerfilCliente): Promise<{
  id: number;
  tipo: string;
  converteu: boolean;
  pontos: number;
  turnos: number;
}> {
  const tempEmoji = perfil.temperatura === 'quente' ? '🔥' : perfil.temperatura === 'morno' ? '🌡️' : '❄️';
  
  console.log('\n' + '═'.repeat(80));
  console.log(` 🧪 TESTE #${perfil.id}: ${perfil.tipo} `);
  console.log('═'.repeat(80));
  console.log(`📋 Temp: ${tempEmoji} | Segmento: ${perfil.segmento} | Meta: ${perfil.metaConversao}`);
  console.log('─'.repeat(80));
  
  const mistral = await getMistralClient();
  const promptAgente = await getPromptAgente();
  const historico: Array<{ role: string; msg: string }> = [];
  
  // Mensagem inicial do cliente
  let msgCliente = perfil.mensagemInicial;
  console.log(`\n👤 CLIENTE: ${msgCliente}`);
  historico.push({ role: 'CLIENTE', msg: msgCliente });
  
  for (let turno = 0; turno < MAX_TURNOS; turno++) {
    // Resposta do agente
    const respostaAgente = await obterRespostaAgente(mistral, promptAgente, historico, msgCliente);
    console.log(`${C.cyan}🤖 RODRIGO: ${respostaAgente}${C.reset}`);
    historico.push({ role: 'RODRIGO', msg: respostaAgente });
    
    // Análise intermediária
    const analise = analisarConversa(historico);
    if (analise.converteu || turno >= MAX_TURNOS - 1) break;
    
    // Próxima mensagem do cliente
    msgCliente = await simularCliente(mistral, perfil, historico, respostaAgente);
    console.log(`\n👤 CLIENTE: ${msgCliente}`);
    historico.push({ role: 'CLIENTE', msg: msgCliente });
  }
  
  // Análise final
  const resultado = analisarConversa(historico);
  
  console.log('\n' + '─'.repeat(80));
  console.log('📊 RESULTADO:');
  
  if (resultado.converteu) {
    console.log(`${C.bgGreen}${C.reset} ✅ CONVERTEU! (${resultado.tipo})`);
  } else {
    console.log(`${C.bgRed}${C.reset} ❌ NÃO CONVERTEU`);
  }
  
  console.log(`📈 Pontuação: ${resultado.pontos}/100`);
  console.log(`💬 Turnos: ${historico.length / 2}`);
  
  if (resultado.observacoes.length > 0) {
    console.log('📝 Observações:');
    resultado.observacoes.slice(0, 5).forEach(obs => console.log(`   ${obs}`));
  }
  
  return {
    id: perfil.id,
    tipo: perfil.tipo,
    converteu: resultado.converteu,
    pontos: resultado.pontos,
    turnos: Math.floor(historico.length / 2)
  };
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🧪 TESTE 100 PERFIS - IA VS IA

Uso:
  npx tsx test-100-perfis.ts [numero]        # Testa perfil específico (1-100)
  npx tsx test-100-perfis.ts range 21 30     # Testa range (21 a 30)
  npx tsx test-100-perfis.ts quentes         # Testa leads quentes (1-20)
  npx tsx test-100-perfis.ts mornos          # Testa leads mornos (21-50)
  npx tsx test-100-perfis.ts frios           # Testa leads frios (51-80)
  npx tsx test-100-perfis.ts especiais       # Testa cenários especiais (81-100)
  npx tsx test-100-perfis.ts todos           # Testa TODOS os 100 perfis

Perfis disponíveis: 1-100
`);
    process.exit(0);
  }
  
  let perfisParaTestar: PerfilCliente[] = [];
  
  if (args[0] === 'range' && args[1] && args[2]) {
    const inicio = parseInt(args[1]);
    const fim = parseInt(args[2]);
    perfisParaTestar = PERFIS_CLIENTES_100.filter(p => p.id >= inicio && p.id <= fim);
  } else if (args[0] === 'quentes') {
    perfisParaTestar = getPerfisByTemperatura('quente');
  } else if (args[0] === 'mornos') {
    perfisParaTestar = getPerfisByTemperatura('morno');
  } else if (args[0] === 'frios') {
    perfisParaTestar = getPerfisByTemperatura('frio');
  } else if (args[0] === 'especiais') {
    perfisParaTestar = PERFIS_CLIENTES_100.filter(p => p.id >= 81);
  } else if (args[0] === 'todos') {
    perfisParaTestar = PERFIS_CLIENTES_100;
  } else {
    const id = parseInt(args[0]);
    const perfil = getPerfilById(id);
    if (perfil) {
      perfisParaTestar = [perfil];
    } else {
      console.log(`❌ Perfil #${id} não encontrado. Use 1-100.`);
      process.exit(1);
    }
  }
  
  console.log(`\n🚀 Iniciando ${perfisParaTestar.length} teste(s)...\n`);
  
  const resultados: Array<{
    id: number;
    tipo: string;
    converteu: boolean;
    pontos: number;
    turnos: number;
  }> = [];
  
  for (const perfil of perfisParaTestar) {
    try {
      const resultado = await executarTeste(perfil);
      resultados.push(resultado);
    } catch (error) {
      console.error(`❌ Erro no teste #${perfil.id}:`, error);
      resultados.push({
        id: perfil.id,
        tipo: perfil.tipo,
        converteu: false,
        pontos: 0,
        turnos: 0
      });
    }
  }
  
  // Resumo final
  if (resultados.length > 1) {
    console.log('\n' + '═'.repeat(80));
    console.log(' 📊 RESUMO FINAL ');
    console.log('═'.repeat(80));
    
    const convertidos = resultados.filter(r => r.converteu).length;
    const taxa = ((convertidos / resultados.length) * 100).toFixed(1);
    const mediaScore = (resultados.reduce((acc, r) => acc + r.pontos, 0) / resultados.length).toFixed(1);
    
    console.log(`✅ Conversões: ${convertidos}/${resultados.length} (${taxa}%)`);
    console.log(`📈 Score médio: ${mediaScore}/100`);
    
    console.log('\n📋 Detalhes:');
    resultados.forEach(r => {
      const status = r.converteu ? '✅' : '❌';
      console.log(`   ${status} #${r.id} ${r.tipo.substring(0, 30).padEnd(30)} | ${r.pontos}pts | ${r.turnos} turnos`);
    });
    
    // Identificar problemas
    const naoConvertidos = resultados.filter(r => !r.converteu);
    if (naoConvertidos.length > 0) {
      console.log('\n⚠️ Perfis que NÃO converteram:');
      naoConvertidos.forEach(r => {
        console.log(`   - #${r.id} ${r.tipo}`);
      });
    }
  }
  
  console.log('\n' + '═'.repeat(80));
  console.log(` Próximo: npx tsx test-100-perfis.ts ${perfisParaTestar[perfisParaTestar.length - 1]?.id + 1 || 1} `);
  console.log('═'.repeat(80));
  
  process.exit(0);
}

main().catch(console.error);
