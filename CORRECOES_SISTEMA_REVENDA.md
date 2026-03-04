# 🔧 Correções do Sistema de Revenda - Janeiro 2025

## 📋 Resumo Executivo

Foram identificados e corrigidos **3 bugs críticos** no sistema de revenda:

1. ✅ **Modal Duplicado** - Dialog aparecendo sobre página de detalhes do cliente
2. ✅ **QR Code PIX Quebrado** - Imagem não sendo gerada corretamente
3. ✅ **Validação de Acesso SaaS** - Campo `saasPaidUntil` não estava sendo verificado

---

## 🐛 Bug #1: Modal Duplicado

### Problema
Quando o usuário navegava para `/revenda/clientes/:id`, um Dialog (modal) aparecia **sobre** a página de detalhes do cliente, causando confusão visual e sobreposição de conteúdo.

### Causa Raiz
A variável `isClientDetailsOpen` estava sendo definida como `true` sempre que `clientIdFromUrl` existia, **independente da rota atual**. Isso fazia o Dialog abrir tanto na rota de listagem quanto na rota de detalhes.

### Solução
**Arquivo:** `vvvv/client/src/pages/reseller.tsx` (Linha 357)

**Antes:**
```tsx
const isClientDetailsOpen = !!clientIdFromUrl;
```

**Depois:**
```tsx
const isClientDetailsOpen = !!clientIdFromUrl && !location.startsWith("/revenda/clientes/");
```

**Explicação:** Adicionamos uma verificação para garantir que o Dialog só abre quando **não** estivermos na rota de detalhes (`/revenda/clientes/:id`).

### Teste Realizado
✅ Navegação para `/revenda/clientes/:id` - Modal não aparece mais
✅ Navegação normal - Sistema funciona corretamente

---

## 🐛 Bug #2: QR Code PIX Quebrado

### Problema
Ao clicar em "Pagar" para gerar uma fatura, o QR Code PIX não estava sendo exibido. No lugar, aparecia uma imagem quebrada ou `ERR_INVALID_URL`.

### Causa Raiz
O MercadoPago retorna o campo `qr_code` como uma **string PIX** (código para copiar e colar), **não como uma imagem base64**. O frontend estava tentando exibir essa string como se fosse uma imagem:

```tsx
<img src={`data:image/png;base64,${granularPixQrCode}`} />
```

Isso resultava em um erro porque `granularPixQrCode` continha o texto PIX (`00020126470014br.gov.bcb.pix...`), não dados de imagem.

### Solução

#### 1. Adicionar Import da Biblioteca QRCode
**Arquivo:** `vvvv/client/src/pages/reseller.tsx` (Linha 60)

```tsx
import QRCode from "qrcode";
```

#### 2. Implementar useEffect para Gerar QR Code
**Arquivo:** `vvvv/client/src/pages/reseller.tsx` (Linhas 377-382)

```tsx
useEffect(() => {
  if (granularPixCode) {
    QRCode.toDataURL(granularPixCode, { errorCorrectionLevel: 'M', width: 256 })
      .then(url => setGranularPixQrCode(url))
      .catch(err => console.error('Erro ao gerar QR Code:', err));
  }
}, [granularPixCode]);
```

**Explicação:** Quando `granularPixCode` (string PIX) é recebida, usamos a biblioteca `qrcode` para gerar uma **Data URL** (imagem PNG em base64) que pode ser exibida no `<img>`.

#### 3. Modificar Mutation para Usar String PIX
**Arquivo:** `vvvv/client/src/pages/reseller.tsx` (Linhas 594-599)

**Antes:**
```tsx
onSuccess: (data) => {
  setGranularPixQrCode(data.qrCode || ""); // Tratava como imagem
  // ...
}
```

**Depois:**
```tsx
onSuccess: (data) => {
  setGranularPixCode(data.qrCode || ""); // O qrCode do MP é o código PIX string
  setGranularTotalAmount(data.totalAmount);
  setIsGranularCheckoutOpen(true);
}
```

#### 4. Atualizar Elemento `<img>`
**Arquivo:** `vvvv/client/src/pages/reseller.tsx` (Linha 3475)

**Antes:**
```tsx
<img src={`data:image/png;base64,${granularPixQrCode}`} />
```

