# FASE 1 - CORREÇÕES IDENTIFICADAS

## Resumo das Funcionalidades Existentes

### 1. Fluxo "Já paguei" (Cliente Normal) ✅
- **Arquivo**: `client/src/components/subscribe-modal.tsx`
- **Funcionalidade**: 
  - Botão "Já paguei? Enviar comprovante" existe (linha 1098)
  - Upload de comprovante funciona via `/api/payment-receipts/upload`
  - Modal de upload implementado
- **Status**: Funcional, mas precisa verificar se aparece corretamente no admin

### 2. Admin Pagamentos ✅
- **Arquivo**: `client/src/pages/admin.tsx`
- **Funcionalidade**:
  - Menu "Comprovantes PIX" existe na sidebar (linhas 328-341)
  - Badge de notificação implementado
  - Componente `PaymentReceiptsManager` existe (linha 2606)
  - Listagem com filtros (pending, approved, rejected, all)
  - Aprovação/Rejeição funcionam
- **Status**: Funcional

### 3. Duplicidade e Ativação ✅
- **Arquivo**: `server/routes.ts` (linhas 11567-11610)
- **Funcionalidade**:
  - Cancela comprovantes duplicados pendentes do mesmo usuário quando um é aprovado
  - Ativa plano automaticamente na aprovação
  - Cálculo de vigência: usa `frequencia_dias` do plano ou 30 dias padrão
- **Status**: Implementado, mas precisa verificar se o cálculo de datas está correto

### 4. Revenda com PIX ❌ PRECISA CORREÇÃO
- **Arquivos**: 
  - `client/src/pages/reseller.tsx`
  - `server/routes.ts`
  - `server/resellerService.ts`
- **Problemas Identificados**:
  1. Não há botão "Já paguei" para envio de comprovante na revenda
  2. Não há integração entre comprovantes da revenda e Admin > Pagamentos
  3. O fluxo de revenda usa MercadoPago diretamente, sem opção de PIX manual

## Correções Necessárias

### CORREÇÃO 1: Adicionar botão "Já paguei" na Revenda
**Local**: `client/src/pages/reseller.tsx`
**Ação**: Adicionar botão no modal de checkout PIX para envio de comprovante

### CORREÇÃO 2: Criar rota de upload de comprovante para revenda
**Local**: `server/routes.ts`
**Ação**: Criar rota `/api/reseller/payment-receipts/upload` similar à rota normal

### CORREÇÃO 3: Integrar comprovantes da revenda no Admin
**Local**: 
- `server/routes.ts` - Rota `/api/admin/payment-receipts`
**Ação**: Incluir comprovantes da revenda na listagem admin

### CORREÇÃO 4: Verificar cálculo de vigência
**Local**: `server/routes.ts` (linha 11690+)
**Ação**: Confirmar que:
- Plano mensal = 30 dias
- Plano anual = 365 dias
- A data fim está sendo calculada corretamente

## Implementação

### Passo 1: Verificar funcionamento atual
- Testar fluxo de cliente normal
- Verificar se comprovantes aparecem no admin

### Passo 2: Corrigir Revenda
- Adicionar botão "Já paguei" no checkout da revenda
- Criar rota de upload específica
- Integrar com admin

### Passo 3: Verificar cálculo de vigência
- Revisar código de ativação
- Corrigir se necessário

### Passo 4: Testar tudo
- Teste end-to-end de todos os fluxos
