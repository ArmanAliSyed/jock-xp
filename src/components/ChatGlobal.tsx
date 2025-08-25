import React from "react";
import { supabase } from "../lib/supabaseClient";
import Avatar from "./Avatar"; // you already have this

type ChatRow = {
  id: string;
  room: string;
  user_id: string;
  content: string;
  created_at: string;
  display_name: string | null;
  user_avatar_url: string | null;
};

function timeAgo(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sec = Math.max(0, Math.floor((+now - +d) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo`;
  const yr = Math.floor(day / 365);
  return `${yr}y`;
}

export default function ChatGlobal() {
  const [me, setMe] = React.useState<string | null>(null);
  const [msgs, setMsgs] = React.useState<ChatRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [input, setInput] = React.useState("");

  const listRef = React.useRef<HTMLDivElement | null>(null);

  // load current user id
  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setMe(data.user?.id ?? null);
    });
  }, []);

  // initial fetch: last 50 messages, oldest -> newest
  const fetchInitial = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("chat_messages_view")
      .select("*")
      .eq("room", "global")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setMsgs([...data].reverse() as ChatRow[]);
    }
    setLoading(false);
    scrollToBottom();
  }, []);

  React.useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  // realtime: new messages stream in
  React.useEffect(() => {
    const ch = supabase
      .channel("chat_global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: "room=eq.global" },
        async (payload: any) => {
          const id = payload.new?.id as string | undefined;
          if (!id) return;
          // fetch the view row (to include display_name & avatar)
          const { data } = await supabase
            .from("chat_messages_view")
            .select("*")
            .eq("id", id)
            .maybeSingle();
          if (data) {
            setMsgs((prev) => [...prev, data as ChatRow]);
            scrollToBottom();
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    // Insert with defaults (user_id = auth.uid(), room = 'global')
    const { error } = await supabase
      .from("chat_messages")
      .insert({ content: text, room: "global" });
    if (!error) {
      setInput("");
      // optimistic scroll; realtime will add the row
      scrollToBottom();
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-4 md:p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg md:text-xl font-semibold">Global Chat</h2>
      </div>

      <div
        ref={listRef}
        className="h-[46vh] sm:h-[50vh] overflow-y-auto pr-1 space-y-3"
      >
        {loading && <div className="text-white/70">Loading…</div>}
        {!loading && msgs.length === 0 && (
          <div className="text-white/60">Say hi 👋</div>
        )}

        {!loading &&
          msgs.map((m) => {
            const mine = m.user_id === me;
            const name =
              (m.display_name?.trim() || `Player ${m.user_id.slice(0, 4)}…${m.user_id.slice(-4)}`) +
              (mine ? " (you)" : "");
            return (
              <div
                key={m.id}
                className={`flex items-start gap-3 ${mine ? "flex-row-reverse" : ""}`}
              >
                {/* Avatar */}
                <div className="shrink-0">
                  <Avatar path={m.user_avatar_url ?? undefined} size={36} fallback={name} />
                </div>

                {/* Bubble */}
                <div className={`max-w-[78%] sm:max-w-[70%]`}>
                  <div
                    className={`rounded-2xl px-3.5 py-2 text-[15px] leading-snug border ${
                      mine
                        ? "bg-sky-500/15 border-sky-300/20"
                        : "bg-white/[0.06] border-white/10"
                    }`}
                  >
                    <div className="text-[13px] text-white/60 mb-1">{name}</div>
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  </div>
                  <div className="mt-1 text-[11px] text-white/50">
                    {timeAgo(m.created_at)}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Input */}
      <div className="mt-3 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a message…"
          className="flex-1 rounded-xl bg-white/[0.06] border border-white/10 px-3.5 py-2 text-[15px] focus:outline-none focus:border-white/20"
          maxLength={1000}
        />
        <button
          onClick={send}
          className="rounded-xl bg-sky-500/90 hover:bg-sky-400 text-slate-950 font-semibold text-sm px-3.5 py-2"
        >
          Send
        </button>
      </div>
    </section>
  );
}
