import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export function ResumeVaultPage() {
  const [resumes, setResumes] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [uploadMsg, setUploadMsg] = useState("");
  const [preview, setPreview] = useState<any | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([api("/resumes"), api("/applications")]);
      setResumes(r.resumes);
      setApplications(a.applications);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setUploadMsg("Choose a PDF, DOCX or TXT resume file first.");
      return;
    }
    setBusy("upload");
    setUploadMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (labelRef.current?.value) fd.append("label", labelRef.current.value);
      const data = await api("/resumes", { method: "POST", form: fd });
      setUploadMsg(`Uploaded and parsed "${data.resume.filename}". Review the parsed sections and edit if needed.`);
      if (fileRef.current) fileRef.current.value = "";
      if (labelRef.current) labelRef.current.value = "";
      await load();
    } catch (e: any) {
      setUploadMsg(e.message);
    } finally {
      setBusy("");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this resume version? Applications referencing it keep their other data.")) return;
    await api(`/resumes/${id}`, { method: "DELETE" });
    await load();
  };

  const openPreview = async (id: number) => {
    setBusy(`preview-${id}`);
    try {
      const data = await api(`/resumes/${id}`);
      setPreview(data.resume);
    } finally {
      setBusy("");
    }
  };

  const tailorFor = async (resumeId: number, appId: string) => {
    if (!appId) return;
    setBusy(`tailor-${resumeId}`);
    try {
      const data = await api("/tailor", { body: { resume_id: resumeId, application_id: Number(appId) } });
      await load();
      alert(
        data.used_echo
          ? `Template-tailored resume created (resume #${data.resume_id}). Add an AI key in .env for full AI rewriting.`
          : `Tailored resume created with ${data.provider} (resume #${data.resume_id}).`
      );
    } catch (e: any) {
      alert(`Tailoring failed: ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Resume Vault</h1>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Upload a resume</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600">File (PDF, DOCX or TXT)</label>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="block text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Label</label>
            <input ref={labelRef} placeholder="Master resume" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button onClick={upload} disabled={busy === "upload"}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy === "upload" ? "Uploading…" : "Upload & parse"}
          </button>
        </div>
        {uploadMsg && <div className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{uploadMsg}</div>}
      </div>

      {error && <div className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        {resumes.length === 0 && !error && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center md:col-span-2">
            <p className="font-medium text-slate-600">No resumes yet.</p>
            <p className="mt-1 text-sm text-slate-400">Upload your master resume to get started.</p>
          </div>
        )}
        {resumes.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-900">{r.label || r.filename}</div>
                <div className="text-xs text-slate-400">
                  {r.kind === "tailored" ? "AI-tailored version" : "Uploaded"} · #{r.id} ·{" "}
                  {new Date(r.created_at).toLocaleString()} · {(r.size_bytes / 1024).toFixed(1)} KB
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${r.kind === "tailored" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>
                {r.kind}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => openPreview(r.id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                {busy === `preview-${r.id}` ? "Loading…" : "Preview parsed text"}
              </button>
              <a href={`/api/resumes/${r.id}/pdf`} target="_blank" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                PDF preview
              </a>
              <a href={`/api/resumes/${r.id}/download`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                Download
              </a>
              <Link to={`/resumes/${r.id}/edit`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                Edit
              </Link>
              <button onClick={() => remove(r.id)} className="ml-auto rounded-lg px-2 py-1.5 text-xs text-rose-500 hover:bg-rose-50">Delete</button>
            </div>
            {r.kind !== "tailored" && (
              <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                <select
                  className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                  defaultValue=""
                  onChange={(e) => tailorFor(r.id, e.target.value)}
                >
                  <option value="">Tailor for an application…</option>
                  {applications.map((a) => (
                    <option key={a.id} value={a.id}>#{a.id} {a.company} — {a.job_title}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ))}
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setPreview(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">{preview.label || preview.filename}</h3>
            <p className="text-xs text-slate-400">Parsed text — edit structure in the editor for best results</p>
            <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-xs text-slate-700">{preview.parsed_text}</pre>
            <div className="mt-3 flex justify-end gap-2">
              <Link to={`/resumes/${preview.id}/edit`} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                Open in editor
              </Link>
              <button onClick={() => setPreview(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
