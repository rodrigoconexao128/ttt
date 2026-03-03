import {
  db,
  withRetry
} from "./chunk-FNECUBN2.js";

// server/chatbotFlowEngine.ts
import { sql as sql2 } from "drizzle-orm";

// server/hybridAIFlowEngine.ts
import { sql } from "drizzle-orm";
var DIAS_SEMANA = ["domingo", "segunda", "ter\xE7a", "quarta", "quinta", "sexta", "s\xE1bado"];
function parseNaturalDate(text) {
  const normalized = text.toLowerCase().trim().replace(/[áàâã]/g, "a").replace(/[éèê]/g, "e").replace(/[íìî]/g, "i").replace(/[óòôõ]/g, "o").replace(/[úùû]/g, "u").replace(/[ç]/g, "c");
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  let targetDate = null;
  let confidence = 0.8;
  if (/^hoje$/i.test(normalized) || /\bhoje\b/i.test(normalized)) {
    targetDate = today;
    confidence = 1;
  } else if (/^amanha$/i.test(normalized) || /\bamanha\b/i.test(normalized)) {
    targetDate = new Date(today);
    targetDate.setDate(today.getDate() + 1);
    confidence = 1;
  } else if (/depois de amanha/i.test(normalized) || /depois d'amanha/i.test(normalized)) {
    targetDate = new Date(today);
    targetDate.setDate(today.getDate() + 2);
    confidence = 1;
  } else if (/proxima semana/i.test(normalized) || /semana que vem/i.test(normalized)) {
    targetDate = new Date(today);
    targetDate.setDate(today.getDate() + 7);
    confidence = 0.7;
  } else if (/daqui (\d+) dias?/i.test(normalized) || /em (\d+) dias?/i.test(normalized)) {
    const match = normalized.match(/(?:daqui|em) (\d+) dias?/i);
    if (match) {
      const days = parseInt(match[1]);
      targetDate = new Date(today);
      targetDate.setDate(today.getDate() + days);
      confidence = 0.9;
    }
  } else {
    const diasCompletos = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
    const diasComFeira = ["segunda-feira", "terca-feira", "quarta-feira", "quinta-feira", "sexta-feira"];
    let foundDayIndex = -1;
    for (let i = 0; i < diasCompletos.length; i++) {
      if (normalized.includes(diasCompletos[i])) {
        foundDayIndex = i;
        break;
      }
    }
    if (foundDayIndex >= 0) {
      const currentDay = today.getDay();
      let daysToAdd = foundDayIndex - currentDay;
      if (daysToAdd <= 0) {
        daysToAdd += 7;
      }
      if (normalized.includes("proxim")) {
        if (daysToAdd <= 0) {
          daysToAdd += 7;
        }
      }
      targetDate = new Date(today);
      targetDate.setDate(today.getDate() + daysToAdd);
      confidence = 0.9;
    } else {
      const diaMatch = normalized.match(/dia (\d{1,2})/i);
      if (diaMatch) {
        const day2 = parseInt(diaMatch[1]);
        if (day2 >= 1 && day2 <= 31) {
          targetDate = new Date(today);
          targetDate.setDate(day2);
          if (targetDate <= today) {
            targetDate.setMonth(targetDate.getMonth() + 1);
          }
          confidence = 0.85;
        }
      }
      const slashMatch = normalized.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
      if (slashMatch && !targetDate) {
        const day2 = parseInt(slashMatch[1]);
        const month2 = parseInt(slashMatch[2]) - 1;
        let year2 = slashMatch[3] ? parseInt(slashMatch[3]) : today.getFullYear();
        if (year2 < 100) {
          year2 += 2e3;
        }
        if (day2 >= 1 && day2 <= 31 && month2 >= 0 && month2 <= 11) {
          targetDate = new Date(year2, month2, day2);
          if (targetDate <= today && !slashMatch[3]) {
            targetDate.setFullYear(targetDate.getFullYear() + 1);
          }
          confidence = 0.95;
        }
      }
      const mesMatch = normalized.match(/(\d{1,2}) de (\w+)/i);
      if (mesMatch && !targetDate) {
        const day2 = parseInt(mesMatch[1]);
        const mesText = mesMatch[2].toLowerCase().replace(/[áàâã]/g, "a").replace(/[éèê]/g, "e").replace(/[íìî]/g, "i").replace(/[óòôõ]/g, "o").replace(/[úùû]/g, "u").replace(/[ç]/g, "c");
        const mesesNorm = [
          "janeiro",
          "fevereiro",
          "marco",
          "abril",
          "maio",
          "junho",
          "julho",
          "agosto",
          "setembro",
          "outubro",
          "novembro",
          "dezembro"
        ];
        let monthIndex = mesesNorm.findIndex((m) => mesText.startsWith(m.substring(0, 3)));
        if (monthIndex >= 0 && day2 >= 1 && day2 <= 31) {
          targetDate = new Date(today.getFullYear(), monthIndex, day2);
          if (targetDate <= today) {
            targetDate.setFullYear(targetDate.getFullYear() + 1);
          }
          confidence = 0.9;
        }
      }
    }
  }
  if (!targetDate) {
    return null;
  }
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, "0");
  const day = String(targetDate.getDate()).padStart(2, "0");
  return {
    date: `${year}-${month}-${day}`,
    formatted: `${day}/${month}/${year}`,
    dayOfWeek: DIAS_SEMANA[targetDate.getDay()],
    confidence,
    original: text
  };
}
function extractDateFromText(text) {
  const direct = parseNaturalDate(text);
  if (direct) return direct;
  const patterns = [
    /(?:para|no|na|em|dia|data|agendar para|marcar para)\s+([^\d]*?\d{1,2}[^\d]*)/i,
    /(?:para|no|na|em)\s+(hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)/i,
    /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/,
    /dia (\d{1,2})/i,
    /(proxim[ao]\s+\w+)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const result = parseNaturalDate(match[1] || match[0]);
      if (result) return result;
    }
  }
  return null;
}
function parseNaturalTime(text) {
  const normalized = text.toLowerCase().trim().replace(/[áàâã]/g, "a").replace(/[éèê]/g, "e").replace(/[íìî]/g, "i").replace(/[óòôõ]/g, "o").replace(/[úùû]/g, "u");
  let hours = null;
  let minutes = 0;
  let confidence = 0.8;
  const timeMatch = normalized.match(/(\d{1,2})[:h](\d{2})?/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1]);
    minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    confidence = 0.95;
  } else if (/(\d{1,2})\s*(?:h(?:oras?)?|hrs?)/.test(normalized)) {
    const match = normalized.match(/(\d{1,2})\s*(?:h(?:oras?)?|hrs?)/);
    if (match) {
      hours = parseInt(match[1]);
      confidence = 0.9;
    }
  } else if (/\b(manha|manhã)\b/i.test(text)) {
    hours = 9;
    confidence = 0.5;
  } else if (/\b(tarde)\b/i.test(text)) {
    hours = 14;
    confidence = 0.5;
  } else if (/\b(noite)\b/i.test(text)) {
    hours = 19;
    confidence = 0.5;
  } else if (/meio[- ]?dia/i.test(normalized)) {
    hours = 12;
    confidence = 0.95;
  } else if (/meia[- ]?noite/i.test(normalized)) {
    hours = 0;
    confidence = 0.95;
  }
  if (hours === null || hours < 0 || hours > 23) {
    return null;
  }
  if (hours <= 12) {
    if (/da tarde|pm/i.test(normalized) && hours < 12) {
      hours += 12;
    } else if (/da noite/i.test(normalized) && hours < 12 && hours !== 0) {
      hours += 12;
    } else if (/da manha|am/i.test(normalized) && hours === 12) {
      hours = 0;
    }
  }
  let period;
  if (hours >= 5 && hours < 12) {
    period = "manha";
  } else if (hours >= 12 && hours < 18) {
    period = "tarde";
  } else {
    period = "noite";
  }
  const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return {
    time: timeStr,
    formatted: `${hours}:${String(minutes).padStart(2, "0")}`,
    period,
    confidence,
    original: text
  };
}
function extractTimeFromText(text) {
  const direct = parseNaturalTime(text);
  if (direct) return direct;
  const patterns = [
    /(?:as|às|para as|horario|hora)\s*(\d{1,2}[:h]\d{2}|\d{1,2}\s*(?:h(?:oras?)?)?)/i,
    /(\d{1,2}[:h]\d{2})/,
    /(\d{1,2}\s*(?:da manha|da tarde|da noite))/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const result = parseNaturalTime(match[1] || match[0]);
      if (result) return result;
    }
  }
  return null;
}
var INTENT_KEYWORDS = {
  greeting: ["oi", "ol\xE1", "ola", "bom dia", "boa tarde", "boa noite", "hey", "eae", "eai", "fala", "salve", "opa"],
  menu: ["cardapio", "card\xE1pio", "menu", "opcoes", "op\xE7\xF5es", "catalogo", "cat\xE1logo", "ver", "mostrar", "lista", "servicos", "servi\xE7os"],
  order: ["pedir", "pedido", "quero", "gostaria", "fazer pedido", "encomendar", "delivery", "entrega", "comprar"],
  schedule: ["agendar", "marcar", "horario", "hor\xE1rio", "agenda", "reservar", "reserva", "consulta", "atendimento", "disponibilidade", "data", "dia"],
  price: ["preco", "pre\xE7o", "valor", "quanto", "custo", "custa", "valores", "tabela"],
  service: ["corte", "escova", "manicure", "pedicure", "massagem", "limpeza", "instalacao", "instala\xE7\xE3o", "reparo", "conserto", "manuten\xE7\xE3o", "manutencao"],
  status: ["status", "situacao", "situa\xE7\xE3o", "andamento", "onde", "chegou", "previsao", "previs\xE3o"],
  cancel: ["cancelar", "cancela", "desistir", "desisto", "nao quero mais", "n\xE3o quero mais"],
  edit: ["alterar", "mudar", "trocar", "editar", "modificar", "adicionar", "remover", "tirar"],
  address: ["endereco", "endere\xE7o", "rua", "avenida", "numero", "n\xFAmero", "bairro", "cep", "complemento"],
  payment: ["pagamento", "pagar", "pix", "cartao", "cart\xE3o", "dinheiro", "credito", "cr\xE9dito", "debito", "d\xE9bito", "troco"],
  hours: ["horario funcionamento", "hor\xE1rio funcionamento", "abre", "fecha", "aberto", "fechado", "funciona"],
  location: ["onde fica", "localizacao", "localiza\xE7\xE3o", "como chego", "como chegar", "mapa"],
  human: ["atendente", "humano", "pessoa", "falar com alguem", "falar com algu\xE9m", "suporte", "ajuda humana"],
  help: ["ajuda", "help", "duvida", "d\xFAvida", "como funciona", "nao entendi", "n\xE3o entendi", "explica"],
  thanks: ["obrigado", "obrigada", "valeu", "vlw", "brigado", "agradeco", "agrade\xE7o", "thanks"],
  bye: ["tchau", "ate mais", "at\xE9 mais", "adeus", "bye", "flw", "falou", "fui"],
  confirm: ["sim", "ok", "pode", "certo", "correto", "isso", "confirmo", "confirma", "pode ser", "fechado", "combinado", "bora", "s"],
  deny: ["nao", "n\xE3o", "n", "nope", "negativo", "errado", "incorreto", "cancela"],
  select_option: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "primeiro", "segundo", "terceiro", "quarto", "quinto"],
  provide_info: [],
  // Detectado por padrões específicos
  unknown: []
};
var INTENT_TO_NODE_TYPES = {
  greeting: ["start", "message"],
  menu: ["list", "buttons", "message"],
  order: ["list", "buttons", "delivery_order", "input"],
  schedule: ["create_appointment", "input", "buttons"],
  price: ["message", "list"],
  service: ["list", "buttons", "message"],
  status: ["message", "condition"],
  cancel: ["message", "condition"],
  edit: ["input", "buttons", "list"],
  address: ["input"],
  payment: ["buttons", "list"],
  hours: ["check_business_hours", "message"],
  location: ["message", "media"],
  human: ["transfer_human"],
  help: ["message", "buttons"],
  thanks: ["message", "end"],
  bye: ["end", "message"],
  confirm: ["condition", "message"],
  deny: ["condition", "message"],
  select_option: ["condition", "goto"],
  provide_info: ["input"],
  unknown: ["message"]
};
function detectIntent(message) {
  const normalized = message.toLowerCase().trim().replace(/[áàâã]/g, "a").replace(/[éèê]/g, "e").replace(/[íìî]/g, "i").replace(/[óòôõ]/g, "o").replace(/[úùû]/g, "u").replace(/[ç]/g, "c");
  let bestMatch = "unknown";
  let bestConfidence = 0;
  let matchedKeywords = [];
  for (const [category, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const cat = category;
    if (keywords.length === 0) continue;
    let matches = 0;
    const found = [];
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (regex.test(normalized) || normalized.includes(keyword)) {
        matches++;
        found.push(keyword);
      }
    }
    if (matches > 0) {
      let confidence = Math.min(matches / 2, 1) * 0.9;
      if (keywords.some((kw) => normalized === kw || normalized === kw.replace(/[áàâã]/g, "a").replace(/[éèê]/g, "e").replace(/[óòôõ]/g, "o"))) {
        confidence = 0.95;
      }
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = cat;
        matchedKeywords = found;
      }
    }
  }
  if (/^[1-9]$/.test(normalized) || /^opcao\s*\d$/i.test(normalized)) {
    if (bestConfidence < 0.8) {
      bestMatch = "select_option";
      bestConfidence = 0.9;
      matchedKeywords = [normalized.match(/\d/)?.[0] || ""];
    }
  }
  const infoPatterns = [
    { pattern: /\b[a-zA-Z]+@[a-zA-Z]+\.[a-zA-Z]+\b/, type: "email" },
    { pattern: /\b\d{10,11}\b/, type: "phone" },
    { pattern: /\b\d{5}-?\d{3}\b/, type: "cep" },
    { pattern: /\brua\s+.+\d+/i, type: "address" }
  ];
  for (const { pattern, type } of infoPatterns) {
    if (pattern.test(message)) {
      if (bestConfidence < 0.7) {
        bestMatch = "provide_info";
        bestConfidence = 0.75;
        matchedKeywords = [type];
      }
    }
  }
  const extractedData = {};
  if (["schedule", "order"].includes(bestMatch)) {
    const date = extractDateFromText(message);
    if (date) extractedData.date = date;
    const time = extractTimeFromText(message);
    if (time) extractedData.time = time;
  }
  if (bestMatch === "select_option") {
    const numMatch = normalized.match(/\d+/);
    if (numMatch) {
      extractedData.number = parseInt(numMatch[0]);
    }
  }
  return {
    category: bestMatch,
    confidence: bestConfidence,
    keywords: matchedKeywords,
    extractedData: Object.keys(extractedData).length > 0 ? extractedData : void 0,
    suggestedNodeTypes: INTENT_TO_NODE_TYPES[bestMatch]
  };
}
async function getHybridConfig(userId) {
  try {
    const result = await withRetry(async () => {
      return db.execute(sql`
        SELECT 
          cc.id,
          cc.user_id,
          COALESCE((cc.advanced_settings->>'enable_hybrid_ai')::boolean, false) as enable_hybrid_ai,
          COALESCE((cc.advanced_settings->>'ai_confidence_threshold')::numeric, 0.7) as ai_confidence_threshold,
          COALESCE((cc.advanced_settings->>'fallback_to_flow')::boolean, true) as fallback_to_flow,
          COALESCE((cc.advanced_settings->>'interpret_dates')::boolean, true) as interpret_dates,
          COALESCE((cc.advanced_settings->>'interpret_times')::boolean, true) as interpret_times,
          COALESCE(cc.advanced_settings->'intent_keywords', '{}') as intent_keywords
        FROM chatbot_configs cc
        WHERE cc.user_id = ${userId} AND cc.is_active = true
      `);
    });
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      enable_hybrid_ai: row.enable_hybrid_ai === true,
      ai_confidence_threshold: parseFloat(row.ai_confidence_threshold) || 0.7,
      fallback_to_flow: row.fallback_to_flow !== false,
      interpret_dates: row.interpret_dates !== false,
      interpret_times: row.interpret_times !== false,
      intent_keywords: row.intent_keywords || {}
    };
  } catch (error) {
    console.error("[HYBRID_AI] Erro ao obter configura\xE7\xE3o:", error);
    return null;
  }
}
function processUserInputWithNaturalLanguage(message, config) {
  const intent = detectIntent(message);
  let processedMessage = message;
  let extractedDate;
  if (config.interpret_dates) {
    const date = extractDateFromText(message);
    if (date) {
      extractedDate = date;
    }
  }
  let extractedTime;
  if (config.interpret_times) {
    const time = extractTimeFromText(message);
    if (time) {
      extractedTime = time;
    }
  }
  return {
    originalMessage: message,
    processedMessage,
    extractedDate,
    extractedTime,
    intent
  };
}
function findNodeByIntent(intent, nodes, currentContext) {
  if (intent.confidence < 0.5) return null;
  const suggestedTypes = intent.suggestedNodeTypes || [];
  for (const nodeType of suggestedTypes) {
    const matchingNode = nodes.find((n) => n.node_type === nodeType);
    if (matchingNode) {
      console.log(`[HYBRID_AI] Encontrado n\xF3 ${matchingNode.name} (${matchingNode.node_type}) para inten\xE7\xE3o ${intent.category}`);
      return matchingNode.node_id;
    }
  }
  for (const keyword of intent.keywords) {
    const matchingNode = nodes.find(
      (n) => n.name.toLowerCase().includes(keyword) || JSON.stringify(n.content).toLowerCase().includes(keyword)
    );
    if (matchingNode) {
      console.log(`[HYBRID_AI] Encontrado n\xF3 por keyword: ${matchingNode.name}`);
      return matchingNode.node_id;
    }
  }
  return null;
}
function applyExtractedDataToVariables(variables, extractedDate, extractedTime, intent) {
  const updated = { ...variables };
  if (extractedDate) {
    updated["data"] = extractedDate.formatted;
    updated["data_iso"] = extractedDate.date;
    updated["dia_semana"] = extractedDate.dayOfWeek;
    updated["data_agendamento"] = extractedDate.formatted;
    console.log(`[HYBRID_AI] Data extra\xEDda: ${extractedDate.formatted} (${extractedDate.dayOfWeek})`);
  }
  if (extractedTime) {
    updated["horario"] = extractedTime.time;
    updated["hora"] = extractedTime.time;
    updated["periodo"] = extractedTime.period;
    updated["horario_agendamento"] = extractedTime.time;
    console.log(`[HYBRID_AI] Hor\xE1rio extra\xEDdo: ${extractedTime.time} (${extractedTime.period})`);
  }
  if (intent?.extractedData?.number !== void 0) {
    updated["opcao_selecionada"] = String(intent.extractedData.number);
  }
  return updated;
}
function logHybridDecision(message, intent, decision, nodeId) {
  console.log(`\u{1F916} [HYBRID_AI] ----------------------------------------`);
  console.log(`\u{1F916} [HYBRID_AI] Mensagem: "${message}"`);
  console.log(`\u{1F916} [HYBRID_AI] Inten\xE7\xE3o: ${intent.category} (${(intent.confidence * 100).toFixed(0)}%)`);
  console.log(`\u{1F916} [HYBRID_AI] Keywords: ${intent.keywords.join(", ")}`);
  console.log(`\u{1F916} [HYBRID_AI] Decis\xE3o: ${decision}${nodeId ? ` -> n\xF3 ${nodeId}` : ""}`);
  if (intent.extractedData) {
    console.log(`\u{1F916} [HYBRID_AI] Dados extra\xEDdos:`, JSON.stringify(intent.extractedData));
  }
  console.log(`\u{1F916} [HYBRID_AI] ----------------------------------------`);
}

