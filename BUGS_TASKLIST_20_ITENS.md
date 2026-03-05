# 🐛 TASKLIST DE 20 BUGS CRÍTICOS - AGENTEZAP

**Análise Completa do Sistema AgenteZap**  
**Data:** 27/06/2025  
**Supabase Project:** bnfpcuzjvycudccycqqt  

---

## 📊 RESUMO EXECUTIVO

Após análise profunda do banco de dados (69.700+ mensagens, 3.120 conversas) e código fonte (aiAgent.ts com 2.058 linhas, adminAgentService.ts com 3.527 linhas), foram identificados **20 bugs críticos** que afetam diretamente:

- 🔴 Taxa de conversão (cadastro em agentezap.online)
- 🔴 Experiência do usuário (amnésia, loops, repetições)
- 🔴 Custos operacionais (chamadas desnecessárias à API Mistral)
- 🔴 Reputação da marca (comportamento não-humano da IA)

---

## 🚨 BUGS CRÍTICOS (PRIORIDADE MÁXIMA)

### BUG #1: LOOP INFINITO COM BOTS EXTERNOS
**Severidade:** 🔴 CRÍTICA  
**Arquivo:** `server/aiAgent.ts`  
**Evidência SQL:** Conversa `73564822-0a51-46c8-a749-74e6a3faa787` com **686 repetições** da mesma mensagem  
**Descrição:**  
A IA não detecta quando está conversando com OUTRO BOT (ex: Anhanguera Vaiqtá, sistemas automatizados). Isso cria loops infinitos onde a IA responde repetidamente a mensagens automáticas.

**Mensagem repetida 686x:**
> "Giordano, entendi que você trabalha com saúde e beleza. Posso te ajudar a aumentar suas vendas..."

**Solução:**
```typescript
// Adicionar em aiAgent.ts - função de detecção de bots
const BOT_PATTERNS = [
  /vaiqtá/i, /anhanguera/i, /bradesco/i, /nubank/i,
  /central de atendimento/i, /este é um atendimento automático/i,
  /digite \d para/i, /selecione uma opção/i,
  /RA:|CPF:|matrícula:/i, // Padrões de sistemas automatizados
];

function isAutomatedMessage(text: string): boolean {
  return BOT_PATTERNS.some(pattern => pattern.test(text));
}

// Antes de responder, verificar:
if (isAutomatedMessage(incomingMessage)) {
  console.log('🤖 Mensagem de bot detectada - ignorando');
  return null; // Não responder
}
```

---

### BUG #2: AMNÉSIA DE SAUDAÇÃO - IA REPETE "OLÁ" MÚLTIPLAS VEZES
**Severidade:** 🔴 CRÍTICA  
**Arquivo:** `server/aiAgent.ts` (função `analyzeConversationHistory`)  
**Evidência SQL:** Contato "Zulmar Pimentel" recebeu 4 saudações idênticas  
**Descrição:**  
O sistema anti-amnésia existe mas **não está funcionando corretamente**. A IA envia múltiplas saudações ao mesmo contato, demonstrando que não lembra de já ter cumprimentado.

**Exemplo real:**
```
1. "Boa tarde, Zulmar Pimentel! Tudo bem? Rodrigo da AgenteZap aqui..."
2. "Boa tarde, Zulmar! Tudo bem? Rodrigo da AgenteZap aqui..." (2ª vez)
3. "Olá, Zulmar! Tudo bem? Rodrigo da AgenteZap aqui..." (3ª vez)
4. "Boa tarde, Zulmar! Tudo bem? Rodrigo da AgenteZap aqui..." (4ª vez)
```

**Solução:**
```typescript
// Problema: greetingPatterns não está capturando todas as variações
const greetingPatterns = /\b(oi|olá|ola|bom dia|boa tarde|boa noite|tudo bem|e aí|eai|hey|hello)\b.*\??\s*(rodrigo|agentezap)?/i;

// Adicionar verificação mais robusta:
function hasAlreadyGreeted(history: Message[]): boolean {
  const ourMessages = history.filter(m => m.fromMe);
  if (ourMessages.length === 0) return false;
  
  // Se já mandamos QUALQUER mensagem, considerar como "já cumprimentamos"
  // A primeira mensagem SEMPRE é uma saudação
  return ourMessages.length > 0;
}
```

