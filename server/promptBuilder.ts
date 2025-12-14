/**
 * PromptBuilder - Construtor Inteligente de Prompts
 * 
 * Responsável por:
 * - Gerar prompts de onboarding para coletar informações
 * - Construir prompts do agente baseado nas informações coletadas
 * - Gerar mensagens de follow-up contextualizadas
 * - Aplicar técnicas de vendas (SPIN Selling, urgência, etc)
 */

import type { TempClient, ConversationMessage } from "./tempClientService";

// Tipos de negócio predefinidos
export const BUSINESS_TYPES = {
  restaurante: {
    name: "Restaurante/Delivery",
    keywords: ["restaurante", "delivery", "comida", "lanchonete", "pizzaria", "hamburgueria"],
    defaultRole: "atendente de pedidos",
    samplePrompt: "Você é um atendente amigável que ajuda clientes a fazer pedidos, tirar dúvidas sobre o cardápio e informar sobre promoções.",
  },
  loja: {
    name: "Loja/E-commerce",
    keywords: ["loja", "ecommerce", "produtos", "roupas", "acessórios", "vendas"],
    defaultRole: "vendedor(a)",
    samplePrompt: "Você é um vendedor atencioso que apresenta produtos, tira dúvidas sobre tamanhos/cores e ajuda no processo de compra.",
  },
  servicos: {
    name: "Prestador de Serviços",
    keywords: ["serviço", "consultoria", "freelancer", "agência", "escritório"],
    defaultRole: "consultor(a)",
    samplePrompt: "Você é um consultor profissional que agenda reuniões, explica serviços e qualifica potenciais clientes.",
  },
  saude: {
    name: "Saúde/Clínica",
    keywords: ["saúde", "clínica", "médico", "dentista", "psicólogo", "nutricionista"],
    defaultRole: "assistente de agendamento",
    samplePrompt: "Você é uma assistente de clínica que agenda consultas, confirma horários e tira dúvidas sobre procedimentos.",
  },
  educacao: {
    name: "Educação/Cursos",
    keywords: ["curso", "escola", "treinamento", "aula", "professor"],
    defaultRole: "consultor educacional",
    samplePrompt: "Você é um consultor educacional que apresenta cursos, tira dúvidas sobre metodologia e matrícula.",
  },
  imobiliaria: {
    name: "Imobiliária",
    keywords: ["imóvel", "casa", "apartamento", "aluguel", "venda", "corretor"],
    defaultRole: "corretor(a) de imóveis",
    samplePrompt: "Você é um corretor que apresenta imóveis, agenda visitas e tira dúvidas sobre financiamento.",
  },
  outro: {
    name: "Outro",
    keywords: [],
    defaultRole: "assistente virtual",
    samplePrompt: "Você é um assistente virtual atencioso que ajuda clientes com informações e solicitações.",
  },
};

class PromptBuilder {
  /**
   * Gera mensagem de boas-vindas inicial
   */
  getWelcomeMessage(): string {
    return `🎉 *Olá! Bem-vindo ao AgenteZap!*

Que legal ter você aqui! Vou te ajudar a criar seu agente de IA personalizado em poucos minutos.

Antes de começar, me conta: *qual é o seu tipo de negócio?*

Escolha uma opção ou me descreva:
• 🍕 Restaurante/Delivery
• 🛍️ Loja/E-commerce  
• 💼 Prestador de Serviços
• 🏥 Saúde/Clínica
• 📚 Educação/Cursos
• 🏠 Imobiliária
• 🔧 Outro (me descreva)`;
  }

  /**
   * Gera pergunta para coletar nome do agente
   */
  getAgentNameQuestion(businessType: string): string {
    const type = BUSINESS_TYPES[businessType as keyof typeof BUSINESS_TYPES] || BUSINESS_TYPES.outro;
    
    return `Perfeito! ${type.name} é uma ótima área! 🎯

Agora vamos dar uma identidade ao seu agente:

*Qual será o NOME do seu agente?*

💡 Exemplos populares:
• Luna
• Max  
• Sofia
• Bia
• Carlos

Ou escolha um nome que combine com sua marca!`;
  }

