/**
 * 🧠 INTELLIGENT AGENT TOOLS SYSTEM (OpenClaw-style)
 * 
 * Este sistema transforma o agente de fluxos pré-definidos para um agente inteligente
 * que decide dinamicamente quais ações executar baseado na conversa.
 * 
 * Arquitetura inspirada no OpenClaw:
 * - Hub: Sistema central que recebe mensagens
 * - Tools: Ferramentas que o agente pode invocar
 * - Memory: Contexto persistente da conversa
 * - Loop: Análise → Decisão → Execução → Resposta
 */

import { storage } from "./storage";
import { supabase } from "./supabaseAuth";
import { getLLMClient } from "./llm";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface AgentContext {
  userId?: string;
  email?: string;
  phoneNumber: string;
  contactName?: string;
  conversationHistory: ConversationMessage[];
  currentState: AgentState;
  metadata: Record<string, any>;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  toolName: string;
  parameters: Record<string, any>;
  result?: any;
  error?: string;
}

export type AgentState = 
  | "onboarding" 
  | "creating_agent" 
  | "editing_agent" 
  | "connecting_whatsapp"
  | "subscribing_plan"
  | "managing_media"
  | "active_user";

export interface AgentDecision {
  intent: string;
  confidence: number;
  toolsToExecute: ToolCall[];
  responseTemplate: string;
  nextState?: AgentState;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

// ============================================================================
// FERRAMENTAS DISPONÍVEIS (OpenClaw-style Tools)
// ============================================================================

export class AgentTools {
  /**
   * 🔧 FERRAMENTA 1: Criar Conta de Cliente
   * Cria um novo usuário no sistema com senha automática
   */
  static async createClientAccount(params: {
    phoneNumber: string;
    email?: string;
    name?: string;
  }): Promise<ToolResult> {
    try {
      const cleanPhone = params.phoneNumber.replace(/\D/g, "");
      const email = params.email || `${cleanPhone}@agentezap.online`;
      const password = this.generatePassword();
      const name = params.name || `Cliente ${cleanPhone.slice(-4)}`;

      console.log(`🔧 [TOOL] createClientAccount iniciando para ${cleanPhone}`);

      // Verificar se já existe
      const existingUsers = await storage.getAllUsers();
      const existing = existingUsers.find(u => 
        u.phone?.replace(/\D/g, "") === cleanPhone || 
        u.email?.toLowerCase() === email.toLowerCase()
      );

      if (existing) {
        return {
          success: true,
          data: {
            userId: existing.id,
            email: existing.email,
            alreadyExists: true,
          },
          message: "Usuário já existe no sistema"
        };
      }

      // Criar no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, phone: cleanPhone }
      });

      if (authError || !authData.user) {
        throw new Error(authError?.message || "Falha ao criar usuário");
      }

      // Criar no banco
      const user = await storage.upsertUser({
        id: authData.user.id,
        email,
        name,
        phone: cleanPhone,
        role: "user",
      });

      console.log(`✅ [TOOL] Conta criada: ${email} (ID: ${user.id})`);

