export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function num(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export const config = {
  port: num("PORT", 8787),
  db: {
    url: process.env.DATABASE_URL || "file:.generated/db/placetrack.db",
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined
  },
  sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-me",
  corsOrigins: (process.env.CORS_ORIGINS ||
    "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  ai: {
    provider: (process.env.AI_PROVIDER || "echo") as
      | "openai"
      | "anthropic"
      | "gemini"
      | "ollama"
      | "echo",
    model: process.env.AI_MODEL || "",
    apiKey: process.env.AI_API_KEY || "",
    openaiBaseUrl:
      process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    anthropicBaseUrl:
      process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    geminiBaseUrl:
      process.env.GEMINI_BASE_URL ||
      "https://generativelanguage.googleapis.com"
  },
  integrations: {
    greenhouseToken: process.env.GREENHOUSE_TOKEN || "",
    workableToken: process.env.WORKABLE_TOKEN || "",
    remotiveEnabled: (process.env.REMOTIVE_ENABLED || "true") === "true"
  }
};
