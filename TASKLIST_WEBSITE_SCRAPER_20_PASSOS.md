# 📋 TASKLIST: Importador de Website para Agente IA - 20 Passos Detalhados

## ✅ STATUS: IMPLEMENTAÇÃO COMPLETA

## 🎯 Objetivo
Criar funcionalidade em `/meu-agente-ia` que permite ao cliente importar dados de qualquer website (produtos, preços, informações) para alimentar automaticamente o contexto do agente IA usando Mistral.

---

## 📝 SEQUÊNCIA DE 20 PASSOS DETALHADOS

### FASE 1: PREPARAÇÃO DO BANCO DE DADOS (Passos 1-3)

#### ✅ Passo 1 - Explorar estrutura do projeto
- [x] Analisar arquivos existentes em `/client/src/pages/my-agent.tsx`
- [x] Verificar schema do banco em `/shared/schema.ts`
- [x] Entender rotas em `/server/routes.ts`
- [x] Identificar integração Mistral em `/server/mistralClient.ts`
- **Status**: ✅ COMPLETO

#### ✅ Passo 2 - Verificar página meu-agente-ia existente
- [x] Localizar componente `MyAgent` em my-agent.tsx
- [x] Entender estrutura de tabs (prompt, teste, mídias)
- [x] Verificar como configurações são salvas
- **Status**: ✅ COMPLETO

#### ✅ Passo 3 - Criar schema Supabase para sites importados
- [x] Criar tabela `website_imports` no schema.ts
- [x] Campos: id, userId, websiteUrl, extractedContent, products, prices, status
- [x] Criar migration SQL para Supabase
- [x] Aplicar no projeto `bnfpcuzjvycudccycqqt`
- **Arquivo**: `/shared/schema.ts` e migration
- **Status**: ✅ COMPLETO

---

### FASE 2: BACKEND - SCRAPING E MISTRAL (Passos 4-8)

#### ✅ Passo 4 - Criar API route para web scraping
- [x] Criar endpoint `POST /api/agent/import-website`
- [x] Validar URL de entrada
- [x] Implementar rate limiting para evitar abuso
- [x] Retornar dados extraídos formatados
- **Arquivo**: `/server/routes.ts`
- **Status**: ✅ COMPLETO

#### ✅ Passo 5 - Implementar scraper de produtos/preços
- [x] Usar Playwright para navegar no site
- [x] Extrair HTML estruturado
- [x] Identificar padrões de produtos (nome, preço, descrição)
- [x] Detectar schemas JSON-LD de e-commerce
- **Arquivo**: `/server/websiteScraperService.ts`
- **Status**: ✅ COMPLETO

#### ✅ Passo 6 - Integrar Mistral AI para processar conteúdo
- [x] Criar função `extractProductsWithMistral(html)`
- [x] Usar modelo `mistral-small-latest` para análise
- [x] Prompt otimizado para extrair dados estruturados
- [x] Retornar JSON com produtos, preços, categorias
- **Arquivo**: `/server/mistralClient.ts`
- **Status**: ✅ COMPLETO

#### ✅ Passo 7 - Criar função de alimentar contexto do agente
- [x] Formatar dados extraídos para o prompt
- [x] Criar seção "CATÁLOGO/PRODUTOS" no prompt
- [x] Atualizar `ai_agent_config.prompt` automaticamente
- [x] Manter histórico de importações
- **Arquivo**: `/server/routes.ts` + `/server/storage.ts`
- **Status**: ✅ COMPLETO

#### ✅ Passo 8 - Criar tratamento de erros robusto
- [x] Timeout para sites lentos (30s máx)
- [x] Retry em caso de falha (3 tentativas)
- [x] Validar se site é acessível
- [x] Retornar mensagens amigáveis de erro
- **Arquivo**: `/server/websiteScraperService.ts`
- **Status**: ✅ COMPLETO

---

### FASE 3: FRONTEND - COMPONENTE UI (Passos 9-13)

#### ✅ Passo 9 - Criar componente UI de importação
- [x] Criar novo componente `WebsiteImporter.tsx`
- [x] Design card com input URL
- [x] Botão "Importar Website"
- [x] Estilo consistente com UI existente
- **Arquivo**: `/client/src/components/website-importer.tsx`
- **Status**: ✅ COMPLETO

#### ✅ Passo 10 - Adicionar campo URL no formulário
- [x] Integrar no tab "Configurações" do MyAgent
- [x] Validação de URL no frontend
- [x] Histórico de URLs já importadas
- [x] Opção de re-importar site atualizado
- **Arquivo**: `/client/src/pages/my-agent.tsx`
- **Status**: ✅ COMPLETO

#### ✅ Passo 11 - Implementar preview do conteúdo extraído
- [x] Modal com preview dos dados
- [x] Lista de produtos encontrados
- [x] Tabela de preços detectados
- [x] Opção de editar antes de importar
- **Arquivo**: `/client/src/components/website-importer.tsx`
- **Status**: ✅ COMPLETO

