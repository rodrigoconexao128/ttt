/**
 * SalesFlowHandler - Handler do Novo Fluxo de Vendas
 * 
 * Responsável por:
 * - Processar mensagens de clientes em potencial (sem conta)
 * - Gerenciar fluxo de onboarding
 * - Controlar modo teste
 * - Integrar com follow-up engine
 * - Converter cliente após pagamento
 */

import { tempClientService, type OnboardingStep } from "./tempClientService";
import { promptBuilder, BUSINESS_TYPES } from "./promptBuilder";
import { followUpEngine } from "./followUpEngine";
import { getMistralClient } from "./mistralClient";
import type { TempClient } from "@shared/schema";

// Patterns para identificar tipos de negócio
const BUSINESS_TYPE_PATTERNS: Record<string, RegExp[]> = {
  restaurante: [/restaurante/i, /delivery/i, /comida/i, /lanchonete/i, /pizzaria/i, /hamburgueria/i, /food/i],
  loja: [/loja/i, /ecommerce/i, /e-commerce/i, /produtos/i, /roupas/i, /acessórios/i, /vend/i],
  servicos: [/serviço/i, /consultoria/i, /freelancer/i, /agência/i, /escritório/i, /projeto/i],
  saude: [/saúde/i, /saude/i, /clínica/i, /clinica/i, /médico/i, /medico/i, /dentista/i, /psicólogo/i],
  educacao: [/curso/i, /escola/i, /treinamento/i, /aula/i, /professor/i, /ensino/i],
  imobiliaria: [/imóvel/i, /imovel/i, /casa/i, /apartamento/i, /aluguel/i, /corretor/i],
};

// Patterns para detectar agendamento
const SCHEDULING_PATTERNS = [
  { pattern: /amanhã/i, addDays: 1 },
  { pattern: /depois de amanhã/i, addDays: 2 },
  { pattern: /segunda/i, weekday: 1 },
  { pattern: /terça/i, weekday: 2 },
  { pattern: /quarta/i, weekday: 3 },
  { pattern: /quinta/i, weekday: 4 },
  { pattern: /sexta/i, weekday: 5 },
  { pattern: /sábado/i, weekday: 6 },
  { pattern: /domingo/i, weekday: 0 },
  { pattern: /(\d{1,2})\s*(?:hora|h)/i, extractHour: true },
  { pattern: /às?\s*(\d{1,2})/i, extractHour: true },
];

interface ProcessResult {
  response: string;
  shouldNotifyOwner?: boolean;
  mediaActions?: any[];
}

class SalesFlowHandler {
  /**
   * Processa uma mensagem de um cliente (novo ou existente)
   */
  async processMessage(
    phoneNumber: string,
    messageText: string,
    mediaType?: string,
    mediaUrl?: string
  ): Promise<ProcessResult> {
    // Buscar ou criar cliente temporário
    const client = await tempClientService.getOrCreateByPhone(phoneNumber);
    
    console.log(`[SalesFlow] Cliente: ${phoneNumber}, Step: ${client.onboardingStep}, Teste: ${client.isInTestMode}`);

    // Salvar mensagem no histórico
    await tempClientService.addToHistory(client.id, "user", messageText);

    // Cancelar follow-ups pendentes (cliente respondeu)
    await followUpEngine.cancelClientFollowUps(client.id);

    // Verificar comando especial #sair
    if (messageText.toLowerCase().trim() === "#sair") {
      return await this.handleExitTestMode(client);
    }

    // Verificar se está em modo teste
    if (client.isInTestMode) {
      return await this.handleTestMode(client, messageText, mediaType, mediaUrl);
    }

    // Processar baseado no step atual
    switch (client.onboardingStep as OnboardingStep) {
      case "initial":
        return await this.handleInitialStep(client, messageText);
      
      case "collecting_type":
        return await this.handleCollectingType(client, messageText);
      
      case "collecting_agent_name":
        return await this.handleCollectingAgentName(client, messageText);
      
      case "collecting_role":
        return await this.handleCollectingRole(client, messageText);
      
      case "collecting_info":
        return await this.handleCollectingInfo(client, messageText);
      
      case "ready_to_test":
        return await this.handleReadyToTest(client, messageText);
      
      case "calibrating":
        return await this.handleCalibrating(client, messageText);
      
      case "awaiting_payment":
        return await this.handleAwaitingPayment(client, messageText, mediaType, mediaUrl);
      
      default:
        return await this.handleInitialStep(client, messageText);
    }
  }

