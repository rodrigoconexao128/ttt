import { spawn } from "child_process";
import fs from "fs";
import path from "path";

type JsonRecord = Record<string, any>;

interface Job {
  name: string;
  command: string;
  reportPrefix?: string;
  env?: Record<string, string>;
}

interface JobResult {
  name: string;
  command: string;
  startedAt: string;
  durationMs: number;
  reportPath?: string;
}

interface TurnLike {
  client?: string;
  agent?: string;
  input?: string;
  output?: string;
  clientMessage?: string;
  agentReply?: string;
}

interface TurnAnalysis {
  turnCount: number;
  unnecessaryReaskEvents: number;
  contextLossEvents: number;
  hasContextLoss: boolean;
}

const ROOT = process.cwd();
const TEST_RESULTS_DIR = path.join(ROOT, "test-results");

const JOBS: Job[] = [
  {
    name: "simulate:admin-ia-vs-ia",
    command: "npm run simulate:admin-ia-vs-ia",
    reportPrefix: "admin-agent-ia-vs-ia-",
    env: {
      ADMIN_BENCHMARK_SKIP_DEMO: "1",
    },
  },
  {
    name: "simulate:admin-guided-flow",
    command: "npm run simulate:admin-guided-flow",
    reportPrefix: "admin-guided-flow-",
  },
  {
    name: "simulate:admin-module-matrix",
    command: "npm run simulate:admin-module-matrix",
    reportPrefix: "admin-module-matrix-",
  },
  {
    name: "audit:admin-delivery-claims",
    command: "npm run audit:admin-delivery-claims",
    reportPrefix: "admin-delivery-claims-audit-",
  },
  {
    name: "simulate:admin-real-db-flow",
    command: "npm run simulate:admin-real-db-flow",
    reportPrefix: "admin-real-db-flow-",
  },
];

function normalize(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTokenLink(text?: string): boolean {
  return /\/test\/[a-f0-9]{8,}/i.test(String(text || ""));
}

function hasQuestionBusiness(text: string): boolean {
  const n = normalize(text);
  return (
    n.includes("qual o nome do seu negocio") ||
    n.includes("me conta sobre o seu negocio") ||
    n.includes("nome do seu negocio")
  );
}

function hasQuestionBehavior(text: string): boolean {
  const n = normalize(text);
  return n.includes("agora me explica melhor") || n.includes("o que voce quer que o agente");
}

function hasQuestionWorkflow(text: string): boolean {
  const n = normalize(text);
  return (
    n.includes("vai trabalhar com agendamento") ||
    n.includes("quer follow-up automatico") ||
    n.includes("quer follow up automatico")
  );
}

function looksLikeBusinessAnswer(text: string): boolean {
  const n = normalize(text);
  return /\b(meu negocio|minha empresa|minha loja|sou da|sou do|sou de|eu vendo|trabalho com|restaurante|barbearia|clinica|salao|delivery|consultoria|loja)\b/.test(
    n,
  );
}

function looksLikeBehaviorAnswer(text: string): boolean {
  const n = normalize(text);
  return /\b(quero que|preciso que|responda|atenda|venda|agende|duvida|follow up|follow-up|comercial|humano)\b/.test(n);
}

function isLikelyQuestion(text: string): boolean {
  const n = normalize(text);
  return (
    String(text || "").includes("?") ||
    /^(como|qual|quanto|quando|onde|porque|por que|da pra|d[aá] para|pode|consigo|funciona)/.test(n)
  );
}

function looksLikeWorkflowAnswer(text: string): boolean {
  const n = normalize(text);
  const hasDirectWorkflowSignal =
    /\b(agendamento|nao uso agenda|nao vai usar agendamento|segunda|terca|quarta|quinta|sexta|sabado|domingo|das \d|pedido completo|fechar pedido|concluir pedido|follow up|follow-up)\b/.test(
      n,
    );
  const hasDeliveryOperationalSignal =
    /\bdelivery\b/.test(n) &&
    /\b(cardapio|pedido|fechar|concluir|upsell|horario|horarios)\b/.test(n) &&
    !isLikelyQuestion(text);

  return hasDirectWorkflowSignal || hasDeliveryOperationalSignal;
}

function extractTurns(raw: any): TurnLike[] {
  if (Array.isArray(raw?.turns)) return raw.turns;
  if (Array.isArray(raw?.transcript)) return raw.transcript;
  return [];
}

function analyzeTurns(turns: TurnLike[]): TurnAnalysis {
  let businessProvided = false;
  let behaviorProvided = false;
  let workflowProvided = false;
  let unnecessaryReaskEvents = 0;
  let contextLossEvents = 0;

  for (const turn of turns) {
    const client = String(turn.clientMessage || turn.client || turn.input || "");
    const agent = String(turn.agentReply || turn.agent || turn.output || "");

    if (looksLikeBusinessAnswer(client)) businessProvided = true;
    if (looksLikeBehaviorAnswer(client)) behaviorProvided = true;
    if (looksLikeWorkflowAnswer(client)) workflowProvided = true;

    if (businessProvided && hasQuestionBusiness(agent)) {
      unnecessaryReaskEvents += 1;
      contextLossEvents += 1;
    }

    if (behaviorProvided && hasQuestionBehavior(agent)) {
      unnecessaryReaskEvents += 1;
    }

    if (workflowProvided && (hasQuestionBusiness(agent) || hasQuestionBehavior(agent))) {
      contextLossEvents += 1;
    }

    if (normalize(agent).includes("tive uma lentidao aqui")) {
      contextLossEvents += 1;
    }
  }

  return {
    turnCount: turns.length,
    unnecessaryReaskEvents,
    contextLossEvents,
    hasContextLoss: contextLossEvents > 0,
  };
}

function safeRate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function loadJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function findLatestReport(prefix: string, sinceMs: number): string | undefined {
  if (!fs.existsSync(TEST_RESULTS_DIR)) return undefined;

  const candidates = fs
    .readdirSync(TEST_RESULTS_DIR)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .map((name) => {
      const fullPath = path.join(TEST_RESULTS_DIR, name);
      const stat = fs.statSync(fullPath);
      return { fullPath, mtimeMs: stat.mtimeMs };
    })
    .filter((item) => item.mtimeMs >= sinceMs - 5_000)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return candidates[0]?.fullPath;
}

function runCommand(command: string, extraEnv?: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        ...(extraEnv || {}),
      },
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`Command failed (${code}): ${command}`));
    });
  });
}

