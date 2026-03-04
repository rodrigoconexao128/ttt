# 🚀 TASKLIST - IMPLEMENTAÇÃO AGENTE IA PERFEITO

## 📋 Status Geral
**Início:** 22/11/2025  
**Objetivo:** Implementar framework completo de agente adaptável e humanizado  
**Status Atual:** 🟡 EM PROGRESSO

---

## ✅ FASE 1: ESTRUTURA DE DADOS E DATABASE (PRIORIDADE ALTA)

### Task 1.1: Criar tabela business_agent_configs
- [ ] Criar migration para nova tabela
- [ ] Adicionar campos de identidade (agentName, role, companyName, personality)
- [ ] Adicionar campos de conhecimento (productsServices, businessInfo, faqItems, policies)
- [ ] Adicionar campos de boundaries (allowedTopics, prohibitedTopics, etc)
- [ ] Adicionar campos de personalidade (toneOfVoice, emojiUsage, formalityLevel)
- [ ] Adicionar campos de comportamento (maxResponseLength, useCustomerName, etc)
- [ ] Relacionamento com users (userId) e status (isActive)

### Task 1.2: Atualizar Schema TypeScript
- [ ] Criar interface BusinessAgentConfig em shared/schema.ts
- [ ] Adicionar tipos para cada subcamada (identity, knowledge, boundaries, etc)
- [ ] Criar tipos para FAQ items, business info, etc
- [ ] Exportar schemas Zod para validação

### Task 1.3: Criar Storage Methods
- [ ] getBusinessAgentConfig(userId): buscar config do usuário
- [ ] upsertBusinessAgentConfig(userId, config): criar/atualizar config
- [ ] getBusinessAgentTemplates(): buscar templates pré-definidos
- [ ] validateBusinessAgentConfig(config): validar estrutura

**Estimativa:** 3-4 horas  
**Arquivos:** `shared/schema.ts`, `server/storage.ts`, `migrations/XXXX_business_agent_configs.sql`

---

## ✅ FASE 2: GERAÇÃO DINÂMICA DE PROMPTS (PRIORIDADE ALTA)

### Task 2.1: Criar módulo de templates
- [ ] Criar `server/promptTemplates.ts`
- [ ] Implementar `ADVANCED_SYSTEM_PROMPT_TEMPLATE` (template base)
- [ ] Adicionar funções helper: formatProductList(), formatBusinessInfo(), formatFAQ()
- [ ] Implementar função generateSystemPrompt(config, context)
- [ ] Adicionar testes para substituições de variáveis

### Task 2.2: Criar templates pré-configurados
- [ ] Template E-commerce (ecommerceTemplate)
- [ ] Template Consultoria/Serviços Profissionais (professionalServicesTemplate)
- [ ] Template Saúde/Fitness (healthFitnessTemplate)
- [ ] Template Educação (educationTemplate)
- [ ] Template Imobiliária (realEstateTemplate)
- [ ] Função getTemplateByType(type)

### Task 2.3: Integrar com aiAgent.ts
- [ ] Refatorar generateAIResponse() para usar novo sistema
- [ ] Buscar BusinessAgentConfig ao invés de apenas agentConfig
- [ ] Chamar generateSystemPrompt() com config completa
- [ ] Manter backward compatibility com configs antigas

**Estimativa:** 4-5 horas  
**Arquivos:** `server/promptTemplates.ts`, `server/aiAgent.ts`

---

## ✅ FASE 3: SISTEMA DE GUARDRAILS E VALIDAÇÃO (PRIORIDADE ALTA)

### Task 3.1: Detector de Off-Topic
- [ ] Criar `server/agentValidation.ts`
- [ ] Implementar detectOffTopic(message, allowedTopics, prohibitedTopics)
- [ ] Usar Mistral com prompt de classificação
- [ ] Cache de detecções recentes (evitar chamadas repetidas)
- [ ] Retornar confidence score

