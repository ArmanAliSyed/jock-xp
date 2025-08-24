import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";
import Avatar from "../components/Avatar";
import AvatarUploader from "../components/AvatarUploader";

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export default function Profile() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
  }, []);

  useEffect(() => {
    if (!session?.user.id) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .eq("id", session.user.id)
        .single();
      if (alive) setProfile(data as ProfileRow);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [session?.user.id]);

  if (!session) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
        <div className="text-white/80">Not signed in.</div>
      </section>
    );
  }

  if (loading || !profile) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
        <div className="h-6 w-40 rounded bg-white/10 animate-pulse mb-4" />
        <div className="flex items-center gap-4">
          <div className="h-[72px] w-[72px] rounded-full bg-white/10 animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-56 rounded bg-white/10 animate-pulse" />
            <div className="h-3 w-40 rounded bg-white/10 animate-pulse" />
          </div>
        </div>
      </section>
    );
  }

  const initial = (profile.display_name || session.user.email || "?").charAt(0);

  return (
    <section className="max-w-xl rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-5 md:p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
      <h2 className="text-xl md:text-2xl font-semibold mb-4">Profile</h2>

      <div className="flex items-center gap-4 md:gap-5">
        <Avatar path={profile.avatar_url ?? undefined} size={72} fallback={initial} />
        <div className="min-w-0">
          <div className="font-semibold text-[18px] truncate">
            {profile.display_name || session.user.email}
          </div>
          <div className="text-sm text-white/70 truncate">{session.user.email}</div>
        </div>
      </div>

      <div className="mt-4">
        <AvatarUploader
          userId={profile.id}
          currentPath={profile.avatar_url ?? undefined}
          onUpdated={(newPath) => setProfile({ ...profile, avatar_url: newPath || null })}
        />
      </div>
    </section>
  );
}
