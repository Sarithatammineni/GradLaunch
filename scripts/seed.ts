/**
 * Seeds the database:
 *  - demo student (demo@gradlaunch.app / gradlaunch123) with profile + resume + applications
 *  - admin user (admin@gradlaunch.app / gradlaunch-admin)
 *  - real job data pulled from public job boards (Greenhouse boards, Workable, Remotive)
 *
 * Usage: npm run db:seed
 */
import { createClient } from "@libsql/client";
import { config } from "../server/config";
import { initDb } from "../server/lib/db";
import { hashPassword, createSession } from "../server/lib/auth";
import {
  fetchGreenhouse, fetchWorkable, fetchRemotive, extractSkills,
  normalizeWorkMode, normalizeEmploymentType, normalizeExperienceLevel,
  type RawJob
} from "../server/lib/jobs";
import { parseResumeText, echoTailoring } from "../server/lib/resume";
import type { ResumeData } from "../shared/resume";

const client = createClient({ url: config.db.url, authToken: config.db.authToken });

async function upsertJobs(raw: RawJob[]): Promise<number> {
  let count = 0;
  for (const j of raw) {
    await client.execute({
      sql: `INSERT INTO jobs (source, source_job_id, company, title, location, work_mode, employment_type,
                experience_level, url, apply_url, description, skills, salary, first_seen_at, deadline_at, published_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(source, source_job_id) DO UPDATE SET
                title=excluded.title, location=excluded.location, description=excluded.description,
                skills=excluded.skills, salary=excluded.salary, deadline_at=excluded.deadline_at, expired=0`,
      args: [j.source, j.sourceJobId, j.company, j.title, j.location, j.workMode, j.employmentType,
        j.experienceLevel, j.url, j.applyUrl, j.description, j.skills.join(","), j.salary,
        j.firstSeenAt, j.deadlineAt, j.publishedAt]
    });
    count++;
  }
  return count;
}

function toStored(raw: RawJob): Omit<RawJob, "sourceJobId" | "source"> & { source: string; sourceJobId: string } {
  return raw;
}

async function syncPublicSources(): Promise<{ greenhouse: number; workable: number; remotive: number }> {
  const out = { greenhouse: 0, workable: 0, remotive: 0 };
  // Public Greenhouse boards (companies that publish openings for new grads)
  for (const board of ["stripe", "coinbase", "databricks"]) {
    try {
      const jobs = await fetchGreenhouse(board);
      out.greenhouse += await upsertJobs(jobs);
      console.log(`[seed] Greenhouse/${board}: ${jobs.length} jobs`);
    } catch (e: any) {
      console.warn(`[seed] Greenhouse/${board} failed: ${String(e?.message ?? e).slice(0, 120)}`);
    }
  }
  try {
    const jobs = await fetchWorkable("remotive"); // public demo account used by Workable docs
    out.workable += await upsertJobs(jobs);
    console.log(`[seed] Workable/remotive: ${jobs.length} jobs`);
  } catch (e: any) {
    console.warn(`[seed] Workable failed: ${String(e?.message ?? e).slice(0, 120)}`);
  }
  if (config.integrations.remotiveEnabled) {
    try {
      const jobs = await fetchRemotive();
      out.remotive += await upsertJobs(jobs);
      console.log(`[seed] Remotive: ${jobs.length} jobs`);
    } catch (e: any) {
      console.warn(`[seed] Remotive failed: ${String(e?.message ?? e).slice(0, 120)}`);
    }
  }
  return out;
}

function textToDataUrl(): never { throw new Error("unused"); }

