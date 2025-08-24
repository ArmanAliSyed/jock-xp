import React, { useState, useEffect } from "react";
import AuthForm from "../components/AuthForm";
import { supabase } from "../lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";

export default function Landing() {
  const [mode, setMode] = useState<"login" | "signup" | null>(null);
  const navigate = useNavigate();

  // Redirect to /dashboard if already logged in
  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      if (data.session) navigate("/dashboard");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess: Session | null) => {
      if (!isMounted) return;
      if (sess) navigate("/dashboard");
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="relative min-h-screen grid place-items-center px-4">
      {/* BG glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(35%_55%_at_20%_0%,rgba(59,130,246,0.25),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(35%_55%_at_80%_20%,rgba(139,92,246,0.25),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_100%,rgba(2,6,23,0.9),transparent_60%)]" />
      </div>

      {/* Content */}
      <div className="w-full max-w-xl">
        {/* Brand / hero */}
        {!mode && (
          <div className="text-center space-y-5 mb-6">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Jock Squad <span className="text-white/70">XP Farm</span>
            </h1>
            <p className="text-white/70 max-w-md mx-auto">
              Get productive because your friends are watching. Earn XP with proof,
              climb the leaderboard, and keep your streak alive.
            </p>
          </div>
        )}

        {/* Card */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.05] backdrop-blur p-5 sm:p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]">
          {mode ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg sm:text-xl font-semibold capitalize">{mode}</h2>
                <button
                  onClick={() => setMode(null)}
                  className="rounded-lg border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] px-3 py-1.5 text-sm"
                >
                  ← Back
                </button>
              </div>
              <AuthForm mode={mode} onDone={() => setMode(null)} />
            </>
          ) : (
            <div className="grid gap-3 sm:gap-4">
              <button
                className="rounded-xl bg-sky-500/90 hover:bg-sky-400 text-slate-950 font-semibold py-2.5"
                onClick={() => setMode("login")}
              >
                Login
              </button>
              <button
                className="rounded-xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] py-2.5"
                onClick={() => setMode("signup")}
              >
                Sign up
              </button>

              {/* tiny footer */}
              <p className="text-center text-xs text-white/60 mt-1">
                By continuing you agree to our friendly rules: post real proofs,
                keep it respectful, and have fun.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