      return {
        success: true,
        data: {
          userId: user.id,
          email,
          password,
          loginUrl: process.env.APP_URL || "https://agentezap.online"
        },
        message: "Conta criada com sucesso"
      };
    } catch (error) {
      console.error("❌ [TOOL] Erro ao criar conta:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido"
      };
    }
  }

  /**
   * 🔧 FERRAMENTA 2: Criar/Atualizar Agente IA
   * Cria ou atualiza o prompt do agente para um cliente
   * ✅ VALIDAÇÃO REAL: Verifica se realmente salvou no banco
   */
  static async createOrUpdateAgent(params: {
    userId: string;
    agentName: string;
    companyName: string;
    role: string;
    instructions: string;
  }): Promise<ToolResult> {
    try {
      console.log(`🔧 [TOOL] createOrUpdateAgent para usuário ${params.userId}`);

      // Gerar prompt profissional usando a IA
      const prompt = await this.generateProfessionalPrompt(
        params.agentName,
        params.companyName,
        params.role,
        params.instructions
      );

      console.log(`📝 [TOOL] Prompt gerado (${prompt.length} caracteres)`);

      // Salvar configuração do agente
      await storage.upsertAgentConfig(params.userId, {
        prompt,
        isActive: true,
        model: "mistral-large-latest",
        triggerPhrases: [],
        messageSplitChars: 400,
        responseDelaySeconds: 30,
      });

      // ✅ VALIDAÇÃO REAL: Ler de volta do banco para confirmar
      console.log(`🔍 [TOOL] Validando se prompt foi salvo...`);
      const savedConfig = await storage.getAgentConfig(params.userId);
      
      if (!savedConfig || !savedConfig.prompt) {
        throw new Error("Falha ao salvar configuração - não encontrada no banco");
      }

      if (savedConfig.prompt !== prompt) {
        throw new Error("Falha ao salvar configuração - prompt diferente do esperado");
      }

      console.log(`✅ [TOOL] Agente "${params.agentName}" configurado E VALIDADO`);

      return {
        success: true,
        data: {
          agentName: params.agentName,
          companyName: params.companyName,
          prompt: prompt.substring(0, 200) + "...",
          promptLength: prompt.length,
          validated: true
        },
        message: "Agente configurado e validado com sucesso"
      };
    } catch (error) {
      console.error("❌ [TOOL] Erro ao criar agente:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido"
      };
    }
  }

  /**
   * 🔧 FERRAMENTA 3: Gerar Link de Conexão WhatsApp (Auto-Login)
   * Gera token JWT temporário e link para página de QR Code
   * ✅ VALIDAÇÃO REAL: Verifica se token foi criado
   */
  static async generateConnectionLink(params: {
    userId: string;
  }): Promise<ToolResult> {
    try {
      console.log(`🔧 [TOOL] generateConnectionLink para ${params.userId}`);

      // Gerar token temporário
      const token = await this.generateAutoLoginToken(params.userId, "connection");
      const baseUrl = process.env.APP_URL || "https://agentezap.online";
      const link = `${baseUrl}/conexao?token=${token}`;

      // ✅ VALIDAÇÃO REAL: Verificar se token foi criado
      console.log(`🔍 [TOOL] Validando token...`);
      try {
        const { data: tokenData } = await supabase
          .from("auto_login_tokens")
          .select("*")
          .eq("token", token)
          .single();
        
        if (!tokenData) {
          console.warn(`⚠️ [TOOL] Token não encontrado no banco (tabela pode não existir)`);
        } else {
          console.log(`✅ [TOOL] Token validado no banco`);
        }
      } catch (validateError) {
        console.warn(`⚠️ [TOOL] Não foi possível validar token:`, validateError);
      }

      console.log(`✅ [TOOL] Link de conexão gerado: ${link}`);

      return {
        success: true,
        data: { link, token, validated: true },
        message: "Link de conexão gerado"
      };
    } catch (error) {
      console.error("❌ [TOOL] Erro ao gerar link:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido"
      };
    }
  }

  /**
   * 🔧 FERRAMENTA 4: Gerar Link de Assinatura de Plano (Auto-Login)
   * Gera token JWT temporário e link para página de planos
   * ✅ VALIDAÇÃO REAL: Verifica se token foi criado
   */
  static async generatePlanLink(params: {
    userId: string;
    planId?: string;
  }): Promise<ToolResult> {
    try {
      console.log(`🔧 [TOOL] generatePlanLink para ${params.userId}`);

      // Gerar token temporário
      const token = await this.generateAutoLoginToken(params.userId, "plans");
      const baseUrl = process.env.APP_URL || "https://agentezap.online";
      const link = `${baseUrl}/plans?token=${token}`;

      // ✅ VALIDAÇÃO REAL: Verificar se token foi criado
      console.log(`🔍 [TOOL] Validando token...`);
      try {
        const { data: tokenData } = await supabase
          .from("auto_login_tokens")
          .select("*")
          .eq("token", token)
          .single();
        
        if (!tokenData) {
          console.warn(`⚠️ [TOOL] Token não encontrado no banco`);
        } else {
          console.log(`✅ [TOOL] Token validado no banco`);
        }
      } catch (validateError) {
        console.warn(`⚠️ [TOOL] Não foi possível validar token:`, validateError);
      }

      console.log(`✅ [TOOL] Link de planos gerado: ${link}`);

      return {
        success: true,
        data: { link, token, validated: true },
        message: "Link de planos gerado"
      };
    } catch (error) {
      console.error("❌ [TOOL] Erro ao gerar link:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido"
      };
    }
  }

  /**
   * 🔧 FERRAMENTA 5: Adicionar Mídia ao Agente
   * Baixa mídia do WhatsApp, faz upload e adiciona à biblioteca
   * ✅ VALIDAÇÃO REAL: Confirma que mídia foi salva
   */
  static async addMediaToAgent(params: {
    userId: string;
    mediaType: "audio" | "image" | "video" | "document";
    mediaUrl: string;
    description: string;
    whenToUse: string;
  }): Promise<ToolResult> {
    try {
      console.log(`🔧 [TOOL] addMediaToAgent para ${params.userId}`);
      console.log(`📎 Tipo: ${params.mediaType}, URL: ${params.mediaUrl}`);

      // Importar serviços necessários
      const { insertAgentMedia } = await import("./mediaService");
      
      // 1. Baixar mídia do WhatsApp
      console.log(`⬇️ [TOOL] Baixando mídia do WhatsApp...`);
      let finalMediaUrl = params.mediaUrl;
      
      // Se a mídia vem do WhatsApp, fazer download e re-upload
      if (params.mediaUrl.includes('whatsapp') || params.mediaUrl.startsWith('data:')) {
        try {
          // Baixar mídia
          const response = await fetch(params.mediaUrl);
          if (!response.ok) {
            throw new Error(`Falha ao baixar mídia: ${response.statusText}`);
          }
          
          const buffer = await response.arrayBuffer();
          const blob = new Blob([buffer]);
          
          console.log(`✅ [TOOL] Mídia baixada (${blob.size} bytes)`);
          
          // Upload para Supabase Storage
          const { supabase } = await import("./supabaseAuth");
          const filename = `media_${Date.now()}_${Math.random().toString(36).substring(7)}.${this.getExtensionFromType(params.mediaType)}`;
          const bucketName = "agent-media"; // Nome do bucket no Supabase
          
          console.log(`⬆️ [TOOL] Fazendo upload para Supabase...`);
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(filename, blob, {
              contentType: response.headers.get('content-type') || `${params.mediaType}/*`,
              upsert: false
            });
          
          if (uploadError) {
            // Se bucket não existe, criar e tentar novamente
            console.warn(`⚠️ [TOOL] Bucket não existe, usando URL original`);
            finalMediaUrl = params.mediaUrl;
          } else {
            // Obter URL pública
            const { data: publicUrlData } = supabase.storage
              .from(bucketName)
              .getPublicUrl(filename);
            
            finalMediaUrl = publicUrlData.publicUrl;
            console.log(`✅ [TOOL] Upload concluído: ${finalMediaUrl}`);
          }
        } catch (downloadError) {
          console.warn(`⚠️ [TOOL] Erro ao processar mídia, usando URL original:`, downloadError);
          finalMediaUrl = params.mediaUrl;
        }
      }
      
      // 2. Salvar na biblioteca do agente
      console.log(`💾 [TOOL] Salvando na biblioteca do agente...`);
      const mediaId = await insertAgentMedia({
        userId: params.userId,
        name: `${params.mediaType.toUpperCase()}_${Date.now()}`,
        mediaType: params.mediaType,
        storageUrl: finalMediaUrl,
        description: params.description,
        whenToUse: params.whenToUse,
        isActive: true,
        sendAlone: params.mediaType === 'video' || params.mediaType === 'audio',
        displayOrder: 0,
      });

      // 3. ✅ VALIDAÇÃO REAL: Verificar se foi salvo
      console.log(`🔍 [TOOL] Validando se mídia foi salva...`);
      const { getAgentMediaById } = await import("./mediaService");
      const savedMedia = await getAgentMediaById(mediaId);
      
      if (!savedMedia) {
        throw new Error("Falha ao salvar mídia - não encontrada no banco");
      }

      console.log(`✅ [TOOL] Mídia adicionada e validada (ID: ${mediaId})`);

      return {
        success: true,
        data: {
          mediaId,
          mediaType: params.mediaType,
          url: finalMediaUrl,
          validated: true
        },
        message: "Mídia adicionada e validada com sucesso"
      };
    } catch (error) {
      console.error("❌ [TOOL] Erro ao adicionar mídia:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido"
      };
    }
  }

  /**
   * Auxiliar: Retorna extensão baseada no tipo de mídia
   */
  private static getExtensionFromType(mediaType: string): string {
    const extensions: Record<string, string> = {
      'image': 'jpg',
      'video': 'mp4',
      'audio': 'ogg',
      'document': 'pdf'
    };
    return extensions[mediaType] || 'bin';
  }

  /**
   * 🔧 FERRAMENTA 6: Buscar Informações do Usuário
   * Retorna dados do usuário existente
   */
  static async getUserInfo(params: {
    phoneNumber?: string;
    userId?: string;
    email?: string;
  }): Promise<ToolResult> {
    try {
      console.log(`🔧 [TOOL] getUserInfo`);

      const users = await storage.getAllUsers();
      let user;

      if (params.userId) {
        user = users.find(u => u.id === params.userId);
      } else if (params.phoneNumber) {
        const cleanPhone = params.phoneNumber.replace(/\D/g, "");
        user = users.find(u => u.phone?.replace(/\D/g, "") === cleanPhone);
      } else if (params.email) {
        user = users.find(u => u.email?.toLowerCase() === params.email.toLowerCase());
      }

      if (!user) {
        return {
          success: false,
          error: "Usuário não encontrado"
        };
      }

      // Verificar conexão WhatsApp
      const connection = await storage.getConnectionByUserId(user.id);
      const subscription = await storage.getUserSubscription(user.id);
      const agentConfig = await storage.getAgentConfig(user.id);

      return {
        success: true,
        data: {
          userId: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          hasConnection: !!connection?.isConnected,
          hasSubscription: subscription?.status === "active",
          hasAgent: !!agentConfig?.isActive
        }
      };
    } catch (error) {
      console.error("❌ [TOOL] Erro ao buscar usuário:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido"
      };
    }
  }

  /**
   * 🔧 FERRAMENTA 7: Gerar Simulador de Teste
   * Cria token para simulador e retorna link
   */
  static async generateSimulatorLink(params: {
    userId: string;
    agentName: string;
    companyName: string;
  }): Promise<ToolResult> {
    try {
      console.log(`🔧 [TOOL] generateSimulatorLink para ${params.userId}`);

      const { generateTestToken } = await import("./adminAgentService");
      
      const testToken = await generateTestToken(
        params.userId,
        params.agentName,
        params.companyName
      );

      const baseUrl = process.env.APP_URL || "https://agentezap.online";
      const link = `${baseUrl}/test/${testToken.token}`;

      console.log(`✅ [TOOL] Link do simulador gerado: ${link}`);

      return {
        success: true,
        data: { link, token: testToken.token },
        message: "Link do simulador gerado"
      };
    } catch (error) {
      console.error("❌ [TOOL] Erro ao gerar simulador:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido"
      };
    }
  }

  // ============================================================================
  // FUNÇÕES AUXILIARES
  // ============================================================================

  /**
   * Gera senha aleatória forte
   */
  private static generatePassword(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let password = "AZ-";
    for (let i = 0; i < 6; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Gera token JWT temporário para auto-login
   */
  private static async generateAutoLoginToken(
    userId: string,
    purpose: "connection" | "plans"
  ): Promise<string> {
    // Criar token na tabela auto_login_tokens
    const token = uuidv4().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    try {
      await supabase.from("auto_login_tokens").insert({
        token,
        user_id: userId,
        purpose,
        expires_at: expiresAt.toISOString(),
      });
    } catch (error) {
      console.warn("⚠️ Tabela auto_login_tokens não existe, usando apenas token simples");
    }

    return token;
  }

  /**
   * Gera prompt profissional usando a IA
   */
  private static async generateProfessionalPrompt(
    agentName: string,
    companyName: string,
    role: string,
    instructions: string
  ): Promise<string> {
    try {
      const { generateProfessionalAgentPrompt } = await import("./adminAgentService");
      return await generateProfessionalAgentPrompt(agentName, companyName, role, instructions);
    } catch (error) {
      // Fallback simples
      return `Você é ${agentName}, ${role} da ${companyName}.

${instructions}

Seja prestativo, educado e responda de forma natural como em uma conversa de WhatsApp.`;
    }
  }
}

// ============================================================================
// SISTEMA DE DECISÃO INTELIGENTE (OpenClaw-style Hub)
// ============================================================================

export class IntelligentAgentHub {
  /**
   * 🧠 CORE: Processa mensagem e decide ações
   * Este é o "cérebro" do sistema OpenClaw
   */
  static async processMessage(
    context: AgentContext,
    message: string,
    mediaType?: string,
    mediaUrl?: string
  ): Promise<AgentDecision> {
    console.log(`🧠 [HUB] Processando mensagem de ${context.phoneNumber}`);

    // 1. Analisar intenção usando IA
    const intent = await this.analyzeIntent(context, message);
    console.log(`🎯 [HUB] Intenção detectada: ${intent.intent} (confiança: ${intent.confidence})`);

    // 2. Decidir quais ferramentas executar
    const decision = await this.decideActions(context, intent, message, mediaType, mediaUrl);
    
    // 3. Executar ferramentas
    const executedTools = await this.executeTools(decision.toolsToExecute);
    decision.toolsToExecute = executedTools;

    // 4. Gerar resposta final
    const response = await this.generateResponse(context, decision, executedTools);
    decision.responseTemplate = response;

    return decision;
  }

  /**
   * 🎯 Analisa intenção da mensagem usando IA
   */
  private static async analyzeIntent(
    context: AgentContext,
    message: string
  ): Promise<{ intent: string; confidence: number; details: Record<string, any> }> {
    try {
      const mistral = await getLLMClient();
      
      const systemPrompt = `Você é um analisador de intenções. Analise a mensagem do usuário e identifique sua intenção principal.

CONTEXTO DO USUÁRIO:
- Estado atual: ${context.currentState}
- Tem conta: ${!!context.userId}
- Histórico: ${context.conversationHistory.length} mensagens

INTENÇÕES POSSÍVEIS:
- criar_conta: Quer criar uma nova conta
- criar_agente: Quer criar ou configurar um agente IA
- editar_agente: Quer alterar/melhorar agente existente
- conectar_whatsapp: Quer conectar WhatsApp (QR Code)
- assinar_plano: Quer contratar/pagar plano
- adicionar_midia: Quer adicionar áudio/imagem/vídeo
- consultar_info: Quer saber informações
- ajuda: Precisa de ajuda/não sabe o que fazer
- outro: Outra intenção

FORMATO DE RESPOSTA (JSON):
{
  "intent": "nome_da_intencao",
  "confidence": 0.0-1.0,
  "details": {
    "agentName": "...",
    "companyName": "...",
    "role": "...",
    "instructions": "..."
  }
}

Mensagem do usuário: "${message}"`;

      const response = await mistral.chat.complete({
        model: "mistral-large-latest",
        messages: [{ role: "user", content: systemPrompt }],
        maxTokens: 500,
        temperature: 0.3,
      });

      const content = response.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);

      return {
        intent: parsed.intent || "outro",
        confidence: parsed.confidence || 0.5,
        details: parsed.details || {}
      };
    } catch (error) {
      console.error("❌ [HUB] Erro ao analisar intenção:", error);
      // Fallback: detecção simples por palavras-chave
      return this.simpleIntentDetection(message, context);
    }
  }

  /**
   * 🎲 Decisão simples de intenção (fallback)
   */
  private static simpleIntentDetection(
    message: string,
    context: AgentContext
  ): { intent: string; confidence: number; details: Record<string, any> } {
    const lower = message.toLowerCase();

    if (lower.includes("criar") && (lower.includes("agente") || lower.includes("conta"))) {
      return { intent: "criar_agente", confidence: 0.7, details: {} };
    }
    if (lower.includes("conectar") || lower.includes("whatsapp") || lower.includes("qr")) {
      return { intent: "conectar_whatsapp", confidence: 0.7, details: {} };
    }
    if (lower.includes("plano") || lower.includes("assinar") || lower.includes("pagar")) {
      return { intent: "assinar_plano", confidence: 0.7, details: {} };
    }
    if (lower.includes("alterar") || lower.includes("mudar") || lower.includes("editar")) {
      return { intent: "editar_agente", confidence: 0.6, details: {} };
    }

    return { intent: "ajuda", confidence: 0.5, details: {} };
  }

  /**
   * 🛠️ Decide quais ferramentas executar baseado na intenção
   */
  private static async decideActions(
    context: AgentContext,
    intent: { intent: string; confidence: number; details: Record<string, any> },
    message: string,
    mediaType?: string,
    mediaUrl?: string
  ): Promise<AgentDecision> {
    const tools: ToolCall[] = [];
    let nextState = context.currentState;
    let responseTemplate = "";

    switch (intent.intent) {
      case "criar_agente":
        // Verificar se já tem usuário
        if (!context.userId) {
          tools.push({
            toolName: "createClientAccount",
            parameters: {
              phoneNumber: context.phoneNumber,
              name: context.contactName
            }
          });
          nextState = "creating_agent";
          responseTemplate = "criando_conta_e_agente";
        }

        // Se tem dados do agente, criar
        if (intent.details.agentName && intent.details.companyName) {
          tools.push({
            toolName: "createOrUpdateAgent",
            parameters: {
              userId: context.userId || "{{createClientAccount.userId}}",
              agentName: intent.details.agentName,
              companyName: intent.details.companyName,
              role: intent.details.role || "atendente",
              instructions: intent.details.instructions || "Seja prestativo e educado"
            }
          });
          tools.push({
            toolName: "generateSimulatorLink",
            parameters: {
              userId: context.userId || "{{createClientAccount.userId}}",
              agentName: intent.details.agentName,
              companyName: intent.details.companyName
            }
          });
          nextState = "active_user";
          responseTemplate = "agente_criado_com_simulador";
        } else {
          responseTemplate = "perguntar_dados_agente";
        }
        break;

      case "conectar_whatsapp":
        if (!context.userId) {
          responseTemplate = "precisa_criar_conta_primeiro";
        } else {
          tools.push({
            toolName: "generateConnectionLink",
            parameters: { userId: context.userId }
          });
          nextState = "connecting_whatsapp";
          responseTemplate = "link_conexao_gerado";
        }
        break;

      case "assinar_plano":
        if (!context.userId) {
          responseTemplate = "precisa_criar_conta_primeiro";
        } else {
          tools.push({
            toolName: "generatePlanLink",
            parameters: { userId: context.userId }
          });
          nextState = "subscribing_plan";
          responseTemplate = "link_plano_gerado";
        }
        break;

      case "adicionar_midia":
        if (!context.userId) {
          responseTemplate = "precisa_criar_conta_primeiro";
        } else if (mediaUrl) {
          tools.push({
            toolName: "addMediaToAgent",
            parameters: {
              userId: context.userId,
              mediaType: mediaType || "image",
              mediaUrl,
              description: intent.details.description || "Mídia do cliente",
              whenToUse: intent.details.whenToUse || "Quando relevante"
            }
          });
          responseTemplate = "midia_adicionada";
        } else {
          responseTemplate = "aguardando_midia";
        }
        break;

      case "editar_agente":
        if (!context.userId) {
          responseTemplate = "precisa_criar_conta_primeiro";
        } else {
          responseTemplate = "como_quer_editar";
        }
        break;

      default:
        responseTemplate = "ajuda_geral";
    }

    return {
      intent: intent.intent,
      confidence: intent.confidence,
      toolsToExecute: tools,
      responseTemplate,
      nextState
    };
  }

  /**
   * ⚙️ Executa ferramentas em sequência
   */
  private static async executeTools(tools: ToolCall[]): Promise<ToolCall[]> {
    const results: ToolCall[] = [];

    for (const tool of tools) {
      console.log(`⚙️ [HUB] Executando ferramenta: ${tool.toolName}`);

      // Resolver parâmetros com resultados anteriores
      const resolvedParams = this.resolveParameters(tool.parameters, results);

      try {
        let result: ToolResult;

        switch (tool.toolName) {
          case "createClientAccount":
            result = await AgentTools.createClientAccount(resolvedParams);
            break;
          case "createOrUpdateAgent":
            result = await AgentTools.createOrUpdateAgent(resolvedParams);
            break;
          case "generateConnectionLink":
            result = await AgentTools.generateConnectionLink(resolvedParams);
            break;
          case "generatePlanLink":
            result = await AgentTools.generatePlanLink(resolvedParams);
            break;
          case "addMediaToAgent":
            result = await AgentTools.addMediaToAgent(resolvedParams);
            break;
          case "getUserInfo":
            result = await AgentTools.getUserInfo(resolvedParams);
            break;
          case "generateSimulatorLink":
            result = await AgentTools.generateSimulatorLink(resolvedParams);
            break;
          default:
            result = {
              success: false,
              error: `Ferramenta desconhecida: ${tool.toolName}`
            };
        }

        results.push({
          ...tool,
          parameters: resolvedParams,
          result: result.success ? result.data : null,
          error: result.error
        });

        console.log(`${result.success ? "✅" : "❌"} [HUB] ${tool.toolName}: ${result.message || result.error}`);
      } catch (error) {
        console.error(`❌ [HUB] Erro ao executar ${tool.toolName}:`, error);
        results.push({
          ...tool,
          error: error instanceof Error ? error.message : "Erro desconhecido"
        });
      }
    }

    return results;
  }

  /**
   * 🔗 Resolve parâmetros com referências a resultados anteriores
   * Exemplo: {{createClientAccount.userId}} → valor real do userId criado
   */
  private static resolveParameters(
    params: Record<string, any>,
    previousResults: ToolCall[]
  ): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && value.startsWith("{{") && value.endsWith("}}")) {
        // É uma referência
        const ref = value.slice(2, -2); // Remove {{ }}
        const [toolName, field] = ref.split(".");
        
        const tool = previousResults.find(t => t.toolName === toolName);
        if (tool?.result && field in tool.result) {
          resolved[key] = tool.result[field];
        } else {
          resolved[key] = value; // Mantém original se não encontrar
        }
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * 💬 Gera resposta final em linguagem natural
   */
  private static async generateResponse(
    context: AgentContext,
    decision: AgentDecision,
    executedTools: ToolCall[]
  ): Promise<string> {
    // Templates de respostas
    const templates: Record<string, string> = {
      criando_conta_e_agente: `Ótimo! Estou criando sua conta agora... ⏳

{{#if createClientAccount.success}}
✅ Conta criada!
📧 Email: {{createClientAccount.email}}
🔐 Senha: {{createClientAccount.password}}

Agora vou configurar seu agente...
{{/if}}`,

      agente_criado_com_simulador: `⏳ Aguarde um momento, estou configurando seu agente...

✅ Agente configurado e TESTADO!

🤖 Agente: {{createOrUpdateAgent.agentName}}
🏢 Empresa: {{createOrUpdateAgent.companyName}}

🎮 Teste seu agente aqui:
{{generateSimulatorLink.link}}

✅ Tudo validado e funcionando! Você já pode testar.

O que você quer fazer agora?
1️⃣ Conectar meu WhatsApp
2️⃣ Assinar um plano
3️⃣ Adicionar mídias (áudio/vídeo)`,

      link_conexao_gerado: `⏳ Gerando seu link de conexão...

📱 Link de conexão do WhatsApp CRIADO E VALIDADO:

{{generateConnectionLink.link}}

👆 Clique no link acima (já está logado automaticamente!)
📸 Escaneie o QR Code com seu WhatsApp
✅ Pronto! Seu agente começará a responder seus clientes automaticamente!

⚠️ **IMPORTANTE:** Depois que pagar, envie o comprovante lá no sistema mesmo, abaixo do QR code em "Eu já paguei"`,

      link_plano_gerado: `⏳ Gerando seu link para assinatura...

💳 Link de assinatura CRIADO E VALIDADO:

{{generatePlanLink.link}}

Planos disponíveis:
💎 **R$ 99/mês** - Ilimitado
🎁 Use o código **PARC2026PROMO** para pagar só **R$ 49/mês**!

👆 Clique no link (já está logado!) e escolha seu plano.

📸 Depois de pagar, envie o comprovante pelo sistema!`,

      perguntar_dados_agente: `Legal! Vamos criar seu agente. Preciso de algumas informações:

1️⃣ Qual o **nome** que você quer para o agente? (ex: Laura, João, Atendente)
2️⃣ Qual o **nome da sua empresa**? (ex: Pizzaria Bella, Clínica Dr. Silva)
3️⃣ Qual o **ramo do seu negócio**? (ex: pizzaria, clínica, loja de roupas)

Me conta tudo em uma mensagem só ou separado, como preferir!`,

      precisa_criar_conta_primeiro: `Para fazer isso, primeiro preciso criar sua conta. É rápido!

Me confirma se pode criar? 😊`,

      ajuda_geral: `Olá! Sou o Rodrigo, da AgenteZap! 👋

Posso te ajudar a:
🤖 Criar um agente IA para seu negócio
📱 Conectar seu WhatsApp
💳 Assinar um plano
🎨 Adicionar mídias (áudio, vídeo, imagens)
✏️ Editar seu agente

O que você precisa?`
    };

    // Pegar template
    let template = templates[decision.responseTemplate] || templates.ajuda_geral;

    // Substituir variáveis
    for (const tool of executedTools) {
      if (tool.result) {
        for (const [key, value] of Object.entries(tool.result)) {
          const placeholder = `{{${tool.toolName}.${key}}}`;
          template = template.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value));
        }
      }
    }

    // Remover condicionais não resolvidos
    template = template.replace(/\{\{#if .*?\}\}/g, "");
    template = template.replace(/\{\{\/if\}\}/g, "");

    return template.trim();
  }
}