async function seedDemoUser(): Promise<void> {
  const now = new Date().toISOString();
  const existing = await client.execute({ sql: "SELECT id FROM users WHERE email = ?", args: ["demo@gradlaunch.app"] });
  if (existing.rows.length) {
    console.log("[seed] demo user already present, skipping demo data");
    return;
  }

  const ins = await client.execute({
    sql: `INSERT INTO users (email, password_hash, full_name, college, degree_branch, grad_year, current_location,
              preferred_locations, skills, preferred_domains, preferred_roles, employment_preference,
              linkedin_url, github_url, portfolio_url, profile_completed, is_admin, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      "demo@gradlaunch.app", hashPassword("gradlaunch123"), "Ananya Sharma",
      "National Institute of Technology, Warangal", "B.Tech Computer Science & Engineering", 2026,
      "Hyderabad, India", "Bengaluru; Hyderabad; Pune; Remote",
      "python, java, sql, react, node.js, data structures, algorithms, machine learning, docker, git",
      "software development, machine learning", "software engineer, ml engineer, sde",
      "full_time",
      "https://linkedin.com/in/demo-ananya", "https://github.com/demo-ananya", "",
      1, 0, now, now
    ]
  });
  const userId = Number(ins.lastInsertRowid);

  // Sample resume text (TXT upload; parsed at seed time)
  const resumeText = `Ananya Sharma
Final-year B.Tech CSE student | Aspiring Software Engineer
ananya.sharma@example.com | +91 98765 43210 | Hyderabad, India
https://github.com/demo-ananya | https://linkedin.com/in/demo-ananya

Summary
Final-year Computer Science student with hands-on experience building full-stack web
applications and ML micro-projects. Comfortable with Python, Java, SQL and React.

Education
B.Tech Computer Science & Engineering | National Institute of Technology, Warangal | 2022-2026
Class XII (PCM) | Sri Chaitanya Junior College | 2020-2022

Skills
python, java, sql, react, node.js, express, mongodb, git, docker, machine learning, pandas, numpy

Experience
Software Engineering Intern | FinEdge Labs | (2025)
- Built REST APIs in Node.js/Express serving a payments dashboard used by 40 internal users
- Wrote SQL reporting queries and cut a nightly job from 3 hours to 40 minutes
- Added Docker-based local setup, onboarding new interns in a day

Projects
PlaceMe Tracker | react, node.js, sql
- Full-stack app to track college placement applications with status timelines
Campus Notice Summarizer | python, nlp
- Summarizes college notice-board PDFs into daily digests using extractive NLP
Attendance Predictor | pandas, scikit-learn
- Predicts attendance shortfall from timetable and check-in data`;

  const parsed: ResumeData = parseResumeText(resumeText, {
    fullName: "Ananya Sharma", email: "ananya.sharma@example.com", phone: "+91 98765 43210", gradYear: 2026
  });
  const resIns = await client.execute({
    sql: `INSERT INTO resumes (user_id, filename, mime_type, label, content, parsed_text, parsed_json, is_master, kind, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [userId, "ananya-master-resume.txt", "text/plain", "Master resume (sample)",
      Buffer.from(resumeText, "utf8"), resumeText, JSON.stringify(parsed), 1, "uploaded", now]
  });
  const resumeId = Number(resIns.lastInsertRowid);

  // Pick a few real synced jobs to base sample applications on. One job per company
  // so the demo activity feed doesn't show the same company three times.
  const jobRows = await client.execute(
    `SELECT j.id, j.company, j.title, j.description, j.apply_url, j.url FROM jobs j
      WHERE j.is_active = 1 AND j.expired = 0
        AND j.id IN (SELECT MIN(id) FROM jobs WHERE is_active = 1 AND expired = 0 GROUP BY company)
      ORDER BY j.id LIMIT 6`
  );
  const realJobs = jobRows.rows as any[];

  // Two clearly-labelled manual listings with deadlines so the deadline filter/sort
  // and the reminder engine have data even though public feeds rarely publish one.
  const day = 86400000;
  const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10);
  const manualJobs = [
    {
      source: "user", source_job_id: "manual:sample-campus-drive",
      company: "Infotech Systems (campus drive)", title: "Software Engineer Intern",
      location: "Hyderabad, India", work_mode: "onsite", employment_type: "internship", experience_level: "internship",
      url: "", apply_url: "", description: "On-campus placement drive: software engineering internship for final-year students. Registered via the placement cell. (Sample manual entry for the demo account.)",
      skills: "python, java, sql, data structures", salary: null,
      deadline_at: iso(10), published_at: now
    },
    {
      source: "user", source_job_id: "manual:sample-offcampus-analyst",
      company: "CloudNine Analytics", title: "Junior Data Analyst",
      location: "Bengaluru, India", work_mode: "hybrid", employment_type: "full_time", experience_level: "entry",
      url: "", apply_url: "", description: "Off-campus posting shared by an alumnus: junior data analyst working on dashboards and reporting pipelines. (Sample manual entry for the demo account.)",
      skills: "sql, python, excel, tableau", salary: null,
      deadline_at: iso(4), published_at: now
    }
  ];
  for (const m of manualJobs) {
    await client.execute({
      sql: `INSERT INTO jobs (source, source_job_id, company, title, location, work_mode, employment_type,
              experience_level, url, apply_url, description, skills, salary, first_seen_at, deadline_at, published_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(source, source_job_id) DO UPDATE SET deadline_at = excluded.deadline_at, expired = 0`,
      args: [m.source, m.source_job_id, m.company, m.title, m.location, m.work_mode, m.employment_type,
        m.experience_level, m.url, m.apply_url, m.description, m.skills, m.salary, now, m.deadline_at, m.published_at]
    });
  }

  const samples: any[] = [];
  if (realJobs.length >= 3) {
    const [j1, j2, j3] = realJobs;
    samples.push(
      { company: j1.company, job_title: j1.title, job_description: (j1.description ?? "").slice(0, 4000), posting_url: j1.url ?? "", apply_url: j1.apply_url ?? j1.url ?? "", status: "applied", date_applied: new Date(Date.now() - 9 * day).toISOString().slice(0, 10), deadline: iso(14), source: "job_discovery", job_id: j1.id, resume_id: resumeId },
      { company: j2.company, job_title: j2.title, job_description: (j2.description ?? "").slice(0, 4000), posting_url: j2.url ?? "", apply_url: j2.apply_url ?? j2.url ?? "", status: "shortlisted", date_applied: new Date(Date.now() - 16 * day).toISOString().slice(0, 10), deadline: iso(7), source: "job_discovery", job_id: j2.id, resume_id: resumeId },
      { company: j3.company, job_title: j3.title, job_description: (j3.description ?? "").slice(0, 4000), posting_url: j3.url ?? "", apply_url: j3.apply_url ?? j3.url ?? "", status: "interview_scheduled", date_applied: new Date(Date.now() - 25 * day).toISOString().slice(0, 10), deadline: null, source: "job_discovery", job_id: j3.id, resume_id: resumeId }
    );
  } else {
    samples.push(
      { company: "Example Corp", job_title: "Software Engineer (Campus Hire)", job_description: "Apply via campus portal.", status: "applied", date_applied: new Date(Date.now() - 9 * day).toISOString().slice(0, 10), deadline: iso(14), source: "campus", resume_id: resumeId }
    );
  }

  const statusFlow: Record<string, string[]> = {
    applied: ["interested", "applied"],
    shortlisted: ["interested", "applied", "shortlisted"],
    interview_scheduled: ["interested", "applied", "shortlisted", "interview_scheduled"]
  };

  for (const s of samples) {
    const a = await client.execute({
      sql: `INSERT INTO applications (user_id, job_id, company, job_title, job_description, posting_url, apply_url, date_applied, deadline_at,
              location, employment_type, status, resume_id, source, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [userId, s.job_id ?? null, s.company, s.job_title, s.job_description ?? "", s.posting_url ?? "", s.apply_url ?? "",
        s.date_applied ?? null, s.deadline ?? null, s.location ?? "", s.employment_type ?? "full_time", s.status, s.resume_id ?? null, s.source ?? "manual", now, now]
    });
    const appId = Number(a.lastInsertRowid);
    const flow = statusFlow[s.status] ?? ["interested"];
    let prev: string | null = null;
    for (const st of flow) {
      await client.execute({
        sql: "INSERT INTO application_status_history (application_id, user_id, previous_status, new_status, event_date, notes, created_at) VALUES (?,?,?,?,?,?,?)",
        args: [appId, userId, prev, st, s.date_applied ?? now, "", now]
      });
      prev = st;
    }
  }

  // Activity feed entries for the demo user — one per application (no duplicates),
  // timestamped from each application's date_applied so the feed is chronological.
  const seenCompanies = new Set<string>();
  for (const s of samples) {
    const key = String(s.company).toLowerCase();
    if (seenCompanies.has(key)) continue;
    seenCompanies.add(key);
    await client.execute({
      sql: "INSERT INTO activity_log (user_id, kind, message, application_id, created_at) VALUES (?,?,?,?,?)",
      args: [userId, "application_added", `Applied to ${s.company} — ${s.job_title}`, null, s.date_applied ? `${s.date_applied}T09:00:00.000Z` : now]
    });
  }
  await client.execute({
    sql: "INSERT INTO activity_log (user_id, kind, message, application_id, created_at) VALUES (?,?,?,?,?)",
    args: [userId, "resume_uploaded", "Uploaded resume: ananya-master-resume.txt", null, now]
  });

  // Events
  const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const sooner = new Date(Date.now() + 1 * 86400000).toISOString().slice(0, 10);
  await client.execute({
    sql: "INSERT INTO events (user_id, title, event_type, event_date, event_time, notes, created_at) VALUES (?,?,?,?,?,?,?)",
    args: [userId, "Online assessment - coding test", "coding_test", sooner, "10:00", "2 problems, 90 minutes", now]
  });
  await client.execute({
    sql: "INSERT INTO events (user_id, title, event_type, event_date, event_time, notes, created_at) VALUES (?,?,?,?,?,?,?)",
    args: [userId, "Technical interview", "interview", soon, "15:30", "Panel round - DSA + system basics", now]
  });

  console.log("[seed] demo user ready: demo@gradlaunch.app / gradlaunch123");
}

async function seedAdmin(): Promise<void> {
  const existing = await client.execute({ sql: "SELECT id FROM users WHERE email = ?", args: ["admin@gradlaunch.app"] });
  if (existing.rows.length) return;
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO users (email, password_hash, full_name, profile_completed, is_admin, created_at, updated_at)
          VALUES (?,?,?,1,1,?,?)`,
    args: ["admin@gradlaunch.app", hashPassword("gradlaunch-admin"), "Placement Admin", now, now]
  });
  console.log("[seed] admin user ready: admin@gradlaunch.app / gradlaunch-admin");
}

async function main() {
  await initDb();
  console.log("[seed] syncing real public job boards (this needs internet access)...");
  const counts = await syncPublicSources();
  console.log(`[seed] jobs synced: ${JSON.stringify(counts)}`);
  await seedAdmin();
  await seedDemoUser();
  console.log("[seed] done");
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
