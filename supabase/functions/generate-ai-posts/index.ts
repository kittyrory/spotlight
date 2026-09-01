// Edge function that generates 3 AI posts using Gemini Flash and inserts
// them into the `posts` table, PRIVATELY scoped to one user. Keys live
// only in this function's environment (set via `supabase secrets set`),
// never in the client HTML.
//
// MODEL PROVIDER:
// Primary calls go straight to Gemini's native API (generativelanguage.
// googleapis.com) using GEMINI_API_KEY, so usage draws down Google's free
// tier first. If that call fails for any reason (quota exhausted, network
// error, malformed response), it falls back once to OpenRouter
//
// PRIVACY MODEL:
// Each inserted post gets `ai_owner_id` set to the requesting user's id.
// Only that user's feed query (`ai_owner_id.eq.<their id>`) will ever
// return these rows. Other users never see them, even though the posts
// are attributed to shared "bot" profiles for display purposes.
//
// NOTIFICATIONS:
// Since the prompt explicitly allows the model to @ mention the user's
// handle, any generated post that does gets a `mention_post` row written
// to `notifications` right after insert, so it shows up on the user's
// notifications page.

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
  "03c6a846-f871-4c73-bfe6-754d87661c71",
  "35a7eb25-8f70-43c3-82ab-e32028b87bce",
  "a4970b5c-cd07-4182-a04d-f0614e0ca200",
  "f661dc7b-6967-4c0c-9ab3-210e56404124",
  "f1e7d612-b942-4506-bb1a-e90fb2f37577",
  "ff109962-d374-4dde-ab35-6a34b52cf65a",
  "6c7eb54f-2e11-43ee-9cfb-2ed4ea1d14bc",
  "3ff9835f-fd18-4982-ad28-033745961ca4",
  "3027e5da-0e1e-4d53-9c58-56f5c93ee1d9",
  "301912ff-30db-451b-892d-1d381e61e5df",
  "ee77e9b0-7f24-4799-bdbc-738de76d563b",
  "c86dca46-4aec-46cc-97ea-50c0b0179343",
  "6eaffc8f-9750-43fd-ba8d-b071a8b2e68f",
  "54b8f1f8-b290-4abc-b651-6dc2440cd460",
  "e7c1435f-d420-4826-8584-8310c8520c6c",
  "a53f3af9-46f0-42a3-bfb7-00319ef858e3",
  "24ad785a-49b5-4595-9466-f39a8827fb25",
  "78034bd1-0df6-46c3-abb2-3aa8828323b3",
  "d1122a9c-3e92-4d3e-8d43-ddedf76ab5c4",
  "25a2f5aa-629f-450e-a4e7-8bc0f7f60e69",
  "6c013f68-4c11-4e7c-a057-5091cb910a78",
  "41deb6eb-d98d-43f8-ba94-7171f7c612a7",
  "5f81972b-ceea-4f9c-99e1-bec848959cd9",
  "9ab599f5-1a7e-4397-ac6e-5ff9fa529cee",
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
function buildUserContextMessage(
  profile: ProfileContext,
  worlds: WorldContext[],
): string {
  const lines: string[] = [];

  if (profile) {
    if (profile.display_name)
      lines.push(`Display name: ${profile.display_name}`);
    if (profile.handle)
      lines.push(
        `Handle: @${profile.handle} (you can @ mention this user by handle in a post occasionally)`,
      );
    if (profile.origin) lines.push(`Origin: ${profile.origin}`);
    if (profile.fame_path) lines.push(`Fame path: ${profile.fame_path}`);
    if (profile.identity) lines.push(`Identity: ${profile.identity}`);
    if (profile.bio) lines.push(`Bio: ${profile.bio}`);
  }

  if (worlds?.length) {
    lines.push(
      "You are encouraged to mention these worlds, and if you do, act as if the setting or characters are real and you are a bystander to the plot:",
    );
    worlds.forEach((w) => {
      const parts = [w.title, w.category, w.description].filter(Boolean);
      if (w.tags?.length) parts.push(`tags: ${w.tags.join(", ")}`);
      lines.push(`- ${parts.join(" — ")}`);
    });
  }

  if (!lines.length) {
    return `Generate ${POST_COUNT} posts now. No specific user context available, keep them general.`;
  }
  return (
    `Here is context about the user these posts are  for. You are encourage to make ` +
    `posts feel personal and relevant to their interests and identity, without being repetitive. Tag the users handle when replying \n\n` +
    lines.join("\n") +
    `\n\nGenerate ${POST_COUNT} posts now.`
  );
}

