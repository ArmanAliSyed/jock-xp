// src/api/tasks.ts
import { supabase } from "../lib/supabaseClient";

export async function createTask({
  userId, title, description, dueAtISO, minutes = 10, difficulty = 3,
}: {
  userId: string;
  title: string;
  description?: string;
  dueAtISO: string;
  minutes?: number;     // optional sliders
  difficulty?: number;  // 1..5
}) {
  // 1) get XP from edge function (GPT-powered)
  const { data: xpResp, error: fnErr } = await supabase.functions.invoke("xp-assign", {
    body: { title, description, minutes, difficulty },
  });
  if (fnErr) throw fnErr;
  const xp = xpResp?.xp ?? 10;

  // 2) insert the task
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      owner_id: userId,
      title,
      description,
      due_at: dueAtISO,
      xp_assigned: xp,
    })
    .select()
    .single();

  if (error) throw error;
  return data; // includes xp_assigned so you can show “Worth X XP”
}
