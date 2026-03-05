# Tasklist Profunda - Desenvolvimento e Manutenção

## 📋 Estrutura da Tasklist

Esta tasklist é organizada por **módulos** e **funcionalidades**. Cada tarefa inclui:
- Descrição clara
- Arquivos envolvidos
- Passos específicos
- Testes necessários
- Dependências

---

## 🔐 MÓDULO 1: AUTENTICAÇÃO

### 1.1 Autenticação de Usuários (Supabase JWT)

#### Tarefa 1.1.1: Implementar novo método de login
- **Descrição:** Adicionar login via Google/GitHub
- **Arquivos:** `server/supabaseAuth.ts`, `client/src/lib/supabase.ts`
- **Passos:**
  1. Configurar OAuth no Supabase
  2. Adicionar rota POST /api/auth/signin-google
  3. Atualizar frontend com botão de login
  4. Testar fluxo completo
- **Testes:**
  - [ ] Login com Google funciona
  - [ ] Token JWT é retornado
  - [ ] Usuário é criado no banco
  - [ ] Requisições subsequentes funcionam

#### Tarefa 1.1.2: Implementar refresh token
- **Descrição:** Renovar JWT token automaticamente
- **Arquivos:** `server/supabaseAuth.ts`, `client/src/lib/apiRequest.ts`
- **Passos:**
  1. Adicionar refresh token logic no backend
  2. Interceptar 401 no frontend
  3. Renovar token automaticamente
  4. Retry requisição original
- **Testes:**
  - [ ] Token expira após 1 hora
  - [ ] Refresh token renova automaticamente
  - [ ] Usuário não é deslogado

#### Tarefa 1.1.3: Implementar logout
- **Descrição:** Limpar sessão e token
- **Arquivos:** `server/supabaseAuth.ts`, `client/src/lib/supabase.ts`
- **Passos:**
  1. Adicionar rota GET /api/logout
  2. Chamar supabase.auth.signOut()
  3. Limpar localStorage no frontend
  4. Redirecionar para home
- **Testes:**
  - [ ] Logout funciona
  - [ ] Token é removido
  - [ ] Usuário é redirecionado
  - [ ] Rotas protegidas retornam 401

### 1.2 Autenticação de Admin (Email/Password + Session)

#### Tarefa 1.2.1: Implementar 2FA para admin
- **Descrição:** Adicionar autenticação de dois fatores
- **Arquivos:** `server/routes.ts`, `server/middleware.ts`
- **Passos:**
  1. Adicionar coluna `twoFactorSecret` em admins table
  2. Gerar secret com speakeasy
  3. Adicionar rota POST /api/admin/2fa/setup
  4. Adicionar rota POST /api/admin/2fa/verify
  5. Atualizar middleware isAdmin
- **Testes:**
  - [ ] 2FA pode ser ativado
  - [ ] QR code é gerado
  - [ ] Código TOTP funciona
  - [ ] Login sem 2FA falha

#### Tarefa 1.2.2: Implementar recuperação de senha
- **Descrição:** Permitir admin resetar senha
- **Arquivos:** `server/routes.ts`, `server/storage.ts`
- **Passos:**
  1. Adicionar rota POST /api/admin/forgot-password
  2. Gerar token de reset
  3. Enviar email com link
  4. Adicionar rota POST /api/admin/reset-password
  5. Validar token e atualizar senha
- **Testes:**
  - [ ] Email é enviado
  - [ ] Token é válido por 1 hora
  - [ ] Senha é atualizada
  - [ ] Login com nova senha funciona

#### Tarefa 1.2.3: Implementar auditoria de login
- **Descrição:** Registrar todos os logins de admin
- **Arquivos:** `server/routes.ts`, `shared/schema.ts`
- **Passos:**
  1. Criar tabela `admin_login_logs`
  2. Registrar login em POST /api/admin/login
  3. Registrar IP, user agent, timestamp
  4. Adicionar rota GET /api/admin/login-logs
  5. Mostrar no painel admin
- **Testes:**
  - [ ] Login é registrado
  - [ ] IP é capturado
  - [ ] Histórico é acessível

---

## 👥 MÓDULO 2: USUÁRIOS E PERFIL

#### Tarefa 2.1: Implementar perfil de usuário
- **Descrição:** Página de edição de perfil
- **Arquivos:** `server/routes.ts`, `client/src/pages/profile.tsx`
- **Passos:**
  1. Adicionar rota GET /api/users/profile
  2. Adicionar rota PUT /api/users/profile
  3. Criar página client/src/pages/profile.tsx
  4. Adicionar upload de avatar
- **Testes:**
  - [ ] Perfil é carregado
  - [ ] Dados são atualizados
  - [ ] Avatar é enviado
  - [ ] Mudanças são persistidas

#### Tarefa 2.2: Implementar preferências de usuário
- **Descrição:** Salvar preferências (tema, idioma, etc)
- **Arquivos:** `shared/schema.ts`, `server/storage.ts`
- **Passos:**
  1. Adicionar coluna `preferences` (JSON) em users
  2. Adicionar rota PUT /api/users/preferences
  3. Atualizar frontend com seletor de tema
