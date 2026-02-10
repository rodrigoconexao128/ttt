import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Derive __dirname from import.meta.url for ESM compatibility with esbuild bundles.
// import.meta.dirname only exists in Node >= 21.2 and is NOT resolved by esbuild.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure build-time envs (Supabase keys) are loaded from repo root
dotenv.config({ path: path.resolve(__dirname, ".env") });

export default defineConfig({
  // Load env from repo root (not client/) so Vite sees Supabase keys
  envDir: path.resolve(__dirname),
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL || 'https://bnfpcuzjvycudccycqqt.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY || ''),
  },
  plugins: [
    react(),
    ...(
      process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
        ? [
            // Plugins exclusivos do Replit (não devem quebrar build fora do Replit)
            ...(await import("@replit/vite-plugin-cartographer").then((m) => [m.cartographer()])),
            ...(await import("@replit/vite-plugin-dev-banner").then((m) => [m.devBanner()])),
            ...(
              await (async () => {
                try {
                  const mod = await import("@replit/vite-plugin-runtime-error-modal");
                  return [mod.default()];
                } catch {
                  return [];
                }
              })()
            ),
          ]
        : []
    ),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      allow: [path.resolve(__dirname)],
      deny: ["**/.*"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