// server/chatbotFlowEngine.ts
var flowCache = /* @__PURE__ */ new Map();
var CACHE_TTL_MS = 6e4;
function clearFlowCache(userId) {
  flowCache.delete(userId);
  console.log(`\u{1F5D1}\uFE0F [CHATBOT_ENGINE] Cache limpo para usu\xE1rio ${userId}`);
}
async function loadChatbotFlow(userId) {
  const cached = flowCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }
  try {
    const configResult = await withRetry(async () => {
      return db.execute(sql2`
        SELECT * FROM chatbot_configs WHERE user_id = ${userId} AND is_active = true
      `);
    });
    if (configResult.rows.length === 0) {
      return null;
    }
    const config = configResult.rows[0];
    const nodesResult = await withRetry(async () => {
      return db.execute(sql2`
        SELECT node_id, name, node_type, content, next_node_id
        FROM chatbot_flow_nodes
        WHERE chatbot_id = ${config.id}
        ORDER BY display_order ASC
      `);
    });
    const connectionsResult = await withRetry(async () => {
      return db.execute(sql2`
        SELECT from_node_id, from_handle, to_node_id
        FROM chatbot_flow_connections
        WHERE chatbot_id = ${config.id}
      `);
    });
    const flowData = {
      config,
      nodes: nodesResult.rows,
      connections: connectionsResult.rows,
      cachedAt: Date.now()
    };
    flowCache.set(userId, flowData);
    return flowData;
  } catch (error) {
    console.error("[CHATBOT_ENGINE] Erro ao carregar fluxo:", error);
    return null;
  }
}
async function getOrCreateConversationState(chatbotId, conversationId, contactNumber) {
  try {
    const existingResult = await withRetry(async () => {
      return db.execute(sql2`
        SELECT * FROM chatbot_conversation_data
        WHERE chatbot_id = ${chatbotId} AND conversation_id = ${conversationId}
      `);
    });
    if (existingResult.rows.length > 0) {
      const state2 = existingResult.rows[0];
      return {
        ...state2,
        variables: state2.variables || {},
        visited_nodes: state2.visited_nodes || []
      };
    }
    const newResult = await withRetry(async () => {
      return db.execute(sql2`
        INSERT INTO chatbot_conversation_data (chatbot_id, conversation_id, contact_number, status, variables, visited_nodes)
        VALUES (${chatbotId}, ${conversationId}, ${contactNumber}, 'active', '{}', ARRAY[]::TEXT[])
        RETURNING *
      `);
    });
    const state = newResult.rows[0];
    return {
      ...state,
      variables: state.variables || {},
      visited_nodes: state.visited_nodes || []
    };
  } catch (error) {
    console.error("[CHATBOT_ENGINE] Erro ao buscar/criar estado:", error);
    return null;
  }
}
async function updateConversationState(conversationId, chatbotId, updates) {
  try {
    const setClauses = [];
    if (updates.current_node_id !== void 0) {
      setClauses.push(`current_node_id = '${updates.current_node_id}'`);
    }
    if (updates.status) {
      setClauses.push(`status = '${updates.status}'`);
    }
    if (updates.variables) {
      setClauses.push(`variables = '${JSON.stringify(updates.variables)}'::jsonb`);
    }
    if (updates.visited_nodes) {
      setClauses.push(`visited_nodes = ARRAY[${updates.visited_nodes.map((n) => `'${n}'`).join(",")}]::TEXT[]`);
    }
    setClauses.push(`last_interaction_at = now()`);
    if (setClauses.length > 0) {
      await withRetry(async () => {
        return db.execute(sql2.raw(`
          UPDATE chatbot_conversation_data
          SET ${setClauses.join(", ")}
          WHERE chatbot_id = '${chatbotId}' AND conversation_id = '${conversationId}'
        `));
      });
    }
  } catch (error) {
    console.error("[CHATBOT_ENGINE] Erro ao atualizar estado:", error);
  }
}
function findNextNode(currentNodeId, handle, nodes, connections) {
  const connection = connections.find(
    (c) => c.from_node_id === currentNodeId && c.from_handle === handle
  );
  if (connection) {
    return nodes.find((n) => n.node_id === connection.to_node_id) || null;
  }
  const defaultConnection = connections.find(
    (c) => c.from_node_id === currentNodeId && c.from_handle === "default"
  );
  if (defaultConnection) {
    return nodes.find((n) => n.node_id === defaultConnection.to_node_id) || null;
  }
  const currentNode = nodes.find((n) => n.node_id === currentNodeId);
  if (currentNode?.next_node_id) {
    return nodes.find((n) => n.node_id === currentNode.next_node_id) || null;
  }
  return null;
}
function interpolateVariables(text, variables) {
  return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return variables[varName] || match;
  });
}
function humanizeText(text, level) {
  if (!text) return text;
  let result = text;
  if (level === "low" || level === "medium" || level === "high") {
    if (Math.random() > 0.7) {
      result = result.replace(/\. /g, ".  ");
    }
    if (Math.random() > 0.8 && result.endsWith("!")) {
      result = result.slice(0, -1) + "!!";
    }
    if (Math.random() > 0.6) {
      result = result.replace(/  +/g, " ");
    }
  }
  if (level === "medium" || level === "high") {
    const emojiVariations = {
      "\u{1F60A}": ["\u{1F604}", "\u{1F642}", "\u{1F603}"],
      "\u{1F44B}": ["\u270B", "\u{1F590}\uFE0F", "\u{1F91A}"],
      "\u2705": ["\u2714\uFE0F", "\u2611\uFE0F", "\u{1F44D}"],
      "\u2764\uFE0F": ["\u{1F496}", "\u{1F495}", "\u2665\uFE0F"],
      "\u{1F389}": ["\u{1F973}", "\u2728", "\u{1F38A}"],
      "\u{1F525}": ["\u{1F4A5}", "\u26A1", "\u2728"],
      "\u{1F4AA}": ["\u{1F44A}", "\u270A", "\u{1F91C}"],
      "\u{1F64F}": ["\u{1F932}", "\u{1F450}", "\u{1F4AB}"]
    };
    for (const [emoji, variations] of Object.entries(emojiVariations)) {
      if (result.includes(emoji) && Math.random() > 0.5) {
        const randomVariation = variations[Math.floor(Math.random() * variations.length)];
        result = result.replace(emoji, randomVariation);
      }
    }
    const synonyms = [
      [/\bOlá\b/gi, ["Oi", "Oie", "Eai", "Hey"]],
      [/\bObrigado\b/gi, ["Vlw", "Valeu", "Thanks", "Grato"]],
      [/\baguarde\b/gi, ["espere", "s\xF3 um momento", "um instante"]],
      [/\bperfeito\b/gi, ["show", "\xF3timo", "beleza", "top"]]
    ];
    const selectedSynonym = synonyms[Math.floor(Math.random() * synonyms.length)];
    if (Math.random() > 0.6) {
      const [pattern, options] = selectedSynonym;
      const replacement = options[Math.floor(Math.random() * options.length)];
      result = result.replace(pattern, replacement);
    }
  }
  if (level === "high") {
    const interjections = ["Ent\xE3o", "Bom", "Ah", "Hmm", "Enfim"];
    if (Math.random() > 0.7) {
      const interjection = interjections[Math.floor(Math.random() * interjections.length)];
      result = `${interjection}, ${result.charAt(0).toLowerCase()}${result.slice(1)}`;
    }
    if (Math.random() > 0.8) {
      result = result.charAt(0).toLowerCase() + result.slice(1);
    }
  }
  return result;
}
async function processNode(node, state, nodes, connections, config) {
  const messages = [];
  let waitingForInput = false;
  let currentNodeId = node.node_id;
  let shouldTransferToHuman = false;
  const variables = { ...state.variables };
  const visitedNodes = [...state.visited_nodes, node.node_id];
  const visitCount = visitedNodes.filter((n) => n === node.node_id).length;
  if (visitCount > 10) {
    console.warn(`[CHATBOT_ENGINE] Loop detectado no n\xF3 ${node.node_id}`);
    return { messages: [], waitingForInput: false, variables };
  }
  switch (node.node_type) {
    case "start":
      const nextAfterStart = findNextNode(node.node_id, "default", nodes, connections);
      if (nextAfterStart) {
        const nextResponse = await processNode(nextAfterStart, { ...state, visited_nodes: visitedNodes }, nodes, connections, config);
        return {
          ...nextResponse,
          messages: [...messages, ...nextResponse.messages],
          variables: { ...variables, ...nextResponse.variables }
        };
      }
      break;
    case "message":
      const msgText = interpolateVariables(node.content.text || "", variables);
      messages.push({
        type: "text",
        content: msgText,
        delay: config.typing_delay_ms
      });
      const nextAfterMessage = findNextNode(node.node_id, "default", nodes, connections);
      if (nextAfterMessage) {
        const nextResponse = await processNode(nextAfterMessage, { ...state, visited_nodes: visitedNodes }, nodes, connections, config);
        return {
          ...nextResponse,
          messages: [...messages, ...nextResponse.messages],
          currentNodeId: nextResponse.currentNodeId,
          variables: { ...variables, ...nextResponse.variables }
        };
      }
      break;
    case "buttons":
      const btnBody = interpolateVariables(node.content.body || "", variables);
      messages.push({
        type: "buttons",
        content: {
          header: node.content.header,
          body: btnBody,
          footer: node.content.footer,
          buttons: node.content.buttons || []
        },
        delay: config.typing_delay_ms
      });
      waitingForInput = true;
      break;
    case "list":
      const listBody = interpolateVariables(node.content.body || "", variables);
      messages.push({
        type: "list",
        content: {
          header: node.content.header,
          body: listBody,
          footer: node.content.footer,
          button_text: node.content.button_text,
          sections: node.content.sections || []
        },
        delay: config.typing_delay_ms
      });
      waitingForInput = true;
      break;
    case "input":
      const prompt = interpolateVariables(node.content.prompt || "", variables);
      messages.push({
        type: "text",
        content: prompt,
        delay: config.typing_delay_ms
      });
      waitingForInput = true;
      break;
    case "media":
      const caption = interpolateVariables(node.content.caption || "", variables);
      messages.push({
        type: "media",
        content: {
          media_type: node.content.media_type,
          url: node.content.url,
          caption
        },
        delay: config.typing_delay_ms
      });
      const nextAfterMedia = findNextNode(node.node_id, "default", nodes, connections);
      if (nextAfterMedia) {
        const nextResponse = await processNode(nextAfterMedia, { ...state, visited_nodes: visitedNodes }, nodes, connections, config);
        return {
          ...nextResponse,
          messages: [...messages, ...nextResponse.messages],
          variables: { ...variables, ...nextResponse.variables }
        };
      }
      break;
    case "condition":
      const varValue = variables[node.content.variable || ""] || "";
      let conditionResult = false;
      switch (node.content.operator) {
        case "equals":
          conditionResult = varValue.toLowerCase() === (node.content.value || "").toLowerCase();
          break;
        case "contains":
          conditionResult = varValue.toLowerCase().includes((node.content.value || "").toLowerCase());
          break;
        case "starts_with":
          conditionResult = varValue.toLowerCase().startsWith((node.content.value || "").toLowerCase());
          break;
        case "ends_with":
          conditionResult = varValue.toLowerCase().endsWith((node.content.value || "").toLowerCase());
          break;
        case "greater":
          conditionResult = parseFloat(varValue) > parseFloat(node.content.value || "0");
          break;
        case "less":
          conditionResult = parseFloat(varValue) < parseFloat(node.content.value || "0");
          break;
        case "exists":
          conditionResult = !!varValue && varValue.trim() !== "";
          break;
        case "not_exists":
          conditionResult = !varValue || varValue.trim() === "";
          break;
      }
      const nextNodeId = conditionResult ? node.content.true_node : node.content.false_node;
      if (nextNodeId) {
        const nextNode = nodes.find((n) => n.node_id === nextNodeId);
        if (nextNode) {
          const nextResponse = await processNode(nextNode, { ...state, visited_nodes: visitedNodes }, nodes, connections, config);
          return {
            ...nextResponse,
            messages: [...messages, ...nextResponse.messages],
            variables: { ...variables, ...nextResponse.variables }
          };
        }
      }
      break;
    case "delay":
      const nextAfterDelay = findNextNode(node.node_id, "default", nodes, connections);
      if (nextAfterDelay) {
        const nextResponse = await processNode(nextAfterDelay, { ...state, visited_nodes: visitedNodes }, nodes, connections, config);
        const messagesWithDelay = nextResponse.messages.map((msg, idx) => ({
          ...msg,
          delay: idx === 0 ? (node.content.seconds || 3) * 1e3 : msg.delay
        }));
        return {
          ...nextResponse,
          messages: messagesWithDelay,
          variables: { ...variables, ...nextResponse.variables }
        };
      }
      break;
    case "set_variable":
      if (node.content.variable_name) {
        variables[node.content.variable_name] = node.content.value || "";
      }
      const nextAfterSetVar = findNextNode(node.node_id, "default", nodes, connections);
      if (nextAfterSetVar) {
        const nextResponse = await processNode(nextAfterSetVar, { ...state, visited_nodes: visitedNodes, variables }, nodes, connections, config);
        return {
          ...nextResponse,
          messages: [...messages, ...nextResponse.messages],
          variables: { ...variables, ...nextResponse.variables }
        };
      }
      break;
    case "transfer_human":
      const transferMsg = interpolateVariables(node.content.message || "Aguarde, vou transferir para um atendente...", variables);
      messages.push({
        type: "text",
        content: transferMsg,
        delay: config.typing_delay_ms
      });
      shouldTransferToHuman = true;
      break;
    case "goto":
      if (node.content.target_node) {
        const targetNode = nodes.find((n) => n.node_id === node.content.target_node);
        if (targetNode) {
          const nextResponse = await processNode(targetNode, { ...state, visited_nodes: visitedNodes }, nodes, connections, config);
          return {
            ...nextResponse,
            messages: [...messages, ...nextResponse.messages],
            variables: { ...variables, ...nextResponse.variables }
          };
        }
      }
      break;
    case "end":
      const goodbyeMsg = interpolateVariables(config.goodbye_message || "At\xE9 mais! \u{1F44B}", variables);
      messages.push({
        type: "text",
        content: goodbyeMsg,
        delay: config.typing_delay_ms
      });
      break;
    // ============================================================
    // 🍕 DELIVERY_ORDER - Cria pedido e salva na tabela delivery_pedidos
    // ============================================================
    case "delivery_order":
      try {
        const orderItems = variables["pedido_itens"] || variables["items"] || variables["carrinho"] || "";
        const orderTotal = variables["pedido_total"] || variables["total"] || "0";
        const deliveryAddress = interpolateVariables(
          node.content.address_variable ? `{{${node.content.address_variable}}}` : variables["endereco"] || variables["address"] || "",
          variables
        );
        const paymentMethod = variables["pagamento"] || variables["payment"] || node.content.default_payment || "dinheiro";
        const deliveryType = variables["tipo_entrega"] || variables["delivery_type"] || node.content.default_delivery_type || "delivery";
        const customerNotes = variables["observacoes"] || variables["notes"] || "";
        const orderData = {
          items: parseOrderItems(orderItems, variables),
          subtotal: parseFloat(variables["subtotal"] || orderTotal) || 0,
          delivery_fee: parseFloat(variables["taxa_entrega"] || "0") || 0,
          discount: parseFloat(variables["desconto"] || "0") || 0,
          total: parseFloat(orderTotal) || 0,
          delivery_type: deliveryType,
          delivery_address: deliveryAddress ? {
            street: deliveryAddress,
            complement: variables["complemento"] || "",
            reference: variables["referencia"] || ""
          } : null,
          payment_method: paymentMethod,
          payment_status: "pendente",
          notes: customerNotes,
          status: "pendente"
        };
        console.log(`\u{1F355} [CHATBOT_ENGINE] Criando pedido de delivery:`, JSON.stringify(orderData, null, 2));
        variables["__delivery_order_data"] = JSON.stringify(orderData);
        variables["__delivery_order_pending"] = "true";
        const confirmMsg = interpolateVariables(
          node.content.confirmation_message || `\u2705 *Pedido Confirmado!*

\u{1F4CB} Itens: {{pedido_itens}}
\u{1F4B0} Total: R$ {{pedido_total}}
\u{1F4CD} Entrega: {{endereco}}
\u{1F4B3} Pagamento: {{pagamento}}

Seu pedido ser\xE1 preparado! \u{1F355}`,
          variables
        );
        messages.push({
          type: "text",
          content: confirmMsg,
          delay: config.typing_delay_ms
        });
        const nextAfterDelivery = findNextNode(node.node_id, "default", nodes, connections);
        if (nextAfterDelivery) {
          const nextResponse = await processNode(nextAfterDelivery, { ...state, visited_nodes: visitedNodes, variables }, nodes, connections, config);
          return {
            ...nextResponse,
            messages: [...messages, ...nextResponse.messages],
            variables: { ...variables, ...nextResponse.variables }
          };
        }
      } catch (deliveryError) {
        console.error("[CHATBOT_ENGINE] Erro ao criar pedido de delivery:", deliveryError);
        messages.push({
          type: "text",
          content: "\u274C Desculpe, ocorreu um erro ao processar seu pedido. Tente novamente.",
          delay: config.typing_delay_ms
        });
      }
      break;
    // ============================================================
    // ⏰ CHECK_BUSINESS_HOURS - Verifica horário de funcionamento
    // ============================================================
    case "check_business_hours":
      try {
        const isOpen = checkBusinessHours(node.content.opening_hours || {});
        const handleToFollow = isOpen ? "open" : "closed";
        variables["is_open"] = isOpen ? "true" : "false";
        variables["business_status"] = isOpen ? "aberto" : "fechado";
        if (!isOpen && node.content.closed_message) {
          const closedMsg = interpolateVariables(node.content.closed_message, variables);
          messages.push({
            type: "text",
            content: closedMsg,
            delay: config.typing_delay_ms
          });
        }
        const nextAfterHours = findNextNode(node.node_id, handleToFollow, nodes, connections) || findNextNode(node.node_id, "default", nodes, connections);
        if (nextAfterHours) {
          const nextResponse = await processNode(nextAfterHours, { ...state, visited_nodes: visitedNodes, variables }, nodes, connections, config);
          return {
            ...nextResponse,
            messages: [...messages, ...nextResponse.messages],
            variables: { ...variables, ...nextResponse.variables }
          };
        }
      } catch (hoursError) {
        console.error("[CHATBOT_ENGINE] Erro ao verificar hor\xE1rio:", hoursError);
      }
      break;
    // ============================================================
    // 📅 CREATE_APPOINTMENT - Criar agendamento
    // ============================================================
    case "create_appointment":
      try {
        console.log(`\u{1F4C5} [CHATBOT_ENGINE] Processando n\xF3 create_appointment`);
        const clientName = variables["nome"] || variables["cliente_nome"] || "Cliente";
        const clientPhone = variables["telefone"] || variables["cliente_telefone"] || "";
        const clientEmail = variables["email"] || variables["cliente_email"] || "";
        const serviceName = variables["servico"] || variables["servico_nome"] || node.content?.service_name || "";
        const serviceId = variables["servico_id"] || node.content?.service_id || "";
        const professionalName = variables["profissional"] || variables["profissional_nome"] || node.content?.professional_name || "";
        const professionalId = variables["profissional_id"] || node.content?.professional_id || "";
        const appointmentDate = variables["data"] || variables["data_agendamento"] || "";
        const appointmentTime = variables["horario"] || variables["hora"] || variables["horario_agendamento"] || "";
        const durationMinutes = parseInt(variables["duracao"] || node.content?.duration_minutes || "60") || 60;
        const customerNotes = variables["observacoes"] || variables["notas"] || "";
        const location = variables["local"] || node.content?.location || "";
        const locationType = variables["tipo_atendimento"] || node.content?.location_type || "presencial";
        if (!appointmentDate || !appointmentTime) {
          console.log(`\u{1F4C5} [CHATBOT_ENGINE] Faltam dados obrigat\xF3rios - data: ${appointmentDate}, hora: ${appointmentTime}`);
          messages.push({
            type: "text",
            content: interpolateVariables(
              node.content?.missing_data_message || "\u274C Desculpe, preciso da data e hor\xE1rio para agendar. Pode informar?",
              variables
            ),
            delay: config.typing_delay_ms
          });
          break;
        }
        const appointmentData = {
          client_name: clientName,
          client_phone: clientPhone,
          client_email: clientEmail,
          service_id: serviceId,
          service_name: serviceName,
          professional_id: professionalId,
          professional_name: professionalName,
          appointment_date: appointmentDate,
          start_time: appointmentTime,
          duration_minutes: durationMinutes,
          notes: customerNotes,
          location,
          location_type: locationType,
          status: "pendente"
        };
        console.log(`\u{1F4C5} [CHATBOT_ENGINE] Criando agendamento:`, JSON.stringify(appointmentData, null, 2));
        variables["__appointment_data"] = JSON.stringify(appointmentData);
        variables["__appointment_pending"] = "true";
        variables["agendamento_data"] = appointmentDate;
        variables["agendamento_horario"] = appointmentTime;
        variables["agendamento_servico"] = serviceName;
        variables["agendamento_profissional"] = professionalName;
        variables["agendamento_duracao"] = String(durationMinutes);
        const confirmAppointmentMsg = interpolateVariables(
          node.content?.confirmation_message || `\u2705 *Agendamento Confirmado!*

\u{1F4C5} Data: {{agendamento_data}}
\u23F0 Hor\xE1rio: {{agendamento_horario}}
\u{1F4BC} Servi\xE7o: {{agendamento_servico}}
\u{1F464} Profissional: {{agendamento_profissional}}
\u23F1\uFE0F Dura\xE7\xE3o: {{agendamento_duracao}} minutos

Aguardamos voc\xEA! \u{1F4CB}`,
          variables
        );
        messages.push({
          type: "text",
          content: confirmAppointmentMsg,
          delay: config.typing_delay_ms
        });
        const nextAfterAppointment = findNextNode(node.node_id, "default", nodes, connections);
        if (nextAfterAppointment) {
          const nextResponse = await processNode(nextAfterAppointment, { ...state, visited_nodes: visitedNodes, variables }, nodes, connections, config);
          return {
            ...nextResponse,
            messages: [...messages, ...nextResponse.messages],
            variables: { ...variables, ...nextResponse.variables }
          };
        }
      } catch (appointmentError) {
        console.error("[CHATBOT_ENGINE] Erro ao criar agendamento:", appointmentError);
        messages.push({
          type: "text",
          content: "\u274C Desculpe, ocorreu um erro ao processar seu agendamento. Tente novamente.",
          delay: config.typing_delay_ms
        });
      }
      break;
  }
  return {
    messages,
    waitingForInput,
    currentNodeId,
    shouldTransferToHuman,
    variables
  };
}
function parseOrderItems(itemsString, variables) {
  try {
    if (itemsString.startsWith("[")) {
      return JSON.parse(itemsString);
    }
    const items = [];
    const parts = itemsString.split(/[,;]/);
    for (const part of parts) {
      const match = part.trim().match(/^(\d+)x?\s*(.+?)(?:\s*-\s*R?\$?\s*([\d.,]+))?$/i);
      if (match) {
        items.push({
          name: match[2].trim(),
          quantity: parseInt(match[1]) || 1,
          price: parseFloat(match[3]?.replace(",", ".") || "0") || 0
        });
      } else if (part.trim()) {
        items.push({
          name: part.trim(),
          quantity: 1,
          price: 0
        });
      }
    }
    return items;
  } catch (e) {
    console.error("[CHATBOT_ENGINE] Erro ao parsear itens:", e);
    return [];
  }
}
function checkBusinessHours(openingHours) {
  const now = /* @__PURE__ */ new Date();
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const today = days[now.getDay()];
  const todayHours = openingHours[today];
  if (!todayHours || !todayHours.is_open) {
    return false;
  }
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const [openH, openM] = todayHours.open.split(":").map(Number);
  const [closeH, closeM] = todayHours.close.split(":").map(Number);
  const openTime = openH * 60 + openM;
  const closeTime = closeH * 60 + closeM;
  if (closeTime < openTime) {
    return currentTime >= openTime || currentTime <= closeTime;
  }
  return currentTime >= openTime && currentTime <= closeTime;
}
async function isChatbotActive(userId) {
  try {
    const result = await withRetry(async () => {
      return db.execute(sql2`
        SELECT is_active FROM chatbot_configs WHERE user_id = ${userId}
      `);
    });
    if (result.rows.length === 0) {
      return false;
    }
    return result.rows[0].is_active === true;
  } catch (error) {
    console.error("[CHATBOT_ENGINE] Erro ao verificar status:", error);
    return false;
  }
}
function applyHumanization(response, config) {
  if (!config.enable_humanization || !response.messages) {
    return response;
  }
  const level = config.humanization_level || "medium";
  return {
    ...response,
    messages: response.messages.map((msg) => {
      if (msg.type === "text" && typeof msg.content === "string") {
        return {
          ...msg,
          content: humanizeText(msg.content, level)
        };
      }
      if ((msg.type === "buttons" || msg.type === "list") && msg.content?.body) {
        return {
          ...msg,
          content: {
            ...msg.content,
            body: humanizeText(msg.content.body, level)
          }
        };
      }
      return msg;
    })
  };
}
async function processChatbotMessage(userId, conversationId, contactNumber, message, isFirstMessage = false) {
  console.log(`\u{1F916} [CHATBOT_ENGINE] Processando mensagem para usu\xE1rio ${userId}`);
  const flow = await loadChatbotFlow(userId);
  if (!flow) {
    console.log(`[CHATBOT_ENGINE] Chatbot n\xE3o est\xE1 ativo ou n\xE3o tem fluxo para ${userId}`);
    return null;
  }
  const { config, nodes, connections } = flow;
  if (nodes.length === 0) {
    console.log(`[CHATBOT_ENGINE] Fluxo vazio para ${userId}`);
    return null;
  }
  const state = await getOrCreateConversationState(config.id, conversationId, contactNumber);
  if (!state) {
    console.error("[CHATBOT_ENGINE] N\xE3o foi poss\xEDvel obter estado da conversa");
    return null;
  }
  const messageLower = message.toLowerCase().trim();
  let hybridConfig = null;
  let processedInput = null;
  try {
    hybridConfig = await getHybridConfig(userId);
    if (hybridConfig?.enable_hybrid_ai) {
      processedInput = processUserInputWithNaturalLanguage(message, hybridConfig);
      logHybridDecision(
        message,
        processedInput.intent,
        processedInput.intent.confidence >= (hybridConfig.ai_confidence_threshold || 0.7) ? "hybrid" : "flow"
      );
      if (processedInput.extractedDate || processedInput.extractedTime) {
        const updatedVars = applyExtractedDataToVariables(
          state.variables,
          processedInput.extractedDate,
          processedInput.extractedTime,
          processedInput.intent
        );
        await updateConversationState(conversationId, config.id, {
          variables: updatedVars
        });
        state.variables = updatedVars;
      }
    }
  } catch (hybridError) {
    console.error("[CHATBOT_ENGINE] Erro no sistema h\xEDbrido:", hybridError);
  }
  const intent = detectIntent(message);
  console.log(`\u{1F916} [IA] Inten\xE7\xE3o detectada: ${intent.category} (confian\xE7a: ${(intent.confidence * 100).toFixed(0)}%)`);
  if (intent.category === "greeting" && intent.confidence >= 0.7) {
    console.log(`\u{1F44B} [IA] Sauda\xE7\xE3o detectada: "${message}" - Iniciando/reiniciando fluxo`);
    await updateConversationState(conversationId, config.id, {
      current_node_id: void 0,
      variables: {},
      visited_nodes: []
    });
    const startNode = nodes.find((n) => n.node_type === "start");
    if (startNode) {
      const response = await processNode(startNode, { ...state, variables: {}, visited_nodes: [] }, nodes, connections, config);
      await updateConversationState(conversationId, config.id, {
        current_node_id: response.currentNodeId,
        variables: response.variables,
        visited_nodes: [startNode.node_id]
      });
      return applyHumanization(response, config);
    }
  }
  if (intent.category === "menu" && intent.confidence >= 0.7) {
    console.log(`\u{1F4CB} [IA] Pedido de menu detectado: "${message}" - Mostrando menu inicial`);
    const startNode = nodes.find((n) => n.node_type === "start");
    if (startNode) {
      await updateConversationState(conversationId, config.id, {
        current_node_id: void 0,
        variables: {},
        visited_nodes: []
      });
      const response = await processNode(startNode, { ...state, variables: {}, visited_nodes: [] }, nodes, connections, config);
      await updateConversationState(conversationId, config.id, {
        current_node_id: response.currentNodeId,
        variables: response.variables,
        visited_nodes: [startNode.node_id]
      });
      return applyHumanization(response, config);
    }
  }
  const restartKeywords = config.restart_keywords || ["menu", "in\xEDcio", "inicio", "voltar", "reiniciar"];
  if (config.restart_on_keyword && restartKeywords.some((kw) => messageLower === kw.toLowerCase())) {
    console.log(`[CHATBOT_ENGINE] Reiniciando fluxo por palavra-chave: ${message}`);
    await updateConversationState(conversationId, config.id, {
      current_node_id: void 0,
      variables: {},
      visited_nodes: []
    });
    const startNode = nodes.find((n) => n.node_type === "start");
    if (startNode) {
      const response = await processNode(startNode, { ...state, variables: {}, visited_nodes: [] }, nodes, connections, config);
      await updateConversationState(conversationId, config.id, {
        current_node_id: response.currentNodeId,
        variables: response.variables,
        visited_nodes: [startNode.node_id]
      });
      return applyHumanization(response, config);
    }
  }
  if (isFirstMessage) {
    const messages = [];
    if (config.send_welcome_on_first_contact && config.welcome_message) {
      messages.push({
        type: "text",
        content: config.welcome_message,
        delay: config.typing_delay_ms
      });
    }
    const startNode = nodes.find((n) => n.node_type === "start");
    if (startNode) {
      const response = await processNode(startNode, { ...state, variables: {}, visited_nodes: [] }, nodes, connections, config);
      await updateConversationState(conversationId, config.id, {
        current_node_id: response.currentNodeId,
        variables: response.variables,
        visited_nodes: [startNode.node_id, ...response.currentNodeId ? [response.currentNodeId] : []]
      });
      return applyHumanization({
        ...response,
        messages: [...messages, ...response.messages]
      }, config);
    }
    return applyHumanization({ messages, waitingForInput: false }, config);
  }
  if (!state.current_node_id) {
    console.log(`[CHATBOT_ENGINE] Sem n\xF3 atual, reiniciando fluxo SEM boas-vindas`);
    const startNode = nodes.find((n) => n.node_type === "start");
    if (startNode) {
      const response = await processNode(startNode, { ...state, variables: state.variables || {}, visited_nodes: [] }, nodes, connections, config);
      await updateConversationState(conversationId, config.id, {
        current_node_id: response.currentNodeId,
        variables: response.variables,
        visited_nodes: [startNode.node_id, ...response.currentNodeId ? [response.currentNodeId] : []]
      });
      return applyHumanization(response, config);
    }
    return null;
  }
  const currentNode = nodes.find((n) => n.node_id === state.current_node_id);
  if (!currentNode) {
    console.warn(`[CHATBOT_ENGINE] N\xF3 atual n\xE3o encontrado: ${state.current_node_id}`);
    return null;
  }
  const variables = { ...state.variables };
  if (currentNode.node_type === "input") {
    const varName = currentNode.content.variable_name || "input";
    variables[varName] = message;
    if (currentNode.content.input_type && currentNode.content.required) {
      let isValid = true;
      switch (currentNode.content.input_type) {
        case "email":
          isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message);
          break;
        case "phone":
          isValid = /^\d{10,15}$/.test(message.replace(/\D/g, ""));
          break;
        case "number":
          isValid = !isNaN(parseFloat(message));
          break;
        case "cpf":
          isValid = /^\d{11}$/.test(message.replace(/\D/g, ""));
          break;
        case "cnpj":
          isValid = /^\d{14}$/.test(message.replace(/\D/g, ""));
          break;
        case "cep":
          isValid = /^\d{8}$/.test(message.replace(/\D/g, ""));
          break;
      }
      if (!isValid) {
        const errorMsg = currentNode.content.validation_message || `Por favor, digite um ${currentNode.content.input_type} v\xE1lido.`;
        return applyHumanization({
          messages: [{ type: "text", content: errorMsg, delay: config.typing_delay_ms }],
          waitingForInput: true,
          currentNodeId: currentNode.node_id,
          variables: state.variables
        }, config);
      }
    }
    const nextNode = findNextNode(currentNode.node_id, "default", nodes, connections);
    if (nextNode) {
      const response = await processNode(nextNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
      await updateConversationState(conversationId, config.id, {
        current_node_id: response.currentNodeId,
        variables: { ...variables, ...response.variables },
        visited_nodes: [...state.visited_nodes, currentNode.node_id]
      });
      return applyHumanization(response, config);
    }
  } else if (currentNode.node_type === "buttons") {
    const buttons = currentNode.content.buttons || [];
    let button = buttons.find(
      (btn) => btn.title.toLowerCase() === messageLower || btn.id === message
    );
    if (!button) {
      const numericInput = parseInt(message.trim(), 10);
      if (!isNaN(numericInput) && numericInput >= 1 && numericInput <= buttons.length) {
        button = buttons[numericInput - 1];
        console.log(`\u{1F522} [BUTTONS] Entrada num\xE9rica detectada: ${numericInput} -> ${button?.title}`);
      }
    }
    if (!button) {
      button = buttons.find((btn) => {
        const titleNoEmoji = btn.title.replace(/[\u{1F300}-\u{1F9FF}]/gu, "").trim().toLowerCase();
        return titleNoEmoji === messageLower || messageLower.includes(titleNoEmoji);
      });
      if (button) {
        console.log(`\u{1F524} [BUTTONS] Match por t\xEDtulo sem emoji: ${message} -> ${button.title}`);
      }
    }
    if (!button && messageLower.length >= 2) {
      button = buttons.find((btn) => {
        const titleLower = btn.title.toLowerCase();
        const titleNoEmoji = btn.title.replace(/[\u{1F300}-\u{1F9FF}]/gu, "").trim().toLowerCase();
        const titleNormalized = titleNoEmoji.replace(/^[a-z]\s*-\s*/i, "").replace(/[^\w\sáéíóúàèìòùãõâêîôûç]/gi, "").trim();
        const containsMatch = titleNoEmoji.includes(messageLower) || titleNormalized.includes(messageLower);
        const sizeMap = {
          "p": ["pequena", "pequeno", "peq", "p"],
          "m": ["media", "m\xE9dia", "medio", "m\xE9dio", "med", "m"],
          "g": ["grande", "grd", "g"],
          "gg": ["gigante", "familia", "fam\xEDlia", "gg"]
        };
        let sizeMatch = false;
        for (const [prefix, aliases] of Object.entries(sizeMap)) {
          if (aliases.includes(messageLower)) {
            if (titleNoEmoji.startsWith(prefix + " ") || titleNoEmoji.startsWith(prefix + " -") || titleNoEmoji === prefix) {
              sizeMatch = true;
              break;
            }
          }
        }
        const msgWords = messageLower.split(/\s+/).filter((w) => w.length >= 3);
        const keywordMatch = msgWords.some(
          (word) => titleNoEmoji.split(/\s+/).some(
            (titleWord) => titleWord.includes(word) || word.includes(titleWord)
          )
        );
        return containsMatch || sizeMatch || keywordMatch;
      });
      if (button) {
        console.log(`\u{1F9E0} [SMART_MATCH] Match inteligente: "${message}" \u2192 "${button.title}"`);
      }
    }
    if (button) {
      if (button.save_variable) {
        variables[button.save_variable] = button.title;
        console.log(`\u{1F4BE} [BUTTONS] Salvando vari\xE1vel (do bot\xE3o) ${button.save_variable} = "${button.title}"`);
      } else if (currentNode.content.save_variable) {
        variables[currentNode.content.save_variable] = button.title;
        console.log(`\u{1F4BE} [BUTTONS] Salvando vari\xE1vel (do n\xF3) ${currentNode.content.save_variable} = "${button.title}"`);
      }
      const handle = `button_${button.id}`;
      const nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) || findNextNode(currentNode.node_id, "default", nodes, connections);
      if (nextNode) {
        const response = await processNode(nextNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
        await updateConversationState(conversationId, config.id, {
          current_node_id: response.currentNodeId,
          variables: { ...variables, ...response.variables },
          visited_nodes: [...state.visited_nodes, currentNode.node_id]
        });
        return applyHumanization(response, config);
      }
    } else {
      if (hybridConfig?.enable_hybrid_ai && processedInput) {
        const intent2 = processedInput.intent;
        const threshold = hybridConfig.ai_confidence_threshold || 0.7;
        if (intent2.confidence >= threshold) {
          const partialButton = currentNode.content.buttons?.find((btn) => {
            const btnLower = btn.title.toLowerCase();
            const msgWords = messageLower.split(/\s+/);
            return msgWords.some((word) => word.length > 2 && btnLower.includes(word)) || intent2.keywords.some((kw) => btnLower.includes(kw));
          });
          if (partialButton) {
            console.log(`\u{1F916} [HYBRID_AI] Match parcial encontrado: ${partialButton.title}`);
            if (partialButton.save_variable) {
              variables[partialButton.save_variable] = partialButton.title;
              console.log(`\u{1F4BE} [HYBRID_AI] Salvando vari\xE1vel ${partialButton.save_variable} = "${partialButton.title}"`);
            } else if (currentNode.content.save_variable) {
              variables[currentNode.content.save_variable] = partialButton.title;
              console.log(`\u{1F4BE} [HYBRID_AI] Salvando vari\xE1vel ${currentNode.content.save_variable} = "${partialButton.title}"`);
            }
            const handle = `button_${partialButton.id}`;
            const nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) || findNextNode(currentNode.node_id, "default", nodes, connections);
            if (nextNode) {
              const response = await processNode(nextNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
              await updateConversationState(conversationId, config.id, {
                current_node_id: response.currentNodeId,
                variables: { ...variables, ...response.variables },
                visited_nodes: [...state.visited_nodes, currentNode.node_id]
              });
              return applyHumanization(response, config);
            }
          }
          const intentNodeId = findNodeByIntent(intent2, nodes, { variables, currentNodeId: currentNode.node_id });
          if (intentNodeId && intentNodeId !== currentNode.node_id) {
            const intentNode = nodes.find((n) => n.node_id === intentNodeId);
            if (intentNode) {
              console.log(`\u{1F916} [HYBRID_AI] Redirecionando para n\xF3 por inten\xE7\xE3o: ${intentNode.name}`);
              const response = await processNode(intentNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
              await updateConversationState(conversationId, config.id, {
                current_node_id: response.currentNodeId,
                variables: { ...variables, ...response.variables },
                visited_nodes: [...state.visited_nodes, currentNode.node_id]
              });
              return applyHumanization(response, config);
            }
          }
        }
      }
      if (intent.confidence >= 0.6) {
        const matchedButton = currentNode.content.buttons?.find((btn) => {
          const btnText = btn.title.toLowerCase();
          return intent.keywords.some((kw) => btnText.includes(kw.toLowerCase()));
        });
        if (matchedButton) {
          console.log(`\u{1F916} [IA] Inten\xE7\xE3o "${intent.category}" mapeada para bot\xE3o: ${matchedButton.title}`);
          if (matchedButton.save_variable) {
            variables[matchedButton.save_variable] = matchedButton.title;
            console.log(`\u{1F4BE} [IA_INTENT] Salvando vari\xE1vel ${matchedButton.save_variable} = "${matchedButton.title}"`);
          } else if (currentNode.content.save_variable) {
            variables[currentNode.content.save_variable] = matchedButton.title;
            console.log(`\u{1F4BE} [IA_INTENT] Salvando vari\xE1vel ${currentNode.content.save_variable} = "${matchedButton.title}"`);
          }
          const handle = `button_${matchedButton.id}`;
          const nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) || findNextNode(currentNode.node_id, "default", nodes, connections);
          if (nextNode) {
            const response = await processNode(nextNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
            await updateConversationState(conversationId, config.id, {
              current_node_id: response.currentNodeId,
              variables: { ...variables, ...response.variables },
              visited_nodes: [...state.visited_nodes, currentNode.node_id]
            });
            return applyHumanization(response, config);
          }
        }
      }
      console.log(`\u26A0\uFE0F [CHATBOT_ENGINE] Mensagem n\xE3o reconhecida: "${message}" - Mostrando fallback com menu`);
      return applyHumanization({
        messages: [{ type: "text", content: config.fallback_message, delay: config.typing_delay_ms }],
        waitingForInput: true,
        currentNodeId: currentNode.node_id,
        variables: state.variables
      }, config);
    }
  } else if (currentNode.node_type === "list") {
    const allRows = [];
    currentNode.content.sections?.forEach((section) => {
      if (section.rows) {
        allRows.push(...section.rows);
      }
    });
    let option = allRows.find(
      (row) => row.title.toLowerCase() === messageLower || row.id === message
    );
    if (!option) {
      const numericInput = parseInt(message.trim(), 10);
      if (!isNaN(numericInput) && numericInput >= 1 && numericInput <= allRows.length) {
        option = allRows[numericInput - 1];
        console.log(`\u{1F522} [LIST] Entrada num\xE9rica detectada: ${numericInput} -> ${option?.title}`);
      }
    }
    if (!option) {
      option = allRows.find((row) => {
        const titleNoEmoji = row.title.replace(/[\u{1F300}-\u{1F9FF}]/gu, "").trim().toLowerCase();
        return titleNoEmoji === messageLower || messageLower.includes(titleNoEmoji) || titleNoEmoji.includes(messageLower);
      });
      if (option) {
        console.log(`\u{1F524} [LIST] Match parcial: ${message} -> ${option.title}`);
      }
    }
    if (option) {
      if (option.save_variable) {
        variables[option.save_variable] = option.title;
        console.log(`\u{1F4BE} [LIST] Salvando vari\xE1vel (do item) ${option.save_variable} = "${option.title}"`);
      } else if (currentNode.content.save_variable) {
        variables[currentNode.content.save_variable] = option.title;
        console.log(`\u{1F4BE} [LIST] Salvando vari\xE1vel (do n\xF3) ${currentNode.content.save_variable} = "${option.title}"`);
      }
      const handle = `row_${option.id}`;
      const nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) || findNextNode(currentNode.node_id, "default", nodes, connections);
      if (nextNode) {
        const response = await processNode(nextNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
        await updateConversationState(conversationId, config.id, {
          current_node_id: response.currentNodeId,
          variables: { ...variables, ...response.variables },
          visited_nodes: [...state.visited_nodes, currentNode.node_id]
        });
        return applyHumanization(response, config);
      }
    } else {
      if (hybridConfig?.enable_hybrid_ai && processedInput) {
        const intent2 = processedInput.intent;
        const threshold = hybridConfig.ai_confidence_threshold || 0.7;
        if (intent2.confidence >= threshold) {
          const partialOption = allRows.find((row) => {
            const rowLower = row.title.toLowerCase();
            const descLower = (row.description || "").toLowerCase();
            const msgWords = messageLower.split(/\s+/);
            return msgWords.some((word) => word.length > 2 && (rowLower.includes(word) || descLower.includes(word))) || intent2.keywords.some((kw) => rowLower.includes(kw) || descLower.includes(kw));
          });
          if (partialOption) {
            console.log(`\u{1F916} [HYBRID_AI] Match parcial em lista: ${partialOption.title}`);
            if (partialOption.save_variable) {
              variables[partialOption.save_variable] = partialOption.title;
              console.log(`\u{1F4BE} [HYBRID_AI] Salvando vari\xE1vel ${partialOption.save_variable} = "${partialOption.title}"`);
            } else if (currentNode.content.save_variable) {
              variables[currentNode.content.save_variable] = partialOption.title;
              console.log(`\u{1F4BE} [HYBRID_AI] Salvando vari\xE1vel ${currentNode.content.save_variable} = "${partialOption.title}"`);
            }
            variables["opcao_escolhida"] = partialOption.title;
            variables["opcao_id"] = partialOption.id;
            const handle = `row_${partialOption.id}`;
            const nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) || findNextNode(currentNode.node_id, "default", nodes, connections);
            if (nextNode) {
              const response = await processNode(nextNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
              await updateConversationState(conversationId, config.id, {
                current_node_id: response.currentNodeId,
                variables: { ...variables, ...response.variables },
                visited_nodes: [...state.visited_nodes, currentNode.node_id]
              });
              return applyHumanization(response, config);
            }
          }
          const intentNodeId = findNodeByIntent(intent2, nodes, { variables, currentNodeId: currentNode.node_id });
          if (intentNodeId && intentNodeId !== currentNode.node_id) {
            const intentNode = nodes.find((n) => n.node_id === intentNodeId);
            if (intentNode) {
              console.log(`\u{1F916} [HYBRID_AI] Redirecionando para n\xF3 por inten\xE7\xE3o: ${intentNode.name}`);
              const response = await processNode(intentNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
              await updateConversationState(conversationId, config.id, {
                current_node_id: response.currentNodeId,
                variables: { ...variables, ...response.variables },
                visited_nodes: [...state.visited_nodes, currentNode.node_id]
              });
              return applyHumanization(response, config);
            }
          }
        }
      }
      if (intent.confidence >= 0.6) {
        const matchedRow = allRows.find((row) => {
          const rowText = row.title.toLowerCase();
          return intent.keywords.some((kw) => rowText.includes(kw.toLowerCase()));
        });
        if (matchedRow) {
          console.log(`\u{1F916} [IA] Inten\xE7\xE3o "${intent.category}" mapeada para lista: ${matchedRow.title}`);
          if (matchedRow.save_variable) {
            variables[matchedRow.save_variable] = matchedRow.title;
            console.log(`\u{1F4BE} [IA_INTENT] Salvando vari\xE1vel (da lista) ${matchedRow.save_variable} = "${matchedRow.title}"`);
          } else if (currentNode.content.save_variable) {
            variables[currentNode.content.save_variable] = matchedRow.title;
            console.log(`\u{1F4BE} [IA_INTENT] Salvando vari\xE1vel (do n\xF3) ${currentNode.content.save_variable} = "${matchedRow.title}"`);
          }
          const handle = `row_${matchedRow.id}`;
          const nextNode = findNextNode(currentNode.node_id, handle, nodes, connections) || findNextNode(currentNode.node_id, "default", nodes, connections);
          if (nextNode) {
            const response = await processNode(nextNode, { ...state, variables, visited_nodes: [...state.visited_nodes, currentNode.node_id] }, nodes, connections, config);
            await updateConversationState(conversationId, config.id, {
              current_node_id: response.currentNodeId,
              variables: { ...variables, ...response.variables },
              visited_nodes: [...state.visited_nodes, currentNode.node_id]
            });
            return applyHumanization(response, config);
          }
        }
      }
      console.log(`\u26A0\uFE0F [CHATBOT_ENGINE] Lista - Mensagem n\xE3o reconhecida: "${message}" - Mostrando fallback`);
      return applyHumanization({
        messages: [{ type: "text", content: config.fallback_message, delay: config.typing_delay_ms }],
        waitingForInput: true,
        currentNodeId: currentNode.node_id,
        variables: state.variables
      }, config);
    }
  }
  console.log(`[CHATBOT_ENGINE] N\xE3o foi poss\xEDvel processar mensagem para n\xF3 ${currentNode.node_type}`);
  return null;
}
async function getChatbotStats(userId) {
  try {
    const result = await withRetry(async () => {
      return db.execute(sql2`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(jsonb_object_keys(variables)::int) as vars_count
        FROM chatbot_conversation_data cd
        JOIN chatbot_configs c ON cd.chatbot_id = c.id
        WHERE c.user_id = ${userId}
      `);
    });
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
    return {
      totalConversations: parseInt(row.total) || 0,
      activeConversations: parseInt(row.active) || 0,
      completedConversations: parseInt(row.completed) || 0,
      variablesCollected: parseInt(row.vars_count) || 0
    };
  } catch (error) {
    console.error("[CHATBOT_ENGINE] Erro ao obter estat\xEDsticas:", error);
    return null;
  }
}

export {
  clearFlowCache,
  isChatbotActive,
  processChatbotMessage,
  getChatbotStats
};
