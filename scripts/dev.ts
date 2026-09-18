import { spawn } from "node:child_process";
import { ensureDb } from "../server/api";

async function main() {
  await ensureDb();
  console.log("[dev] Database ready.");

  const server = spawn(process.execPath, ["--import", "tsx/esm", "server/index.ts"], {
    stdio: "inherit",
    env: { ...process.env, PORT: process.env.PORT || "8787" }
  });

  const vite = spawn(process.execPath, [
    "node_modules/vite/bin/vite.js", "--port", process.env.VITE_PORT || "5173"
  ], { stdio: "inherit" });

  const shutdown = () => {
    server.kill();
    vite.kill();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  server.on("exit", (code) => { vite.kill(); process.exit(code ?? 0); });
  vite.on("exit", (code) => { server.kill(); process.exit(code ?? 0); });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