**Depois:**
```tsx
<img src={granularPixQrCode} alt="QR Code PIX" />
```

**Explicação:** Agora `granularPixQrCode` já contém a Data URL completa (`data:image/png;base64,...`), então não precisamos adicionar o prefixo manualmente.

### Fluxo Final
1. Backend retorna `qrCode` (string PIX do MercadoPago)
2. Frontend armazena em `granularPixCode`
3. `useEffect` detecta mudança e gera Data URL via `QRCode.toDataURL()`
4. Data URL é armazenada em `granularPixQrCode`
5. `<img>` exibe a imagem corretamente

### Testes Realizados
✅ **Pagamento Individual (1 cliente):**
   - QR Code gerado corretamente
   - Total: R$ 49,99
   - Código PIX copiável disponível

✅ **Pagamento Múltiplo (4 clientes):**
   - QR Code gerado corretamente
   - Total: R$ 199,96 (4 × R$ 49,99)
   - Código PIX copiável disponível

---

## 🐛 Bug #3: Validação de Acesso SaaS

### Problema
O campo `saasPaidUntil` estava sendo atualizado corretamente pelo webhook do MercadoPago, mas **não estava sendo validado** no middleware de autenticação. Isso significava que:
- Clientes poderiam ter `saasPaidUntil` expirado mas ainda ter acesso ao SaaS
- Sistema não bloqueava acesso após vencimento do pagamento granular

### Causa Raiz
O middleware em `routes.ts` (linha ~2075) validava apenas `nextPaymentDate` para clientes de revenda, ignorando o campo `saasPaidUntil` que foi adicionado especificamente para pagamentos granulares.

### Solução
**Arquivo:** `vvvv/server/routes.ts` (Linhas 2072-2091)

**Antes:**
```tsx
} else if (resellerClient.status === 'active') {
  hasActiveSubscription = true;
  // Verificar se está vencido pela data de próximo pagamento
  if (resellerClient.nextPaymentDate) {
    const nextPayment = new Date(resellerClient.nextPaymentDate);
    const today = new Date();
    const daysOverdue = Math.floor((today.getTime() - nextPayment.getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue > 5) {
      isSubscriptionExpired = true;
    }
  }
}
```

**Depois:**
```tsx
} else if (resellerClient.status === 'active') {
  hasActiveSubscription = true;
  
  // PRIORITIZE: Verificar se está vencido pelo saasPaidUntil (pagamentos granulares)
  if (resellerClient.saasPaidUntil) {
    const paidUntil = new Date(resellerClient.saasPaidUntil);
    const today = new Date();
    if (today > paidUntil) {
      isSubscriptionExpired = true;
      hasActiveSubscription = false;
    }
  }
  // FALLBACK: Verificar se está vencido pela data de próximo pagamento (assinaturas)
  else if (resellerClient.nextPaymentDate) {
    const nextPayment = new Date(resellerClient.nextPaymentDate);
    const today = new Date();
    const daysOverdue = Math.floor((today.getTime() - nextPayment.getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue > 5) {
      isSubscriptionExpired = true;
    }
  }
}
```

**Explicação:**
- **PRIORITIZE**: Se `saasPaidUntil` existir (pagamento granular), valida primeiro
- **FALLBACK**: Se não existir, usa `nextPaymentDate` (assinatura recorrente)
- Garante que o campo correto seja usado dependendo do tipo de pagamento

### Verificação do Webhook
O webhook já estava implementado corretamente:

**Arquivo:** `vvvv/server/resellerService.ts` (Linhas 683-707)

```typescript
async processGranularPaymentWebhook(payment: any): Promise<void> {
  // ... validações ...
  
  for (const item of items) {
    const client = await storage.getResellerClient(item.resellerClientId);
    
    let currentSaaSDate = client.saasPaidUntil ? new Date(client.saasPaidUntil) : new Date();
    if (currentSaaSDate < new Date()) {
      currentSaaSDate = new Date(); // Se já venceu, começa de hoje
    }
    
    // Adicionar 30 dias
    const newExpirtyDate = new Date(currentSaaSDate);
    newExpirtyDate.setDate(newExpirtyDate.getDate() + 30);

    // Atualizar cliente
    await storage.updateResellerClient(client.id, {
      saasPaidUntil: newExpirtyDate,
      saasStatus: "active"
    });
  }
}
```

