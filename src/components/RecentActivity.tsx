import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type FeedItem = {
  id: string;
  created_at: string;
  proof_url: string | null;
  proof_thumb_url: string | null;
  task_title: string | null;
  user_name: string | null;
  user_avatar_url: string | null; // may be a storage path OR a full URL
};

// Change if your avatar bucket is named differently
const AVATAR_BUCKET = "avatars";

/** Convert a profiles.avatar_url that may be a storage path into a public URL */
function toPublicAvatar(url: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url; // already a URL
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(url);
  return data?.publicUrl ?? null;
}

export default function RecentActivity() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; title?: string } | null>(null);

  const fetchRecent = async () => {
    setError(null);
    const { data, error } = await supabase
      .from("xp_ledger_view")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      setError(error.message);
      setItems([]);
      return;
    }

    const mapped: FeedItem[] = (data || []).map((r: any) => ({
      id: r.id,
      created_at: r.created_at,
      proof_url: r.proof_url,
      proof_thumb_url: r.proof_thumb_url,
      task_title: r.task_title,
      user_name: r.user_name,
      user_avatar_url: toPublicAvatar(r.user_avatar_url),
    }));

    setItems(mapped);
  };

  useEffect(() => {
    fetchRecent().finally(() => setLoading(false));

    // refresh when new ledger rows arrive
    const channel = supabase
      .channel("xp_ledger_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "xp_ledger" },
        fetchRecent
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setLightbox(null);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  if (loading) return <p className="text-white/70">Loading…</p>;
  if (error) return <p className="text-rose-400">{error}</p>;
  if (!items.length) return <p className="text-white/60">No recent activity.</p>;

  return (
    <>
      <div className="grid gap-3 sm:gap-4">
        {items.map((it) => {
          const thumb = it.proof_thumb_url || it.proof_url || "";
          const avatar = it.user_avatar_url;
          const name = it.user_name || "(unknown)";
          const title = it.task_title || "(untitled)";

          return (
            <article
              key={it.id}
              className="group grid grid-cols-[120px,1fr] sm:grid-cols-[148px,1fr] items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-3 sm:p-4 transition hover:border-white/20 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_12px_40px_-12px_rgba(0,0,0,0.5)]"
            >
              {/* Small thumbnail */}
              <button
                onClick={() => thumb && setLightbox({ src: it.proof_url || thumb, title })}
                title="View photo"
                className="relative block overflow-hidden rounded-xl ring-1 ring-white/10 hover:ring-white/20 focus:outline-none"
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt="Proof"
                    className="h-24 sm:h-28 w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-24 sm:h-28 w-full bg-slate-800" />
                )}
                <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-black/20" />
              </button>

              {/* Text block */}
              <div className="min-w-0 flex flex-col gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Avatar */}
                  {avatar ? (
                    <img
                      src={avatar}
                      alt={name}
                      className="h-8 w-8 rounded-full object-cover ring-2 ring-white/15"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-white/10 grid place-items-center text-sm font-semibold">
                      {name.slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  {/* Name + time */}
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
                    <div
                      title={name}
                      className="font-semibold truncate max-w-[12rem] sm:max-w-[16rem]"
                    >
                      {name}
                    </div>
                    <time className="text-xs text-white/60">
                      {new Date(it.created_at).toLocaleString()}
                    </time>
                  </div>
                </div>

                {/* Task title */}
                <div
                  title={title}
                  className="text-white/90 text-sm sm:text-[15px] truncate"
                >
                  {title}
                </div>

                {/* Action row */}
                <div>
                  <button
                    onClick={() => thumb && setLightbox({ src: it.proof_url || thumb, title })}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs text-white/90 hover:bg-white/[0.1] hover:border-white/20 focus:outline-none"
                  >
                    View photo
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Lightbox modal */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[1000] grid place-items-center bg-black/70 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-[95vw] md:max-w-5xl max-h-[90vh] w-full bg-slate-950 rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl"
          >
            {lightbox.title && (
              <div className="px-4 py-3 border-b border-white/10 text-white/90 font-semibold">
                {lightbox.title}
              </div>
            )}
            <img
              src={lightbox.src}
              alt={lightbox.title || "Proof"}
              className="block max-h-[80vh] w-full object-contain bg-black"
            />
            <div className="px-4 py-3 border-t border-white/10 text-right">
              <button
                onClick={() => setLightbox(null)}
                className="rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
