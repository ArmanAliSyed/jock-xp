// src/components/Reactions.tsx
import React from "react";
import { supabase } from "../lib/supabaseClient";

type Props = {
  ledgerId: string;                 // xp_ledger.id for the task
  className?: string;
  size?: "sm" | "md";
  showPpv?: boolean;                // show "±N XP/vote" (uses RPC points_per_vote)
};

type Summary = { upvotes: number; downvotes: number; net: number };

export default function Reactions({
  ledgerId,
  className = "",
  size = "sm",
  showPpv = false,
}: Props) {
  const [userId, setUserId] = React.useState<string | null>(null);
  const [myVote, setMyVote] = React.useState<1 | -1 | 0>(0);
  const [sum, setSum] = React.useState<Summary>({ upvotes: 0, downvotes: 0, net: 0 });
  const [busy, setBusy] = React.useState(false);
  const [ppv, setPpv] = React.useState<number | null>(null); // points per vote

  // ---- tiny client rate limit: max 2 changes / 2s per post ----
  const changesRef = React.useRef<number[]>([]);
  const withinClientRate = () => {
    const now = Date.now();
    const keep = (changesRef.current ?? []).filter((t) => now - t < 2000);
    changesRef.current = keep;
    return keep.length < 2;
  };
  const markChange = () => (changesRef.current = [...(changesRef.current ?? []), Date.now()]);

  // current user
  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const fetchSummary = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("xp_reaction_summary")
      .select("upvotes,downvotes,net")
      .eq("ledger_id", ledgerId)
      .maybeSingle();

    if (!error) {
      setSum({
        upvotes: data?.upvotes ?? 0,
        downvotes: data?.downvotes ?? 0,
        net: data?.net ?? 0,
      });
    }
  }, [ledgerId]);

  const fetchMyVote = React.useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("xp_reactions")
      .select("value")
      .eq("ledger_id", ledgerId)
      .eq("voter_id", userId)
      .maybeSingle();
    setMyVote((data?.value as 1 | -1 | undefined) ?? 0);
  }, [ledgerId, userId]);

  const fetchPpv = React.useCallback(async () => {
    if (!showPpv) return;
    const { data, error } = await supabase.rpc("points_per_vote", { p_ledger_id: ledgerId });
    if (!error && typeof data === "number") setPpv(data);
  }, [ledgerId, showPpv]);

  // initial loads
  React.useEffect(() => {
    fetchSummary();
    fetchPpv();
  }, [fetchSummary, fetchPpv]);

  React.useEffect(() => {
    fetchMyVote();
  }, [fetchMyVote]);

  // realtime: keep counts fresh; also sync myVote if changed elsewhere
  React.useEffect(() => {
    const ch = supabase
      .channel(`xp_reactions_${ledgerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "xp_reactions", filter: `ledger_id=eq.${ledgerId}` },
        (payload: any) => {
          fetchSummary();
          const voter = payload.new?.voter_id ?? payload.old?.voter_id;
          const val = payload.new?.value as 1 | -1 | undefined;
          if (voter && val != null && voter === userId) setMyVote(val);
          if (payload.eventType === "DELETE" && voter === userId) setMyVote(0);
        }
      )
      .subscribe();

    return () => {
      // important: don't return the Promise to React
      void supabase.removeChannel(ch);
    };
  }, [ledgerId, userId, fetchSummary]);

  const applyOptimistic = (next: 1 | -1 | 0, prev: 1 | -1 | 0) => {
    setMyVote(next);
    setSum((curr) => {
      let up = curr.upvotes;
      let down = curr.downvotes;
      if (prev === 1) up = Math.max(0, up - 1);
      if (prev === -1) down = Math.max(0, down - 1);
      if (next === 1) up += 1;
      if (next === -1) down += 1;
      return { upvotes: up, downvotes: down, net: up - down };
    });
  };

  const setVote = async (value: 1 | -1) => {
    if (!userId) {
      alert("Please sign in to vote.");
      return;
    }
    if (!withinClientRate() || busy) return;

    const prev = myVote;
    const next = prev === value ? 0 : value;

    try {
      setBusy(true);
      markChange();
      applyOptimistic(next, prev);

      if (next === 0) {
        await supabase
          .from("xp_reactions")
          .delete()
          .eq("ledger_id", ledgerId)
          .eq("voter_id", userId);
      } else {
        await supabase
          .from("xp_reactions")
          .upsert(
            { ledger_id: ledgerId, voter_id: userId, value: next },
            { onConflict: "ledger_id,voter_id" }
          );
      }
    } catch (e) {
      await Promise.all([fetchSummary(), fetchMyVote()]);
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const btnBase =
    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 active:scale-[.98] transition";
  const sz = size === "md" ? "text-sm" : "text-xs";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={() => setVote(1)}
        aria-pressed={myVote === 1}
        disabled={busy}
        className={`${btnBase} ${sz} ${
          myVote === 1
            ? "border-sky-300/50 bg-sky-400/20"
            : "border-white/10 bg-white/[0.06] hover:bg-white/[0.1]"
        }`}
        title="Like"
      >
        👍 <span>{sum.upvotes}</span>
      </button>

      <button
        onClick={() => setVote(-1)}
        aria-pressed={myVote === -1}
        disabled={busy}
        className={`${btnBase} ${sz} ${
          myVote === -1
            ? "border-rose-300/50 bg-rose-400/20"
            : "border-white/10 bg-white/[0.06] hover:bg-white/[0.1]"
        }`}
        title="Dislike"
      >
        👎 <span>{sum.downvotes}</span>
      </button>

      {showPpv && (
        <span className="ml-1 text-[11px] text-white/60">±{ppv ?? "?"} XP/vote</span>
      )}
    </div>
  );
}
