import React, { useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { api } from "./lib/api";
import { useAuth } from "./auth";

const icon = (d: string) => (
  <svg className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  icon: React.ReactNode;
}

const PLATFORM: NavItem[] = [
  { to: "/", label: "Dashboard", end: true, icon: icon("M3 12l9-8 9 8M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10") },
  { to: "/jobs", label: "Find Jobs", icon: icon("M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z") },
  { to: "/applications", label: "My Applications", icon: icon("M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4") },
  { to: "/resumes", label: "Resume Vault", icon: icon("M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4") },
  { to: "/calendar", label: "Calendar", icon: icon("M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z") },
  { to: "/analytics", label: "Analytics", icon: icon("M9 19v-6m4 6V9m4 10h-14M4 5h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z") },
  { to: "/profile", label: "Profile", icon: icon("M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z") }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api("/dashboard").then((d) => setNotifications(d.notifications ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setShowNotifs(false);
  }, [location.pathname]);

  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    nav("/login");
  };

  const markAllRead = async () => {
    await api("/notifications/read-all", { method: "POST" }).catch(() => {});
    setNotifications([]);
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    nav(`/jobs?q=${encodeURIComponent(q)}`);
    setSearch("");
  };

  const initials = (user?.full_name || "U")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const navLinkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    }`;

  const sidebar = (
    <aside className={`${mobileOpen ? "block" : "hidden"} fixed inset-y-0 left-0 z-40 w-60 border-r border-slate-200 bg-white md:static md:block`}>
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">GL</span>
        <span className="text-[15px] font-bold tracking-tight">GradLaunch</span>
      </div>
      <nav className="flex h-[calc(100%-8.5rem)] flex-col gap-1 overflow-y-auto px-3">
        <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Platform</div>
        {PLATFORM.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={navLinkCls}>
            {n.icon}
            {n.label}
          </NavLink>
        ))}
        {user?.is_admin ? (
          <>
            <div className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Admin</div>
            <NavLink to="/admin" className={navLinkCls}>
              {icon("M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z")}
              Admin
            </NavLink>
          </>
        ) : null}
      </nav>
      <div className="absolute bottom-4 left-0 w-full px-4">
        <button onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
          {icon("M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1")}
          Log out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-slate-100">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
          <div className="flex h-16 items-center gap-3 px-4 md:px-6">
            <button className="rounded-lg p-2 hover:bg-slate-100 md:hidden" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle navigation">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <form onSubmit={submitSearch} className="relative flex-1 md:max-w-md">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
              </svg>
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Type to search across jobs"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100" />
            </form>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <button className="relative rounded-lg p-2 hover:bg-slate-100" onClick={() => setShowNotifs((v) => !v)} aria-label="Notifications">
                  <svg className="h-5 w-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {notifications.length > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {notifications.length}
                    </span>
                  )}
                </button>
                {showNotifs && (
                  <div className="absolute right-0 top-12 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold">Notifications</span>
                      <button className="text-xs text-brand-600 hover:underline" onClick={markAllRead}>Mark all read</button>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="py-6 text-center text-sm text-slate-400">No unread notifications</div>
                    ) : (
                      <ul className="max-h-72 space-y-2 overflow-auto">
                        {notifications.map((n: any) => (
                          <li key={n.id} className="rounded-lg bg-slate-50 p-2 text-xs text-slate-700">{n.message}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2.5 rounded-full border border-slate-200 py-1 pl-1 pr-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{initials}</span>
                <div className="hidden leading-tight sm:block">
                  <div className="text-xs font-semibold text-slate-800">{user?.full_name}</div>
                  <div className="max-w-[160px] truncate text-[11px] text-slate-400">{user?.email}</div>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
