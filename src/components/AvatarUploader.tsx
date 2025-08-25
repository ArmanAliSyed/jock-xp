import React, { useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Props = {
  userId: string;
  currentPath?: string | null;
  onUpdated: (newPath: string) => void;
  maxSizeMB?: number;
};

const AVATAR_BUCKET = "avatars";

export default function AvatarUploader({
  userId,
  currentPath,
  onUpdated,
  maxSizeMB = 5,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const openPicker = () => inputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (file.size > (maxSizeMB ?? 5) * 1024 * 1024) {
      setErr(`File must be ≤ ${maxSizeMB}MB`);
      return;
    }

    setLoading(true);
    setErr(null);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const filename = `${crypto.randomUUID()}.${ext}`;
      const path = `${userId}/${filename}`;

      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: "3600",
        });
      if (upErr) throw upErr;

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: path })
        .eq("id", userId);
      if (updErr) throw updErr;

      onUpdated(path);
    } catch (e: any) {
      setErr(e.message ?? "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const clearAvatar = async () => {
    setLoading(true);
    setErr(null);
    try {
      await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
      onUpdated("");
    } catch (e: any) {
      setErr(e.message ?? "Failed to remove");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />

      <button
        onClick={openPicker}
        disabled={loading}
        className="rounded-xl bg-sky-500/90 hover:bg-sky-400 text-slate-950 font-semibold px-4 py-2 disabled:opacity-60"
      >
        {loading ? "Uploading…" : "Change photo"}
      </button>

      {currentPath ? (
        <button
          onClick={clearAvatar}
          disabled={loading}
          className="rounded-xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] px-4 py-2 text-white disabled:opacity-60"
        >
          Remove
        </button>
      ) : null}

      {err && <span className="text-rose-400 text-sm">{err}</span>}
      <div className="w-full text-xs text-white/50">
        Tip: On mobile you’ll see options to take a photo or choose from your library.
      </div>
    </div>
  );
}
