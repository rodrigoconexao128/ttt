/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔗 FLOW INTEGRATION - Integração do Sistema de Fluxos
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Este arquivo integra o UnifiedFlowEngine com o sistema existente:
 * - /api/agent/generate-prompt → Cria FlowDefinition + Prompt
 * - /api/agent/edit-prompt → Atualiza FlowDefinition + Prompt
 * - generateAIResponse() → Usa FlowDefinition para responder
 * 
 * CONCEITO HÍBRIDO:
 * - Mantém o prompt como backup/documentação
 * - FlowDefinition é usado para execução determinística
 * - IA só interpreta intenções e humaniza respostas
 */

import { FlowBuilder, FlowDefinition, PromptAnalyzer } from "./FlowBuilder";
import { UnifiedFlowEngine, FlowStorage, FlowConfig } from "./UnifiedFlowEngine";
import { supabase } from "./supabaseAuth";

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO COM GENERATE-PROMPT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chamado quando usuário cria novo agente (/api/agent/generate-prompt)
 * Cria tanto o prompt (texto) quanto o FlowDefinition (estrutura)
 */
export async function handleGeneratePrompt(
  userId: string,
  businessType: string,
  businessName: string,
  description?: string,
  additionalInfo?: string
): Promise<{
  prompt: string;
  flow: FlowDefinition;
  flowCreated: boolean;
}> {
  console.log(`\n🔗 [FlowIntegration] Gerando prompt + flow para ${businessName}`);

  // 1. Analisar tipo de negócio para determinar flow adequado
  const analyzer = new PromptAnalyzer();
  
  // Mapear businessType para FlowType
  const flowTypeMap: Record<string, string> = {
    'restaurant': 'DELIVERY',
    'store': 'VENDAS',
    'clinic': 'AGENDAMENTO',
    'salon': 'AGENDAMENTO',
    'gym': 'VENDAS',
    'school': 'VENDAS',
    'agency': 'VENDAS',
    'realestate': 'VENDAS',
    'lawyer': 'SUPORTE',
    'mechanic': 'SUPORTE',
    'other': 'GENERICO'
  };

  const flowType = flowTypeMap[businessType] || 'GENERICO';

  // 2. Construir FlowDefinition baseado no tipo
  const builder = new FlowBuilder();
  
  // Criar prompt base para análise
  const basePrompt = `
Você é um atendente virtual da ${businessName}.
Tipo de negócio: ${businessType}
${description ? `Descrição: ${description}` : ''}
${additionalInfo ? `Informações adicionais: ${additionalInfo}` : ''}
  `.trim();

  // 3. Construir flow
  let flow: FlowDefinition;
  try {
    flow = await builder.buildFromPrompt(basePrompt);
    
    // Ajustar dados do flow
    flow.businessName = businessName;
    flow.agentName = extractAgentName(description) || 'Assistente';
    
    console.log(`   📋 Flow criado: ${flow.type} com ${Object.keys(flow.states).length} estados`);
  } catch (err) {
    console.error(`   ❌ Erro ao criar flow:`, err);
    // Fallback: criar flow genérico
    flow = builder.buildGenericoFlow('Assistente', businessName, 'profissional e amigável');
    flow.businessName = businessName;
  }

  // 4. Salvar flow no banco
  let flowCreated = false;
  try {
    flowCreated = await FlowStorage.saveFlow(userId, flow);
    console.log(`   ${flowCreated ? '✅' : '❌'} Flow ${flowCreated ? 'salvo' : 'não salvo'} no banco`);
  } catch (err) {
    console.error(`   ❌ Erro ao salvar flow:`, err);
  }

  // 5. Gerar prompt de texto (mantido para compatibilidade)
  const prompt = generatePromptFromFlow(flow, description, additionalInfo);

  console.log(`   📝 Prompt gerado: ${prompt.length} chars`);
  console.log(`🔗 [FlowIntegration] ════════════════════════════════\n`);

  return { prompt, flow, flowCreated };
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO COM EDIT-PROMPT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chamado quando usuário edita agente via chat (/api/agent/edit-prompt)
 * Atualiza tanto o prompt quanto o FlowDefinition
 */
export async function handleEditPrompt(
  userId: string,
  currentPrompt: string,
  instruction: string,
  newPrompt: string,
  apiKey: string
): Promise<{
  flowUpdated: boolean;
  changes: string[];
}> {
  console.log(`\n🔗 [FlowIntegration] Editando flow com instrução...`);
  console.log(`   Instrução: "${instruction.substring(0, 60)}..."`);

  // 1. Carregar flow existente
  let flow = await FlowStorage.loadFlow(userId);
  const changes: string[] = [];

  if (!flow) {
    // Se não existe flow, criar um do prompt
    console.log(`   ⚠️ Flow não encontrado, criando do prompt atual...`);
    const builder = new FlowBuilder();
    flow = await builder.buildFromPrompt(currentPrompt);
    changes.push('Flow criado a partir do prompt existente');
  }

  // 2. Analisar instrução e aplicar modificações
  const instructionLower = instruction.toLowerCase();

  // Modificar preços
  const priceMatches = instruction.match(/(?:pre[çc]o|valor|custa?).*?r?\$?\s*(\d+(?:[,.]\d{2})?)/gi);
  if (priceMatches) {
    for (const match of priceMatches) {
      const priceMatch = match.match(/(\d+(?:[,.]\d{2})?)/);
      if (priceMatch) {
        const newPrice = parseFloat(priceMatch[1].replace(',', '.'));
        if (!isNaN(newPrice) && flow) {
          if (!flow.data) flow.data = {};
          if (!flow.data.prices) flow.data.prices = {};
          
          if (instructionLower.includes('promo') || instructionLower.includes('desconto')) {
            flow.data.prices.promo = newPrice;
            changes.push(`Preço promocional: R$${newPrice}`);
          } else if (instructionLower.includes('impl') || instructionLower.includes('setup')) {
            flow.data.prices.implementation = newPrice;
            changes.push(`Preço implementação: R$${newPrice}`);
          } else {
            flow.data.prices.standard = newPrice;
            changes.push(`Preço padrão: R$${newPrice}`);
          }
        }
      }
    }
  }

  // Modificar cupom
  const couponMatch = instruction.match(/cupom\s*(?:é|:)?\s*([A-Z0-9_-]+)/i);
  if (couponMatch && flow) {
    const newCoupon = couponMatch[1].toUpperCase();
    if (!flow.data) flow.data = {};
    if (!flow.data.coupons) flow.data.coupons = {};
    
    const discountMatch = instruction.match(/(\d+)\s*%/);
    const discount = discountMatch ? parseInt(discountMatch[1]) : 50;
    
    flow.data.coupons[newCoupon] = { code: newCoupon, discount };
    changes.push(`Cupom: ${newCoupon} (${discount}% off)`);
  }

  // Modificar link
  const linkMatch = instruction.match(/(https?:\/\/[^\s]+)/i);
  if (linkMatch && flow) {
    if (!flow.data) flow.data = {};
    if (!flow.data.links) flow.data.links = {};
    
    if (instructionLower.includes('cadastro') || instructionLower.includes('signup')) {
      flow.data.links.signup = linkMatch[1];
      changes.push(`Link cadastro: ${linkMatch[1]}`);
    } else {
      flow.data.links.site = linkMatch[1];
      changes.push(`Link site: ${linkMatch[1]}`);
    }
  }

  // Modificar nome do agente
  if (instructionLower.includes('nome') && instructionLower.includes('agente') && flow) {
    const nameMatch = instruction.match(/(?:chamar?|nome).*?(?:de\s+)?([A-Za-záéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]+)(?:\s|$)/i);
    if (nameMatch && nameMatch[1].length > 2 && !['de', 'do', 'da', 'para', 'por'].includes(nameMatch[1].toLowerCase())) {
      flow.agentName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase();
      changes.push(`Nome do agente: ${flow.agentName}`);
    }
  }

  // Verificar se flow existe antes de modificar personalidade
  if (!flow) {
    console.log(`   ❌ Flow não encontrado após criação`);
    return { flowUpdated: false, changes: [] };
  }

  // Modificar personalidade
  if (instructionLower.includes('formal') && !instructionLower.includes('informal')) {
    flow.agentPersonality = 'formal, profissional, cortês';
    changes.push('Personalidade: formal');
  } else if (instructionLower.includes('informal') || instructionLower.includes('descontraído')) {
    flow.agentPersonality = 'informal, descontraído, divertido';
    changes.push('Personalidade: informal');
  } else if (instructionLower.includes('direto') || instructionLower.includes('objetivo')) {
    flow.agentPersonality = 'direto, objetivo, prático';
    changes.push('Personalidade: direto');
  }

  // Adicionar nova regra global
  if (instructionLower.includes('sempre') || instructionLower.includes('nunca')) {
    if (!flow.globalRules) flow.globalRules = [];
    flow.globalRules.push(instruction);
    changes.push(`Nova regra adicionada`);
  }

  // 3. Atualizar versão e salvar
  flow.version = incrementVersion(flow.version);
  
  const saved = await FlowStorage.saveFlow(userId, flow);
  
  console.log(`   ${saved ? '✅' : '❌'} Flow ${saved ? 'atualizado' : 'não atualizado'}`);
  console.log(`   📊 ${changes.length} mudanças aplicadas: ${changes.join(', ')}`);
  console.log(`🔗 [FlowIntegration] ════════════════════════════════\n`);

  return {
    flowUpdated: saved,
    changes
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO COM generateAIResponse
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verifica se deve usar FlowEngine ou sistema legado
 */
export async function shouldUseFlowEngine(userId: string): Promise<boolean> {
  // Verificar se usuário tem um flow definido
  const flow = await FlowStorage.loadFlow(userId);
  return flow !== null;
}

/**
 * Processa mensagem usando FlowEngine
 * Chamado por generateAIResponse quando shouldUseFlowEngine = true
 */
export async function processWithFlowEngine(
  userId: string,
  conversationId: string,
  messageText: string,
  apiKey: string,
  options?: {
    contactName?: string;
    history?: { fromMe: boolean; text: string }[];
  }
): Promise<{
  text: string;
  mediaActions?: any[];
  usedFlow: boolean;
} | null> {
  
  const config: FlowConfig = {
    apiKey,
    model: 'mistral-small-latest',
    humanize: true,
    temperature: 0.2
  };

  const engine = new UnifiedFlowEngine(config);
  
  const result = await engine.processMessage(
    userId,
    conversationId,
    messageText,
    {
      useAI: true,
      humanize: true,
      contactName: options?.contactName
    }
  );

  if (!result) {
    return null;
  }

  return {
    text: result.text,
    mediaActions: result.mediaActions,
    usedFlow: true
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function extractAgentName(text?: string): string | null {
  if (!text) return null;
  
  const patterns = [
    /(?:sou|me chamo|meu nome [ée])\s+([A-Za-záéíóúâêîôûãõç]+)/i,
    /(?:agente|atendente)\s+([A-Za-záéíóúâêîôûãõç]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1].length > 2) {
      return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    }
  }

  return null;
}

function incrementVersion(version: string): string {
  const parts = version.split('.');
  const patch = parseInt(parts[2] || '0') + 1;
  return `${parts[0]}.${parts[1]}.${patch}`;
}

/**
 * Gera prompt de texto a partir de FlowDefinition
 * (Mantido para compatibilidade com sistema legado)
 */
function generatePromptFromFlow(
  flow: FlowDefinition,
  description?: string,
  additionalInfo?: string
): string {
  const lines: string[] = [];

  // Identidade
  lines.push(`Você é ${flow.agentName}, atendente virtual da ${flow.businessName}.`);
  if (flow.agentPersonality) {
    lines.push(`Personalidade: ${flow.agentPersonality}.`);
  }
  lines.push('');

  // Tipo de negócio
  if (flow.type === 'DELIVERY') {
    lines.push('TIPO: Delivery/Restaurante');
    lines.push('Você ajuda clientes a ver o cardápio, montar pedidos e finalizar compras.');
  } else if (flow.type === 'VENDAS') {
    lines.push('TIPO: Vendas/Comercial');
    lines.push('Você apresenta produtos/serviços, responde dúvidas e guia para fechamento.');
  } else if (flow.type === 'AGENDAMENTO') {
    lines.push('TIPO: Agendamento');
    lines.push('Você agenda horários, confirma disponibilidade e gerencia reservas.');
  } else if (flow.type === 'SUPORTE') {
    lines.push('TIPO: Suporte');
    lines.push('Você responde dúvidas frequentes e encaminha casos complexos.');
  }
  lines.push('');

  // Dados importantes
  if (flow.data) {
    lines.push('DADOS DO NEGÓCIO:');
    
    if (flow.data.prices) {
      if (flow.data.prices.standard) lines.push(`• Preço padrão: R$${flow.data.prices.standard}`);
      if (flow.data.prices.promo) lines.push(`• Preço promocional: R$${flow.data.prices.promo}`);
      if (flow.data.prices.implementation) lines.push(`• Implementação: R$${flow.data.prices.implementation}`);
    }
    
    if (flow.data.coupons && Object.keys(flow.data.coupons).length > 0) {
      for (const [key, coupon] of Object.entries(flow.data.coupons)) {
        lines.push(`• Cupom ${coupon.code}: ${coupon.discount}% de desconto`);
      }
    }
    
    if (flow.data.links) {
      if (flow.data.links.site) lines.push(`• Site: ${flow.data.links.site}`);
      if (flow.data.links.signup) lines.push(`• Cadastro: ${flow.data.links.signup}`);
    }
    
    lines.push('');
  }

  // Regras globais
  if (flow.globalRules && flow.globalRules.length > 0) {
    lines.push('REGRAS:');
    for (const rule of flow.globalRules.slice(0, 10)) {
      lines.push(`• ${rule}`);
    }
    lines.push('');
  }

  // Descrição e info adicional
  if (description) {
    lines.push('DESCRIÇÃO:');
    lines.push(description);
    lines.push('');
  }
  
  if (additionalInfo) {
    lines.push('INFORMAÇÕES ADICIONAIS:');
    lines.push(additionalInfo);
    lines.push('');
  }

  // Instruções finais
  lines.push('INSTRUÇÕES:');
  lines.push('• Seja amigável e profissional');
  lines.push('• Respostas curtas e objetivas para WhatsApp');
  lines.push('• Use no máximo 2 emojis por mensagem');
  lines.push('• Nunca invente informações');

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  FlowBuilder,
  FlowDefinition,
  UnifiedFlowEngine,
  FlowStorage
};
