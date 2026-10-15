// Edge function that generates a DM reply in messages.html using Gemini Flash 
// and inserts it into the `messages` table, PRIVATELY scoped to one user
//
// MODEL PROVIDER:
// Primary calls go straight to Gemini's native API (generativelanguage.
// googleapis.com) using GEMINI_API_KEY, so usage draws down Google's free
// tier first. If that call fails for any reason (quota exhausted, network
// error, malformed response), it falls back once to OpenRouter
// NOTE: Gemini 3.5 flash lite is used because the 2.5 version isn't
// available for free tier users; it's not a typo that the two model providers
// use different models. Once we start paying, it'll be reverted to 2.5
//
// PRIVACY MODEL:
// Each inserted message gets `user_id` set to the requesting user's id and
// `convo_id` set to the conversation it belongs to. Only that user's
// messages query will ever return these rows. Other users never see them,
// even though the messages are (sometimes) attributed to shared "bot" profiles
//
// UNREAD TRACKING / NOTIFICATIONS:
// Each bot message is inserted with `read_at` left null (= unread), and also
// gets a `bot_dm` row in `notifications` right after insert. That row is the
// fallback for when the user isn't there to see the reply (closed the tab
// before it showed up, or later, a bot messaging while they're away). When
// the page receives the reply in an open thread, it marks both the message
// and its notification read, so nothing shows up in that case.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_API_KEY_FALLBACK = Deno.env.get("GEMINI_API_KEY_FALLBACK");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const COOLDOWN_MS = 5 * 1000; // 5 seconds between bot replies in one convo, enforced server-side too

const BASE_SYSTEM_PROMPT = `You are generating a short, realistic direct message reply for a 
fictional social app called Spotlight, written as a specific character described in the 
prompt. Write it the way a real user would text: casual, lowercase-leaning, sometimes using 
slang. Write exactly one reply. Keep it under 220 characters. Do not use quotation 
marks around the reply text. Avoid contractions with apostrophes (write "dont" instead of 
"don't", "its" instead of "it's") since apostrophes can break JSON formatting. Return 
ONLY valid JSON, no markdown fences, no preamble, in this exact shape:
{"replies": [{"content": "..."}]}`;

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

type ArchetypePersonality = {
  archetype: string;
  traits?: string[];
  voice?: string;
};

type TraitPersonality = {
  traits: Record<string, { label: string; value: number }>;
  overallType: string;
  overallDescription?: string;
};

type BotPersonality = ArchetypePersonality | TraitPersonality;

type BotProfile = {
  id: string;
  display_name: string;
  handle: string;
  personality?: BotPersonality | null;
};

// npc bots use {archetype, traits: string[], voice}; custom bot_profiles
// bots use {traits: {trait: {label, value}}, overallType} (same shape as
// the user-facing personality system). same helper as the reply function.
function formatPersonalityLine(personality: BotPersonality): string {
  if ("archetype" in personality) {
    let line = `Your personality: ${personality.archetype}.`;
    if (personality.traits?.length)
      line += ` Traits: ${personality.traits.join(", ")}.`;
    if (personality.voice) line += ` ${personality.voice}`;
    return line;
  }

  const traitDescriptions = Object.values(personality.traits)
    .map((t) => t.label)
    .join(", ");
  let line = `Your personality type: ${personality.overallType}. Traits: ${traitDescriptions}.`;
  if (personality.overallDescription) line += ` ${personality.overallDescription}`;
  return line;
}

// grabs bot info from supabase. tries custom bots, then npcs
async function getBot(
  supabase: SupabaseClient,
  botId: string,
): Promise<BotProfile | null> {
  const { data: custom } = await supabase
    .from("bot_profiles")
    .select("*")
    .eq("id", botId)
    .maybeSingle();
  if (custom) return custom as BotProfile;

  const { data: npc } = await supabase
    .from("npc_profiles")
    .select("*")
    .eq("id", botId)
    .maybeSingle();
  if (npc) return npc as BotProfile;

  return null;
}

// grabs the most recent messages in this conversation
async function getHistory(
  supabase: SupabaseClient,
  convoId: string,
  limit = 20,
): Promise<{ role: string; content: string; created_at: string }[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("convo_id", convoId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).reverse(); // oldest first so the prompt reads in order
}

// builds a user-message describing what bot the AI will roleplay as, this
// specific user's onboarding choices, and their chosen worlds, so replies
// stay in character AND reference the user's actual context.
// kept separate from the system prompt so the formatting rules stay
// stable and only the per-reply context changes per call.
function buildPersonaPrompt(
  bot: BotProfile,
  profile: ProfileContext,
  worlds: WorldContext[],
): string {
  const lines: string[] = [];

  lines.push(
    `You are ${bot.display_name} (@${bot.handle.replace(/^@/, "")}), responding to a message on Spotlight.`,
  );
  if (bot.personality) {
    lines.push(formatPersonalityLine(bot.personality));
    lines.push(
      "Stay in character. Your tone and the things you say should consistently reflect this personality.",
    );
  }

  if (profile) {
    lines.push('Below contains information about the user you are messaging. This is not the character you are roleplaying as, so do not mix it up.')
    if (profile.display_name)
      lines.push(`Display name: ${profile.display_name}`);
    if (profile.handle)
      lines.push(
        `Handle: @${profile.handle}`,
      );
    if (profile.origin) lines.push(`Origin: ${profile.origin}`);
    if (profile.fame_path) lines.push(`Fame path: ${profile.fame_path}`);
    if (profile.identity) lines.push(`Identity: ${profile.identity}`);
    if (profile.bio) lines.push(`Bio: ${profile.bio}`);
  }

  if (worlds?.length) {
    lines.push(
      "You are encouraged to mention these worlds and act as if the setting or characters are real and you are living in the world.",
    );
    worlds.forEach((w) => {
      const parts = [w.title, w.category, w.description].filter(Boolean);
      if (w.tags?.length) parts.push(`tags: ${w.tags.join(", ")}`);
      lines.push(`- ${parts.join(" — ")}`);
    });
  }

  lines.push(
    "This is context about the user this reply is for. Make the reply feel personal " +
      "and relevant to their interests and identity, without being repetitive.",
  );
  return lines.join("\n");
}

