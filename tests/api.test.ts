import { describe, expect, it, beforeAll } from "vitest";
import { Hono } from "hono";
import { createClient } from "@libsql/client";
import { setDbForTests, initDb } from "../server/lib/db";
import { createApi } from "../server/api";
import { extractPdfText } from "../server/lib/pdf";
import { buildResumePdf } from "../server/lib/pdf";

const client = createClient({ url: ":memory:" });
setDbForTests(client);

const app = new Hono();
app.route("/api", createApi());

async function call(method: string, path: string, body?: any, cookie?: string) {
  const res = await app.request(`/api${path}`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) } } : (cookie ? { headers: { Cookie: cookie } } : {}))
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* binary or empty */ }
  return { status: res.status, json, res };
}

function cookieOf(res: Response): string {
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

let userA = "";
let userB = "";

beforeAll(async () => {
  await initDb();
  const suA = await call("POST", "/auth/signup", { email: "a@test.dev", password: "password123", full_name: "User A" });
  expect(suA.status).toBe(201);
  userA = cookieOf(suA.res);

  const suB = await call("POST", "/auth/signup", { email: "b@test.dev", password: "password123", full_name: "User B" });
  expect(suB.status).toBe(201);
  userB = cookieOf(suB.res);
});

describe("auth", () => {
  it("rejects wrong password", async () => {
    const r = await call("POST", "/auth/login", { email: "a@test.dev", password: "wrong-password" });
    expect(r.status).toBe(401);
  });

  it("rejects duplicate signup", async () => {
    const r = await call("POST", "/auth/signup", { email: "a@test.dev", password: "password123", full_name: "X" });
    expect(r.status).toBe(409);
  });

  it("returns 401 without session", async () => {
    const r = await call("GET", "/applications");
    expect(r.status).toBe(401);
  });
});

describe("profile", () => {
  it("saves profile fields", async () => {
    const r = await call("PUT", "/profile", { skills: "python, react", grad_year: 2026, profile_completed: true }, userA);
    expect(r.status).toBe(200);
    expect(r.json.user.skills).toBe("python, react");
    expect(r.json.user.grad_year).toBe(2026);
    expect(r.json.user.password_hash).toBeUndefined();
  });
});

describe("applications + privacy", () => {
  let appIdA = 0;

  it("creates application for user A", async () => {
    const r = await call("POST", "/applications", {
      company: "Acme", job_title: "Backend Engineer",
      job_description: "python and docker", status: "applied", date_applied: "2026-09-01"
    }, userA);
    expect(r.status).toBe(201);
    appIdA = r.json.application.id;
    expect(r.json.application.status).toBe("applied");
  });

  it("user B cannot see or modify user A's application", async () => {
    const get = await call("GET", `/applications/${appIdA}`, undefined, userB);
    expect(get.status).toBe(404);

    const patch = await call("PATCH", `/applications/${appIdA}`, { status: "rejected" }, userB);
    expect(patch.status).toBe(404);

    const del = await call("DELETE", `/applications/${appIdA}`, undefined, userB);
    expect(del.status).toBe(200);
    const still = await call("GET", `/applications/${appIdA}`, undefined, userA);
    expect(still.status).toBe(200);
  });

  it("list endpoint only returns own applications", async () => {
    const listB = await call("GET", "/applications", undefined, userB);
    expect(listB.json.applications).toHaveLength(0);
    const listA = await call("GET", "/applications", undefined, userA);
    expect(listA.json.applications).toHaveLength(1);
  });

  it("status change records history with previous status", async () => {
    const r = await call("PATCH", `/applications/${appIdA}`, { status: "shortlisted", status_note: "Recruiter called" }, userA);
    expect(r.status).toBe(200);
    const h = await call("GET", `/applications/${appIdA}/history`, undefined, userA);
    expect(h.json.history.length).toBeGreaterThanOrEqual(2);
    const last = h.json.history.at(-1);
    expect(last.previous_status).toBe("applied");
    expect(last.new_status).toBe("shortlisted");
    expect(last.notes).toBe("Recruiter called");
  });

  it("rejects invalid status values", async () => {
    const r = await call("PATCH", `/applications/${appIdA}`, { status: "super_hired" }, userA);
    expect(r.status).toBe(400);
  });
});

describe("events", () => {
  it("creates and lists events per user", async () => {
    const r = await call("POST", "/events", { title: "Tech interview", event_type: "interview", event_date: "2026-10-01", event_time: "10:00" }, userA);
    expect(r.status).toBe(201);
    const list = await call("GET", "/events?from=2026-09-01&to=2026-10-31", undefined, userA);
    expect(list.json.events.some((e: any) => e.title === "Tech interview")).toBe(true);
    const listB = await call("GET", "/events", undefined, userB);
    expect(listB.json.events).toHaveLength(0);
  });
});

describe("resumes + tailoring", () => {
  let resumeId = 0;
  let tailoredId = 0;

  it("uploads and parses a TXT resume", async () => {
    const form = new FormData();
    const text = "Test User\ntest@example.com\n\nSkills\npython, sql, docker\n\nProjects\nDemo | python\n- Built a thing";
    form.append("file", new Blob([text], { type: "text/plain" }), "resume.txt");
    const res = await app.request("/api/resumes", { method: "POST", body: form, headers: { Cookie: userA } });
    expect(res.status).toBe(201);
    const json: any = await res.json();
    resumeId = json.resume.id;
    expect(json.resume.parsed.skills).toContain("python");
  });

  it("rejects unsupported file types", async () => {
    const form = new FormData();
    form.append("file", new Blob(["PK fake"], { type: "application/zip" }), "virus.zip");
    const res = await app.request("/api/resumes", { method: "POST", body: form, headers: { Cookie: userA } });
    expect(res.status).toBe(400);
  });

  it("keeps resumes private between users", async () => {
    const r = await call("GET", `/resumes/${resumeId}`, undefined, userB);
    expect(r.status).toBe(404);
  });

  it("tailors a resume for an application (echo mode) and stores it as a new version", async () => {
    const appData = await call("GET", "/applications", undefined, userA);
    const appId = (appData.json as any).applications[0].id;
    const r = await call("POST", "/tailor", { resume_id: resumeId, application_id: appId }, userA);
    expect(r.status).toBe(201);
    expect((r.json as any).used_echo).toBe(true);
    tailoredId = (r.json as any).resume_id;
    expect(tailoredId).not.toBe(resumeId);
  });

  it("serves a generated PDF for the tailored resume", async () => {
    const res = await app.request(`/api/resumes/${tailoredId}/pdf`, { headers: { Cookie: userA } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const extracted = await extractPdfText(bytes);
    expect(extracted.text).toContain("Test User");
    expect(extracted.pages).toBeGreaterThanOrEqual(1);
  });

  it("blocks other users from downloading resumes", async () => {
    const res = await app.request(`/api/resumes/${tailoredId}/pdf`, { headers: { Cookie: userB } });
    expect(res.status).toBe(404);
  });
});

describe("dashboard", () => {
  it("returns cards and funnel for the session user", async () => {
    const r = await call("GET", "/dashboard", undefined, userA);
    expect(r.status).toBe(200);
    expect(r.json.cards.total).toBe(1);
    expect(r.json.funnel.shortlist).toBe(1);
    expect(r.json.activity.length).toBeGreaterThan(0);
  });

  it("dashboard reflects updates", async () => {
    const list = await call("GET", "/applications", undefined, userA);
    const id = list.json.applications[0].id;
    await call("PATCH", `/applications/${id}`, { status: "offer_received" }, userA);
    const r = await call("GET", "/dashboard", undefined, userA);
    expect(r.json.cards.offers).toBe(1);
  });
});

describe("pdf round trip", () => {
  it("extracts text it wrote", async () => {
    const pdf = await buildResumePdf({
      owner: "Round Trip", headline: "QA", email: "rt@example.com", phone: "123", location: "Web",
      links: ["https://github.com/rt"], summary: "Testing PDFs.",
      skills: ["vitest"], projects: [], experience: [],
      education: [{ degree: "B.Tech", institution: "Testing University", period: "2026", details: "" }]
    });
    const { text } = await extractPdfText(pdf);
    expect(text).toContain("ROUND TRIP");
    expect(text).toContain("B.Tech");
  });
});

describe("docx resumes", () => {
  it("uploads, parses and re-downloads a DOCX resume", async () => {
    const { buildMinimalDocx, DOCX_MIME } = await import("../server/lib/docx");
    const docx = buildMinimalDocx([
      "Docx Upload User",
      "docx.uploader@example.com | +91 90000 00001",
      "Skills",
      "python, sql, docker, react",
      "Projects",
      "Docx Demo | python",
      "- Built a docx-parsed thing"
    ]);
    const form = new FormData();
    form.append("file", new Blob([docx as any], { type: DOCX_MIME }), "resume.docx");
    const res = await app.request("/api/resumes", { method: "POST", body: form, headers: { Cookie: userA } });
    expect(res.status).toBe(201);
    const json: any = await res.json();
    expect(json.resume.parsed.skills).toContain("python");
    expect(json.resume.parsed.owner).toBe("Docx Upload User");

    // Round trip: the stored file downloads as a real docx of the same bytes.
    const dl = await app.request(`/api/resumes/${json.resume.id}/download`, { headers: { Cookie: userA } });
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toBe(DOCX_MIME);
    const back = new Uint8Array(await dl.arrayBuffer());
    expect(back.length).toBe(docx.length);
    expect(Buffer.from(back).equals(Buffer.from(docx))).toBe(true);
  });

  it("rejects a corrupted docx with a clear error", async () => {
    const form = new FormData();
    form.append("file", new Blob(["PK\u0003\u0004 garbage, not a real zip"], { type: "application/octet-stream" }), "broken.docx");
    const res = await app.request("/api/resumes", { method: "POST", body: form, headers: { Cookie: userA } });
    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.error).toContain("DOCX");
  });

  it("still rejects unsupported types like .zip", async () => {
    const form = new FormData();
    form.append("file", new Blob(["PK fake"], { type: "application/zip" }), "archive.zip");
    const res = await app.request("/api/resumes", { method: "POST", body: form, headers: { Cookie: userA } });
    expect(res.status).toBe(400);
  });
});

describe("reminders", () => {
  const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  it("derives reminders from upcoming events and open deadlines", async () => {
    // Application with a deadline 4 days out (inside the 7-day horizon).
    const appResp = await call("POST", "/applications", {
      company: "ReminderCorp", job_title: "Backend Engineer",
      status: "applied", deadline_at: inDays(4)
    }, userA);
    expect(appResp.status).toBe(201);

    // Event inside the window (interview 2 days out).
    const ev = await call("POST", "/events", { title: "ReminderCorp tech interview", event_type: "interview", event_date: inDays(2), event_time: "11:00" }, userA);
    expect(ev.status).toBe(201);

    const r = await call("GET", "/reminders", undefined, userA);
    expect(r.status).toBe(200);
    const list = r.json.reminders as any[];
    const interview = list.find((x) => x.source === "event" && x.title.includes("ReminderCorp tech interview"));
    const deadline = list.find((x) => x.source === "application_deadline" && x.title.includes("ReminderCorp"));
    expect(interview).toBeDefined();
    expect(interview.urgency).toBe("soon");
    expect(typeof interview.days_until).toBe("number");
    expect(interview.event_id).toBeDefined();
    expect(deadline).toBeDefined();
    expect(deadline.kind).toBe("deadline");
    expect(deadline.application_id).toBe(appResp.json.application.id);
  });

  it("marks a completed event as no longer reminded", async () => {
    const ev = await call("POST", "/events", { title: "To be completed", event_type: "follow_up", event_date: inDays(2) }, userA);
    expect(ev.status).toBe(201);
    const id = ev.json.event.id;
    await call("PATCH", `/events/${id}`, { completed: true }, userA);
    const r = await call("GET", "/reminders", undefined, userA);
    const list = r.json.reminders as any[];
    expect(list.some((x) => x.event_id === id)).toBe(false);
  });

  it("keeps reminders private between users", async () => {
    const r = await call("GET", "/reminders", undefined, userB);
    expect(r.status).toBe(200);
    const list = r.json.reminders as any[];
    expect(list.some((x) => x.title.includes("ReminderCorp"))).toBe(false);
  });

  it("dashboard includes the reminders panel data", async () => {
    const r = await call("GET", "/dashboard", undefined, userA);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json.reminders)).toBe(true);
  });
});

