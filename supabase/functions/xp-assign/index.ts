// supabase/functions/xp-assign/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* -------------------- server -------------------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { title, description = "" } = await req.json();
    if (!title) {
      return new Response(
        JSON.stringify({ error: "Missing 'title'" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...cors },
        }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    let xp = 0;
    let rationale = "Default heuristic used (no LLM).";

    if (OPENAI_API_KEY) {
      const prompt = `
You are the harsh referee for a small friend group's productivity XP game.  
You must assign **a single signed XP score** in the range **-100 to +100**.  
Think like a bell curve: most normal tasks fall in the middle (−20..+40), extreme highs and lows are very rare.  
Do not be sympathetic, only judge based on raw facts.  

Rules:
- Good, productive, meaningful, effortful tasks → positive XP.  
- Lazy, trivial, selfish, vice, joke, or illegal/antisocial tasks → negative XP.  
- Extreme values (±90..100) should be almost impossible (reserved for lifetime-level achievements or heinous acts).  

Return STRICT JSON ONLY:
{
  "xp": 25,
  "rationale": "one blunt factual sentence"
}

Calibration examples (approximate XP):
- Brush teeth → +5 XP (daily hygiene, minimal effort).
- Go for a 5km run → +25 XP (sustained effort, health benefit).
- Gym workout → +30 XP.
- Study 3+ hours for an exam → +35 XP.
- Go to work (obligation) → +10 XP.
- Land top marks or Google internship → +95 XP (near cap).
- Drink alcohol → -10 XP.
- Vape → -15 XP.
- Waste time scrolling TikTok 2h → -20 XP.
- Illegal activity (severity matters):  
  • Minor theft → -50 XP.  
  • Serious crime (assault, stealing from vulnerable) → -70 to -90 XP.  

Task to judge:
Title: ${title}
Description: ${description || "(none)"}
      `.trim();

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 200,
          response_format: { type: "json_object" },
        }),
      });

      if (!r.ok) {
        rationale = `OpenAI error ${r.status}; fallback XP=0.`;
      } else {
        const data = await r.json();
        const raw = data?.choices?.[0]?.message?.content ?? "{}";
        const js = JSON.parse(raw);
        xp = clamp(Number(js.xp) || 0, -100, 100);
        rationale =
          typeof js.rationale === "string"
            ? js.rationale
            : "Scored by GPT-5.";
      }
    }

    return new Response(JSON.stringify({ xp, rationale }), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }
});

/* -------------------- helpers -------------------- */
const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));