async function runJob(job: Job): Promise<JobResult> {
  const startedAtMs = Date.now();
  const startedAtIso = new Date(startedAtMs).toISOString();

  await runCommand(job.command, job.env);

  const durationMs = Date.now() - startedAtMs;
  const reportPath = job.reportPrefix ? findLatestReport(job.reportPrefix, startedAtMs) : undefined;

  return {
    name: job.name,
    command: job.command,
    startedAt: startedAtIso,
    durationMs,
    reportPath,
  };
}

function buildMarkdown(report: JsonRecord): string {
  const metrics = report.metrics;
  const threshold = report.thresholds;

  return [
    `# Benchmark Diario Admin - ${report.generatedAt}`,
    "",
    "## Status",
    `- alertTriggered: ${report.alertTriggered}`,
    `- false_success_rate: ${metrics.false_success_rate}`,
    `- wrong_link_rate: ${metrics.wrong_link_rate}`,
    `- wrong_user_binding_rate: ${metrics.wrong_user_binding_rate}`,
    "",
    "## Metricas",
    `- context_loss_rate: ${metrics.context_loss_rate}`,
    `- unnecessary_reask_rate: ${metrics.unnecessary_reask_rate}`,
    `- false_success_rate: ${metrics.false_success_rate}`,
    `- wrong_link_rate: ${metrics.wrong_link_rate}`,
    `- wrong_user_binding_rate: ${metrics.wrong_user_binding_rate}`,
    `- avg_completion_turns: ${metrics.avg_completion_turns}`,
    `- avg_latency_ms: ${metrics.avg_latency_ms}`,
    `- conversion_ready_rate: ${metrics.conversion_ready_rate}`,
    "",
    "## Thresholds",
    `- false_success_rate must be <= ${threshold.false_success_rate_max}`,
    "",
    "## Jobs",
    ...report.jobs.map(
      (job: JsonRecord) =>
        `- ${job.name}: ${job.durationMs}ms${job.reportPath ? ` | report: ${job.reportPath}` : ""}`,
    ),
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  fs.mkdirSync(TEST_RESULTS_DIR, { recursive: true });

  const jobResults: JobResult[] = [];
  for (const job of JOBS) {
    console.log(`\n[benchmark] running: ${job.name}`);
    const result = await runJob(job);
    jobResults.push(result);
  }

  const iaJob = jobResults.find((job) => job.name === "simulate:admin-ia-vs-ia");
  const guidedJob = jobResults.find((job) => job.name === "simulate:admin-guided-flow");
  const moduleJob = jobResults.find((job) => job.name === "simulate:admin-module-matrix");
  const auditJob = jobResults.find((job) => job.name === "audit:admin-delivery-claims");
  const realJob = jobResults.find((job) => job.name === "simulate:admin-real-db-flow");

  const iaData = iaJob?.reportPath ? loadJson(iaJob.reportPath) : [];
  const guidedData = guidedJob?.reportPath ? loadJson(guidedJob.reportPath) : {};
  const moduleData = moduleJob?.reportPath ? loadJson(moduleJob.reportPath) : {};
  const auditData = auditJob?.reportPath ? loadJson(auditJob.reportPath) : {};
  const realData = realJob?.reportPath ? loadJson(realJob.reportPath) : {};

  let totalCases = 0;
  let totalTurns = 0;
  let contextLossCases = 0;
  let unnecessaryReaskEvents = 0;

  let falseSuccessCount = 0;
  let wrongLinkCount = 0;
  let wrongUserBindingCount = 0;
  let conversionReadyCount = 0;

  const completionTurns: number[] = [];

  // IA vs IA
  if (Array.isArray(iaData)) {
    totalCases += iaData.length;

    for (const scenario of iaData) {
      const turns = extractTurns(scenario);
      const turnAnalysis = analyzeTurns(turns);

      totalTurns += turnAnalysis.turnCount;
      unnecessaryReaskEvents += turnAnalysis.unnecessaryReaskEvents;
      if (turnAnalysis.hasContextLoss) contextLossCases += 1;
      completionTurns.push(turnAnalysis.turnCount);

      const deterministic = Boolean(scenario.hasCredentials && scenario.hasDeterministicDelivery);
      const hasLink = turns.some((turn) => hasTokenLink(String(turn.agentReply || turn.agent || turn.output || "")));

      if (scenario.success && !deterministic) falseSuccessCount += 1;
      if (!hasLink || !scenario.hasDeterministicDelivery) wrongLinkCount += 1;
      if (deterministic) conversionReadyCount += 1;
    }
  }

  // Guided flow
  if (guidedData && typeof guidedData === "object") {
    const guidedSuccess = Boolean(guidedData?.summary?.success);
    totalCases += 1;
    if (guidedSuccess) conversionReadyCount += 1;
    if (!guidedSuccess) falseSuccessCount += 1;
  }

  // Module matrix
  const moduleResults: any[] = Array.isArray(moduleData?.results) ? moduleData.results : [];
  const moduleValidations: any[] = Array.isArray(moduleData?.validations) ? moduleData.validations : [];
  totalCases += moduleResults.length;

  for (const item of moduleResults) {
    const turns = extractTurns(item);
    const turnAnalysis = analyzeTurns(turns);

    totalTurns += turnAnalysis.turnCount;
    unnecessaryReaskEvents += turnAnalysis.unnecessaryReaskEvents;
    if (turnAnalysis.hasContextLoss) contextLossCases += 1;
    completionTurns.push(turnAnalysis.turnCount);

    const hasExpectedPanelPath = item.hasExpectedPanelPath !== false;
    const hasToken = Boolean(item?.tokenInfo?.token || item?.token);
    const hasLink = hasTokenLink(String(item?.response || ""));

    if (!hasExpectedPanelPath || !hasToken || !hasLink) {
      wrongLinkCount += 1;
    }

    if (item?.promptHasCompany === false) {
      wrongUserBindingCount += 1;
    }

    if (hasExpectedPanelPath && hasToken && hasLink) {
      conversionReadyCount += 1;
    }
  }

  if (moduleData?.success && moduleValidations.some((validation) => validation?.ok === false)) {
    falseSuccessCount += 1;
  }

  // Audit
  const suspiciousCount = Number(auditData?.suspiciousCount || 0);
  const scannedConversations = Number(auditData?.scannedConversations || 0);
  if (scannedConversations > 0) {
    wrongLinkCount += suspiciousCount;
  }

  // Real DB flow
  const realResults: any[] = Array.isArray(realData?.results) ? realData.results : [];
  totalCases += realResults.length;

  for (const result of realResults) {
    const turns = extractTurns(result);
    const turnAnalysis = analyzeTurns(turns);

    totalTurns += turnAnalysis.turnCount;
    unnecessaryReaskEvents += turnAnalysis.unnecessaryReaskEvents;
    if (turnAnalysis.hasContextLoss) contextLossCases += 1;
    completionTurns.push(turnAnalysis.turnCount);

    const expectedEmail = String(result?.expectedEmail || "").toLowerCase();
    const finalReply = String(result?.finalReply || "");
    const deterministic = Boolean(result?.deterministicDelivery);
    const hasExpectedEmail = expectedEmail ? finalReply.toLowerCase().includes(expectedEmail) : false;
    const hasLink = hasTokenLink(finalReply);

    if (result?.success && (!deterministic || !hasExpectedEmail || !hasLink)) {
      falseSuccessCount += 1;
    }

    if (!hasLink) wrongLinkCount += 1;
    if (!hasExpectedEmail) wrongUserBindingCount += 1;

    if (deterministic && hasExpectedEmail && hasLink) {
      conversionReadyCount += 1;
    }
  }

  const avgCompletionTurns = completionTurns.length
    ? Number((completionTurns.reduce((sum, value) => sum + value, 0) / completionTurns.length).toFixed(2))
    : 0;

  const avgLatencyMs = jobResults.length
    ? Number((jobResults.reduce((sum, job) => sum + job.durationMs, 0) / jobResults.length).toFixed(2))
    : 0;

  const metrics = {
    context_loss_rate: safeRate(contextLossCases, Math.max(totalCases, 1)),
    unnecessary_reask_rate: safeRate(unnecessaryReaskEvents, Math.max(totalTurns, 1)),
    false_success_rate: safeRate(falseSuccessCount, Math.max(totalCases, 1)),
    wrong_link_rate: safeRate(wrongLinkCount, Math.max(totalCases, 1)),
    wrong_user_binding_rate: safeRate(wrongUserBindingCount, Math.max(totalCases, 1)),
    avg_completion_turns: avgCompletionTurns,
    avg_latency_ms: avgLatencyMs,
    conversion_ready_rate: safeRate(conversionReadyCount, Math.max(totalCases, 1)),
  };

  const thresholds = {
    false_success_rate_max: 0,
  };

  const alertTriggered = metrics.false_success_rate > thresholds.false_success_rate_max;

  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.replace(/[:.]/g, "-");
  const reportPath = path.join(TEST_RESULTS_DIR, `admin-daily-benchmark-${stamp}.json`);
  const markdownPath = path.join(TEST_RESULTS_DIR, `admin-daily-benchmark-${stamp}.md`);

  const report = {
    generatedAt,
    totalCases,
    totalTurns,
    falseSuccessCount,
    wrongLinkCount,
    wrongUserBindingCount,
    conversionReadyCount,
    jobs: jobResults,
    metrics,
    thresholds,
    alertTriggered,
    sourceReports: {
      iaVsIa: iaJob?.reportPath,
      guidedFlow: guidedJob?.reportPath,
      moduleMatrix: moduleJob?.reportPath,
      deliveryAudit: auditJob?.reportPath,
      realDbFlow: realJob?.reportPath,
    },
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(markdownPath, buildMarkdown(report));

  console.log(`\n[benchmark] report: ${reportPath}`);
  console.log(`[benchmark] markdown: ${markdownPath}`);
  console.log(`[benchmark] metrics: ${JSON.stringify(metrics)}`);

  if (alertTriggered) {
    console.error("[benchmark] ALERT: false_success_rate acima do limite.");
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error("[benchmark] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
