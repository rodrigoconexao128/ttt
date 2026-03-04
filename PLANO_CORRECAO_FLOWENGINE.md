# 🎯 PLANO DE CORREÇÃO DO FLOWENGINE

**Data:** 18 de Janeiro de 2026  
**Status:** 🔴 URGENTE - Sistema pior que IA pura

---

## 🔍 PROBLEMA RAIZ IDENTIFICADO

### Situação Atual

✅ **JÁ FUNCIONA:**
1. Persistência de estado (`ConversationState` salvo no banco)
2. Humanização com IA (classe `AIHumanizer` implementada)
3. Fluxo determinístico (busca dados do banco)

❌ **PROBLEMAS:**
1. **Humanizer está PIORANDO ao invés de MELHORAR** - Adicionando formato técnico ao invés de deixar natural
2. **Menu formatado não está sendo melhorado pelo humanizer** - Está ficando robotizado
3. **Contexto não é mantido corretamente** - Reinicia fluxo quando pergunta cardápio de novo

---

## 🔧 CORREÇÕES NECESSÁRIAS

### Correção 1: Melhorar Formatação do Menu (URGENTE)

**Arquivo:** `vvvv/server/UnifiedFlowEngine.ts`  
**Linha:** 420-480  
**Função:** `loadMenuData()`

**Problema Atual:**
```typescript
menuFormatted += `\n*${category.name.toUpperCase()}*\n`;
for (const item of categoryItems) {
  const price = parseFloat(item.price).toFixed(2).replace('.', ',');
  menuFormatted += `• ${item.name} - R$ ${price}\n`;
  if (item.description) {
    menuFormatted += `  ↳ ${item.description}\n`;
  }
}
```

**Novo Formato (Mais Natural):**
```typescript
// Agrupar por categoria mas formatar de forma natural
for (const category of categories || []) {
  const categoryItems = (items || []).filter(item => item.category_id === category.id);
  if (categoryItems.length === 0) continue;
  
  // Não usar separadores técnicos
  menuFormatted += `\n🍕 *${category.name}*\n\n`;
  
  for (const item of categoryItems) {
    const price = parseFloat(item.price).toFixed(2);
    // Formato mais natural
    menuFormatted += `${item.name} - R$ ${price}\n`;
    if (item.description) {
      menuFormatted += `${item.description}\n\n`;
    } else {
      menuFormatted += `\n`;
    }
  }
}
```

---

### Correção 2: Melhorar Prompt do Humanizer (URGENTE)

**Arquivo:** `vvvv/server/UnifiedFlowEngine.ts`  
**Linha:** 631-693  
**Função:** `AIHumanizer.humanize()`

**Problema Atual:**
O humanizer está ADICIONANDO formatação técnica ao invés de simplificar.

**Novo Prompt:**
```typescript
const systemPrompt = `Você é ${flow.agentName} da ${flow.businessName}.
Personalidade: ${personality}

TAREFA CRÍTICA:
Transforme a resposta abaixo em uma mensagem NATURAL de WhatsApp.

REGRAS ESTRITAS:
1. NUNCA use separadores como "━━━━━" ou formatação técnica
2. NUNCA adicione títulos como "NOSSO DELIVERY" ou "INFORMAÇÕES"
3. Mantenha TODOS os dados (preços, nomes, descrições) EXATOS
4. Use no máximo 1-2 emojis relevantes
5. Tom de conversa informal e amigável
6. Se for cardápio, liste os itens de forma simples e direta
7. NÃO invente informações - use APENAS o que está na resposta

EXEMPLO DE BOA HUMANIZAÇÃO (Cardápio):
Entrada: "*PIZZAS*\n• Pizza Mussarela - R$ 45,00\n"
Saída: "Temos essas pizzas deliciosas:\n\nPizza de Mussarela - R$ 45,00\nMassa artesanal com mussarela de primeira...\n\nQual você gostaria? 😊"

Responda APENAS com o texto humanizado, sem explicações ou separadores.`;
```

---

### Correção 3: Detectar Pergunta Repetida no Meio do Pedido (IMPORTANTE)

**Arquivo:** `vvvv/server/UnifiedFlowEngine.ts`  
**Linha:** 770-800  
**Função:** `processMessage()`

**Adicionar ANTES da detecção de intent:**

```typescript
// 3. NOVO: Detectar se cliente pergunta cardápio quando já está fazendo pedido
if (state.currentState === 'ENDERECO' || state.currentState === 'PAGAMENTO') {
  // Cliente está no meio do pedido
  const msgLower = message.toLowerCase();
  if (msgLower.includes('cardápio') || msgLower.includes('menu') || msgLower.includes('pizzas')) {
    // Cliente perguntou cardápio de novo! Não reinicia - mostra pedido atual
    console.log(`   🔄 Cliente perguntou cardápio no meio do pedido - Mostrando pedido atual`);
    
    // Forçar intent para mostrar carrinho
    intentResult = { intent: 'SEE_CART', confidence: 100 };
    
    // E adicionar mensagem explicativa
    const cartSummary = formatCartSummary(state.data.cart || []);
    return {
      text: `Você já está fazendo um pedido! 😊\n\n${cartSummary}\n\nPara finalizar, ${
        state.currentState === 'ENDERECO' ? 'preciso do seu endereço' : 'escolha a forma de pagamento'
      }.`,
      newState: state.currentState, // Mantém estado
      intent: 'SEE_CART',
      action: 'SHOW_CART'
    };
  }
}
```