  // =====================================================
  // HANDLERS DE CADA ETAPA
  // =====================================================

  /**
   * Etapa inicial - Primeira mensagem
   */
  private async handleInitialStep(client: TempClient, message: string): Promise<ProcessResult> {
    // Detectar se já mandou tipo de negócio na primeira mensagem
    const detectedType = this.detectBusinessType(message);
    
    if (detectedType) {
      // Cliente já informou o tipo, avançar
      await tempClientService.updateBusinessData(client.id, { businessType: detectedType });
      await tempClientService.updateOnboardingStep(client.id, "collecting_agent_name");
      
      const response = promptBuilder.getAgentNameQuestion(detectedType);
      await this.saveAssistantResponse(client.id, response);
      await this.scheduleFollowUp(client);
      
      return { response };
    }

    // Mandar boas-vindas com opções
    await tempClientService.updateOnboardingStep(client.id, "collecting_type");
    const response = promptBuilder.getWelcomeMessage();
    await this.saveAssistantResponse(client.id, response);
    await this.scheduleFollowUp(client);
    
    return { response };
  }

  /**
   * Coletando tipo de negócio
   */
  private async handleCollectingType(client: TempClient, message: string): Promise<ProcessResult> {
    const detectedType = this.detectBusinessType(message);
    
    if (!detectedType) {
      // Não conseguiu detectar, pedir mais claramente
      const response = `Hmm, não consegui identificar bem o tipo do seu negócio 🤔

Pode me dizer de forma mais clara? Por exemplo:
• "Sou dono de uma pizzaria"
• "Tenho uma loja de roupas"
• "Trabalho com consultoria"

Qual é o seu?`;
      await this.saveAssistantResponse(client.id, response);
      return { response };
    }

    // Detectou o tipo, avançar
    await tempClientService.updateBusinessData(client.id, { businessType: detectedType });
    await tempClientService.updateOnboardingStep(client.id, "collecting_agent_name");
    
    const response = promptBuilder.getAgentNameQuestion(detectedType);
    await this.saveAssistantResponse(client.id, response);
    await this.scheduleFollowUp(client);
    
    return { response };
  }

  /**
   * Coletando nome do agente
   */
  private async handleCollectingAgentName(client: TempClient, message: string): Promise<ProcessResult> {
    // Extrair nome (primeira palavra significativa ou nome próprio)
    const name = this.extractAgentName(message);
    
    if (!name || name.length < 2) {
      const response = `Ops, não consegui identificar o nome 😅

Me diz só o nome que você quer dar pro seu agente. Por exemplo:
• Luna
• Max
• Sofia

Qual será?`;
      await this.saveAssistantResponse(client.id, response);
      return { response };
    }

    await tempClientService.updateBusinessData(client.id, { agentName: name });
    await tempClientService.updateOnboardingStep(client.id, "collecting_role");
    
    const response = promptBuilder.getAgentRoleQuestion(name, client.businessType || "outro");
    await this.saveAssistantResponse(client.id, response);
    await this.scheduleFollowUp(client);
    
    return { response };
  }

  /**
   * Coletando papel/função do agente
   */
  private async handleCollectingRole(client: TempClient, message: string): Promise<ProcessResult> {
    const role = this.extractRole(message, client.businessType || "outro");
    
    await tempClientService.updateBusinessData(client.id, { agentRole: role });
    await tempClientService.updateOnboardingStep(client.id, "collecting_info");
    
    const response = promptBuilder.getBusinessInfoQuestion(client.agentName || "seu agente", client.businessName || undefined);
    await this.saveAssistantResponse(client.id, response);
    await this.scheduleFollowUp(client);
    
    return { response };
  }

  /**
   * Coletando informações do negócio
   */
  private async handleCollectingInfo(client: TempClient, message: string): Promise<ProcessResult> {
    // Salvar as informações no prompt
    const currentPrompt = client.agentPrompt || "";
    const updatedPrompt = currentPrompt + "\n" + message;
    
    await tempClientService.updateBusinessData(client.id, { agentPrompt: updatedPrompt });
    
    // Verificar se tem informações suficientes (pelo menos 50 caracteres)
    if (updatedPrompt.length < 50) {
      const response = `Legal! Anotei isso 📝

Quer adicionar mais alguma informação? Quanto mais detalhes, melhor ${client.agentName} vai atender!

Ou se já está bom, me diz "pronto" que a gente avança! 🚀`;
      await this.saveAssistantResponse(client.id, response);
      return { response };
    }

    // Verificar se cliente disse que está pronto
    if (this.checkIfReady(message)) {
      return await this.advanceToReadyToTest(client);
    }

    const response = `Perfeito! Anotei tudo 📝

Quer adicionar mais alguma coisa ou está pronto pra gente criar ${client.agentName}?

Responda "pronto" quando quiser avançar! 🚀`;
    await this.saveAssistantResponse(client.id, response);
    await this.scheduleFollowUp(client);
    
    return { response };
  }

