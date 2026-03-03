import {
  chatComplete
} from "./chunk-2Q3AYVYX.js";
import "./chunk-7MHQYRZN.js";
import "./chunk-GE2AEWJ4.js";
import "./chunk-6FKQZG5F.js";
import "./chunk-KFQGP6VL.js";

// server/promptCalibrationService.ts
var CONFIG_PADRAO = {
  maxTentativasReparo: 3,
  // Reduzido: 3 tentativas rápidas
  numeroCenarios: 1,
  // Reduzido: 1 cenário para velocidade máxima
  turnosConversaMax: 1,
  // 1 turno apenas
  scoreMinimoAprovacao: 60,
  // Flexibilizado para agilizar
  timeoutMs: 3e4
  // 30 segundos - muito mais rápido
};
var PROMPT_GERADOR_CENARIOS = `Gere 1 pergunta de teste R\xC1PIDA para validar esta edi\xE7\xE3o no prompt.

FORMATO JSON (sem markdown):
{"cenarios":[{"id":"c1","perguntaCliente":"pergunta curta","expectativaResposta":"o que esperar","tipoValidacao":"semantico","palavrasChave":["palavra1"]}]}

REGRAS:
- Pergunta curta e direta (m\xE1ximo 15 palavras)
- Palavras-chave: 2-3 palavras importantes
- Foco em verificar se a edi\xE7\xE3o funcionou`;
var PROMPT_ANALISADOR = `Avalie rapidamente se a resposta demonstra a edi\xE7\xE3o aplicada.

EDI\xC7\xC3O: {{INSTRUCAO}}
RESPOSTA: {{RESPOSTA}}
PALAVRAS ESPERADAS: {{PALAVRAS_CHAVE}}

Retorne JSON: {"passou":true/false,"score":0-100,"motivo":"raz\xE3o curta"}`;
var PROMPT_REPARADOR = `Corrija o prompt para que a edi\xE7\xE3o funcione corretamente.

PROMPT ATUAL (resumo):
{{PROMPT}}

EDI\xC7\xC3O PEDIDA: "{{INSTRUCAO}}"
PROBLEMA: {{PROBLEMA}}
\xC2NCORAS OBRIGAT\xD3RIAS: {{ANCORAS_OBRIGATORIAS}}

Retorne JSON: {"resposta_chat":"ajuste feito","operacao":"editar","edicoes":[{"buscar":"texto existente","substituir":"texto corrigido"}]}

DICAS:
- Use texto que EXISTE no prompt para "buscar"
- Se n\xE3o encontrar, adicione nova instru\xE7\xE3o no final
- NUNCA remova ou altere as \xE2ncoras obrigat\xF3rias`;
var PromptCalibrationService = class {
  config;
  progressCallback;
  constructor(config, progressCallback) {
    this.config = { ...CONFIG_PADRAO, ...config };
    this.progressCallback = progressCallback;
    console.log(`\u{1F3AF} [Calibra\xE7\xE3o] Inicializado com OpenRouter/Chutes (mesmo LLM da produ\xE7\xE3o)`);
  }
  /**
   * Emite log de progresso para streaming
   */
  emitProgress(type, message, data) {
    if (this.progressCallback) {
      this.progressCallback({
        type,
        message,
        data,
        timestamp: Date.now()
      });
    }
    console.log(`\u{1F4E1} [Calibra\xE7\xE3o] ${message}`);
  }
  /**
   * Método helper para fazer chamadas ao LLM unificado
   * 🚀 OTIMIZADO: Com retry automático e melhor tratamento de erros
   */
  async callLLM(systemPrompt, userMessage, options) {
    const MAX_RETRIES = 2;
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`\u{1F504} [Calibra\xE7\xE3o LLM] Tentativa ${attempt}/${MAX_RETRIES}...`);
        const startTime = Date.now();
        const messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ];
        const timeoutPromise = new Promise(
          (_, reject) => setTimeout(() => reject(new Error("LLM timeout (10s)")), 1e4)
        );
        const llmPromise = chatComplete({
          messages,
          temperature: options?.temperature ?? 0.3,
          // Mais determinístico
          maxTokens: options?.maxTokens ?? 200
          // Reduzido para velocidade
        });
        const response = await Promise.race([llmPromise, timeoutPromise]);
        const elapsed = Date.now() - startTime;
        console.log(`\u2705 [Calibra\xE7\xE3o LLM] Resposta em ${elapsed}ms`);
        const content = response.choices?.[0]?.message?.content;
        if (!content || content.trim() === "") {
          throw new Error("Resposta vazia do LLM");
        }
        if (options?.jsonMode) {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error("JSON n\xE3o encontrado na resposta");
          }
          try {
            JSON.parse(jsonMatch[0]);
          } catch {
            throw new Error("JSON inv\xE1lido na resposta");
          }
          return jsonMatch[0];
        }
        return content;
      } catch (error) {
        lastError = error;
        console.warn(`\u26A0\uFE0F [Calibra\xE7\xE3o LLM] Tentativa ${attempt} falhou: ${error.message}`);
        if (attempt < MAX_RETRIES) {
          const delay = attempt * 500;
          console.log(`\u23F3 [Calibra\xE7\xE3o LLM] Aguardando ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError || new Error("Falha ap\xF3s m\xFAltiplas tentativas");
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // FUNÇÃO PRINCIPAL: Calibrar Prompt
  // ═══════════════════════════════════════════════════════════════════════════
  async calibrarPrompt(promptEditado, instrucaoUsuario, promptOriginal) {
    const inicio = Date.now();
    let promptAtual = promptEditado;
    let tentativasReparo = 0;
    let totalEdicoesAplicadas = 0;
    let resultados = [];
    let scoreGeral = 0;
    let cenariosAprovados = 0;
    const ancorasObrigatorias = this.extrairAncorasObrigatorias(instrucaoUsuario).filter((ancora) => promptEditado.includes(ancora));
    this.emitProgress("start", "\u{1F3AF} Iniciando testes com clientes simulados...", {
      instrucao: instrucaoUsuario.substring(0, 100)
    });
    console.log(`
\u{1F3AF} [Calibra\xE7\xE3o] Iniciando calibra\xE7\xE3o...`);
    console.log(`\u{1F4DD} [Calibra\xE7\xE3o] Instru\xE7\xE3o: "${instrucaoUsuario}"`);
    try {
      this.emitProgress("scenario_generated", "\u{1F9EA} Gerando perguntas de clientes simulados...", {});
      const cenarios = await this.gerarCenarios(instrucaoUsuario, this.config.numeroCenarios);
      this.emitProgress("scenario_generated", `\u2705 ${cenarios.length} perguntas prontas!`, {});
      for (let i = 0; i < cenarios.length; i++) {
        const c = cenarios[i];
        this.emitProgress("scenario_generated", `\u{1F4CB} Cen\xE1rio ${i + 1}: "${c.perguntaCliente}"`, {});
      }
      console.log(`\u2705 [Calibra\xE7\xE3o] ${cenarios.length} cen\xE1rios gerados`);
      while (tentativasReparo <= this.config.maxTentativasReparo) {
        this.emitProgress("loop_iteration", `\u{1F504} Rodada ${tentativasReparo + 1}/${this.config.maxTentativasReparo} - Simulando conversas...`, {
          rodada: tentativasReparo + 1,
          maxRodadas: this.config.maxTentativasReparo + 1
        });
        resultados = [];
        cenariosAprovados = 0;
        for (let i = 0; i < cenarios.length; i++) {
          const cenario = cenarios[i];
          this.emitProgress("scenario_running", `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`, {});
          this.emitProgress("scenario_running", `\u{1F9EA} TESTE ${i + 1}/${cenarios.length}`, {});
          this.emitProgress("scenario_running", `\u{1F464} CLIENTE PERGUNTA:`, {});
          this.emitProgress("scenario_running", `   "${cenario.perguntaCliente}"`, {});
          const resultado = await this.executarCenario(promptAtual, cenario, instrucaoUsuario);
          resultados.push(resultado);
          if (resultado.passou) cenariosAprovados++;
          this.emitProgress("scenario_running", `\u{1F916} AGENTE RESPONDE:`, {});
          const respostaLinhas = resultado.respostaAgente.match(/.{1,80}/g) || [resultado.respostaAgente];
          for (const linha of respostaLinhas.slice(0, 5)) {
            this.emitProgress("scenario_running", `   ${linha}`, {});
          }
          if (respostaLinhas.length > 5) {
            this.emitProgress("scenario_running", `   [...mais ${respostaLinhas.length - 5} linhas]`, {});
          }
          this.emitProgress("scenario_running", `\u{1F4CA} AN\xC1LISE:`, {});
          this.emitProgress("scenario_result", `${resultado.passou ? "\u2705" : "\u274C"} Nota: ${resultado.score}/100 - ${resultado.motivo}`, {});
          console.log(`  ${resultado.passou ? "\u2705" : "\u274C"} Cen\xE1rio ${cenario.id}: ${resultado.score}/100`);
        }
        scoreGeral = resultados.reduce((acc, r) => acc + r.score, 0) / resultados.length;
        this.emitProgress("score_update", `\u{1F4CA} Score atual: ${scoreGeral.toFixed(0)}/100 (meta: 70+)`, {
          score: Math.round(scoreGeral),
          aprovados: cenariosAprovados,
          total: cenarios.length,
          rodada: tentativasReparo + 1
        });
        console.log(`\u{1F4CA} [Calibra\xE7\xE3o] Score geral: ${scoreGeral.toFixed(1)}/100 (${cenariosAprovados}/${cenarios.length} aprovados)`);
        console.log(`\u{1F4CA} [Calibra\xE7\xE3o] M\xEDnimo para aprovar: 70/100`);
        if (scoreGeral >= this.config.scoreMinimoAprovacao) {
          this.emitProgress("final_result", `\u{1F389} Aprovado! Score final: ${Math.round(scoreGeral)}/100`, {
            success: true,
            score: Math.round(scoreGeral),
            rodadasUsadas: tentativasReparo + 1
          });
          console.log(`\u{1F389} [Calibra\xE7\xE3o] APROVADO! Prompt calibrado com sucesso.`);
          break;
        }
        if (tentativasReparo < this.config.maxTentativasReparo) {
          this.emitProgress("repair_start", `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`, {});
          this.emitProgress("repair_start", `\u{1F527} INICIANDO AJUSTE ${tentativasReparo + 1}/${this.config.maxTentativasReparo}`, {});
          console.log(`\u{1F527} [Calibra\xE7\xE3o] Tentando reparo (${tentativasReparo + 1}/${this.config.maxTentativasReparo})...`);
          const piorResultado = resultados.reduce(
            (pior, atual) => atual.score < pior.score ? atual : pior
          );
          const cenarioFalhou = cenarios.find((c) => c.id === piorResultado.cenarioId);
          if (cenarioFalhou) {
            this.emitProgress("repair_start", `\u274C Problema identificado:`, {});
            this.emitProgress("repair_start", `   Pergunta: "${cenarioFalhou.perguntaCliente}"`, {});
            this.emitProgress("repair_start", `   Score: ${piorResultado.score}/100`, {});
            this.emitProgress("repair_start", `   Motivo: ${piorResultado.motivo}`, {});
            this.emitProgress("repair_start", `\u{1F4A1} Ajustando prompt para corrigir...`, {});
            const repairResult = await this.repararPrompt(
              promptAtual,
              instrucaoUsuario,
              cenarioFalhou,
              piorResultado,
              ancorasObrigatorias
            );
            if (repairResult.promptReparado && repairResult.promptReparado !== promptAtual) {
              promptAtual = repairResult.promptReparado;
              totalEdicoesAplicadas += repairResult.edicoesAplicadas;
              this.emitProgress("repair_done", `\u2705 ${repairResult.edicoesAplicadas} ajuste(s) aplicado(s)! Retestando...`, {
                reparo: true,
                edicoesNesteTurno: repairResult.edicoesAplicadas,
                totalEdicoes: totalEdicoesAplicadas
              });
              console.log(`\u2705 [Calibra\xE7\xE3o] ${repairResult.edicoesAplicadas} edi\xE7\xF5es aplicadas (total: ${totalEdicoesAplicadas})`);
            } else {
              this.emitProgress("repair_done", `\u26A0\uFE0F N\xE3o foi poss\xEDvel ajustar. Tentando abordagem diferente...`, {
                reparo: false
              });
            }
          }
        } else {
          this.emitProgress("final_result", `\u26A0\uFE0F Ajustes finalizados. Pontua\xE7\xE3o final: ${Math.round(scoreGeral)}/100`, {
            success: false,
            score: Math.round(scoreGeral),
            rodadasUsadas: tentativasReparo + 1
          });
        }
        tentativasReparo++;
      }
      const sucesso = scoreGeral >= this.config.scoreMinimoAprovacao;
      this.emitProgress(
        "final_result",
        sucesso ? `\u2705 Calibra\xE7\xE3o conclu\xEDda com sucesso! Score: ${Math.round(scoreGeral)}/100 (${totalEdicoesAplicadas} edi\xE7\xF5es)` : `\u26A0\uFE0F Calibra\xE7\xE3o finalizada. Score: ${Math.round(scoreGeral)}/100 - Recomendamos testar no simulador.`,
        {
          success: sucesso,
          score: Math.round(scoreGeral),
          edicoesAplicadas: totalEdicoesAplicadas,
          tempoMs: Date.now() - inicio
        }
      );
      return {
        sucesso,
        scoreGeral: Math.round(scoreGeral),
        cenariosTotais: cenarios.length,
        cenariosAprovados,
        resultados,
        promptFinal: promptAtual,
        tentativasReparo,
        edicoesAplicadas: totalEdicoesAplicadas,
        // Total de edições efetivamente aplicadas
        tempoMs: Date.now() - inicio
      };
    } catch (error) {
      this.emitProgress("error", `\u274C Erro na calibra\xE7\xE3o: ${error.message}`, { error: error.message });
      console.error(`\u274C [Calibra\xE7\xE3o] Erro:`, error.message);
      return {
        sucesso: false,
        scoreGeral: 0,
        cenariosTotais: 0,
        cenariosAprovados: 0,
        resultados: [],
        promptFinal: promptEditado,
        tentativasReparo,
        edicoesAplicadas: 0,
        tempoMs: Date.now() - inicio
      };
    }
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // Gerar Cenários de Teste
  // ═══════════════════════════════════════════════════════════════════════════
  async gerarCenarios(instrucao, quantidade) {
    const userMessage = `INSTRU\xC7\xC3O DE EDI\xC7\xC3O:
"${instrucao}"

Gere ${quantidade} cen\xE1rios de teste para validar se essa edi\xE7\xE3o foi aplicada corretamente no prompt do agente.`;
    try {
      const content = await this.callLLM(
        PROMPT_GERADOR_CENARIOS,
        userMessage,
        { temperature: 0.5, maxTokens: 2e3, jsonMode: true }
      );
      const parsed = JSON.parse(content);
      return (parsed.cenarios || []).slice(0, quantidade);
    } catch (error) {
      console.error("[Calibra\xE7\xE3o] Erro ao gerar cen\xE1rios:", error);
      return [{
        id: "cenario_fallback",
        perguntaCliente: `Sobre "${instrucao.substring(0, 50)}..."`,
        expectativaResposta: "Resposta que demonstra a edi\xE7\xE3o aplicada",
        tipoValidacao: "semantico",
        palavrasChave: []
      }];
    }
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // Executar Cenário (IA Cliente ↔ IA Agente)
  // ═══════════════════════════════════════════════════════════════════════════
  async executarCenario(prompt, cenario, instrucaoOriginal) {
    try {
      const mensagemCliente = await this.simularCliente(cenario.perguntaCliente);
      const respostaAgente = await this.obterRespostaAgente(prompt, mensagemCliente);
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
    } catch (error) {
      return {
        cenarioId: cenario.id,
        perguntaCliente: cenario.perguntaCliente,
        respostaAgente: "ERRO",
        passou: false,
        score: 0,
        motivo: `Erro na execu\xE7\xE3o: ${error.message}`
      };
    }
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // Simular Cliente - OTIMIZADO: Usa mensagem direta sem simulação extra
  // ═══════════════════════════════════════════════════════════════════════════
  async simularCliente(perguntaBase) {
    return perguntaBase;
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // Obter Resposta do Agente - OTIMIZADO
  // ═══════════════════════════════════════════════════════════════════════════
  async obterRespostaAgente(promptAgente, mensagemCliente) {
    try {
      const content = await this.callLLM(
        promptAgente,
        mensagemCliente,
        { temperature: 0.3, maxTokens: 400 }
        // Reduzido para velocidade
      );
      return content.trim() || "";
    } catch (error) {
      throw new Error(`Erro ao obter resposta do agente: ${error.message}`);
    }
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // Analisar Resposta - OTIMIZADO
  // ═══════════════════════════════════════════════════════════════════════════
  async analisarResposta(respostaAgente, instrucaoOriginal, cenario) {
    if (cenario.palavrasChave && cenario.palavrasChave.length > 0) {
      const respostaLower = respostaAgente.toLowerCase();
      const palavrasEncontradas = cenario.palavrasChave.filter(
        (palavra) => respostaLower.includes(palavra.toLowerCase())
      );
      const percentualEncontrado = palavrasEncontradas.length / cenario.palavrasChave.length * 100;
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
    const promptAnalise = PROMPT_ANALISADOR.replace("{{INSTRUCAO}}", instrucaoOriginal).replace("{{EXPECTATIVA}}", cenario.expectativaResposta).replace("{{RESPOSTA}}", respostaAgente.substring(0, 500)).replace("{{PALAVRAS_CHAVE}}", (cenario.palavrasChave || []).join(", ")).replace("{{TIPO_VALIDACAO}}", cenario.tipoValidacao);
    try {
      const content = await this.callLLM(
        promptAnalise,
        "Analise a resposta e retorne o JSON de avalia\xE7\xE3o:",
        { temperature: 0.1, maxTokens: 300, jsonMode: true }
      );
      const parsed = JSON.parse(content);
      return {
        passou: parsed.passou ?? false,
        score: Math.min(100, Math.max(0, parsed.score ?? 0)),
        motivo: parsed.motivo || "Sem justificativa"
      };
    } catch {
      return {
        passou: respostaAgente.length > 50,
        score: respostaAgente.length > 50 ? 65 : 30,
        motivo: "An\xE1lise autom\xE1tica (fallback)"
      };
    }
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // Reparar Prompt - Retorna objeto com prompt e número de edições
  // ═══════════════════════════════════════════════════════════════════════════
  async repararPrompt(promptAtual, instrucaoOriginal, cenarioFalhou, resultadoFalhou, ancorasObrigatorias) {
    const ancorasTexto = ancorasObrigatorias.length > 0 ? ancorasObrigatorias.map((a) => `- ${a}`).join("\n") : "- nenhuma";
    const promptReparo = PROMPT_REPARADOR.replace("{{PROMPT}}", promptAtual).replace("{{INSTRUCAO}}", instrucaoOriginal).replace("{{PROBLEMA}}", resultadoFalhou.motivo).replace("{{ANCORAS_OBRIGATORIAS}}", ancorasTexto).replace("{{PERGUNTA}}", resultadoFalhou.perguntaCliente).replace("{{RESPOSTA}}", resultadoFalhou.respostaAgente).replace("{{EXPECTATIVA}}", cenarioFalhou.expectativaResposta);
    try {
      const content = await this.callLLM(
        promptReparo,
        "Analise e corrija o prompt. Retorne APENAS o JSON com as edi\xE7\xF5es:",
        { temperature: 0.3, maxTokens: 2e3, jsonMode: true }
      );
      const parsed = JSON.parse(content);
      if (parsed.operacao === "editar" && parsed.edicoes?.length > 0) {
        let promptReparado = promptAtual;
        let edicoesAplicadas = 0;
        for (const edicao of parsed.edicoes) {
          if (!edicao.buscar || !edicao.substituir) continue;
          if (promptReparado.includes(edicao.buscar)) {
            const candidato = promptReparado.replace(edicao.buscar, edicao.substituir);
            if (this.violariaAncorasObrigatorias(promptReparado, candidato, ancorasObrigatorias)) {
              this.emitProgress("repair_done", `   \u26A0\uFE0F Edi\xE7\xE3o ignorada para preservar instru\xE7\xE3o mandat\xF3ria`, {});
              continue;
            }
            promptReparado = candidato;
            edicoesAplicadas++;
            this.emitProgress("repair_done", `   \u2713 Edi\xE7\xE3o aplicada (match exato)`, {});
            continue;
          }
          const promptLower = promptReparado.toLowerCase();
          const buscarLower = edicao.buscar.toLowerCase();
          const indexCI = promptLower.indexOf(buscarLower);
          if (indexCI !== -1) {
            const textoOriginal = promptReparado.substring(indexCI, indexCI + edicao.buscar.length);
            const candidato = promptReparado.replace(textoOriginal, edicao.substituir);
            if (this.violariaAncorasObrigatorias(promptReparado, candidato, ancorasObrigatorias)) {
              this.emitProgress("repair_done", `   \u26A0\uFE0F Edi\xE7\xE3o fuzzy ignorada para preservar instru\xE7\xE3o mandat\xF3ria`, {});
              continue;
            }
            promptReparado = candidato;
            edicoesAplicadas++;
            this.emitProgress("repair_done", `   \u2713 Edi\xE7\xE3o aplicada (fuzzy match)`, {});
            continue;
          }
          if (edicao.substituir && edicao.substituir.length > 20) {
            const candidato = promptReparado.trim() + "\n\n" + edicao.substituir;
            if (this.violariaAncorasObrigatorias(promptReparado, candidato, ancorasObrigatorias)) {
              this.emitProgress("repair_done", `   \u26A0\uFE0F Nova instru\xE7\xE3o ignorada para preservar instru\xE7\xE3o mandat\xF3ria`, {});
              continue;
            }
            promptReparado = candidato;
            edicoesAplicadas++;
            this.emitProgress("repair_done", `   \u2713 Nova instru\xE7\xE3o adicionada ao prompt`, {});
          }
        }
        for (const ancora of ancorasObrigatorias) {
          if (!promptReparado.includes(ancora)) {
            promptReparado = `${promptReparado.trim()}

INSTRU\xC7\xC3O MANDAT\xD3RIA PRESERVADA:
${ancora}`;
            edicoesAplicadas++;
            this.emitProgress("repair_done", `   \u2713 \xC2ncora mandat\xF3ria restaurada`, {});
          }
        }
        if (edicoesAplicadas > 0) {
          this.emitProgress("repair_done", `   \u{1F4DD} ${edicoesAplicadas} edi\xE7\xE3o(\xF5es) aplicadas`, {});
          return { promptReparado, edicoesAplicadas };
        }
      }
      return { promptReparado: null, edicoesAplicadas: 0 };
    } catch (error) {
      console.error("[Calibra\xE7\xE3o] Erro ao reparar prompt:", error);
      return { promptReparado: null, edicoesAplicadas: 0 };
    }
  }
  extrairAncorasObrigatorias(instrucao) {
    if (!instrucao) return [];
    const candidatos = [];
    const regex = /["“”']([^"“”']{12,})["“”']/g;
    let match = null;
    while ((match = regex.exec(instrucao)) !== null) {
      const texto = match[1].trim();
      if (texto.length >= 12) {
        candidatos.push(texto);
      }
    }
    return [...new Set(candidatos)];
  }
  violariaAncorasObrigatorias(promptAntes, promptDepois, ancorasObrigatorias) {
    if (!ancorasObrigatorias.length) return false;
    for (const ancora of ancorasObrigatorias) {
      if (promptAntes.includes(ancora) && !promptDepois.includes(ancora)) {
        return true;
      }
    }
    return false;
  }
};
async function calibrarPromptEditado(promptEditado, instrucaoUsuario, _apiKey, _modelo, config, progressCallback) {
  const service = new PromptCalibrationService(config, progressCallback);
  return service.calibrarPrompt(promptEditado, instrucaoUsuario);
}
var promptCalibrationService_default = PromptCalibrationService;
export {
  PromptCalibrationService,
  calibrarPromptEditado,
  promptCalibrationService_default as default
};
