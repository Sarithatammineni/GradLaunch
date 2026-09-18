import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function AdminPage() {
  const [sources, setSources] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ name: "", type: "greenhouse", token: "", feed_url: "", company: "" });

  const load = useCallback(async () => {
    try {
      const d = await api("/admin/sources");
      setSources(d.sources);
      setIntegrations(d.available_integrations);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addSource = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("add");
    setMsg("");
    try {
      const config = form.type === "career_page"
        ? { feed_url: form.feed_url, company: form.company || form.name }
        : { token: form.token };
      await api("/admin/sources", { body: { name: form.name, type: form.type, config } });
      setForm({ name: "", type: "greenhouse", token: "", feed_url: "", company: "" });
      setMsg("Source added. Run a sync to pull its openings.");
      await load();
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setBusy("");
    }
  };

  const sync = async (id: number) => {
    setBusy(`sync-${id}`);
    setMsg("");
    try {
      const d = await api(`/admin/sources/${id}/sync`, { method: "POST" });
      setMsg(d.message ?? "Synced.");
      await load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy("");
    }
  };

  const syncRemotive = async () => {
    setBusy("remotive");
    setMsg("");
    try {
      const d = await api("/admin/sync/remotive", { method: "POST" });
      setMsg(d.message ?? d.error ?? "");
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy("");
    }
  };

  const toggle = async (id: number) => {
    await api(`/admin/sources/${id}/toggle`, { method: "POST" });
    await load();
  };

  const remove = async (id: number) => {
    if (!confirm("Remove this source? Already-synced jobs stay in the database.")) return;
    await api(`/admin/sources/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Source Administration</h1>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Available integrations</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {integrations.map((i) => (
            <div key={i.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
              <div className="font-medium text-slate-800">{i.label}</div>
              <div className="mt-0.5 text-xs text-slate-500">Requires: {i.requires}</div>
              {i.docs && <a href={i.docs} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">Integration docs ↗</a>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={addSource} className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Add a source</h2>
          <div className="mt-3 space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Display name</label>
              <input className={inputCls} required value={form.name} placeholder="e.g. Stripe Engineering"
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Type</label>
              <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="greenhouse">Greenhouse board (public token)</option>
                <option value="workable">Workable account (subdomain)</option>
                <option value="career_page">Career page RSS/JSON feed</option>
              </select>
            </div>
            {form.type !== "career_page" ? (
              <div>
                <label className="text-xs font-medium text-slate-600">
                  {form.type === "greenhouse" ? "Board token" : "Workable subdomain"}
                </label>
                <input className={inputCls} value={form.token} placeholder={form.type === "greenhouse" ? "stripe" : "company"}
                  onChange={(e) => setForm({ ...form, token: e.target.value })} />
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs font-medium text-slate-600">Feed URL (RSS/Atom/JSON)</label>
                  <input className={inputCls} value={form.feed_url} placeholder="https://company.com/jobs/rss"
                    onChange={(e) => setForm({ ...form, feed_url: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Company name</label>
                  <input className={inputCls} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                </div>
              </>
            )}
            <button disabled={busy === "add"} className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy === "add" ? "Adding…" : "Add source"}
            </button>
          </div>
        </form>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Built-in public feed</h2>
          <p className="mt-2 text-sm text-slate-600">
            Remotive's public remote-jobs API needs no credentials. Toggle it off with <code>REMOTIVE_ENABLED=false</code> in .env.
          </p>
          <button onClick={syncRemotive} disabled={busy === "remotive"}
            className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
            {busy === "remotive" ? "Syncing…" : "Sync Remotive now"}
          </button>
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            Expired postings are archived automatically 60 days after their last published update.
            Duplicate listings (same company + title) are de-duplicated in search results.
          </div>
        </div>
      </div>

      {msg && <div className="rounded-lg bg-sky-50 px-4 py-2 text-sm text-sky-800">{msg}</div>}
      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 p-5 pb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Configured sources</h2>
        </div>
        {sources.length === 0 ? (
          <p className="p-5 text-sm text-slate-400">No sources configured yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-medium text-slate-800">
                    {s.name} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{s.type}</span>
                    {!s.enabled && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700">disabled</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Last sync: {s.last_sync_at ? new Date(s.last_sync_at).toLocaleString() : "never"}
                    {s.last_sync_status && <> · <span className={s.last_sync_status === "success" ? "text-emerald-600" : "text-rose-600"}>{s.last_sync_status}</span></>}
                  </div>
                  {s.last_sync_message && <div className="text-xs text-slate-400">{s.last_sync_message}</div>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => sync(s.id)} disabled={busy === `sync-${s.id}`}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                    {busy === `sync-${s.id}` ? "Syncing…" : "Sync"}
                  </button>
                  <button onClick={() => toggle(s.id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                    {s.enabled ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => remove(s.id)} className="rounded-lg px-2 py-1.5 text-xs text-rose-500 hover:bg-rose-50">Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
