// src/components/AppShell.tsx
import React, { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type Item = { to: string; label: string; icon: string };

const items: Item[] = [
  { to: "/dashboard", label: "Dashboard", icon: "🏠" },
  { to: "/tasks", label: "Tasks", icon: "📝" },
  { to: "/profile", label: "Profile", icon: "👤" },
];

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // Clear any cached auth tokens
      localStorage.clear();
      sessionStorage.clear();

      // Hard redirect to landing page
      window.location.href = "/";
    } catch (err) {
      console.error("Error signing out:", err);
    }
  };

  const linkClasses = ({ isActive }: { isActive: boolean }) =>
    [
      "group flex items-center gap-3 rounded-xl px-3 py-2",
      isActive
        ? "bg-white/10 text-white"
        : "text-white/80 hover:text-white hover:bg-white/5",
    ].join(" ");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black text-white">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 md:left-0 border-r border-white/5 bg-white/5 backdrop-blur">
        <div className="p-4">
          <div className="text-lg font-semibold tracking-tight">Jock Squad XP Farm</div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} className={linkClasses} end>
              <span className="text-lg">{it.icon}</span>
              <span className="truncate">{it.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3">
          <button
            onClick={handleSignOut}
            className="w-full rounded-xl bg-white/10 hover:bg-white/15 py-2 text-sm"
          >
            🚪 Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            aria-label="Toggle menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg px-2 py-1 hover:bg-white/10"
          >
            ☰
          </button>
          <div className="font-semibold">Jock Squad XP Farm</div>
          <div className="ml-auto">
            <button
              onClick={handleSignOut}
              className="rounded-lg px-3 py-1 text-sm bg-white/10 hover:bg-white/15"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <nav className="px-3 pb-3 grid gap-1">
            {items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                className={linkClasses}
                end
                onClick={() => setMenuOpen(false)}
              >
                <span className="text-lg">{it.icon}</span>
                <span className="truncate">{it.label}</span>
              </NavLink>
            ))}
            <button
              onClick={handleSignOut}
              className="rounded-xl bg-white/10 hover:bg-white/15 py-2 text-sm mt-2 text-left"
            >
              🚪 Sign out
            </button>
          </nav>
        )}
      </header>

      {/* Main content */}
      <div className="md:pl-64">
        <main className="px-4 sm:px-6 lg:px-8 py-6 md:py-8 pb-24 md:pb-10">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-slate-950/80 backdrop-blur">
        <ul className="grid grid-cols-3">
          {items.map((it) => (
            <li key={it.to}>
              <NavLink
                to={it.to}
                end
                className={({ isActive }) =>
                  [
                    "flex flex-col items-center justify-center py-2 text-xs",
                    isActive ? "text-white" : "text-white/70",
                  ].join(" ")
                }
              >
                <span className="text-lg leading-none">{it.icon}</span>
                <span className="mt-1">{it.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
