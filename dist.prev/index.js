// server/index.ts
import "dotenv/config";
var SERVICE_MODE = process.env.SERVICE_MODE || "monolith";
var BOOT_ID = (/* @__PURE__ */ new Date()).toISOString();
process.env.BOOT_ID = BOOT_ID;
console.log(`\u{1F680} [BOOT] Starting server (bootId=${BOOT_ID}) mode=${SERVICE_MODE}`);
console.log(`\u{1F680} [BOOT] node=${process.version} env=${process.env.NODE_ENV || "unknown"} port=${process.env.PORT || "unknown"}`);
console.log(`\u{1F680} [BOOT] railwayCommit=${process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT || "unknown"}`);
if (SERVICE_MODE === "proxy") {
  console.log("\u{1F504} [PROXY MODE] Loading lightweight proxy module...");
  import("./proxy-YL4VGF4S.js").then(({ startProxy }) => {
    startProxy();
  }).catch((err) => {
    console.error("\u274C [PROXY MODE] Failed to start proxy:", err);
    process.exit(1);
  });
} else {
  console.log(`\u{1F3D7}\uFE0F [${SERVICE_MODE.toUpperCase()} MODE] Loading full application...`);
  import("./full-app-JKW3CGRC.js").then(({ startFullApp }) => {
    startFullApp();
  }).catch((err) => {
    console.error(`\u274C [${SERVICE_MODE.toUpperCase()} MODE] Failed to start:`, err);
    process.exit(1);
  });
}
