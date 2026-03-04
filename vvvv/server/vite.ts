import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

// Derive __dirname from import.meta.url for ESM compatibility.
// import.meta.dirname only exists in Node >= 21.2 and is NOT resolved by esbuild,
// so we must use fileURLToPath(import.meta.url) which works everywhere.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const port = Number(process.env.PORT) || 5000;
  const hmrHost = process.env.HMR_HOST || "localhost";
  const serverOptions = {
    middlewareMode: true,
    hmr: {
      server,
      host: hmrHost,
      port,
      protocol: "ws",
      clientPort: port,
    },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        // process.exit(1); // Don't exit on vite errors
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Skip API routes - let Express handle them
    if (url.startsWith('/api/')) {
      return next();
    }

    // Skip serving React app for root route if user is not authenticated
    // This allows the static landing page to be served instead
    if (url === '/' && !req.headers.cookie?.includes('connect.sid')) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "..", "dist", "public");
  const legacyFindeasAssetsPath = path.resolve(distPath, "findeas-theme");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Backward compatibility for old public HTML that referenced /findeas-theme/assets/*
  if (fs.existsSync(legacyFindeasAssetsPath)) {
    app.use("/findeas-theme/assets", express.static(legacyFindeasAssetsPath));
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  // BUT skip API routes - let Express handle them
  app.use("*", (_req, res, next) => {
    const requestPath = (_req.originalUrl || _req.path || "").split("?")[0];
    const isApiRoute = requestPath.startsWith("/api/");
    const isStaticAssetRequest =
      requestPath.startsWith("/assets/") ||
      requestPath.startsWith("/findeas-theme/") ||
      requestPath.startsWith("/uploads/") ||
      /\.[a-zA-Z0-9]+$/.test(requestPath);

    if (isApiRoute || isStaticAssetRequest) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