  /**
   * Gera pergunta para coletar papel/função do agente
   */
  getAgentRoleQuestion(agentName: string, businessType: string): string {
    const type = BUSINESS_TYPES[businessType as keyof typeof BUSINESS_TYPES] || BUSINESS_TYPES.outro;
    
    return `*${agentName}* - adorei o nome! 😍

Agora me conta: *qual será a função principal de ${agentName}?*

Baseado no seu negócio, sugiro:
✨ *${type.defaultRole}*

Ou você pode personalizar:
• Atendente
• Vendedor(a)
• Consultor(a)
• Assistente
• Secretária virtual

O que combina melhor?`;
  }

  /**
   * Gera pergunta para coletar informações do negócio
   */
  getBusinessInfoQuestion(agentName: string, businessName?: string): string {
    return `Excelente! 🚀

${businessName ? `Então ${agentName} vai trabalhar na *${businessName}*!` : ''}

Agora preciso de algumas informações para ${agentName} poder atender bem seus clientes:

📝 *Me conta um pouco sobre seu negócio:*
• O que você vende/oferece?
• Qual seu diferencial?
• Quais as dúvidas mais comuns dos clientes?
• Tem horário de funcionamento específico?

Pode escrever livremente, quanto mais detalhes melhor! 🎯`;
  }

  /**
   * Gera mensagem de pronto para testar
   */
  getReadyToTestMessage(client: TempClient): string {
    return `🎉 *Perfeito! ${client.agentName} está pronto(a)!*

Configurei seu agente com base em tudo que você me contou:

📋 *Resumo da configuração:*
• Nome: ${client.agentName}
• Função: ${client.agentRole}
• Negócio: ${client.businessName || 'Não definido'}

Agora vem a parte divertida: *TESTAR!* 🧪

Vou ativar o modo teste. A partir de agora, você vai conversar diretamente com ${client.agentName}.

💡 *Dicas do teste:*
• Faça perguntas como se fosse um cliente
• Teste diferentes situações
• Veja como ${client.agentName} responde

⚠️ *Para SAIR do teste a qualquer momento, digite:*
*#sair*

Pronto para começar? Só me confirmar e ativo o modo teste! 🚀`;
  }

  /**
   * Gera mensagem quando entra no modo teste
   */
  getTestModeStartMessage(client: TempClient): string {
    return `✅ *Modo teste ATIVADO!*

Agora você está conversando com *${client.agentName}*.

Finja ser um cliente e teste à vontade!

---
📝 Lembre-se: digite *#sair* para encerrar o teste
---`;
  }

  /**
   * Gera mensagem quando sai do modo teste
   */
  getTestModeExitMessage(client: TempClient): string {
    return `✅ *Modo teste ENCERRADO!*

Você está de volta comigo, o assistente do AgenteZap.

E aí, o que achou de *${client.agentName}*? 🤔

• 👍 *Gostou?* Quer fazer algum ajuste?
• 🔧 *Precisa calibrar?* Me conta o que quer mudar
• 🚀 *Perfeito?* Podemos ativar de verdade!

O que deseja fazer agora?`;
  }

  /**
   * Constrói o prompt do agente baseado nas informações coletadas
   */
  buildAgentPrompt(client: TempClient): string {
    const businessType = BUSINESS_TYPES[client.businessType as keyof typeof BUSINESS_TYPES] || BUSINESS_TYPES.outro;
    
    // Base prompt
    let prompt = `Você é ${client.agentName}, ${client.agentRole} da ${client.businessName || 'empresa'}.

PERSONALIDADE:
- Seja amigável, profissional e prestativo
- Use emojis moderadamente para humanizar a conversa
- Responda de forma clara e objetiva
- Demonstre conhecimento sobre o negócio

FUNÇÃO PRINCIPAL:
${businessType.samplePrompt}

`;

    // Adicionar informações específicas se existirem
    if (client.agentPrompt) {
      prompt += `INFORMAÇÕES DO NEGÓCIO:
${client.agentPrompt}

`;
    }

    prompt += `REGRAS IMPORTANTES:
1. Nunca invente informações que não foram fornecidas
2. Se não souber algo, diga que vai verificar
3. Mantenha a conversa focada no objetivo
4. Seja empático com as necessidades do cliente
5. Ofereça ajuda proativamente

FORMATO DE RESPOSTA:
- Respostas curtas e diretas (máximo 3-4 parágrafos)
- Use bullet points quando listar opções
- Termine com uma pergunta ou call-to-action quando apropriado`;

    return prompt;
  }

  // =====================================================
  // FOLLOW-UP MESSAGES - Mensagens de retorno automático
  // =====================================================

