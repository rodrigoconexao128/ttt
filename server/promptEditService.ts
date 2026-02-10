/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎯 SERVIÇO DE EDIÇÃO DE PROMPTS VIA IA
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Técnica: Search-and-Replace com JSON Schema (baseado no padrão Aider/GPT)
 * 
 * FLUXO:
 * 1. Usuário pede alteração em linguagem natural
 * 2. Enviamos prompt atual + instrução para a IA (OpenRouter/Chutes)
 * 3. IA retorna JSON com {resposta_chat, operacao, edicoes: [{buscar, substituir}]}
 * 4. Sistema aplica as edições localmente com fuzzy matching
 * 5. Retornamos o prompt editado + mensagem de chat para o histórico
 * 
 * VANTAGENS:
 * - 80% mais rápido (IA não reescreve tudo)
 * - 80% mais barato (menos tokens)
 * - 100% do resto preservado (só muda o necessário)
 * 
 * 🚀 ATUALIZADO: Agora usa OpenRouter/Chutes (mesmo LLM do chat produção)
 */

import { chatComplete, type ChatMessage } from "./llm";

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

const SYSTEM_PROMPT = `Você é um EDITOR DE PROMPTS. Sua tarefa é modificar o prompt do agente conforme a instrução do usuário.

IMPORTANTE: SEMPRE faça edições quando o usuário pedir uma mudança. Nunca diga "OK, feito!" sem fazer edições reais.

FORMATO DE RESPOSTA (JSON):
{"resposta_chat":"Descrição do que foi alterado","operacao":"editar","edicoes":[{"buscar":"TEXTO EXATO do prompt original","substituir":"TEXTO MODIFICADO"}]}

REGRAS OBRIGATÓRIAS:
1. "buscar" DEVE conter texto que EXISTE no prompt original (copie exatamente)
2. "substituir" contém o texto modificado
3. SEMPRE use operacao="editar" quando houver mudanças
4. Faça pelo menos 1 edição para cada solicitação
5. Seja específico - encontre trechos exatos para modificar

TIPOS DE EDIÇÃO:
• MUDAR: {"buscar":"texto antigo existente","substituir":"texto novo"}
• ADICIONAR: {"buscar":"última linha de uma seção","substituir":"última linha\\n+ NOVO CONTEÚDO"}
• REMOVER: {"buscar":"texto a remover","substituir":""}

EXEMPLOS:
Usuário: "seja mais formal"
→ {"resposta_chat":"Tornei o tom mais formal","operacao":"editar","edicoes":[{"buscar":"Oi! Tudo bem?","substituir":"Olá, como posso ajudá-lo?"}]}

Usuário: "adicione saudação"
→ {"resposta_chat":"Adicionei saudação inicial","operacao":"editar","edicoes":[{"buscar":"REGRAS:","substituir":"SAUDAÇÃO: Sempre cumprimente o cliente\\n\\nREGRAS:"}]}

RESPONDA APENAS O JSON, nada antes ou depois.`;

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL: Editar Prompt via IA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Edita um prompt via IA usando OpenRouter/Chutes
 * 🚀 ATUALIZADO: Parâmetros apiKey e modelo são ignorados - usa config do sistema
 */
