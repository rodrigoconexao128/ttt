# Análise e Correções de Bugs - AgenteZap

## Resumo dos Bugs Encontrados

### BUG 1: Comprovante PIX - Erro no envio
**Arquivo:** `client/src/components/subscribe-modal.tsx` (linha 575)
**Problema:** O fluxo de upload de comprovante pode falhar silenciosamente em alguns cenários de autenticação. A função `handleReceiptUpload` não trata corretamente casos onde o token é inválido ou expirado.
**Causa:** 
- A função `getAuthToken()` pode retornar null sem que o usuário seja redirecionado para login
- Falta validação de erro adequada quando a resposta é 401

### BUG 2: Comprovante PIX - Visibilidade no admin
**Arquivo:** `client/src/pages/admin.tsx`
**Problema:** O comprovante só aparece no Dashboard e na aba "Comprovantes PIX", mas não aparece nas abas "Pagamentos" e "Gerenciar Clientes" de forma consistente.
**Causa:** O componente `PaymentReceiptsManager` é renderizado apenas na tab `receipts`, e os outros componentes (`PaymentsManager`, `ClientManager`) não recebem os dados de comprovantes de forma adequada.

### BUG 3: Menu admin incompleto
**Arquivo:** `client/src/pages/admin.tsx` (linhas ~410-420)
**Problema:** Menu só aparece completo quando clica em "Conversas" pois há item duplicado "Ex-assinantes" no menu.
**Causa:** Duplicação do item de menu "Ex-assinantes" no SidebarMenu.

### BUG 4: Duplicidade de comprovantes
**Arquivo:** `server/routes.ts` (linha 11735)
**Problema:** Quando um comprovante é aprovado, os outros comprovantes pendentes do mesmo cliente não são cancelados/processados automaticamente.
**Causa:** Na função de aprovação do comprovante (`/api/admin/payment-receipts/:id/approve`), não há lógica para marcar outros comprovantes pendentes do mesmo usuário como "cancelled" ou "superseded".

### BUG 5: Gerenciar clientes - Datas incorretas
**Arquivo:** `server/routes.ts` (linha 17980)
**Problema:** A data de início é definida como `new Date()` no momento da atribuição, mas a data fim é calculada incorretamente para planos anuais.
**Causa:** 
```javascript
if (plan.periodicidade === "anual") {
  dataFim.setFullYear(dataFim.getFullYear() + 1); // Correto
} else {
  dataFim.setMonth(dataFim.getMonth() + 1); // Deveria ser +30 dias exatos
}
```
Para planos mensais, deveria adicionar 30 dias exatos, não 1 mês (que pode ter 28, 29, 30 ou 31 dias).

### BUG 6: Conexão WhatsApp no admin
**Arquivo:** `server/whatsapp.ts` (não analisado completamente)
**Problema:** Conexão está desconectando automaticamente no painel admin.
**Causa provável:** Falta de mecanismo de keep-alive específico para sessões de admin, ou o circuit breaker está desconectando as sessões após período de inatividade.

## Correções Necessárias

1. **BUG 1:** Melhorar tratamento de erro no upload de comprovante
2. **BUG 2:** Adicionar exibição de comprovantes em todas as abas relevantes
3. **BUG 3:** Remover duplicação do menu
4. **BUG 4:** Adicionar lógica para cancelar comprovantes pendentes ao aprovar um
5. **BUG 5:** Corrigir cálculo de datas (30 dias para mensal, 365 para anual)
6. **BUG 6:** Implementar keep-alive para conexões admin
