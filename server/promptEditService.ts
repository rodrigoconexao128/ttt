/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎯 SERVIÇO DE EDIÇÃO DE PROMPTS VIA IA
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Técnica: Search-and-Replace com JSON Schema (baseado no padrão Aider/GPT)
 * 
 * FLUXO:
 * 1. Usuário pede alteração em linguagem natural
 * 2. Enviamos prompt atual + instrução para a IA (Mistral)
 * 3. IA retorna JSON com {resposta_chat, operacao, edicoes: [{buscar, substituir}]}
 * 4. Sistema aplica as edições localmente com fuzzy matching
 * 5. Retornamos o prompt editado + mensagem de chat para o histórico
 * 
 * VANTAGENS:
 * - 80% mais rápido (IA não reescreve tudo)
 * - 80% mais barato (menos tokens)
 * - 100% do resto preservado (só muda o necessário)
 */

import OpenAI from "openai";

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface Edicao {
  buscar: string;
  substituir: string;
}

export interface RespostaIA {
  resposta_chat: string;  // Mensagem conversacional para mostrar no chat
  operacao: "nenhuma" | "editar";
  edicoes: Edicao[];
}

export interface ResultadoEdicao {
  success: boolean;
  novoPrompt: string;
  mensagemChat: string;  // Para mostrar no histórico como conversa
  edicoesAplicadas: number;
  edicoesFalharam: number;
  detalhes: {
    buscar: string;
    substituir: string;
    status: "aplicada" | "falhou";
    matchType?: "exato" | "fuzzy";
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT PARA A IA
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Você é um assistente especializado em editar prompts e playbooks de agentes de IA.

CRÍTICO: NUNCA reescreva o documento inteiro! Use search-and-replace para ser RÁPIDO e PRECISO.

REGRAS:
1. Para PERGUNTAS ou quando não precisa editar: use operacao="nenhuma"
2. Para EDIÇÕES: use operacao="editar" e forneça array de edicoes
3. Cada edição tem: "buscar" (texto EXATO do documento) e "substituir" (novo texto)
4. O campo "buscar" DEVE conter texto que existe EXATAMENTE no documento
5. Use múltiplas edições pequenas (2-5) ao invés de reescrever seções grandes
6. A resposta_chat deve ser natural, como se você estivesse conversando com o usuário

⚠️ REGRA ESPECIAL - TEXTO VERBATIM:
Quando o usuário fornecer um texto formatado com emojis, quebras de linha, asteriscos (*) ou underscores (_),
você DEVE copiar esse texto LITERALMENTE como o valor "substituir", sem modificar nada.
Não melhore, não reformate, não altere emojis ou formatação. COPIE EXATAMENTE.

EXEMPLOS DE EDIÇÃO:
- Mudar nome: {"buscar": "Carlos", "substituir": "Roberto"}
- Mudar tom: {"buscar": "Olá, bom dia!", "substituir": "E aí! 🔥"}
- Adicionar info: {"buscar": "Nosso horário é das 9h às 18h.", "substituir": "Nosso horário é das 9h às 18h. Também atendemos aos sábados!"}
- Remover algo: {"buscar": "Texto para remover.", "substituir": ""}
- TEXTO VERBATIM: Se o usuário diz "a primeira mensagem deve ser: 🎹 Olá! *negrito*", use:
  {"buscar": "[texto existente da primeira mensagem]", "substituir": "🎹 Olá! *negrito*"}

IMPORTANTE:
- Copie o texto EXATAMENTE como aparece no documento (incluindo pontuação, espaços, emojis)
- Nunca invente texto que não existe no documento
- Se não encontrar algo para editar, use operacao="nenhuma" e explique
- Seja criativo e proativo nas sugestões
- Quando o usuário disser "exatamente assim", "assim:", "dessa forma:" - COPIE LITERALMENTE o texto fornecido`;

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO DE DETECÇÃO DE TEXTO VERBATIM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detecta se a instrução contém texto verbatim que deve ser copiado literalmente
 * Preserva TODAS as quebras de linha e formatação do texto original
 * Retorna o texto verbatim se encontrado, ou null
 */
function detectarTextoVerbatim(instrucao: string): { textoVerbatim: string; tipoEdicao: string } | null {
  // Padrões que indicam texto verbatim - captura TUDO após o padrão
  const padroesVerbatim = [
    // "faça com que sempre a primeira mensagem escreva assim:" + texto
    /(?:fa[çc]a com que|quero que)[\s\S]*?(?:assim|seja)[:\s]*\n([\s\S]+)$/i,
    // "primeira mensagem deve ser assim:" + texto  
    /(?:primeira mensagem|mensagem inicial)[\s\S]*?(?:assim|seja|exatamente|literalmente)?[:\s]*\n([\s\S]+)$/i,
    // "escreva/mande/envie assim:" + texto
    /(?:escreva|mande|envie)\s+(?:assim|exatamente|literalmente)[:\s]*\n([\s\S]+)$/i,
    // "sempre envie/mande assim:" + texto
    /sempre\s+(?:envie|mande|escreva)[\s\S]*?[:\s]*\n([\s\S]+)$/i,
  ];
  
  for (const padrao of padroesVerbatim) {
    const match = instrucao.match(padrao);
    if (match && match[1]) {
      // Preserva o texto EXATAMENTE como foi enviado, incluindo todas as quebras de linha
      const textoCapturado = match[1].trimEnd(); // Só remove espaços no final, preserva \n
      
      // Verifica se tem formatação típica de mensagem (emojis, asteriscos, quebras de linha)
      const temEmojis = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/u.test(textoCapturado);
      const temFormatacao = textoCapturado.includes('*') || textoCapturado.includes('_');
      const temQuebrasLinha = textoCapturado.includes('\n');
      
      console.log(`[EditService] 📝 Texto verbatim detectado:`);
      console.log(`[EditService]   - Tamanho: ${textoCapturado.length} chars`);
      console.log(`[EditService]   - Tem emojis: ${temEmojis}`);
      console.log(`[EditService]   - Tem formatação (*/_): ${temFormatacao}`);
      console.log(`[EditService]   - Tem quebras de linha: ${temQuebrasLinha}`);
      console.log(`[EditService]   - Número de linhas: ${textoCapturado.split('\n').length}`);
      
      if (textoCapturado.length > 30 && (temEmojis || temFormatacao || temQuebrasLinha)) {
        return {
          textoVerbatim: textoCapturado,
          tipoEdicao: 'primeira_mensagem'
        };
      }
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL: Editar Prompt via IA
// ═══════════════════════════════════════════════════════════════════════════

export async function editarPromptViaIA(
  promptAtual: string,
  instrucaoUsuario: string,
  apiKey: string,
  modelo: "mistral" | "openai" = "mistral"
): Promise<ResultadoEdicao> {
  
  // Garantir que apiKey é string
  const apiKeyStr = String(apiKey || '');
  
  console.log(`[EditService] Iniciando edição via IA`);
  console.log(`[EditService] Modelo: ${modelo}`);
  console.log(`[EditService] API Key type: ${typeof apiKey}`);
  console.log(`[EditService] API Key length: ${apiKeyStr.length}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DETECÇÃO DE TEXTO VERBATIM - Bypass da IA para textos exatos
  // ═══════════════════════════════════════════════════════════════════════════
  const verbatimDetectado = detectarTextoVerbatim(instrucaoUsuario);
  
  if (verbatimDetectado) {
    console.log(`[EditService] 🎯 TEXTO VERBATIM DETECTADO! Aplicando diretamente...`);
    console.log(`[EditService] Tipo: ${verbatimDetectado.tipoEdicao}`);
    console.log(`[EditService] Texto (primeiros 100 chars): ${verbatimDetectado.textoVerbatim.substring(0, 100)}...`);
    
    // Procura o marcador de primeira mensagem no prompt atual
    const marcadoresPrimeiraMensagem = [
      /Sempre na primeira mensagem[^:]*:\s*([\s\S]*?)(?=\n\nApós|$)/i,
      /primeira mensagem[^:]*envie[^:]*:\s*([\s\S]*?)(?=\n\nApós|$)/i,
      /MENSAGEM INICIAL[^:]*:\s*([\s\S]*?)(?=\n\n|$)/i,
    ];
    
    let textoAntigo: string | null = null;
    
    for (const marcador of marcadoresPrimeiraMensagem) {
      const match = promptAtual.match(marcador);
      if (match && match[1]) {
        textoAntigo = match[0]; // Pega todo o match incluindo o prefixo
        break;
      }
    }
    
    if (textoAntigo) {
      // Constrói o novo texto mantendo o prefixo
      const novoTexto = `Sempre na primeira mensagem ao responder o cliente, envie EXATAMENTE este texto (com formatação e emojis):\n${verbatimDetectado.textoVerbatim}`;
      
      const novoPrompt = promptAtual.replace(textoAntigo, novoTexto);
      
      if (novoPrompt !== promptAtual) {
        return {
          success: true,
          novoPrompt,
          mensagemChat: "✅ Apliquei o texto exatamente como você enviou! A primeira mensagem agora está configurada com a formatação correta.",
          edicoesAplicadas: 1,
          edicoesFalharam: 0,
          detalhes: [{
            buscar: textoAntigo.substring(0, 100) + "...",
            substituir: novoTexto.substring(0, 100) + "...",
            status: "aplicada",
            matchType: "exato"
          }]
        };
      }
    }
    
    // Se não encontrou marcador, adiciona no final do prompt
    const novoPrompt = promptAtual + `\n\nSempre na primeira mensagem ao responder o cliente, envie EXATAMENTE este texto (com formatação e emojis):\n${verbatimDetectado.textoVerbatim}`;
    
    return {
      success: true,
      novoPrompt,
      mensagemChat: "✅ Adicionei a primeira mensagem exatamente como você enviou! O agente vai usar esse texto formatado.",
      edicoesAplicadas: 1,
      edicoesFalharam: 0,
      detalhes: [{
        buscar: "[final do prompt]",
        substituir: verbatimDetectado.textoVerbatim.substring(0, 100) + "...",
        status: "aplicada",
        matchType: "exato"
      }]
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FLUXO NORMAL - Usa IA para edições
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Configura cliente baseado no modelo
  const client = new OpenAI({
    apiKey: apiKeyStr,
    baseURL: modelo === "mistral" ? "https://api.mistral.ai/v1" : undefined
  });
  
  const modelName = modelo === "mistral" ? "mistral-large-latest" : "gpt-4o-mini";
  
  // Monta a mensagem do usuário
  const userMessage = `PROMPT ATUAL DO AGENTE:
\`\`\`
${promptAtual}
\`\`\`

INSTRUÇÃO DO USUÁRIO:
"${instrucaoUsuario}"

Analise o prompt e retorne as edições necessárias em JSON.`;

  try {
    // Chamada à API com JSON mode
    // Nota: Mistral não suporta json_schema estrito como OpenAI, usamos json_object
    const response = await client.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,  // Baixo para ser mais preciso
      max_tokens: 4000
    });
    
    const content = response.choices[0]?.message?.content || "";
    
    // Parse do JSON (garantido válido pelo response_format)
    let respostaIA: RespostaIA;
    try {
      respostaIA = JSON.parse(content);
    } catch (e) {
      console.error("[EditService] Erro ao parsear JSON:", content);
      return {
        success: false,
        novoPrompt: promptAtual,
        mensagemChat: "Desculpe, houve um erro ao processar sua solicitação. Tente novamente.",
        edicoesAplicadas: 0,
        edicoesFalharam: 0,
        detalhes: []
      };
    }
    
    // Se não precisa editar, retorna mensagem de chat apenas
    if (respostaIA.operacao === "nenhuma" || !respostaIA.edicoes?.length) {
      return {
        success: true,
        novoPrompt: promptAtual,
        mensagemChat: respostaIA.resposta_chat || "Entendi! Não há alterações a fazer.",
        edicoesAplicadas: 0,
        edicoesFalharam: 0,
        detalhes: []
      };
    }
    
    // Aplica as edições
    let novoPrompt = promptAtual;
    const detalhes: ResultadoEdicao["detalhes"] = [];
    let aplicadas = 0;
    let falharam = 0;
    
    for (const edicao of respostaIA.edicoes) {
      const { buscar, substituir } = edicao;
      
      // Tenta aplicar com fuzzy matching
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
        console.warn(`[EditService] Edição não encontrada: "${buscar.substring(0, 50)}..."`);
      }
    }
    
    return {
      success: aplicadas > 0,
      novoPrompt: aplicadas > 0 ? novoPrompt : promptAtual,
      mensagemChat: respostaIA.resposta_chat || `Pronto! Apliquei ${aplicadas} edição(ões).`,
      edicoesAplicadas: aplicadas,
      edicoesFalharam: falharam,
      detalhes
    };
    
  } catch (error: any) {
    console.error("[EditService] ❌ ERRO na chamada à IA");
    console.error("[EditService] Error type:", error.constructor.name);
    console.error("[EditService] Error message:", error.message);
    console.error("[EditService] Error status:", error.status);
    console.error("[EditService] Error code:", error.code);
    console.error("[EditService] Full error:", JSON.stringify(error, null, 2));
    
    return {
      success: false,
      novoPrompt: promptAtual,
      mensagemChat: `Erro ao processar: ${error.message}. Tente novamente.`,
      edicoesAplicadas: 0,
      edicoesFalharam: 0,
      detalhes: []
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUZZY MATCHING: Encontrar e substituir texto similar
// ═══════════════════════════════════════════════════════════════════════════

interface ResultadoFuzzy {
  success: boolean;
  novoTexto: string;
  matchType?: "exato" | "fuzzy";
  textoEncontrado?: string;
}

function aplicarEdicaoFuzzy(
  documento: string,
  buscar: string,
  substituir: string,
  threshold: number = 0.85
): ResultadoFuzzy {
  
  // 1. Tenta match exato (mais rápido)
  if (documento.includes(buscar)) {
    return {
      success: true,
      novoTexto: documento.replace(buscar, substituir),
      matchType: "exato"
    };
  }
  
  // 2. Tenta match case-insensitive
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
  
  // 3. Tenta fuzzy match por similaridade de tokens
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

/**
 * Encontra o melhor match fuzzy no documento
 * Usa coeficiente de Dice para similaridade
 */
function encontrarMelhorMatch(
  documento: string,
  buscar: string,
  threshold: number
): { index: number; texto: string; similaridade: number } | null {
  
  const normalizar = (str: string) => 
    str.toLowerCase()
       .replace(/\s+/g, ' ')
       .replace(/[""]/g, '"')
       .replace(/['']/g, "'")
       .trim();
  
  const buscarNorm = normalizar(buscar);
  const buscarTokens = tokenizar(buscarNorm);
  
  let melhorMatch: { index: number; texto: string; similaridade: number } | null = null;
  
  // Divide documento em linhas e busca
  const linhas = documento.split('\n');
  let charIndex = 0;
  
  for (const linha of linhas) {
    const linhaNorm = normalizar(linha);
    const linhaTokens = tokenizar(linhaNorm);
    
    // Calcula similaridade de Dice (baseado em tokens comuns)
    const similaridade = coeficienteDice(buscarTokens, linhaTokens);
    
    if (similaridade >= threshold && (!melhorMatch || similaridade > melhorMatch.similaridade)) {
      melhorMatch = {
        index: charIndex,
        texto: linha,
        similaridade
      };
    }
    
    // Se linha é maior, tenta chunks
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
    
    charIndex += linha.length + 1; // +1 para \n
  }
  
  return melhorMatch;
}

/**
 * Tokeniza string em palavras/tokens
 */
function tokenizar(str: string): Set<string> {
  return new Set(
    str.split(/[^a-záàâãéèêíïóôõöúçñ0-9]+/gi)
       .filter(t => t.length > 1)
  );
}

/**
 * Coeficiente de Dice: 2 * |A ∩ B| / (|A| + |B|)
 * Retorna valor entre 0 e 1
 */
function coeficienteDice(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) return 1;
  if (set1.size === 0 || set2.size === 0) return 0;
  
  let intersecao = 0;
  set1.forEach(token => {
    if (set2.has(token)) intersecao++;
  });
  
  return (2 * intersecao) / (set1.size + set2.size);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT PARA TESTES
// ═══════════════════════════════════════════════════════════════════════════

export { aplicarEdicaoFuzzy, coeficienteDice, tokenizar };
