
import { createClient } from '@supabase/supabase-js';
import { Mistral } from '@mistralai/mistralai';
import { config } from 'dotenv';
import * as fs from 'fs';
import { PERFIS_CLIENTES, type ClienteProfile } from './test-ia-vs-ia-vendas';

config();

// Configurações
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
const MISTRAL_KEY = process.env.MISTRAL_API_KEY || '';
const USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const mistral = new Mistral({ apiKey: MISTRAL_KEY });

// Logger
function log(msg: string) {
  console.log(msg);
  fs.appendFileSync('log-execucao-atual.txt', msg + '\n');
}

// Limpar log anterior
if (fs.existsSync('log-execucao-atual.txt')) {
  fs.unlinkSync('log-execucao-atual.txt');
}

// Função para buscar prompt ATUAL do banco
async function buscarPromptAgente(): Promise<string> {
  const { data, error } = await supabase
    .from('ai_agent_config')
    .select('prompt')
    .eq('user_id', USER_ID)
    .single();
  
  if (error || !data) throw new Error('Erro ao buscar prompt: ' + error?.message);
  return data.prompt;
}

// Simulador de Cliente (IA)
async function gerarRespostaCliente(
  perfil: ClienteProfile, 
  historico: any[]
): Promise<string> {
  // Construir prompt do cliente
  const systemPrompt = `
    Você é um CLIENTE conversando no WhatsApp.
    
    SEU PERFIL:
    - Nome: ${perfil.nome}
    - Segmento: ${perfil.segmento}
    - Temperatura: ${perfil.temperatura} (Frio: cético/curto; Morno: dúvidas; Quente: quer comprar)
    - Comportamento: ${perfil.comportamento}
    - Objeções Típicas: ${perfil.objecoes.join(', ')}
    
    CONTEXTO ATUAL:
    Você está conversando com Rodrigo, um vendedor de um sistema de automação de WhatsApp (AgenteZap).
    
    OBJETIVO:
    Aja naturalmente de acordo com seu perfil.
    - Se for FRIO: Seja desconfiado, dê respostas curtas, pergunte "quanto custa" logo de cara.
    - Se for MORNO: Faça perguntas sobre como funciona, se serve pro seu negócio.
    - Se for QUENTE: Mostre interesse, pergunte como assina.
    - Se o vendedor for bom e resolver suas dúvidas: ACEITE a proposta (criar conta grátis ou assinar).
    - Se o vendedor for robótico ou chato: Pare de responder ou reclame.

    IMPORTANTE:
    - Fale curto, estilo WhatsApp.
    - Use gírias locais se couber no perfil.
    - Pode errar pontuação de leve.
    - SE DECIDIR COMPRAR/CADASTRAR, DIGA CLARAMENTE: "Vou criar a conta", "Vou assinar", "Gostei".
  `;

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...historico // Histórico inverte os papéis para a visão do cliente, mas aqui vamos simplificar mandando as mensagens como estão e instruindo a IA
    ];

    // Adaptação das roles para a visão do ClienteSimulator
    // User (no histórico real) -> Assistant (pro simulador, é o que ele disse antes)
    // Assistant (no histórico real) -> User (pro simulador, é o vendedor falando com ele)
    const simuladorMessages = messages.map(m => {
      if (m.role === 'system') return m;
      if (m.role === 'user') return { role: 'assistant', content: m.content }; // O que o cliente disse antes
      if (m.role === 'assistant') return { role: 'user', content: m.content }; // O que o vendedor disse
      return m;
    });

    const response = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: simuladorMessages as any,
      temperature: 0.8,
      maxTokens: 150
    });

    return response.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('Erro ao gerar cliente:', error);
    return '...';
  }
}

// Agente Vendedor (O que estamos testando)
async function gerarRespostaVendedor(
  promptSistema: string,
  historico: any[]
): Promise<string> {
  try {
    const response = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: promptSistema },
        ...historico
      ] as any,
      temperature: 0.4, // Mais baixo para seguir regras
      maxTokens: 300
    });

    return response.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('Erro ao gerar vendedor:', error);
    return '';
  }
}

// Executar UM teste
async function rodarTesteUnico(perfil: ClienteProfile, promptVendedor: string) {
  log(`\n════════════════════════════════════════════════════════════════`);
  log(`👤 CLIENTE: ${perfil.nome} | ${perfil.segmento} | ${perfil.temperatura}`);
  log(`📝 Comportamento: ${perfil.comportamento}`);
  log(`════════════════════════════════════════════════════════════════`);

  const historico: any[] = [];
  
  // 1. Cliente inicia (ou Agente, dependendo do caso, mas aqui vamos assumir inbound ou resposta a campanha)
  // Vamos usar a mensagemInicial do perfil
  const msgInicial = perfil.mensagemInicial;
  log(`CLIENTE: ${msgInicial}`);
  historico.push({ role: 'user', content: msgInicial });

  let sucesso = false;
  let motivo = '';
  
  // Loop de conversa (max 8 turnos para ser rápido mas profundo)
  for (let i = 0; i < 8; i++) {
    // 2. Vendedor Responde
    const repVendedor = await gerarRespostaVendedor(promptVendedor, historico);
    log(`RODRIGO: ${repVendedor}`);
    historico.push({ role: 'assistant', content: repVendedor });

    // Pequena pausa para logs
    await new Promise(r => setTimeout(r, 500));

    // Analisar se vendedor "converteu" mentalmente o cliente
    const repVendedorLower = repVendedor.toLowerCase();
    
    // 3. Cliente Responde (Simulado)
    const repCliente = await gerarRespostaCliente(perfil, historico);
    log(`CLIENTE: ${repCliente}`);
    historico.push({ role: 'user', content: repCliente });

    // Verificar Sucesso na fala do cliente
    const repClienteLower = repCliente.toLowerCase();
    if (
      repClienteLower.includes('criar a conta') || 
      repClienteLower.includes('criar minha conta') ||
      repClienteLower.includes('vou cadastrar') ||
      repClienteLower.includes('link') && repClienteLower.includes('acessar') ||
      repClienteLower.includes('gostei') && repClienteLower.includes('vou fazer') || 
      repClienteLower.includes('fechado')
    ) {
      sucesso = true;
      motivo = 'Cliente concordou em criar conta/assinar';
      log(`\n✅ CONVERSÃO DETECTADA: ${motivo}`);
      break;
    }
  }

  if (!sucesso) {
    log(`\n⚠️ NÃO HOUVE CONVERSÃO CLARA EM 8 TURNOS`);
  }
  
  return { perfil, historico, sucesso };
}

// Loop Principal
async function main() {
  const args = process.argv.slice(2);
  const inicio = parseInt(args[0]) || 0;
  const quantidade = parseInt(args[1]) || 5;

  log(`Iniciando bateria de testes: Índice ${inicio} a ${inicio + quantidade - 1}`);

  try {
    const promptAtual = await buscarPromptAgente();
    log(`Prompt carregado (${promptAtual.length} chars)`);

    // Pegar subconjunto de perfis
    const perfisParaTestar = PERFIS_CLIENTES.slice(inicio, inicio + quantidade);

    for (const perfil of perfisParaTestar) {
      await rodarTesteUnico(perfil, promptAtual);
      log('\n--------------------------------------------------\n');
      // Delay entre clientes
      await new Promise(r => setTimeout(r, 2000));
    }

    log('Bateria finalizada. Verifique log-execucao-atual.txt');

  } catch (error) {
    log(`Erro fatal: ${error}`);
  }
}

main();