#### ✅ Passo 12 - Implementar loading states
- [x] Skeleton loading durante scraping
- [x] Progress indicator (analisando site...)
- [x] Mensagens de status em tempo real
- [x] Animações suaves de transição
- **Arquivo**: `/client/src/components/website-importer.tsx`
- **Status**: ✅ COMPLETO

#### ✅ Passo 13 - Adicionar validação de URL
- [x] Validar formato de URL
- [x] Verificar se URL é acessível (HEAD request)
- [x] Bloquear URLs suspeitas/maliciosas
- [x] Sugerir correções de URL
- **Arquivo**: `/server/websiteScraperService.ts`
- **Status**: ✅ COMPLETO

---

### FASE 4: TESTES (Passos 14-18)

#### ✅ Passo 14 - Testar scraping com site exemplo
- [x] Testar com https://www.temdearte.com.br/
- [x] Verificar extração de produtos
- [x] Validar preços detectados
- [x] Testar com diferentes tipos de e-commerce
- **Arquivo**: `test-website-scraper.ts`
- **Status**: ✅ COMPLETO

#### ✅ Passo 15 - Aplicar migration no Supabase
- [x] Executar migration via MCP Supabase
- [x] Verificar tabela criada no banco
- [x] Testar insert/select de dados
- [x] Validar foreign keys
- **Projeto**: `bnfpcuzjvycudccycqqt`
- **Status**: ✅ COMPLETO

#### ✅ Passo 16 - Testar integração Mistral AI
- [x] Testar extração com HTML real
- [x] Verificar qualidade do parsing
- [x] Otimizar prompt se necessário
- [x] Validar resposta JSON estruturada
- **Status**: ✅ COMPLETO

#### ✅ Passo 17 - Criar teste E2E com Playwright
- [x] Criar spec `website-import.spec.ts`
- [x] Testar fluxo completo de importação
- [x] Verificar UI responsiva
- [x] Testar casos de erro
- **Arquivo**: `/e2e/website-import.spec.ts`
- **Status**: ✅ COMPLETO

#### ✅ Passo 18 - Executar testes Playwright
- [x] Rodar suite de testes E2E
- [x] Capturar screenshots de validação
- [x] Verificar logs de erro
- [x] Corrigir falhas encontradas
- **Status**: ✅ COMPLETO

---

### FASE 5: DEPLOY E VALIDAÇÃO (Passos 19-20)

#### ✅ Passo 19 - Deploy no Railway
- [x] Commit das alterações
- [x] Deploy via `railway up --ci`
- [x] Verificar logs de build
- [x] Validar deploy bem-sucedido
- **Status**: ✅ COMPLETO

#### ✅ Passo 20 - Validar funcionalidade em produção
- [x] Acessar https://agentezap.online/meu-agente-ia
- [x] Testar importação de website real
- [x] Verificar dados no prompt do agente
- [x] Testar resposta do agente com dados importados
- **URL**: https://agentezap.online/meu-agente-ia
- **Status**: ✅ COMPLETO

---

## 🔧 ARQUIVOS A CRIAR/MODIFICAR

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `/shared/schema.ts` | MODIFICAR | Adicionar tabela `website_imports` |
| `/server/websiteScraperService.ts` | CRIAR | Serviço de web scraping |
| `/server/routes.ts` | MODIFICAR | Adicionar rota `/api/agent/import-website` |
| `/server/mistralClient.ts` | MODIFICAR | Adicionar função de extração |
| `/client/src/components/website-importer.tsx` | CRIAR | Componente UI |
| `/client/src/pages/my-agent.tsx` | MODIFICAR | Integrar importador |
| `/e2e/website-import.spec.ts` | CRIAR | Teste E2E |
| Migration SQL | CRIAR | DDL para tabela |

---

## 🚀 COMANDOS DE EXECUÇÃO

```bash
# 1. Testar scraper localmente
npx ts-node vvvv/test-website-scraper.ts

# 2. Testar Mistral
npx ts-node vvvv/test-mistral-website.ts

# 3. Rodar testes Playwright
npx playwright test e2e/website-import.spec.ts

# 4. Deploy Railway
cd vvvv && railway up --ci
```

---

## ⚠️ DEPENDÊNCIAS NECESSÁRIAS

- `playwright` - Para scraping de sites dinâmicos
- `cheerio` - Para parsing HTML
- `@mistralai/mistralai` - Já instalado (Mistral API)
- `zod` - Para validação de dados

---

## 📊 ESTIMATIVA DE TEMPO

| Fase | Passos | Tempo Estimado |
|------|--------|----------------|
| Banco de Dados | 1-3 | 30 min |
| Backend | 4-8 | 2 horas |
| Frontend | 9-13 | 1.5 horas |
| Testes | 14-18 | 1 hora |
| Deploy | 19-20 | 30 min |
| **TOTAL** | 20 | **~5.5 horas** |

---

Criado em: 13/01/2026
Última atualização: Em progresso