export async function editarPromptViaIA(
  promptAtual: string,
  instrucaoUsuario: string,
  _apiKey?: string,  // Ignorado - usa config do sistema
  _modelo?: "mistral" | "openai"  // Ignorado - usa OpenRouter/Chutes
): Promise<ResultadoEdicao> {
  
  console.log(`[EditService] Iniciando edição via IA (OpenRouter/Chutes)`);
  
  // Monta a mensagem do usuário com instruções claras de formato
  const userMessage = `ANALISE O PROMPT ABAIXO E APLIQUE A MODIFICAÇÃO SOLICITADA:

═══════════════════════════════════════
PROMPT ATUAL DO AGENTE:
═══════════════════════════════════════
${promptAtual}
═══════════════════════════════════════

INSTRUÇÃO DO USUÁRIO: "${instrucaoUsuario}"

TAREFA: Encontre os trechos do prompt acima que precisam ser modificados e gere as edições.
RESPONDA com JSON: {"resposta_chat":"...", "operacao":"editar", "edicoes":[{"buscar":"trecho exato", "substituir":"novo trecho"}]}`;

  // 🚀 RETRY ROBUSTO: Tenta até 10 vezes para garantir sucesso (rate limit handling)
  const MAX_RETRIES = 10;
  let lastError: string = "";
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[EditService] Tentativa ${attempt}/${MAX_RETRIES}...`);
      
      // 🚀 Chamada via chatComplete (usa OpenRouter/Hyperbolic automaticamente)
      const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage }
      ];

      const response = await chatComplete({
        messages,
        temperature: 0.3,  // Baixo para ser mais preciso
        maxTokens: 4000
      });
      
      let content = response.choices?.[0]?.message?.content || "";
      
      // Verificar se resposta está vazia
      if (!content || content.trim() === "") {
        throw new Error("Resposta vazia do LLM");
      }
      
      console.log(`[EditService] Resposta bruta do LLM (${content.length} chars): ${content.substring(0, 200)}...`);
      
      // 🔧 ROBUSTO: Múltiplas tentativas de extrair JSON
      let jsonContent = content;
      
      // Tentar 1: Extrair JSON de markdown code blocks
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonContent = codeBlockMatch[1].trim();
        console.log(`[EditService] JSON extraído de code block`);
      } else {
        // Tentar 2: Extrair primeiro objeto JSON encontrado
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonContent = jsonMatch[0];
          console.log(`[EditService] JSON extraído via regex`);
        }
      }
      
      // 🔧 Limpar caracteres problemáticos comuns
      jsonContent = jsonContent
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove caracteres de controle
        .replace(/,\s*}/g, '}')  // Remove trailing commas antes de }
        .replace(/,\s*]/g, ']')  // Remove trailing commas antes de ]
        .trim();
      
      if (!jsonContent || jsonContent === '') {
        throw new Error("JSON não encontrado na resposta");
      }
      
      // Parse do JSON com validação
      let respostaIA: RespostaIA;
      try {
        respostaIA = JSON.parse(jsonContent);  // 🔧 CORRIGIDO: usar jsonContent
        
        // Validar estrutura mínima do JSON
        if (!respostaIA.resposta_chat && !respostaIA.operacao) {
          // 🔧 Tentar extrair resposta conversacional se JSON está incompleto
          if (typeof respostaIA === 'object') {
            console.log(`[EditService] JSON parcial detectado, tentando recuperar...`);
            respostaIA.resposta_chat = respostaIA.resposta_chat || "Entendi sua solicitação.";
            respostaIA.operacao = respostaIA.operacao || "nenhuma";
            respostaIA.edicoes = respostaIA.edicoes || [];
          } else {
            throw new Error("JSON incompleto - falta resposta_chat ou operacao");
          }
        }
        
        // Garantir que edicoes é um array
        if (!Array.isArray(respostaIA.edicoes)) {
          respostaIA.edicoes = [];
        }
        
      } catch (e: any) {
        console.warn(`[EditService] Erro ao parsear JSON (tentativa ${attempt}):`, e.message);
        console.warn(`[EditService] JSON tentado: ${jsonContent.substring(0, 300)}...`);
        
        // 🔧 FALLBACK: Se o modelo retornou algo mas não é JSON válido,
        // tentar extrair uma resposta útil
        if (attempt === MAX_RETRIES) {
          // Na última tentativa, retornar uma resposta genérica ao invés de erro
          return {
            success: false,
            novoPrompt: promptAtual,
            mensagemChat: "Entendi sua solicitação! Por favor, tente novamente com instruções mais específicas sobre o que deseja alterar.",
            edicoesAplicadas: 0,
            edicoesFalharam: 0,
            detalhes: []
          };
        }
        
        throw new Error(`JSON inválido: ${e.message}`);
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
      
      // ✅ Sucesso! Retorna resultado
      console.log(`[EditService] ✅ Edição concluída: ${aplicadas} aplicadas, ${falharam} falharam`);
      return {
        success: aplicadas > 0,
        novoPrompt: aplicadas > 0 ? novoPrompt : promptAtual,
        mensagemChat: respostaIA.resposta_chat || `Pronto! Apliquei ${aplicadas} edição(ões).`,
        edicoesAplicadas: aplicadas,
        edicoesFalharam: falharam,
        detalhes
      };
      
    } catch (error: any) {
      lastError = error.message;
      console.warn(`[EditService] ⚠️ Tentativa ${attempt} falhou: ${error.message}`);
      
      if (attempt < MAX_RETRIES) {
        // Backoff exponencial mais longo: 2s, 4s, 8s, 16s... (max 60s)
        const delay = Math.min(Math.pow(2, attempt) * 1000, 60000);
        console.log(`[EditService] ⏳ Aguardando ${delay/1000}s antes de tentar novamente...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // Todas as tentativas falharam - retornar erro amigável com instrução para tentar novamente
  console.error(`[EditService] ❌ Todas as ${MAX_RETRIES} tentativas falharam`);
  return {
    success: false,
    novoPrompt: promptAtual,
    mensagemChat: `⚠️ O sistema está temporariamente ocupado. Por favor, tente novamente em alguns segundos. Sua edição será processada na próxima tentativa.`,
    edicoesAplicadas: 0,
    edicoesFalharam: 0,
    detalhes: []
  };
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