  /**
   * Avança para etapa de pronto para testar
   */
  private async advanceToReadyToTest(client: TempClient): Promise<ProcessResult> {
    await tempClientService.updateOnboardingStep(client.id, "ready_to_test");
    
    // Atualizar client com dados atuais
    const updatedClient = await tempClientService.getById(client.id);
    if (!updatedClient) {
      return { response: "Erro interno. Por favor, tente novamente." };
    }
    
    const response = promptBuilder.getReadyToTestMessage(updatedClient);
    await this.saveAssistantResponse(client.id, response);
    
    return { response };
  }

  /**
   * Pronto para testar - aguardando confirmação
   */
  private async handleReadyToTest(client: TempClient, message: string): Promise<ProcessResult> {
    const positivePatterns = [/sim/i, /vamos/i, /bora/i, /ok/i, /pode/i, /quero/i, /start/i, /começar/i, /testar/i];
    const isPositive = positivePatterns.some(p => p.test(message));

    if (isPositive) {
      // Iniciar modo teste
      await tempClientService.startTestMode(client.id);
      
      const updatedClient = await tempClientService.getById(client.id);
      if (!updatedClient) {
        return { response: "Erro interno." };
      }
      
      const response = promptBuilder.getTestModeStartMessage(updatedClient);
      await this.saveAssistantResponse(client.id, response);
      
      return { response };
    }

    // Cliente quer ajustar algo
    const response = `Sem problemas! O que você gostaria de ajustar?

• 📝 Adicionar mais informações sobre o negócio
• 🔧 Mudar o nome ou função do agente
• ❓ Tirar alguma dúvida

Me conta!`;
    await this.saveAssistantResponse(client.id, response);
    
    return { response };
  }

  /**
   * Modo teste - cliente conversa com seu agente configurado
   */
  private async handleTestMode(
    client: TempClient,
    message: string,
    mediaType?: string,
    mediaUrl?: string
  ): Promise<ProcessResult> {
    // Incrementar contador de mensagens no teste
    await tempClientService.incrementTestMessages(client.id);

    // Construir prompt do agente
    const agentPrompt = promptBuilder.buildAgentPrompt(client);

    // Buscar histórico de mensagens do teste (últimas 20)
    const history = (client.conversationHistory as any[]) || [];
    const testHistory = history.slice(-20);

    // Gerar resposta com Mistral
    try {
      const mistral = await getMistralClient();
      
      // Montar mensagens para o chat
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: agentPrompt }
      ];
      
