import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname, sep } from "node:path";
import { config } from "./config";
import { createApi, ensureDb } from "./api";

const app = new Hono();

app.route("/api", createApi());

const clientDist = join(process.cwd(), ".generated/client");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json"
};

app.get("*", async (c) => {
  const path = c.req.path;
  const safe = join(clientDist, path === "/" ? "index.html" : path);
  // Guard against path traversal (join can escape the dist dir with .. segments).
  if (existsSync(safe) && (safe === clientDist || safe.startsWith(clientDist + sep))) {
    const data = readFileSync(safe);
    // Content type must come from the file on disk, NOT the request path:
    // for "/" the path is "/" but the file served is index.html — serving it
    // as octet-stream makes browsers download the app instead of rendering it.
    const ext = extname(safe).toLowerCase();
    const contentType = MIME[ext] ?? "application/octet-stream";
    return c.body(data as unknown as Buffer, 200, { "Content-Type": contentType });
  }
  // SPA fallback
  const index = join(clientDist, "index.html");
  if (existsSync(index)) {
    return c.body(readFileSync(index) as unknown as Buffer, 200, { "Content-Type": "text/html" });
  }
  return c.text("Client build not found. Run `npm run build` first.", 404);
});

ensureDb().then(() => {
  serve({ fetch: app.fetch, port: config.port }, (info: any) => {
    console.log(`GradLaunch server listening on http://localhost:${info.port}`);
  });
}).catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
