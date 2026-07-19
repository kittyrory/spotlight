// Edge function that generates 3 AI posts using Gemini Flash and inserts
// them into the `posts` table, PRIVATELY scoped to one user. The Gemini
// API key lives only in this function's environment (set via
// `supabase secrets set`), never in the client HTML.
//
// PRIVACY MODEL:
// Each inserted post gets `ai_owner_id` set to the requesting user's id.
// Only that user's feed query (`ai_owner_id.eq.<their id>`) will ever
// return these rows. Other users never see them, even though the posts
// are attributed to shared "bot" profiles for display purposes.
//
// Expects a `posts` table with at least:
//   id (uuid, pk, default gen_random_uuid())
//   user_id (uuid, fk -> profiles.id)       <- the bot's profile id
//   ai_owner_id (uuid, fk -> profiles.id, nullable)  <- who this is private to
//   content (text)
//   image_urls (text[], nullable)
//   like_count / dislike_count / repost_count (int, default 0)
//   created_at (timestamptz, default now())
//   is_ai_generated (bool, default false)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const BOT_PROFILE_IDS = [
  "9c99876a-cef5-4f3c-b379-5e59bf6039b3",
  "698b21a4-238c-46b8-856d-171ff94ac60f",
  "b9a268ff-981b-4321-8bdf-8f20098aad3f",
  "a4ffb15c-7375-4ff5-bcb9-a2be9bc0797d",
  "42f10c9d-c485-4505-a827-662462e85633",
];

const POST_COUNT = 3;
const COOLDOWN_MS = 60 * 1000; // 1 minute, enforced server-side too

const SYSTEM_PROMPT = `You are generating short, realistic social media posts for a 
fictional social app called Spotlight. Write posts the way real users write: casual, 
lowercase-leaning, sometimes using slang, occasionally with a hashtag. Keep each post 
under 220 characters. Do not use quotation marks around the post text. Return ONLY valid 
JSON, no markdown fences, no preamble, in this exact shape:
{"posts": [{"content": "..."}, {"content": "..."}, {"content": "..."}]}`;

async function callGemini(): Promise<{ content: string }[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: `Generate ${POST_COUNT} posts now.` }] },
        ],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
          temperature: 1,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");

  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed.posts)) throw new Error("Gemini response missing posts array");
  return parsed.posts.slice(0, POST_COUNT);
}

// CORS: browsers send a preflight OPTIONS request before the real POST from
// the browser (invoked via supabaseClient.functions.invoke). Without
// responding to OPTIONS and attaching these headers to every response, the
// browser blocks the whole request before our code even runs.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing required environment variables/secrets" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: { reason?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("Received body:", JSON.stringify(body));

  const userId = body.user_id;
  if (!userId) {
    return new Response(JSON.stringify({ error: "user_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (BOT_PROFILE_IDS.some((id) => id.startsWith("REPLACE_WITH_"))) {
    return new Response(
      JSON.stringify({ error: "BOT_PROFILE_IDS placeholders were never filled in" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // service role client: bypasses RLS so the function can check/insert
    // regardless of who triggered it.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // server-side cooldown: the client also checks this, but that check is
    // trivially bypassable, so this is the real enforcement.
    const { data: recentPosts, error: recentError } = await supabase
      .from("posts")
      .select("created_at")
      .eq("ai_owner_id", userId)
      .eq("is_ai_generated", true)
      .order("created_at", { ascending: false })
      .limit(1);
    if (recentError) throw recentError;

    if (recentPosts?.length) {
      const lastGeneratedAt = new Date(recentPosts[0].created_at).getTime();
      if (Date.now() - lastGeneratedAt < COOLDOWN_MS) {
        return new Response(
          JSON.stringify({ error: "Cooldown active, try again shortly" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const posts = await callGemini();

    // shuffle a copy of BOT_PROFILE_IDS and take the first POST_COUNT so we
    // get 3 different random bots each time instead of always the same
    // fixed order
    const shuffledBots = [...BOT_PROFILE_IDS].sort(() => Math.random() - 0.5);

    const rows = posts.map((p, i) => ({
      bot_user_id: shuffledBots[i % shuffledBots.length],
      ai_owner_id: userId,
      content: p.content,
      is_ai_generated: true,
    }));

    console.log("Rows to insert:", JSON.stringify(rows));

    const { data, error } = await supabase.from("posts").insert(rows).select();
    if (error) throw error;

    console.log("Inserted result:", JSON.stringify(data));

    return new Response(JSON.stringify({ inserted: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});