- **Testes:**
  - [ ] Preferências são salvas
  - [ ] Tema é aplicado
  - [ ] Preferências persistem

---

## 💬 MÓDULO 3: WHATSAPP

#### Tarefa 3.1: Implementar reconexão automática
- **Descrição:** Reconectar WhatsApp se desconectar
- **Arquivos:** `server/whatsapp.ts`
- **Passos:**
  1. Adicionar listener para desconexão
  2. Implementar retry com backoff exponencial
  3. Notificar usuário
  4. Atualizar status no banco
- **Testes:**
  - [ ] Desconexão é detectada
  - [ ] Reconexão é tentada
  - [ ] Usuário é notificado
  - [ ] Mensagens são sincronizadas

#### Tarefa 3.2: Implementar sincronização de histórico
- **Descrição:** Sincronizar mensagens antigas do WhatsApp
- **Arquivos:** `server/whatsapp.ts`, `server/storage.ts`
- **Passos:**
  1. Buscar últimas 100 mensagens do WhatsApp
  2. Salvar no banco se não existem
  3. Atualizar UI com histórico
- **Testes:**
  - [ ] Histórico é sincronizado
  - [ ] Mensagens duplicadas não são criadas
  - [ ] UI mostra histórico

#### Tarefa 3.3: Implementar filtros de conversa
- **Descrição:** Filtrar conversas por status, data, etc
- **Arquivos:** `server/routes.ts`, `client/src/pages/dashboard.tsx`
- **Passos:**
  1. Adicionar rota GET /api/conversations?filter=...
  2. Implementar filtros no backend
  3. Adicionar UI de filtros no frontend
- **Testes:**
  - [ ] Filtros funcionam
  - [ ] Resultados são corretos
  - [ ] Performance é aceitável

---

## 🤖 MÓDULO 4: AGENTE DE IA

#### Tarefa 4.1: Implementar múltiplos modelos Mistral
- **Descrição:** Permitir escolher entre tiny, small, medium
- **Arquivos:** `server/aiAgent.ts`, `client/src/pages/my-agent.tsx`
- **Passos:**
  1. Adicionar coluna `model` em ai_agent_config
  2. Atualizar generateAIResponse() para usar modelo
  3. Adicionar seletor no frontend
  4. Testar cada modelo
- **Testes:**
  - [ ] Cada modelo funciona
  - [ ] Respostas são diferentes
  - [ ] Custo é calculado corretamente

#### Tarefa 4.2: Implementar histórico de respostas
- **Descrição:** Registrar todas as respostas do agente
- **Arquivos:** `shared/schema.ts`, `server/aiAgent.ts`
- **Passos:**
  1. Criar tabela `agent_responses`
  2. Registrar cada resposta
  3. Adicionar rota GET /api/agent/responses
  4. Mostrar histórico no painel
- **Testes:**
  - [ ] Respostas são registradas
  - [ ] Histórico é acessível
  - [ ] Filtros funcionam

#### Tarefa 4.3: Implementar análise de sentimento
- **Descrição:** Analisar sentimento das mensagens
- **Arquivos:** `server/aiAgent.ts`
- **Passos:**
  1. Integrar biblioteca de análise de sentimento
  2. Analisar cada mensagem recebida
  3. Salvar sentimento no banco
  4. Mostrar gráfico no painel
- **Testes:**
  - [ ] Sentimento é analisado
  - [ ] Gráfico é exibido
  - [ ] Dados são precisos

---

## 💳 MÓDULO 5: PAGAMENTOS E ASSINATURAS

#### Tarefa 5.1: Implementar pagamento automático
- **Descrição:** Renovar assinatura automaticamente
- **Arquivos:** `server/routes.ts`, `shared/schema.ts`
- **Passos:**
  1. Adicionar coluna `autoRenew` em subscriptions
  2. Criar job que roda diariamente
  3. Gerar novo PIX para renovação
  4. Notificar usuário
- **Testes:**
  - [ ] Job roda diariamente
  - [ ] PIX é gerado
  - [ ] Usuário é notificado
  - [ ] Assinatura é renovada

#### Tarefa 5.2: Implementar múltiplos métodos de pagamento
- **Descrição:** Adicionar cartão de crédito, boleto, etc
- **Arquivos:** `server/routes.ts`, `server/pixService.ts`
- **Passos:**
  1. Integrar Stripe ou PagSeguro
  2. Adicionar rota POST /api/payments/create-card
  3. Adicionar UI de seleção de método
  4. Testar cada método
- **Testes:**
  - [ ] Cada método funciona
  - [ ] Pagamento é processado
  - [ ] Assinatura é ativada

#### Tarefa 5.3: Implementar cupons de desconto
- **Descrição:** Permitir usar cupons na compra
- **Arquivos:** `shared/schema.ts`, `server/routes.ts`
- **Passos:**
  1. Criar tabela `coupons`
  2. Adicionar rota POST /api/coupons/validate
  3. Aplicar desconto no cálculo
  4. Adicionar UI de cupom
- **Testes:**
  - [ ] Cupom é validado
  - [ ] Desconto é aplicado
  - [ ] Cupom é marcado como usado

