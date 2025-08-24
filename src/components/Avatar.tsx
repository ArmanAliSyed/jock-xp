import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Avatar({
  path,                 // storage path like "<uid>/<file>.jpg"
  size = 48,
  fallback = "?"
}: { path?: string | null; size?: number; fallback?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        if (!path) { if (alive) setUrl(null); return; }
        // PUBLIC bucket
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        if (alive) setUrl(data?.publicUrl ?? null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [path]);

  const sizeStyle = { width: size, height: size };

  if (loading) {
    return (
      <div
        style={sizeStyle}
        className="rounded-full bg-white/10 animate-pulse ring-1 ring-white/10"
        aria-label="loading avatar"
      />
    );
  }

  if (!url) {
    return (
      <div
        style={sizeStyle}
        className="rounded-full grid place-items-center bg-white/10 ring-1 ring-white/15 text-white/90 font-bold select-none"
      >
        {fallback?.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt="avatar"
      style={sizeStyle}
      className="rounded-full object-cover ring-2 ring-white/15"
      loading="lazy"
    />
  );
}