---

### BUG #3: REPETIÇÃO MASSIVA DE CONTEÚDO IDÊNTICO
**Severidade:** 🔴 CRÍTICA  
**Arquivo:** `server/aiAgent.ts`  
**Evidência SQL:** Mesma mensagem repetida **224 vezes** para o mesmo cliente  
**Descrição:**  
A IA não mantém histórico efetivo do que já disse. Mesmo com o sistema `hasSentMedia` e `hasAnsweredQuestions`, continua repetindo exatamente as mesmas frases.

**Mensagem repetida 224x:**
> "Giordano, entendo que você está ocupado com seu trabalho, mas adoraria te mostrar nossa progressiva vegetal sem formol..."

**Solução:**
```typescript
// Adicionar hash das últimas N mensagens para evitar repetição
const messageHashes = new Set<string>();

function generateMessageHash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 100);
}

// Antes de enviar:
const hash = generateMessageHash(response);
if (messageHashes.has(hash)) {
  console.log('⚠️ Tentativa de repetir mensagem - gerando alternativa');
  response = await generateAlternativeResponse(context);
}
messageHashes.add(hash);
```

---

### BUG #4: SISTEMA DE FOLLOW-UP IGNORA CONVERSAS ATIVAS
**Severidade:** 🔴 CRÍTICA  
**Arquivo:** `server/followUpService.ts`  
**Descrição:**  
Follow-ups são enviados mesmo quando o cliente já está em conversa ativa, interrompendo o fluxo de vendas e causando confusão.

**Solução:**
```typescript
// Verificar última interação antes de enviar follow-up
async function shouldSendFollowUp(conversationId: string): Promise<boolean> {
  const lastMessage = await getLastMessage(conversationId);
  const timeSinceLastMsg = Date.now() - lastMessage.timestamp;
  
  // Não enviar follow-up se cliente respondeu nos últimos 30 minutos
  if (timeSinceLastMsg < 30 * 60 * 1000) {
    return false;
  }
  return true;
}
```

---

### BUG #5: FALTA DE RATE LIMITING POR CONVERSA
**Severidade:** 🔴 CRÍTICA  
**Arquivo:** `server/aiAgent.ts`  
**Descrição:**  
Não há limite de mensagens por período. A IA pode enviar dezenas de mensagens em poucos minutos, sobrecarregando a API Mistral e o cliente.

**Solução:**
```typescript
// Implementar rate limiting por conversa
const conversationRateLimit = new Map<string, number[]>();

function checkRateLimit(conversationId: string): boolean {
  const now = Date.now();
  const timestamps = conversationRateLimit.get(conversationId) || [];
  
  // Manter apenas últimos 5 minutos
  const recentTimestamps = timestamps.filter(t => now - t < 5 * 60 * 1000);
  
  // Máximo 10 mensagens em 5 minutos
  if (recentTimestamps.length >= 10) {
    return false; // Bloqueado
  }
  
  recentTimestamps.push(now);
  conversationRateLimit.set(conversationId, recentTimestamps);
  return true;
}
```

---

## 🟠 BUGS IMPORTANTES (PRIORIDADE ALTA)

### BUG #6: CONTEXTO DE CONVERSA TRUNCADO
**Severidade:** 🟠 ALTA  
**Arquivo:** `server/aiAgent.ts`  
**Descrição:**  
O histórico enviado para a API Mistral é limitado, mas o corte é feito de forma que perde contexto importante do início da conversa (nome do cliente, negócio, etc).

**Solução:**
```typescript
// Implementar resumo de contexto em vez de truncamento simples
function prepareConversationContext(history: Message[], maxTokens: number): Message[] {
  // Sempre manter: primeira mensagem, últimas 10, + resumo do meio
  const essential = [
    ...history.slice(0, 3),      // Início (apresentação)
    ...history.slice(-10)        // Últimas mensagens
  ];
  
  // Gerar resumo das mensagens intermediárias
  const middleMessages = history.slice(3, -10);
  if (middleMessages.length > 0) {
    const summary = generateSummary(middleMessages);
    essential.splice(3, 0, { role: 'system', content: `[Resumo da conversa anterior: ${summary}]` });
  }
  
  return essential;
}
```

