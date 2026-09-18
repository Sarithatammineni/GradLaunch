import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

const TYPE_COLORS: Record<string, string> = {
  interview: "bg-purple-500",
  assessment: "bg-indigo-500",
  coding_test: "bg-sky-500",
  deadline: "bg-rose-500",
  follow_up: "bg-amber-500",
  other: "bg-slate-400"
};

function monthMatrix(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(startDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", event_type: "interview", event_time: "", notes: "", application_id: "" });
  const [applications, setApplications] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const monthStr = (m = month, y = year) =>
    `${y}-${String(m + 1).padStart(2, "0")}`;
  const from = `${monthStr()}-01`;
  const to = `${monthStr()}-31`;

  const load = useCallback(async () => {
    try {
      const [e, a] = await Promise.all([api(`/events?from=${from}&to=${to}`), api("/applications")]);
      setEvents(e.events);
      setApplications(a.applications);
    } catch {
      /* ignore */
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const byDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const e of events) {
      const arr = map.get(e.event_date) ?? [];
      arr.push(e);
      map.set(e.event_date, arr);
    }
    return map;
  }, [events]);

  const addEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !form.title) return;
    setBusy(true);
    try {
      await api("/events", { body: { ...form, event_date: selected, application_id: form.application_id ? Number(form.application_id) : null } });
      setForm({ title: "", event_type: "interview", event_time: "", notes: "", application_id: "" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const toggleComplete = async (ev: any) => {
    await api(`/events/${ev.id}`, { method: "PATCH", body: { completed: !ev.completed } });
    await load();
  };

  const removeEvent = async (ev: any) => {
    await api(`/events/${ev.id}`, { method: "DELETE" });
    await load();
  };

  const rows = monthMatrix(year, month);
  const monthName = new Date(year, month, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  const todayStr = today.toISOString().slice(0, 10);
  const upcoming = events
    .filter((e) => !e.completed && e.event_date >= todayStr)
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendar & Reminders</h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card lg:col-span-2">
          <div className="flex items-center justify-between">
            <button onClick={() => { const m = month - 1; if (m < 0) { setMonth(11); setYear(year - 1); } else setMonth(m); }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">←</button>
            <h2 className="text-lg font-semibold">{monthName}</h2>
            <button onClick={() => { const m = month + 1; if (m > 11) { setMonth(0); setYear(year + 1); } else setMonth(m); }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">→</button>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {rows.flat().map((d, i) => {
              if (d === null) return <div key={i} />;
              const dateStr = `${monthStr()}-${String(d).padStart(2, "0")}`;
              const dayEvents = byDate.get(dateStr) ?? [];
              const isToday = dateStr === todayStr;
              return (
                <button key={i} onClick={() => setSelected(dateStr)}
                  className={`flex h-16 flex-col items-center rounded-lg border p-1 text-xs ${selected === dateStr ? "border-brand-500 bg-brand-50" : "border-slate-100 hover:bg-slate-50"} ${isToday ? "ring-2 ring-brand-400" : ""}`}>
                  <span className={isToday ? "font-bold text-brand-700" : "text-slate-600"}>{d}</span>
                  <span className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                    {dayEvents.slice(0, 4).map((e) => (
                      <span key={e.id} className={`h-1.5 w-1.5 rounded-full ${e.completed ? "bg-slate-300" : TYPE_COLORS[e.event_type] ?? "bg-slate-400"}`} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
            {Object.entries(TYPE_COLORS).map(([t, c]) => (
              <span key={t} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${c}`} />{t.replace("_", " ")}</span>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {selected ? `Events on ${selected}` : "Select a day"}
            </h2>
            {selected && (
              <>
                <ul className="mt-3 space-y-2">
                  {(byDate.get(selected) ?? []).map((e) => (
                    <li key={e.id} className="rounded-lg bg-slate-50 p-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className={e.completed ? "text-slate-400 line-through" : "font-medium text-slate-800"}>{e.title}</span>
                        <div className="flex gap-1">
                          <button onClick={() => toggleComplete(e)} className="text-xs text-emerald-600 hover:underline">{e.completed ? "Undo" : "Done"}</button>
                          <button onClick={() => removeEvent(e)} className="text-xs text-rose-500 hover:underline">Del</button>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">{e.event_time || "All day"} · {e.event_type.replace("_", " ")}{e.app_company ? ` · ${e.app_company}` : ""}</div>
                    </li>
                  ))}
                  {(byDate.get(selected) ?? []).length === 0 && <li className="text-sm text-slate-400">No events.</li>}
                </ul>
                <form onSubmit={addEvent} className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                  <input className={inputCls} placeholder="Event title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <select className={inputCls} value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })}>
                      <option value="interview">Interview</option>
                      <option value="assessment">Assessment</option>
                      <option value="coding_test">Coding test</option>
                      <option value="deadline">Deadline</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="other">Other</option>
                    </select>
                    <input type="time" className={inputCls} value={form.event_time} onChange={(e) => setForm({ ...form, event_time: e.target.value })} />
                  </div>
                  <select className={inputCls} value={form.application_id} onChange={(e) => setForm({ ...form, application_id: e.target.value })}>
                    <option value="">Link to application (optional)</option>
                    {applications.map((a) => <option key={a.id} value={a.id}>#{a.id} {a.company} — {a.job_title}</option>)}
                  </select>
                  <button disabled={busy} className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Add event</button>
                </form>
              </>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Next up</h2>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">Nothing upcoming this month.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {upcoming.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${TYPE_COLORS[e.event_type] ?? "bg-slate-400"}`} />
                      <span className="text-slate-700">{e.title}</span>
                    </span>
                    <span className="text-xs text-slate-400">{e.event_date}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
