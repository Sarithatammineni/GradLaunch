import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../auth";

const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

const FIELDS: { key: string; label: string; type?: string; placeholder?: string; hint?: string; required?: boolean }[] = [
  { key: "college", label: "College / University", placeholder: "NIT Warangal", required: true },
  { key: "degree_branch", label: "Degree & Branch", placeholder: "B.Tech Computer Science & Engineering", required: true },
  { key: "grad_year", label: "Graduation Year", type: "number", placeholder: "2026", required: true },
  { key: "current_location", label: "Current Location", placeholder: "Hyderabad, India" },
  { key: "preferred_locations", label: "Preferred Job Locations", placeholder: "Bengaluru; Hyderabad; Remote", hint: "Separate multiple with ; or ," },
  { key: "skills", label: "Technical Skills", placeholder: "python, java, sql, react, node.js", hint: "Comma separated — used for job matching", required: true },
  { key: "preferred_domains", label: "Preferred Job Domains", placeholder: "software development; machine learning; data engineering" },
  { key: "preferred_roles", label: "Preferred Job Roles", placeholder: "software engineer; ml engineer; sde" },
  { key: "employment_preference", label: "Internship or Full-time", placeholder: "full_time / internship / either" },
  { key: "linkedin_url", label: "LinkedIn Profile", placeholder: "https://linkedin.com/in/…" },
  { key: "github_url", label: "GitHub Profile", placeholder: "https://github.com/…" },
  { key: "portfolio_url", label: "Portfolio URL", placeholder: "https://…" }
];

export function OnboardingPage() {
  const nav = useNavigate();
  const { user, refresh } = useAuth();
  const [form, setForm] = useState<Record<string, string>>({ full_name: user?.full_name ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/profile", { method: "PUT", body: { ...form, grad_year: form.grad_year ? Number(form.grad_year) : null, profile_completed: true } });
      await refresh();
      nav("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
        <h1 className="text-2xl font-bold tracking-tight">Set up your profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          This powers your job recommendations and resume generation. You can edit everything later from the Profile page.
        </p>
        <form onSubmit={submit} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-slate-700">Full name</label>
            <input className={inputCls} required value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          {FIELDS.map((f) => (
            <div key={f.key} className={f.key === "skills" ? "md:col-span-2" : ""}>
              <label className="text-sm font-medium text-slate-700">
                {f.label}{f.required && <span className="text-rose-500"> *</span>}
              </label>
              <input
                className={inputCls}
                type={f.type ?? "text"}
                required={f.required}
                placeholder={f.placeholder}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
              {f.hint && <p className="mt-1 text-xs text-slate-400">{f.hint}</p>}
            </div>
          ))}
          {error && <div className="md:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <div className="md:col-span-2">
            <button disabled={busy} className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy ? "Saving…" : "Finish setup → Dashboard"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
