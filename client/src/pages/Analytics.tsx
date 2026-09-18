import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { STATUSES, type StatusId } from "../../../shared/status";

export function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/analytics").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</div>;
  if (!data) return <div className="py-20 text-center text-slate-400">Loading analytics…</div>;

  const statusEntries = Object.entries(data.by_status ?? {}) as [StatusId, number][];
  const maxStatus = Math.max(1, ...statusEntries.map(([, v]) => v));
  const maxCompany = Math.max(1, ...(data.by_company ?? []).map((c: any) => c.count));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
          <div className="text-3xl font-bold">{data.totals.applications}</div>
          <div className="text-xs text-slate-500">Total applications</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
          <div className="text-3xl font-bold">{data.totals.companies}</div>
          <div className="text-xs text-slate-500">Distinct companies</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
          <div className="text-3xl font-bold">{data.totals.active}</div>
          <div className="text-xs text-slate-500">Active pipelines</div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Status breakdown</h2>
          {statusEntries.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">No applications yet.</p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {statusEntries
                .sort((a, b) => (STATUSES[a[0]]?.order ?? 99) - (STATUSES[b[0]]?.order ?? 99))
                .map(([s, v]) => (
                  <div key={s} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-xs font-medium text-slate-600">{STATUSES[s]?.label ?? s}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
                      <div className="flex h-full items-center justify-end rounded bg-brand-500/90 px-1.5 text-[10px] font-bold text-white"
                        style={{ width: `${Math.max(v > 0 ? 10 : 0, (v / maxStatus) * 100)}%` }}>
                        {v > 0 ? v : ""}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Top companies</h2>
          {(data.by_company ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">No applications yet.</p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {(data.by_company as any[]).map((c) => (
                <div key={c.company} className="flex items-center gap-3">
                  <span className="w-40 truncate shrink-0 text-xs font-medium text-slate-600">{c.company}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
                    <div className="h-full rounded bg-emerald-500/80" style={{ width: `${(c.count / maxCompany) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right text-xs text-slate-500">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Application sources</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(data.by_source ?? {}).length === 0 ? (
            <p className="text-sm text-slate-400">No data yet.</p>
          ) : (
            Object.entries(data.by_source ?? {}).map(([src, n]) => (
              <span key={src} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {src.replace("_", " ")}: {n as number}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
