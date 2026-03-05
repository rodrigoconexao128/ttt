# Implementação de Assinaturas Recorrentes - Mercado Pago

## Resumo das Alterações

### 📋 O que foi feito

1. **API de Assinaturas Recorrentes** (`/api/subscriptions/create-mp-subscription`)
   - Implementação correta usando a API `/preapproval` do Mercado Pago
   - Suporte a checkout transparente com `card_token_id`
   - Fallback para link de pagamento (`init_point`) se necessário
   - Cobrança automática mensal gerenciada pelo Mercado Pago

2. **Migração de Planos** (NOVO)
   - Endpoint `/api/subscriptions/migrate-plan` para usuários
   - Endpoint `/api/admin/subscriptions/:id/migrate-plan` para admins
   - Atualiza assinatura no MP quando migra de plano
   - Suporta upgrade e downgrade

3. **Frontend Atualizado** (`subscribe.tsx`)
   - Mensagem de sucesso indica cobrança recorrente automática
   - Suporte a redirect para `init_point` quando necessário
   - Tratamento de erros melhorado

4. **Admin Panel** (já existente)
   - Configuração de credenciais de teste e produção
   - Switch entre modos teste/produção
   - Campos para Public Key, Access Token, Client ID, Client Secret

---

## 🔧 Como Funciona a Cobrança Recorrente

### Fluxo de Pagamento:

```
1. Usuário preenche dados do cartão no checkout
2. Frontend gera card_token via SDK do MP
3. Backend cria assinatura na API /preapproval do MP
4. MP cria a assinatura e agenda cobranças automáticas
5. MP cobra automaticamente todo mês no cartão
6. Webhooks notificam sobre status dos pagamentos
```

### API de Assinaturas (preapproval):

```javascript
POST https://api.mercadopago.com/preapproval
{
  "reason": "Plano Pro - AgenteZap",
  "external_reference": "sub_123",
  "payer_email": "cliente@email.com",
  "card_token_id": "token_do_cartao", // Para checkout transparente
  "auto_recurring": {
    "frequency": 1,
    "frequency_type": "months",
    "transaction_amount": 97.00,
    "currency_id": "BRL",
    "start_date": "2026-01-02T00:00:00Z",
    "end_date": "2031-01-02T00:00:00Z"
  },
  "back_url": "https://agentezap.com/dashboard",
  "status": "authorized" // ou "pending" para link de pagamento
}
```

---

## 🔐 Credenciais do Mercado Pago

### Modo Teste:
- **Public Key**: `TEST-224d6148-83a6-43fc-bded-659e7be60eb6`
- **Access Token**: `TEST-7853790746726235-122922-014a7c91c63452a78e2732d7f5bf24a0-1105684259`

### Modo Produção:
- **Public Key**: `APP_USR-c6880571-f1e5-4c5b-adba-d78ec125d570`
- **Access Token**: `APP_USR-7853790746726235-122922-c063f3f0183988a1216419552a24f097-1105684259`
- **Client ID**: `7853790746726235`
- **Client Secret**: `NDT5vcvhWXvFj8eBcJkjbwmddeDNOhNh`

### ⚠️ Importante sobre Modo Teste:
- **Credenciais de teste requerem contas de teste do Mercado Pago**
- Erro `Invalid users involved` ou `2034` significa que você está usando credenciais de teste com conta real
- Crie contas de teste em: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/your-integrations/test/accounts

---

## 📡 Webhooks

Configure o webhook no painel do Mercado Pago:
- URL: `https://seu-dominio.com/api/webhooks/mercadopago`
- Eventos: `subscription_preapproval`, `subscription_authorized_payment`, `payment`

---

## 🔄 Migração de Planos

### Usuário (autenticado):
```javascript
POST /api/subscriptions/migrate-plan
{
  "subscriptionId": "id_da_assinatura",
  "newPlanId": "id_do_novo_plano"
}
```

### Admin:
```javascript
POST /api/admin/subscriptions/:id/migrate-plan
{
  "newPlanId": "id_do_novo_plano"
}
```

---

## 📊 Status das Assinaturas

| Status MP | Status Local | Descrição |
|-----------|--------------|-----------|
| `authorized` | `active` | Assinatura ativa, cobrança automática |
| `pending` | `pending` | Aguardando pagamento |
| `paused` | `paused` | Assinatura pausada |
| `cancelled` | `cancelled` | Assinatura cancelada |

---

## 🛠️ Arquivos Modificados

1. `server/routes.ts` - Rota de criação de assinatura e migração de planos
2. `client/src/pages/subscribe.tsx` - Handler de sucesso com suporte a init_point
3. `server/mercadoPagoService.ts` - Serviço de integração com MP (existente)

---

## 📝 Próximos Passos Recomendados

1. **Configurar Webhooks** no painel do MP para receber notificações de pagamento
2. **Criar Contas de Teste** no MP para testar em ambiente sandbox
3. **Configurar URLs de Callback** para sucesso/erro no checkout
4. **Implementar Notificações** para usuário sobre cobranças e renovações
5. **Dashboard de Assinaturas** para usuário ver histórico de pagamentos

---

## 🐛 Troubleshooting

### Erro "Invalid users involved" (2034)
- Causa: Usando credenciais de teste com conta de produção
- Solução: Crie uma conta de teste no painel do MP

### Erro "Token expirado"
- Causa: card_token expira em 7 dias ou após uso
- Solução: Gerar novo token no checkout

### Erro "Cartão não reconhecido"
- Causa: BIN do cartão de teste não é reconhecido
- Solução: Use os cartões de teste oficiais do MP

### Cartões de Teste do Mercado Pago:
- Visa: `4509 9535 6623 3704` (aprovado)
- Mastercard: `5031 4332 1540 6351` (aprovado)
- CVV: `123`
- Validade: qualquer data futura
- CPF: `19119119100` (teste)
