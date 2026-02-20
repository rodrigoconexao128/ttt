/**
 * Proxy Reverso para arquitetura de 2 serviços.
 * 
 * Este módulo implementa um proxy HTTP + WebSocket que encaminha
 * todo o tráfego para o Worker Service (que roda o app completo).
 * 
 * O Web Service (proxy) não tem volume, deploy é instantâneo (~5s).
 * O Worker Service tem volume com sessões WhatsApp e raramente reinicia.
 * 
 * Fluxo: Usuário → Web (proxy) → Worker (app completo)
 */
import http from 'http';
import https from 'https';

const SERVICE_NAME = 'WA-PROXY';

// Configuração do Worker
const WORKER_URL = process.env.WA_WORKER_URL || 'http://wa-worker.railway.internal:5000';
const WORKER = new URL(WORKER_URL);
const WORKER_HOSTNAME = WORKER.hostname;
const WORKER_PORT = parseInt(WORKER.port) || 5000;
const WORKER_PROTOCOL = WORKER.protocol === 'https:' ? https : http;

const PORT = parseInt(process.env.PORT || '5000', 10);

// Retry config para quando Worker está reiniciando
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

// Estatísticas
let totalRequests = 0;
let totalErrors = 0;
let totalWsUpgrades = 0;
let startTime = Date.now();

function logInfo(msg: string) {
  console.log(`🔄 [${SERVICE_NAME}] ${msg}`);
}