  /**
   * Gera mensagem de follow-up após 10 minutos
   */
  getFollowUp10min(client: TempClient): string {
    const step = client.onboardingStep;
    
    if (step === "initial" || step === "collecting_type") {
      return `Oi! 👋 Vi que você começou a criar seu agente de IA...

Posso te ajudar a continuar? É super rápido, prometo! 

Só me contar qual é o seu tipo de negócio e a gente avança 🚀`;
    }
    
    if (step === "collecting_agent_name") {
      return `Ei! Você estava quase lá! 😊

Só falta escolher um nome pro seu agente. Que tal continuar?

Me conta: qual nome combina com sua marca?`;
    }

    if (step === "in_test") {
      return `E aí, tudo bem com o teste? 🧪

Qualquer dúvida sobre ${client.agentName} é só me chamar!

Lembre-se: digite *#sair* quando quiser encerrar.`;
    }

    return `Oi! Vi que você estava configurando seu agente...

Quer continuar de onde parou? Estou aqui pra ajudar! 🤗`;
  }

  /**
   * Gera mensagem de follow-up após 1 hora
   */
  getFollowUp1h(client: TempClient): string {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

    if (client.onboardingStep === "calibrating") {
      return `${greeting}! 😊

Vi que você testou ${client.agentName} mais cedo...

O que achou? Quer fazer algum ajuste ou está pronto pra ativar de verdade?

Com o AgenteZap, você pode ter atendimento 24/7 respondendo seus clientes automaticamente! 🚀`;
    }

    return `${greeting}! 👋

Lembrei de você porque ficou uma conversa em aberto...

Criar seu agente de IA leva menos de 5 minutos. Quer continuar?

📊 *Empresas que usam IA no WhatsApp:*
• Respondem 80% mais rápido
• Aumentam vendas em até 30%
• Nunca perdem um cliente fora do horário

Bora criar o seu? 🎯`;
  }

  /**
   * Gera mensagem de follow-up após 24 horas
   */
  getFollowUp24h(client: TempClient): string {
    if (client.isInTestMode) {
      return `Oi! 👋

Vi que ${client.agentName} está no modo teste há um tempo...

Precisa de alguma ajuda? Posso te ajudar a ajustar o agente ou ativar de verdade!

Digite *#sair* se quiser voltar a falar comigo.`;
    }

    if (client.paymentReceived) {
      return `Oi! 😊

Vi que seu pagamento foi confirmado! 🎉

Quer que eu te ajude a conectar seu WhatsApp Business agora? 

É o último passo para ${client.agentName} começar a atender seus clientes automaticamente!`;
    }

    return `Olá! 👋

Ontem você começou a criar seu agente de IA...

Sei que a rotina é corrida, mas queria te lembrar:

✨ *Ter um assistente 24/7 no WhatsApp pode:*
• Responder clientes enquanto você descansa
• Não perder nenhuma venda fora do horário
• Atender 10x mais pessoas ao mesmo tempo

Que tal dedicar 5 minutinhos agora? Eu te guio! 🚀`;
  }

  // =====================================================
  // TÉCNICAS DE VENDAS
  // =====================================================

  /**
   * Gera mensagem com gatilho de urgência
   */
  getUrgencyMessage(): string {
    return `⚡ *Oportunidade especial!*

Os primeiros 100 clientes do mês ganham:
• 7 dias de teste GRÁTIS
• Suporte prioritário
• Configuração assistida

Restam poucas vagas! Quer garantir a sua? 🎯`;
  }

  /**
   * Gera mensagem com prova social
   */
  getSocialProofMessage(): string {
    return `📊 *Empresas que já usam AgenteZap:*

• Pizzaria do João: +45% em vendas
• Loja da Maria: Responde 500 msgs/dia automaticamente
• Clínica Dr. Silva: Reduziu faltas em 60%

Quer ver esses resultados também? 🚀`;
  }

  /**
   * Gera mensagem após demonstração de interesse
   */
  getInterestFollowUp(interest: string): string {
    return `Legal que você se interessou por ${interest}! 

Posso te mostrar exatamente como funciona no seu caso.

Quer que eu faça uma demonstração personalizada agora? 🎯`;
  }

