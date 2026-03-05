# 📋 RELATÓRIO DE CALIBRAÇÃO - AGENTE NATHAN ANDRADE ASSESSORIA

**Data:** 15/01/2026  
**Projeto Supabase:** `bnfpcuzjvycudccycqqt`  
**User ID:** `b393f003-492c-438a-b215-f04fb68da24d`  

---

## ✅ STATUS: CALIBRAÇÃO COMPLETA - 100% SUCESSO

---

## 📊 RESUMO DOS TESTES

| Cenário | Status | Keywords Verificadas |
|---------|--------|---------------------|
| Primeiro Contato → Limpa Nome (Texto) | ✅ PASSOU | 9/9 |
| Primeiro Contato → Limpa Nome (Áudio) | ✅ PASSOU | 2/2 |
| Primeiro Contato → Bacen | ✅ PASSOU | 6/6 |
| Primeiro Contato → Rating Comercial | ✅ PASSOU | 6/6 |
| Primeiro Contato → Soluções Tributárias | ✅ PASSOU | 5/5 |
| Já Sou Cliente → Novo Serviço | ✅ PASSOU | 3/3 |
| Já Sou Cliente → Consultar Processo | ✅ PASSOU | 4/4 |
| Sou Parceiro → Quer enviar Rating | ✅ PASSOU | 8/8 |
| Sou Parceiro → Não quer enviar | ✅ PASSOU | 2/2 |
| Restrições - Não inventar valores | ✅ PASSOU | 2/2 |

**Taxa de Sucesso: 100%** (10/10 cenários)

---

## 🔧 CONFIGURAÇÕES APLICADAS

### Tabela: `ai_agent_config`

```sql
user_id: b393f003-492c-438a-b215-f04fb68da24d
is_active: true
model: mistral-small-latest
```

### Prompt Calibrado

O prompt foi estruturado em seções claras:

1. **🤖 IDENTIDADE DO AGENTE**
   - Nathan Andrade - Assessoria Empresarial
   - Pré-atendimento comercial automatizado

2. **📋 REGRAS FUNDAMENTAIS**
   - Seguir fluxo estruturado
   - Não inventar informações
   - Emojis com moderação
   - Cumprimentar pelo nome
   - Encaminhar dúvidas desconhecidas

3. **⏰ HORÁRIO DE ATENDIMENTO**
   - 08:30 às 18h

4. **🚀 FLUXOS IMPLEMENTADOS**
   - Primeiro Contato (Limpa Nome, Bacen, Rating, Tributário)
   - Já Sou Cliente (Novo serviço, Consultar processo)
   - Sou Parceiro (Rating Comercial)

5. **❌ RESTRIÇÕES**
   - Lista de comportamentos proibidos

6. **📌 VALORES DE REFERÊNCIA**
   - Honorários: R$ 890,00+
   - Consulta CPF/CNPJ: R$ 30,00
   - Rating Parceiro: R$ 1.300,00
   - PIX: 41.848.452/0001-05

---

## 🎵 MÍDIAS CONFIGURADAS

| Nome | Tipo | Quando Usar |
|------|------|-------------|
| EXPLICA_O_LIMPA_NOME | audio | Quando cliente pedir explicação por áudio sobre Limpa Nome |

---

## 📁 ARQUIVOS CRIADOS

1. **test-nathan-agent-calibration.ts**
   - Testes automatizados completos
   - 10 cenários de conversação
   - Verificação de keywords

2. **test-nathan-interactive.ts**
   - Simulador interativo
   - Permite testar conversas em tempo real
   - Comandos: /sair, /limpar, /fluxos

---

## 🚀 COMO EXECUTAR OS TESTES

### Testes Automatizados
```bash
cd "C:\Users\Windows\Downloads\agentezap correto\vvvv"
$env:MISTRAL_API_KEY = "SUA_CHAVE_AQUI"
npx tsx test-nathan-agent-calibration.ts
```

### Simulador Interativo
```bash
cd "C:\Users\Windows\Downloads\agentezap correto\vvvv"
$env:MISTRAL_API_KEY = "SUA_CHAVE_AQUI"
npx tsx test-nathan-interactive.ts
```

---

## 📌 FLUXOGRAMA IMPLEMENTADO

```
┌─────────────────────────────────────────────────────────────┐
│                    MENSAGEM INICIAL                         │
│  "Olá, tudo bem? Nathan Andrade - Assessoria Empresarial"  │
│  "É seu primeiro contato, já é cliente ou é parceiro?"     │
└──────────────────────────┬──────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ PRIMEIRO │    │    JÁ    │    │   SOU    │
    │ CONTATO  │    │ CLIENTE  │    │ PARCEIRO │
    └────┬─────┘    └────┬─────┘    └────┬─────┘
         │               │               │
         ▼               ▼               ▼
    ┌────────────┐  ┌──────────┐   ┌──────────┐
    │ Serviços:  │  │• Novo    │   │• Rating  │
    │• Limpa Nome│  │  serviço │   │  R$1.300 │
    │• Bacen     │  │• Consulta│   │• Checklist│
    │• Rating    │  │  processo│   │• PIX     │
    │• Tributário│  └────┬─────┘   └────┬─────┘
    └────┬───────┘       │              │
         │               │              │
         ▼               ▼              ▼
    ┌────────────────────────────────────────┐
    │        ENCAMINHA PARA ATENDENTE        │
    │  "Em breve um atendente irá falar..."  │
    └────────────────────────────────────────┘
```

---

## 📋 VALORES FIXOS (NÃO ALTERAR NO PROMPT)

| Item | Valor |
|------|-------|
| Honorários mínimos | R$ 890,00 |
| Consulta CPF/CNPJ | R$ 30,00 |
| Rating Comercial (Parceiro) | R$ 1.300,00 |
| Prazo Limpa Nome | 20-30 dias úteis |
| Dívidas recomendadas (geral) | > R$ 20.000 |
| Dívidas recomendadas (Bacen) | > R$ 30.000 |
| Chave PIX CNPJ | 41.848.452/0001-05 |
| Horário de atendimento | 08:30 - 18:00 |

---

## ✅ CHECKLIST DE VALIDAÇÃO

- [x] Saudação padrão funcionando
- [x] Pergunta de identificação após saudação
- [x] Fluxo "Primeiro contato" implementado
- [x] Fluxo "Limpa Nome" com texto e áudio
- [x] Fluxo "Bacen" implementado
- [x] Fluxo "Rating Comercial" implementado
- [x] Fluxo "Soluções Tributárias" implementado
- [x] Fluxo "Já sou cliente" implementado
- [x] Fluxo "Sou parceiro" implementado
- [x] Valores corretos nos fluxos
- [x] Não inventa informações
- [x] Encaminhamento para atendente humano
- [x] Mídia de áudio configurada
- [x] Histórico de versões criado
- [x] Testes automatizados passando

---

## 📞 CONTATO

**Nathan de Oliveira Andrade**  
Email: nathanandradre@gmail.com  
Telefone: +55 64 99216-0057

---

*Calibração realizada com sucesso em 15/01/2026*
