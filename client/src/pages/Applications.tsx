import React, { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { STATUSES, STATUS_ORDER } from "../../../shared/status";
import { StatusPill } from "../components/StatusPill";

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function AddApplicationModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [form, setForm] = useState<Record<string, string>>({ status: "interested", employment_type: "full_time", source: "manual" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/applications", { body: form });
      onCreated(data.application.id);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  const FIELDS: { key: string; label: string; type?: string; full?: boolean; placeholder?: string }[] = [
    { key: "company", label: "Company *", placeholder: "Acme Corp" },
    { key: "job_title", label: "Job title *", placeholder: "Software Engineer" },
    { key: "job_id_number", label: "Job ID / requisition" },
    { key: "location", label: "Location", placeholder: "Remote / Bengaluru" },
    { key: "date_applied", label: "Date applied", type: "date" },
    { key: "deadline_at", label: "Application deadline", type: "date" },
    { key: "posting_url", label: "Job posting URL", placeholder: "https://…" },
    { key: "apply_url", label: "Application URL", placeholder: "https://…" },
    { key: "recruiter_name", label: "Recruiter name" },
    { key: "recruiter_email", label: "Recruiter email", type: "email" }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Add application</h2>
        <p className="text-sm text-slate-500">Record a role you applied to (or plan to apply) anywhere on the web.</p>
        <form onSubmit={submit} className="mt-4 grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="text-xs font-medium text-slate-600">{f.label}</label>
              <input
                type={f.type ?? "text"}
                placeholder={f.placeholder}
                className={inputCls}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </div>
          ))}
          <div>
            <label className="text-xs font-medium text-slate-600">Employment type</label>
            <select className={inputCls} value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })}>
              <option value="full_time">Full-time</option>
              <option value="internship">Internship</option>
              <option value="part_time">Part-time</option>
              <option value="contract">Contract</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Initial status</label>
            <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUSES[s].label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-slate-600">Job description (paste the JD for AI tailoring)</label>
            <textarea rows={4} className={inputCls} value={form.job_description ?? ""}
              onChange={(e) => setForm({ ...form, job_description: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-slate-600">Notes</label>
            <textarea rows={2} className={inputCls} value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {error && <div className="col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <div className="col-span-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">Cancel</button>
            <button disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy ? "Saving…" : "Create application"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ApplicationsPage() {
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [params] = useSearchParams();

  useEffect(() => {
    if (params.get("new") === "1") setShowAdd(true);
    if (params.get("status")) setStatus(params.get("status")!);
  }, [params]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (q) p.set("q", q);
      const data = await api(`/applications?${p.toString()}`);
      setApps(data.applications);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [status, q]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Applications</h1>
        </div>
        <button onClick={() => setShowAdd(true)} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          + Add application
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-card">
        <input className={`${inputCls} max-w-xs`} placeholder="Search company or title…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${inputCls} max-w-xs`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUSES[s].label}</option>)}
        </select>
        <span className="ml-auto text-xs text-slate-400">{loading ? "Loading…" : `${apps.length} application${apps.length === 1 ? "" : "s"}`}</span>
      </div>

      {error && <div className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</div>}

      {loading ? (
        <div className="py-20 text-center text-slate-400">Loading applications…</div>
      ) : apps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="font-medium text-slate-600">No applications here yet.</p>
          <p className="mt-1 text-sm text-slate-400">
            Track one from <Link className="text-brand-600 hover:underline" to="/jobs">Job Discovery</Link> or add one manually.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((a) => (
            <Link key={a.id} to={`/applications/${a.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 shadow-card transition hover:border-brand-300">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">{a.job_title}</div>
                  <div className="text-sm text-slate-600">{a.company} · {a.location || "Location unspecified"}</div>
                </div>
                <StatusPill status={a.status} size="md" />
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
                {a.date_applied && <span>Applied {a.date_applied}</span>}
                {a.deadline_at && <span>Deadline {a.deadline_at}</span>}
                <span>Source: {a.source.replace("_", " ")}</span>
                {a.resume_id && <span className="text-emerald-600">Resume attached</span>}
              </div>
              {a.notes && <p className="mt-2 line-clamp-1 text-xs text-slate-500">{a.notes}</p>}
            </Link>
          ))}
        </div>
      )}

      {showAdd && (
        <AddApplicationModal
          onClose={() => { setShowAdd(false); }}
          onCreated={(id) => { setShowAdd(false); window.location.assign(`/applications/${id}`); }}
        />
      )}
    </div>
  );
}