---

### BUG #7: DETECÇÃO DE INTENÇÃO IMPRECISA
**Severidade:** 🟠 ALTA  
**Arquivo:** `server/aiAgent.ts` (função `analyzeConversationHistory`)  
**Descrição:**  
A regex para detectar "cliente quer comprar" vs "cliente quer saber mais" é muito simplista, causando respostas inadequadas.

**Solução:**
```typescript
// Usar classificação semântica em vez de regex
const INTENT_PATTERNS = {
  READY_TO_BUY: [
    /quero (comprar|assinar|contratar)/i,
    /como (pago|faço o pagamento)/i,
    /aceito|fechado|pode fazer/i,
    /qual o pix|chave pix/i
  ],
  INTERESTED: [
    /me explica|como funciona/i,
    /quanto custa|qual o preço/i,
    /tem teste|posso testar/i
  ],
  OBJECTION: [
    /caro|muito|não sei/i,
    /vou pensar|depois/i,
    /já tenho|uso outro/i
  ],
  CONFUSED: [
    /não entendi|como assim/i,
    /o que é isso|qual/i
  ]
};
```

---

### BUG #8: PROMPT BLOAT - CONTEXTO EXCESSIVO
**Severidade:** 🟠 ALTA  
**Arquivo:** `server/aiAgent.ts` (função `generateMemoryContextBlock`)  
**Descrição:**  
O bloco de contexto gerado é muito extenso (300+ linhas), consumindo tokens desnecessariamente e diluindo as instruções importantes.

**Atual:** Bloco com dividers `═══════════════════════════════════════════════════════════════════════════════`

**Solução:**
```typescript
// Compactar contexto para ser mais direto
function generateCompactContext(memory: ConversationMemory): string {
  return `
[CONTEXTO RÁPIDO]
- Cliente: ${memory.clientInfo.name || 'desconhecido'}
- Já cumprimentou: ${memory.hasGreeted ? 'SIM - NÃO CUMPRIMENTE' : 'NÃO'}
- Pendências: ${memory.pendingActions.join(', ') || 'nenhuma'}
- Último tópico: ${memory.lastTopics[0] || 'nenhum'}
`;
}
```

---

### BUG #9: ERRO NO SPLIT DE MENSAGENS LONGAS
**Severidade:** 🟠 ALTA  
**Arquivo:** `server/aiAgent.ts`  
**Descrição:**  
Mensagens longas são divididas em partes, mas o split corta no meio de palavras ou frases, gerando texto incoerente.

**Solução:**
```typescript
function smartSplit(text: string, maxChars: number = 200): string[] {
  const parts: string[] = [];
  let remaining = text;
  
  while (remaining.length > maxChars) {
    // Encontrar ponto de corte natural (., !, ?, \n)
    let cutPoint = remaining.substring(0, maxChars).lastIndexOf('.');
    if (cutPoint < maxChars * 0.5) {
      cutPoint = remaining.substring(0, maxChars).lastIndexOf(' ');
    }
    if (cutPoint < 0) cutPoint = maxChars;
    
    parts.push(remaining.substring(0, cutPoint + 1).trim());
    remaining = remaining.substring(cutPoint + 1).trim();
  }
  
  if (remaining) parts.push(remaining);
  return parts;
}
```

---

### BUG #10: FALTA DE DETECÇÃO DE DESPEDIDA
**Severidade:** 🟠 ALTA  
**Descrição:**  
A IA não detecta quando o cliente se despediu e continua tentando vender, parecendo insistente e robótica.

**Solução:**
```typescript
const GOODBYE_PATTERNS = [
  /obrigad[oa]|valeu|falou/i,
  /tchau|até mais|até logo/i,
  /não tenho interesse|não quero/i,
  /para de mandar|bloquear/i
];

function hasClientSaidGoodbye(message: string): boolean {
  return GOODBYE_PATTERNS.some(p => p.test(message));
}

// Se cliente se despediu, responder educadamente e PARAR
if (hasClientSaidGoodbye(lastClientMessage)) {
  return "Foi um prazer conversar com você! Se precisar de algo no futuro, é só chamar. 😊";
  // Marcar conversa como "encerrada pelo cliente"
}
```

