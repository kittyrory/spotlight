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
const GEMINI_API_KEY_FALLBACK = Deno.env.get("GEMINI_API_KEY_FALLBACK");
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

const BASE_SYSTEM_PROMPT = `You are generating short, realistic social media posts for a 
fictional social app called Spotlight. Write posts the way real users write: casual, 
lowercase-leaning, sometimes using slang, occasionally with a hashtag. Keep each post 
under 220 characters. Do not use quotation marks around the post text. Avoid contractions 
with apostrophes (write "dont" instead of "don't", "its" instead of "it's") since 
apostrophes can break JSON formatting. Return ONLY valid 
JSON, no markdown fences, no preamble, in this exact shape:
{"posts": [{"content": "..."}, {"content": "..."}, {"content": "..."}]}`;

type ProfileContext = {
  origin?: string;
  fame_path?: string;
  identity?: string;
  display_name?: string;
  handle?: string;
  bio?: string;
} | null;

type WorldContext = {
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  characters?: string[];
  drama?: string;
  cross_universe?: boolean;
};

// builds a user-message describing this specific user's onboarding choices
// and chosen worlds, so posts reference their actual context instead of
// being generic. kept separate from the system prompt so the formatting
// rules stay stable and only the user context section changes per call.
function buildUserContextMessage(profile: ProfileContext, worlds: WorldContext[]): string {
  const lines: string[] = [];

  if (profile) {
    if (profile.display_name) lines.push(`Display name: ${profile.display_name}`);
    if (profile.handle) lines.push(`Handle: @${profile.handle} (you can @ mention this user by handle in a post occasionally)`);
    if (profile.origin) lines.push(`Origin: ${profile.origin}`);
    if (profile.fame_path) lines.push(`Fame path: ${profile.fame_path}`);
    if (profile.identity) lines.push(`Identity: ${profile.identity}`);
    if (profile.bio) lines.push(`Bio: ${profile.bio}`);
  }

  if (worlds?.length) {
    lines.push("Worlds this user follows/is into:");
    worlds.forEach((w) => {
      const parts = [w.title, w.category, w.description].filter(Boolean);
      if (w.tags?.length) parts.push(`tags: ${w.tags.join(", ")}`);
      lines.push(`- ${parts.join(" — ")}`);
    });
  }

  if (!lines.length) {
    return `Generate ${POST_COUNT} posts now. No specific user context available, keep them general.`;
  }

  return `Here is context about the user these posts are privately for. Use it to make the ` +
    `posts feel personal and relevant to their interests and identity, referencing their ` +
    `worlds/fandoms naturally where it fits, without being forced or repetitive about it:\n\n` +
    lines.join("\n") +
    `\n\nGenerate ${POST_COUNT} posts now.`;
}

// OpenRouter uses an OpenAI-compatible chat completions endpoint: Bearer
// token auth (not ?key=), and the response text lives at
// choices[0].message.content instead of Gemini's native
// candidates[0].content.parts[0].text shape.
async function callGeminiWithKey(apiKey: string, userMessage: string): Promise<{ content: string }[]> {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-flash-2.5",
        messages: [
          { role: "system", content: BASE_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 1,
        response_format: { type: "json_object" },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenRouter returned no content");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    // log the raw text so we can see exactly what broke the parse (usually
    // an unescaped quote/apostrophe inside a post's content string)
    console.error("Failed to parse model output as JSON. Raw text:", text);
    throw new Error(`Model returned malformed JSON: ${err}`);
  }
  if (!Array.isArray(parsed.posts)) throw new Error("Model response missing posts array");
  return parsed.posts.slice(0, POST_COUNT);
}

// tries the primary gemini key first; if that call fails for any reason
// (rate limit, account restriction, network error, malformed response),
// automatically retries once with the fallback key before giving up.
async function callGemini(profile: ProfileContext, worlds: WorldContext[]): Promise<{ content: string }[]> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");

  const userMessage = buildUserContextMessage(profile, worlds);

  try {
    return await callGeminiWithKey(GEMINI_API_KEY, userMessage);
  } catch (primaryError) {
    console.error("Primary Gemini key failed:", primaryError);

    if (!GEMINI_API_KEY_FALLBACK) {
      throw primaryError;
    }

    console.log("Retrying with fallback Gemini key...");
    return await callGeminiWithKey(GEMINI_API_KEY_FALLBACK, userMessage);
  }
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

  let body: { reason?: string; user_id?: string; profile?: ProfileContext; worlds?: WorldContext[] };
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

    const posts = await callGemini(body.profile ?? null, body.worlds ?? []);

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