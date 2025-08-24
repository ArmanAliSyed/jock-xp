// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

// Works in CRA (REACT_APP_*) and Vite (VITE_*)
const viteEnv = (typeof import.meta !== "undefined" && (import.meta as any).env) || {};
const supabaseUrl =
  viteEnv.VITE_SUPABASE_URL ||
  process.env.REACT_APP_SUPABASE_URL ||
  "";
const supabaseAnonKey =
  viteEnv.VITE_SUPABASE_ANON_KEY ||
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  "";

if (!supabaseUrl || !supabaseAnonKey) {
  // Helps catch missing envs at build/runtime
  // eslint-disable-next-line no-console
  console.warn("Supabase env vars are missing. Check Vercel/Local env config.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
