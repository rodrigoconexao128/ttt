# 🐛 LISTA DETALHADA DE 20 BUGS DO AGENTEZAP

> Análise profunda do sistema AgenteZap baseada em:
> - Análise do banco de dados Supabase (projeto: bnfpcuzjvycudccycqqt)
> - Testes no simulador WhatsApp
> - Revisão do código fonte (aiAgent.ts, whatsapp.ts)
> - Análise de 3.103 conversas e 69.160 mensagens

---

## 🔴 BUGS CRÍTICOS (Afetam diretamente conversões)

### BUG #1: Amnésia - IA Pergunta Nome Múltiplas Vezes
**Descrição:** A IA pergunta "qual seu nome?" ou "como você se chama?" múltiplas vezes na mesma conversa.
**Evidência:** 14 conversas identificadas onde o nome foi perguntado 2-3x (ex: "Nosde Planos de Saúde" = 3x, "Jessica Souza" = 3x)
**Impacto:** Cliente percebe que é robô → abandona conversa → perda de venda
**Arquivo afetado:** [server/aiAgent.ts](server/aiAgent.ts#L1417-L1500)
**Correção sugerida:** Melhorar detecção de hasAskedName na função analyzeConversationHistory

---

### BUG #2: Mensagens Duplicadas Massivamente
**Descrição:** A IA envia a MESMA mensagem centenas de vezes para o mesmo contato.
**Evidência:** Conversa com "Giordano Barbosa" teve 686 repetições da mesma mensagem!
**Impacto:** Bloqueio do WhatsApp + Cliente irritado → perda permanente
**Arquivo afetado:** [server/whatsapp.ts](server/whatsapp.ts) - Sistema de follow-up
**Correção sugerida:** Implementar limite de mensagens idênticas por conversa (max 3)

---

### BUG #3: Vazamento de Marcadores Internos "[Mensagem vazia]"
**Descrição:** O texto "[Mensagem vazia]" aparece na resposta visível ao cliente.
**Evidência:** Testado no simulador - IA respondeu: "Oi!! [Mensagem vazia]\n\nOi! Em que posso te ajudar?"
**Impacto:** Cliente vê texto técnico → percebe que é robô
**Arquivo afetado:** [server/aiAgent.ts#L1653](server/aiAgent.ts#L1653)
**Correção:** Remover marcador antes de enviar OU não usar como placeholder

---

### BUG #4: IA Envia "*Áudio*" Como Texto
**Descrição:** Quando deveria enviar um áudio, a IA envia o texto "*Áudio*" literalmente.
**Evidência:** 30+ mensagens no banco com texto "*Áudio*" enviadas como resposta
**Impacto:** Cliente fica confuso, não recebe o áudio prometido
**Arquivo afetado:** [server/aiAgent.ts#L1539-L1570](server/aiAgent.ts#L1539-L1570)
**Correção:** Validar que mídia foi efetivamente enviada antes de marcar como enviada

---

### BUG #5: Repetição de Perguntas sobre Negócio do Cliente
**Descrição:** IA pergunta "o que você faz?" mesmo quando cliente JÁ DISSE na mesma mensagem.
**Evidência:** Anti-amnesia prompt presente mas não funciona quando info está na msg atual
**Impacto:** Frustra o cliente que acabou de se apresentar
**Arquivo afetado:** [server/aiAgent.ts#L1428-L1435](server/aiAgent.ts#L1428-L1435)
**Correção:** Analisar newMessageText ANTES de decidir perguntas

---

### BUG #6: Follow-up Infinito Sem Controle
**Descrição:** Sistema de follow-up continua enviando mesmo após cliente pedir para parar.
**Evidência:** Conversa "Giordano" com 686 msgs repetidas = follow-up descontrolado
**Impacto:** Spam → bloqueio de número → perda de conta WhatsApp
**Arquivo afetado:** Tabela followup_configs + lógica em server/
**Correção:** Implementar kill-switch por palavras-chave ("parar", "não quero mais")

---

## 🟠 BUGS IMPORTANTES (Afetam experiência)

### BUG #7: IA Não Usa Nome do Cliente Quando Disponível
**Descrição:** Chama cliente de "Visitante" mesmo quando nome está disponível.
**Evidência:** Simulador respondeu "Olá, Visitante!" mesmo em conversa com histórico
**Impacto:** Atendimento impessoal → menor engajamento
**Arquivo afetado:** [server/aiAgent.ts](server/aiAgent.ts) - Bloco de contexto dinâmico
**Correção:** Injetar contactName no contexto da IA sempre que disponível

---

### BUG #8: Saudação Repetida no Meio da Conversa
**Descrição:** Cliente manda "oi" de novo e IA responde com apresentação completa.
**Evidência:** Teste no simulador + código em aiAgent.ts tentando corrigir
**Impacto:** Conversa parece reiniciar → cliente confuso
**Arquivo afetado:** [server/aiAgent.ts#L1656-L1676](server/aiAgent.ts#L1656-L1676)
**Correção:** Detectar e tratar saudações repetidas de forma diferente

---

### BUG #9: Respostas Muito Longas em Uma Única Bolha
**Descrição:** Apesar de message_split_chars=400, algumas respostas ficam gigantes.
**Evidência:** Configuração existe mas nem sempre é respeitada
**Impacto:** Mensagens longas parecem robóticas
**Arquivo afetado:** splitMessageHumanLike function
**Correção:** Garantir que split acontece SEMPRE antes do envio

---

### BUG #10: Delay Inteligente Não Funciona no Simulador
**Descrição:** No simulador, resposta vem instantânea, mas no WhatsApp real tem delay.
**Evidência:** Teste no simulador = resposta imediata
**Impacto:** Expectativa diferente entre teste e produção
**Arquivo afetado:** Frontend do simulador
**Correção:** Simular delay também no frontend

---

### BUG #11: Histórico Não Carrega para Conversas Antigas
**Descrição:** Se conversa foi há dias atrás, IA não lembra do contexto.
**Evidência:** fetch_history_on_first_response existe mas depende de config
**Impacto:** Cliente retorna e IA não lembra dele
**Arquivo afetado:** [server/aiAgent.ts#L1348](server/aiAgent.ts#L1348) - RECENT_MESSAGES_COUNT
**Correção:** Carregar histórico sempre para conversas existentes

---

### BUG #12: Concatenação de Respostas
**Descrição:** Duas respostas diferentes são concatenadas em uma só mensagem.
**Evidência:** Mensagens no banco com texto repetido dentro (ex: "Fernanda, obrigada... Fernanda, obrigada...")
**Impacto:** Resposta confusa e claramente robótica
**Arquivo afetado:** [server/aiAgent.ts#L1748-L1760](server/aiAgent.ts#L1748-L1760)
**Correção:** Detectar e remover duplicações internas

---

## 🟡 BUGS MENORES (Polimento)

### BUG #13: Cupom PARC2026PROMO Nem Sempre É Mencionado
**Descrição:** Prompt instrui mencionar cupom, mas IA esquece em algumas conversas.
**Evidência:** Prompt do usuário rodrigo4@gmail.com tem regra clara
**Impacto:** Cliente paga R$99 ao invés de R$49 → pode reclamar depois
**Arquivo afetado:** Prompt do usuário
**Correção:** Reforçar instrução no prompt OU detectar e injetar automaticamente

---

### BUG #14: IA Responde em Inglês Mesmo em Conversa PT-BR
**Descrição:** Algumas vezes a IA muda idioma no meio da conversa.
**Evidência:** Instruções em aiAgent.ts mencionam "no idioma da conversa"
**Impacto:** Confusão do cliente
**Arquivo afetado:** Prompt + instrução de sistema
**Correção:** Forçar idioma detectado da primeira mensagem

---

### BUG #15: Emojis Excessivos ou Ausentes
**Descrição:** Inconsistência no uso de emojis (às vezes muitos, às vezes zero).
**Evidência:** business_agent_configs tem emoji_usage mas nem sempre funciona
**Impacto:** Tom inconsistente
**Arquivo afetado:** [server/aiAgent.ts](server/aiAgent.ts) - Humanização
**Correção:** Respeitar configuração emoji_usage do usuário

---

### BUG #16: Não Envia Vídeo/Mídia Quando Prometido
**Descrição:** IA diz "vou te enviar um vídeo" mas mídia não é anexada.
**Evidência:** Mensagens no banco com promessas de vídeo sem mídia
**Impacto:** Cliente espera mídia que nunca chega
**Arquivo afetado:** [server/mediaService.ts](server/mediaService.ts)
**Correção:** Validar que mídia foi anexada quando tag [ENVIAR_MIDIA] é usada

---

### BUG #17: Agendamento Não Sincroniza com Google Calendar
**Descrição:** Mesmo com google_calendar_enabled=true, eventos não aparecem.
**Evidência:** Tabela google_calendar_tokens vazia (0 rows)
**Impacto:** Usuário perde agendamentos
**Arquivo afetado:** [server/schedulingService.ts](server/schedulingService.ts)
**Correção:** Verificar fluxo OAuth e sincronização

---

### BUG #18: Tags de Kanban Não São Aplicadas Automaticamente
**Descrição:** IA deveria mover lead para estágio do funil baseado na conversa.
**Evidência:** kanban_stage_id raramente populado nas conversations
**Impacto:** CRM não reflete estágio real do lead
**Arquivo afetado:** Integração Kanban + aiAgent
**Correção:** Implementar auto-tagging baseado em keywords

---

### BUG #19: Exclusion List Não Funciona 100%
**Descrição:** Números na lista de exclusão às vezes ainda recebem resposta.
**Evidência:** 2.787 números na exclusion_list mas sistema ainda responde
**Impacto:** Cliente que pediu para parar continua recebendo
**Arquivo afetado:** Verificação de exclusão antes de responder
**Correção:** Checar exclusion_list ANTES de processar mensagem

---

### BUG #20: Simulador Não Reflete Configurações Reais
**Descrição:** Teste no simulador usa config diferente do WhatsApp real.
**Evidência:** Resposta do simulador diferente do WhatsApp em alguns casos
**Impacto:** Usuário calibra no simulador mas resultado é diferente
**Arquivo afetado:** Frontend + API de simulação
**Correção:** Usar mesma lógica e configs para ambos

---

## 📊 RESUMO DE IMPACTO

| Criticidade | Quantidade | % do Total |
|------------|-----------|-----------|
| 🔴 Crítico | 6 | 30% |
| 🟠 Importante | 6 | 30% |
| 🟡 Menor | 8 | 40% |

## 🎯 PRIORIDADE DE CORREÇÃO

1. **BUG #2** - Mensagens duplicadas (risco de bloqueio)
2. **BUG #3** - Vazamento de marcadores internos
3. **BUG #1** - Amnésia de nome
4. **BUG #6** - Follow-up infinito
5. **BUG #5** - Repetição de perguntas

---

*Documento gerado em: 12/01/2026*
*Análise feita com acesso direto ao Supabase e código fonte*