---

## 📊 MÓDULO 6: ADMIN PANEL

#### Tarefa 6.1: Implementar dashboard com gráficos
- **Descrição:** Mostrar métricas em gráficos
- **Arquivos:** `client/src/pages/admin.tsx`
- **Passos:**
  1. Integrar biblioteca de gráficos (recharts)
  2. Adicionar rota GET /api/admin/metrics
  3. Criar gráficos de receita, usuários, etc
  4. Adicionar filtros de data
- **Testes:**
  - [ ] Gráficos são exibidos
  - [ ] Dados são corretos
  - [ ] Filtros funcionam

#### Tarefa 6.2: Implementar gerenciamento de usuários
- **Descrição:** Editar, deletar, banir usuários
- **Arquivos:** `server/routes.ts`, `client/src/pages/admin.tsx`
- **Passos:**
  1. Adicionar rota PUT /api/admin/users/:id
  2. Adicionar rota DELETE /api/admin/users/:id
  3. Adicionar coluna `status` em users (active, banned)
  4. Criar UI de gerenciamento
- **Testes:**
  - [ ] Usuário pode ser editado
  - [ ] Usuário pode ser deletado
  - [ ] Usuário banido não pode fazer login

#### Tarefa 6.3: Implementar logs de sistema
- **Descrição:** Registrar todas as ações importantes
- **Arquivos:** `shared/schema.ts`, `server/routes.ts`
- **Passos:**
  1. Criar tabela `system_logs`
  2. Registrar ações em todas as rotas
  3. Adicionar rota GET /api/admin/logs
  4. Criar visualizador de logs
- **Testes:**
  - [ ] Ações são registradas
  - [ ] Logs são acessíveis
  - [ ] Filtros funcionam

---

## 🔧 MÓDULO 7: INFRAESTRUTURA E DEPLOYMENT

#### Tarefa 7.1: Implementar CI/CD
- **Descrição:** Automatizar testes e deploy
- **Arquivos:** `.github/workflows/`
- **Passos:**
  1. Criar workflow de testes
  2. Criar workflow de build
  3. Criar workflow de deploy
  4. Testar em staging
- **Testes:**
  - [ ] Testes rodam automaticamente
  - [ ] Build é criado
  - [ ] Deploy é automático

#### Tarefa 7.2: Implementar monitoramento
- **Descrição:** Monitorar performance e erros
- **Arquivos:** `server/index.ts`
- **Passos:**
  1. Integrar Sentry para erros
  2. Integrar DataDog para performance
  3. Configurar alertas
  4. Criar dashboard
- **Testes:**
  - [ ] Erros são capturados
  - [ ] Performance é monitorada
  - [ ] Alertas funcionam

#### Tarefa 7.3: Implementar backups automáticos
- **Descrição:** Fazer backup do banco diariamente
- **Arquivos:** `server/index.ts`
- **Passos:**
  1. Configurar backup automático no Supabase
  2. Testar restore
  3. Documentar procedimento
- **Testes:**
  - [ ] Backup é criado
  - [ ] Restore funciona
  - [ ] Dados são íntegros

---

## 🧪 MÓDULO 8: TESTES

#### Tarefa 8.1: Implementar testes unitários
- **Descrição:** Testar funções individuais
- **Arquivos:** `server/__tests__/`, `client/src/__tests__/`
- **Passos:**
  1. Instalar Jest
  2. Criar testes para storage.ts
  3. Criar testes para aiAgent.ts
  4. Criar testes para componentes React
- **Testes:**
  - [ ] Testes passam
  - [ ] Cobertura > 80%

#### Tarefa 8.2: Implementar testes de integração
- **Descrição:** Testar fluxos completos
- **Arquivos:** `server/__tests__/integration/`
- **Passos:**
  1. Testar fluxo de login
  2. Testar fluxo de pagamento
  3. Testar fluxo de agente
- **Testes:**
  - [ ] Fluxos funcionam
  - [ ] Dados são persistidos

#### Tarefa 8.3: Implementar testes E2E
- **Descrição:** Testar aplicação completa
- **Arquivos:** `e2e/`
- **Passos:**
  1. Instalar Playwright
  2. Criar testes de login
  3. Criar testes de dashboard
  4. Criar testes de admin
- **Testes:**
  - [ ] Testes passam
  - [ ] Cobertura de fluxos principais

---

## 📝 CHECKLIST GERAL

Antes de fazer qualquer tarefa:

- [ ] Ler DOCUMENTATION.md
- [ ] Ler SYSTEM_ARCHITECTURE.md
- [ ] Ler DEVELOPER_GUIDE.md
- [ ] Entender dependências da tarefa
- [ ] Criar branch: `git checkout -b feature/nome-da-tarefa`
- [ ] Implementar mudanças
- [ ] Testar localmente
- [ ] Fazer commit: `git commit -m "feat: descrição"`
- [ ] Fazer push: `git push origin feature/nome-da-tarefa`
- [ ] Criar Pull Request
- [ ] Revisar código
- [ ] Merge para main

---

**Última atualização:** Novembro 2025  
**Versão:** 1.0.0

