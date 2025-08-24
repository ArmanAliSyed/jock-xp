import React, { useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function AvatarUploader({
  userId,
  currentPath,
  onUpdated
}: {
  userId: string;
  currentPath?: string | null;
  onUpdated: (newPath: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pick = () => inputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErr(null);
    setLoading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const filename = `${crypto.randomUUID()}.${ext}`;
      const path = `${userId}/${filename}`; // bucket: avatars

      // Upload (upsert true is nice UX for avatar)
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
      if (upErr) throw upErr;

      // Persist storage path (not public URL) in profiles
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
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clearAvatar = async () => {
    setErr(null);
    setLoading(true);
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
        capture="user"
        className="hidden"
        onChange={onFileChange}
      />

      <button
        onClick={pick}
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
    </div>
  );
}