      // Adicionar histórico
      for (const msg of testHistory) {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content
        });
      }
      
      // Adicionar mensagem atual
      messages.push({ role: "user", content: message });
      
      const chatResponse = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages,
        temperature: 0.7,
        maxTokens: 500,
      });
      
      const response = (chatResponse.choices?.[0]?.message?.content as string) || 
        "Desculpe, não consegui processar sua mensagem.";
      
      await this.saveAssistantResponse(client.id, response);

      return { response };
    } catch (error) {
      console.error("[SalesFlow] Erro ao gerar resposta:", error);
      const response = "Desculpe, ocorreu um erro. Tente novamente.";
      await this.saveAssistantResponse(client.id, response);
      return { response };
    }
  }

  /**
   * Sair do modo teste
   */
  private async handleExitTestMode(client: TempClient): Promise<ProcessResult> {
    if (!client.isInTestMode) {
      const response = `Você não está no modo teste 🤔

Como posso te ajudar?`;
      return { response };
    }

    await tempClientService.exitTestMode(client.id);
    
    const updatedClient = await tempClientService.getById(client.id);
    if (!updatedClient) {
      return { response: "Erro interno." };
    }

    const response = promptBuilder.getTestModeExitMessage(updatedClient);
    await this.saveAssistantResponse(client.id, response);

    return { response };
  }

  /**
   * Calibrando após sair do teste
   */
  private async handleCalibrating(client: TempClient, message: string): Promise<ProcessResult> {
    const satisfiedPatterns = [/bom/i, /ótimo/i, /perfeito/i, /gostei/i, /legal/i, /aprovado/i, /ok/i];
    const needsAdjustPatterns = [/ajust/i, /mudar/i, /alterar/i, /trocar/i, /diferente/i];
    const testAgainPatterns = [/testar/i, /test/i, /novamente/i, /de novo/i];

    if (testAgainPatterns.some(p => p.test(message))) {
      // Testar novamente
      await tempClientService.startTestMode(client.id);
      const response = promptBuilder.getTestModeStartMessage(client);
      return { response };
    }

    if (needsAdjustPatterns.some(p => p.test(message))) {
      // Voltar para coletar mais info
      await tempClientService.updateOnboardingStep(client.id, "collecting_info");
      const response = `Sem problemas! Vamos ajustar 🔧

Me conta: o que você gostaria de mudar ou adicionar em ${client.agentName}?`;
      await this.saveAssistantResponse(client.id, response);
      return { response };
    }

    if (satisfiedPatterns.some(p => p.test(message))) {
      // Cliente satisfeito - oferecer ativação
      await tempClientService.updateOnboardingStep(client.id, "awaiting_payment");
      const response = promptBuilder.getPaymentOfferMessage(client);
      await this.saveAssistantResponse(client.id, response);
      return { response };
    }

    // Resposta genérica
    const response = `E aí, o que achou de ${client.agentName}? 🤔

Me conta:
• 👍 Ficou bom? Podemos ativar!
• 🔧 Quer ajustar algo?
• 🧪 Quer testar mais?`;
    await this.saveAssistantResponse(client.id, response);
    return { response };
  }

  /**
   * Aguardando pagamento
   */
  private async handleAwaitingPayment(
    client: TempClient,
    message: string,
    mediaType?: string,
    mediaUrl?: string
  ): Promise<ProcessResult> {
    // Verificar se é comprovante de pagamento
    if (mediaType === "image") {
      const response = `📸 Recebi sua imagem!

Estou verificando o comprovante... Por favor, aguarde alguns instantes.

⏳ Assim que confirmarmos o pagamento, você receberá a liberação automaticamente!`;
      await this.saveAssistantResponse(client.id, response);
      
      return { 
        response,
        shouldNotifyOwner: true,
      };
    }

    // Detectar interesse em plano específico
    const starterPattern = /starter|básico|97/i;
    const proPattern = /pro|197|profissional/i;
    const businessPattern = /business|497|empresarial/i;

    let planName = "";
    let planValue = 0;

    if (starterPattern.test(message)) {
      planName = "Starter";
      planValue = 97;
    } else if (proPattern.test(message)) {
      planName = "Pro";
      planValue = 197;
    } else if (businessPattern.test(message)) {
      planName = "Business";
      planValue = 497;
    }

    if (planName) {
      // Cliente escolheu um plano - gerar PIX
      const pixCode = this.generateMockPixCode();
      const response = promptBuilder.getPixGeneratedMessage(pixCode, planValue);
      await this.saveAssistantResponse(client.id, response);
      
      return { response };
    }

    // Verificar objeções
    if (/caro|preço|valor|dinheiro/i.test(message)) {
      const response = promptBuilder.getPriceObjectionResponse();
      await this.saveAssistantResponse(client.id, response);
      return { response };
    }

    if (/tempo|ocupado|agora não|depois/i.test(message)) {
      // Tentar agendar
      const scheduledDate = this.detectScheduledDate(message);
      if (scheduledDate) {
        await followUpEngine.scheduleContextualFollowUp(
          client,
          scheduledDate,
          "você pediu para voltarmos a conversar"
        );
        
        const response = `Perfeito! 📅 Agendei para voltarmos a conversar.

Até lá! Se precisar antes, é só me chamar 👋`;
        await this.saveAssistantResponse(client.id, response);
        return { response };
      }

      const response = promptBuilder.getTimeObjectionResponse();
      await this.saveAssistantResponse(client.id, response);
      return { response };
    }

    // Resposta padrão
    const response = `Qual plano você prefere? 🤔

🥇 *Starter* - R$ 97/mês (ideal para começar)
🥈 *Pro* - R$ 197/mês (mais popular!)
🥉 *Business* - R$ 497/mês (sem limites)

Só me dizer que gero o PIX na hora! 💳`;
    await this.saveAssistantResponse(client.id, response);
    return { response };
  }

  // =====================================================
  // MÉTODOS AUXILIARES
  // =====================================================

  /**
   * Detecta tipo de negócio a partir da mensagem
   */
  private detectBusinessType(message: string): string | null {
    for (const [type, patterns] of Object.entries(BUSINESS_TYPE_PATTERNS)) {
      if (patterns.some(p => p.test(message))) {
        return type;
      }
    }

    // Verificar números/emoji das opções
    if (/1|🍕/i.test(message)) return "restaurante";
    if (/2|🛍️/i.test(message)) return "loja";
    if (/3|💼/i.test(message)) return "servicos";
    if (/4|🏥/i.test(message)) return "saude";
    if (/5|📚/i.test(message)) return "educacao";
    if (/6|🏠/i.test(message)) return "imobiliaria";
    if (/7|🔧/i.test(message)) return "outro";

    return null;
  }

  /**
   * Extrai nome do agente
   */
  private extractAgentName(message: string): string {
    // Limpar a mensagem
    const cleaned = message
      .replace(/[^\w\sáéíóúãõâêîôûàèìòùç]/gi, "")
      .trim();

    // Pegar primeira palavra com inicial maiúscula ou primeira palavra significativa
    const words = cleaned.split(/\s+/);
    
    for (const word of words) {
      // Ignorar palavras muito curtas ou comuns
      if (word.length < 2) continue;
      if (/^(o|a|um|uma|pode|quero|vai|ser|meu|minha)$/i.test(word)) continue;
      
      // Capitalizar primeira letra
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }

    return words[0] || "";
  }

  /**
   * Extrai papel/função do agente
   */
  private extractRole(message: string, businessType: string): string {
    const rolePatterns = [
      /atendente/i,
      /vendedor/i,
      /consultor/i,
      /assistente/i,
      /secretária/i,
      /recepcionista/i,
    ];

    for (const pattern of rolePatterns) {
      const match = message.match(pattern);
      if (match) {
        return match[0].toLowerCase();
      }
    }

    // Usar default baseado no tipo de negócio
    const type = BUSINESS_TYPES[businessType as keyof typeof BUSINESS_TYPES] || BUSINESS_TYPES.outro;
    return type.defaultRole;
  }

  /**
   * Verifica se cliente disse que está pronto
   */
  private checkIfReady(message: string): boolean {
    const readyPatterns = [/pronto/i, /ok/i, /pode/i, /vamos/i, /bora/i, /isso/i, /feito/i, /terminei/i];
    return readyPatterns.some(p => p.test(message));
  }

  /**
   * Detecta data agendada na mensagem
   */
  private detectScheduledDate(message: string): Date | null {
    const now = new Date();
    
    // Verificar padrões de agendamento
    for (const pattern of SCHEDULING_PATTERNS) {
      if (pattern.pattern.test(message)) {
        const scheduled = new Date(now);
        
        if (pattern.addDays) {
          scheduled.setDate(scheduled.getDate() + pattern.addDays);
          scheduled.setHours(10, 0, 0, 0); // Default: 10h
          return scheduled;
        }
        
        if (pattern.weekday !== undefined) {
          const currentDay = now.getDay();
          let daysToAdd = pattern.weekday - currentDay;
          if (daysToAdd <= 0) daysToAdd += 7; // Próxima semana
          scheduled.setDate(scheduled.getDate() + daysToAdd);
          scheduled.setHours(10, 0, 0, 0);
          return scheduled;
        }
        
        if (pattern.extractHour) {
          const match = message.match(pattern.pattern);
          if (match && match[1]) {
            const hour = parseInt(match[1]);
            if (hour >= 0 && hour <= 23) {
              if (hour <= now.getHours()) {
                // Se a hora já passou, agendar para amanhã
                scheduled.setDate(scheduled.getDate() + 1);
              }
              scheduled.setHours(hour, 0, 0, 0);
              return scheduled;
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Gera código PIX mock (para demo)
   */
  private generateMockPixCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 32; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Salva resposta do assistente no histórico
   */
  private async saveAssistantResponse(clientId: string, response: string): Promise<void> {
    await tempClientService.addToHistory(clientId, "assistant", response);
  }

  /**
   * Agenda follow-up inicial
   */
  private async scheduleFollowUp(client: TempClient): Promise<void> {
    // Atualizar cliente para buscar dados atuais
    const updatedClient = await tempClientService.getById(client.id);
    if (updatedClient) {
      await followUpEngine.scheduleInitialFollowUp(updatedClient);
    }
  }
}

export const salesFlowHandler = new SalesFlowHandler();
export default salesFlowHandler;
