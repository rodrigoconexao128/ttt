# 🏢 PLANO DE ENGENHARIA - SISTEMA DE REVENDA WHITE-LABEL

## 📋 RESUMO EXECUTIVO

Sistema completo de revenda (white-label) para o SaaS AgentZap, permitindo que revendedores:
- Tenham seu próprio domínio/subdomínio personalizado
- Customizem logo, cores e branding
- Criem contas para seus clientes (R$ 49,99/conta)
- Definam seus próprios preços de revenda
- Gerenciem seus clientes de forma independente

---

## ✅ PROGRESSO DE IMPLEMENTAÇÃO

### Backend (Concluído)
- [x] Schema de banco de dados (shared/schema.ts)
- [x] Migration SQL (migrations/0060_reseller_whitelabel.sql)
- [x] Funções de storage CRUD (server/storage.ts)
- [x] Service de revenda (server/resellerService.ts)
- [x] Rotas de API (server/routes.ts)
  - [x] GET/POST/PUT /api/reseller/profile
  - [x] GET/POST /api/reseller/clients
  - [x] POST /api/reseller/clients/:id/suspend|reactivate|cancel
  - [x] GET /api/reseller/dashboard
  - [x] GET /api/reseller/payments
  - [x] POST /api/reseller/webhook/payment
  - [x] GET /api/reseller/detect
  - [x] GET /api/admin/resellers
  - [x] GET /api/admin/resellers/:id
  - [x] PUT /api/admin/resellers/:id/status
  - [x] POST /api/admin/users/:id/make-reseller

### Frontend (Concluído)
- [x] Componente ResellersManager no admin (client/src/pages/admin.tsx)
- [x] Página de dashboard do revendedor (client/src/pages/reseller.tsx)
- [x] Rota /revenda no App.tsx
- [x] Link "Minha Revenda" no menu do dashboard (condicional)

### Pendente
- [ ] Executar migration no banco de dados
- [ ] Criar plano de revenda no admin
- [ ] Testar fluxo completo
- [ ] Implementar páginas white-label (login/landing customizadas)
- [ ] Implementar detecção de domínio no frontend

---

## 🎯 REQUISITOS FUNCIONAIS

### 1. PLANO DE REVENDA (Admin)
- [x] Novo tipo de plano "revenda" com valor R$ 700/mês
- [x] Preço personalizável pelo admin (como outros planos)
- [ ] Exibição na página de planos
- [x] Atribuição manual pelo admin

### 2. PAINEL DO REVENDEDOR (Dentro do sistema cliente)
- [x] Nova aba "Revenda" no dashboard do cliente com plano revenda
- [x] Upload de logo personalizada (estrutura pronta)
- [x] Configuração de cores (primária, secundária, accent)
- [x] Configuração de domínio customizado
- [x] Definição de preços para clientes finais
- [x] Lista de clientes do revendedor
- [x] Criar nova conta para cliente (cobra R$ 49,99)

### 3. WHITE-LABEL/DOMÍNIO CUSTOMIZADO
- [ ] Página de login customizada com logo do revendedor
- [ ] Landing page simplificada com branding do revendedor
- [ ] Roteamento por subdomínio/domínio customizado
- [ ] Sem menção à marca AgentZap para clientes do revendedor

### 4. SISTEMA DE PAGAMENTO (Criação de conta)
- [ ] Quando revendedor cria conta para cliente → cobra R$ 49,99
- [ ] Mesma lógica do sistema de planos existente
- [ ] Primeira cobrança imediata via cartão
- [ ] Agendamento de cobranças recorrentes (MercadoPago)
- [ ] Suporte a PIX e Cartão

### 5. GESTÃO DE CLIENTES DO REVENDEDOR
- [ ] Revendedor vê apenas seus clientes
- [ ] Revendedor pode ativar/desativar clientes
- [ ] Histórico de pagamentos por cliente
- [ ] Dashboard com métricas de revenda

---

## 🗄️ MODELAGEM DE DADOS

### Tabelas Novas

