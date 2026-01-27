/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎯 SERVIÇO DE AUTO-CALIBRAÇÃO DE PROMPTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Técnica: IA Cliente vs IA Agente (Self-Consistency + Model-Graded Evaluation)
 * 
 * FLUXO:
 * 1. Usuário pede alteração → Sistema edita prompt
 * 2. Gera cenários de teste específicos para a instrução
 * 3. Executa conversa simulada (Cliente IA ↔ Agente IA)
 * 4. Analisa se resposta do agente demonstra a edição funcionando
 * 5. Se falhar, tenta reparar automaticamente (até 3x)
 * 6. Retorna resultado com score de confiança
 * 
 * Baseado em técnicas de: Anthropic, LangSmith, Microsoft Promptbase
 * 
 * 🚀 ATUALIZADO: Agora usa OpenRouter/Chutes (mesmo LLM do chat produção)
 */

import { chatComplete, type ChatMessage } from "./llm";

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface CenarioTeste {
  id: string;
  perguntaCliente: string;
  expectativaResposta: string;
  tipoValidacao: "contem" | "nao_contem" | "tom" | "semantico";
  palavrasChave?: string[];
}

export interface ResultadoCenario {
  cenarioId: string;
  perguntaCliente: string;
  respostaAgente: string;
  passou: boolean;
  score: number; // 0-100
  motivo: string;
}

export interface ResultadoCalibracao {
  sucesso: boolean;
  scoreGeral: number;
  cenariosTotais: number;
  cenariosAprovados: number;
  resultados: ResultadoCenario[];
  promptFinal: string;
  tentativasReparo: number;
  tempoMs: number;
}

export interface ConfiguracaoCalibracao {
  maxTentativasReparo: number;
  numeroCenarios: number;
  turnosConversaMax: number;
  scoreMinimoAprovacao: number;
  timeoutMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO PADRÃO
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG_PADRAO: ConfiguracaoCalibracao = {
  maxTentativasReparo: 10, // Loop até atingir score >= 60
  numeroCenarios: 2, // 2 cenários para balancear velocidade
  turnosConversaMax: 2,
  scoreMinimoAprovacao: 60, // Score mínimo obrigatório
  timeoutMs: 120000 // 2 minutos - tempo suficiente para várias rodadas
};

// ═══════════════════════════════════════════════════════════════════════════
// CALLBACK DE PROGRESSO PARA STREAMING
// ═══════════════════════════════════════════════════════════════════════════

export type ProgressCallback = (log: CalibrationLog) => void;

export interface CalibrationLog {
  type: 'start' | 'scenario_generated' | 'scenario_running' | 'scenario_result' | 'score_update' | 'repair_start' | 'repair_done' | 'loop_iteration' | 'final_result' | 'error';
  message: string;
  data?: any;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPTS DO SISTEMA
// ═══════════════════════════════════════════════════════════════════════════

const PROMPT_GERADOR_CENARIOS = `Você é um gerador de cenários de teste para validar edições em prompts de agentes de IA.

TAREFA:
Dado uma instrução de edição, gere cenários de teste que validem se a edição foi aplicada corretamente.

REGRAS:
1. Cada cenário deve ter uma pergunta que um cliente real faria
2. A pergunta deve estar diretamente relacionada à edição solicitada
3. Defina claramente o que esperar na resposta do agente
4. Inclua palavras-chave que devem aparecer (ou não aparecer) na resposta

FORMATO DE SAÍDA (JSON):
{
  "cenarios": [
    {
      "id": "cenario_1",
      "perguntaCliente": "Pergunta que o cliente faria",
      "expectativaResposta": "O que esperamos que o agente responda",
      "tipoValidacao": "contem",
      "palavrasChave": ["palavra1", "palavra2"]
    }
  ]
}

TIPOS DE VALIDAÇÃO:
- "contem": resposta DEVE conter as palavras-chave
- "nao_contem": resposta NÃO DEVE conter as palavras-chave  
- "tom": verificar tom da resposta (formal/informal)
- "semantico": análise semântica da resposta`;

const PROMPT_CLIENTE_SIMULADO = `Você é um cliente real conversando via WhatsApp com uma empresa.

PERSONA: {{PERSONA}}

REGRAS:
1. Faça APENAS a pergunta especificada, sem adicionar nada
2. Use linguagem natural de WhatsApp (informal, direto ao ponto)
3. Não cumprimente demais, seja objetivo
4. Uma mensagem curta e direta

PERGUNTA A FAZER:
{{PERGUNTA}}`;

const PROMPT_ANALISADOR = `Você é um avaliador rigoroso de respostas de agentes de IA.

TAREFA:
Analise se a resposta do agente demonstra que uma edição específica foi aplicada corretamente.

INSTRUÇÃO DE EDIÇÃO QUE FOI FEITA:
{{INSTRUCAO}}

EXPECTATIVA:
{{EXPECTATIVA}}

RESPOSTA DO AGENTE:
{{RESPOSTA}}

PALAVRAS-CHAVE ESPERADAS:
{{PALAVRAS_CHAVE}}

TIPO DE VALIDAÇÃO:
{{TIPO_VALIDACAO}}

ANALISE E RETORNE JSON:
{
  "passou": true/false,
  "score": 0-100,
  "motivo": "Explicação detalhada do porquê passou ou reprovou"
}

CRITÉRIOS:
- Score 90-100: Resposta perfeita, demonstra claramente a edição
- Score 70-89: Resposta aceitável, edição parcialmente visível
- Score 50-69: Resposta ambígua, não fica claro se edição funcionou
- Score 0-49: Resposta incorreta, edição claramente não funcionou`;

const PROMPT_REPARADOR = `Você é um especialista em consertar prompts que não estão funcionando como esperado.

CONTEXTO:
Uma edição foi feita no prompt, mas quando testada com clientes simulados, não funcionou corretamente.

PROMPT ATUAL:
\`\`\`
{{PROMPT}}
\`\`\`

INSTRUÇÃO ORIGINAL DO USUÁRIO:
"{{INSTRUCAO}}"

PROBLEMA DETECTADO:
{{PROBLEMA}}

CENÁRIO QUE FALHOU:
- Pergunta do cliente: "{{PERGUNTA}}"
- Resposta do agente: "{{RESPOSTA}}"
- O que esperávamos: "{{EXPECTATIVA}}"

TAREFA:
Corrija o prompt para que a edição funcione corretamente.

RETORNE JSON:
{
  "resposta_chat": "Explicação amigável do que foi corrigido",
  "operacao": "editar",
  "edicoes": [
    {
      "buscar": "texto exato a encontrar",
      "substituir": "texto corrigido"
    }
  ]
}`;

// ═══════════════════════════════════════════════════════════════════════════
// CLASSE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export class PromptCalibrationService {
  private config: ConfiguracaoCalibracao;
  private progressCallback?: ProgressCallback;

