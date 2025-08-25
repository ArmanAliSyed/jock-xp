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

type TabKey = "open" | "completed" | "missed";

export default function TaskManager() {
  const [session, setSession] = useState<Session | null>(null);

  // form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState<string>(() => defaultDueLocal());
  const [formOpen, setFormOpen] = useState(true);

  // ui
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastXP, setLastXP] = useState<number | null>(null);

  // data
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  // tabs
  const [tab, setTab] = useState<TabKey>("open");

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
        // grade overdue (no-op if you don't have this RPC)
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

    return () => {
      alive = false;
    };
  }, [session?.user.id]);

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status === "open"),
    [tasks]
  );
  const completedTasks = useMemo(
    () => tasks.filter((t) => t.status === "completed"),
    [tasks]
  );
  const missedTasks = useMemo(
    () => tasks.filter((t) => t.status === "missed"),
    [tasks]
  );

  /** Create */
  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user.id) return;

    setCreating(true);
    setError(null);
    setLastXP(null);

    try {
      // Ask your edge fn for XP
      const { data: xpResp, error: fnErr } = await supabase.functions.invoke(
        "xp-assign",
        {
          body: { title, description, due_at: localToISO(dueAt) },
        }
      );
      if (fnErr) throw fnErr;
      const xp = (xpResp as any)?.xp ?? 10;
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
      setTasks((prev) => [data as TaskRow, ...prev]);

      setTitle("");
      setDescription("");
      setDueAt(defaultDueLocal());
      setFormOpen(false);
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
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, status: "completed", completed_at: new Date().toISOString() }
            : t
        )
      );

      // try RPC that updates task + ledger
      const tryRpc = await supabase.rpc("complete_task_with_proof", {
        p_task_id: task.id,
        p_proof_url: proof_url,
        p_proof_thumb_url: proof_thumb_url,
      });

      if (tryRpc.error) {
        // fallback path
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
      // revert
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      setError(err.message ?? "Failed to complete task with photo");
    }
  };

  const counts = {
    open: openTasks.length,
    completed: completedTasks.length,
    missed: missedTasks.length,
  };

  const listForTab = tab === "open" ? openTasks : tab === "completed" ? completedTasks : missedTasks;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-4 md:p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg sm:text-xl md:text-2xl font-semibold">Tasks</h2>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-sm hover:bg-white/[0.1]"
        >
          {formOpen ? "Hide form" : "Add task"}
        </button>
      </div>

      {/* Form card */}
      {formOpen && (
        <form onSubmit={onCreate} className="mb-5 grid gap-3">
          <div className="grid gap-2">
            <input
              className="rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 outline-none focus:border-white/20 text-[15px]"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <textarea
              className="rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 outline-none focus:border-white/20 min-h-[90px] text-[15px]"
              placeholder="Task description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <label className="grid gap-1">
              <span className="text-xs text-white/60">Due date & time</span>
              <input
                className="rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 outline-none focus:border-white/20"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="flex-1 rounded-xl bg-sky-500/90 hover:bg-sky-400 text-slate-950 font-semibold py-2.5 transition"
              type="submit"
              disabled={creating}
            >
              {creating ? "Creating…" : "+ Create Task"}
            </button>
          </div>

          {lastXP !== null && (
            <div className="text-sm text-white/80">Assigned XP: <strong>{lastXP}</strong></div>
          )}
          {error && <div className="text-rose-400">{error}</div>}
        </form>
      )}

      {/* Summary chips */}
      <div className="mb-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <TabChip label={`Open (${counts.open})`} active={tab === "open"} onClick={() => setTab("open")} />
        <TabChip label={`Completed (${counts.completed})`} active={tab === "completed"} onClick={() => setTab("completed")} />
        <TabChip label={`Missed (${counts.missed})`} active={tab === "missed"} onClick={() => setTab("missed")} />
      </div>

      {/* List */}
      <div className="grid gap-2">
        {loading ? (
          <SkeletonList />
        ) : listForTab.length ? (
          listForTab.map((t) => (
            <TaskRowCard
              key={t.id}
              t={t}
              onPickFile={(file) => onCompleteWithPhoto(t, file)}
              tab={tab}
            />
          ))
        ) : (
          <div className="text-white/60 text-sm py-3 text-center">
            {tab === "open" ? "No open tasks." : tab === "completed" ? "Nothing completed yet." : "No missed tasks. Nice!"}
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------- UI bits ------------------- */

function TabChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        "whitespace-nowrap rounded-full px-3 py-1.5 text-sm border transition",
        active ? "bg-white text-slate-900 border-white" : "bg-white/[0.06] text-white border-white/10 hover:bg-white/[0.1]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function TaskRowCard({
  t,
  onPickFile,
  tab,
}: {
  t: TaskRow;
  onPickFile: (file: File) => void;
  tab: TabKey;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setBusy(true);
    try {
      await onPickFile(file);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={[
        "rounded-2xl border p-3 sm:p-4 flex items-start gap-3 sm:gap-4",
        "bg-white/[0.03] border-white/10"
      ].join(" ")}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-semibold truncate">{t.title}</h4>
          <span
            className={[
              "shrink-0 rounded-full px-2 py-0.5 text-xs border",
              tab === "open"
                ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
                : tab === "completed"
                ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
                : "border-rose-300/30 bg-rose-300/10 text-rose-200",
            ].join(" ")}
          >
            {t.xp_assigned} XP
          </span>
        </div>

        <div className="mt-1 text-xs text-white/70">
          {tab === "completed"
            ? `Completed ${formatDate(t.completed_at || t.due_at)}`
            : tab === "missed"
            ? `Due ${formatDate(t.due_at)} · Penalty −${Math.ceil(t.xp_assigned / 2)} XP`
            : `Due ${formatDate(t.due_at)}`}
        </div>

        {t.description && (
          <p className="mt-2 text-sm text-white/80 line-clamp-3">{t.description}</p>
        )}
      </div>

      {/* Complete with photo (only for open) */}
      {tab === "open" && (
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
            className="shrink-0 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm hover:bg-white/[0.1] disabled:opacity-60"
          >
            {busy ? "Uploading…" : "Proof"}
          </button>
        </>
      )}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="grid gap-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4 animate-pulse"
        >
          <div className="h-4 w-2/3 bg-white/10 rounded mb-2" />
          <div className="h-3 w-1/3 bg-white/10 rounded" />
        </div>
      ))}
    </div>
  );
}

/* ------------------- Helpers ------------------- */

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
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso!;
  }
}
