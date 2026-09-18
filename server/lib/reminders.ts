/**
 * Reminder engine: derives proactive reminders from a user's calendar events
 * (interviews, assessments, coding tests, follow-ups) and unpassed application
 * deadlines. Pure functions + one DB query helper so behavior is unit-testable.
 */

export type ReminderSource = "event" | "application_deadline";

export interface Reminder {
  source: ReminderSource;
  /** ISO date (YYYY-MM-DD) the item is due. */
  date: string;
  /** Days from today (negative = overdue/past). */
  days_until: number;
  title: string;
  detail: string;
  kind: "interview" | "assessment" | "coding_test" | "deadline" | "follow_up" | "other";
  /** Optional links back to records. */
  event_id?: number;
  application_id?: number;
  /** How urgently to surface it. */
  urgency: "overdue" | "today" | "soon" | "upcoming";
}

const MS_PER_DAY = 86400000;

/** Whole days between an ISO date and today (local-date based, no TZ drift within a day). */
export function daysUntil(isoDate: string, todayIso: string): number {
  return Math.round((Date.parse(isoDate) - Date.parse(todayIso)) / MS_PER_DAY);
}

function urgencyFor(days: number): Reminder["urgency"] {
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 3) return "soon";
  return "upcoming";
}

function humanDays(days: number): string {
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "today";
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

const FRIENDLY_TYPE: Record<string, string> = {
  interview: "Interview",
  assessment: "Online assessment",
  coding_test: "Coding test",
  deadline: "Application deadline",
  follow_up: "Follow-up reminder",
  other: "Event"
};

export interface UpcomingEventRow {
  id: number;
  application_id: number | null;
  title: string;
  event_type: string;
  event_date: string;
  event_time: string;
  notes: string;
  completed: number;
  app_company?: string | null;
  app_job_title?: string | null;
}

export interface DeadlineRow {
  id: number;
  company: string;
  job_title: string;
  deadline_at: string;
  status: string;
}

const CLOSED = ["accepted", "rejected", "withdrawn"];

/**
 * Builds the reminder list. `todayIso` is a YYYY-MM-DD string so tests are
 * deterministic. Events count as reminders from 7 days out until completed;
 * open application deadlines count from 7 days out and stay while overdue.
 */
export function buildReminders(
  events: UpcomingEventRow[],
  deadlines: DeadlineRow[],
  todayIso: string,
  horizonDays = 7
): Reminder[] {
  const out: Reminder[] = [];

  for (const e of events) {
    if (!e.event_date || e.completed) continue;
    const days = daysUntil(e.event_date, todayIso);
    if (days < -horizonDays || days > horizonDays) continue;
    const label = FRIENDLY_TYPE[e.event_type] ?? "Event";
    const where = e.app_company ? ` — ${e.app_company}${e.app_job_title ? ` (${e.app_job_title})` : ""}` : "";
    out.push({
      source: "event",
      date: e.event_date,
      days_until: days,
      title: `${label}: ${e.title}`,
      detail: `${humanDays(days)}${e.event_time ? ` at ${e.event_time}` : ""}${where}`,
      kind: (e.event_type as Reminder["kind"]) in FRIENDLY_TYPE ? (e.event_type as Reminder["kind"]) : "other",
      event_id: e.id,
      application_id: e.application_id ?? undefined,
      urgency: urgencyFor(days)
    });
  }

  for (const a of deadlines) {
    if (!a.deadline_at) continue;
    const days = daysUntil(a.deadline_at, todayIso);
    if (days < -horizonDays || days > horizonDays) continue;
    out.push({
      source: "application_deadline",
      date: a.deadline_at,
      days_until: days,
      title: `Apply by ${a.deadline_at}: ${a.company} — ${a.job_title}`,
      detail: `${humanDays(days)} · status: ${a.status.replace("_", " ")}`,
      kind: "deadline",
      application_id: a.id,
      urgency: urgencyFor(days)
    });
  }

  // Most urgent first; overdue and same-day before far-out items.
  return out.sort((a, b) => a.days_until - b.days_until || a.date.localeCompare(b.date));
}

/** Database fetch + reminder build for one user. Lives here so the API stays thin. */
export async function remindersForUser(
  runQuery: (sql: string, args: (string | number)[]) => Promise<{ rows: any[] }>,
  userId: number,
  horizonDays = 7
): Promise<Reminder[]> {
  const today = new Date().toISOString().slice(0, 10);
  const horizonStart = new Date(Date.now() - horizonDays * MS_PER_DAY).toISOString().slice(0, 10);
  const horizonEnd = new Date(Date.now() + horizonDays * MS_PER_DAY).toISOString().slice(0, 10);

  const eventsRes = await runQuery(
    `SELECT e.id, e.application_id, e.title, e.event_type, e.event_date, e.event_time, e.notes, e.completed,
            a.company AS app_company, a.job_title AS app_job_title
       FROM events e LEFT JOIN applications a ON a.id = e.application_id
      WHERE e.user_id = ? AND e.completed = 0
        AND e.event_date >= ? AND e.event_date <= ?
      ORDER BY e.event_date ASC`,
    [userId, horizonStart, horizonEnd]
  );

  const deadRes = await runQuery(
    `SELECT id, company, job_title, deadline_at, status FROM applications
      WHERE user_id = ? AND deadline_at IS NOT NULL AND deadline_at != ''
        AND status NOT IN ('accepted','rejected','withdrawn')
        AND deadline_at >= ? AND deadline_at <= ?
      ORDER BY deadline_at ASC`,
    [userId, horizonStart, horizonEnd]
  );

  return buildReminders(
    eventsRes.rows as UpcomingEventRow[],
    deadRes.rows as DeadlineRow[],
    today,
    horizonDays
  );
}
