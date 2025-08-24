import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Mode = "signup" | "login";

export default function AuthForm({ mode, onDone }: { mode: Mode; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName } },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      onDone();
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ width: 320 }}>
      <h2 style={{ marginBottom: 12 }}>{mode === "signup" ? "Create account" : "Log in"}</h2>
      {mode === "signup" && (
        <input
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 8 }}
          required
        />
      )}
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 12 }}
        required
      />
      {error && <div style={{ color: "red", marginBottom: 8 }}>{error}</div>}
      <button className="btn" disabled={loading} style={{ width: "100%" }}>
        {loading ? "Please wait..." : mode === "signup" ? "Sign up" : "Log in"}
      </button>
    </form>
  );
}