  /**
   * Gera mensagem de objeção - preço
   */
  getPriceObjectionResponse(): string {
    return `Entendo sua preocupação com investimento! 💭

Mas pensa comigo:
• Quanto custa perder 1 cliente por não responder a tempo?
• Quanto vale atender 24/7 sem contratar funcionário?
• Quantas vendas você perde fora do horário comercial?

O AgenteZap custa menos que um cafézinho por dia ☕

E ainda: você pode testar GRÁTIS antes de decidir!

Quer experimentar sem compromisso?`;
  }

  /**
   * Gera mensagem de objeção - tempo
   */
  getTimeObjectionResponse(): string {
    return `Entendo que tempo é precioso! ⏰

Por isso mesmo o AgenteZap te ajuda:
• Configurar leva 5 minutos
• Depois, VOCÊ economiza horas todo dia
• O agente responde enquanto você foca no que importa

Imagina: nunca mais perder cliente porque estava ocupado!

Vamos fazer assim: me dá 5 minutinhos agora e eu configuro tudo com você? 🚀`;
  }

  /**
   * Gera prompt para o agente de vendas principal
   */
  getSalesAgentPrompt(): string {
    return `Você é o assistente de vendas do AgenteZap - uma plataforma que permite criar agentes de IA para WhatsApp.

SEU OBJETIVO:
1. Coletar informações do negócio do cliente
2. Configurar um agente personalizado
3. Oferecer um teste gratuito
4. Converter em venda após o teste

TÉCNICAS DE VENDAS (use naturalmente):
- SPIN Selling: Faça perguntas sobre Situação, Problema, Implicação e Necessidade
- Gatilhos mentais: Escassez, prova social, autoridade
- Objeções: Tenha respostas prontas para preço, tempo, dúvidas

FLUXO DE CONVERSA:
1. Boas-vindas amigáveis
2. Descobrir tipo de negócio
3. Coletar nome do agente
4. Definir função/papel
5. Coletar informações específicas
6. Oferecer teste
7. Acompanhar experiência
8. Converter em pagamento

PERSONALIDADE:
- Amigável mas profissional
- Consultivo (ajuda a resolver problemas)
- Empático (entende dores do empreendedor)
- Persuasivo mas não agressivo

REGRAS:
- Nunca pressione demais
- Sempre ofereça valor primeiro
- Use histórias de sucesso
- Quebre objeções com empatia
- Crie urgência sem ser falso`;
  }

  // =====================================================
  // MENSAGENS DE PAGAMENTO
  // =====================================================

  /**
   * Gera mensagem de oferecimento de pagamento
   */
  getPaymentOfferMessage(client: TempClient): string {
    return `🎉 *${client.agentName} está incrível!*

Agora que você viu como funciona, que tal ativar de verdade?

💳 *Planos disponíveis:*

🥇 *Starter* - R$ 97/mês
• 1.000 mensagens/mês
• Suporte por email

🥈 *Pro* - R$ 197/mês ⭐ MAIS POPULAR
• 5.000 mensagens/mês
• Suporte prioritário
• Múltiplos agentes

🥉 *Business* - R$ 497/mês
• Mensagens ilimitadas
• Suporte 24/7
• API personalizada

👉 Qual plano combina mais com seu negócio?`;
  }

  /**
   * Gera mensagem de PIX gerado
   */
  getPixGeneratedMessage(pixCode: string, valor: number): string {
    return `✅ *PIX Gerado com sucesso!*

💰 Valor: R$ ${valor.toFixed(2)}

📱 *Copie o código abaixo:*
\`\`\`
${pixCode}
\`\`\`

Ou pague escaneando o QR Code acima!

⏱️ *O pagamento é confirmado automaticamente em segundos!*

Assim que cair, vou te ajudar a conectar seu WhatsApp Business 🚀`;
  }

  /**
   * Gera mensagem de pagamento confirmado
   */
  getPaymentConfirmedMessage(client: TempClient): string {
    return `🎉 *PAGAMENTO CONFIRMADO!*

Parabéns! ${client.agentName} agora é oficialmente seu! 🤖

Próximo passo: *Conectar seu WhatsApp Business*

Vou te enviar um QR Code para você escanear com o WhatsApp que será usado pelo agente.

⚠️ *IMPORTANTE:*
• Use um número exclusivo para o agente
• Pode ser WhatsApp Business
• O celular precisa ficar conectado à internet

Pronto para conectar? Me confirma que envio o QR Code! 📱`;
  }
}

export const promptBuilder = new PromptBuilder();
export default promptBuilder;
