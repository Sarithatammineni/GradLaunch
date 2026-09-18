import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../auth";

interface DashboardData {
  cards: { total: number; in_progress: number; shortlisted: number; interviews: number; offers: number; rejected: number; upcoming_deadlines: number };
  funnel: Record<string, number>;
  upcoming_events: any[];
  activity: any[];
  notifications: any[];
  reminders: any[];
  saved_jobs: number;
}

const PILL_STYLES: Record<string, string> = {
  application_added: "bg-emerald-50 text-emerald-700",
  application_updated: "bg-blue-50 text-blue-700",
  resume_uploaded: "bg-violet-50 text-violet-700",
  resume_generated: "bg-violet-50 text-violet-700",
  interview_scheduled: "bg-amber-50 text-amber-700",
  job_saved: "bg-slate-100 text-slate-600",
  source_synced: "bg-slate-100 text-slate-600",
  account_created: "bg-brand-50 text-brand-700"
};
const PILL_LABELS: Record<string, string> = {
  application_added: "Applied",
  application_updated: "Update",
  resume_uploaded: "Upload",
  resume_generated: "Generate",
  interview_scheduled: "Scheduled",
  job_saved: "Saved",
  source_synced: "Sync",
  account_created: "Account"
};

const DONUT_COLORS = ["#1d76ef", "#3395fb", "#59b6ff", "#8ed0ff", "#155fdd", "#93c5fd"];

