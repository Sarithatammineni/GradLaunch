import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../auth";

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

const FIELDS: { key: string; label: string; type?: string; hint?: string; full?: boolean }[] = [
  { key: "full_name", label: "Full name" },
  { key: "college", label: "College / University" },
  { key: "degree_branch", label: "Degree & Branch" },
  { key: "grad_year", label: "Graduation year", type: "number" },
  { key: "current_location", label: "Current location" },
  { key: "preferred_locations", label: "Preferred job locations", hint: "; separated" },
  { key: "skills", label: "Technical skills", hint: "comma separated", full: true },
  { key: "preferred_domains", label: "Preferred domains", hint: "; separated" },
  { key: "preferred_roles", label: "Preferred roles", hint: "; separated" },
  { key: "employment_preference", label: "Internship / full-time preference" },
  { key: "linkedin_url", label: "LinkedIn URL" },
  { key: "github_url", label: "GitHub URL" },
  { key: "portfolio_url", label: "Portfolio URL" }
];

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/auth/me").then((d) => {
      const u = d.user;
      const init: Record<string, any> = {};
      for (const f of FIELDS) init[f.key] = u[f.key] ?? "";
      setForm(init);
    });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/profile", { method: "PUT", body: { ...form, grad_year: form.grad_year ? Number(form.grad_year) : null } });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
      </div>

      <form onSubmit={save} className="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
        <div className="grid gap-4 md:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className={f.full ? "md:col-span-2" : ""}>
              <label className="text-xs font-medium text-slate-600">{f.label}</label>
              <input
                type={f.type ?? "text"}
                className={inputCls}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
              {f.hint && <p className="mt-0.5 text-[11px] text-slate-400">{f.hint}</p>}
            </div>
          ))}
        </div>
        {error && <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        {saved && <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Profile saved \u2713</div>}
        <div className="mt-5 flex justify-end">
          <button disabled={busy} className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
    </div>
  );
}
