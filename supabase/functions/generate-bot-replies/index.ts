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
//
// MODEL PROVIDER:
// Primary calls go straight to Gemini's native API (generativelanguage.
// googleapis.com) using GEMINI_API_KEY, so usage draws down Google's free
// tier first. If that call fails for any reason (quota exhausted, network
// error, malformed response), it falls back once to OpenRouter
// NOTE: Gemini 3.5 flash lite is used because the 2.5 version isn't
// available for free tier users; it's not a typo that the two model providers
// use different models. Once we start paying it'll be reverted to 2.5
//
// NOTIFICATIONS:
// After inserting the bot replies, one `notifications` row gets written
// per reply so it shows up on the post owner's notifications page --
// type is `mention_reply` if the reply @ mentions the recipient's handle,
// otherwise `bot_reply`. The recipient is whoever privately owns this
// post's feed slot: `ai_owner_id` if it's an AI-generated post, otherwise
// `user_id` (this mirrors the RLS logic already used elsewhere: posts.
// user_id = auth.uid() OR posts.ai_owner_id = auth.uid()).

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

const REPLIES_PER_BATCH = 5;
const MAX_REPLIES_PER_BOT_PER_THREAD = 3;

const BASE_SYSTEM_PROMPT = `You are generating short, realistic social media replies for a
fictional social app called Spotlight. Write replies the way real users write: casual,
lowercase-leaning, sometimes using slang. Keep each reply under 200 characters. Vary sentence
length and structure - mix short one-line reactions with longer rambling ones, and vary whether
you open with agreement, a question, a joke, or a flat observation. Do not use quotation marks 
around the reply text. Avoid contractions with apostrophes (write "dont" instead of "don't") since 
apostrophes can break JSON formatting. Return ONLY valid JSON, no markdown fences, no preamble, in 
this exact shape: {"replies": [{"content": "..."}]}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
// bots use {traits: {trait: {label, value}}, overallType} (the same shape
// as the user-facing personality system). builds a prompt-ready line for
// whichever shape is present rather than assuming one.
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
    const bot = bots.find(
      (b) => b.handle.replace(/^@/, "").toLowerCase() === handle,
    );
    if (bot) mentioned.add(bot.id);
  }
  return [...mentioned];
}

// same @handle parse, but returns the raw handles instead of matching
// against a bot list -- used to look up a mentioned custom bot that
// might live outside the thread owner's selected_worlds (see below).
function extractMentionedHandles(text: string): string[] {
  const mentionPattern = /@([a-zA-Z0-9_]+)/g;
  const handles = new Set<string>();
  let match;
  while ((match = mentionPattern.exec(text)) !== null) {
    handles.add(match[1].toLowerCase());
  }
  return [...handles];
}

function pickReplyBots(
  eligibleBots: BotProfile[],
  priorityIds: string[],
  count: number,
): BotProfile[] {
  // priority bots compete for a slot within the batch just like
  // anyone else -- they just go first. if there are more of them than
  // the batch has room for, only a random subset makes it in.
  const priorityEligible = eligibleBots.filter((b) =>
    priorityIds.includes(b.id),
  );
  const rest = eligibleBots.filter((b) => !priorityIds.includes(b.id));
  const shuffledRest = [...rest].sort(() => Math.random() - 0.5);

  const priorityPool =
    priorityEligible.length > count
      ? [...priorityEligible].sort(() => Math.random() - 0.5).slice(0, count)
      : priorityEligible;

  return [...priorityPool, ...shuffledRest].slice(0, count);
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
          temperature: 1.3,
          maxOutputTokens: 300,
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
    console.error("Failed to parse model output as JSON. Raw text:", text);
    throw new Error(`Model returned malformed JSON: ${err}`);
  }
  if (!Array.isArray(parsed.replies))
    throw new Error("Model response missing replies array");
  return parsed.replies;
}

// fallback path: OpenRouter's OpenAI-compatible chat completions endpoint.
// Bearer token auth, response text lives at choices[0].message.content.
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
        temperature: 1.3,
        max_tokens: 300,
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
  return parsed.replies;
}

// tries native Gemini first (runs off Gemini's own free-tier credits),
// falls back to OpenRouter once those credits/quota are exhausted or the
// Gemini call fails for any other reason.
async function callGemini(userMessage: string): Promise<{ content: string }[]> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  try {
    return await callGeminiNative(GEMINI_API_KEY, userMessage);
  } catch (primaryError) {
    console.error("Primary Gemini call failed:", primaryError);
    if (!GEMINI_API_KEY_FALLBACK) throw primaryError;
    console.log("Retrying with OpenRouter fallback...");
    return await callOpenRouter(GEMINI_API_KEY_FALLBACK, userMessage);
  }
}

// this now tells the bot:
// (a) who actually wrote the original post and 
// (b) whether latest message was actually directed at it (@mentioned)
function buildReplyPrompt(
  postContent: string,
  postAuthorName: string | null,
  isPostAuthor: boolean,
  threadReplies: { content: string; author: string }[],
  bot: BotProfile,
  latestUserMessage: string | null,
  isDirectlyAddressed: boolean,
): string {
  const lines: string[] = [];
  lines.push(
    `You are ${bot.display_name} (@${bot.handle.replace(/^@/, "")}), replying on Spotlight.`,
  );

  if (bot.personality) {
    lines.push(formatPersonalityLine(bot.personality));
    lines.push(
      "Stay in character. Your tone and reactions should consistently reflect this personality across replies.",
    );
  }

  lines.push(
    `Original post (by ${postAuthorName ?? "another user"}): "${postContent}"`,
  );

  if (threadReplies.length) {
    lines.push("Thread so far:");
    threadReplies.forEach((r) => lines.push(`- ${r.author}: ${r.content}`));
  }

  if (isPostAuthor) {
    lines.push(
      "You are the original poster. You have firsthand knowledge of what you posted " +
        "and can answer questions about it directly and specifically.",
    );
  } else {
    lines.push(
      "You did NOT write the original post and have no firsthand knowledge of it beyond " +
        "what's written above. Do not invent specific details (colors, exact events, feelings " +
        "the poster didn't mention) as if you experienced them yourself. React the way a " +
        "bystander in the thread would: agree, joke, ask your own question, or add a general " +
        "reaction without claiming personal experience of the post's contents.",
    );
  }

  if (latestUserMessage) {
    if (isDirectlyAddressed) {
      lines.push(
        `This message is directed at you specifically, respond to it directly: "${latestUserMessage}"`,
      );
    } else {
      lines.push(
        `The latest message in the thread is: "${latestUserMessage}". You were not ` +
          `specifically addressed, so only react to it if it makes sense for you to jump in.`,
      );
    }
  }

  lines.push("Generate 1 reply now.");
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return jsonResponse({ error: "Method not allowed" }, 405);

  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { error: "Missing required environment variables/secrets" },
      500,
    );
  }

  let body: {
    post_id?: string;
    reason?: string;
    user_id?: string;
    parent_reply_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const postId = body.post_id;
  if (!postId) return jsonResponse({ error: "post_id is required" }, 400);
  const parentReplyId = body.parent_reply_id ?? null;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // fetching bot_user_id -- this is where bot authorship actually
    // lives per the posts schema
    // ai_owner_id is needed separately to know who to notify
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, content, user_id, bot_user_id, ai_owner_id")
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

    const { data: npcBots, error: npcBotsError } = await supabase
      .from("npc_profiles")
      .select("id, display_name, handle, personality")
      .in("id", BOT_PROFILE_IDS);
    if (npcBotsError) throw npcBotsError;

    let customBots: BotProfile[] = [];
    const threadOwnerId = post.ai_owner_id ?? post.user_id ?? null;
    if (threadOwnerId) {
      const { data: ownerProfile, error: ownerProfileError } = await supabase
        .from("profiles")
        .select("selected_worlds")
        .eq("id", threadOwnerId)
        .single();
      if (ownerProfileError) {
        console.error(
          "Could not load selected_worlds for custom bot lookup:",
          ownerProfileError,
        );
      }
      const selectedWorldIds: string[] = (
        ownerProfile?.selected_worlds ?? []
      )
        .map((w: { id?: string }) => w.id)
        .filter(Boolean);

      if (selectedWorldIds.length) {
        const { data: customBotRows, error: customBotsError } = await supabase
          .from("bot_profiles")
          .select("id, display_name, handle, personality")
          .in("world_id", selectedWorldIds);
        if (customBotsError) {
          console.error("Could not load custom bots:", customBotsError);
        } else {
          customBots = (customBotRows || []) as BotProfile[];
        }
      }
    }

    const parentReply = parentReplyId
      ? (existingReplies || []).find((r) => r.id === parentReplyId)
      : null;
    const parentReplyBotId = parentReply?.bot_user_id ?? null;

    const botsList = [...(npcBots || []), ...customBots] as BotProfile[];

    const idsNeedingBackfill = [
      ...new Set(
        [post.bot_user_id, parentReplyBotId].filter(
          (id): id is string => !!id && !botsList.some((b) => b.id === id),
        ),
      ),
    ];
    if (idsNeedingBackfill.length) {
      const { data: backfilledBotRows, error: backfillError } = await supabase
        .from("bot_profiles")
        .select("id, display_name, handle, personality")
        .in("id", idsNeedingBackfill);
      if (backfillError) {
        console.error(
          "Could not look up out-of-scope post/reply author bots:",
          backfillError,
        );
      } else if (backfilledBotRows?.length) {
        customBots = [...customBots, ...(backfilledBotRows as BotProfile[])];
        botsList.push(...(backfilledBotRows as BotProfile[]));
      }
    }

    const mentionSourceText =
      body.reason === "reply_opened"
        ? post.content
        : body.reason === "user_replied" && existingReplies?.length
          ? (() => {
              const lastReply = existingReplies[existingReplies.length - 1];
              return lastReply.bot_user_id ? "" : lastReply.content;
            })()
          : "";
    const rawMentionedHandles = extractMentionedHandles(mentionSourceText || "");
    const knownHandles = new Set(
      botsList.map((b) => b.handle.replace(/^@/, "").toLowerCase()),
    );
    const unresolvedHandles = rawMentionedHandles.filter(
      (h) => !knownHandles.has(h),
    );

    if (unresolvedHandles.length) {
      const orFilter = unresolvedHandles
        .map((h) => `handle.ilike.${h}`)
        .join(",");
      const { data: extraBotRows, error: extraBotError } = await supabase
        .from("bot_profiles")
        .select("id, display_name, handle, personality")
        .or(orFilter);
      if (extraBotError) {
        console.error(
          "Could not look up out-of-scope mentioned bots:",
          extraBotError,
        );
      } else if (extraBotRows?.length) {
        customBots = [...customBots, ...(extraBotRows as BotProfile[])];
        botsList.push(...(extraBotRows as BotProfile[]));
      }
    }

    const botById = new Map(botsList.map((b) => [b.id, b]));

    const postAuthor = post.bot_user_id
      ? botById.get(post.bot_user_id)
      : undefined;
    const postAuthorName = postAuthor?.display_name ?? null;

    const recipientId: string | null = threadOwnerId;

    // how many times has each bot already replied in this thread
    const replyCountByBot = new Map<string, number>();
    (existingReplies || []).forEach((r) => {
      if (r.bot_user_id) {
        replyCountByBot.set(
          r.bot_user_id,
          (replyCountByBot.get(r.bot_user_id) || 0) + 1,
        );
      }
    });

    const eligibleBots = botsList.filter(
      (b) => (replyCountByBot.get(b.id) || 0) < MAX_REPLIES_PER_BOT_PER_THREAD,
    );

    if (!eligibleBots.length) {
      return jsonResponse({
        inserted: [],
        note: "All bots have hit their reply cap in this thread",
      });
    }

    // figure out latest user message + mentions
    let latestUserMessage: string | null = null;
    let mentionedBotIds: string[] = [];
    if (body.reason === "user_replied" && existingReplies?.length) {
      const lastReply = existingReplies[existingReplies.length - 1];
      if (!lastReply.bot_user_id) {
        latestUserMessage = lastReply.content;
        mentionedBotIds = extractMentionedBotIds(lastReply.content, botsList);
      }
    } else if (body.reason === "reply_opened") {
      // no replies exist yet, so the only thing to check for mentions is
      // the original post itself
      mentionedBotIds = extractMentionedBotIds(post.content, botsList);
    }

    const priorityBotIds = new Set<string>(mentionedBotIds);

    if (
      body.reason === "user_replied" &&
      post.bot_user_id &&
      eligibleBots.some((b) => b.id === post.bot_user_id)
    ) {
      priorityBotIds.add(post.bot_user_id);
    }

    if (
      parentReplyBotId &&
      eligibleBots.some((b) => b.id === parentReplyBotId)
    ) {
      priorityBotIds.add(parentReplyBotId);
    }

    const customBotIds = new Set(customBots.map((b) => b.id));
    const hasCustomBotReplied = (existingReplies || []).some(
      (r) => r.bot_user_id && customBotIds.has(r.bot_user_id),
    );
    if (!hasCustomBotReplied) {
      const eligibleCustomBots = eligibleBots.filter((b) =>
        customBotIds.has(b.id),
      );
      if (eligibleCustomBots.length) {
        const pick =
          eligibleCustomBots[
            Math.floor(Math.random() * eligibleCustomBots.length)
          ];
        priorityBotIds.add(pick.id);
      }
    }

    // a bot with a slot should know if it's the one actually being
    // talked to (mentioned, or the direct parent of this reply) vs. just
    // generally in the thread
    const directlyAddressedIds = new Set<string>(mentionedBotIds);
    if (parentReplyBotId) directlyAddressedIds.add(parentReplyBotId);

    const batchSize = Math.min(REPLIES_PER_BATCH, eligibleBots.length);
    const replyBots = pickReplyBots(
      eligibleBots,
      [...priorityBotIds],
      batchSize,
    );

    const threadForPrompt = (existingReplies || []).map((r) => ({
      content: r.content,
      author: r.bot_user_id
        ? botById.get(r.bot_user_id)?.display_name || "bot"
        : "user",
    }));

    const insertedRows = [];
    for (const bot of replyBots) {
      const isPostAuthor = post.bot_user_id === bot.id;
      const isDirectlyAddressed = directlyAddressedIds.has(bot.id);
      const prompt = buildReplyPrompt(
        post.content,
        postAuthorName,
        isPostAuthor,
        threadForPrompt,
        bot,
        latestUserMessage,
        isDirectlyAddressed,
      );

      try {
        const replies = await callGemini(prompt);
        const content = replies[0]?.content;
        if (!content) {
          console.error(
            `Bot ${bot.handle} (${bot.id}) returned no usable content, skipping`,
          );
          continue;
        }

        insertedRows.push({
          post_id: postId,
          parent_reply_id: parentReplyId,
          bot_user_id: bot.id,
          content,
          is_ai_generated: true,
        });
      } catch (err) {
        console.error(
          `Reply generation failed for bot ${bot.handle} (${bot.id}):`,
          err,
        );
        continue;
      }
    }

    if (!insertedRows.length) {
      return jsonResponse({ inserted: [] });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("post_replies")
      .insert(insertedRows)
      .select();
    if (insertError) throw insertError;

    if (recipientId) {
      const { data: recipientProfile, error: recipientError } = await supabase
        .from("profiles")
        .select("handle")
        .eq("id", recipientId)
        .single();
      if (recipientError) {
        console.error(
          "Could not load recipient profile for notifications:",
          recipientError,
        );
      }
      const recipientHandle = recipientProfile?.handle;
      const mentionRegex = recipientHandle
        ? new RegExp(`@${recipientHandle}\\b`, "i")
        : null;

      const notificationRows = (inserted ?? []).map((reply) => ({
        user_id: recipientId,
        type:
          mentionRegex && mentionRegex.test(reply.content)
            ? "mention_reply"
            : "bot_reply",
        post_id: reply.post_id,
        reply_id: reply.id,
        actor_bot_id: reply.bot_user_id,
        preview: reply.content,
      }));

      const { error: notifError } = await supabase
        .from("notifications")
        .insert(notificationRows);
      if (notifError) {
        console.error("Could not insert reply notifications:", notifError);
      }
    }

    return jsonResponse({ inserted });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: String(err) }, 500);
  }
});