// Edge function that generates bot replies to a post's reply thread.
// Triggered two ways from the client:
//   1. reason: "reply_opened" -- user pressed the Reply button for the
//      first time on a post with no replies yet. 3 random bots reply to
//      the post itself.
//   2. reason: "user_replied" -- user submitted their own reply. Bots
//      (chosen by @ mention if present, otherwise random) reply again to
//      the thread, aware of the latest message. Each bot can only
//      generate up to MAX_REPLIES_PER_BOT_PER_THREAD replies total in a
//      given post's thread -- once a bot hits that cap it just stops
//      being eligible, other bots keep going.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_API_KEY_FALLBACK = Deno.env.get("GEMINI_API_KEY_FALLBACK");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// same 5 bots used for AI posts -- kept as a separate constant here
// (rather than importing) since edge functions deploy independently and
// don't share module state with generate-ai-posts.
const BOT_PROFILE_IDS = [
  "9c99876a-cef5-4f3c-b379-5e59bf6039b3",
  "698b21a4-238c-46b8-856d-171ff94ac60f",
  "b9a268ff-981b-4321-8bdf-8f20098aad3f",
  "a4ffb15c-7375-4ff5-bcb9-a2be9bc0797d",
  "42f10c9d-c485-4505-a827-662462e85633",
];

const REPLIES_PER_BATCH = 3;
const MAX_REPLIES_PER_BOT_PER_THREAD = 3;