// builds the conversation part of the prompt: the recent chat history
// (oldest first) plus the instruction to write the next reply.
function buildDmPrompt(
  bot: BotProfile,
  history: { role: string; content: string }[],
): string {
  const botName = bot.handle.replace(/^@/, "");
  const transcript = history
    .map((m) => `${m.role === "user" ? "User" : botName}: ${m.content}`)
    .join("\n");

  return `This is a private DM conversation. Here is the recent history:
${transcript}

Write @${botName}'s next reply to the user's latest message. Generate your response now.`;
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
    // log the raw text so we can see exactly what broke the parse
    console.error("Failed to parse model output as JSON. Raw text:", text);
    throw new Error(`Model returned malformed JSON: ${err}`);
  }
  if (!Array.isArray(parsed.replies))
    throw new Error("Model response missing replies array");
  return parsed.replies.slice(0, 1);
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
  if (!Array.isArray(parsed.replies))
    throw new Error("Model response missing replies array");
  return parsed.replies.slice(0, 1);
}

// tries native Gemini first; if that call fails, fall back once to OpenRouter
async function callGemini(
  userMessage: string,
): Promise<{ content: string }[]> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");

  // mainly used for debugging purposes, ex. bot is making generic/OOC replies
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
// the browser (invoked via supabaseClient.functions.invoke). 
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// builds one `notifications` row per bot message.
function buildNotifications(
  insertedMessages: { id: string; content: string; bot_id: string; convo_id: string }[],
  recipientId: string,
) {
  return insertedMessages.map((msg) => ({
    user_id: recipientId,
    type: "bot_dm",
    message_id: msg.id,
    convo_id: msg.convo_id,
    actor_bot_id: msg.bot_id,
    preview: msg.content,
    read_at: null,
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
    bot_id?: string;
    convo_id?: string;
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

  const botId = body.bot_id;
  const convoId = body.convo_id;
  if (!botId || !convoId) {
    return new Response(
      JSON.stringify({ error: "bot_id and convo_id are required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    // service role client: bypasses RLS so the function can check/insert
    // regardless of who triggered it.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // server-side cooldown: the client also checks this, but that check is
    // trivially bypassable, so this is the real enforcement. only looks at
    // the bot's last reply in THIS conversation (the user's own messages
    // don't count, otherwise every reply would get blocked).
    const { data: recentReplies, error: recentError } = await supabase
      .from("messages")
      .select("created_at")
      .eq("convo_id", convoId)
      .eq("role", "bot")
      .order("created_at", { ascending: false })
      .limit(1);
    if (recentError) throw recentError;

    if (recentReplies?.length) {
      const lastGeneratedAt = new Date(recentReplies[0].created_at).getTime();
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

    const bot = await getBot(supabase, botId);
    if (!bot) {
      return new Response(JSON.stringify({ error: "Bot not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // the last message in the convo should be the user's. if it isn't, either
    // the page didn't save the user's message first, or the bot already replied.
    const history = await getHistory(supabase, convoId);
    if (!history.length || history[history.length - 1].role !== "user") {
      return new Response(
        JSON.stringify({ error: "No new user message to reply to" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const prompt =
      buildPersonaPrompt(bot, body.profile ?? null, body.worlds ?? []) +
      "\n\n" +
      buildDmPrompt(bot, history);

    const replies = await callGemini(prompt);
    const content = replies[0]?.content;
    if (!content) {
      console.error(
        `Bot ${bot.handle} (${bot.id}) returned no usable content`,
      );
      return new Response(
        JSON.stringify({ error: "Bot did not generate a reply" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // read_at is left out on purpose so it defaults to null (= unread)
    const { data: inserted, error: insertError } = await supabase
      .from("messages")
      .insert({
        convo_id: convoId,
        user_id: userId,
        bot_id: bot.id,
        role: "bot",
        content,
      })
      .select("id, convo_id, bot_id, role, content, created_at, read_at");
    if (insertError) throw insertError;

    // fallback notification: stays unread if the user closes the tab before
    // the reply shows up. the page marks it read when the thread is open.
    // a failure here shouldn't lose the reply, so it only logs.
    const notificationRows = buildNotifications(inserted ?? [], userId);
    if (notificationRows.length) {
      const { error: notifError } = await supabase
        .from("notifications")
        .insert(notificationRows);
      if (notifError) {
        console.error("Could not insert notifications:", notifError);
      }
    }

    return new Response(JSON.stringify({ inserted }), {
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