describe("jobs: grad-year scoring and deadline honesty", () => {
  it("uses grad_year in relevance reasons and reports deadline coverage", async () => {
    // Insert a job directly (bypasses network sync) referencing the user's grad year.
    const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const batchYear = new Date().getFullYear();
    await client.execute({
      sql: `INSERT INTO jobs (source, source_job_id, company, title, location, work_mode, employment_type,
              experience_level, url, apply_url, description, skills, salary, first_seen_at, deadline_at, published_at)
            VALUES ('user','test:gradyear','GradTest Corp','Software Engineer','Bengaluru','onsite','full_time','entry',
              '',' ',?,'python,sql',NULL,?,?,?)`,
      args: [`Hiring from the ${batchYear} batch. Python and SQL required.`, new Date().toISOString(), future, new Date().toISOString()]
    });

    await call("PUT", "/profile", { grad_year: batchYear, skills: "python, sql" }, userA);
    const r = await call("GET", "/jobs?q=GradTest", undefined, userA);
    expect(r.status).toBe(200);
    const hit = r.json.jobs.find((j: any) => j.company === "GradTest Corp");
    expect(hit).toBeDefined();
    expect(hit.match_reasons.some((x: string) => x.includes(`Open to your graduation year (${batchYear})`))).toBe(true);
    expect(r.json.with_deadlines).toBeGreaterThanOrEqual(1);

    // Deadline filter now has data to work with.
    const byDeadline = await call("GET", `/jobs?q=GradTest&deadline_before=${future}`, undefined, userA);
    expect(byDeadline.json.jobs.some((j: any) => j.company === "GradTest Corp")).toBe(true);
  });
});
