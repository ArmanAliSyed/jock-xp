import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

type TaskRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  due_at: string; // ISO
  xp_assigned: number;
  status: "open" | "completed" | "missed";
  completed_at: string | null;
  created_at: string;
};

export default function TaskManager() {
  const [session, setSession] = useState<Session | null>(null);

  // form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState<string>(() => defaultDueLocal());

  // ui
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastXP, setLastXP] = useState<number | null>(null);

  // data
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
  }, []);

  useEffect(() => {
    if (!session?.user.id) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);

      try {
        await supabase.rpc("penalize_my_overdue");
      } catch {}

      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("owner_id", session.user.id)
        .order("due_at", { ascending: true });

      if (!alive) return;
      if (error) setError(error.message);
      setTasks((data as TaskRow[]) || []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [session?.user.id]);

  const openTasks = useMemo(() => tasks.filter(t => t.status === "open"), [tasks]);
  const completedTasks = useMemo(() => tasks.filter(t => t.status === "completed"), [tasks]);
  const missedTasks = useMemo(() => tasks.filter(t => t.status === "missed"), [tasks]);

  /** Create */
  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user.id) return;

    setCreating(true);
    setError(null);
    setLastXP(null);

    try {
      // Ask GPT for XP — now only sending title/description/due_at
      const { data: xpResp, error: fnErr } = await supabase.functions.invoke("xp-assign", {
        body: {
          title,
          description,
          due_at: localToISO(dueAt),
          // minutes/difficulty removed (function should handle defaults)
        },
      });
      if (fnErr) throw fnErr;
      const xp = xpResp?.xp ?? 10;
      setLastXP(xp);

      const { data, error: insErr } = await supabase
        .from("tasks")
        .insert({
          owner_id: session.user.id,
          title,
          description,
          due_at: localToISO(dueAt),
          xp_assigned: xp,
        })
        .select()
        .single();

      if (insErr) throw insErr;
      setTasks(prev => [data as TaskRow, ...prev]);

      setTitle("");
      setDescription("");
      setDueAt(defaultDueLocal());
    } catch (err: any) {
      setError(err.message ?? "Failed to create task");
    } finally {
      setCreating(false);
    }
  };

  /** Complete with photo */
  const onCompleteWithPhoto = async (task: TaskRow, file: File) => {
    if (!session?.user.id) return;
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${session.user.id}/${task.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("task-proofs")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("task-proofs").getPublicUrl(path);
      const proof_url = pub.publicUrl;
      const proof_thumb_url = `${proof_url}?width=512&height=512&resize=cover&quality=70`;

      // optimistic
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: "completed", completed_at: new Date().toISOString() } : t));

      // RPC (if present) does both updates
      const tryRpc = await supabase.rpc("complete_task_with_proof", {
        p_task_id: task.id,
        p_proof_url: proof_url,
        p_proof_thumb_url: proof_thumb_url,
      });

      if (tryRpc.error) {
        // fallback
        const { error: upErr2 } = await supabase
          .from("tasks")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", task.id);
        if (upErr2) throw upErr2;

        const { error: xpErr } = await supabase.from("xp_ledger").insert({
          user_id: session.user.id,
          task_id: task.id,
          delta: task.xp_assigned,
          reason: "task completed",
          proof_url,
          proof_thumb_url,
        });
        if (xpErr) throw xpErr;
      }
    } catch (err: any) {
      setTasks(prev => prev.map(t => (t.id === task.id ? task : t)));
      setError(err.message ?? "Failed to complete task with photo");
    }
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-4 md:p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
      <h2 className="text-xl md:text-2xl font-semibold mb-4">Tasks</h2>

      {/* Create form */}
      <form onSubmit={onCreate} className="grid gap-3 md:gap-4">
        <input
          className="rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 outline-none focus:border-white/20"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <textarea
          className="rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 outline-none focus:border-white/20 min-h-[100px]"
          placeholder="Task description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-[1fr] gap-3">
          <label className="grid gap-2">
            <span className="text-xs text-white/70">Due date & time</span>
            <input
              className="rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 outline-none focus:border-white/20"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              required
            />
          </label>
        </div>

        <button
          className="rounded-xl bg-sky-500/90 hover:bg-sky-400 text-slate-950 font-semibold py-2 transition"
          type="submit"
          disabled={creating}
        >
          {creating ? "Creating…" : "+ Create Card"}
        </button>

        {lastXP !== null && (
          <div className="text-sm text-white/80">
            Assigned XP: <strong>{lastXP}</strong>
          </div>
        )}
        {error && <div className="text-rose-400">{error}</div>}
      </form>

      {/* Open */}
      <div className="mt-6">
        <h3 className="font-semibold mb-2">Open</h3>
        {loading ? (
          <div className="text-white/70">Loading…</div>
        ) : openTasks.length ? (
          <div className="grid gap-2">
            {openTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{t.title}</div>
                  <div className="text-xs text-white/70 truncate">
                    Due {formatDate(t.due_at)} · Worth {t.xp_assigned} XP
                  </div>
                </div>
                <CompleteWithPhotoButton onPick={(file) => onCompleteWithPhoto(t, file)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-white/60">No open tasks.</div>
        )}
      </div>

      {/* Completed */}
      {!!completedTasks.length && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">Completed</h3>
          <div className="grid gap-2">
            {completedTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex-1 min-w-0 font-semibold truncate">{t.title}</div>
                <div className="text-xs text-white/70">
                  +{t.xp_assigned} XP · {formatDate(t.completed_at || t.due_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missed */}
      {!!missedTasks.length && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">Missed</h3>
          <div className="grid gap-2">
            {missedTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex-1 min-w-0 font-semibold truncate">{t.title}</div>
                <div className="text-xs text-white/70">
                  Penalty −{Math.ceil(t.xp_assigned / 2)} XP · Due {formatDate(t.due_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** ---------- Inline pieces ---------- */
function CompleteWithPhotoButton({ onPick }: { onPick: (file: File) => void }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await onPick(file);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm hover:bg-white/[0.1] disabled:opacity-60"
      >
        {busy ? "Uploading…" : "Complete w/ Photo"}
      </button>
    </>
  );
}

/** ---------- Helpers ---------- */
function defaultDueLocal() {
  const d = new Date();
  d.setHours(d.getHours() + 2);
  return toLocalInputValue(d);
}
function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}
function localToISO(local: string) {
  const d = new Date(local);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
