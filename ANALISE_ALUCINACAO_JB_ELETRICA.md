# 🔬 ANÁLISE DE ALUCINAÇÃO E AMNÉSIA - JB ELÉTRICA

**Cliente:** contato@jbeletrica.com.br  
**User ID:** d4a1d307-3d78-4bfe-8ab7-c4a0c3ccbb1c  
**Data:** 2025-06-26  

---

## 📊 DIAGNÓSTICO INICIAL

### 1. Métricas do Prompt
- **Tamanho:** 26.293 caracteres (~7.000 tokens)
- **Estrutura:** 27 blocos organizados
- **Modelo:** mistral-small-latest
- **Contexto máximo Mistral Small:** ~32.000 tokens

### 2. Problemas Identificados

#### ⚠️ PROBLEMA 1: Prompt MUITO Grande (CRÍTICO)
O prompt tem 26K caracteres (~7K tokens). Quando combinado com:
- Histórico de conversa (~30 mensagens × 100 chars = ~3K chars)
- Sistema de blindagem (~2K chars)
- Sistema anti-amnésia (~2K chars)
- Instruções dinâmicas (~1K chars)

**Total aproximado: ~34K chars (~10K tokens)**

Isso pode causar:
- Perda de contexto em conversas longas
- "Esquecimento" de regras no meio do prompt
- Alucinação por tentar "preencher lacunas"

#### ⚠️ PROBLEMA 2: Conflito de Identidade no Início do Prompt
O prompt começa com:
```
**TriagemTech** - Agente de triagem técnica. Tom objetivo, direto e impessoal.
```

E depois muda para:
```
# AGENTE JB ELÉTRICA – PROMPT OFICIAL (BLOCOS 0 ATÉ 27)
```

Isso pode confundir a IA sobre qual identidade usar.

#### ⚠️ PROBLEMA 3: Regras Contraditórias
- REGRA 0.5 diz "falar de forma humana"
- REGRA 0.1 diz "NÃO assume papel de atendente humano"
- TriagemTech pede "tom impessoal"
- JB Elétrica pede "atendimento"

#### ⚠️ PROBLEMA 4: Muitas Proibições (Overload)
O prompt tem mais de 50 regras de "NÃO FAZER":
- NÃO usar emojis
- NÃO usar nome do cliente
- NÃO inventar valores
- NÃO oferecer agenda
- NÃO repetir perguntas
- etc.

Quando há muitas proibições, a IA pode:
1. Ficar "paralisada" sem saber o que fazer
2. "Esquecer" algumas proibições por sobrecarga
3. Alucinar tentando encontrar algo permitido

---

## 🔧 SISTEMA ATUAL (Análise do Código)

### Arquitetura de Resposta (aiAgent.ts)
```
1. Verificar suspensão do usuário
2. Detectar se é bot
3. Tentar usar FlowEngine (se ativo)
4. Tentar processar delivery (se ativo)
5. Buscar config do agente
6. Verificar trigger phrases
7. Montar system prompt:
   - PRÉ-BLINDAGEM (análise automática do tipo de negócio)
   - PROMPT DO USUÁRIO (26K chars para JB Elétrica)
   - CONTEXTO DINÂMICO (nome do cliente, mídias)
   - BLINDAGEM UNIVERSAL (anti-alucinação)
   - SISTEMA ANTI-AMNÉSIA (análise do histórico)
   - MÍDIAS (se houver)
8. Chamar Mistral com temperature=0.0, seed=42
9. Processar resposta (tags, notificações, etc.)
```

### Sistema de Blindagem (promptBlindagem.ts)
O sistema detectou automaticamente:
- **Tipo:** elétrica ✅
- **Nome:** TriagemTech (incorreto - deveria ser JB Elétrica)
- **Palavras proibidas automáticas:** cardápio, delivery, pizza, comida

**PROBLEMA:** A blindagem usa "TriagemTech" ao invés de "JB Elétrica" porque está no início do prompt.

---

## 📈 MODELOS MISTRAL 2026 - RECOMENDAÇÕES

### Modelos Disponíveis

| Modelo | Contexto | Velocidade | Custo | Recomendação |
|--------|----------|------------|-------|--------------|
| **mistral-small-latest** | 32K | Rápido | Baixo | ⚠️ Atual - limite de contexto apertado |
| **mistral-medium-3.1** | 128K | Médio | Médio | ✅ RECOMENDADO para prompts grandes |
| **mistral-large-3** | 128K | Lento | Alto | 🔥 Melhor para seguir instruções complexas |
| **ministral-8b** | 128K | Muito rápido | Muito baixo | ✅ Boa opção custo-benefício |

### Recomendação para JB Elétrica
1. **IMEDIATO:** Mudar para `mistral-medium-3.1` (128K contexto)
2. **ALTERNATIVA:** Testar `ministral-8b` (mais barato, 128K contexto)
3. **PREMIUM:** `mistral-large-3` (melhor instruction-following)

---

## 🛠️ CORREÇÕES RECOMENDADAS

### Correção 1: Limpar Identidade Conflitante