### Task 3.2: Sistema de Fallback
- [ ] Implementar generateOffTopicResponse(config)
- [ ] Template de redirecionamento educado
- [ ] Sugestões de tópicos alternativos
- [ ] Log de tentativas off-topic

### Task 3.3: Validação de Identidade
- [ ] Detectar tentativas de jailbreak
- [ ] Validar que resposta mantém nome correto
- [ ] Detectar se resposta saiu do papel
- [ ] Sistema de alertas para admin

**Estimativa:** 3-4 horas  
**Arquivos:** `server/agentValidation.ts`

---

## ✅ FASE 4: HUMANIZAÇÃO AVANÇADA (PRIORIDADE MÉDIA)

### Task 4.1: Análise de Sentimento
- [ ] Criar `server/sentimentAnalysis.ts`
- [ ] Detectar emoção do cliente (frustrado, animado, neutro, confuso)
- [ ] Integrar com Mistral ou biblioteca externa
- [ ] Ajustar tom de resposta baseado na emoção

### Task 4.2: Variação de Respostas
- [ ] Banco de saudações variadas
- [ ] Banco de despedidas variadas
- [ ] Conectores variados ("Entendi", "Perfeito", "Claro")
- [ ] Função getRandomVariation(type)

### Task 4.3: Memória Conversacional Melhorada
- [ ] Salvar contexto emocional na conversa
- [ ] Referenciar mensagens anteriores
- [ ] Detectar tópicos já discutidos
- [ ] Personalização crescente ao longo da conversa

**Estimativa:** 4-5 horas  
**Arquivos:** `server/sentimentAnalysis.ts`, `server/conversationMemory.ts`

---

## ✅ FASE 5: INTERFACE DE ADMINISTRAÇÃO (PRIORIDADE MÉDIA)

### Task 5.1: Página de Configuração do Agente
- [ ] Criar `client/src/pages/agent-config.tsx`
- [ ] Form para identidade (nome, função, empresa, personalidade)
- [ ] Form para conhecimento (produtos, FAQ, políticas)
- [ ] Form para boundaries (permitido/proibido)
- [ ] Form para personalidade (tom, formalidade, emojis)
- [ ] Preview do prompt gerado em tempo real

### Task 5.2: Seletor de Templates
- [ ] Dropdown para escolher template base
- [ ] Cards visuais mostrando cada template
- [ ] Botão "Aplicar Template"
- [ ] Possibilidade de customizar após aplicar

### Task 5.3: Editor de FAQ
- [ ] CRUD de perguntas frequentes
- [ ] Drag & drop para ordenar
- [ ] Importar FAQ de CSV/JSON
- [ ] Testar FAQ (preview de como o agente responde)

### Task 5.4: API Routes
- [ ] POST /api/agent/business-config - salvar config
- [ ] GET /api/agent/business-config - buscar config
- [ ] GET /api/agent/templates - listar templates
- [ ] POST /api/agent/test-config - testar config antes de salvar
- [ ] GET /api/agent/preview-prompt - ver prompt gerado

**Estimativa:** 6-8 horas  
**Arquivos:** `client/src/pages/agent-config.tsx`, `server/routes.ts`

---

## ✅ FASE 6: SISTEMA DE MÉTRICAS E ANALYTICS (PRIORIDADE BAIXA)

### Task 6.1: Logging Estruturado
- [ ] Criar tabela conversation_logs
- [ ] Salvar: userMessage, agentResponse, timestamp, tokensUsed
- [ ] Salvar: wasInScope, offTopicDetected, identityMaintained
- [ ] Salvar: responseTime, escalatedToHuman

### Task 6.2: Dashboard de Métricas
- [ ] Taxa de respostas in-scope vs off-topic
- [ ] Tempo médio de resposta
- [ ] Tokens usados por conversa
- [ ] Tópicos mais perguntados (word cloud)
- [ ] Horários de pico
- [ ] Taxa de satisfação (quando disponível)

### Task 6.3: Alertas Automáticos
- [ ] Alerta quando taxa off-topic > 20%
- [ ] Alerta quando tempo resposta > 5s
- [ ] Alerta quando muitos jailbreak attempts
- [ ] Email/notificação para admin

