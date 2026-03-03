import "./chunk-KFQGP6VL.js";

// server/adminConnectionFlows.ts
var backgroundQrJobs = /* @__PURE__ */ new Set();
var backgroundPairingJobs = /* @__PURE__ */ new Set();
var defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function extractQrBuffer(qrCodeData) {
  const trimmed = qrCodeData.trim();
  const base64 = trimmed.includes(",") ? trimmed.split(",")[1] : trimmed;
  if (!base64) return null;
  try {
    return Buffer.from(base64, "base64");
  } catch {
    return null;
  }
}
function pickProgressMessage(kind, tick) {
  if (kind === "pairing") {
    const msgs2 = [
      "\u{1F504} Gerando seu c\xF3digo de pareamento\u2026 s\xF3 um instante.",
      "\u23F3 Ainda gerando o c\xF3digo\u2026 j\xE1 j\xE1 te envio aqui.",
      "\u{1F4F2} Quase l\xE1\u2026 estou finalizando o c\xF3digo de 8 d\xEDgitos.",
      "\u2705 S\xF3 mais um pouquinho\u2026 mantendo a tentativa ativa."
    ];
    return msgs2[tick % msgs2.length];
  }
  const msgs = [
    "\u{1F4F1} Gerando seu QR Code agora\u2026 s\xF3 um instante.",
    "\u23F3 Ainda gerando o QR Code\u2026 pode aguardar mais um pouquinho.",
    "\u{1F504} Estou mantendo a tentativa ativa\u2026 j\xE1 j\xE1 te envio o QR Code.",
    "\u2705 Quase l\xE1\u2026 assim que aparecer eu envio automaticamente."
  ];
  return msgs[tick % msgs.length];
}
async function ensureQrCodeSentToClient(params) {
  const {
    userId,
    contactNumber,
    getConnectionByUserId,
    connectWhatsApp,
    sendText,
    sendImage,
    sleep = defaultSleep,
    now = Date.now,
    maxWaitMs = 18e4
  } = params;
  const existing = await getConnectionByUserId(userId);
  if (existing?.isConnected) {
    await sendText(
      "\u2705 Seu WhatsApp j\xE1 est\xE1 conectado e funcionando!\n\nSe quiser desconectar para gerar um novo QR Code, \xE9 s\xF3 digitar 'desconectar'."
    );
    return { alreadyConnected: true, sent: true };
  }
  await sendText(pickProgressMessage("qr", 0));
  try {
    await connectWhatsApp(userId);
  } catch {
  }
  const startedAt = now();
  let lastProgressAt = 0;
  let tick = 0;
  while (now() - startedAt < maxWaitMs) {
    await sleep(1e3);
    const conn = await getConnectionByUserId(userId);
    if (conn?.isConnected) {
      await sendText("\u2705 Conectado! Seu WhatsApp j\xE1 est\xE1 funcionando aqui.");
      return { alreadyConnected: false, sent: true };
    }
    if (conn?.qrCode) {
      const qrBuffer = extractQrBuffer(conn.qrCode);
      if (qrBuffer) {
        await sendImage(
          qrBuffer,
          "\u{1F4F1} Aqui est\xE1 o QR Code!\n\n1\uFE0F\u20E3 Abra o WhatsApp no celular\n2\uFE0F\u20E3 V\xE1 em Configura\xE7\xF5es > Aparelhos Conectados\n3\uFE0F\u20E3 Toque em 'Conectar Aparelho'\n4\uFE0F\u20E3 Escaneie este QR Code!\n\n\u23F0 O QR Code expira em alguns minutos!"
        );
        return { alreadyConnected: false, sent: true };
      }
    }
    const elapsed = now() - startedAt;
    if (elapsed - lastProgressAt >= 1e4) {
      tick += 1;
      lastProgressAt = elapsed;
      await sendText(pickProgressMessage("qr", tick));
    }
  }
  await sendText(
    "\u23F3 Ainda n\xE3o consegui gerar o QR Code por aqui, mas eu continuo tentando e te envio automaticamente assim que aparecer.\n\nSe preferir, eu tamb\xE9m posso conectar pelo c\xF3digo de 8 d\xEDgitos."
  );
  const jobKey = `qr:${userId}`;
  if (!backgroundQrJobs.has(jobKey)) {
    backgroundQrJobs.add(jobKey);
    (async () => {
      try {
        try {
          await connectWhatsApp(userId);
        } catch {
        }
        const bgStart = now();
        const bgMax = 10 * 6e4;
        while (now() - bgStart < bgMax) {
          await sleep(5e3);
          const conn = await getConnectionByUserId(userId);
          if (conn?.isConnected) {
            await sendText("\u2705 Conectado! Seu WhatsApp j\xE1 est\xE1 funcionando aqui.");
            return;
          }
          if (conn?.qrCode) {
            const qrBuffer = extractQrBuffer(conn.qrCode);
            if (qrBuffer) {
              await sendImage(
                qrBuffer,
                "\u{1F4F1} Aqui est\xE1 o QR Code!\n\n1\uFE0F\u20E3 Abra o WhatsApp no celular\n2\uFE0F\u20E3 V\xE1 em Configura\xE7\xF5es > Aparelhos Conectados\n3\uFE0F\u20E3 Toque em 'Conectar Aparelho'\n4\uFE0F\u20E3 Escaneie este QR Code!\n\n\u23F0 O QR Code expira em alguns minutos!"
              );
              return;
            }
          }
        }
      } finally {
        backgroundQrJobs.delete(jobKey);
      }
    })();
  }
  return { alreadyConnected: false, sent: false };
}
async function ensurePairingCodeSentToClient(params) {
  const {
    userId,
    contactNumber,
    getConnectionByUserId,
    requestPairingCode,
    sendText,
    sleep = defaultSleep,
    now = Date.now,
    maxAttempts = 6
  } = params;
  const existing = await getConnectionByUserId(userId);
  if (existing?.isConnected) {
    await sendText(
      "\u2705 Seu WhatsApp j\xE1 est\xE1 conectado e funcionando!\n\nSe quiser desconectar para gerar um novo c\xF3digo, \xE9 s\xF3 digitar 'desconectar'."
    );
    return { alreadyConnected: true, sent: true };
  }
  await sendText(pickProgressMessage("pairing", 0));
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const code = await requestPairingCode(userId, contactNumber);
    if (code) {
      const codeFormatted = code.match(/.{1,4}/g)?.join("-") || code;
      await sendText(
        `\u{1F511} Seu c\xF3digo de pareamento:

*${codeFormatted}*

Agora \xE9 s\xF3:
1\uFE0F\u20E3 Abrir o WhatsApp no celular
2\uFE0F\u20E3 Ir em Configura\xE7\xF5es > Aparelhos Conectados
3\uFE0F\u20E3 Tocar em "Conectar Aparelho"
4\uFE0F\u20E3 Tocar em "Conectar com n\xFAmero de telefone"
5\uFE0F\u20E3 Digitar esse c\xF3digo!

\u23F0 O c\xF3digo expira em alguns minutos, ent\xE3o use logo!`
      );
      return { alreadyConnected: false, sent: true, code };
    }
    await sendText(pickProgressMessage("pairing", attempt));
    await sleep(1e4);
  }
  await sendText(
    "\u23F3 N\xE3o consegui gerar o c\xF3digo de pareamento agora, mas vou continuar tentando.\n\nSe voc\xEA preferir, eu tamb\xE9m consigo conectar por QR Code."
  );
  const jobKey = `pairing:${userId}`;
  if (!backgroundPairingJobs.has(jobKey)) {
    backgroundPairingJobs.add(jobKey);
    (async () => {
      try {
        const bgStart = now();
        const bgMax = 10 * 6e4;
        let attempt = 0;
        while (now() - bgStart < bgMax) {
          attempt += 1;
          await sleep(15e3);
          const conn = await getConnectionByUserId(userId);
          if (conn?.isConnected) {
            await sendText("\u2705 Conectado! Seu WhatsApp j\xE1 est\xE1 funcionando aqui.");
            return;
          }
          const code = await requestPairingCode(userId, contactNumber);
          if (code) {
            const codeFormatted = code.match(/.{1,4}/g)?.join("-") || code;
            await sendText(
              `\u{1F511} Seu c\xF3digo de pareamento:

*${codeFormatted}*

Agora \xE9 s\xF3:
1\uFE0F\u20E3 Abrir o WhatsApp no celular
2\uFE0F\u20E3 Ir em Configura\xE7\xF5es > Aparelhos Conectados
3\uFE0F\u20E3 Tocar em "Conectar Aparelho"
4\uFE0F\u20E3 Tocar em "Conectar com n\xFAmero de telefone"
5\uFE0F\u20E3 Digitar esse c\xF3digo!

\u23F0 O c\xF3digo expira em alguns minutos, ent\xE3o use logo!`
            );
            return;
          }
          if (attempt >= 20) return;
        }
      } finally {
        backgroundPairingJobs.delete(jobKey);
      }
    })();
  }
  return { alreadyConnected: false, sent: false };
}
export {
  ensurePairingCodeSentToClient,
  ensureQrCodeSentToClient
};
