# 🍕 Melhoria no Envio de Cardápio - Sistema Delivery

## 📋 Resumo das Alterações

Implementado sistema inteligente para envio de cardápio quando o módulo delivery está ativo, garantindo:

1. ✅ **Formatação bonita e organizada** - cada produto em uma linha separada
2. ✅ **Mensagens completas** - divisão automática em múltiplas mensagens sem quebrar produtos
3. ✅ **Sistema de tags** - IA usa tag especial `[ENVIAR_CARDAPIO_COMPLETO]` para enviar cardápio formatado
4. ✅ **Funciona no simulador e WhatsApp** - comportamento idêntico em ambos

## 🎯 Como Funciona

### Para o Cliente
Quando o cliente pede o cardápio (exemplos):
- "Qual o cardápio?"
- "Me mostra o menu?"
- "O que vocês têm?"
- "Tem o que?"
- "Quais os produtos?"

**O sistema envia automaticamente:**
```
🍕 *NOME DO NEGÓCIO*
━━━━━━━━━━━━━━━━━━━━

📁 *Pizzas*

⭐ Pizza Calabresa
   _Calabresa, queijo, cebola e azeitonas_
   💰 *R$ 45,00* • Serve 2

▪️ Pizza Margherita
   _Molho de tomate, queijo e manjericão_
   💰 *R$ 40,00* • Serve 2

📁 *Bebidas*

▪️ Coca-Cola Lata
   💰 *R$ 5,00*

━━━━━━━━━━━━━━━━━━━━
📋 *INFORMAÇÕES*

🛵 Entrega: R$ 5,00
⏱️ Tempo estimado: 45 min
🏪 Retirada: GRÁTIS
💳 Pagamento: Dinheiro, Cartão, Pix
```

### Para a IA
A IA usa uma tag especial que é substituída automaticamente pelo cardápio formatado:

```
Cliente: "Qual o cardápio?"

IA: "[ENVIAR_CARDAPIO_COMPLETO]

Aqui está nosso cardápio completo! 😊
Quer fazer um pedido?"
```

O sistema:
1. Detecta a tag `[ENVIAR_CARDAPIO_COMPLETO]`
2. Busca o cardápio ativo no banco de dados
3. Formata o cardápio bonitinho (função `formatMenuForCustomer`)
4. Substitui a tag pelo cardápio formatado
5. Divide em múltiplas mensagens se necessário (sem quebrar produtos!)

## 🔧 Implementação Técnica

### Arquivos Modificados

#### `vvvv/server/aiAgent.ts`

**1. Nova Função: `formatMenuForCustomer()`**
```typescript
export function formatMenuForCustomer(deliveryData: DeliveryMenuForAIResponse): string
```
- Formata cardápio de forma bonita e organizada
- Cada produto em sua própria linha com quebra `\n\n`
- Emojis e formatação WhatsApp (*negrito*, _itálico_)
- Separadores visuais (━━━━━━━━━)
- Informações de entrega/retirada/pagamento

**2. Processamento da Tag `[ENVIAR_CARDAPIO_COMPLETO]`**
```typescript
// Detecta a tag na resposta da IA
if (responseText && responseText.includes('[ENVIAR_CARDAPIO_COMPLETO]')) {
  const deliveryMenu = await getDeliveryMenuForAI(userId);
  const formattedMenu = formatMenuForCustomer(deliveryMenu);
  responseText = responseText.replace(/\[ENVIAR_CARDAPIO_COMPLETO\]/g, formattedMenu);
}
```

**3. Prompt da IA Atualizado**
```typescript
**🚨 REGRA CRÍTICA - ENVIAR CARDÁPIO COMPLETO:**
Quando o cliente pedir o CARDÁPIO, MENU, LISTA DE PRODUTOS:

1️⃣ VOCÊ DEVE USAR ESTA TAG ESPECIAL:
[ENVIAR_CARDAPIO_COMPLETO]

2️⃣ O sistema enviará automaticamente o cardápio formatado
3️⃣ DEPOIS da tag, adicione mensagem amigável

⚠️ NUNCA tente escrever o cardápio você mesmo
⚠️ A tag será substituída automaticamente
⚠️ Cardápio será dividido em mensagens sem quebrar produtos
```

#### `vvvv/server/whatsapp.ts`