**Antes:**
```
**TriagemTech** - Agente de triagem técnica. Tom objetivo, direto e impessoal.
...
# AGENTE JB ELÉTRICA
```

**Depois:**
```
# AGENTE JB ELÉTRICA – TRIAGEM TÉCNICA
Você é o agente de triagem da JB Elétrica, empresa de serviços elétricos em Uberlândia-MG.

IDENTIDADE:
- Nome: Atendente JB Elétrica
- Função: Triagem e coleta de informações
- Tom: Profissional, objetivo e direto

NÃO FAÇA:
- Não invente informações que não estão neste prompt
- Não fale sobre assuntos fora de serviços elétricos
```

### Correção 2: Compactar Blocos Similares

Os blocos 5.1, 5.2, 5.3, 5.4 são muito parecidos. Unificar:

**Antes:** 4 blocos de ~500 chars cada = 2000 chars
**Depois:** 1 bloco parametrizado = 600 chars

```
BLOCO 5 — TOMADAS E INTERRUPTORES

TROCA/INSTALAÇÃO:
1. Perguntar quantidade
2. Se qtd = 1 e SEM passagem de fio:
   - Perguntar modelo
   - Informar valor: R$ 55,00
   - Pedir bairro → Encaminhar
3. Se qtd ≥ 2 OU COM passagem de fio:
   - NÃO informar valor
   - Pedir bairro → Encaminhar

MODELOS:
- Tomada: simples (1), dupla (2), tripla (3) entradas
- Interruptor: 1, 2 ou 3 teclas
```

### Correção 3: Remover Regras Redundantes

Muitas regras dizem a mesma coisa de formas diferentes:
- REGRA 0.2, 0.3, 0.6, 0.11, 0.12 falam de "não reiniciar"
- REGRA 0.10, 0.11, 0.13 falam de "não inventar"

Consolidar em uma seção única.

### Correção 4: Adicionar Fallback Explícito

```
SE VOCÊ NÃO SOUBER O QUE FAZER:
- NÃO invente uma resposta
- Diga apenas: "Vou encaminhar para o setor responsável."
- Use BLOCO 4
```

---

## 📝 PROMPT OTIMIZADO (PROPOSTA)

### Tamanho Alvo: ~15.000 caracteres (58% menor)

Benefícios:
- Mais espaço para histórico de conversa
- Menos chance de "esquecer" regras
- Respostas mais consistentes

---

## 🧪 SCRIPT DE TESTE CRIADO

Arquivos criados:
1. `vvvv/teste-jb-eletrica-alucinacao.mjs` - Teste específico para JB Elétrica
2. `vvvv/teste-ia-universal.mjs` - Teste universal para qualquer agente

### Cenários de Teste
1. **Baseline:** Conversa normal sobre serviços elétricos
2. **Alucinação:** Induzir delivery/cardápio
3. **Amnésia:** Repetição de nome/informações
4. **Jailbreak:** Revelar prompt/instruções
5. **Escopo:** Perguntas fora do tema
6. **Consistência:** Mesma pergunta = mesma resposta
7. **IA vs IA:** Cliente difícil simulado

### Como Executar
```bash
# Definir variáveis de ambiente
export SUPABASE_SERVICE_ROLE_KEY=seu_key
export MISTRAL_API_KEY=seu_key

# Executar teste específico
cd vvvv
npx tsx teste-jb-eletrica-alucinacao.mjs

# Executar teste universal
npx tsx teste-ia-universal.mjs contato@jbeletrica.com.br

# Testar TODOS os agentes
npx tsx teste-ia-universal.mjs all
```

---

## ⚡ AÇÕES IMEDIATAS

### Prioridade 1: Mudar Modelo (5 min)
```sql
UPDATE ai_agent_config 
SET model = 'mistral-medium-3.1' 
WHERE user_id = 'd4a1d307-3d78-4bfe-8ab7-c4a0c3ccbb1c';
```

### Prioridade 2: Corrigir Identidade (10 min)
Remover "TriagemTech" do início do prompt e usar apenas "JB Elétrica".

### Prioridade 3: Otimizar Prompt (1 hora)
Aplicar as correções de compactação propostas.

### Prioridade 4: Executar Testes (30 min)
Rodar os scripts de teste antes e depois das correções.

---

## 📊 MÉTRICAS DE SUCESSO

| Métrica | Atual | Meta |
|---------|-------|------|
| Tamanho do prompt | 26K chars | 15K chars |
| Alucinações por 10 conversas | A medir | 0 |
| Amnésia por 10 conversas | A medir | 0 |
| Consistência (% similaridade) | A medir | >90% |

---

## 🔄 PRÓXIMOS PASSOS

1. [ ] Mudar modelo para mistral-medium-3.1
2. [ ] Executar testes ANTES das mudanças
3. [ ] Aplicar correção de identidade
4. [ ] Executar testes DEPOIS
5. [ ] Se melhorar, aplicar otimização completa do prompt
6. [ ] Monitorar em produção por 1 semana

---

*Relatório gerado automaticamente pela análise do sistema AgenteZap*