**Estimativa:** 5-6 horas  
**Arquivos:** `server/analytics.ts`, `client/src/pages/agent-analytics.tsx`

---

## ✅ FASE 7: OTIMIZAÇÕES E PERFORMANCE (PRIORIDADE BAIXA)

### Task 7.1: Cache Inteligente
- [ ] Cache de respostas para perguntas exatas repetidas
- [ ] Cache de detecções off-topic
- [ ] Cache de sentiment analysis
- [ ] TTL configurável por tipo de cache

### Task 7.2: Redução de Custos
- [ ] Usar modelo menor (mistral-small) para validações
- [ ] Usar modelo maior (mistral-medium/large) só para respostas finais
- [ ] Comprimir histórico de conversa (resumos)
- [ ] Configurar maxTokens dinamicamente

### Task 7.3: Rate Limiting
- [ ] Limitar requests por usuário
- [ ] Limitar tokens por dia/mês
- [ ] Sistema de quotas por plano
- [ ] Mensagem amigável quando atingir limite

**Estimativa:** 3-4 horas  
**Arquivos:** `server/cache.ts`, `server/rateLimiting.ts`

---

## ✅ FASE 8: TESTES E VALIDAÇÃO (PRIORIDADE ALTA)

### Task 8.1: Testes Unitários
- [ ] Testar generateSystemPrompt() com diferentes configs
- [ ] Testar detectOffTopic() com casos edge
- [ ] Testar formatadores (formatFAQ, formatProductList)
- [ ] Testar validações de schema

### Task 8.2: Testes de Integração
- [ ] Fluxo completo: user message → agent response
- [ ] Testar cada template pré-definido
- [ ] Testar off-topic handling
- [ ] Testar jailbreak attempts

### Task 8.3: Testes Manuais
- [ ] Criar 20 cenários de teste por tipo de negócio
- [ ] Validar humanização (respostas soam naturais?)
- [ ] Validar manutenção de identidade
- [ ] Validar nunca sai do contexto

**Estimativa:** 4-5 horas  
**Arquivos:** `server/__tests__/aiAgent.test.ts`, `server/__tests__/promptTemplates.test.ts`

---

## ✅ FASE 9: DOCUMENTAÇÃO (PRIORIDADE MÉDIA)

### Task 9.1: Documentação Técnica
- [ ] README atualizado com novo sistema
- [ ] Guia de configuração do agente
- [ ] Exemplos de configs por tipo de negócio
- [ ] API documentation (endpoints)

### Task 9.2: Guia do Usuário
- [ ] Como configurar seu primeiro agente
- [ ] Melhores práticas de prompts
- [ ] Troubleshooting comum
- [ ] FAQ sobre o sistema de agente

### Task 9.3: Vídeo Tutorial (Opcional)
- [ ] Screen recording configurando agente
- [ ] Demonstração de cada template
- [ ] Casos de uso reais

**Estimativa:** 3-4 horas  
**Arquivos:** `AGENT_CONFIGURATION_GUIDE.md`, `API_DOCUMENTATION.md`

---

## ✅ FASE 10: MIGRATION E ROLLOUT (PRIORIDADE ALTA)

### Task 10.1: Migração de Dados Existentes
- [ ] Script para migrar ai_agent_config → business_agent_configs
- [ ] Manter backward compatibility
- [ ] Feature flag para ativar novo sistema gradualmente
- [ ] Rollback plan se necessário

### Task 10.2: Deploy Gradual
- [ ] Testar em ambiente de dev
- [ ] Deploy em staging
- [ ] Beta com 5-10 usuários selecionados
- [ ] Coletar feedback
- [ ] Deploy em produção (100%)

### Task 10.3: Monitoramento Pós-Deploy
- [ ] Monitorar logs por 48h
- [ ] Validar métricas de performance
- [ ] Verificar taxa de erros
- [ ] Ajustes finos baseados em uso real

**Estimativa:** 2-3 horas  
**Arquivos:** `migrations/migrate_agent_configs.ts`

