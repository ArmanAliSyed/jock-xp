import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Avatar from "./Avatar"; // keeps your existing avatar uploader/display

type UsersXp = { user_id: string; xp: number };
type Profile = { id: string; display_name: string | null; avatar_url: string | null };

interface LeaderboardCardProps {
  title?: string;
  limit?: number;
  onSeeAll?: () => void;
}

export default function LeaderboardCard({
  title = "Leaderboard",
  limit = 5,
  onSeeAll,
}: LeaderboardCardProps) {
  const [rows, setRows] = useState<UsersXp[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // 1) balances high → low
        const { data: balances, error: e1 } = await supabase
          .from("users_xp")
          .select("user_id,xp")
          .order("xp", { ascending: false });

        if (e1) throw e1;
        if (!alive) return;

        const trimmed = (balances ?? []).slice(0, limit);
        setRows(trimmed);

        // 2) profiles for those ids
        const ids = trimmed.map((b) => b.user_id);
        if (ids.length) {
          const { data: profs, error: e2 } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .in("id", ids);

          if (e2 || !profs) {
            setProfiles({});
          } else {
            const map: Record<string, Profile> = {};
            for (const p of profs) map[p.id] = p as Profile;
            setProfiles(map);
          }
        }
      } catch (e: any) {
        setErr(e.message ?? "Failed to load leaderboard");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [limit]);

  const ranked = useMemo(
    () => rows.map((r, i) => ({ rank: i + 1, ...r })),
    [rows]
  );

  const maxXP = useMemo(() => Math.max(1, ...rows.map((r) => r.xp)), [rows]);

  const medal = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return " ";
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-4 md:p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-to-br from-amber-400/70 via-yellow-400/60 to-white/20 ring-1 ring-white/20 shadow-[0_8px_30px_rgba(255,200,0,0.2)]">
            🏆
          </div>
          <h2 className="text-xl md:text-2xl font-semibold">{title}</h2>
        </div>
        {onSeeAll && (
          <button
            onClick={onSeeAll}
            className="rounded-xl bg-sky-500/90 hover:bg-sky-400 text-slate-950 font-semibold text-sm px-3 py-1.5"
          >
            See all
          </button>
        )}
      </div>

      {loading && <div className="text-white/70">Loading…</div>}
      {err && <div className="text-rose-400">{err}</div>}

      {!loading && !err && (
        <div className="grid gap-2">
          {ranked.map(({ rank, user_id, xp }) => {
            const p = profiles[user_id];
            const name =
              p?.display_name?.trim() ||
              `Player ${user_id.slice(0, 4)}…${user_id.slice(-4)}`;

            const barWidth = Math.max(6, Math.round((xp / maxXP) * 100));

            return (
              <div
                key={user_id}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-3 hover:border-white/20 transition"
              >
                {/* progress glow */}
                <div
                  className="absolute inset-y-0 left-0 pointer-events-none"
                  style={{
                    width: `${barWidth}%`,
                    background:
                      "linear-gradient(90deg, rgba(56,189,248,0.08), rgba(168,85,247,0.08))",
                  }}
                />

                <div className="relative flex items-center gap-3">
                  {/* Rank badge */}
                  <div
                    className={`grid place-items-center h-9 w-9 rounded-xl font-extrabold ${
                      rank === 1
                        ? "bg-amber-400/90 text-slate-950 ring-2 ring-amber-200/60"
                        : "bg-white/10 text-white ring-1 ring-white/15"
                    }`}
                    title={`Rank #${rank}`}
                  >
                    {rank === 1 ? "1" : medal(rank) !== " " ? medal(rank) : rank}
                  </div>

                  {/* Avatar + name */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar
                      path={p?.avatar_url ?? undefined}
                      size={36}
                      fallback={name}
                    />
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{name}</div>
                      <div className="text-xs text-white/60">Rank #{rank}</div>
                    </div>
                  </div>

                  {/* XP badge */}
                  <div className="shrink-0">
                    <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1.5 text-sm font-bold">
                      {xp}
                      <span className="text-white/60 font-medium">XP</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
