import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { ResumeData } from "../../../shared/resume";

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function ResumeEditorPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<ResumeData | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api(`/resumes/${id}`);
      const parsed = res.resume.parsed;
      if (!parsed) {
        setError("This resume has no parsed structure yet. Upload a PDF/TXT to generate one.");
        return;
      }
      setData(parsed);
      setLabel(res.resume.label ?? "");
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</div>;
  if (!data) return <div className="py-20 text-center text-slate-400">Loading resume…</div>;

  const set = (patch: Partial<ResumeData>) => { setData({ ...data, ...patch }); setSaved(false); };

  const save = async () => {
    setBusy(true);
    try {
      await api(`/resumes/${id}/content`, { method: "PUT", body: { parsed: data, label } });
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit resume</h1>
        </div>
        <div className="flex gap-2">
          <a href={`/api/resumes/${id}/pdf`} target="_blank" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
            Download PDF
          </a>
          <button onClick={save} disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? "Saving…" : saved ? "Saved \u2713" : "Save changes"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-600">Label</label>
            <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Full name</label>
            <input className={inputCls} value={data.owner} onChange={(e) => set({ owner: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Headline</label>
            <input className={inputCls} value={data.headline} onChange={(e) => set({ headline: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Email</label>
            <input className={inputCls} value={data.email} onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Phone</label>
            <input className={inputCls} value={data.phone} onChange={(e) => set({ phone: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Location</label>
            <input className={inputCls} value={data.location} onChange={(e) => set({ location: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-slate-600">Links (comma separated)</label>
            <input className={inputCls} value={data.links.join(", ")} onChange={(e) => set({ links: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
          </div>
        </div>
      </div>

      <Section title="Summary">
        <textarea rows={3} className={inputCls} value={data.summary} onChange={(e) => set({ summary: e.target.value })} />
      </Section>

      <Section title="Skills (comma separated, most relevant first)">
        <textarea rows={2} className={inputCls} value={data.skills.join(", ")}
          onChange={(e) => set({ skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
      </Section>

      <Section title="Education">
        {data.education.map((ed, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-slate-100 p-3 md:grid-cols-2">
            <input className={inputCls} placeholder="Degree" value={ed.degree} onChange={(e) => { const arr = [...data.education]; arr[i] = { ...ed, degree: e.target.value }; set({ education: arr }); }} />
            <input className={inputCls} placeholder="Institution" value={ed.institution} onChange={(e) => { const arr = [...data.education]; arr[i] = { ...ed, institution: e.target.value }; set({ education: arr }); }} />
            <input className={inputCls} placeholder="Period" value={ed.period} onChange={(e) => { const arr = [...data.education]; arr[i] = { ...ed, period: e.target.value }; set({ education: arr }); }} />
            <input className={inputCls} placeholder="Details" value={ed.details} onChange={(e) => { const arr = [...data.education]; arr[i] = { ...ed, details: e.target.value }; set({ education: arr }); }} />
          </div>
        ))}
        <button className="text-sm font-medium text-brand-600 hover:underline"
          onClick={() => set({ education: [...data.education, { degree: "", institution: "", period: "", details: "" }] })}>
          + Add education
        </button>
      </Section>

      <Section title="Experience">
        {data.experience.map((ex, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-slate-100 p-3">
            <div className="grid gap-2 md:grid-cols-3">
              <input className={inputCls} placeholder="Company" value={ex.company} onChange={(e) => { const arr = [...data.experience]; arr[i] = { ...ex, company: e.target.value }; set({ experience: arr }); }} />
              <input className={inputCls} placeholder="Role" value={ex.role} onChange={(e) => { const arr = [...data.experience]; arr[i] = { ...ex, role: e.target.value }; set({ experience: arr }); }} />
              <input className={inputCls} placeholder="Period" value={ex.period} onChange={(e) => { const arr = [...data.experience]; arr[i] = { ...ex, period: e.target.value }; set({ experience: arr }); }} />
            </div>
            <textarea rows={2} className={inputCls} placeholder="One bullet per line"
              value={ex.bullets.join("\n")}
              onChange={(e) => { const arr = [...data.experience]; arr[i] = { ...ex, bullets: e.target.value.split("\n").filter(Boolean) }; set({ experience: arr }); }} />
          </div>
        ))}
        <button className="text-sm font-medium text-brand-600 hover:underline"
          onClick={() => set({ experience: [...data.experience, { company: "", role: "", period: "", bullets: [] }] })}>
          + Add experience
        </button>
      </Section>

      <Section title="Projects">
        {data.projects.map((p, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-slate-100 p-3">
            <div className="grid gap-2 md:grid-cols-2">
              <input className={inputCls} placeholder="Project name" value={p.name} onChange={(e) => { const arr = [...data.projects]; arr[i] = { ...p, name: e.target.value }; set({ projects: arr }); }} />
              <input className={inputCls} placeholder="Tech stack" value={p.tech} onChange={(e) => { const arr = [...data.projects]; arr[i] = { ...p, tech: e.target.value }; set({ projects: arr }); }} />
            </div>
            <textarea rows={2} className={inputCls} placeholder="One bullet per line"
              value={p.bullets.join("\n")}
              onChange={(e) => { const arr = [...data.projects]; arr[i] = { ...p, bullets: e.target.value.split("\n").filter(Boolean) }; set({ projects: arr }); }} />
          </div>
        ))}
        <button className="text-sm font-medium text-brand-600 hover:underline"
          onClick={() => set({ projects: [...data.projects, { name: "", tech: "", bullets: [] }] })}>
          + Add project
        </button>
      </Section>
    </div>
  );
}