---

## 📊 RESUMO DE ESTIMATIVAS

| Fase | Estimativa | Prioridade | Status |
|------|-----------|-----------|--------|
| 1. Estrutura de Dados | 3-4h | 🔴 Alta | ⏳ Pendente |
| 2. Geração de Prompts | 4-5h | 🔴 Alta | ⏳ Pendente |
| 3. Guardrails | 3-4h | 🔴 Alta | ⏳ Pendente |
| 4. Humanização | 4-5h | 🟡 Média | ⏳ Pendente |
| 5. Interface Admin | 6-8h | 🟡 Média | ⏳ Pendente |
| 6. Métricas | 5-6h | 🟢 Baixa | ⏳ Pendente |
| 7. Otimizações | 3-4h | 🟢 Baixa | ⏳ Pendente |
| 8. Testes | 4-5h | 🔴 Alta | ⏳ Pendente |
| 9. Documentação | 3-4h | 🟡 Média | ⏳ Pendente |
| 10. Migration | 2-3h | 🔴 Alta | ⏳ Pendente |

**TOTAL ESTIMADO:** 37-48 horas de desenvolvimento

---

## 🎯 ORDEM DE IMPLEMENTAÇÃO RECOMENDADA

**Semana 1 (Fases Críticas):**
1. ✅ Fase 1: Estrutura de Dados (3-4h)
2. ✅ Fase 2: Geração de Prompts (4-5h)
3. ✅ Fase 3: Guardrails (3-4h)
4. ✅ Fase 8: Testes Básicos (2h)

**Semana 2 (Features Importantes):**
5. ✅ Fase 4: Humanização (4-5h)
6. ✅ Fase 5: Interface Admin (6-8h)
7. ✅ Fase 8: Testes Completos (2-3h)

**Semana 3 (Polimento):**
8. ✅ Fase 6: Métricas (5-6h)
9. ✅ Fase 7: Otimizações (3-4h)
10. ✅ Fase 9: Documentação (3-4h)
11. ✅ Fase 10: Deploy (2-3h)

---

## 🚨 RISCOS E MITIGAÇÕES

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Breaking changes em configs antigas | Média | Alto | Manter backward compatibility + migration script |
| Custos Mistral API aumentarem | Média | Médio | Implementar cache agressivo + rate limiting |
| Performance degradar com prompts grandes | Baixa | Alto | Otimizar prompts + usar modelos menores para validações |
| Usuários não entenderem nova interface | Média | Médio | Tutoriais + templates prontos + documentação clara |

---

## 📝 NOTAS DE IMPLEMENTAÇÃO

### Decisões Técnicas
- **Database:** Usar JSON/JSONB para armazenar configs complexos (flexibility)
- **Validation:** Zod para validação client e server-side
- **Cache:** Redis se disponível, senão in-memory com TTL
- **Monitoring:** Usar logs estruturados (winston ou pino)

### Padrões de Código
- TypeScript strict mode
- ESLint + Prettier
- Comentários JSDoc para funções públicas
- Testes com Jest + Testing Library

### Segurança
- Nunca expor Mistral API key no frontend
- Validar TODOS os inputs do usuário
- Rate limiting por IP e por usuário
- Logs de tentativas de jailbreak

---

## ✅ CRITÉRIOS DE ACEITAÇÃO

O sistema está pronto para produção quando:

- [ ] Todos os testes passam (unit + integration)
- [ ] Interface admin permite criar/editar agente facilmente
- [ ] 3+ templates funcionando perfeitamente
- [ ] Off-topic detection com >90% accuracy
- [ ] Respostas soam naturais e humanas
- [ ] Identidade mantida em 100% dos casos (testes)
- [ ] Performance < 3s para respostas
- [ ] Documentação completa
- [ ] Zero critical bugs em staging
- [ ] Feedback positivo de beta testers

---

**Última atualização:** 22/11/2025  
**Próxima revisão:** Após cada fase completada  
**Owner:** Time de Desenvolvimento
