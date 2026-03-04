# FASE 1 - PAGAMENTOS E ASSINATURAS (CRÍTICO)
## Checklist de Implementação

### 1.1 Fluxo "Já paguei" (cliente normal)
- [x] Botão "Já paguei" existe no modal de pagamento
- [x] Upload de comprovante funcionando
- [x] Salva em payment_receipts
- [ ] VERIFICAR: Aparece em Admin > Pagamentos (não só em Conversas)
- [ ] CORRIGIR: Se necessário, garantir visibilidade correta

### 1.2 Admin Pagamentos + menu completo
- [x] Menu lateral existe em todas as telas
- [x] Aba "Comprovantes PIX" existe
- [ ] VERIFICAR: Badge de notificação funcionando
- [ ] VERIFICAR: Listagem correta de comprovantes pendentes

### 1.3 Duplicidade e ativação do plano
- [x] Código para cancelar duplicados existe (routes.ts:11607)
- [x] Ativação automática na aprovação existe
- [ ] VERIFICAR: Cálculo de vigência (mensal = 30 dias, anual = 1 ano)
- [ ] CORRIGIR: Se houver erro no cálculo de datas

### 1.4 Revenda com PIX
- [x] Página de revenda existe
- [ ] VERIFICAR: QR Code PIX gerando na revenda
- [ ] VERIFICAR: Botão "Já paguei" na revenda
- [ ] VERIFICAR: Comprovante aparece em Admin > Pagamentos
- [ ] VERIFICAR: Aprovação libera cliente do revendedor

## Arquivos Principais

### Server (Backend)
- `server/routes.ts` - Rotas de API (payment-receipts, admin)
- `server/pixService.ts` - Geração de QR Code PIX
- `server/resellerService.ts` - Lógica de revenda
- `server/storage.ts` - Operações de banco

### Client (Frontend)
- `client/src/pages/admin.tsx` - Painel admin
- `client/src/pages/plans.tsx` - Página de planos
- `client/src/pages/reseller.tsx` - Painel do revendedor
- `client/src/components/subscribe-modal.tsx` - Modal de pagamento

## Credenciais de Teste
- Cliente normal: rodrigo4@gmail.com / Ibira2019!
- Admin: rodrigoconexao128@gmail.com / Ibira2019!

## Testes a Realizar

### Teste 1: Fluxo Cliente Normal
1. Login como cliente normal
2. Ir em Planos
3. Selecionar plano
4. Gerar PIX
5. Clicar "Já paguei"
6. Enviar comprovante
7. Verificar se aparece em Admin > Pagamentos

### Teste 2: Aprovação no Admin
1. Login como admin
2. Ir em Admin > Pagamentos
3. Aprovar comprovante
4. Verificar se plano foi ativado
5. Verificar cálculo de vigência

### Teste 3: Revenda
1. Login como revendedor
2. Criar cliente
3. Gerar PIX
4. Verificar botão "Já paguei"
5. Enviar comprovante
6. Verificar em Admin > Pagamentos
7. Aprovar e verificar liberação

## Anotações de Implementação

### Data: 2025-02-18
- Sistema já tem estrutura base implementada
- Precisa verificar se há bugs nas integrações
- Focar em testes e correções pontuais