```sql
-- 1. CONFIGURAÇÃO DO REVENDEDOR
CREATE TABLE resellers (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  
  -- Branding
  logo_url TEXT,
  primary_color VARCHAR(20) DEFAULT '#000000',
  secondary_color VARCHAR(20) DEFAULT '#ffffff', 
  accent_color VARCHAR(20) DEFAULT '#22c55e',
  company_name VARCHAR(255),
  
  -- Domínio customizado
  custom_domain VARCHAR(255) UNIQUE,
  subdomain VARCHAR(100) UNIQUE,
  domain_verified BOOLEAN DEFAULT false,
  
  -- Preços para clientes finais
  client_monthly_price DECIMAL(10,2) DEFAULT 99.99,
  client_setup_fee DECIMAL(10,2) DEFAULT 0,
  
  -- Configurações
  is_active BOOLEAN DEFAULT true,
  max_clients INTEGER DEFAULT 100,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. CLIENTES DO REVENDEDOR
CREATE TABLE reseller_clients (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id VARCHAR NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'active', -- active, suspended, cancelled
  
  -- Financeiro (cobra do revendedor R$ 49,99/mês por cliente)
  monthly_cost DECIMAL(10,2) DEFAULT 49.99,
  
  -- Datas
  activated_at TIMESTAMP DEFAULT NOW(),
  suspended_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. PAGAMENTOS DO REVENDEDOR (por cliente criado)
CREATE TABLE reseller_payments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id VARCHAR NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  reseller_client_id VARCHAR REFERENCES reseller_clients(id) ON DELETE SET NULL,
  
  -- Valores
  amount DECIMAL(10,2) NOT NULL,
  payment_type VARCHAR(50) NOT NULL, -- client_creation, recurring
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
  
  -- MercadoPago
  mp_payment_id VARCHAR(255),
  mp_subscription_id VARCHAR(255),
  payment_method VARCHAR(50), -- credit_card, pix
  
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. ÍNDICES
CREATE INDEX idx_resellers_user ON resellers(user_id);
CREATE INDEX idx_resellers_domain ON resellers(custom_domain);
CREATE INDEX idx_resellers_subdomain ON resellers(subdomain);
CREATE INDEX idx_reseller_clients_reseller ON reseller_clients(reseller_id);
CREATE INDEX idx_reseller_clients_user ON reseller_clients(user_id);
CREATE INDEX idx_reseller_payments_reseller ON reseller_payments(reseller_id);
```

### Alterações em Tabelas Existentes

```sql
-- Adicionar campo na tabela users para identificar revendedor
ALTER TABLE users ADD COLUMN reseller_id VARCHAR REFERENCES resellers(id);

-- Adicionar tipo "revenda" na tabela plans
-- (já suporta via campo tipo)
INSERT INTO plans (nome, descricao, valor, tipo, caracteristicas, ativo)
VALUES (
  'Plano Revenda',
  'Revenda o AgentZap com sua marca. Crie contas para seus clientes por R$ 49,99/mês cada.',
  700.00,
  'revenda',
  '["Logo e cores personalizadas", "Domínio próprio", "Clientes ilimitados", "R$ 49,99/cliente/mês", "Suporte prioritário", "Dashboard de revenda"]',
  true
);
```

---

## 🔧 ARQUITETURA TÉCNICA

### 1. Backend (Novas Rotas)

```
POST   /api/reseller/setup           - Configurar perfil de revendedor
GET    /api/reseller/profile         - Obter config do revendedor
PUT    /api/reseller/profile         - Atualizar config
POST   /api/reseller/upload-logo     - Upload de logo
GET    /api/reseller/clients         - Listar clientes
POST   /api/reseller/clients         - Criar novo cliente (+ cobrança)
PUT    /api/reseller/clients/:id     - Atualizar cliente
DELETE /api/reseller/clients/:id     - Remover cliente
GET    /api/reseller/payments        - Histórico de pagamentos
GET    /api/reseller/dashboard       - Métricas

-- Admin routes
GET    /api/admin/resellers          - Listar todos revendedores
POST   /api/admin/users/:id/reseller - Atribuir plano revenda
```

### 2. Frontend (Novas Páginas)

```
/reseller                   - Dashboard do revendedor
/reseller/branding          - Configurar logo e cores
/reseller/domain            - Configurar domínio
/reseller/clients           - Lista de clientes
/reseller/clients/new       - Criar novo cliente
/reseller/payments          - Histórico de pagamentos

-- White-label pages (por domínio)
/                           - Landing page customizada
/login                      - Login customizado
/register                   - Registro para clientes do revendedor
```

### 3. Middleware de Domínio Customizado

```typescript
// Detecta o revendedor pelo domínio/subdomínio
async function resellerMiddleware(req, res, next) {
  const host = req.headers.host;
  
  // Verifica se é subdomínio
  if (host.includes('.agentezap.com') && !host.startsWith('www')) {
    const subdomain = host.split('.')[0];
    const reseller = await getResellerBySubdomain(subdomain);
    if (reseller) {
      req.reseller = reseller;
      req.isWhiteLabel = true;
    }
  }
  
  // Verifica domínio customizado
  const reseller = await getResellerByDomain(host);
  if (reseller) {
    req.reseller = reseller;
    req.isWhiteLabel = true;
  }
  
  next();
}
```