---

### Correção 4: Simplificar Template do Cardápio (IMPORTANTE)

**Arquivo:** `vvvv/server/FlowBuilder.ts`  
**Linha:** ~654  
**Action:** `SHOW_MENU`

**De:**
```typescript
SHOW_MENU: {
  name: 'Mostrar Menu',
  type: 'DATA',
  dataSource: 'menu',
  template: '📋 *CARDÁPIO {business_name}*\n\n{menu_formatted}\n\nO que vai querer?'
},
```

**Para:**
```typescript
SHOW_MENU: {
  name: 'Mostrar Menu',
  type: 'DATA',
  dataSource: 'menu',
  template: 'Olá! Essas são nossas opções:\n\n{menu_formatted}\n\nQual você gostaria de pedir?'
},
```

---

### Correção 5: Adicionar Categoria Padrão (MENOR PRIORIDADE)

**Problema:** Itens sem categoria aparecem como "Outros"

**Solução:** Ao criar item sem categoria, criar automaticamente categoria "Pizzas" se for pizzaria.

**Arquivo:** `vvvv/server/routes.ts` (endpoint de criar item do menu)

```typescript
// Se não tem categoria_id e é pizzaria, criar categoria padrão
if (!category_id) {
  const { data: pizzasCategory } = await supabase
    .from('menu_categories')
    .select('id')
    .eq('user_id', userId)
    .eq('name', 'Pizzas')
    .single();
  
  if (!pizzasCategory) {
    // Criar categoria "Pizzas"
    const { data: newCat } = await supabase
      .from('menu_categories')
      .insert({ user_id: userId, name: 'Pizzas', display_order: 1 })
      .select()
      .single();
    
    category_id = newCat?.id;
  } else {
    category_id = pizzasCategory.id;
  }
}
```

---

## 📋 ORDEM DE IMPLEMENTAÇÃO

### 🔴 FASE 1 - URGENTE (Agora)
1. ✅ Modificar `loadMenuData()` - Formato mais natural
2. ✅ Melhorar prompt do `AIHumanizer` - Remover separadores técnicos
3. ✅ Simplificar template `SHOW_MENU`

### 🟡 FASE 2 - IMPORTANTE (Após testes)
4. ⏳ Detectar pergunta repetida no meio do pedido
5. ⏳ Adicionar categoria padrão para itens

### 🟢 FASE 3 - MELHORIAS (Futuro)
6. ⏳ Adicionar suporte a variações (tamanho de pizza, sabores)
7. ⏳ Melhorar confirmação de pedido
8. ⏳ Histórico de pedidos anteriores

---

## 🧪 TESTES APÓS CORREÇÃO

### Teste 1: Cardápio Natural
**Input:** "Quais pizzas vocês têm?"  
**Expected:** Resposta natural sem "━━━━━", sem "🍽️ NOSSO DELIVERY", só lista de pizzas com preços

### Teste 2: Pedido em Andamento
**Contexto:** Cliente está no meio do pedido (esperando endereço)  
**Input:** "Quais pizzas vocês têm?"  
**Expected:** "Você já está fazendo um pedido de Pizza de Mussarela (R$45). Para finalizar, preciso do seu endereço."

### Teste 3: Repetir Mesma Pergunta
**Input 1:** "Cardápio"  
**Input 2:** "Cardápio" (de novo)  
**Expected:** Mesma resposta, mas mais natural na segunda vez (humanizer com variação)

---

## 💡 RESULTADO ESPERADO

**ANTES (Atual):**
```
🍽️ *NOSSO DELIVERY*
━━━━━━━━━━━━━━━━━━━━

📁 *Outros*

▪️ Pizza de Mussarela
Deliciosa pizza com mussarela...
💰 *R$ 45,00*

━━━━━━━━━━━━━━━━━━━━

📋 *INFORMAÇÕES*
🛵 Entrega: R$ 0,00
⏱️ Tempo estimado: 45 min
```

**DEPOIS (Corrigido):**
```
Olá! Essas são nossas pizzas deliciosas:

🍕 Pizza de Mussarela - R$ 45,00
Deliciosa pizza com mussarela de primeira qualidade, molho de tomate caseiro e orégano.

Qual você gostaria de pedir? 😊
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Modificar `loadMenuData()` em UnifiedFlowEngine.ts
- [ ] Atualizar prompt do `AIHumanizer`
- [ ] Simplificar template `SHOW_MENU` no FlowBuilder.ts
- [ ] Testar no simulador
- [ ] Adicionar detecção de pergunta repetida
- [ ] Deploy no Railway
- [ ] Testar em produção com conta de teste

---

## 📌 OBSERVAÇÕES IMPORTANTES

1. **NÃO desabilitar humanização** - O problema não é a humanização, é o PROMPT do humanizer que está adicionando formatação técnica

2. **Manter temperature baixa (0.3)** - Para evitar variações demais

3. **Testar com conta real** - O comportamento pode mudar com mais itens no cardápio

4. **Monitorar logs** - Console logs do FlowEngine mostram exatamente o que está acontecendo

---

**Próximo passo:** Implementar Fase 1 (correções urgentes) e testar.
