import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { STATUSES, STATUS_ORDER, type StatusId } from "../../../shared/status";
import { StatusPill, StatusIcon } from "../components/StatusPill";

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function ApplicationDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [app, setApp] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [resumes, setResumes] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [statusNote, setStatusNote] = useState("");
  const [tailorMsg, setTailorMsg] = useState("");
  const [newEvent, setNewEvent] = useState({ title: "", event_type: "interview", event_date: "", event_time: "" });

  const load = useCallback(async () => {
    try {
      const [a, h, r, e] = await Promise.all([
        api(`/applications/${id}`),
        api(`/applications/${id}/history`),
        api("/resumes"),
        api(`/events?application_id=${id}`)
      ]);
      setApp(a.application);
      setHistory(h.history);
      setResumes(r.resumes);
      setEvents(e.events);
      setForm({
        company: a.application.company, job_title: a.application.job_title,
        job_id_number: a.application.job_id_number ?? "", location: a.application.location ?? "",
        date_applied: a.application.date_applied ?? "", deadline_at: a.application.deadline_at ?? "",
        posting_url: a.application.posting_url ?? "", apply_url: a.application.apply_url ?? "",
        recruiter_name: a.application.recruiter_name ?? "", recruiter_email: a.application.recruiter_email ?? "",
        notes: a.application.notes ?? "", job_description: a.application.job_description ?? ""
      });
    } catch (err: any) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</div>;
  if (!app) return <div className="py-20 text-center text-slate-400">Loading application…</div>;

  const save = async () => {
    setBusy("save");
    try {
      const data = await api(`/applications/${id}`, { method: "PATCH", body: form });
      setApp(data.application);
      setEdit(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const changeStatus = async (status: string) => {
    setBusy("status");
    try {
      await api(`/applications/${id}`, { method: "PATCH", body: { status, status_note: statusNote } });
      setStatusNote("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const attachResume = async (resumeId: string) => {
    setBusy("resume");
    try {
      await api(`/applications/${id}`, { method: "PATCH", body: { resume_id: Number(resumeId) } });
      await load();
    } finally {
      setBusy("");
    }
  };

  const tailor = async () => {
    setBusy("tailor");
    setTailorMsg("");
    try {
      const baseId = app.resume_id ?? resumes[0]?.id;
      if (!baseId) {
        setTailorMsg("Upload a resume in the Resume Vault first, then come back to tailor it for this role.");
        return;
      }
      const data = await api("/tailor", {
        body: { resume_id: baseId, application_id: Number(id), label: `${app.company} — ${app.job_title} (tailored)` }
      });
      await api(`/applications/${id}`, { method: "PATCH", body: { resume_id: data.resume_id } });
      await load();
      setTailorMsg(
        data.used_echo
          ? "Tailored using the built-in template engine (AI_PROVIDER=echo). Add an AI key in .env for full AI rewriting."
          : `Tailored with ${data.provider} (${data.model}).`
      );
    } catch (e: any) {
      setTailorMsg(e.message);
    } finally {
      setBusy("");
    }
  };

  const addEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.title || !newEvent.event_date) return;
    setBusy("event");
    try {
      await api("/events", { body: { ...newEvent, application_id: Number(id) } });
      setNewEvent({ title: "", event_type: "interview", event_date: "", event_time: "" });
      await load();
    } finally {
      setBusy("");
    }
  };

  const deleteApp = async () => {
    if (!confirm("Delete this application? Status history is removed too.")) return;
    await api(`/applications/${id}`, { method: "DELETE" });
    nav("/applications");
  };

  const currentStage = STATUSES[app.status as StatusId]?.stage ?? "interested";
  const timelineStages: { id: string; label: string }[] = [
    { id: "interested", label: "Saved" },
    { id: "applied", label: "Applied" },
    { id: "assessment", label: "Assessment" },
    { id: "shortlist", label: "Shortlisted" },
    { id: "interview", label: "Interview" },
    { id: "offer", label: "Offer" }
  ];
  const closedStatuses = ["accepted", "rejected", "withdrawn"];
  const reachedIdx = timelineStages.findIndex((s) => s.id === currentStage);

  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => nav("/applications")} className="mb-3 text-sm text-slate-500 hover:text-slate-700">← All applications</button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{app.job_title}</h1>
            <p className="text-slate-600">{app.company} · {app.location || "Location unspecified"}</p>
          </div>
          <StatusPill status={app.status} size="md" />
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Progress timeline</h2>
        {closedStatuses.includes(app.status) && (
          <div className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
            This application is closed as <b>{STATUSES[app.status as StatusId]?.label}</b>.
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-y-4">
          {timelineStages.map((s, i) => {
            const reached = !closedStatuses.includes(app.status) && i <= reachedIdx;
            return (
              <div key={s.id} className="flex items-center">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${reached ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-400"}`}>
                  {reached ? <StatusIcon icon="check-circle" className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`ml-2 text-xs font-medium ${reached ? "text-slate-800" : "text-slate-400"}`}>{s.label}</span>
                {i < timelineStages.length - 1 && <div className={`mx-3 h-0.5 w-8 ${i < reachedIdx ? "bg-brand-600" : "bg-slate-200"}`} />}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs font-medium text-slate-600">Update status</label>
            <select className={inputCls} value="" onChange={(e) => e.target.value && changeStatus(e.target.value)} disabled={busy === "status"}>
              <option value="">Select new status…</option>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUSES[s].label}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-48">
            <label className="text-xs font-medium text-slate-600">Note (optional)</label>
            <input className={inputCls} placeholder="e.g. Recruiter contacted me" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Statuses are maintained manually unless a verified company integration provides updates.
        </p>
      </div>

      {/* Status history */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Status history</h2>
        <ul className="mt-3 space-y-2.5">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-400">{new Date(h.created_at).toLocaleString()}</span>
              {h.previous_status ? (
                <>
                  <StatusPill status={h.previous_status} />
                  <span className="text-slate-400">→</span>
                </>
              ) : (
                <span className="text-slate-400">created as</span>
              )}
              <StatusPill status={h.new_status} />
              {h.notes && <span className="text-xs text-slate-500">({h.notes})</span>}
            </li>
          ))}
        </ul>
      </div>

      {/* Resume */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Resume used</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {app.resume_id ? (
            <>
              <span className="text-sm text-slate-700">Resume #{app.resume_id}</span>
              <a href={`/api/resumes/${app.resume_id}/download`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">Download submitted copy</a>
              <a href={`/api/resumes/${app.resume_id}/pdf`} target="_blank" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">View PDF</a>
            </>
          ) : (
            <span className="text-sm text-slate-400">No resume attached yet.</span>
          )}
          <select className={`${inputCls} max-w-xs`} value="" onChange={(e) => e.target.value && attachResume(e.target.value)} disabled={busy === "resume"}>
            <option value="">Attach a different resume…</option>
            {resumes.map((r) => <option key={r.id} value={r.id}>#{r.id} · {r.label || r.filename} ({r.kind})</option>)}
          </select>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={tailor} disabled={busy === "tailor"}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy === "tailor" ? "Tailoring…" : "✨ Generate job-specific resume"}
          </button>
          <span className="text-xs text-slate-400">Uses this application's job description to tailor your attached resume.</span>
        </div>
        {tailorMsg && <div className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{tailorMsg}</div>}
      </div>

      {/* Events */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Interviews & assessments</h2>
        {events.length > 0 && (
          <ul className="mt-3 space-y-2">
            {events.map((e: any) => (
              <li key={e.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span>{e.title} · {e.event_date} {e.event_time}</span>
                <span className="text-xs uppercase text-slate-400">{e.event_type.replace("_", " ")}</span>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addEvent} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-40">
            <label className="text-xs font-medium text-slate-600">Event title</label>
            <input className={inputCls} placeholder="Technical interview" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Type</label>
            <select className={inputCls} value={newEvent.event_type} onChange={(e) => setNewEvent({ ...newEvent, event_type: e.target.value })}>
              <option value="interview">Interview</option>
              <option value="assessment">Assessment</option>
              <option value="coding_test">Coding test</option>
              <option value="deadline">Deadline</option>
              <option value="follow_up">Follow-up</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Date</label>
            <input type="date" className={inputCls} value={newEvent.event_date} onChange={(e) => setNewEvent({ ...newEvent, event_date: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Time</label>
            <input type="time" className={inputCls} value={newEvent.event_time} onChange={(e) => setNewEvent({ ...newEvent, event_time: e.target.value })} />
          </div>
          <button disabled={busy === "event"} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">Add</button>
        </form>
      </div>

      {/* Details */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Application details</h2>
          <div className="flex gap-2">
            {app.posting_url && <a href={app.posting_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-600 hover:underline">View posting ↗</a>}
            {app.apply_url && <a href={app.apply_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-600 hover:underline">Apply page ↗</a>}
            <button onClick={() => setEdit((v) => !v)} className="text-xs font-medium text-brand-600 hover:underline">{edit ? "Cancel" : "Edit"}</button>
          </div>
        </div>
        {!edit ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
            {[
              ["Job ID / requisition", app.job_id_number],
              ["Date applied", app.date_applied],
              ["Deadline", app.deadline_at],
              ["Employment type", app.employment_type?.replace("_", " ")],
              ["Recruiter", [app.recruiter_name, app.recruiter_email].filter(Boolean).join(" · ")],
              ["Source", app.source?.replace("_", " ")]
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-xs text-slate-400">{k}</dt>
                <dd className="text-slate-800">{v || "—"}</dd>
              </div>
            ))}
            <div className="col-span-2 md:col-span-3">
              <dt className="text-xs text-slate-400">Notes</dt>
              <dd className="whitespace-pre-wrap text-slate-800">{app.notes || "—"}</dd>
            </div>
            {app.job_description && (
              <div className="col-span-2 md:col-span-3">
                <dt className="text-xs text-slate-400">Job description</dt>
                <dd className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{app.job_description}</dd>
              </div>
            )}
          </dl>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {([
              ["company", "Company"], ["job_title", "Job title"], ["job_id_number", "Job ID"],
              ["location", "Location"], ["date_applied", "Date applied"], ["deadline_at", "Deadline"],
              ["posting_url", "Posting URL"], ["apply_url", "Application URL"],
              ["recruiter_name", "Recruiter name"], ["recruiter_email", "Recruiter email"]
            ] as const).map(([k, label]) => (
              <div key={k}>
                <label className="text-xs font-medium text-slate-600">{label}</label>
                <input className={inputCls} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600">Notes</label>
              <textarea rows={2} className={inputCls} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600">Job description (used for AI tailoring)</label>
              <textarea rows={5} className={inputCls} value={form.job_description ?? ""} onChange={(e) => setForm({ ...form, job_description: e.target.value })} />
            </div>
            <div className="col-span-2 flex justify-end gap-2">
              <button onClick={deleteApp} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">Delete</button>
              <button onClick={save} disabled={busy === "save"} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                {busy === "save" ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
