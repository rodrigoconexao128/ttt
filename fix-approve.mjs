import fs from 'fs';
import path from 'path';

const routesPath = path.join('server', 'routes.ts');
let content = fs.readFileSync(routesPath, 'utf8');

// Find the else block for confirmPixPayment 
const oldElse = `else {
            // 🆕 CRIAÇÃO: Criar novo cliente via confirmPixPayment
            const result = await resellerService.confirmPixPayment(receipt.mp_payment_id);
            if (result.success) {
              console.log(\`[ADMIN APPROVE] ✅ Cliente de revenda criado com sucesso:\`, {
                clientId: result.clientId,
                userId: result.userId,
              });
            } else {
              console.error(\`[ADMIN APPROVE] ⚠️ Erro ao criar cliente de revenda:\`, result.error);
              // "Pagamento já foi processado" → cliente já existe, não é erro fatal
              if (!result.error?.includes("processado") && !result.error?.includes("processada")) {
                console.error(\`[ADMIN APPROVE] Erro não fatal:\`, result.error);
              }
            }
          }`;

const idx = content.indexOf(oldElse);
if (idx === -1) {
    console.error('Could not find the old else block!');
    // Try to find it differently - search for unique part
    const marker = '🆕 CRIAÇÃO: Criar novo cliente via confirmPixPayment';
    const idx2 = content.indexOf(marker);
    console.log('Marker found at:', idx2);
    if (idx2 > -1) {
        console.log('Context:', content.slice(idx2 - 30, idx2 + 200));
    }
    process.exit(1);
}

console.log('Found old else block at idx:', idx);

const newElse = `else {
            // 🆕 CRIAÇÃO ou PAGAMENTO DE FATURA: Verificar se é pagamento de fatura do revendedor
            // Se o mp_payment_id começa com "reseller_invoice_", é um pagamento de fatura própria do revendedor
            if (receipt.mp_payment_id && receipt.mp_payment_id.startsWith('reseller_invoice_')) {
              console.log(\`[ADMIN APPROVE] 🧾 Detectado pagamento de fatura de revendedor: \${receipt.mp_payment_id}\`);
              // Extrai o ID da fatura do paymentId: reseller_invoice_{id}_{timestamp}
              const invoiceIdMatch = receipt.mp_payment_id.match(/^reseller_invoice_(\\d+)_/);
              if (invoiceIdMatch) {
                const invoiceId = parseInt(invoiceIdMatch[1]);
                try {
                  // Marcar a fatura como paga
                  await storage.updateResellerInvoice(invoiceId, {
                    status: 'paid',
                    paymentMethod: 'pix',
                    paidAt: new Date(),
                  });
                  console.log(\`[ADMIN APPROVE] ✅ Fatura \${invoiceId} marcada como paga\`);

                  // Buscar o revendedor pela fatura para atualizar status e liberar clientes
                  const invoice = await storage.getResellerInvoice(invoiceId);
                  if (invoice) {
                    // Atualizar status do revendedor para ativo
                    await storage.updateReseller(invoice.resellerId, { resellerStatus: 'active' });
                    console.log(\`[ADMIN APPROVE] ✅ Revendedor \${invoice.resellerId} ativado\`);

                    // Buscar e reativar todos os clientes suspensos do revendedor
                    const clients = await storage.getResellerClients(invoice.resellerId);
                    let clientsActivated = 0;
                    for (const client of clients) {
                      if (client.status === 'suspended' || client.saasStatus === 'suspended') {
                        const newExpiry = new Date();
                        newExpiry.setDate(newExpiry.getDate() + 30);
                        await storage.updateResellerClient(client.id, {
                          status: 'active',
                          saasStatus: 'active',
                          saasPaidUntil: newExpiry,
                        });
                        // Reativar assinatura do usuário no sistema
                        await supabase
                          .from('subscriptions')
                          .update({
                            status: 'active',
                            data_fim: newExpiry.toISOString(),
                            updated_at: new Date().toISOString(),
                          })
                          .eq('user_id', client.userId)
                          .in('status', ['suspended', 'overdue', 'pending']);
                        clientsActivated++;
                      }
                    }
                    console.log(\`[ADMIN APPROVE] ✅ \${clientsActivated} clientes reativados do revendedor \${invoice.resellerId}\`);
                  }
                } catch (invoiceError: any) {
                  console.error('[ADMIN APPROVE] Erro ao processar fatura de revendedor:', invoiceError);
                }
              }
            } else {
              // CRIAÇÃO: Criar novo cliente via confirmPixPayment
              const result = await resellerService.confirmPixPayment(receipt.mp_payment_id);
              if (result.success) {
                console.log(\`[ADMIN APPROVE] ✅ Cliente de revenda criado com sucesso:\`, {
                  clientId: result.clientId,
                  userId: result.userId,
                });
              } else {
                console.error(\`[ADMIN APPROVE] ⚠️ Erro ao criar cliente de revenda:\`, result.error);
                // "Pagamento já foi processado" → cliente já existe, não é erro fatal
                if (!result.error?.includes("processado") && !result.error?.includes("processada")) {
                  console.error(\`[ADMIN APPROVE] Erro não fatal:\`, result.error);
                }
              }
            }
          }`;

content = content.slice(0, idx) + newElse + content.slice(idx + oldElse.length);
fs.writeFileSync(routesPath, content, 'utf8');
console.log('Successfully updated admin approve route!');