---

## 🟡 BUGS MODERADOS (PRIORIDADE MÉDIA)

### BUG #11: EMOJI OVERFLOW
**Severidade:** 🟡 MÉDIA  
**Descrição:**  
Algumas respostas têm 5+ emojis, parecendo spam ou mensagem automática. O prompt pede "1-2 emojis" mas a IA não respeita.

**Solução:**
```typescript
function limitEmojis(text: string, maxEmojis: number = 2): string {
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}]/gu;
  const emojis = text.match(emojiRegex) || [];
  
  if (emojis.length <= maxEmojis) return text;
  
  // Remover emojis excedentes
  let count = 0;
  return text.replace(emojiRegex, (match) => {
    count++;
    return count <= maxEmojis ? match : '';
  });
}
```

---

### BUG #12: HORÁRIO DE ATENDIMENTO IGNORADO
**Severidade:** 🟡 MÉDIA  
**Descrição:**  
A IA responde 24/7 mas não adapta a saudação corretamente. Às 3h da manhã ainda diz "Boa tarde".

**Solução:**
```typescript
// Verificar getBrazilGreeting() - pode estar com timezone errado
function getBrazilGreeting(): { greeting: string; period: string } {
  const brazilTime = new Date().toLocaleString('en-US', { 
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    hour12: false
  });
  const hour = parseInt(brazilTime);
  
  if (hour >= 5 && hour < 12) return { greeting: 'Bom dia', period: 'manhã' };
  if (hour >= 12 && hour < 18) return { greeting: 'Boa tarde', period: 'tarde' };
  return { greeting: 'Boa noite', period: 'noite' };
}
```

---

### BUG #13: VARIÁVEIS DE TEMPLATE NÃO SUBSTITUÍDAS
**Severidade:** 🟡 MÉDIA  
**Descrição:**  
Templates com `{{nome}}`, `{cliente}`, `[NOME]` aparecem literalmente na mensagem enviada ao cliente.

**Solução:**
```typescript
function replaceTemplateVariables(text: string, context: any): string {
  return text
    .replace(/\{\{nome\}\}|\{nome\}|\[nome\]|\[cliente\]/gi, context.clientName || 'você')
    .replace(/\{\{empresa\}\}|\{empresa\}/gi, context.companyName || 'nossa empresa')
    .replace(/\{\{produto\}\}|\{produto\}/gi, context.productName || 'nosso serviço');
}
```

---

### BUG #14: MÍDIA NÃO ENVIADA APÓS PROMESSA
**Severidade:** 🟡 MÉDIA  
**Arquivo:** `server/aiAgent.ts`  
**Descrição:**  
A IA promete enviar vídeo/áudio/imagem mas não envia efetivamente. O sistema `pendingActions` detecta mas não executa.

**Solução:**
```typescript
// Após gerar resposta, verificar se há mídia para enviar
if (memory.pendingActions.some(a => a.includes('vídeo') || a.includes('imagem'))) {
  // Buscar mídia correspondente no agent_media_library
  const media = await findRelevantMedia(context.agentId, memory.lastTopics);
  if (media) {
    // Enviar mídia junto com a mensagem
    await sendMediaMessage(conversationId, media);
  }
}
```

---

### BUG #15: CACHE DE MODELO NUNCA EXPIRA CORRETAMENTE
**Severidade:** 🟡 MÉDIA  
**Arquivo:** `server/adminAgentService.ts` (linha 108)  
**Descrição:**  
O cache do modelo IA é definido para 1 minuto mas a variável `modelCacheExpiry` é global e pode causar race conditions.

**Solução:**
```typescript
// Usar Map com TTL em vez de variável global
const modelCache = new Map<string, { model: string; expiry: number }>();

async function getConfiguredModel(): Promise<string> {
  const cacheKey = 'admin_agent_model';
  const cached = modelCache.get(cacheKey);
  
  if (cached && cached.expiry > Date.now()) {
    return cached.model;
  }
  
  const model = await storage.getSystemConfig(cacheKey) || DEFAULT_MODEL;
  modelCache.set(cacheKey, { model, expiry: Date.now() + 60000 });
  return model;
}
```

---

## 🟢 BUGS MENORES (PRIORIDADE BAIXA)

