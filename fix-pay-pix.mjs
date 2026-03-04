import fs from 'fs';
import path from 'path';

const routesPath = path.join('server', 'routes.ts');
let content = fs.readFileSync(routesPath, 'utf8');

// Find the pay-pix route and replace it
const oldRouteStart = 'app.post("/api/reseller/my-invoices/:invoiceId/pay-pix", isAuthenticated, async (req: any, res) => {';
const startIdx = content.indexOf(oldRouteStart);
if (startIdx === -1) {
    console.error('Could not find pay-pix route!');
    process.exit(1);
}

// Find the end of this route (next app. route definition)
// The route ends with the closing });
// Find the next route after this one
const searchFrom = startIdx + 100;
const nextRoutePattern = /\/\*\*\s*\n\s*\* Verificar status de pagamento de fatura/;
const match = nextRoutePattern.exec(content.slice(searchFrom));
if (!match) {
    console.error('Could not find end of pay-pix route!');
    process.exit(1);
}

const endIdx = searchFrom + match.index;
const oldRoute = content.slice(startIdx, endIdx);
console.log('Old route found, length:', oldRoute.length);
console.log('Old route starts:', oldRoute.substring(0, 100));
console.log('Old route ends:', oldRoute.slice(-100));

const newRoute = `app.post("/api/reseller/my-invoices/:invoiceId/pay-pix", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const invoiceId = parseInt(req.params.invoiceId);



      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }



      const invoice = await storage.getResellerInvoice(invoiceId);

      if (!invoice || invoice.resellerId !== reseller.id) {

        return res.status(404).json({ message: "Fatura não encontrada" });

      }



      if (invoice.status === 'paid') {

        return res.status(400).json({ message: "Esta fatura já foi paga" });

      }



      // Gerar PIX estático usando a chave PIX do sistema (sem depender do MercadoPago)

      const amount = parseFloat(String(invoice.totalAmount));

      const paymentId = \`reseller_invoice_\${invoice.id}_\${Date.now()}\`;

      const planDesc = \`Fatura \${invoice.referenceMonth} - \${reseller.companyName || 'Revendedor'}\`;

      const { pixCode, pixQrCode } = await generatePixQRCode({

        planNome: planDesc,

        valor: amount,

        subscriptionId: paymentId,

      });

      // pixQrCode é data URL: "data:image/png;base64,XXXXXX"

      // O frontend espera qrCodeBase64 sem o prefixo

      const base64Match = pixQrCode.match(/^data:image\\/[^;]+;base64,(.+)$/);

      const qrCodeBase64 = base64Match ? base64Match[1] : pixQrCode;



      // Salvar paymentId na fatura para rastrear

      await storage.updateResellerInvoice(invoiceId, {

        mpPaymentId: paymentId,

        paymentMethod: 'pix',

      });



      res.json({

        paymentId,

        qrCode: pixCode,

        qrCodeBase64,

        expirationDate: new Date(Date.now() + 30 * 60 * 1000).toISOString(),

        amount,

        referenceMonth: invoice.referenceMonth,

        isManualPix: true,

      });

    } catch (error: any) {

      console.error("Error generating PIX:", error);

      res.status(500).json({ message: "Erro ao gerar PIX" });

    }

  });



  `;

content = content.slice(0, startIdx) + newRoute + content.slice(endIdx);
fs.writeFileSync(routesPath, content, 'utf8');
console.log('Successfully updated pay-pix route!');
