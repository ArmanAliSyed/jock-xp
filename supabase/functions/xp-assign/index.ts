import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const log1p = (n: number) => Math.log(1 + n);

// time -> 0..5 via log scaling (≈5 around 3h)
function timeScore(minutes: number) {
  const m = clamp(Math.round(minutes), 1, 600);
  const s = 5 * (log1p(m) / log1p(180));
  return clamp(Math.round(s), 0, 5);
}

function computeXP(f: { minutes: number; skill: number; physical: number; stakes: number; unpleasant: number; rarity: number; }) {
  const t = timeScore(f.minutes);
  const skill = clamp(f.skill, 0, 5);
  const physical = clamp(f.physical, 0, 5);
  const stakes = clamp(f.stakes, 0, 5);
  const unpleasant = clamp(f.unpleasant, 0, 5);
  const rarity = clamp(f.rarity, 0, 5);

  let xp =
    3 * t +
    6 * skill +
    3 * physical +
    8 * stakes +
    2 * unpleasant +
    10 * rarity;

  xp = Math.round(xp);
  return clamp(xp, 1, 100);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { title, description = "" } = await req.json();
    if (!title) {
      return new Response(JSON.stringify({ error: "Missing 'title'" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    let factors = { minutes: 10, skill: 1, physical: 0, stakes: 0, unpleasant: 0, rarity: 0 };
    let rationale = "";

    if (OPENAI_API_KEY) {
      const prompt = `
You are scoring a task for a small friend group’s XP game.

Infer these integers from the task text (no questions to user):
- minutes: 1..600 (rough time to complete)
- skill: 0..5 (knowledge/complexity)
- physical: 0..5 (bodily effort)
- stakes: 0..5 (importance/consequences/deadline/people depending on you)
- unpleasant: 0..5 (gross/tedious)
- rarity: 0..5 (daily/ordinary=0, rare achievement=5)

Return STRICT JSON ONLY in this shape:
{"minutes":25,"skill":2,"physical":1,"stakes":1,"unpleasant":0,"rarity":0,"rationale":"one concise sentence"}

Calibration hints:
- "Brush my teeth" → minutes≈3, skill 0, physical 0, stakes 0, unpleasant 0–1, rarity 0 → about 1–3 XP.
- "Finish & submit a graded assignment" → minutes≈120, skill 3, physical 0, stakes 4, unpleasant 1, rarity 2 → about 70–90 XP.
- "Rank 1st in 2nd-year engineering" → very high time historically, skill 5, stakes 5, rarity 5 → 100 XP (cap).

Task:
Title: ${title}
Description: ${description || "(none)"}
      `.trim();

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          response_format: { type: "json_object" },
          max_tokens: 200,
        }),
      });

      if (r.ok) {
        const data = await r.json();
        const raw = data?.choices?.[0]?.message?.content ?? "{}";
        const js = JSON.parse(raw);
        factors = {
          minutes: Number(js.minutes) || 10,
          skill: Number(js.skill) || 0,
          physical: Number(js.physical) || 0,
          stakes: Number(js.stakes) || 0,
          unpleasant: Number(js.unpleasant) || 0,
          rarity: Number(js.rarity) || 0,
        };
        rationale = typeof js.rationale === "string" ? js.rationale : "";
      }
    }

    const xp = computeXP(factors);
    return new Response(JSON.stringify({ xp, factors, rationale }), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }
});