export function DashboardPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/dashboard").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</div>;
  if (!data) return <div className="py-20 text-center text-slate-400">Loading dashboard…</div>;

  const { cards, funnel } = data;
  const funnelSteps = [
    { key: "interested", label: "Interested" },
    { key: "applied", label: "Applied" },
    { key: "assessment", label: "Assessment" },
    { key: "shortlist", label: "Shortlisted" },
    { key: "interview", label: "Interview" },
    { key: "offer", label: "Offer" }
  ];

  const reminders: any[] = data.reminders ?? [];
  const urgencyStyles: Record<string, string> = {
    overdue: "bg-rose-50 text-rose-700 border-rose-200",
    today: "bg-amber-50 text-amber-800 border-amber-200",
    soon: "bg-brand-50 text-brand-700 border-brand-200",
    upcoming: "bg-slate-50 text-slate-600 border-slate-200"
  };
  const urgencyLabel: Record<string, string> = {
    overdue: "Overdue", today: "Today", soon: "Soon", upcoming: "Upcoming"
  };

  // Donut geometry
  const R = 54;
  const C = 2 * Math.PI * R;
  const donutTotal = funnelSteps.reduce((n, s) => n + (funnel[s.key] ?? 0), 0) || 1;
  let acc = 0;
  const segments = funnelSteps.map((s, i) => {
    const v = funnel[s.key] ?? 0;
    const frac = v / donutTotal;
    const seg = { ...s, v, color: DONUT_COLORS[i % DONUT_COLORS.length]!, dash: frac * C, offset: acc };
    acc += frac * C;
    return seg;
  });

  const heroTiles = [
    { label: "Total Applications", value: cards.total, to: "/applications" },
    { label: "In Progress", value: cards.in_progress, to: "/applications" },
    { label: "Shortlisted+", value: cards.shortlisted, to: "/applications?status=shortlisted" }
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-slate-900">Dashboard</span>
          <span className="text-slate-300">·</span>
          <Link to="/analytics" className="text-slate-400 hover:text-slate-600">Analytics</Link>
        </nav>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => nav("/applications?new=1")} className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">Add Application</button>
          <button onClick={() => nav("/jobs")} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Find Jobs</button>
        </div>
      </div>

      {/* Hero overview band */}
      <div className="rounded-2xl bg-gradient-to-r from-brand-700 via-brand-500 to-brand-400 p-4 shadow-card md:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/95">Placement Overview</h2>
          <span className="text-xs text-white/70">{new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {heroTiles.map((t) => (
            <Link key={t.label} to={t.to}
              className="rounded-xl bg-white/95 px-5 py-4 shadow-sm backdrop-blur transition hover:bg-white">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">{t.label}</div>
              <div className="mt-1 text-3xl font-bold text-slate-900">{t.value}</div>
            </Link>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/85">
          <Link to="/calendar" className="hover:underline"><b>{cards.interviews}</b> interviews</Link>
          <Link to="/applications?status=offer_received" className="hover:underline"><b>{cards.offers}</b> offers</Link>
          <Link to="/applications?status=rejected" className="hover:underline"><b>{cards.rejected}</b> rejected</Link>
          <Link to="/calendar" className="hover:underline"><b>{cards.upcoming_deadlines}</b> upcoming deadlines</Link>
        </div>
      </div>

      {/* Funnel donut + upcoming events */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold text-slate-800">Application Funnel</h2>
          {cards.total === 0 ? (
            <p className="mt-6 text-sm text-slate-400">
              No applications yet. <Link to="/jobs" className="text-brand-600 hover:underline">Find jobs</Link> to start your funnel.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-6">
              <svg width="150" height="150" viewBox="0 0 150 150" className="shrink-0">
                <circle cx="75" cy="75" r={R} fill="none" stroke="#f1f5f9" strokeWidth="14" />
                {segments.filter((s) => s.v > 0).map((s) => (
                  <circle key={s.key} cx="75" cy="75" r={R} fill="none" stroke={s.color} strokeWidth="14"
                    strokeDasharray={`${s.dash} ${C - s.dash}`} strokeDashoffset={-s.offset}
                    transform="rotate(-90 75 75)" strokeLinecap="butt" />
                ))}
                <text x="75" y="72" textAnchor="middle" className="fill-slate-400 text-[10px]">Students</text>
                <text x="75" y="90" textAnchor="middle" className="fill-slate-900 text-[20px] font-bold">{cards.total}</text>
              </svg>
              <ul className="min-w-[160px] flex-1 space-y-2">
                {segments.map((s) => (
                  <li key={s.key} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                    <span className="flex-1 text-slate-600">{s.label}</span>
                    <span className="font-semibold text-slate-800">{s.v}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Upcoming & Reminders</h2>
            <Link to="/calendar" className="text-xs font-medium text-brand-600 hover:underline">View all</Link>
          </div>
          {reminders.length === 0 && data.upcoming_events.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">Nothing scheduled and no deadlines in the next 7 days.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {reminders.slice(0, 4).map((r) => (
                <li key={`${r.source}-${r.event_id ?? r.application_id}-${r.date}`}
                  className={`flex items-start justify-between gap-3 rounded-lg border p-2.5 ${urgencyStyles[r.urgency] ?? urgencyStyles.upcoming}`}>
                  <div>
                    <div className="text-xs font-semibold">{r.title}</div>
                    <div className="text-[11px] opacity-80">{r.detail}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">{urgencyLabel[r.urgency] ?? r.urgency}</span>
                </li>
              ))}
              {data.upcoming_events.slice(0, 3).map((e: any) => (
                <li key={`e-${e.id}`} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-2.5">
                  <div>
                    <div className="text-xs font-medium text-slate-800">{e.title}</div>
                    <div className="text-[11px] text-slate-500">{e.event_date}{e.event_time ? ` · ${e.event_time}` : ""}</div>
                  </div>
                  {e.application_id && <Link to={`/applications/${e.application_id}`} className="text-[11px] font-medium text-brand-600 hover:underline">Open</Link>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Recent Activities</h2>
          <Link to="/applications" className="text-xs font-medium text-brand-600 hover:underline">View All</Link>
        </div>
        {data.activity.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No activity yet — add your first application to get started.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {data.activity.map((a: any) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800">{a.message}</div>
                  <div className="text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${PILL_STYLES[a.kind] ?? "bg-slate-100 text-slate-600"}`}>
                  {PILL_LABELS[a.kind] ?? "Event"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