function logError(msg: string) {
  console.error(`❌ [${SERVICE_NAME}] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Proxy HTTP request para o Worker
 */
function proxyRequest(
  clientReq: http.IncomingMessage,
  clientRes: http.ServerResponse,
  retryCount = 0
) {
  totalRequests++;

  const options: http.RequestOptions = {
    hostname: WORKER_HOSTNAME,
    port: WORKER_PORT,
    path: clientReq.url,
    method: clientReq.method,
    headers: {
      ...clientReq.headers,
      // Preservar host original para que o Worker saiba o domínio público
      'x-forwarded-host': clientReq.headers.host || '',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': clientReq.socket.remoteAddress || '',
      // Mudar host para o Worker
      host: `${WORKER_HOSTNAME}:${WORKER_PORT}`,
    },
    // Timeout de 120s para requests longos (uploads, bulk messages)
    timeout: 120000,
  };

  const proxyReq = (WORKER_PROTOCOL as typeof http).request(options, (proxyRes) => {
    // Copiar status e headers do Worker para o cliente
    const headers = { ...proxyRes.headers };
    
    // Remover headers que podem causar conflito
    delete headers['transfer-encoding']; // Se necessário, Node.js gerencia
    
    try {
      clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(clientRes, { end: true });
    } catch (err: any) {
      logError(`Response write error: ${err.message}`);
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!clientRes.headersSent) {
      clientRes.writeHead(504, { 'Content-Type': 'application/json' });
      clientRes.end(JSON.stringify({ error: 'Worker timeout', service: SERVICE_NAME }));
    }
  });

  proxyReq.on('error', async (err: any) => {
    totalErrors++;
    
    // Retry em caso de connection refused (Worker reiniciando)
    if (retryCount < MAX_RETRIES && (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET')) {
      logError(`Connection to Worker failed (attempt ${retryCount + 1}/${MAX_RETRIES}): ${err.code}`);
      await sleep(RETRY_DELAY_MS);
      // Reconstituir body para retry não é trivial com streams, então só retentamos GETs
      if (clientReq.method === 'GET' || clientReq.method === 'HEAD') {
        proxyRequest(clientReq, clientRes, retryCount + 1);
        return;
      }
    }

    if (!clientRes.headersSent) {
      const status = err.code === 'ECONNREFUSED' ? 503 : 502;
      clientRes.writeHead(status, { 'Content-Type': 'application/json' });
      clientRes.end(JSON.stringify({
        error: 'Worker unavailable',
        detail: err.code || err.message,
        service: SERVICE_NAME,
        hint: 'O Worker Service pode estar reiniciando. Tente novamente em alguns segundos.',
      }));
    }
  });

  // Pipe do body do cliente para o Worker
  clientReq.pipe(proxyReq, { end: true });
}

/**
 * Proxy WebSocket upgrade para o Worker
 */
function proxyWebSocket(
  clientReq: http.IncomingMessage,
  clientSocket: import('stream').Duplex,
  head: Buffer
) {
  totalWsUpgrades++;
  logInfo(`WebSocket upgrade: ${clientReq.url} from ${clientReq.socket.remoteAddress}`);

  const options: http.RequestOptions = {
    hostname: WORKER_HOSTNAME,
    port: WORKER_PORT,
    path: clientReq.url,
    method: 'GET',
    headers: {
      ...clientReq.headers,
      host: `${WORKER_HOSTNAME}:${WORKER_PORT}`,
      'x-forwarded-host': clientReq.headers.host || '',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': clientReq.socket.remoteAddress || '',
    },
  };

  const proxyReq = (WORKER_PROTOCOL as typeof http).request(options);

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    // Montar resposta 101 Switching Protocols
    let response = `HTTP/1.1 101 Switching Protocols\r\n`;
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (value !== undefined) {
        const val = Array.isArray(value) ? value.join(', ') : value;
        response += `${key}: ${val}\r\n`;
      }
    }
    response += '\r\n';

    try {
      clientSocket.write(response);
      if (proxyHead && proxyHead.length > 0) {
        clientSocket.write(proxyHead);
      }

      // Enable TCP keepalive to prevent Railway/infrastructure idle timeouts
      if (typeof (clientSocket as any).setKeepAlive === 'function') {
        (clientSocket as any).setKeepAlive(true, 30000);
      }
      if (typeof (proxySocket as any).setKeepAlive === 'function') {
        (proxySocket as any).setKeepAlive(true, 30000);
      }

      // Bidirecional: proxy ↔ client
      proxySocket.pipe(clientSocket);
      clientSocket.pipe(proxySocket);

      // Cleanup
      proxySocket.on('error', (err: any) => {
        if (err.code !== 'ECONNRESET') logError(`Worker WS error: ${err.message}`);
        clientSocket.destroy();
      });
      clientSocket.on('error', (err: any) => {
        if (err.code !== 'ECONNRESET') logError(`Client WS error: ${err.message}`);
        proxySocket.destroy();
      });
      proxySocket.on('end', () => clientSocket.end());
      clientSocket.on('end', () => proxySocket.end());
    } catch (err: any) {
      logError(`WS connection setup error: ${err.message}`);
      clientSocket.destroy();
      proxySocket.destroy();
    }
  });

  proxyReq.on('error', (err: any) => {
    totalErrors++;
    logError(`WebSocket proxy error: ${err.message} (${err.code})`);
    try {
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    } catch {}
    clientSocket.destroy();
  });

  // Se o Worker não aceitar o upgrade, ele retorna uma resposta normal
  proxyReq.on('response', (proxyRes) => {
    logError(`WebSocket upgrade rejected by Worker: ${proxyRes.statusCode}`);
    let response = `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`;
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (value !== undefined) {
        const val = Array.isArray(value) ? value.join(', ') : value;
        response += `${key}: ${val}\r\n`;
      }
    }
    response += '\r\n';
    clientSocket.write(response);
    proxyRes.pipe(clientSocket);
  });

  if (head && head.length > 0) {
    proxyReq.write(head);
  }
  proxyReq.end();
}

/**
 * Inicia o proxy server
 */
export function startProxy() {
  logInfo(`Starting proxy server...`);
  logInfo(`Worker URL: ${WORKER_URL}`);

  const server = http.createServer((req, res) => {
    // Health check local (não depende do Worker)
    if (req.url === '/health' || req.url === '/healthz') {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        service: SERVICE_NAME,
        mode: 'proxy',
        worker: WORKER_URL,
        uptime: `${uptime}s`,
        stats: {
          totalRequests,
          totalErrors,
          totalWsUpgrades,
        },
      }));
      return;
    }

    // Proxy status endpoint
    if (req.url === '/proxy-status') {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        service: SERVICE_NAME,
        mode: 'proxy',
        worker: WORKER_URL,
        uptime: `${uptime}s`,
        stats: {
          totalRequests,
          totalErrors,
          totalWsUpgrades,
          errorRate: totalRequests > 0 ? `${((totalErrors / totalRequests) * 100).toFixed(2)}%` : '0%',
        },
      }));
      return;
    }

    // Proxy tudo para o Worker
    proxyRequest(req, res);
  });

  // WebSocket upgrade
  server.on('upgrade', (req, socket, head) => {
    proxyWebSocket(req, socket, head);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logInfo(`Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      logInfo('Proxy server closed.');
      process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => {
      logError('Forced exit after 10s timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(PORT, '0.0.0.0', () => {
    logInfo(`✅ Proxy server listening on port ${PORT}`);
    logInfo(`✅ Forwarding all traffic to ${WORKER_URL}`);
    logInfo(`✅ Health check: http://0.0.0.0:${PORT}/health`);
    logInfo(`✅ Proxy stats: http://0.0.0.0:${PORT}/proxy-status`);
  });
}