---

## 💳 FLUXO DE PAGAMENTO

### Criação de Cliente pelo Revendedor

```
1. Revendedor acessa /reseller/clients/new
2. Preenche dados do cliente (nome, email, telefone)
3. Sistema cria preferência de pagamento (R$ 49,99)
4. Revendedor é direcionado para checkout MercadoPago
5. Após pagamento aprovado:
   - Cria usuário no sistema
   - Vincula ao revendedor
   - Cria assinatura recorrente (próximos R$ 49,99)
   - Cliente recebe email com credenciais
```

### Webhook MercadoPago

```typescript
// Processar pagamento de criação de cliente
if (topic === 'payment' && data.type === 'reseller_client') {
  const payment = await mercadoPago.getPayment(data.id);
  
  if (payment.status === 'approved') {
    // Criar o cliente do revendedor
    await createResellerClient(payment.external_reference);
    
    // Criar assinatura recorrente para próximos meses
    await createRecurringSubscription(payment.payer_email, 49.99);
  }
}
```

---

## 🎨 WHITE-LABEL UI

### Variáveis CSS Dinâmicas

```css
:root {
  --reseller-primary: var(--primary-color, #000000);
  --reseller-secondary: var(--secondary-color, #ffffff);
  --reseller-accent: var(--accent-color, #22c55e);
  --reseller-logo: var(--logo-url, '/default-logo.png');
}
```

### Componente de Branding

```tsx
function ResellerBranding({ reseller }) {
  return (
    <style jsx global>{`
      :root {
        --primary-color: ${reseller?.primaryColor || '#000000'};
        --secondary-color: ${reseller?.secondaryColor || '#ffffff'};
        --accent-color: ${reseller?.accentColor || '#22c55e'};
      }
    `}</style>
  );
}
```

---

## 📊 DASHBOARD DO REVENDEDOR

### Métricas Principais
- Total de clientes ativos
- Receita mensal (preço × clientes)
- Custo mensal (R$ 49,99 × clientes)
- Lucro líquido
- Novos clientes no mês
- Churn rate

### Gráficos
- Evolução de clientes (últimos 12 meses)
- Receita vs Custo
- Conversões de cadastro

---

## 🔐 SEGURANÇA

### Isolamento de Dados
- Clientes do revendedor só veem dados do revendedor
- Revendedor não acessa dados de outros revendedores
- Admin vê tudo

### Validações
- Domínio/subdomínio único por revendedor
- Limite de clientes por plano
- Verificação de propriedade de domínio (TXT record)

---

## 📝 CHECKLIST DE IMPLEMENTAÇÃO

### Fase 1: Backend Base
- [ ] Criar schema das novas tabelas (schema.ts)
- [ ] Criar migration SQL
- [ ] Implementar storage functions
- [ ] Criar rotas de API

### Fase 2: Admin
- [ ] Adicionar plano "Revenda" no seed/admin
- [ ] Interface para atribuir plano revenda
- [ ] Listagem de revendedores

### Fase 3: Painel Revendedor
- [ ] Página de configuração de branding
- [ ] Upload de logo
- [ ] Configuração de domínio
- [ ] Lista de clientes
- [ ] Criação de cliente + pagamento

### Fase 4: White-Label
- [ ] Middleware de detecção de domínio
- [ ] Landing page customizada
- [ ] Login customizado
- [ ] CSS dinâmico

### Fase 5: Pagamentos
- [ ] Integração MercadoPago para criação de cliente
- [ ] Webhook para aprovar cliente
- [ ] Assinatura recorrente

### Fase 6: Testes
- [ ] Testes de criação de revendedor
- [ ] Testes de criação de cliente
- [ ] Testes de white-label
- [ ] Testes de pagamento

---

## 🚀 PRÓXIMOS PASSOS

1. **Aprovar este plano** com ajustes necessários
2. **Implementar schema** no banco de dados
3. **Desenvolver backend** (rotas + storage)
4. **Criar frontend** do painel revendedor
5. **Implementar white-label** com domínio customizado
6. **Integrar pagamentos** MercadoPago
7. **Testar** todo o fluxo
8. **Deploy** em produção

---

## 📞 ESTIMATIVA

- **Complexidade**: Alta
- **Tempo estimado**: 4-6 horas de desenvolvimento
- **Principais riscos**:
  - Configuração de DNS para domínios customizados
  - Complexidade do middleware de roteamento
  - Integração de pagamentos recorrentes

