import fs from 'fs';
import path from 'path';

const routesPath = path.join('server', 'routes.ts');
const buf = fs.readFileSync(routesPath);
let content = buf.toString('utf8');

const elseBlockRegex = /(\s*\} else \{\s*\n\s*\/\/ [^\n]*CRIA[^\n]*confirmPixPayment[^\n]*\n\s*const result = await resellerService\.confirmPixPayment\(receipt\.mp_payment_id\);[\s\S]*?(?=\s*\} catch \(resellerError))/;

const match = elseBlockRegex.exec(content);
if (!match) {
    console.error('Could not find the else block!');
    process.exit(1);
}

const oldElse = match[0];
console.log('Found old else block, length:', oldElse.length);

const newElse = `
          } else {
            // 🆕 PAGAMENTO DE FATURA ou CRIAÇÃO DE CLIENTE
            // Se o mp_payment_id começa com "reseller_invoice_", é um pagamento de fatura do revendedor ao SaaS
            if (receipt.mp_payment_id && receipt.mp_payment_id.startsWith('reseller_invoice_')) {
              console.log(\`[ADMIN APPROVE] 🧾 Pagamento de fatura de revendedor: \${receipt.mp_payment_id}\`);
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

                  // Buscar o revendedor e ativar
                  const invoice = await storage.getResellerInvoice(invoiceId);
                  if (invoice) {
                    await storage.updateReseller(invoice.resellerId, { resellerStatus: 'active' });
                    console.log(\`[ADMIN APPROVE] ✅ Revendedor \${invoice.resellerId} ativado\`);

                    // Reativar clientes suspensos do revendedor
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
                        // Reativar assinatura do usuário
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
                    console.log(\`[ADMIN APPROVE] ✅ \${clientsActivated} clientes reativados\`);
                  }
                } catch (invoiceError: any) {
                  console.error('[ADMIN APPROVE] Erro ao processar fatura:', invoiceError);
                }
              }
            } else {
              // CRIAÇÃO: Criar novo cliente via confirmPixPayment
              const result = await resellerService.confirmPixPayment(receipt.mp_payment_id);
              if (result.success) {
                console.log(\`[ADMIN APPROVE] ✅ Cliente de revenda criado:\`, {
                  clientId: result.clientId,
                  userId: result.userId,
                });
              } else {
                console.error(\`[ADMIN APPROVE] ⚠️ Erro ao criar cliente:\`, result.error);
                if (!result.error?.includes("processado") && !result.error?.includes("processada")) {
                  console.error(\`[ADMIN APPROVE] Erro não fatal:\`, result.error);
                }
              }
            }
          }`;

const idx = content.indexOf(oldElse);
content = content.slice(0, idx) + newElse + content.slice(idx + oldElse.length);
fs.writeFileSync(routesPath, content, 'utf8');
console.log('Successfully updated admin approve route!');
