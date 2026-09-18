import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../auth";

interface Job {
  id: number;
  source: string;
  company: string;
  title: string;
  location: string;
  work_mode: string;
  employment_type: string;
  experience_level: string;
  description: string;
  skills: string;
  salary: string | null;
  url: string;
  apply_url: string;
  deadline_at: string | null;
  published_at: string | null;
  score: number;
  matched_skills: string[];
  missing_skills: string[];
  match_reasons: string[];
}

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

const WORK_MODES = [
  { v: "", l: "Any work mode" },
  { v: "remote", l: "Remote" },
  { v: "hybrid", l: "Hybrid" },
  { v: "onsite", l: "On-site" }
];
const EMP_TYPES = [
  { v: "", l: "Any type" },
  { v: "internship", l: "Internship" },
  { v: "full_time", l: "Full-time" },
  { v: "part_time", l: "Part-time" },
  { v: "contract", l: "Contract" }
];
const EXP_LEVELS = [
  { v: "", l: "Any level" },
  { v: "internship", l: "Internship" },
  { v: "entry", l: "Entry level" },
  { v: "mid", l: "Mid" },
  { v: "senior", l: "Senior" }
];

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-800",
    violet: "bg-violet-100 text-violet-700"
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone] ?? tones.slate}`}>{children}</span>;
}

function JobCard({ job, onSaved, onApply }: { job: Job; onSaved: (id: number) => void; onApply: (job: Job) => void }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    await api(`/jobs/${job.id}/save`, { method: "POST" });
    setSaved(true);
    onSaved(job.id);
  };

  const logoChar = job.company?.[0]?.toUpperCase() ?? "?";
  const daysAgo = job.published_at ? Math.floor((Date.now() - Date.parse(job.published_at)) / 86400000) : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-base font-bold text-brand-700">{logoChar}</span>
          <div>
            <h3 className="font-semibold leading-tight text-slate-900">{job.title}</h3>
            <div className="mt-0.5 text-sm text-slate-600">
              {job.company} · {job.location || "Location unspecified"}
            </div>
          </div>
        </div>
        {job.score > 0 && (
          <div className="shrink-0 rounded-lg bg-emerald-50 px-2.5 py-1 text-right">
            <div className="text-sm font-bold text-emerald-700">{Math.min(99, job.score)}% match</div>
            <div className="text-[10px] text-emerald-600">for you</div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {job.work_mode !== "unknown" && <Badge tone={job.work_mode === "remote" ? "green" : "blue"}>{job.work_mode}</Badge>}
        {job.employment_type !== "other" && <Badge>{job.employment_type.replace("_", " ")}</Badge>}
        <Badge tone="violet">{job.experience_level}</Badge>
        {job.salary && <Badge tone="amber">{job.salary}</Badge>}
        {job.source && <Badge tone="slate">via {job.source.replace("_", " ")}</Badge>}
      </div>

      {job.match_reasons.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
          {job.match_reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="flex gap-1.5"><span className="text-emerald-600">✓</span>{r}</li>
          ))}
          {job.matched_skills.length > 0 && (
            <li className="pt-1">
              <span className="font-medium">Matched skills:</span> {job.matched_skills.slice(0, 8).join(", ")}
              {job.missing_skills.length > 0 && (
                <span className="ml-2 text-slate-400">Not mentioned in your profile: {job.missing_skills.slice(0, 5).join(", ")}</span>
              )}
            </li>
          )}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>{daysAgo !== null && daysAgo >= 0 ? `Posted ${daysAgo === 0 ? "today" : `${daysAgo}d ago`}` : ""}</span>
        {job.deadline_at && <span>Apply by <b className="text-slate-600">{job.deadline_at}</b></span>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <a href={job.apply_url || job.url} target="_blank" rel="noreferrer noopener"
          className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
          Apply ↗
        </a>
        <button onClick={onApply ? () => onApply(job) : undefined} disabled={!onApply}
          className="rounded-lg border border-brand-300 bg-brand-50 px-3.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50">
          Track
        </button>
        <button onClick={() => setOpen((v) => !v)} className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
          {open ? "Hide details" : "Details"}
        </button>
        <button onClick={save} disabled={saved}
          className="ml-auto rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-40">
          {saved ? "★ Saved" : "☆ Save"}
        </button>
      </div>

      {open && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {job.description ? job.description.slice(0, 4000) : "No description provided by the source."}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.skills ? job.skills.split(",").filter(Boolean).map((s) => <Badge key={s} tone="blue">{s.trim()}</Badge>) : null}
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            Source: {job.source} · First seen {job.published_at ? new Date(job.published_at).toLocaleDateString() : "recently"} ·
            Always verify details on the official page before applying.
          </p>
        </div>
      )}
    </div>
  );
}

export function JobsPage() {
  const nav = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [companies, setCompanies] = useState<string[]>([]);
  const [withDeadlines, setWithDeadlines] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const [filters, setFilters] = useState({
    q: "", company: "", role: "", domain: "", skill: "", location: "",
    work_mode: "", employment_type: "", experience_level: "", source: "", sort: "relevance"
  });
  const moreFiltersActive = [filters.company, filters.role, filters.domain, filters.skill, filters.experience_level, filters.source].filter(Boolean).length;

  const load = useCallback(async (p: number, append: boolean) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(p), page_size: "12", ...filters });
      for (const [k, v] of [...params.entries()]) if (!v) params.delete(k);
      const data = await api(`/jobs?${params.toString()}`);
      setJobs((prev) => (append ? [...prev, ...data.jobs] : data.jobs));
      setTotal(data.total);
      setHasMore(data.has_more);
      setWithDeadlines(data.with_deadlines ?? 0);
      setPage(p);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(1, false); }, [load]);
  useEffect(() => {
    api("/jobs/filters").then((d) => setCompanies(d.companies ?? [])).catch(() => {});
  }, []);

  const trackApplication = async (job: Job) => {
    try {
      const data = await api("/applications", {
        body: {
          company: job.company,
          job_title: job.title,
          job_description: job.description,
          posting_url: job.url,
          apply_url: job.apply_url || job.url,
          location: job.location,
          employment_type: job.employment_type,
          status: "ready_to_apply",
          source: "job_discovery",
          job_id: job.id
        }
      });
      nav(`/applications/${data.application.id}`);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Job Discovery</h1>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card md:p-5">
        {/* Row 1: search + location + sort */}
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-6">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Search</label>
            <input className={inputCls} placeholder="Title, company, description…"
              value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          </div>
          <div className="md:col-span-3">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Location</label>
            <input className={inputCls} placeholder="e.g. Bengaluru" value={filters.location}
              onChange={(e) => setFilters({ ...filters, location: e.target.value })} />
          </div>
          <div className="md:col-span-3">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sort by</label>
            <select className={inputCls} value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
              <option value="relevance">Relevance to me</option>
              <option value="newest">Newest</option>
              <option value="deadline" disabled={withDeadlines === 0}>
                Closing soon{withDeadlines === 0 ? " (none listed)" : ""}
              </option>
            </select>
          </div>
        </div>

        {/* Row 2: the three quick filters */}
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Work mode</label>
            <select className={inputCls} value={filters.work_mode} onChange={(e) => setFilters({ ...filters, work_mode: e.target.value })}>
              {WORK_MODES.map((w) => <option key={w.v} value={w.v}>{w.l}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Employment type</label>
            <select className={inputCls} value={filters.employment_type} onChange={(e) => setFilters({ ...filters, employment_type: e.target.value })}>
              {EMP_TYPES.map((w) => <option key={w.v} value={w.v}>{w.l}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => setShowMore((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              More filters
              {moreFiltersActive > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{moreFiltersActive}</span>}
              <svg className={`h-4 w-4 transition-transform ${showMore ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Collapsible advanced filters */}
        {showMore && (
          <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Company</label>
              <select className={inputCls} value={filters.company} onChange={(e) => setFilters({ ...filters, company: e.target.value })}>
                <option value="">Any company</option>
                {companies.map((c) => <option key={c} value={c.toLowerCase()}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Role</label>
              <input className={inputCls} placeholder="e.g. backend" value={filters.role}
                onChange={(e) => setFilters({ ...filters, role: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Skill</label>
              <input className={inputCls} placeholder="e.g. react" value={filters.skill}
                onChange={(e) => setFilters({ ...filters, skill: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Experience level</label>
              <select className={inputCls} value={filters.experience_level} onChange={(e) => setFilters({ ...filters, experience_level: e.target.value })}>
                {EXP_LEVELS.map((w) => <option key={w.v} value={w.v}>{w.l}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Domain</label>
              <input className={inputCls} placeholder="e.g. ml" value={filters.domain}
                onChange={(e) => setFilters({ ...filters, domain: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Source</label>
              <select className={inputCls} value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
                <option value="">Any source</option>
                <option value="greenhouse">Greenhouse</option>
                <option value="workable">Workable</option>
                <option value="remotive">Remotive</option>
                <option value="career_page">Career page</option>
                <option value="user">Manual</option>
              </select>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-500">{loading ? "Loading…" : <><b className="text-slate-800">{total}</b> matching job{total === 1 ? "" : "s"}</>}</span>
          <button onClick={() => { setFilters({ q: "", company: "", role: "", domain: "", skill: "", location: "", work_mode: "", employment_type: "", experience_level: "", source: "", sort: "relevance" }); }}
            className="text-xs font-medium text-brand-600 hover:underline">Clear all filters</button>
        </div>
      </div>

      {error && <div className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</div>}
      {!loading && jobs.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="font-medium text-slate-600">No jobs match your filters yet.</p>
          <p className="mt-1 text-sm text-slate-400">
            Job sources are configured by your admin. Until sources are synced, you can still{" "}
            <Link className="text-brand-600 hover:underline" to="/applications?new=1">add applications manually</Link>.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {jobs.map((j) => <JobCard key={j.id} job={j} onSaved={() => {}} onApply={trackApplication} />)}
      </div>

      {hasMore && (
        <div className="text-center">
          <button onClick={() => load(page + 1, true)} disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
