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
 */

import OpenAI from "openai";

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
  maxTentativasReparo: 3,
  numeroCenarios: 3,
  turnosConversaMax: 2,
  scoreMinimoAprovacao: 70,
  timeoutMs: 30000
};

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
  private client: OpenAI;
  private modelo: string;
  private config: ConfiguracaoCalibracao;

  constructor(apiKey: string, modelo: "mistral" | "openai" = "mistral", config?: Partial<ConfiguracaoCalibracao>) {
    this.client = new OpenAI({
      apiKey,
      baseURL: modelo === "mistral" ? "https://api.mistral.ai/v1" : undefined
    });
    this.modelo = modelo === "mistral" ? "mistral-large-latest" : "gpt-4o-mini";
    this.config = { ...CONFIG_PADRAO, ...config };
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

    console.log(`\n🎯 [Calibração] Iniciando calibração...`);
    console.log(`📝 [Calibração] Instrução: "${instrucaoUsuario}"`);

    try {
      // 1. Gerar cenários de teste
      const cenarios = await this.gerarCenarios(instrucaoUsuario, this.config.numeroCenarios);
      console.log(`✅ [Calibração] ${cenarios.length} cenários gerados`);

      // Loop de calibração com reparo
      while (tentativasReparo <= this.config.maxTentativasReparo) {
        resultados = [];
        cenariosAprovados = 0;

        // 2. Executar cada cenário
        for (const cenario of cenarios) {
          const resultado = await this.executarCenario(promptAtual, cenario, instrucaoUsuario);
          resultados.push(resultado);
          if (resultado.passou) cenariosAprovados++;
          console.log(`  ${resultado.passou ? '✅' : '❌'} Cenário ${cenario.id}: ${resultado.score}/100`);
        }

        // 3. Calcular score geral
        scoreGeral = resultados.reduce((acc, r) => acc + r.score, 0) / resultados.length;
        console.log(`📊 [Calibração] Score geral: ${scoreGeral.toFixed(1)}/100 (${cenariosAprovados}/${cenarios.length} aprovados)`);

        // 4. Verificar se passou
        if (scoreGeral >= this.config.scoreMinimoAprovacao && cenariosAprovados >= cenarios.length * 0.7) {
          console.log(`🎉 [Calibração] APROVADO! Prompt calibrado com sucesso.`);
          break;
        }

        // 5. Tentar reparar se não passou
        if (tentativasReparo < this.config.maxTentativasReparo) {
          console.log(`🔧 [Calibração] Tentando reparo (${tentativasReparo + 1}/${this.config.maxTentativasReparo})...`);
          
          // Encontrar cenário que falhou pior
          const piorResultado = resultados.reduce((pior, atual) => 
            atual.score < pior.score ? atual : pior
          );
          const cenarioFalhou = cenarios.find(c => c.id === piorResultado.cenarioId);

          if (cenarioFalhou) {
            const promptReparado = await this.repararPrompt(
              promptAtual,
              instrucaoUsuario,
              cenarioFalhou,
              piorResultado
            );

            if (promptReparado && promptReparado !== promptAtual) {
              promptAtual = promptReparado;
              console.log(`✅ [Calibração] Reparo aplicado`);
            }
          }
        }

        tentativasReparo++;
      }

      return {
        sucesso: scoreGeral >= this.config.scoreMinimoAprovacao,
        scoreGeral: Math.round(scoreGeral),
        cenariosTotais: cenarios.length,
        cenariosAprovados,
        resultados,
        promptFinal: promptAtual,
        tentativasReparo,
        tempoMs: Date.now() - inicio
      };

    } catch (error: any) {
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
      const response = await this.client.chat.completions.create({
        model: this.modelo,
        messages: [
          { role: "system", content: PROMPT_GERADOR_CENARIOS },
          { role: "user", content: userMessage }
        ],
        response_format: { type: "json_object" },
        temperature: 0.5,
        max_tokens: 2000
      });

      const content = response.choices[0]?.message?.content || "{}";
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
  // Simular Cliente
  // ═══════════════════════════════════════════════════════════════════════════

  private async simularCliente(perguntaBase: string): Promise<string> {
    const personas = [
      "Cliente curioso e direto ao ponto",
      "Cliente apressado querendo informação rápida",
      "Cliente amigável que conversa naturalmente"
    ];
    const persona = personas[Math.floor(Math.random() * personas.length)];

    const promptCliente = PROMPT_CLIENTE_SIMULADO
      .replace("{{PERSONA}}", persona)
      .replace("{{PERGUNTA}}", perguntaBase);

    try {
      const response = await this.client.chat.completions.create({
        model: this.modelo,
        messages: [
          { role: "system", content: promptCliente },
          { role: "user", content: "Envie a mensagem como cliente:" }
        ],
        temperature: 0.7,
        max_tokens: 200
      });

      return response.choices[0]?.message?.content?.trim() || perguntaBase;
    } catch {
      return perguntaBase;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Obter Resposta do Agente
  // ═══════════════════════════════════════════════════════════════════════════

  private async obterRespostaAgente(promptAgente: string, mensagemCliente: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.modelo,
        messages: [
          { role: "system", content: promptAgente },
          { role: "user", content: mensagemCliente }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      return response.choices[0]?.message?.content?.trim() || "";
    } catch (error: any) {
      throw new Error(`Erro ao obter resposta do agente: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Analisar Resposta
  // ═══════════════════════════════════════════════════════════════════════════

  private async analisarResposta(
    respostaAgente: string,
    instrucaoOriginal: string,
    cenario: CenarioTeste
  ): Promise<{ passou: boolean; score: number; motivo: string }> {
    const promptAnalise = PROMPT_ANALISADOR
      .replace("{{INSTRUCAO}}", instrucaoOriginal)
      .replace("{{EXPECTATIVA}}", cenario.expectativaResposta)
      .replace("{{RESPOSTA}}", respostaAgente)
      .replace("{{PALAVRAS_CHAVE}}", (cenario.palavrasChave || []).join(", "))
      .replace("{{TIPO_VALIDACAO}}", cenario.tipoValidacao);

    try {
      const response = await this.client.chat.completions.create({
        model: this.modelo,
        messages: [
          { role: "system", content: promptAnalise },
          { role: "user", content: "Analise a resposta e retorne o JSON de avaliação:" }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 500
      });

      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);

      return {
        passou: parsed.passou ?? false,
        score: Math.min(100, Math.max(0, parsed.score ?? 0)),
        motivo: parsed.motivo || "Sem justificativa"
      };
    } catch {
      // Fallback: análise simples por palavras-chave
      const contemPalavras = (cenario.palavrasChave || []).some(
        palavra => respostaAgente.toLowerCase().includes(palavra.toLowerCase())
      );
      return {
        passou: cenario.tipoValidacao === "nao_contem" ? !contemPalavras : contemPalavras,
        score: contemPalavras ? 80 : 30,
        motivo: "Análise por palavras-chave (fallback)"
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
      const response = await this.client.chat.completions.create({
        model: this.modelo,
        messages: [
          { role: "system", content: promptReparo },
          { role: "user", content: "Corrija o prompt e retorne as edições em JSON:" }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 2000
      });

      const content = response.choices[0]?.message?.content || "{}";
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

export async function calibrarPromptEditado(
  promptEditado: string,
  instrucaoUsuario: string,
  apiKey: string,
  modelo: "mistral" | "openai" = "mistral",
  config?: Partial<ConfiguracaoCalibracao>
): Promise<ResultadoCalibracao> {
  const service = new PromptCalibrationService(apiKey, modelo, config);
  return service.calibrarPrompt(promptEditado, instrucaoUsuario);
}

export default PromptCalibrationService;
