import "dotenv/config";
import { db } from "./db";
import { resellerClients, resellerInvoices, resellerInvoiceItems } from "../shared/schema";
import { eq, and } from "drizzle-orm";

async function debugClient() {
  const clientId = "52389222-932e-4240-b530-3c830f4926cf";
  
  console.log("\n🔍 DEBUGGING CLIENT:", clientId);
  console.log("=".repeat(80));
  
  // 1. Buscar cliente
  const client = await db.query.resellerClients.findFirst({
    where: eq(resellerClients.id, clientId),
  });
  
  if (!client) {
    console.log("❌ Cliente não encontrado!");
    return;
  }
  
  console.log("\n📋 DADOS DO CLIENTE:");
  console.log("Status:", client.status);
  console.log("SaaS Status:", client.saasStatus);
  console.log("SaaS Paid Until:", client.saasPaidUntil);
  console.log("Next Payment Date:", client.nextPaymentDate);
  console.log("Monthly Cost:", client.monthlyCost);
  console.log("Is Free:", client.isFreeClient);
  console.log("Created:", client.createdAt);
  console.log("Activated:", client.activatedAt);
  
  // 2. Verificar se está vencido
  const now = new Date();
  const isExpired = client.saasPaidUntil ? new Date(client.saasPaidUntil) < now : true;
  console.log("\n✅ VALIDAÇÃO:");
  console.log("Data atual:", now.toISOString());
  console.log("Está vencido?", isExpired ? "SIM" : "NÃO");
  
  // 3. Buscar invoice_items deste cliente
  const invoiceItems = await db.query.resellerInvoiceItems.findMany({
    where: eq(resellerInvoiceItems.resellerClientId, clientId),
    with: {
      invoice: true,
    },
  });
  
  console.log("\n💳 INVOICE ITEMS:", invoiceItems.length);
  for (const item of invoiceItems) {
    console.log("\nItem:", item.id);
    console.log("  Amount:", item.amount);
    console.log("  Invoice ID:", item.resellerInvoiceId);
    console.log("  Invoice Status:", item.invoice?.status);
    console.log("  Invoice Paid At:", item.invoice?.paidAt);
    console.log("  Invoice Created:", item.invoice?.createdAt);
  }
  
  // 4. Filtrar apenas invoices pagas
  const paidItems = invoiceItems.filter(item => item.invoice?.status === 'paid');
  console.log("\n✅ INVOICES PAGAS:", paidItems.length);
  
  if (paidItems.length > 0) {
    const dates = paidItems.map(item => new Date(item.invoice!.paidAt!));
    const firstPayment = new Date(Math.min(...dates.map(d => d.getTime())));
    const lastPayment = new Date(Math.max(...dates.map(d => d.getTime())));
    
    console.log("Primeiro Pagamento:", firstPayment.toISOString());
    console.log("Último Pagamento:", lastPayment.toISOString());
    
    const monthsDiff = (now.getFullYear() - firstPayment.getFullYear()) * 12 + 
                       (now.getMonth() - firstPayment.getMonth());
    console.log("Meses no Sistema:", monthsDiff);
  }
  
  console.log("\n" + "=".repeat(80));
  process.exit(0);
}

debugClient().catch(console.error);
