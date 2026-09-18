import { Hono } from "hono";
import { config } from "./config";
import {
  hashPassword, verifyPassword, createSession, destroySession,
  sessionCookieHeader, clearSessionCookieHeader, createResetToken, consumeResetToken
} from "./lib/auth";
import { db, initDb, ACTIVITY } from "./lib/db";
import {
  JOB_SOURCES, relevanceScore, fetchGreenhouse, fetchWorkable, fetchRemotive,
  fetchCareerPageFeed, extractSkills, normalizeEmploymentType, normalizeExperienceLevel, normalizeWorkMode,
  type StoredJob, type JobWithScore
} from "./lib/jobs";
import { parseResumeText, echoTailoring, type ResumeData } from "./lib/resume";
import { extractDocxText, isDocxFile, DOCX_MIME } from "./lib/docx";
import type { TailoringResult } from "../shared/resume";
import { buildResumePdf, extractPdfText } from "./lib/pdf";
import { remindersForUser, buildReminders, type Reminder } from "./lib/reminders";
import { tailorResumeWithAi } from "./lib/ai";
import { cors, readJson, requireAuth, requireAdmin, isResponse, logActivity, notify } from "./middleware";
import { isStatusId, STATUSES, type StatusId } from "../shared/status";

export function createApi() {
  const api = new Hono();

  api.use("*", cors());

  // ---------------- Health ----------------
  api.get("/health", (c) => c.json({ ok: true, service: "gradlaunch", time: new Date().toISOString() }));

  // ---------------- Auth ----------------
  api.post("/auth/signup", async (c) => {
    const body = await readJson<{ email: string; password: string; full_name: string }>(c);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.full_name ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: "Enter a valid email address" }, 400);
    if (password.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);
    if (!fullName) return c.json({ error: "Full name is required" }, 400);

    const existing = await db().execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] });
    if (existing.rows.length) return c.json({ error: "An account with this email already exists" }, 409);

    const now = new Date().toISOString();
    const firstUser = (await db().execute("SELECT COUNT(*) AS n FROM users")).rows[0];
    const isAdmin = Number((firstUser as any)?.n ?? 0) === 0 ? 1 : 0;

    const res = await db().execute({
      sql: `INSERT INTO users (email, password_hash, full_name, is_admin, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [email, hashPassword(password), fullName, isAdmin, now, now]
    });
    const userId = Number(res.lastInsertRowid);
    const session = await createSession(userId);
    await logActivity(userId, "account_created", "Account created");
    c.header("Set-Cookie", sessionCookieHeader(session.id, session.expiresAt));
    return c.json({ user: { id: userId, email, full_name: fullName, profile_completed: 0, is_admin: isAdmin } }, 201);
  });

  api.post("/auth/login", async (c) => {
    const body = await readJson<{ email: string; password: string }>(c);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const res = await db().execute({ sql: "SELECT id, password_hash FROM users WHERE email = ?", args: [email] });
    const row = res.rows[0] as any;
    if (!row || !verifyPassword(password, String(row.password_hash))) {
      return c.json({ error: "Invalid email or password" }, 401);
    }
    const session = await createSession(Number(row.id));
    c.header("Set-Cookie", sessionCookieHeader(session.id, session.expiresAt));
    const u = await db().execute({ sql: "SELECT id, email, full_name, profile_completed, is_admin FROM users WHERE id = ?", args: [row.id] });
    return c.json({ user: u.rows[0] });
  });

  api.post("/auth/logout", async (c) => {
    const sid = c.req.header("Cookie")?.match(/pt_session=([^;]+)/)?.[1];
    if (sid) await destroySession(sid);
    c.header("Set-Cookie", clearSessionCookieHeader());
    return c.json({ ok: true });
  });

  api.get("/auth/me", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const res = await db().execute({ sql: "SELECT * FROM users WHERE id = ?", args: [user.id] });
    const row = res.rows[0] as any;
    if (!row) return c.json({ error: "User not found" }, 404);
    const { password_hash, ...safe } = row;
    return c.json({ user: safe });
  });

  api.post("/auth/forgot-password", async (c) => {
    const body = await readJson<{ email: string }>(c);
    const email = String(body.email ?? "").trim().toLowerCase();
    const res = await db().execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] });
    const row = res.rows[0] as any;
    // Always return ok to avoid account enumeration.
    if (row) {
      const token = createResetToken(Number(row.id));
      console.log(`[GradLaunch] Password reset requested for ${email}. Token (dev delivery): ${token}`);
      await notify(Number(row.id), "A password reset was requested for your account. If this wasn't you, contact support immediately.", "warning");
    }
    return c.json({ ok: true, message: "If that email exists, a reset link has been generated. Check the server logs for the token in this development build." });
  });

  api.post("/auth/reset-password", async (c) => {
    const body = await readJson<{ token: string; password: string }>(c);
    const token = String(body.token ?? "");
    const password = String(body.password ?? "");
    if (password.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);
    const userId = consumeResetToken(token);
    if (!userId) return c.json({ error: "Invalid or expired reset token" }, 400);
    await db().execute({
      sql: "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
      args: [hashPassword(password), new Date().toISOString(), userId]
    });
    await db().execute({ sql: "DELETE FROM sessions WHERE user_id = ?", args: [userId] });
    return c.json({ ok: true });
  });

  // ---------------- Profile ----------------
  const PROFILE_FIELDS = [
    "full_name", "college", "degree_branch", "grad_year", "current_location",
    "preferred_locations", "skills", "preferred_domains", "preferred_roles",
    "employment_preference", "linkedin_url", "github_url", "portfolio_url"
  ] as const;

  api.put("/profile", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const body = await readJson<Record<string, unknown>>(c);
    const updates: string[] = [];
    const args: (string | number | null)[] = [];
    for (const f of PROFILE_FIELDS) {
      if (f in body) {
        let v: string | number | null = body[f] as any;
        if (f === "grad_year") {
          const n = Number(v);
          v = Number.isFinite(n) && n >= 2000 && n <= 2040 ? Math.floor(n) : null;
        } else {
          v = v == null ? "" : String(v).slice(0, 2000);
        }
        updates.push(`${f} = ?`);
        args.push(v);
      }
    }
    if (body.profile_completed === true) {
      updates.push("profile_completed = 1");
    }
    if (!updates.length) return c.json({ error: "No valid fields to update" }, 400);
    updates.push("updated_at = ?");
    args.push(new Date().toISOString(), user.id);
    await db().execute({ sql: `UPDATE users SET ${updates.join(", ")} WHERE id = ?`, args });
    const res = await db().execute({ sql: "SELECT * FROM users WHERE id = ?", args: [user.id] });
    const { password_hash, ...safe } = res.rows[0] as any;
    return c.json({ user: safe });
  });

  // ---------------- Jobs ----------------
  api.get("/jobs", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;

    const q = (c.req.query("q") ?? "").trim().toLowerCase();
    const company = (c.req.query("company") ?? "").trim().toLowerCase();
    const role = (c.req.query("role") ?? "").trim().toLowerCase();
    const domain = (c.req.query("domain") ?? "").trim().toLowerCase();
    const skill = (c.req.query("skill") ?? "").trim().toLowerCase();
    const location = (c.req.query("location") ?? "").trim().toLowerCase();
    const workMode = c.req.query("work_mode") ?? "";
    const empType = c.req.query("employment_type") ?? "";
    const expLevel = c.req.query("experience_level") ?? "";
    const source = c.req.query("source") ?? "";
    const deadlineBefore = c.req.query("deadline_before") ?? "";
    const sort = c.req.query("sort") ?? "relevance";
    const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1);
    const pageSize = Math.min(50, Math.max(5, Number(c.req.query("page_size") ?? "20") || 20));

    const profRes = await db().execute({ sql: "SELECT * FROM users WHERE id = ?", args: [user.id] });
    const prof = profRes.rows[0] as any;

    const where: string[] = ["is_active = 1", "expired = 0"];
    const params: (string | number)[] = [];
    if (q) { where.push("(LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(company) LIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (company) { where.push("LOWER(company) LIKE ?"); params.push(`%${company}%`); }
    if (role) { where.push("LOWER(title) LIKE ?"); params.push(`%${role}%`); }
    if (skill) { where.push("LOWER(skills) LIKE ?"); params.push(`%${skill}%`); }
    if (location) { where.push("LOWER(location) LIKE ?"); params.push(`%${location}%`); }
    if (domain) { where.push("(LOWER(title) LIKE ? OR LOWER(skills) LIKE ?)"); params.push(`%${domain}%`, `%${domain}%`); }
    if (workMode) { where.push("work_mode = ?"); params.push(workMode); }
    if (empType) { where.push("employment_type = ?"); params.push(empType); }
    if (expLevel) { where.push("experience_level = ?"); params.push(expLevel); }
    if (source) { where.push("source = ?"); params.push(source); }
    if (deadlineBefore) { where.push("deadline_at IS NOT NULL AND deadline_at <= ?"); params.push(deadlineBefore); }

    const res = await db().execute({
      sql: `SELECT * FROM jobs WHERE ${where.join(" AND ")}`,
      args: params
    });
    let jobs = (res.rows as unknown as StoredJob[]).map((j) => relevanceScore({
      skills: prof.skills ?? "",
      preferredDomains: prof.preferred_domains ?? "",
      preferredRoles: prof.preferred_roles ?? "",
      preferredLocations: prof.preferred_locations ?? "",
      gradYear: prof.grad_year ?? null,
      employmentPreference: prof.employment_preference ?? ""
    }, j));

    if (sort === "relevance") jobs.sort((a, b) => b.score - a.score);
    else if (sort === "newest") jobs.sort((a, b) => (Date.parse(b.published_at ?? "") || 0) - (Date.parse(a.published_at ?? "") || 0));
    else if (sort === "deadline") {
      jobs.sort((a, b) => {
        const da = a.deadline_at ? Date.parse(a.deadline_at) : Infinity;
        const dbb = b.deadline_at ? Date.parse(b.deadline_at) : Infinity;
        return da - dbb;
      });
    }

    // Deduplicate: identical company+title (normalized) keep highest score
    const seen = new Map<string, JobWithScore>();
    for (const j of jobs) {
      const key = `${j.company.toLowerCase().replace(/[^a-z0-9]/g, "")}|${j.title.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      const existing = seen.get(key);
      if (!existing || j.score > existing.score) seen.set(key, j);
    }
    const deduped = [...seen.values()];

    const start = (page - 1) * pageSize;
    const pageItems = deduped.slice(start, start + pageSize);
    return c.json({
      jobs: pageItems,
      total: deduped.length,
      page,
      page_size: pageSize,
      has_more: start + pageSize < deduped.length,
      // Deadline honesty: many public feeds never publish one. Let the UI know
      // so "closing soon" sort/filter can explain themselves.
      with_deadlines: deduped.filter((j) => j.deadline_at).length
    });
  });

  api.get("/jobs/filters", async (c) => {
    await requireAuth(c).then((r) => { if (isResponse(r)) throw new Error("unauth"); });
    const res = await db().execute("SELECT DISTINCT company FROM jobs WHERE is_active = 1 AND expired = 0 ORDER BY company");
    const companies = res.rows.map((r: any) => r.company).filter(Boolean);
    return c.json({ companies, sources: JOB_SOURCES.map((s) => ({ id: s.id, label: s.label })) });
  });

  api.get("/jobs/:id", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const id = Number(c.req.param("id"));
    const res = await db().execute({ sql: "SELECT * FROM jobs WHERE id = ?", args: [id] });
    const job = res.rows[0] as unknown as StoredJob;
    if (!job) return c.json({ error: "Job not found" }, 404);
    return c.json({ job });
  });

  api.post("/jobs/:id/save", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const id = Number(c.req.param("id"));
    const now = new Date().toISOString();
    await db().execute({
      sql: "INSERT OR IGNORE INTO saved_jobs (user_id, job_id, saved_at) VALUES (?, ?, ?)",
      args: [user.id, id, now]
    });
    await logActivity(user.id, ACTIVITY.job_saved, "Saved a new job opening");
    return c.json({ ok: true });
  });

  api.delete("/jobs/:id/save", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const id = Number(c.req.param("id"));
    await db().execute({ sql: "DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?", args: [user.id, id] });
    return c.json({ ok: true });
  });

  api.get("/jobs/saved/mine", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const res = await db().execute({
      sql: `SELECT j.* FROM saved_jobs s JOIN jobs j ON j.id = s.job_id WHERE s.user_id = ? ORDER BY s.saved_at DESC`,
      args: [user.id]
    });
    return c.json({ jobs: res.rows });
  });

  // ---------------- Sync (admin) ----------------
  async function upsertJobs(raw: { source: string; sourceJobId: string; company: string; title: string; location: string; workMode: string; employmentType: string; experienceLevel: string; url: string; applyUrl: string; description: string; skills: string[]; salary: string | null; deadlineAt: string | null; publishedAt: string | null }[]) {
    let inserted = 0, updated = 0;
    const now = new Date().toISOString();
    for (const j of raw) {
      const existing = await db().execute({
        sql: "SELECT id FROM jobs WHERE source = ? AND source_job_id = ?",
        args: [j.source, j.sourceJobId]
      });
      if (existing.rows.length) {
        await db().execute({
          sql: `UPDATE jobs SET title=?, location=?, description=?, skills=?, salary=?, deadline_at=?, published_at=?, is_active=1 WHERE source=? AND source_job_id=?`,
          args: [j.title, j.location, j.description, j.skills.join(","), j.salary, j.deadlineAt, j.publishedAt, j.source, j.sourceJobId]
        });
        updated++;
      } else {
        await db().execute({
          sql: `INSERT INTO jobs (source, source_job_id, company, title, location, work_mode, employment_type, experience_level, url, apply_url, description, skills, salary, first_seen_at, deadline_at, published_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [j.source, j.sourceJobId, j.company, j.title, j.location, j.workMode, j.employmentType, j.experienceLevel, j.url, j.applyUrl, j.description, j.skills.join(","), j.salary, now, j.deadlineAt, j.publishedAt]
        });
        inserted++;
      }
    }
    return { inserted, updated, total: raw.length };
  }

  async function markExpired(cutoffDays = 60): Promise<number> {
    const cutoff = new Date(Date.now() - cutoffDays * 86400000).toISOString();
    const res = await db().execute({
      sql: `UPDATE jobs SET expired = 1 WHERE is_active = 1 AND expired = 0 AND (published_at IS NOT NULL AND published_at < ?)`,
      args: [cutoff]
    });
    return res.rowsAffected;
  }

  api.post("/admin/sources", async (c) => {
    const admin = await requireAdmin(c);
    if (isResponse(admin)) return admin;
    const body = await readJson<{ name: string; type: string; config: any }>(c);
    const type = String(body.type ?? "");
    if (!["greenhouse", "workable", "career_page"].includes(type)) {
      return c.json({ error: "type must be greenhouse | workable | career_page" }, 400);
    }
    const name = String(body.name ?? "").trim();
    if (!name) return c.json({ error: "name is required" }, 400);
    let cfg: Record<string, string> = {};
    if (type === "greenhouse" || type === "workable") {
      cfg = { token: String(body.config?.token ?? "").trim() };
      if (!cfg.token) return c.json({ error: "config.token is required for this source type" }, 400);
    } else {
      cfg = { feed_url: String(body.config?.feed_url ?? "").trim(), company: String(body.config?.company ?? name).trim() };
      if (!cfg.feed_url) return c.json({ error: "config.feed_url is required for career_page sources" }, 400);
    }
    const now = new Date().toISOString();
    const res = await db().execute({
      sql: "INSERT INTO company_sources (name, type, config, enabled, created_at) VALUES (?, ?, ?, 1, ?)",
      args: [name, type, JSON.stringify(cfg), now]
    });
    return c.json({ source: { id: Number(res.lastInsertRowid), name, type, config: cfg, enabled: 1, created_at: now } }, 201);
  });

  api.get("/admin/sources", async (c) => {
    const admin = await requireAdmin(c);
    if (isResponse(admin)) return admin;
    const res = await db().execute("SELECT * FROM company_sources ORDER BY created_at DESC");
    return c.json({
      sources: res.rows,
      available_integrations: JOB_SOURCES,
      sync_status: { note: "Sources sync on demand or via the Sync button; expired postings are auto-archived after 60 days without publication updates." }
    });
  });

  api.post("/admin/sources/:id/sync", async (c) => {
    const admin = await requireAdmin(c);
    if (isResponse(admin)) return admin;
    const id = Number(c.req.param("id"));
    const res = await db().execute({ sql: "SELECT * FROM company_sources WHERE id = ?", args: [id] });
    const src = res.rows[0] as any;
    if (!src) return c.json({ error: "Source not found" }, 404);
    let cfg: any = {};
    try { cfg = JSON.parse(src.config); } catch { /* ignore */ }
    let raw;
    let message = "";
    try {
      if (src.type === "greenhouse") raw = await fetchGreenhouse(cfg.token);
      else if (src.type === "workable") raw = await fetchWorkable(cfg.token);
      else if (src.type === "career_page") raw = await fetchCareerPageFeed(cfg.feed_url, cfg.company);
      else throw new Error(`Unsupported source type ${src.type}`);
      const counts = await upsertJobs(raw);
      const expiredCount = await markExpired();
      message = `Synced ${counts.total} jobs (${counts.inserted} new, ${counts.updated} updated); archived ${expiredCount} expired`;
      const now = new Date().toISOString();
      await db().execute({
        sql: "UPDATE company_sources SET last_sync_at = ?, last_sync_status = 'success', last_sync_message = ? WHERE id = ?",
        args: [now, message, id]
      });
      await logActivity(admin.id, ACTIVITY.source_synced, `Synced source '${src.name}'`);
      return c.json({ ok: true, message, counts, expired_archived: expiredCount });
    } catch (err: any) {
      const now = new Date().toISOString();
      await db().execute({
        sql: "UPDATE company_sources SET last_sync_at = ?, last_sync_status = 'error', last_sync_message = ? WHERE id = ?",
        args: [now, String(err?.message ?? err).slice(0, 500), id]
      });
      return c.json({ ok: false, error: `Sync failed: ${String(err?.message ?? err).slice(0, 300)}` }, 502);
    }
  });

  api.post("/admin/sources/:id/toggle", async (c) => {
    const admin = await requireAdmin(c);
    if (isResponse(admin)) return admin;
    const id = Number(c.req.param("id"));
    await db().execute({ sql: "UPDATE company_sources SET enabled = 1 - enabled WHERE id = ?", args: [id] });
    const res = await db().execute({ sql: "SELECT enabled FROM company_sources WHERE id = ?", args: [id] });
    return c.json({ enabled: (res.rows[0] as any)?.enabled ?? 0 });
  });

  api.delete("/admin/sources/:id", async (c) => {
    const admin = await requireAdmin(c);
    if (isResponse(admin)) return admin;
    const id = Number(c.req.param("id"));
    await db().execute({ sql: "DELETE FROM company_sources WHERE id = ?", args: [id] });
    return c.json({ ok: true });
  });

  // Built-in public feed sync (Remotive), toggleable via env
  api.post("/admin/sync/remotive", async (c) => {
    const admin = await requireAdmin(c);
    if (isResponse(admin)) return admin;
    if (!config.integrations.remotiveEnabled) {
      return c.json({ ok: false, error: "Remotive integration is disabled (REMOTIVE_ENABLED=false)" }, 400);
    }
    try {
      const raw = await fetchRemotive();
      const counts = await upsertJobs(raw);
      return c.json({ ok: true, message: `Remotive: ${counts.inserted} new, ${counts.updated} updated of ${counts.total}`, counts });
    } catch (err: any) {
      return c.json({ ok: false, error: `Remotive sync failed: ${String(err?.message ?? err).slice(0, 300)}` }, 502);
    }
  });

  // ---------------- Applications ----------------
  function mapApplicationRow(row: any) {
    return row;
  }

  api.get("/applications", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const status = c.req.query("status") ?? "";
    const search = (c.req.query("q") ?? "").trim().toLowerCase();
    let sql = "SELECT * FROM applications WHERE user_id = ?";
    const args: (string | number)[] = [user.id];
    if (status) { sql += " AND status = ?"; args.push(status); }
    if (search) { sql += " AND (LOWER(company) LIKE ? OR LOWER(job_title) LIKE ?)"; args.push(`%${search}%`, `%${search}%`); }
    sql += " ORDER BY updated_at DESC";
    const res = await db().execute({ sql, args });
    return c.json({ applications: res.rows });
  });

  api.post("/applications", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const b = await readJson<any>(c);
    const company = String(b.company ?? "").trim();
    const jobTitle = String(b.job_title ?? "").trim();
    if (!company || !jobTitle) return c.json({ error: "company and job_title are required" }, 400);
    const status = isStatusId(String(b.status ?? "interested")) ? String(b.status) : "interested";
    const now = new Date().toISOString();
    const res = await db().execute({
      sql: `INSERT INTO applications (user_id, job_id, company, job_title, job_id_number, job_description, posting_url, apply_url,
              date_applied, deadline_at, location, employment_type, status, resume_id, cover_letter, recruiter_name, recruiter_email,
              notes, source, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        user.id, b.job_id ? Number(b.job_id) : null, company, jobTitle,
        String(b.job_id_number ?? ""), String(b.job_description ?? ""),
        String(b.posting_url ?? ""), String(b.apply_url ?? ""),
        b.date_applied ? String(b.date_applied) : null,
        b.deadline_at ? String(b.deadline_at) : null,
        String(b.location ?? ""), String(b.employment_type ?? "other"),
        status, b.resume_id ? Number(b.resume_id) : null,
        String(b.cover_letter ?? ""), String(b.recruiter_name ?? ""), String(b.recruiter_email ?? ""),
        String(b.notes ?? ""), String(b.source ?? "manual"), now, now
      ]
    });
    const appId = Number(res.lastInsertRowid);
    await db().execute({
      sql: "INSERT INTO application_status_history (application_id, user_id, previous_status, new_status, event_date, notes, created_at) VALUES (?,?,?,?,?,?,?)",
      args: [appId, user.id, null, status, now, "Application created", now]
    });
    if (b.job_id) {
      await db().execute({ sql: "INSERT OR IGNORE INTO saved_jobs (user_id, job_id, saved_at) VALUES (?,?,?)", args: [user.id, Number(b.job_id), now] });
    }
    await logActivity(user.id, ACTIVITY.application_added, `Applied to ${company} \u2014 ${jobTitle}`, appId);
    const created = await db().execute({ sql: "SELECT * FROM applications WHERE id = ?", args: [appId] });
    return c.json({ application: created.rows[0] }, 201);
  });

  api.get("/applications/:id", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const id = Number(c.req.param("id"));
    const res = await db().execute({ sql: "SELECT * FROM applications WHERE id = ? AND user_id = ?", args: [id, user.id] });
    if (!res.rows.length) return c.json({ error: "Application not found" }, 404);
    return c.json({ application: res.rows[0] });
  });

  api.patch("/applications/:id", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const id = Number(c.req.param("id"));
    const b = await readJson<any>(c);

    const cur = await db().execute({ sql: "SELECT * FROM applications WHERE id = ? AND user_id = ?", args: [id, user.id] });
    const app = cur.rows[0] as any;
    if (!app) return c.json({ error: "Application not found" }, 404);

    const fields = ["job_id_number", "job_description", "posting_url", "apply_url", "date_applied", "deadline_at",
      "location", "employment_type", "resume_id", "cover_letter", "recruiter_name", "recruiter_email", "notes", "company", "job_title"];
    const sets: string[] = [];
    const args: any[] = [];
    for (const f of fields) {
      if (f in b) {
        let v = b[f];
        if (f === "resume_id") v = v ? Number(v) : null;
        else if (f === "date_applied" || f === "deadline_at") v = v || null;
        else v = v == null ? "" : String(v).slice(0, 20000);
        sets.push(`${f} = ?`);
        args.push(v);
      }
    }

    let newStatus: string | null = null;
    if ("status" in b) {
      const s = String(b.status);
      if (!isStatusId(s)) return c.json({ error: `Invalid status '${s}'` }, 400);
      newStatus = s;
      sets.push("status = ?");
      args.push(s);
    }
    if (!sets.length) return c.json({ error: "No valid fields to update" }, 400);
    const now = new Date().toISOString();
    sets.push("updated_at = ?");
    args.push(now, id, user.id);
    await db().execute({
      sql: `UPDATE applications SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
      args
    });

    if (newStatus && newStatus !== app.status) {
      await db().execute({
        sql: "INSERT INTO application_status_history (application_id, user_id, previous_status, new_status, event_date, notes, created_at) VALUES (?,?,?,?,?,?,?)",
        args: [id, user.id, app.status, newStatus, now, String(b.status_note ?? ""), now]
      });
      await logActivity(user.id, ACTIVITY.application_updated,
        `${STATUSES[newStatus as StatusId].label} \u2014 ${app.company} (${app.job_title})`, id);
      if (newStatus === "interview_scheduled") {
        await notify(user.id, `Interview marked scheduled for ${app.company}. Add the date in Calendar to get reminders.`, "info", id);
      }
      if (newStatus === "offer_received" || newStatus === "accepted") {
        await notify(user.id, `Congratulations! Status for ${app.company} is now ${STATUSES[newStatus as StatusId].label}.`, "info", id);
      }
    }

    const updated = await db().execute({ sql: "SELECT * FROM applications WHERE id = ?", args: [id] });
    return c.json({ application: updated.rows[0] });
  });

  api.delete("/applications/:id", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const id = Number(c.req.param("id"));
    await db().execute({ sql: "DELETE FROM applications WHERE id = ? AND user_id = ?", args: [id, user.id] });
    return c.json({ ok: true });
  });

  api.get("/applications/:id/history", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const id = Number(c.req.param("id"));
    const res = await db().execute({
      sql: "SELECT * FROM application_status_history WHERE application_id = ? AND user_id = ? ORDER BY created_at ASC",
      args: [id, user.id]
    });
    return c.json({ history: res.rows });
  });

  // ---------------- Events / Calendar ----------------
  api.get("/events", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const from = c.req.query("from");
    const to = c.req.query("to");
    let sql = "SELECT e.*, a.company AS app_company, a.job_title AS app_job_title FROM events e LEFT JOIN applications a ON a.id = e.application_id WHERE e.user_id = ?";
    const args: (string | number)[] = [user.id];
    if (from) { sql += " AND e.event_date >= ?"; args.push(from); }
    if (to) { sql += " AND e.event_date <= ?"; args.push(to); }
    sql += " ORDER BY e.event_date ASC, e.event_time ASC";
    const res = await db().execute({ sql, args });
    return c.json({ events: res.rows });
  });

  api.post("/events", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const b = await readJson<any>(c);
    const title = String(b.title ?? "").trim();
    const eventDate = String(b.event_date ?? "").trim();
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      return c.json({ error: "title and event_date (YYYY-MM-DD) are required" }, 400);
    }
    const type = ["interview", "assessment", "coding_test", "deadline", "follow_up", "other"].includes(String(b.event_type)) ? String(b.event_type) : "other";
    const now = new Date().toISOString();
    const res = await db().execute({
      sql: "INSERT INTO events (user_id, application_id, title, event_type, event_date, event_time, notes, created_at) VALUES (?,?,?,?,?,?,?,?)",
      args: [user.id, b.application_id ? Number(b.application_id) : null, title, type, eventDate, String(b.event_time ?? ""), String(b.notes ?? ""), now]
    });
    if (type === "interview") {
      await logActivity(user.id, ACTIVITY.interview_scheduled, `Scheduled: ${title}`, b.application_id ? Number(b.application_id) : undefined);
    }
    const created = await db().execute({ sql: "SELECT * FROM events WHERE id = ?", args: [Number(res.lastInsertRowid)] });
    return c.json({ event: created.rows[0] }, 201);
  });

  api.patch("/events/:id", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const id = Number(c.req.param("id"));
    const b = await readJson<any>(c);
    const sets: string[] = [];
    const args: any[] = [];
    for (const f of ["title", "event_type", "event_date", "event_time", "notes"]) {
      if (f in b) { sets.push(`${f} = ?`); args.push(String(b[f] ?? "")); }
    }
    if ("completed" in b) { sets.push("completed = ?"); args.push(b.completed ? 1 : 0); }
    if (!sets.length) return c.json({ error: "No valid fields" }, 400);
    args.push(id, user.id);
    await db().execute({ sql: `UPDATE events SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, args });
    return c.json({ ok: true });
  });

  api.delete("/events/:id", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const id = Number(c.req.param("id"));
    await db().execute({ sql: "DELETE FROM events WHERE id = ? AND user_id = ?", args: [id, user.id] });
    return c.json({ ok: true });
  });

  // ---------------- Resumes ----------------
  api.get("/resumes", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const res = await db().execute({
      sql: `SELECT id, filename, mime_type, label, parent_id, version_of, is_master, kind, created_at,
                   LENGTH(content) AS size_bytes, parsed_text IS NOT NULL AND parsed_text != '' AS has_text
            FROM resumes WHERE user_id = ? ORDER BY created_at DESC`,
      args: [user.id]
    });
    return c.json({ resumes: res.rows });
  });

  api.post("/resumes", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) return c.json({ error: "Attach a resume file field 'file'" }, 400);
    if (file.size > 10 * 1024 * 1024) return c.json({ error: "File too large (max 10 MB)" }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let parsedText = "";
    let parsedJson = "";
    let isPdf = false;
    try {
      const extracted = await extractPdfText(bytes);
      isPdf = true;
      parsedText = extracted.text;
    } catch {
      // Not a valid PDF
    }
    let storedMime = "text/plain";
    if (!isPdf) {
      const isTxt = file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md");
      const isDocx = isDocxFile(file.type, file.name);
      if (isDocx) {
        try {
          parsedText = extractDocxText(bytes);
          storedMime = DOCX_MIME;
        } catch (err: any) {
          return c.json({ error: `Could not read the DOCX file: ${String(err?.message ?? err).slice(0, 200)}` }, 400);
        }
      } else if (isTxt) {
        parsedText = new TextDecoder().decode(bytes);
      } else {
        return c.json({ error: "Only PDF, DOCX or TXT resumes are supported" }, 400);
      }
    }
    const parsed = parseResumeText(parsedText, {
      fullName: user.full_name,
      email: user.email,
      phone: null,
      gradYear: null
    });
    parsedJson = JSON.stringify(parsed);
    const label = String(body.label ?? file.name).slice(0, 120);
    const now = new Date().toISOString();
    const res = await db().execute({
      sql: `INSERT INTO resumes (user_id, filename, mime_type, label, content, parsed_text, parsed_json, kind, created_at)
            VALUES (?,?,?,?,?,?,?,?,?)`,
      args: [user.id, file.name.slice(0, 200), isPdf ? "application/pdf" : storedMime, label, bytes, parsedText, parsedJson, "uploaded", now]
    });
    const resumeId = Number(res.lastInsertRowid);
    await logActivity(user.id, ACTIVITY.resume_uploaded, `Uploaded resume: ${file.name}`);
    return c.json({ resume: { id: resumeId, filename: file.name, label, kind: "uploaded", created_at: now, parsed: parsed } }, 201);
  });

  api.get("/resumes/:id", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const id = Number(c.req.param("id"));
    const res = await db().execute({
      sql: "SELECT id, filename, mime_type, label, parsed_text, parsed_json, parent_id, version_of, is_master, kind, created_at FROM resumes WHERE id = ? AND user_id = ?",
      args: [id, user.id]
    });
    const row = res.rows[0] as any;
    if (!row) return c.json({ error: "Resume not found" }, 404);
    return c.json({ resume: { ...row, parsed: row.parsed_json ? JSON.parse(row.parsed_json) : null } });
  });

  api.get("/resumes/:id/download", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const id = Number(c.req.param("id"));
    const res = await db().execute({
      sql: "SELECT filename, mime_type, content FROM resumes WHERE id = ? AND user_id = ?",
      args: [id, user.id]
    });
    const row = res.rows[0] as any;
    if (!row) return c.json({ error: "Resume not found" }, 404);
    const filename = String(row.filename).replace(/"/g, "");
    if (row.mime_type === "application/pdf") {
      return c.body(row.content as Buffer, 200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`
      });
    }
    if (row.mime_type === DOCX_MIME) {
      return c.body(row.content as Buffer, 200, {
        "Content-Type": DOCX_MIME,
        "Content-Disposition": `attachment; filename="${filename}"`
      });
    }
    return c.body(row.content as Buffer, 200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    });
  });

  api.delete("/resumes/:id", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const id = Number(c.req.param("id"));
    await db().execute({ sql: "DELETE FROM resumes WHERE id = ? AND user_id = ?", args: [id, user.id] });
    return c.json({ ok: true });
  });

  // Put resume JSON editor save + PDF rebuild
  api.put("/resumes/:id/content", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const id = Number(c.req.param("id"));
    const b = await readJson<{ parsed: ResumeData; label?: string }>(c);
    const res = await db().execute({
      sql: "SELECT parsed_json, kind, mime_type, content FROM resumes WHERE id = ? AND user_id = ?",
      args: [id, user.id]
    });
    const row = res.rows[0] as any;
    if (!row) return c.json({ error: "Resume not found" }, 404);
    const merged = { ...(row.parsed_json ? JSON.parse(row.parsed_json) : {}), ...b.parsed };
    const flat = flattenResumeToText(merged);
    await db().execute({
      sql: "UPDATE resumes SET parsed_json = ?, parsed_text = ?, label = COALESCE(?, label) WHERE id = ? AND user_id = ?",
      args: [JSON.stringify(merged), flat, b.label ?? null, id, user.id]
    });
    return c.json({ ok: true, resume: { id, parsed: merged } });
  });

  function flattenResumeToText(r: ResumeData): string {
    const lines: string[] = [];
    lines.push(r.owner);
    if (r.headline) lines.push(r.headline);
    lines.push([r.email, r.phone, r.location].filter(Boolean).join(" | "));
    if (r.links.length) lines.push(r.links.join(" | "));
    if (r.summary) lines.push("", "SUMMARY", r.summary);
    if (r.education.length) {
      lines.push("", "EDUCATION");
      for (const e of r.education) lines.push([e.degree, e.institution, e.period].filter(Boolean).join(" | "));
    }
    if (r.skills.length) lines.push("", "SKILLS", r.skills.join(", "));
    if (r.experience.length) {
      lines.push("", "EXPERIENCE");
      for (const e of r.experience) {
        lines.push([e.company, e.role, e.period].filter(Boolean).join(" | "));
        for (const bl of e.bullets) lines.push(`- ${bl}`);
      }
    }
    if (r.projects.length) {
      lines.push("", "PROJECTS");
      for (const p of r.projects) {
        lines.push([p.name, p.tech].filter(Boolean).join(" | "));
        for (const bl of p.bullets) lines.push(`- ${bl}`);
      }
    }
    return lines.join("\n");
  }

  // Rebuild stored uploaded PDF from edited JSON? No: uploads stay immutable. Generated ones can rebuild.
  api.get("/resumes/:id/pdf", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const id = Number(c.req.param("id"));
    const res = await db().execute({
      sql: "SELECT filename, mime_type, content, parsed_json, kind FROM resumes WHERE id = ? AND user_id = ?",
      args: [id, user.id]
    });
    const row = res.rows[0] as any;
    if (!row) return c.json({ error: "Resume not found" }, 404);
    if (row.mime_type === "application/pdf") {
      return c.body(row.content as Buffer, 200, { "Content-Type": "application/pdf" });
    }
    // generated/txt -> render fresh PDF from parsed_json
    const data = (row.parsed_json ? JSON.parse(row.parsed_json) : null) as ResumeData | null;
    if (!data) return c.json({ error: "No structured content available to render PDF" }, 400);
    const pdf = await buildResumePdf(data);
    return c.body(pdf as unknown as Buffer, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="resume-${id}.pdf"`
    });
  });

  // ---------------- AI Tailoring ----------------
  api.post("/tailor", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const b = await readJson<{
      resume_id: number;
      application_id?: number;
      job?: { title: string; company: string; description: string };
      save?: boolean;
      label?: string;
    }>(c);

    const resumeId = Number(b.resume_id);
    const res = await db().execute({
      sql: "SELECT * FROM resumes WHERE id = ? AND user_id = ?",
      args: [resumeId, user.id]
    });
    const resume = res.rows[0] as any;
    if (!resume) return c.json({ error: "Base resume not found" }, 404);
    let baseParsed: ResumeData;
    try {
      baseParsed = resume.parsed_json ? JSON.parse(resume.parsed_json) : parseResumeText(resume.parsed_text ?? "", { fullName: user.full_name, email: user.email, phone: null, gradYear: null });
    } catch {
      baseParsed = parseResumeText(resume.parsed_text ?? "", { fullName: user.full_name, email: user.email, phone: null, gradYear: null });
    }

    let job = b.job;
    if (!job && b.application_id) {
      const a = await db().execute({ sql: "SELECT * FROM applications WHERE id = ? AND user_id = ?", args: [Number(b.application_id), user.id] });
      const app = a.rows[0] as any;
      if (app) job = { title: app.job_title, company: app.company, description: app.job_description ?? "" };
    }
    if (!job || !job.title || !job.company) {
      return c.json({ error: "Provide job {title, company, description} or a valid application_id" }, 400);
    }

    let result: TailoringResult;
    let provider = "echo";
    let model = "template";
    let usedEcho = false;
    try {
      const ai = await tailorResumeWithAi(baseParsed, job);
      result = ai.result;
      provider = ai.provider;
      model = ai.model;
    } catch (err: any) {
      if (err?.message === "ECHO_MODE") {
        result = echoTailoring(baseParsed, job);
        usedEcho = true;
      } else {
        return c.json({ error: `AI tailoring failed: ${String(err?.message ?? err).slice(0, 300)}` }, 502);
      }
    }

    const tailored: ResumeData = {
      owner: baseParsed.owner,
      headline: baseParsed.headline || `${job.title} candidate`,
      email: baseParsed.email,
      phone: baseParsed.phone,
      location: baseParsed.location,
      links: baseParsed.links,
      summary: result.summary || baseParsed.summary,
      skills: result.skills?.length ? result.skills : baseParsed.skills,
      projects: result.projects?.length ? result.projects : baseParsed.projects,
      experience: result.experience?.length ? result.experience : baseParsed.experience,
      education: result.education?.length ? result.education : baseParsed.education
    };

    const now = new Date().toISOString();
    const label = b.label ?? `${job.company} \u2014 ${job.title} (tailored)`;
    const flat = flattenResumeToTextShared(tailored);
    if (b.save === false) {
      return c.json({ tailored, provider, model, used_echo: usedEcho, keywords: result.keywordsAdded, ats_notes: result.atsNotes });
    }
    // Render the tailored resume to a real PDF immediately so the stored copy
    // is the exact document the student submits (never a placeholder).
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildResumePdf(tailored);
    } catch (err: any) {
      return c.json({ error: `Failed to render tailored resume PDF: ${String(err?.message ?? err).slice(0, 200)}` }, 500);
    }
    const ins = await db().execute({
      sql: `INSERT INTO resumes (user_id, filename, mime_type, label, content, parsed_text, parsed_json, parent_id, version_of, kind, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      args: [user.id, `${label.replace(/[\\/:*?"<>|]/g, "-")}.pdf`, "application/pdf", label,
             pdfBytes, flat, JSON.stringify(tailored), resumeId, resumeId, "tailored", now]
    });
    await logActivity(user.id, ACTIVITY.resume_generated, `Generated job-specific resume for ${job.company} (${job.title})`);
    return c.json({
      tailored, provider, model, used_echo: usedEcho,
      keywords: result.keywordsAdded, ats_notes: result.atsNotes,
      resume_id: Number(ins.lastInsertRowid)
    }, 201);
  });

  function flattenResumeToTextShared(r: ResumeData): string {
    const lines: string[] = [];
    lines.push(r.owner);
    if (r.headline) lines.push(r.headline);
    lines.push([r.email, r.phone, r.location].filter(Boolean).join(" | "));
    if (r.summary) lines.push("", "SUMMARY", r.summary);
    if (r.skills.length) lines.push("", "SKILLS", r.skills.join(", "));
    return lines.join("\n");
  }

  // ---------------- Reminders ----------------
  api.get("/reminders", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const horizon = Math.min(30, Math.max(1, Number(c.req.query("horizon") ?? "7") || 7));
    const reminders = await remindersForUser(
      (sql, args) => db().execute({ sql, args }),
      user.id,
      horizon
    );
    return c.json({ reminders, generated_at: new Date().toISOString(), horizon_days: horizon });
  });

  // ---------------- Dashboard / Analytics ----------------
  api.get("/dashboard", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const apps = await db().execute({ sql: "SELECT * FROM applications WHERE user_id = ?", args: [user.id] });
    const appsRows = apps.rows as any[];
    const count = (pred: (a: any) => boolean) => appsRows.filter(pred).length;
    const inProgress = appsRows.filter((a) => !["accepted", "rejected", "withdrawn"].includes(a.status)).length;
    const today = new Date().toISOString().slice(0, 10);
    const upcomingEvents = await db().execute({
      sql: "SELECT * FROM events WHERE user_id = ? AND completed = 0 AND event_date >= ? ORDER BY event_date ASC LIMIT 8",
      args: [user.id, today]
    });
    const activity = await db().execute({
      sql: "SELECT * FROM activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 12",
      args: [user.id]
    });
    const notifications = await db().execute({
      sql: "SELECT * FROM notifications WHERE user_id = ? AND read = 0 ORDER BY created_at DESC LIMIT 10",
      args: [user.id]
    });
    const savedJobs = await db().execute({ sql: "SELECT COUNT(*) AS n FROM saved_jobs WHERE user_id = ?", args: [user.id] });
    const reminders = await remindersForUser((sql, args) => db().execute({ sql, args }), user.id);

    const funnel = {
      interested: count((a) => ["interested", "ready_to_apply"].includes(a.status)),
      applied: count((a) => a.status === "applied"),
      assessment: count((a) => ["assessment_pending", "assessment_completed"].includes(a.status)),
      shortlist: count((a) => a.status === "shortlisted"),
      interview: count((a) => ["interview_scheduled", "interview_completed"].includes(a.status)),
      offer: count((a) => a.status === "offer_received"),
      closed: count((a) => ["accepted", "rejected", "withdrawn"].includes(a.status))
    };

    return c.json({
      cards: {
        total: appsRows.length,
        in_progress: inProgress,
        shortlisted: count((a) => ["shortlisted", "interview_scheduled", "interview_completed", "offer_received", "accepted"].includes(a.status)),
        interviews: count((a) => ["interview_scheduled", "interview_completed"].includes(a.status)),
        offers: count((a) => ["offer_received", "accepted"].includes(a.status)),
        rejected: count((a) => a.status === "rejected"),
        upcoming_deadlines: appsRows.filter((a) => a.deadline_at && !["accepted", "rejected", "withdrawn"].includes(a.status) && a.deadline_at >= today).length
      },
      funnel,
      upcoming_events: upcomingEvents.rows,
      activity: activity.rows,
      notifications: notifications.rows,
      reminders,
      saved_jobs: Number((savedJobs.rows[0] as any)?.n ?? 0)
    });
  });

  api.get("/analytics", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    const apps = await db().execute({ sql: "SELECT * FROM applications WHERE user_id = ?", args: [user.id] });
    const rows = apps.rows as any[];
    const byCompany = new Map<string, number>();
    const byStatus: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let responseTimes: number[] = [];
    for (const a of rows) {
      byCompany.set(a.company, (byCompany.get(a.company) ?? 0) + 1);
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      bySource[a.source] = (bySource[a.source] ?? 0) + 1;
    }
    const hist = await db().execute({
      sql: `SELECT application_id, MIN(event_date) AS first, MAX(event_date) AS last FROM application_status_history WHERE user_id = ? GROUP BY application_id`,
      args: [user.id]
    });
    return c.json({
      totals: {
        applications: rows.length,
        companies: byCompany.size,
        active: rows.filter((a) => !["accepted", "rejected", "withdrawn"].includes(a.status)).length
      },
      by_company: [...byCompany.entries()].map(([company, n]) => ({ company, count: n })).sort((a, b) => b.count - a.count).slice(0, 12),
      by_status: byStatus,
      by_source: bySource,
      timeline_span: hist.rows
    });
  });

  api.post("/notifications/read-all", async (c) => {
    const user = await requireAuth(c);
    if (isResponse(user)) return user;
    await db().execute({ sql: "UPDATE notifications SET read = 1 WHERE user_id = ?", args: [user.id] });
    return c.json({ ok: true });
  });

  return api;
}

// Initialize DB on first import in server context
let initialized = false;
export async function ensureDb(): Promise<void> {
  if (!initialized) {
    await initDb();
    initialized = true;
  }
}

export { extractSkills, normalizeEmploymentType, normalizeExperienceLevel, normalizeWorkMode };
