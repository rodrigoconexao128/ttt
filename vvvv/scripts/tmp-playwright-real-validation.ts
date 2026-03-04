import "dotenv/config";
import { chromium } from "playwright";
import { storage } from "../server/storage";
import fs from "node:fs";
import path from "node:path";

function normalizeText(input: string): string {
  return String(input || "").replace(/\s+/g, " ").trim();
}

async function main() {
  const conversationId = process.argv[2] || "3c1f0098-239a-4aca-b0eb-cb320c382b83";
  const baseUrl = process.env.APP_URL || "https://agentezap.online";
  const adminEmail = process.env.ADMIN_EMAIL || "rodrigoconexao128@gmail.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "Ibira2019!";

  const dbMessages = await storage.getAdminMessages(conversationId);
  const expected = dbMessages
    .slice(-8)
    .map((m) => ({
      fromMe: Boolean(m.fromMe),
      isFromAgent: Boolean(m.isFromAgent),
      full: normalizeText(String(m.text || "")),
    }))
    .filter((m) => m.full.length > 0)
    .map((m) => ({ ...m, probe: m.full.length > 180 ? m.full.slice(0, 140) : m.full }));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/admin#conversations/${conversationId}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(1500);

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator('input[type="password"], input[name="password"]');

    if (await emailInput.first().isVisible().catch(() => false)) {
      await emailInput.first().fill(adminEmail);
      await passwordInput.first().fill(adminPassword);

      const submitBtn = page.locator('button:has-text("Entrar"), button:has-text("Login"), button[type="submit"]');
      await submitBtn.first().click();
      await page.waitForLoadState("networkidle", { timeout: 120000 });
    }

    await page.goto(`${baseUrl}/admin#conversations/${conversationId}`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(4000);

    const bodyText = normalizeText(await page.evaluate(() => document.body?.innerText || ""));

    const checks = expected.map((e, i) => ({
      turn: i + 1,
      fromMe: e.fromMe,
      isFromAgent: e.isFromAgent,
      probe: e.probe,
      foundInUi: bodyText.includes(normalizeText(e.probe)),
    }));

    const missing = checks.filter((c) => !c.foundInUi);
    const outDir = path.resolve("test-results");
    fs.mkdirSync(outDir, { recursive: true });
    const screenshotPath = path.join(outDir, `playwright-real-validation-${conversationId}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const report = {
      ok: missing.length === 0,
      conversationId,
      url: page.url(),
      expectedCount: expected.length,
      matchedCount: checks.length - missing.length,
      missingCount: missing.length,
      checks,
      missing,
      screenshotPath,
    };

    const reportPath = path.join(outDir, `playwright-real-validation-${conversationId}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error) }, null, 2));
  process.exit(1);
});