// primary path: calls Gemini's own native API directly (not OpenRouter).
// key goes in the ?key= query param, request/response shape is Gemini's
// native format (contents/parts in, candidates[0].content.parts[0].text out).
async function callGeminiNative(
  apiKey: string,
  userMessage: string,
): Promise<{ content: string }[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: BASE_SYSTEM_PROMPT }],
        },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: 1,
          maxOutputTokens: 500,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    // log the raw text so we can see exactly what broke the parse (usually
    // an unescaped quote/apostrophe inside a post's content string)
    console.error("Failed to parse model output as JSON. Raw text:", text);
    throw new Error(`Model returned malformed JSON: ${err}`);
  }
  if (!Array.isArray(parsed.posts))
    throw new Error("Model response missing posts array");
  return parsed.posts.slice(0, POST_COUNT);
}

// fallback path: OpenRouter's OpenAI-compatible chat completions endpoint.
// Bearer token auth (not ?key=), response text lives at
// choices[0].message.content instead of Gemini's native shape.
async function callOpenRouter(
  apiKey: string,
  userMessage: string,
): Promise<{ content: string }[]> {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: BASE_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 1,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    },
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
    console.error("Failed to parse model output as JSON. Raw text:", text);
    throw new Error(`Model returned malformed JSON: ${err}`);
  }
  if (!Array.isArray(parsed.posts))
    throw new Error("Model response missing posts array");
  return parsed.posts.slice(0, POST_COUNT);
}

// tries native Gemini first (runs off Gemini's own free-tier credits); if
// that call fails for any reason (rate limit, account restriction, network
// error, malformed response), falls back once to OpenRouter using
// GEMINI_API_KEY_FALLBACK, which holds an OpenRouter key.
async function callGemini(
  profile: ProfileContext,
  worlds: WorldContext[],
): Promise<{ content: string }[]> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");

  const userMessage = buildUserContextMessage(profile, worlds);

  console.log("Profile context received:", JSON.stringify(profile));
  console.log("Worlds context received:", JSON.stringify(worlds));
  console.log("Full prompt sent to model:", userMessage);

  try {
    return await callGeminiNative(GEMINI_API_KEY, userMessage);
  } catch (primaryError) {
    console.error("Primary Gemini call failed:", primaryError);

    if (!GEMINI_API_KEY_FALLBACK) {
      throw primaryError;
    }

    console.log("Retrying with OpenRouter fallback...");
    return await callOpenRouter(GEMINI_API_KEY_FALLBACK, userMessage);
  }
}

// CORS: browsers send a preflight OPTIONS request before the real POST from
// the browser (invoked via supabaseClient.functions.invoke). Without
// responding to OPTIONS and attaching these headers to every response, the
// browser blocks the whole request before our code even runs.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// checks each newly-inserted post's content for an @ mention of the
// recipient's own handle, and builds one `notifications` row per hit.
// kept as its own function since it's a pure transform -- easy to test,
// and easy to see at a glance what it does and doesn't touch.
function buildMentionNotifications(
  insertedPosts: { id: string; content: string; bot_user_id: string }[],
  recipientId: string,
  recipientHandle: string | undefined,
) {
  if (!recipientHandle) return [];
  const mentionRegex = new RegExp(`@${recipientHandle}\\b`, "i");
  return insertedPosts
    .filter((post) => mentionRegex.test(post.content))
    .map((post) => ({
      user_id: recipientId,
      type: "mention_post",
      post_id: post.id,
      actor_bot_id: post.bot_user_id,
      preview: post.content,
    }));
}

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
      JSON.stringify({
        error: "Missing required environment variables/secrets",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let body: {
    reason?: string;
    user_id?: string;
    profile?: ProfileContext;
    worlds?: WorldContext[];
  };
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
      JSON.stringify({
        error: "BOT_PROFILE_IDS placeholders were never filled in",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
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
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
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

    // NEW: notify the user for any inserted post that @ mentions them.
    // non-fatal if this fails -- the posts themselves already succeeded,
    // so we log and move on rather than throwing and losing that result.
    const notificationRows = buildMentionNotifications(
      data ?? [],
      userId,
      body.profile?.handle,
    );
    if (notificationRows.length) {
      const { error: notifError } = await supabase
        .from("notifications")
        .insert(notificationRows);
      if (notifError) {
        console.error("Could not insert mention notifications:", notifError);
      }
    }

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