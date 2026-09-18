import { createClient, type Client } from "@libsql/client";

let client: Client | null = null;

export function db(): Client {
  if (!client) {
    client = createClient({
      url: process.env.DATABASE_URL || "file:.generated/db/placetrack.db",
      authToken: process.env.DATABASE_AUTH_TOKEN || undefined
    });
  }
  return client;
}

/** Test-only: swap the database client (used for isolated in-memory DBs). */
export function setDbForTests(c: Client | null): void {
  client = c;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  college TEXT DEFAULT '',
  degree_branch TEXT DEFAULT '',
  grad_year INTEGER,
  current_location TEXT DEFAULT '',
  preferred_locations TEXT DEFAULT '',
  skills TEXT DEFAULT '',
  preferred_domains TEXT DEFAULT '',
  preferred_roles TEXT DEFAULT '',
  employment_preference TEXT DEFAULT '',
  linkedin_url TEXT DEFAULT '',
  github_url TEXT DEFAULT '',
  portfolio_url TEXT DEFAULT '',
  profile_completed INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  label TEXT DEFAULT '',
  content BLOB NOT NULL,
  parsed_text TEXT DEFAULT '',
  parsed_json TEXT DEFAULT '',
  parent_id INTEGER,
  version_of INTEGER,
  is_master INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'uploaded',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_job_id TEXT NOT NULL,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT DEFAULT '',
  work_mode TEXT DEFAULT 'unknown',
  employment_type TEXT DEFAULT 'other',
  experience_level TEXT DEFAULT 'entry',
  url TEXT DEFAULT '',
  apply_url TEXT DEFAULT '',
  description TEXT DEFAULT '',
  skills TEXT DEFAULT '',
  salary TEXT,
  first_seen_at TEXT NOT NULL,
  deadline_at TEXT,
  published_at TEXT,
  expired INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(source, source_job_id)
);

CREATE TABLE IF NOT EXISTS saved_jobs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (user_id, job_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  company TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_id_number TEXT DEFAULT '',
  job_description TEXT DEFAULT '',
  posting_url TEXT DEFAULT '',
  apply_url TEXT DEFAULT '',
  date_applied TEXT,
  deadline_at TEXT,
  location TEXT DEFAULT '',
  employment_type TEXT DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'interested',
  resume_id INTEGER,
  cover_letter TEXT DEFAULT '',
  recruiter_name TEXT DEFAULT '',
  recruiter_email TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  source TEXT DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS application_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  event_date TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_time TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'info',
  application_id INTEGER,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  application_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS company_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT,
  last_sync_status TEXT DEFAULT '',
  last_sync_message TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_status_history_app ON application_status_history(application_id);
CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, event_date);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs(is_active, expired);
`;

export async function initDb(): Promise<void> {
  await db().executeMultiple(SCHEMA);
}

export const ACTIVITY = {
  application_added: "Applied to a new company",
  application_updated: "Updated application status",
  resume_uploaded: "Uploaded a new resume",
  resume_generated: "Generated a job-specific resume",
  interview_scheduled: "Scheduled an interview",
  job_saved: "Saved a new job opening",
  source_synced: "Synchronized a job source"
} as const;
