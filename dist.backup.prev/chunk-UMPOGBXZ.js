import {
  chatComplete
} from "./chunk-V4YYF62A.js";

// server/promptEditService.ts
var SYSTEM_PROMPT = `Voc\xEA \xE9 um EDITOR DE PROMPTS. Sua tarefa \xE9 modificar o prompt do agente conforme a instru\xE7\xE3o do usu\xE1rio.

IMPORTANTE: SEMPRE fa\xE7a edi\xE7\xF5es quando o usu\xE1rio pedir uma mudan\xE7a. Nunca diga "OK, feito!" sem fazer edi\xE7\xF5es reais.

FORMATO DE RESPOSTA (JSON):
{"resposta_chat":"Descri\xE7\xE3o do que foi alterado","operacao":"editar","edicoes":[{"buscar":"TEXTO EXATO do prompt original","substituir":"TEXTO MODIFICADO"}]}

REGRAS OBRIGAT\xD3RIAS:
1. "buscar" DEVE conter texto que EXISTE no prompt original (copie exatamente)
2. "substituir" cont\xE9m o texto modificado
3. SEMPRE use operacao="editar" quando houver mudan\xE7as
4. Fa\xE7a pelo menos 1 edi\xE7\xE3o para cada solicita\xE7\xE3o
5. Seja espec\xEDfico - encontre trechos exatos para modificar
6. Preserve o restante do prompt; NUNCA reescreva se\xE7\xF5es n\xE3o solicitadas
7. Se a instru\xE7\xE3o do usu\xE1rio trouxer texto entre aspas, preserve esse texto literalmente

TIPOS DE EDI\xC7\xC3O:
\u2022 MUDAR: {"buscar":"texto antigo existente","substituir":"texto novo"}
\u2022 ADICIONAR: {"buscar":"\xFAltima linha de uma se\xE7\xE3o","substituir":"\xFAltima linha\\n+ NOVO CONTE\xDADO"}
\u2022 REMOVER: {"buscar":"texto a remover","substituir":""}

EXEMPLOS:
Usu\xE1rio: "seja mais formal"
\u2192 {"resposta_chat":"Tornei o tom mais formal","operacao":"editar","edicoes":[{"buscar":"Oi! Tudo bem?","substituir":"Ol\xE1, como posso ajud\xE1-lo?"}]}

Usu\xE1rio: "adicione sauda\xE7\xE3o"
\u2192 {"resposta_chat":"Adicionei sauda\xE7\xE3o inicial","operacao":"editar","edicoes":[{"buscar":"REGRAS:","substituir":"SAUDA\xC7\xC3O: Sempre cumprimente o cliente\\n\\nREGRAS:"}]}

RESPONDA APENAS O JSON, nada antes ou depois.`;
async function editarPromptViaIA(promptAtual, instrucaoUsuario, _apiKey, _modelo) {
  console.log(`[EditService] Iniciando edi\xE7\xE3o via IA (OpenRouter/Chutes)`);
  const userMessage = `ANALISE O PROMPT ABAIXO E APLIQUE A MODIFICA\xC7\xC3O SOLICITADA:

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
PROMPT ATUAL DO AGENTE:
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
${promptAtual}
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

INSTRU\xC7\xC3O DO USU\xC1RIO: "${instrucaoUsuario}"

TAREFA: Encontre os trechos do prompt acima que precisam ser modificados e gere as edi\xE7\xF5es.
RESPONDA com JSON: {"resposta_chat":"...", "operacao":"editar", "edicoes":[{"buscar":"trecho exato", "substituir":"novo trecho"}]}`;
  const MAX_RETRIES = 10;
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[EditService] Tentativa ${attempt}/${MAX_RETRIES}...`);
      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage }
      ];
      const response = await chatComplete({
        messages,
        temperature: 0.3,
        // Baixo para ser mais preciso
        maxTokens: 4e3
      });
      let content = response.choices?.[0]?.message?.content || "";
      if (!content || content.trim() === "") {
        throw new Error("Resposta vazia do LLM");
      }
      console.log(`[EditService] Resposta bruta do LLM (${content.length} chars): ${content.substring(0, 200)}...`);
      let jsonContent = content;
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonContent = codeBlockMatch[1].trim();
        console.log(`[EditService] JSON extra\xEDdo de code block`);
      } else {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonContent = jsonMatch[0];
          console.log(`[EditService] JSON extra\xEDdo via regex`);
        }
      }
      jsonContent = jsonContent.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").trim();
      if (!jsonContent || jsonContent === "") {
        throw new Error("JSON n\xE3o encontrado na resposta");
      }
      let respostaIA;
      try {
        respostaIA = JSON.parse(jsonContent);
        if (!respostaIA.resposta_chat && !respostaIA.operacao) {
          if (typeof respostaIA === "object") {
            console.log(`[EditService] JSON parcial detectado, tentando recuperar...`);
            respostaIA.resposta_chat = respostaIA.resposta_chat || "Entendi sua solicita\xE7\xE3o.";
            respostaIA.operacao = respostaIA.operacao || "nenhuma";
            respostaIA.edicoes = respostaIA.edicoes || [];
          } else {
            throw new Error("JSON incompleto - falta resposta_chat ou operacao");
          }
        }
        if (!Array.isArray(respostaIA.edicoes)) {
          respostaIA.edicoes = [];
        }
      } catch (e) {
        console.warn(`[EditService] Erro ao parsear JSON (tentativa ${attempt}):`, e.message);
        console.warn(`[EditService] JSON tentado: ${jsonContent.substring(0, 300)}...`);
        if (attempt === MAX_RETRIES) {
          return {
            success: false,
            novoPrompt: promptAtual,
            mensagemChat: "Entendi sua solicita\xE7\xE3o! Por favor, tente novamente com instru\xE7\xF5es mais espec\xEDficas sobre o que deseja alterar.",
            edicoesAplicadas: 0,
            edicoesFalharam: 0,
            detalhes: []
          };
        }
        throw new Error(`JSON inv\xE1lido: ${e.message}`);
      }
      if (respostaIA.operacao === "nenhuma" || !respostaIA.edicoes?.length) {
        return {
          success: true,
          novoPrompt: promptAtual,
          mensagemChat: respostaIA.resposta_chat || "Entendi! N\xE3o h\xE1 altera\xE7\xF5es a fazer.",
          edicoesAplicadas: 0,
          edicoesFalharam: 0,
          detalhes: []
        };
      }
      let novoPrompt = promptAtual;
      const detalhes = [];
      let aplicadas = 0;
      let falharam = 0;
      for (const edicao of respostaIA.edicoes) {
        const { buscar, substituir } = edicao;
        const resultado = aplicarEdicaoFuzzy(novoPrompt, buscar, substituir, 0.85);
        if (resultado.success) {
          novoPrompt = resultado.novoTexto;
          aplicadas++;
          detalhes.push({
            buscar,
            substituir,
            status: "aplicada",
            matchType: resultado.matchType
          });
        } else {
          falharam++;
          detalhes.push({
            buscar,
            substituir,
            status: "falhou"
          });
          console.warn(`[EditService] Edi\xE7\xE3o n\xE3o encontrada: "${buscar.substring(0, 50)}..."`);
        }
      }
      console.log(`[EditService] \u2705 Edi\xE7\xE3o conclu\xEDda: ${aplicadas} aplicadas, ${falharam} falharam`);
      return {
        success: aplicadas > 0,
        novoPrompt: aplicadas > 0 ? novoPrompt : promptAtual,
        mensagemChat: respostaIA.resposta_chat || `Pronto! Apliquei ${aplicadas} edi\xE7\xE3o(\xF5es).`,
        edicoesAplicadas: aplicadas,
        edicoesFalharam: falharam,
        detalhes
      };
    } catch (error) {
      lastError = error.message;
      console.warn(`[EditService] \u26A0\uFE0F Tentativa ${attempt} falhou: ${error.message}`);
      if (attempt < MAX_RETRIES) {
        const delay = Math.min(Math.pow(2, attempt) * 1e3, 6e4);
        console.log(`[EditService] \u23F3 Aguardando ${delay / 1e3}s antes de tentar novamente...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  console.error(`[EditService] \u274C Todas as ${MAX_RETRIES} tentativas falharam`);
  return {
    success: false,
    novoPrompt: promptAtual,
    mensagemChat: `\u26A0\uFE0F O sistema est\xE1 temporariamente ocupado. Por favor, tente novamente em alguns segundos. Sua edi\xE7\xE3o ser\xE1 processada na pr\xF3xima tentativa.`,
    edicoesAplicadas: 0,
    edicoesFalharam: 0,
    detalhes: []
  };
}
function aplicarEdicaoFuzzy(documento, buscar, substituir, threshold = 0.85) {
  if (documento.includes(buscar)) {
    return {
      success: true,
      novoTexto: documento.replace(buscar, substituir),
      matchType: "exato"
    };
  }
  const docLower = documento.toLowerCase();
  const buscarLower = buscar.toLowerCase();
  const indexCaseInsensitive = docLower.indexOf(buscarLower);
  if (indexCaseInsensitive !== -1) {
    const textoOriginal = documento.substring(indexCaseInsensitive, indexCaseInsensitive + buscar.length);
    return {
      success: true,
      novoTexto: documento.replace(textoOriginal, substituir),
      matchType: "fuzzy",
      textoEncontrado: textoOriginal
    };
  }
  const match = encontrarMelhorMatch(documento, buscar, threshold);
  if (match) {
    const antes = documento.substring(0, match.index);
    const depois = documento.substring(match.index + match.texto.length);
    return {
      success: true,
      novoTexto: antes + substituir + depois,
      matchType: "fuzzy",
      textoEncontrado: match.texto
    };
  }
  return {
    success: false,
    novoTexto: documento
  };
}
function encontrarMelhorMatch(documento, buscar, threshold) {
  const normalizar = (str) => str.toLowerCase().replace(/\s+/g, " ").replace(/[""]/g, '"').replace(/['']/g, "'").trim();
  const buscarNorm = normalizar(buscar);
  const buscarTokens = tokenizar(buscarNorm);
  let melhorMatch = null;
  const linhas = documento.split("\n");
  let charIndex = 0;
  for (const linha of linhas) {
    const linhaNorm = normalizar(linha);
    const linhaTokens = tokenizar(linhaNorm);
    const similaridade = coeficienteDice(buscarTokens, linhaTokens);
    if (similaridade >= threshold && (!melhorMatch || similaridade > melhorMatch.similaridade)) {
      melhorMatch = {
        index: charIndex,
        texto: linha,
        similaridade
      };
    }
    if (linha.length > buscar.length * 1.5) {
      for (let i = 0; i <= linha.length - buscar.length; i += Math.max(1, Math.floor(buscar.length / 3))) {
        const chunk = linha.substring(i, Math.min(i + buscar.length + 30, linha.length));
        const chunkNorm = normalizar(chunk);
        const chunkTokens = tokenizar(chunkNorm);
        const chunkSim = coeficienteDice(buscarTokens, chunkTokens);
        if (chunkSim >= threshold && (!melhorMatch || chunkSim > melhorMatch.similaridade)) {
          melhorMatch = {
            index: charIndex + i,
            texto: chunk,
            similaridade: chunkSim
          };
        }
      }
    }
    charIndex += linha.length + 1;
  }
  return melhorMatch;
}
function tokenizar(str) {
  return new Set(
    str.split(/[^a-záàâãéèêíïóôõöúçñ0-9]+/gi).filter((t) => t.length > 1)
  );
}
function coeficienteDice(set1, set2) {
  if (set1.size === 0 && set2.size === 0) return 1;
  if (set1.size === 0 || set2.size === 0) return 0;
  let intersecao = 0;
  set1.forEach((token) => {
    if (set2.has(token)) intersecao++;
  });
  return 2 * intersecao / (set1.size + set2.size);
}

export {
  editarPromptViaIA,
  aplicarEdicaoFuzzy,
  tokenizar,
  coeficienteDice
};