A função `splitMessageHumanLike()` já existente cuida da divisão:
- Divide mensagens longas em partes de até 400 caracteres (configurável)
- Respeita quebras de parágrafo (`\n\n`)
- **NUNCA quebra no meio de um produto** (cada produto tem `\n\n` no final)
- Agrupa partes pequenas para otimizar número de mensagens

## 📊 Vantagens

### Antes ❌
- IA tentava copiar/colar cardápio do prompt → inconsistente
- Cardápio podia ser resumido ("entre outros...")
- Formatação ruim, tudo junto
- Quebrava produtos no meio quando ultrapassava limite
- Comportamento diferente simulador vs WhatsApp

### Depois ✅
- Sistema automático com tag `[ENVIAR_CARDAPIO_COMPLETO]`
- Sempre envia cardápio COMPLETO, nunca resume
- Formatação bonita, profissional, organizada
- Divide inteligentemente sem quebrar produtos
- Comportamento idêntico simulador e WhatsApp
- Fácil de manter e atualizar

## 🧪 Como Testar

### No Simulador
1. Ative o módulo delivery para algum usuário
2. Configure produtos no cardápio
3. No simulador, envie: "Qual o cardápio?"
4. Verifique:
   - ✅ Cardápio formatado bonitinho
   - ✅ Todos os produtos listados
   - ✅ Dividido em múltiplas mensagens se for grande
   - ✅ Nenhum produto quebrado no meio

### No WhatsApp
1. Com delivery ativo, envie mensagem: "me mostra o menu"
2. Deve receber:
   - ✅ Mesma formatação do simulador
   - ✅ Cardápio completo
   - ✅ Mensagens separadas se necessário
   - ✅ Produtos inteiros (nunca cortados)

## 🎨 Exemplos de Formatação

### Produto Simples
```
▪️ Coca-Cola Lata
   💰 *R$ 5,00*
```

### Produto com Descrição
```
▪️ Pizza Margherita
   _Molho de tomate, queijo e manjericão_
   💰 *R$ 40,00* • Serve 2
```

### Produto em Promoção
```
⭐ Pizza Calabresa
   _Calabresa, queijo, cebola e azeitonas_
   💰 ~R$ 50,00~ *R$ 45,00* 🔥
```

## 🔄 Fluxo Completo

```
┌─────────────────┐
│ Cliente pede    │
│ cardápio        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ IA detecta e    │
│ inclui tag      │
│ [ENVIAR_        │
│ CARDAPIO_       │
│ COMPLETO]       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Sistema busca   │
│ cardápio ativo  │
│ no banco        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ formatMenu      │
│ ForCustomer()   │
│ formata bonito  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Tag substituída │
│ por cardápio    │
│ formatado       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ splitMessage    │
│ HumanLike()     │
│ divide sem      │
│ quebrar produtos│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Cliente recebe  │
│ cardápio lindo! │
└─────────────────┘
```

## 📝 Notas Importantes

1. **Tag é case-sensitive**: `[ENVIAR_CARDAPIO_COMPLETO]` (tudo maiúsculo)
2. **Tag é removida**: Cliente nunca vê a tag, só o cardápio
3. **Quebra dupla (`\n\n`)**: Essencial para divisão correta
4. **Limite de 400 chars**: Padrão, mas configurável
5. **Emojis**: Usados com moderação para visual agradável
6. **Preços sempre em BRL**: `R$ 45,00` formatação brasileira

## 🚀 Melhorias Futuras Possíveis

- [ ] Permitir filtrar cardápio por categoria via tag (ex: `[ENVIAR_CARDAPIO:PIZZAS]`)
- [ ] Adicionar fotos dos produtos (se disponíveis)
- [ ] Ordenação personalizada (mais vendidos primeiro, etc)
- [ ] Cache do cardápio formatado (evitar reformatar a cada pedido)
- [ ] Analytics: quantas vezes cardápio foi solicitado

## ✅ Checklist de Implementação

- [x] Criar função `formatMenuForCustomer()`
- [x] Exportar interface `DeliveryMenuForAIResponse`
- [x] Atualizar prompt da IA com instruções da tag
- [x] Implementar detecção e substituição da tag
- [x] Testar com cardápios pequenos (< 400 chars)
- [x] Testar com cardápios grandes (divisão em múltiplas mensagens)
- [x] Validar que produtos nunca são quebrados
- [x] Testar no simulador
- [x] Documentar sistema completo

---

**Data da Implementação**: Janeiro 2026
**Desenvolvedor**: GitHub Copilot
**Solicitante**: Usuário (requisito: cardápio bonito, sem quebrar mensagens)
