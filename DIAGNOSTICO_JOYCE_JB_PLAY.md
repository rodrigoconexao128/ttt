# 🔍 DIAGNÓSTICO: joyce02yasmin@gmail.com - JB Play TV IPTV

**Data**: 2026-01-26  
**Conta**: joyce02yasmin@gmail.com (BRUNO MORRONE DE SANTANA)  
**Problema**: Agente não responde corretamente no WhatsApp  

---

## ❌ **PROBLEMAS IDENTIFICADOS**

### 1. **FlowDefinition INCORRETO**
**Problema**: Flow type é VENDAS mas deveria ser SUPORTE ou um flow customizado

**Dados do Banco**:
```
- flow_type: "VENDAS"  
- agent_name: "Atendente JB Play"
- business_name: "JB Play TV IPTV"
- created_at: 2026-01-19 07:56:05
```

**Mensagem do Flow START (gerada automaticamente)**:
```
👋 Olá! Seja bem-vindo à JB Play TV 📺!

Como posso te ajudar hoje?

1️⃣ Ver aparelhos compatíveis
2️⃣ Preços e planos
3️⃣ Como funciona
4️⃣ Já sou cliente (suporte)
```

**Mensagem DESEJADA pelo prompt**:
```
Ignorar qualquer saudação ou pergunta inicial do cliente. Responder **exatamente** com a seguinte mensagem como primeira interação:

👋 Olá! Seja bem-vindo à JB Play TV 📺
🤖 ATENDIMENTO AUTOMÁTICO
✨ IPTV completo, rápido e estável
📱 Compatível com vários aparelhos
👉 Para continuar, informe qual aparelho você vai usar:
(Digite apenas o número 👇)

🔵 1️⃣ TV Box
🟣 2️⃣ TV Android
🟠 3️⃣ Roku
🟢 4️⃣ Smart TV
🟡 5️⃣ Celular Android
🍎 6️⃣ iPhone
```

**Discrepância**: O FlowDefinition gerado automaticamente está usando um template genérico de VENDAS em vez de respeitar a mensagem exata do prompt.

---

### 2. **FlowBuilder não detecta tipo customizado**
**Problema**: O FlowBuilder (FlowBuilder.ts) detecta tipos por palavras-chave mas o prompt do joyce não tem palavras suficientes para detectar nenhum tipo específico.

**Prompt atual** (438 chars):
```
Ignorar qualquer saudação ou pergunta inicial do cliente. Responder **exatamente** com a seguinte mensagem...
```

**Análise**:
- ❌ Não contém palavras DELIVERY (cardápio, pizza, entrega...)
- ❌ Não contém palavras AGENDAMENTO (agendar, consulta, horário...)
- ❌ Não contém palavras VENDAS suficientes
- ❌ Não contém palavras SUPORTE (suporte, problema, ticket...)
- ✅ Contém "IPTV" e "aparelho" → Foi classificado como VENDAS erroneamente

**Resultado**: Sistema criou flow VENDAS genérico que NÃO respeita a mensagem customizada do prompt.

---

### 3. **Problema Arquitetural**
**Problema**: O sistema híbrido "IA nas pontas, robô no meio" funciona PERFEITAMENTE para flows padrão (DELIVERY, AGENDAMENTO, SUPORTE) mas **NÃO funciona** para prompts customizados que exigem mensagens exatas.

**Arquitetura Atual**:
```
IA INTERPRETA → SISTEMA EXECUTA (flow determinístico) → IA HUMANIZA
```

**O que acontece**:
1. FlowBuilder analisa prompt
2. Detecta tipo (VENDAS neste caso)
3. Cria FlowDefinition com estados padrão de VENDAS
4. **IGNORA** a mensagem customizada do prompt
5. Usa mensagem do template VENDAS no estado START

**Por que isso acontece**:
- FlowBuilder tem templates fixos por tipo (DELIVERY, VENDAS, etc)
- Não tem lógica para extrair mensagens customizadas do prompt
- Assume que todos os usuários querem flows padrão

---

## ✅ **SOLUÇÕES POSSÍVEIS**

### Solução 1: **Criar flow customizado manualmente**
1. Desativar FlowDefinition atual
2. Criar novo flow com estado START customizado
3. Mensagem do estado START = mensagem exata do prompt

**Vantagens**:
- Rápido
- Preciso
- Mantém arquitetura híbrida

**Desvantagens**:
- Manual
- Não escala para outros usuários com prompts customizados

---

### Solução 2: **Melhorar FlowBuilder para detectar mensagens customizadas**
Adicionar no `FlowBuilder.ts`:
```typescript
extractCustomGreeting(prompt: string): string | null {
  // Buscar por: "responder exatamente", "primeira mensagem", etc
  const patterns = [
    /responder\s+\*\*exatamente\*\*\s+com.*?:([\s\S]+?)(?:\n\n|$)/i,
    /primeira mensagem.*?:([\s\S]+?)(?:\n\n|$)/i,
    /sempre enviar.*?:([\s\S]+?)(?:\n\n|$)/i
  ];
  
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match) return match[1].trim();
  }
  
  return null;
}
```

**Vantagens**:
- Escalável
- Automático
- Funciona para futuros clientes

**Desvantagens**:
- Requer deploy
- Precisa testar bem

---

### Solução 3: **Desativar FlowEngine para esse usuário**
Forçar uso do sistema legado (IA pura sem flow determinístico).

**Vantagens**:
- Funciona imediatamente
- IA respeita o prompt exatamente

**Desvantagens**:
- ❌ PERDE arquitetura híbrida
- ❌ PERDE anti-variação de respostas
- ❌ IA pode ignorar a mensagem exata

---

## 🔧 **SOLUÇÃO RECOMENDADA: Solução 1 + Solução 2**

### Ação Imediata (Solução 1):
1. Desativar flow VENDAS atual
2. Criar flow customizado com mensagem exata
3. Validar no simulador

### Ação de Longo Prazo (Solução 2):
1. Implementar `extractCustomGreeting()` no FlowBuilder
2. Modificar `buildFromPrompt()` para usar greeting customizado se detectado
3. Deploy e teste

---

## 📊 **DADOS TÉCNICOS**

### User ID
```
b58c4f1d-032d-4b6a-8e85-7b03d4e0be9b
```

### Flow ID Atual (INCORRETO)
```
e1aeefa0-3811-4da6-b309-f2eb00aec556
```

### Prompt Length
```
438 chars
```

### WhatsApp Connection
```
✅ is_connected: true
phone_number: 5511961676249
```

### AI Config
```
✅ is_active: true
model: mistral-small-latest
response_delay_seconds: 10
```

---

## 🚀 **PRÓXIMOS PASSOS**

1. ✅ **Diagnóstico completo** (ESTE DOCUMENTO)
2. ⏳ **Implementar Solução 1** (criar flow customizado)
3. ⏳ **Validar no simulador**
4. ⏳ **Testar no WhatsApp real**
5. ⏳ **Implementar Solução 2** (melhorar FlowBuilder)

---

**Conclusão**: O problema NÃO é com o sistema híbrido em si, mas sim com o FlowBuilder que não detecta mensagens customizadas. O sistema funciona perfeitamente para flows padrão (DELIVERY, AGENDAMENTO, SUPORTE) conforme validado no RELATORIO_VALIDACAO_FLOWENGINE_COMPLETO.md.
