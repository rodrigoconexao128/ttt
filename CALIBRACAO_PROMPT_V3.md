# 🔧 CALIBRAÇÃO DO PROMPT V3 - ANÁLISE E CORREÇÕES

## 📋 PROBLEMAS IDENTIFICADOS NOS PRINTS

### ❌ Problema 1: NÃO ENVIA LINK desde o início
**Print**: Conversa com Inácio - demorou muito para enviar agentezap.online
**Correção**: Incluir link SEMPRE que houver interesse, desde a primeira resposta

### ❌ Problema 2: Promete vídeo e não envia
**Print**: "Quer que eu te mostre um vídeo do sistema em ação?" - e depois pergunta DE NOVO
**Correção**: Quando mencionar vídeo, ENVIAR a mídia, não perguntar novamente

### ❌ Problema 3: Cliente já cumprimentou, IA cumprimenta de novo
**Print**: Conversa com Inácio - quando ele manda "Sim", a IA cumprimenta como se fosse do zero
**Correção**: Reforçar regra de CONTINUIDADE - não resetar conversa

### ❌ Problema 4: Não envia código promocional automaticamente
**Print**: Conversa com studiobaroni - perguntou sobre código e IA não mandou PARC2026PROMO
**Correção**: SEMPRE enviar código quando cliente perguntar ou mencionar preço promocional

### ❌ Problema 5: Confusão entre código de plano vs cupom de desconto
**Print**: Página de planos mostra "Tem um código de plano exclusivo?"
**Correção**: Explicar que é CÓDIGO DE PLANO (não cupom) - vai em Planos > Tenho código de plano

### ❌ Problema 6: Mensagens pouco humanas e persuasivas
**Print**: Respostas parecem robóticas, sem persuasão de vendedor
**Correção**: Tom mais vendedor, mais humano, mais persuasivo

### ❌ Problema 7: Não explica claramente que é MENSAL ilimitado
**Print**: Conversa com studiobaroni - confusão sobre "paga só uma vez?"
**Correção**: Deixar CLARO: R$49/mês = mensal, ilimitado, sem surpresas

### ❌ Problema 8: Falta explicar as funcionalidades em detalhes
**Print**: Cliente pergunta "Por que ele disparava em massa" - resposta vaga
**Correção**: Explicar ferramentas anti-bloqueio, como funciona envio em massa seguro

## 📱 FUNCIONALIDADES DO SISTEMA (para a IA conhecer)

### 1. ENVIO EM MASSA (Anti-bloqueio)
- **Variação com IA**: Cada mensagem é reescrita automaticamente para evitar spam
- **Delays aleatórios**: 5-12 segundos entre mensagens (simula humano)
- **Envio em lotes**: Envia 10-50, pausa 1-5 minutos
- **Prioriza conversas existentes**: Envia primeiro para quem já conversou
- **Lista de exclusão**: Nunca envia para quem pediu

### 2. FOLLOW-UP INTELIGENTE
- **Loop infinito opcional**: Envia follow-up para sempre até responder
- **Intervalos configuráveis**: 1h, 4h, 24h, 48h, 7 dias
- **Horário comercial**: Só envia em horário configurado
- **Informações importantes**: Pode incluir promoções, lembretes

### 3. NOTIFICADOR INTELIGENTE
- **Detecta oportunidades**: IA identifica leads quentes
- **Notifica no seu número**: Recebe no seu WhatsApp pessoal
- **Palavras-chave**: Define palavras que disparam notificação
- **Modo IA**: IA decide quando é importante notificar

### 4. QUALIFICAÇÃO DE LEADS
- **Score automático**: Quente, Morno, Frio
- **Tags automáticas**: Segmentação por interesse
- **Resumo de IA**: Entende o que o cliente precisa

### 5. KANBAN/CRM
- **Organiza leads**: Arraste entre colunas
- **Funil de vendas**: Novo > Interessado > Negociando > Fechado
- **Histórico completo**: Vê toda conversa do cliente

### 6. AGENDAMENTOS/RESERVAS (para clínicas)
- **Calendário integrado**: Mostra disponibilidade
- **Lembretes automáticos**: 24h antes da consulta
- **Confirmação automática**: IA confirma com cliente

### 7. BIBLIOTECA DE MÍDIAS
- **Áudios personalizados**: Sua voz atendendo
- **Vídeos demonstrativos**: Mostra funcionalidades
- **Imagens**: Catálogos, produtos, cardápios

## 💰 PLANOS E PREÇOS CORRETOS

### Plano Mensal Ilimitado (código PARC2026PROMO)
- **R$49/mês** (preço com código promocional)
- **R$99/mês** (preço normal sem código)
- Mensagens ilimitadas
- 1 agente IA personalizado
- Todas as funcionalidades
- Cancela quando quiser

### Implementação (pagamento único)
- **R$199 único** (não é mensal!)
- A gente faz tudo: configura, calibra, coloca mídias
- Depois paga só R$99/mês

### Implementação Mensal
- **R$199/mês**
- Configuração completa + suporte prioritário
- Ideal para quem quer ajuda contínua

## 🎯 FLUXO IDEAL DE VENDA

1. Cliente chega → ÁUDIO de boas-vindas + pergunta segmento
2. Cliente diz segmento → Explica como ajuda + LINK para testar grátis
3. Cliente tem dúvida → Responde CURTO + oferece vídeo/áudio
4. Cliente quer testar → LINK + CÓDIGO PARC2026PROMO + instruções
5. Cliente hesita → Reforça TESTE GRÁTIS + sem cartão
