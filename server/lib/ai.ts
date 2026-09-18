import { config } from "../config";
import type { ResumeData, TailoringResult } from "./resume";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface AiOutcome {
  text: string;
  provider: string;
  model: string;
}

/**
 * Thin multi-provider client. Only "echo" works without credentials; the
 * others require API keys supplied via .env (documented in README).
 */
export async function chat(messages: ChatMessage[], maxTokens = 3000): Promise<AiOutcome> {
  const { provider, model, apiKey } = config.ai;

  if (provider === "echo" || (!apiKey && provider !== "ollama")) {
    if (provider !== "echo") {
      throw new Error(
        `AI_PROVIDER=${provider} requires an API key in .env (AI_API_KEY). Or set AI_PROVIDER=echo.`
      );
    }
    throw new Error("ECHO_MODE");
  }

  if (provider === "openai") {
    return openaiChat(messages, maxTokens);
  }
  if (provider === "anthropic") {
    return anthropicChat(messages, maxTokens);
  }
  if (provider === "gemini") {
    return geminiChat(messages, maxTokens);
  }
  if (provider === "ollama") {
    return ollamaChat(messages, maxTokens);
  }
  throw new Error(`Unknown AI provider ${provider}`);
}

async function openaiChat(messages: ChatMessage[], maxTokens: number): Promise<AiOutcome> {
  const res = await fetch(`${config.ai.openaiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.ai.apiKey}`
    },
    body: JSON.stringify({
      model: config.ai.model || "gpt-4o-mini",
      messages,
      max_tokens: maxTokens,
      temperature: 0.3
    })
  });
  if (!res.ok) {
    throw new Error(`OpenAI API error ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = (await res.json()) as any;
  return {
    text: data?.choices?.[0]?.message?.content ?? "",
    provider: "openai",
    model: data?.model ?? config.ai.model
  };
}

async function anthropicChat(messages: ChatMessage[], maxTokens: number): Promise<AiOutcome> {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");
  const res = await fetch(`${config.ai.anthropicBaseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.ai.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: config.ai.model || "claude-sonnet-4-20250514",
      system,
      max_tokens: maxTokens,
      messages: rest.map((m) => ({ role: "user", content: m.content }))
    })
  });
  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = (await res.json()) as any;
  const text = (data?.content ?? []).map((c: any) => c?.text ?? "").join("");
  return { text, provider: "anthropic", model: data?.model ?? config.ai.model };
}

async function geminiChat(messages: ChatMessage[], maxTokens: number): Promise<AiOutcome> {
  const modelName = config.ai.model || "gemini-1.5-flash";
  const url = `${config.ai.geminiBaseUrl}/v1beta/models/${modelName}:generateContent?key=${config.ai.apiKey}`;
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: "user", parts: [{ text: m.content }] }));
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 }
    })
  });
  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = (await res.json()) as any;
  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: any) => p?.text ?? "")
    .join("");
  return { text, provider: "gemini", model: modelName };
}

async function ollamaChat(messages: ChatMessage[], maxTokens: number): Promise<AiOutcome> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ai.model || "llama3.1",
      messages,
      stream: false,
      options: { temperature: 0.3, num_predict: maxTokens }
    })
  });
  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = (await res.json()) as any;
  return { text: data?.message?.content ?? "", provider: "ollama", model: config.ai.model || "llama3.1" };
}

export const TAILOR_SYSTEM_PROMPT = `You are an expert technical resume writer helping a student tailor their resume to one specific job description.

Rules:
- Use ONLY facts present in the candidate's resume data. Never invent employers, degrees, dates, certifications, or metrics.
- Reordering, rephrasing bullet points to emphasize relevant experience, and adding a short professional summary are allowed.
- Emphasis should come from genuinely relevant experience; do not fabricate relevance.
- Output STRICT JSON only, no markdown fences, matching this TypeScript type:

interface TailoringResult {
  summary: string;            // 2-3 sentence professional summary aligned to the job
  skills: string[];           // flattened skill list, most job-relevant first
  projects: { name: string; tech: string; bullets: string[] }[];
  experience: { company: string; role: string; period: string; bullets: string[] }[];
  education: { degree: string; institution: string; period: string; details: string }[];
  keywordsAdded: string[];    // JD keywords that genuinely matched candidate evidence
  atsNotes: string;           // short note about ATS friendliness of the result
}`;

export function parseTailoringJson(text: string): TailoringResult | null {
  const cleaned = text.replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as TailoringResult;
  } catch {
    return null;
  }
}

export async function tailorResumeWithAi(
  resume: ResumeData,
  job: { title: string; company: string; description: string }
): Promise<{ result: TailoringResult; provider: string; model: string }> {
  const userPrompt = `Tailor this resume for the job below.

JOB TITLE: ${job.title}
COMPANY: ${job.company}
JOB DESCRIPTION:
${job.description.slice(0, 6000)}

CANDIDATE RESUME DATA (JSON):
${JSON.stringify(resume, null, 2)}`;

  const outcome = await chat([
    { role: "system", content: TAILOR_SYSTEM_PROMPT },
    { role: "user", content: userPrompt }
  ]);
  const parsed = parseTailoringJson(outcome.text);
  if (!parsed) {
    throw new Error("AI response could not be parsed as JSON tailoring result");
  }
  return { result: parsed, provider: outcome.provider, model: outcome.model };
}