### BUG #16: LOG EXCESSIVO EM PRODUÇÃO
**Severidade:** 🟢 BAIXA  
**Descrição:**  
Console.log extensivos em produção afetam performance e expõem dados sensíveis.

**Solução:**
```typescript
const isDev = process.env.NODE_ENV !== 'production';
const log = isDev ? console.log : () => {};
```

---

### BUG #17: TIMEOUT DE SESSÃO NÃO IMPLEMENTADO
**Severidade:** 🟢 BAIXA  
**Arquivo:** `server/adminAgentService.ts`  
**Descrição:**  
Sessões de cliente nunca expiram, consumindo memória indefinidamente.

**Solução:**
```typescript
// Limpar sessões inativas a cada hora
setInterval(() => {
  const now = Date.now();
  for (const [phone, session] of clientSessions.entries()) {
    if (now - session.lastInteraction.getTime() > 24 * 60 * 60 * 1000) {
      clientSessions.delete(phone);
    }
  }
}, 60 * 60 * 1000);
```

---

### BUG #18: ERRO SILENCIOSO EM ANÁLISE DE IMAGEM
**Severidade:** 🟢 BAIXA  
**Arquivo:** `server/mistralClient.ts`  
**Descrição:**  
Erros na análise de imagem são engolidos, causando comportamento inconsistente.

**Solução:**
```typescript
try {
  const analysis = await analyzeImageWithMistral(imageUrl);
  return analysis;
} catch (error) {
  console.error('❌ Erro ao analisar imagem:', error);
  return { success: false, error: 'Não foi possível analisar a imagem' };
}
```

---

### BUG #19: DUPLICAÇÃO DE CÓDIGO NA DETECÇÃO DE PADRÕES
**Severidade:** 🟢 BAIXA  
**Arquivo:** `server/aiAgent.ts`  
**Descrição:**  
Os mesmos patterns de regex são definidos múltiplas vezes em funções diferentes.

**Solução:**
```typescript
// Centralizar patterns em arquivo separado
// server/patterns.ts
export const PATTERNS = {
  greeting: /\b(oi|olá|bom dia|boa tarde|boa noite)\b/i,
  question: /\?|como|quanto|qual|quando|onde|por que/i,
  price: /preço|valor|quanto custa|promoção/i,
  // ...
};
```

---

### BUG #20: FALTA DE VALIDAÇÃO DE INPUT DO CLIENTE
**Severidade:** 🟢 BAIXA  
**Descrição:**  
Mensagens do cliente não são sanitizadas, podendo conter caracteres que quebram formatação.

**Solução:**
```typescript
function sanitizeInput(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Caracteres de controle
    .trim()
    .substring(0, 5000); // Limite de tamanho
}
```

---

## 📈 MÉTRICAS DE IMPACTO

| Bug | Conversas Afetadas | Estimativa de Perda |
|-----|-------------------|---------------------|
| #1 Loop com Bots | 5+ | ~1.500 mensagens/dia desperdiçadas |
| #2 Amnésia Saudação | 50+ | ~20% queda na conversão |
| #3 Repetição Massiva | 10+ | ~30% abandono de conversa |
| #4 Follow-up Errado | 100+ | Irritação do cliente |
| #5 Sem Rate Limit | Todas | Custo API 5x maior |

---

## 🔧 ORDEM DE CORREÇÃO RECOMENDADA

1. **URGENTE (Hoje):** #1, #2, #3, #5 - Causam loops e desperdício
2. **IMPORTANTE (Esta semana):** #4, #6, #7, #10 - Afetam conversão
3. **MELHORIAS (Próxima semana):** #8, #9, #11-#15 - Otimização
4. **QUANDO POSSÍVEL:** #16-#20 - Qualidade de código

---

## 📞 PRÓXIMOS PASSOS

1. ✅ Criar este documento de bugs
2. ⏳ Criar arquivo de teste com 100 tipos de cliente
3. ⏳ Implementar correções bug a bug
4. ⏳ Testar cada correção individualmente
5. ⏳ Deploy no Railway via MCP

---

*Documento gerado automaticamente pela análise do GitHub Copilot*  
*Supabase Project: bnfpcuzjvycudccycqqt*
