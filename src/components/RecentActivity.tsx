// src/components/RecentActivity.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Reactions from "./Reactions";

type FeedItem = {
  id: string;
  created_at: string;
  proof_url: string | null;
  proof_thumb_url: string | null;
  task_title: string | null;
  user_name: string | null;
  user_avatar_url: string | null;
};

const AVATAR_BUCKET = "avatars";
const PAGE_SIZE = 3;

/** Convert a profiles.avatar_url that may be a storage path into a public URL */
function toPublicAvatar(url: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url; // already a URL
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(url);
  return data?.publicUrl ?? null;
}

/** Mobile-friendly relative time like "2h ago" with full timestamp in title */
function timeAgo(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sec = Math.max(0, Math.floor((+now - +d) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

export default function RecentActivity() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lightbox, setLightbox] = useState<{ src: string; title?: string } | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // pagination
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchPage = async (p: number) => {
    setError(null);
    setLoading(true);

    const from = (p - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1; // ✅ fixed

    const { data, error, count } = await supabase
      .from("xp_ledger_view")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      setError(error.message);
      setItems([]);
      setTotal(0);
      setLoading(false);
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
    setTotal(count ?? mapped.length);
    setLoading(false);
  };

  // initial + when page changes
  useEffect(() => {
    fetchPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // live updates: on new ledger row, jump to first page and refresh it
  useEffect(() => {
    const channel = supabase
      .channel("xp_ledger_feed_paginated")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "xp_ledger" },
        () => {
          setPage(1);
          fetchPage(1);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // ESC to close lightbox
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setLightbox(null);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  // Keep page in range if total shrinks
  useEffect(() => {
    const tp = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > tp) setPage(tp);
  }, [total, page]);

  // Preload image for smoother display (page remains scrollable)
  useEffect(() => {
    if (lightbox) {
      setImgLoaded(false);
      const img = new Image();
      img.src = lightbox.src;
      img.onload = () => setImgLoaded(true);
    }
  }, [lightbox]);

  return (
    <>
      {/* Header row with pager */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[17px] font-semibold">Recent Activity</h3>
        <Pager
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      </div>

      {loading && <p className="text-white/70">Loading…</p>}
      {!loading && error && <p className="text-rose-400">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="text-white/60">No recent activity.</p>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="grid gap-3 sm:gap-4">
          {items.map((it) => {
            const thumb = it.proof_thumb_url || it.proof_url || "";
            const avatar = it.user_avatar_url;
            const name = it.user_name || "(unknown)";
            const title = it.task_title || "(untitled)";

            return (
              <article
                key={it.id}
                className="group grid grid-cols-[96px,1fr] sm:grid-cols-[140px,1fr] items-center gap-3 sm:gap-4 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-3 sm:p-4 transition hover:border-white/20 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_12px_40px_-12px_rgba(0,0,0,0.5)]"
              >
                {/* Small thumbnail (slightly taller on mobile for nicer aspect) */}
                <button
                  onClick={() => thumb && setLightbox({ src: it.proof_url || thumb, title })}
                  title="View photo"
                  className="relative block overflow-hidden rounded-xl ring-1 ring-white/10 hover:ring-white/20 focus:outline-none active:scale-[.98] transition"
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt="Proof"
                      className="h-28 sm:h-32 w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-28 sm:h-32 w-full bg-slate-800" />
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
                        className="h-9 w-9 rounded-full object-cover ring-2 ring-white/15"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-white/10 grid place-items-center text-sm font-semibold">
                        {name.slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    {/* Name + time (compact) */}
                    <div className="flex items-baseline gap-2 min-w-0">
                      <div
                        title={name}
                        className="font-semibold truncate max-w-[11rem] sm:max-w-[16rem] text-[15px]"
                      >
                        {name}
                      </div>
                      <time
                        className="text-[12px] text-white/60"
                        title={new Date(it.created_at).toLocaleString()}
                      >
                        {timeAgo(it.created_at)}
                      </time>
                    </div>
                  </div>

                  {/* Task title */}
                  <div title={title} className="text-white/90 text-[15px] truncate">
                    {title}
                  </div>

                  {/* Actions: View + Reactions */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => thumb && setLightbox({ src: it.proof_url || thumb, title })}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3.5 py-2 text-sm text-white/90 hover:bg-white/[0.1] hover:border-white/20 focus:outline-none active:scale-[.98]"
                    >
                      View photo
                    </button>

                    <Reactions ledgerId={it.id} /* size="md" showPpv */ />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Bottom pager (nice on mobile thumbs reach) */}
      {!loading && !error && totalPages > 1 && (
        <div className="mt-3 flex justify-end">
          <Pager
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          />
        </div>
      )}

      {/* Non-blocking centered popup with iPhone-safe padding */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[1000] pointer-events-none"
          style={{
            // Safe areas for iPhone notch/home indicator
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
            paddingLeft: "env(safe-area-inset-left)",
            paddingRight: "env(safe-area-inset-right)",
          }}
        >
          {/* visual backdrop only; scrolling passes through */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm pointer-events-none" />

          <div className="absolute inset-0 grid place-items-center p-3 sm:p-6">
            <div
              role="dialog"
              aria-modal="true"
              className="pointer-events-auto relative w-[min(94vw,680px)] max-h-[75svh] rounded-2xl bg-slate-950 p-4 shadow-2xl ring-1 ring-white/10 flex flex-col items-center"
            >
              {/* Close: large tap target */}
              <button
                aria-label="Close"
                onClick={() => setLightbox(null)}
                className="absolute right-3 top-3 h-11 min-w-11 px-4 rounded-full border border-white/20 bg-black/60 text-sm text-white hover:bg-black/80 active:scale-[.98]"
              >
                Close
              </button>

              {/* Image area */}
              <div className="flex items-center justify-center">
                {!imgLoaded && <div className="text-white/70 text-sm py-10">Loading photo…</div>}
                <img
                  src={lightbox.src}
                  alt={lightbox.title || "Proof"}
                  className={`max-w-[90vw] max-h-[60svh] object-contain ${
                    imgLoaded ? "opacity-100" : "opacity-0"
                  } transition-opacity`}
                  onLoad={() => setImgLoaded(true)}
                />
              </div>

              {lightbox.title && (
                <div className="mt-2 text-white/90 text-sm font-medium text-center px-2">
                  {lightbox.title}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Small pager (touch-friendly) ---------- */
function Pager({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={onPrev}
        disabled={page <= 1}
        className="rounded-lg border border-white/10 bg-white/[0.06] px-3.5 py-2 text-sm disabled:opacity-50 hover:bg-white/[0.1] active:scale-[.98]"
      >
        Prev
      </button>
      <span className="text-sm text-white/70">
        Page {page} / {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={page >= totalPages}
        className="rounded-lg border border-white/10 bg-white/[0.06] px-3.5 py-2 text-sm disabled:opacity-50 hover:bg-white/[0.1] active:scale-[.98]"
      >
        Next
      </button>
    </div>
  );
}