const BASE_SYSTEM_PROMPT = `You are generating short, realistic social media replies for a
fictional social app called Spotlight. Write replies the way real users write: casual,
lowercase-leaning, sometimes using slang. Keep each reply under 200 characters. Do not use
quotation marks around the reply text. Avoid contractions with apostrophes (write "dont"
instead of "don't") since apostrophes can break JSON formatting. Return ONLY valid JSON, no
markdown fences, no preamble, in this exact shape:
{"replies": [{"content": "..."}]}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type BotProfile = { id: string; display_name: string; handle: string };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// parses @handle mentions out of text and matches them against known bot
// handles (case-insensitive, ignoring a leading @ either side).
function extractMentionedBotIds(text: string, bots: BotProfile[]): string[] {
  const mentionPattern = /@([a-zA-Z0-9_]+)/g;
  const mentioned = new Set<string>();
  let match;
  while ((match = mentionPattern.exec(text)) !== null) {
    const handle = match[1].toLowerCase();
    const bot = bots.find((b) => b.handle.replace(/^@/, "").toLowerCase() === handle);
    if (bot) mentioned.add(bot.id);
  }
  return [...mentioned];
}

function pickReplyBots(
  eligibleBots: BotProfile[],
  mentionedIds: string[],
  count: number
): BotProfile[] {
  // mentioned + eligible (under cap) bots always get included first
  const mentionedEligible = eligibleBots.filter((b) => mentionedIds.includes(b.id));
  const rest = eligibleBots.filter((b) => !mentionedIds.includes(b.id));
  const shuffledRest = [...rest].sort(() => Math.random() - 0.5);

  // if more than the batch size are mentioned, only random-select among
  // them rather than including all (per spec: >4 mentions falls back to
  // random selection logic)
  const mentionedPool = mentionedEligible.length > count
    ? [...mentionedEligible].sort(() => Math.random() - 0.5).slice(0, count)
    : mentionedEligible;

  const combined = [...mentionedPool, ...shuffledRest].slice(0, count);
  return combined;
}

async function callGeminiWithKey(apiKey: string, userMessage: string): Promise<{ content: string }[]> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: BASE_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 1,
      max_tokens: 300,
      response_format: { type: "json_object" },
    }),
  });

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
  if (!Array.isArray(parsed.replies)) throw new Error("Model response missing replies array");
  return parsed.replies;
}

async function callGemini(userMessage: string): Promise<{ content: string }[]> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  try {
    return await callGeminiWithKey(GEMINI_API_KEY, userMessage);
  } catch (primaryError) {
    console.error("Primary Gemini key failed:", primaryError);
    if (!GEMINI_API_KEY_FALLBACK) throw primaryError;
    console.log("Retrying with fallback Gemini key...");
    return await callGeminiWithKey(GEMINI_API_KEY_FALLBACK, userMessage);
  }
}

function buildReplyPrompt(
  postContent: string,
  threadReplies: { content: string; author: string }[],
  bot: BotProfile,
  latestUserMessage: string | null
): string {
  const lines: string[] = [];
  lines.push(`You are ${bot.display_name} (@${bot.handle.replace(/^@/, "")}), replying on Spotlight.`);
  lines.push(`Original post: "${postContent}"`);

  if (threadReplies.length) {
    lines.push("Thread so far:");
    threadReplies.forEach((r) => lines.push(`- ${r.author}: ${r.content}`));
  }

  if (latestUserMessage) {
    lines.push(`Respond specifically to this latest message: "${latestUserMessage}"`);
  }

  lines.push("Generate 1 reply now.");
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Missing required environment variables/secrets" }, 500);
  }

  let body: { post_id?: string; reason?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const postId = body.post_id;
  if (!postId) return jsonResponse({ error: "post_id is required" }, 400);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, content")
      .eq("id", postId)
      .single();
    if (postError) throw postError;
    if (!post) return jsonResponse({ error: "Post not found" }, 404);

    const { data: existingReplies, error: repliesError } = await supabase
      .from("post_replies")
      .select("id, content, user_id, bot_user_id, is_ai_generated, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (repliesError) throw repliesError;

    const { data: bots, error: botsError } = await supabase
      .from("bot_profiles")
      .select("id, display_name, handle")
      .in("id", BOT_PROFILE_IDS);
    if (botsError) throw botsError;
    const botsList = (bots || []) as BotProfile[];
    const botById = new Map(botsList.map((b) => [b.id, b]));

    // how many times has each bot already replied in this thread
    const replyCountByBot = new Map<string, number>();
    (existingReplies || []).forEach((r) => {
      if (r.bot_user_id) {
        replyCountByBot.set(r.bot_user_id, (replyCountByBot.get(r.bot_user_id) || 0) + 1);
      }
    });

    const eligibleBots = botsList.filter(
      (b) => (replyCountByBot.get(b.id) || 0) < MAX_REPLIES_PER_BOT_PER_THREAD
    );

    if (!eligibleBots.length) {
      return jsonResponse({ inserted: [], note: "All bots have hit their reply cap in this thread" });
    }

    // figure out latest user message + mentions (only relevant for the
    // user_replied path; reply_opened has no user message yet)
    let latestUserMessage: string | null = null;
    let mentionedBotIds: string[] = [];
    if (body.reason === "user_replied" && existingReplies?.length) {
      const lastReply = existingReplies[existingReplies.length - 1];
      if (!lastReply.bot_user_id) {
        latestUserMessage = lastReply.content;
        mentionedBotIds = extractMentionedBotIds(lastReply.content, botsList);
      }
    }

    const batchSize = Math.min(REPLIES_PER_BATCH, eligibleBots.length);
    const replyBots = pickReplyBots(eligibleBots, mentionedBotIds, batchSize);

    const threadForPrompt = (existingReplies || []).map((r) => ({
      content: r.content,
      author: r.bot_user_id ? (botById.get(r.bot_user_id)?.display_name || "bot") : "user",
    }));

    const insertedRows = [];
    for (const bot of replyBots) {
      const prompt = buildReplyPrompt(post.content, threadForPrompt, bot, latestUserMessage);
      const replies = await callGemini(prompt);
      const content = replies[0]?.content;
      if (!content) continue;

      insertedRows.push({
        post_id: postId,
        bot_user_id: bot.id,
        content,
        is_ai_generated: true,
      });
    }

    if (!insertedRows.length) {
      return jsonResponse({ inserted: [] });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("post_replies")
      .insert(insertedRows)
      .select();
    if (insertError) throw insertError;

    return jsonResponse({ inserted });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