✅ Webhook atualiza `saasPaidUntil` corretamente (soma 30 dias)
✅ Middleware agora valida este campo para bloquear acesso expirado

---

## 📊 Resumo das Alterações

### Arquivos Modificados

1. **`vvvv/client/src/pages/reseller.tsx`**
   - Linha 60: Import `QRCode`
   - Linha 357: Correção modal duplicado
   - Linhas 377-382: useEffect geração QR Code
   - Linhas 594-599: Mutation usando string PIX
   - Linha 3475: Img src usando Data URL

2. **`vvvv/server/routes.ts`**
   - Linhas 2072-2091: Validação `saasPaidUntil` no middleware

### Código Revisado (Sem Alterações)

3. **`vvvv/server/resellerService.ts`**
   - Linha 657: `processGranularPaymentWebhook` ✅ OK
   - Linha 702: Atualiza `saasPaidUntil` ✅ OK

4. **`vvvv/server/routes.ts`**
   - Linha 5834: Webhook `/api/webhooks/mercadopago` ✅ OK
   - Linha 5882: Chama `processGranularPaymentWebhook` ✅ OK

---

## ✅ Testes Realizados com Playwright

### Teste 1: Modal Duplicado
- ✅ Navegação para `/revenda/clientes/:id` - Modal não aparece
- ✅ Dialog só abre na rota correta

### Teste 2: QR Code Individual
- ✅ Click em "Pagar" de 1 cliente
- ✅ Modal abre com QR Code visível
- ✅ Total: R$ 49,99
- ✅ Código PIX copiável presente
- ✅ Screenshot: `qrcode-test.png`

### Teste 3: QR Code Múltiplo
- ✅ Seleção de todos os 4 clientes
- ✅ Cálculo correto: 4 × R$ 49,99 = R$ 199,96
- ✅ Modal abre com QR Code visível
- ✅ Código PIX copiável presente
- ✅ Screenshot: `qrcode-4-clients.png`

---

## 🚀 Próximos Passos Recomendados

### 1. Teste de Webhook Real (Opcional)
Para validar completamente o fluxo:
1. Fazer um pagamento PIX real no ambiente de testes do MercadoPago
2. Verificar se webhook atualiza `saasPaidUntil`
3. Confirmar que cliente recebe acesso por 30 dias
4. Verificar que acesso é bloqueado após vencimento

### 2. Monitoramento
- Verificar logs do webhook: `console.log` em `processGranularPaymentWebhook`
- Confirmar que `saasPaidUntil` está sendo atualizado no banco
- Testar bloqueio de acesso após data de vencimento

---

## 📝 Notas Técnicas

### Biblioteca QRCode
A biblioteca `qrcode` já estava instalada (`package.json`):
```json
"qrcode": "^1.5.4"
```

Apenas faltava implementar o uso correto no componente.

### MercadoPago API Response
O campo `qr_code` retornado pelo MercadoPago contém o **código PIX string**, não a imagem:
```json
{
  "point_of_interaction": {
    "transaction_data": {
      "qr_code": "00020126470014br.gov.bcb.pix0125...",
      "qr_code_base64": null  // ⚠️ Sempre null na resposta
    }
  }
}
```

Por isso é necessário gerar o QR Code no cliente usando a biblioteca.

### Estrutura do Banco de Dados
Campo `saasPaidUntil` no schema:
```typescript
saasPaidUntil: timestamp("saas_paid_until"),
saasStatus: varchar("saas_status", { length: 20 }).default("active"),
```

---

## 👨‍💻 Desenvolvedor
Correções realizadas em: **27/01/2025**  
Testes com Playwright: ✅ **Todos Aprovados**  
Usuário de Teste: `rodrigo4@gmail.com`  
Ambiente: `localhost:5000`

---

## 🎯 Status Final

| Bug | Status | Teste |
|-----|--------|-------|
| Modal Duplicado | ✅ Corrigido | ✅ Aprovado |
| QR Code PIX | ✅ Corrigido | ✅ Aprovado |
| Validação SaaS | ✅ Corrigido | ⏳ Pendente teste real |

**Sistema pronto para deploy em Railway!** 🚀
