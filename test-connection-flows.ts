import assert from "assert";
import { ensurePairingCodeSentToClient, ensureQrCodeSentToClient } from "./server/adminConnectionFlows";

async function runTests() {
  const results: Array<{ name: string; ok: boolean; error?: any }> = [];

  // Test 1: QR flow eventually sends QR without asking user to retry.
  {
    const name = "QR: envia quando qrCode aparece";
    try {
      let t = 0;
      const now = () => t;
      const sleep = async (ms: number) => {
        t += ms;
      };

      let polls = 0;
      const texts: string[] = [];
      let imageSent: { caption: string; size: number } | null = null;

      const res = await ensureQrCodeSentToClient({
        userId: "u1",
        contactNumber: "5511999999999",
        connectWhatsApp: async () => undefined,
        getConnectionByUserId: async () => {
          polls += 1;
          if (polls < 4) return { isConnected: false, qrCode: null };
          const base64 = Buffer.from("not-a-real-png").toString("base64");
          return { isConnected: false, qrCode: `data:image/png;base64,${base64}` };
        },
        sendText: async (text) => {
          texts.push(text);
        },
        sendImage: async (image, caption) => {
          imageSent = { caption, size: image.length };
        },
        sleep,
        now,
        maxWaitMs: 60_000,
      });

      assert.strictEqual(res.sent, true);
      assert.ok(imageSent, "Expected image to be sent");
      assert.ok(texts.length >= 1, "Expected progress messages");
      assert.ok(!texts.join("\n").toLowerCase().includes("tentar de novo"));
      assert.ok(!texts.join("\n").toLowerCase().includes("quer tentar"));

      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error });
    }
  }

  // Test 2: QR flow exits early when already connected.
  {
    const name = "QR: se já conectado, avisa e não tenta conectar";
    try {
      let connectCalls = 0;
      const texts: string[] = [];

      const res = await ensureQrCodeSentToClient({
        userId: "u2",
        contactNumber: "5511888888888",
        connectWhatsApp: async () => {
          connectCalls += 1;
        },
        getConnectionByUserId: async () => ({ isConnected: true, qrCode: null }),
        sendText: async (text) => {
          texts.push(text);
        },
        sendImage: async () => {
          throw new Error("should not send image when connected");
        },
        maxWaitMs: 5_000,
      });

      assert.strictEqual(res.alreadyConnected, true);
      assert.strictEqual(res.sent, true);
      assert.strictEqual(connectCalls, 0);
      assert.ok(texts[0]?.includes("já está conectado"));

      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error });
    }
  }

  // Test 3: Pairing flow retries and eventually sends code.
  {
    const name = "PAIRING: tenta múltiplas vezes e envia código";
    try {
      let t = 0;
      const now = () => t;
      const sleep = async (ms: number) => {
        t += ms;
      };

      let attempts = 0;
      const texts: string[] = [];

      const res = await ensurePairingCodeSentToClient({
        userId: "u3",
        contactNumber: "5511777777777",
        getConnectionByUserId: async () => ({ isConnected: false }),
        requestPairingCode: async () => {
          attempts += 1;
          if (attempts < 3) return null;
          return "12345678";
        },
        sendText: async (text) => {
          texts.push(text);
        },
        sleep,
        now,
        maxAttempts: 5,
      });

      assert.strictEqual(res.sent, true);
      assert.ok(texts.join("\n").includes("1234-5678"));
      assert.ok(!texts.join("\n").toLowerCase().includes("tentar de novo"));
      assert.ok(!texts.join("\n").toLowerCase().includes("pode tentar"));

      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error });
    }
  }

  // Print summary
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(`${r.ok ? "✅" : "❌"} ${r.name}`);
    if (!r.ok) {
      // eslint-disable-next-line no-console
      console.error(r.error);
    }
  }

  if (failed.length) {
    throw new Error(`${failed.length} test(s) failed`);
  }
}

runTests().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
