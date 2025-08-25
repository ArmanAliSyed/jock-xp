import React, { useCallback, useEffect, useState } from "react";
import LeaderboardCard from "../components/LeaderboardCard";
import RecentActivity from "../components/RecentActivity";
import Calendar from "../components/Calendar";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

type TaskRow = {
  id: string;
  title: string;
  due_at: string;
  status: string | null;        // "completed" | "open" | null
  completed_at: string | null;
};

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}
function keyFromDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function Dashboard() {
  const nav = useNavigate();

  // user session
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // visible year/month in the calendar (0..11 for month)
  const [ym, setYm] = useState<{ y: number; m: number }>(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  // yyyy-mm-dd -> tasks map
  const [eventsByDate, setEventsByDate] = useState<Record<string, TaskRow[]>>({});

  // 🔧 Memoized month-change handler to avoid render loops
  const handleMonthChange = useCallback((year: number, month: number) => {
    setYm(prev => (prev.y === year && prev.m === month ? prev : { y: year, m: month }));
  }, []);

  // Load tasks for the visible month (only this user + NOT completed)
  const loadTasks = useCallback(
    async (y: number, m: number) => {
      if (!session?.user?.id) return;

      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 1);

      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,due_at,status,completed_at")
        .eq("owner_id", session.user.id)                 // ✅ only current user
        .or("status.is.null,status.neq.completed")       // hide completed
        .gte("due_at", start.toISOString())
        .lt("due_at", end.toISOString())
        .order("due_at", { ascending: true });

      if (error) {
        console.error("Failed to load tasks:", error);
        setEventsByDate({});
        return;
      }

      const map: Record<string, TaskRow[]> = {};
      (data ?? []).forEach((row: TaskRow) => {
        const d = new Date(row.due_at);
        const k = keyFromDate(d);
        (map[k] ||= []).push(row);
      });
      setEventsByDate(map);
    },
    [session?.user?.id]
  );

  useEffect(() => {
    loadTasks(ym.y, ym.m);
  }, [ym, loadTasks]);

  return (
    <div className="relative">
      {/* background glow / gradient */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(40%_60%_at_20%_0%,rgba(59,130,246,0.20),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(40%_60%_at_100%_20%,rgba(139,92,246,0.20),transparent_60%)]" />
      </div>

      <div className="mx-auto max-w-6xl space-y-4 md:space-y-6">
        {/* Leaderboard */}
        <LeaderboardCard
          title="Leaderboard · This week"
          limit={5}
          onSeeAll={() => nav("/leaderboard")}
        />

        {/* Calendar (with user-only tasks) */}
        <Calendar eventsByDate={eventsByDate} onMonthChange={handleMonthChange} />

        {/* Recent Activity */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-4 md:p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-semibold">Recent Activity</h2>
          </div>
          <RecentActivity />
        </section>
      </div>
    </div>
  );
}
