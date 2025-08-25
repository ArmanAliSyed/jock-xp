// supabase/functions/xp-assign/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Configure CORS for browser calls
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** ---------- Scoring helpers (allow negatives) ---------- */
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const log1p = (n: number) => Math.log(1 + n);

// time -> 0..5 via log scaling (≈5 around 3h)
function timeScore(minutes: number) {
  const m = clamp(Math.round(minutes), 1, 600);
  const s = 5 * (log1p(m) / log1p(180));
  return clamp(Math.round(s), 0, 5);
}

/**
 * Harsher XP formula with penalties and “virtue” signal.
 * range: -50 .. +100
 */
function computeXP(f: {
  minutes: number;
  skill: number;        // 0..5
  physical: number;     // 0..5
  stakes: number;       // 0..5
  unpleasant: number;   // 0..5
  rarity: number;       // 0..5
  virtue: number;       // -5..+5  (benefit/harm of task)
  strike: number;       // 0..3    (penalty severity)
  is_joke: boolean;     // obvious meme/brag?
}) {
  const t = timeScore(f.minutes);
  const skill = clamp(f.skill, 0, 5);
  const physical = clamp(f.physical, 0, 5);
  const stakes = clamp(f.stakes, 0, 5);
  const unpleasant = clamp(f.unpleasant, 0, 5);
  const rarity = clamp(f.rarity, 0, 5);

  // Base = “effort/value” score
  let base =
    3 * t +
    6 * skill +
    3 * physical +
    8 * stakes +
    2 * unpleasant +
    10 * rarity;

  // Virtue adjusts +/-; strike is a hard penalty tier
  const virtueAdj = 4 * clamp(f.virtue, -5, 5);
  const strikePenalty = -15 * clamp(f.strike, 0, 3);

  let xp = Math.round(base + virtueAdj + strikePenalty);

  // If it’s a joke/obvious non-task, push below zero unless truly substantial
  if (f.is_joke && base < 20) xp = Math.min(xp, -10);

  return clamp(xp, -50, 100);
}

/** ---------- Edge function ---------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { title, description = "" } = await req.json();
    if (!title) {
      return new Response(
        JSON.stringify({ error: "Missing 'title'" }),
        { status: 400, headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    // Defaults if model call fails
    let factors = {
      minutes: 10,
      skill: 1,
      physical: 0,
      stakes: 0,
      unpleasant: 0,
      rarity: 0,
      virtue: 0,
      strike: 0,
      is_joke: false,
    };
    let rationale = "";

    if (DEEPSEEK_API_KEY) {
      // 🔥 Much harsher rubric + explicit penalties & joke detection
      const prompt = `
You are the ruthless judge for a friends' XP game. Your job: assign FAIR XP, not “feel-good” points.

Be strict:
- Reward real work: studying, training, deadlines, building things.
- Minor hygiene/chores (“brush teeth”, “shower”, “drink water”) = near 0 XP.
- Counterproductive tasks (“skip class”, “having a beer”, “mindless scrolling”) = NEGATIVE XP.
- Meme posts / bragging (“I touched grass”, “I had a beer”, “I blinked”) = NEGATIVE XP (joke).
- Deadlines, commitments and uncommon achievements should score high.
- If a task is dangerous/illegal, score negative (harm).

Infer these integers from the task text (no questions):
- minutes: 1..600 (rough time)
- skill: 0..5 (knowledge/complexity)
- physical: 0..5 (effort)
- stakes: 0..5 (importance/deadline/people depend on it)
- unpleasant: 0..5 (gross/tedious)
- rarity: 0..5 (ordinary=0, rare achievement=5)
- virtue: -5..+5 (net impact: - harmful/brag/junk, + beneficial/growth)
- strike: 0..3 (extra penalty tier for obvious joke/brag/harmful)

Also detect:
- is_joke: true if it’s a meme/brag/obvious non-task.

Return STRICT JSON ONLY:
{
  "minutes": 25,
  "skill": 2,
  "physical": 1,
  "stakes": 1,
  "unpleasant": 0,
  "rarity": 0,
  "virtue": -2,
  "strike": 1,
  "is_joke": true,
  "rationale": "1 short sentence justifying the score"
}

Examples (guidance, not output):
- "Brush my teeth" -> small minutes, skill0, virtue ~0, strike 0 -> ~0 XP
- "Have a beer with the lads" -> minutes small, stakes0, virtue negative, is_joke true or strike≥1 -> negative XP
- "Finish & submit graded assignment" -> minutes 60–180, skill 2–4, stakes 4–5, rarity 1–2 -> high XP
- "Win 1st in engineering cohort" -> max rarity/skill/stakes -> near +100 XP (cap)

Task:
Title: ${title}
Description: ${description || "(none)"} 
      `.trim();

      const r = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-reasoner",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          // Force JSON so we can parse reliably
          response_format: { type: "json_object" },
          max_tokens: 300,
        }),
      });

      if (r.ok) {
        const data = await r.json();
        // DeepSeek returns OpenAI-style shape
        const raw = data?.choices?.[0]?.message?.content ?? "{}";
        const js = JSON.parse(raw);

        factors = {
          minutes: Number(js.minutes) || 10,
          skill: Number(js.skill) || 0,
          physical: Number(js.physical) || 0,
          stakes: Number(js.stakes) || 0,
          unpleasant: Number(js.unpleasant) || 0,
          rarity: Number(js.rarity) || 0,
          virtue: Number(js.virtue) ?? 0,
          strike: Number(js.strike) ?? 0,
          is_joke: Boolean(js.is_joke) ?? false,
        };
        rationale = typeof js.rationale === "string" ? js.rationale : "";
      } else {
        // Surface API errors (useful for logs)
        const errText = await r.text();
        console.warn("DeepSeek API error:", errText);
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