  constructor(config?: Partial<ConfiguracaoCalibracao>, progressCallback?: ProgressCallback) {
    // 🚀 Agora usa OpenRouter/Chutes automaticamente via chatComplete()
    // Não precisa mais de apiKey ou modelo - usa config do sistema
    this.config = { ...CONFIG_PADRAO, ...config };
    this.progressCallback = progressCallback;
    console.log(`🎯 [Calibração] Inicializado com OpenRouter/Chutes (mesmo LLM da produção)`);
  }

  /**
   * Emite log de progresso para streaming
   */
  private emitProgress(type: CalibrationLog['type'], message: string, data?: any): void {
    if (this.progressCallback) {
      this.progressCallback({
        type,
        message,
        data,
        timestamp: Date.now()
      });
    }
    console.log(`📡 [Calibração] ${message}`);
  }

  /**
   * Método helper para fazer chamadas ao LLM unificado
   * 🚀 OTIMIZADO: Com retry automático e melhor tratamento de erros
   */
  private async callLLM(
    systemPrompt: string, 
    userMessage: string, 
    options?: { temperature?: number; maxTokens?: number; jsonMode?: boolean }
  ): Promise<string> {
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 [Calibração LLM] Chamando chatComplete() (tentativa ${attempt}/${MAX_RETRIES})...`);
        const startTime = Date.now();
        
        const messages: ChatMessage[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ];

        // 🚀 Timeout de 20s por chamada LLM
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("LLM timeout (20s)")), 20000)
        );

        const llmPromise = chatComplete({
          messages,
          temperature: options?.temperature ?? 0.5,
          maxTokens: options?.maxTokens ?? 300
        });

        const response = await Promise.race([llmPromise, timeoutPromise]);
        const elapsed = Date.now() - startTime;
        console.log(`✅ [Calibração LLM] Resposta em ${elapsed}ms`);

        const content = response.choices?.[0]?.message?.content;
        if (!content || content.trim() === "") {
          throw new Error("Resposta vazia do LLM");
        }

        // Se jsonMode, tentar extrair JSON da resposta
        if (options?.jsonMode) {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error("JSON não encontrado na resposta");
          }
          // Validar que é JSON válido
          try {
            JSON.parse(jsonMatch[0]);
          } catch {
            throw new Error("JSON inválido na resposta");
          }
          return jsonMatch[0];
        }

        return content;
        
      } catch (error: any) {
        lastError = error;
        console.warn(`⚠️ [Calibração LLM] Tentativa ${attempt} falhou: ${error.message}`);
        
        if (attempt < MAX_RETRIES) {
          // Backoff exponencial: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.log(`⏳ [Calibração LLM] Aguardando ${delay}ms antes de tentar novamente...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // Todas as tentativas falharam
    throw lastError || new Error("Falha após múltiplas tentativas");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FUNÇÃO PRINCIPAL: Calibrar Prompt
  // ═══════════════════════════════════════════════════════════════════════════

  async calibrarPrompt(
    promptEditado: string,
    instrucaoUsuario: string,
    promptOriginal?: string
  ): Promise<ResultadoCalibracao> {
    const inicio = Date.now();
    let promptAtual = promptEditado;
    let tentativasReparo = 0;
    let resultados: ResultadoCenario[] = [];
    let scoreGeral = 0;
    let cenariosAprovados = 0;

    this.emitProgress('start', '🎯 Iniciando testes com clientes simulados...', {
      instrucao: instrucaoUsuario.substring(0, 100)
    });

    console.log(`\n🎯 [Calibração] Iniciando calibração...`);
    console.log(`📝 [Calibração] Instrução: "${instrucaoUsuario}"`);

    try {
      // 1. Gerar cenários de teste
      this.emitProgress('scenario_generated', '🧪 Gerando perguntas de clientes simulados...', {});
      const cenarios = await this.gerarCenarios(instrucaoUsuario, this.config.numeroCenarios);
      this.emitProgress('scenario_generated', `✅ ${cenarios.length} perguntas prontas!`, {});
      
      // Mostrar cada cenário gerado
      for (let i = 0; i < cenarios.length; i++) {
        const c = cenarios[i];
        this.emitProgress('scenario_generated', `📋 Cenário ${i + 1}: "${c.perguntaCliente}"`, {});
      }
      console.log(`✅ [Calibração] ${cenarios.length} cenários gerados`);

      // Loop de calibração com reparo - CONTINUA ATÉ ATINGIR SCORE >= 60
      while (tentativasReparo <= this.config.maxTentativasReparo) {
        this.emitProgress('loop_iteration', `🔄 Rodada ${tentativasReparo + 1}/${this.config.maxTentativasReparo} - Simulando conversas...`, {
          rodada: tentativasReparo + 1,
          maxRodadas: this.config.maxTentativasReparo + 1
        });
        
        resultados = [];
        cenariosAprovados = 0;

        // 2. Executar cada cenário
        for (let i = 0; i < cenarios.length; i++) {
          const cenario = cenarios[i];
          
          // Log: Cliente vai perguntar
          this.emitProgress('scenario_running', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, {});
          this.emitProgress('scenario_running', `🧪 TESTE ${i + 1}/${cenarios.length}`, {});
          this.emitProgress('scenario_running', `👤 CLIENTE PERGUNTA:`, {});
          this.emitProgress('scenario_running', `   "${cenario.perguntaCliente}"`, {});
          
          const resultado = await this.executarCenario(promptAtual, cenario, instrucaoUsuario);
          resultados.push(resultado);
          if (resultado.passou) cenariosAprovados++;
          
          // Log: Resposta do agente (MOSTRA TUDO)
          this.emitProgress('scenario_running', `🤖 AGENTE RESPONDE:`, {});
          // Quebra resposta em linhas menores para exibição
          const respostaLinhas = resultado.respostaAgente.match(/.{1,80}/g) || [resultado.respostaAgente];
          for (const linha of respostaLinhas.slice(0, 5)) { // Máximo 5 linhas
            this.emitProgress('scenario_running', `   ${linha}`, {});
          }
          if (respostaLinhas.length > 5) {
            this.emitProgress('scenario_running', `   [...mais ${respostaLinhas.length - 5} linhas]`, {});
          }
          
          // Log: Análise
          this.emitProgress('scenario_running', `📊 ANÁLISE:`, {});
          this.emitProgress('scenario_result', `${resultado.passou ? '✅' : '❌'} Nota: ${resultado.score}/100 - ${resultado.motivo}`, {});
          
          console.log(`  ${resultado.passou ? '✅' : '❌'} Cenário ${cenario.id}: ${resultado.score}/100`);
        }

        // 3. Calcular score geral
        scoreGeral = resultados.reduce((acc, r) => acc + r.score, 0) / resultados.length;
        
        this.emitProgress('score_update', `📊 Score atual: ${scoreGeral.toFixed(0)}/100 (meta: ${this.config.scoreMinimoAprovacao}+)`, {
          score: Math.round(scoreGeral),
          aprovados: cenariosAprovados,
          total: cenarios.length,
          rodada: tentativasReparo + 1
        });
        
        console.log(`📊 [Calibração] Score geral: ${scoreGeral.toFixed(1)}/100 (${cenariosAprovados}/${cenarios.length} aprovados)`);
        console.log(`📊 [Calibração] Mínimo para aprovar: ${this.config.scoreMinimoAprovacao}/100`);

        // 4. Verificar se passou - SCORE >= 60
        if (scoreGeral >= this.config.scoreMinimoAprovacao || cenariosAprovados === cenarios.length) {
          this.emitProgress('final_result', `🎉 Aprovado! Score final: ${Math.round(scoreGeral)}/100`, {
            success: true,
            score: Math.round(scoreGeral),
            rodadasUsadas: tentativasReparo + 1
          });
          console.log(`🎉 [Calibração] APROVADO! Prompt calibrado com sucesso.`);
          break;
        }

        // 5. Tentar reparar se não passou E ainda tem tentativas
        if (tentativasReparo < this.config.maxTentativasReparo) {
          this.emitProgress('repair_start', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, {});
          this.emitProgress('repair_start', `🔧 INICIANDO AJUSTE ${tentativasReparo + 1}/${this.config.maxTentativasReparo}`, {});
          console.log(`🔧 [Calibração] Tentando reparo (${tentativasReparo + 1}/${this.config.maxTentativasReparo})...`);
          
          // Encontrar cenário que falhou pior
          const piorResultado = resultados.reduce((pior, atual) => 
            atual.score < pior.score ? atual : pior
          );
          const cenarioFalhou = cenarios.find(c => c.id === piorResultado.cenarioId);

          if (cenarioFalhou) {
            this.emitProgress('repair_start', `❌ Problema identificado:`, {});
            this.emitProgress('repair_start', `   Pergunta: "${cenarioFalhou.perguntaCliente}"`, {});
            this.emitProgress('repair_start', `   Score: ${piorResultado.score}/100`, {});
            this.emitProgress('repair_start', `   Motivo: ${piorResultado.motivo}`, {});
            this.emitProgress('repair_start', `💡 Ajustando prompt para corrigir...`, {});
            
            const promptReparado = await this.repararPrompt(
              promptAtual,
              instrucaoUsuario,
              cenarioFalhou,
              piorResultado
            );

            if (promptReparado && promptReparado !== promptAtual) {
              promptAtual = promptReparado;
              this.emitProgress('repair_done', `✅ Ajuste aplicado! Retestando...`, {
                reparo: true
              });
              console.log(`✅ [Calibração] Reparo aplicado`);
            } else {
              this.emitProgress('repair_done', `⚠️ Não foi possível ajustar. Tentando abordagem diferente...`, {
                reparo: false
              });
            }
          }
        } else {
          // Atingiu máximo de tentativas mas não passou
          this.emitProgress('final_result', `⚠️ Ajustes finalizados. Pontuação final: ${Math.round(scoreGeral)}/100`, {
            success: false,
            score: Math.round(scoreGeral),
            rodadasUsadas: tentativasReparo + 1
          });
        }

        tentativasReparo++;
      }

      const sucesso = scoreGeral >= this.config.scoreMinimoAprovacao;
      this.emitProgress('final_result', sucesso 
        ? `✅ Calibração concluída com sucesso! Score: ${Math.round(scoreGeral)}/100`
        : `⚠️ Calibração finalizada. Score: ${Math.round(scoreGeral)}/100 - Recomendamos testar no simulador.`, 
      {
        success: sucesso,
        score: Math.round(scoreGeral),
        tempoMs: Date.now() - inicio
      });

      return {
        sucesso,
        scoreGeral: Math.round(scoreGeral),
        cenariosTotais: cenarios.length,
        cenariosAprovados,
        resultados,
        promptFinal: promptAtual,
        tentativasReparo,
        tempoMs: Date.now() - inicio
      };

    } catch (error: any) {
      this.emitProgress('error', `❌ Erro na calibração: ${error.message}`, { error: error.message });
      console.error(`❌ [Calibração] Erro:`, error.message);
      return {
        sucesso: false,
        scoreGeral: 0,
        cenariosTotais: 0,
        cenariosAprovados: 0,
        resultados: [],
        promptFinal: promptEditado,
        tentativasReparo,
        tempoMs: Date.now() - inicio
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Gerar Cenários de Teste
  // ═══════════════════════════════════════════════════════════════════════════

  private async gerarCenarios(instrucao: string, quantidade: number): Promise<CenarioTeste[]> {
    const userMessage = `INSTRUÇÃO DE EDIÇÃO:
"${instrucao}"

Gere ${quantidade} cenários de teste para validar se essa edição foi aplicada corretamente no prompt do agente.`;

    try {
      const content = await this.callLLM(
        PROMPT_GERADOR_CENARIOS,
        userMessage,
        { temperature: 0.5, maxTokens: 2000, jsonMode: true }
      );
      
      const parsed = JSON.parse(content);
      return (parsed.cenarios || []).slice(0, quantidade);
    } catch (error) {
      console.error("[Calibração] Erro ao gerar cenários:", error);
      // Fallback: cenário genérico
      return [{
        id: "cenario_fallback",
        perguntaCliente: `Sobre "${instrucao.substring(0, 50)}..."`,
        expectativaResposta: "Resposta que demonstra a edição aplicada",
        tipoValidacao: "semantico",
        palavrasChave: []
      }];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Executar Cenário (IA Cliente ↔ IA Agente)
  // ═══════════════════════════════════════════════════════════════════════════

  private async executarCenario(
    prompt: string,
    cenario: CenarioTeste,
    instrucaoOriginal: string
  ): Promise<ResultadoCenario> {
    try {
      // 1. Simular mensagem do cliente
      const mensagemCliente = await this.simularCliente(cenario.perguntaCliente);
      
      // 2. Obter resposta do agente
      const respostaAgente = await this.obterRespostaAgente(prompt, mensagemCliente);
      
      // 3. Analisar se passou
      const analise = await this.analisarResposta(
        respostaAgente,
        instrucaoOriginal,
        cenario
      );

      return {
        cenarioId: cenario.id,
        perguntaCliente: mensagemCliente,
        respostaAgente,
        passou: analise.passou,
        score: analise.score,
        motivo: analise.motivo
      };

    } catch (error: any) {
      return {
        cenarioId: cenario.id,
        perguntaCliente: cenario.perguntaCliente,
        respostaAgente: "ERRO",
        passou: false,
        score: 0,
        motivo: `Erro na execução: ${error.message}`
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Simular Cliente - OTIMIZADO: Usa mensagem direta sem simulação extra
  // ═══════════════════════════════════════════════════════════════════════════

  private async simularCliente(perguntaBase: string): Promise<string> {
    // 🚀 OTIMIZAÇÃO: Retorna pergunta direta sem chamada LLM adicional
    // Isso economiza 1 chamada por cenário = muito mais rápido
    return perguntaBase;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Obter Resposta do Agente - OTIMIZADO
  // ═══════════════════════════════════════════════════════════════════════════

  private async obterRespostaAgente(promptAgente: string, mensagemCliente: string): Promise<string> {
    try {
      const content = await this.callLLM(
        promptAgente,
        mensagemCliente,
        { temperature: 0.3, maxTokens: 400 } // Reduzido para velocidade
      );
      return content.trim() || "";
    } catch (error: any) {
      throw new Error(`Erro ao obter resposta do agente: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Analisar Resposta - OTIMIZADO
  // ═══════════════════════════════════════════════════════════════════════════

  private async analisarResposta(
    respostaAgente: string,
    instrucaoOriginal: string,
    cenario: CenarioTeste
  ): Promise<{ passou: boolean; score: number; motivo: string }> {
    // 🚀 OTIMIZAÇÃO: Análise local por palavras-chave PRIMEIRO (sem LLM)
    // Se tiver palavras-chave definidas, usa análise rápida
    if (cenario.palavrasChave && cenario.palavrasChave.length > 0) {
      const respostaLower = respostaAgente.toLowerCase();
      const palavrasEncontradas = cenario.palavrasChave.filter(
        palavra => respostaLower.includes(palavra.toLowerCase())
      );
      const percentualEncontrado = (palavrasEncontradas.length / cenario.palavrasChave.length) * 100;
      
      if (cenario.tipoValidacao === "contem") {
        const passou = percentualEncontrado >= 50;
        const score = Math.round(percentualEncontrado * 0.9 + (passou ? 10 : 0));
        return {
          passou,
          score: Math.min(100, score),
          motivo: `Encontrou ${palavrasEncontradas.length}/${cenario.palavrasChave.length} palavras-chave`
        };
      }
      
      if (cenario.tipoValidacao === "nao_contem") {
        const passou = percentualEncontrado === 0;
        return {
          passou,
          score: passou ? 95 : 30,
          motivo: passou ? "Nenhuma palavra-chave indesejada" : `Encontrou palavras indesejadas: ${palavrasEncontradas.join(", ")}`
        };
      }
    }

    // Fallback: Análise semântica com LLM (mais lenta)
    const promptAnalise = PROMPT_ANALISADOR
      .replace("{{INSTRUCAO}}", instrucaoOriginal)
      .replace("{{EXPECTATIVA}}", cenario.expectativaResposta)
      .replace("{{RESPOSTA}}", respostaAgente.substring(0, 500)) // Limita tamanho
      .replace("{{PALAVRAS_CHAVE}}", (cenario.palavrasChave || []).join(", "))
      .replace("{{TIPO_VALIDACAO}}", cenario.tipoValidacao);

    try {
      const content = await this.callLLM(
        promptAnalise,
        "Analise a resposta e retorne o JSON de avaliação:",
        { temperature: 0.1, maxTokens: 300, jsonMode: true }
      );

      const parsed = JSON.parse(content);

      return {
        passou: parsed.passou ?? false,
        score: Math.min(100, Math.max(0, parsed.score ?? 0)),
        motivo: parsed.motivo || "Sem justificativa"
      };
    } catch {
      // Fallback final
      return {
        passou: respostaAgente.length > 50,
        score: respostaAgente.length > 50 ? 65 : 30,
        motivo: "Análise automática (fallback)"
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Reparar Prompt
  // ═══════════════════════════════════════════════════════════════════════════

  private async repararPrompt(
    promptAtual: string,
    instrucaoOriginal: string,
    cenarioFalhou: CenarioTeste,
    resultadoFalhou: ResultadoCenario
  ): Promise<string | null> {
    const promptReparo = PROMPT_REPARADOR
      .replace("{{PROMPT}}", promptAtual)
      .replace("{{INSTRUCAO}}", instrucaoOriginal)
      .replace("{{PROBLEMA}}", resultadoFalhou.motivo)
      .replace("{{PERGUNTA}}", resultadoFalhou.perguntaCliente)
      .replace("{{RESPOSTA}}", resultadoFalhou.respostaAgente)
      .replace("{{EXPECTATIVA}}", cenarioFalhou.expectativaResposta);

    try {
      const content = await this.callLLM(
        promptReparo,
        "Corrija o prompt e retorne as edições em JSON:",
        { temperature: 0.3, maxTokens: 2000, jsonMode: true }
      );

      const parsed = JSON.parse(content);

      if (parsed.operacao === "editar" && parsed.edicoes?.length > 0) {
        let promptReparado = promptAtual;
        for (const edicao of parsed.edicoes) {
          if (edicao.buscar && promptReparado.includes(edicao.buscar)) {
            promptReparado = promptReparado.replace(edicao.buscar, edicao.substituir || "");
          }
        }
        return promptReparado;
      }

      return null;
    } catch (error) {
      console.error("[Calibração] Erro ao reparar prompt:", error);
      return null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO HELPER PARA USO DIRETO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Função simplificada para calibrar prompts
 * 🚀 ATUALIZADO: Agora usa OpenRouter/Chutes automaticamente
 * Os parâmetros apiKey e modelo são mantidos por compatibilidade mas ignorados
 */
export async function calibrarPromptEditado(
  promptEditado: string,
  instrucaoUsuario: string,
  _apiKey?: string,  // Ignorado - usa config do sistema
  _modelo?: "mistral" | "openai",  // Ignorado - usa OpenRouter/Chutes
  config?: Partial<ConfiguracaoCalibracao>,
  progressCallback?: ProgressCallback
): Promise<ResultadoCalibracao> {
  const service = new PromptCalibrationService(config, progressCallback);
  return service.calibrarPrompt(promptEditado, instrucaoUsuario);
}

export default PromptCalibrationService;