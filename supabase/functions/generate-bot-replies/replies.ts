// Edge function that generates bot replies to a post's reply thread.
// Triggered two ways from the client:
//   1. reason: "reply_opened" -- user pressed the Reply button for the
//      first time on a post with no replies yet. Three model calls total:
//        - CALL 1: TOP_LEVEL_REPLIES_MIN..MAX (5-7, random) bots each write
//          one parent reply to the post, all in a single prompt
//        - CALL 2: those parent replies are inserted, then ONE prompt gets
//          every parent reply plus the CHILD_REPLIES_MIN..MAX (0-4, random)
//          bots assigned under each one, and writes all the nested replies
//        - CALL 3: the nested replies are inserted, then ONE prompt gets
//          every one of them plus REPLY_TO_REPLY_MIN..MAX (0-1, random) bot
//          assigned to each, so a nested reply gets either no answer or
//          exactly one
//      The post has no parent reply, so top-level replies don't @ anyone.
//   2. reason: "user_replied" -- user submitted their own reply. Two model
//      calls total:
//        - CALL 1: USER_REPLIES_MIN..CHILD_REPLIES_MAX (1-4, random) bots reply
//          underneath that reply (parent_reply_id from the client). The min is
//          different from CHILD_REPLIES_MIN because a user reply should always
//          get at least one answer, while a bot's parent reply can get none.
//        - CALL 2: same idea as call 3 above. Each of those bot replies is
//          inserted, then ONE prompt covers the REPLY_TO_REPLY_MIN..MAX (0-1,
//          random) bot assigned to each (skipped entirely if every one rolls 0)
//
// Every reply that has a parent reply starts with an @ of the parent
// reply's author handle (ex. "@rory hey"). The code enforces it since
// the AI could just ignore if we tell it to (see withLeadingMention).
//
// HARD LIMIT: MAX_REPLIES (3). The user can reply 3 times in a thread and
// get bot replies each time. After that the bots stop for good, ALL of them --
// nothing is generated for the 4th reply onward (each bot used to have its own
// limit, but i changed that since it's useless now that we have ~30 npc bots 
// and counting, meaning you could go on for 90 replies before)
//
// BOT SELECTION (same for both triggers, see pickReplyBots):
//   - Priority bots go first: @mentioned bots and the post's author bot (on
//     user_replied). A bot never gets assigned to reply under its own reply.
//   - Every batch is guaranteed at least one custom bot (bot_profiles,
//     loaded from the thread owner's selected_worlds, plus any
//     mentioned/author bots outside them), as long as one is eligible. A
//     slot is reserved for it if no priority bot is already custom.
//   - Remaining slots are filled by weighted random from all eligible
//     bots. Custom bots are weighted CUSTOM_BOT_WEIGHT (1.5x) vs 1x for
//     npc_profiles bots, so they are slightly more likely to be rolled.
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
//
// NOTIFICATIONS:
// After inserting the bot replies, a `notifications` row gets written for
// every top-level reply to the post, plus any nested reply that @ mentions
// the recipient's handle (nested replies that don't tag them stay quiet so a
// first open doesn't flood the page with ~40 rows). Type is `mention_reply`
// if the reply @ mentions the recipient's handle, otherwise `bot_reply`. The
// recipient is whoever privately owns this
// Post's feed slot: `ai_owner_id` if it's an AI-generated post, otherwise
// `user_id` (this mirrors the RLS logic already used elsewhere: posts.
// user_id = auth.uid() OR posts.ai_owner_id = auth.uid()).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_API_KEY_FALLBACK = Deno.env.get("GEMINI_API_KEY_FALLBACK");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// NOTE TO SELF: put this somewhere shared later
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

// reply_opened: how many parent (top-level) replies get generated. the actual
// number is random between these, inclusive.
const TOP_LEVEL_REPLIES_MIN = 5;
const TOP_LEVEL_REPLIES_MAX = 7;
// how many replies go under ONE parent reply. user replies is different since
// i doubt anyone would want 0 replies
const CHILD_REPLIES_MIN = 0;
const USER_REPLIES_MIN = 1;
const CHILD_REPLIES_MAX = 4;
// replies to the replies the bots just wrote (call 3 on reply_opened, call 2 on
// user_replied). per reply it's 0-1: either nobody answers it or exactly one
// bot does.
const REPLY_TO_REPLY_MIN = 0;
const REPLY_TO_REPLY_MAX = 1;
// how many user replies in one thread the bots will answer. the user's 4th
// reply (and every one after) gets nothing back from any bot.
const MAX_REPLIES = 3;
// one prompt now writes a whole batch (up to 7 parent replies, or up to
// 7*4 = 28 nested replies), so the output budget has to be much bigger than a
// single reply needed.
// if anyone sees this and dislikes it, we can discuss it and i'll change the limits
const BATCH_MAX_OUTPUT_TOKENS = 4096;

// contractions avoided b/c it can break json formatting
const BASE_SYSTEM_PROMPT = `You are generating short, realistic social media replies for a
fictional social app called Spotlight. Write replies the way real users write: casual,
lowercase-leaning, sometimes using slang. Keep each reply under 200 characters. Vary sentence
length and structure - mix short one-line reactions with longer rambling ones, and vary whether
you open with agreement, a question, a joke, or a flat observation. Do not use quotation marks 
around the reply text. Avoid contractions with apostrophes (write "dont" instead of "don't"). 
Return ONLY valid JSON, no markdown fences, no preamble: an object with a "replies" array where 
every item has exactly the fields the request asks for.`;

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

// one item of the model's "replies" array. batch prompts also ask for
// `handle` (which bot wrote it) and `parent` (which parent reply it answers)
type ReplyDraft = {
  content?: string;
  handle?: string;
  parent?: number;
};

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// pulls world ids out of profiles.selected_worlds no matter how it was
// stored: [{id}], [{world_id}], ["id"], numbers, or a JSON string.
function extractWorldIds(raw: unknown): string[] {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [value as string];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((w: any) =>
      typeof w === "string" || typeof w === "number"
        ? String(w)
        : (w?.id ?? w?.world_id ?? w?.worldId),
    )
    .filter(Boolean)
    .map(String)
    // legacy preset ids ("1", "2", ...) aren't uuids and can't have bot_profiles;
    // passing them to a uuid column would make the whole query error.
    .filter((id: string) => UUID_RE.test(id));
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

// the reply a new reply is directly answering (null = answering the post itself)
type ParentInfo = {
  content: string;
  authorName: string;
  handle: string; // no leading @
};

function cleanHandle(handle: string): string {
  return handle.replace(/^@/, "");
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// makes sure the reply starts with "@handle ". incase the model already opened
// with that exact handle it's left alone, otherwise the tag is prepended.
function withLeadingMention(content: string, handle: string): string {
  const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alreadyTagged = new RegExp(`^@${escaped}(?![a-zA-Z0-9_])`, "i");
  return alreadyTagged.test(content) ? content : `@${handle} ${content}`;
}

// custom (bot_profiles) bots get a slightly bigger weight than npc bots
// when rolling for the non-priority slots.
const CUSTOM_BOT_WEIGHT = 1.5;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// weighted random sample without replacement
function weightedSample(
  pool: BotProfile[],
  count: number,
  customIds: Set<string>,
): BotProfile[] {
  const remaining = [...pool];
  const picked: BotProfile[] = [];
  while (picked.length < count && remaining.length) {
    const weights = remaining.map((b) =>
      customIds.has(b.id) ? CUSTOM_BOT_WEIGHT : 1,
    );
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    let idx = 0;
    for (; idx < remaining.length - 1; idx++) {
      roll -= weights[idx];
      if (roll < 0) break;
    }
    picked.push(remaining.splice(idx, 1)[0]);
  }
  return picked;
}

// every batch is guaranteed at least one custom bot (if any is eligible).
// priority bots (mentioned / post author / parent reply author) go first,
// but one slot is held back for a custom bot if none of the priority bots
// is custom. remaining slots are filled by weighted random.
function pickReplyBots(
  eligibleBots: BotProfile[],
  priorityIds: string[],
  count: number,
  customIds: Set<string>,
): BotProfile[] {
  const priorityEligible = shuffle(
    eligibleBots.filter((b) => priorityIds.includes(b.id)),
  );
  const rest = eligibleBots.filter((b) => !priorityIds.includes(b.id));
  const restCustom = rest.filter((b) => customIds.has(b.id));

  const needsCustomSlot =
    restCustom.length > 0 &&
    !priorityEligible.some((b) => customIds.has(b.id));

  // trim priority bots, leaving room for the guaranteed custom bot if needed
  const priorityPool = priorityEligible.slice(
    0,
    needsCustomSlot ? Math.max(count - 1, 0) : count,
  );

  const picked = [...priorityPool];
  let remainingPool = rest;

  if (needsCustomSlot && picked.length < count) {
    const guaranteed =
      restCustom[Math.floor(Math.random() * restCustom.length)];
    picked.push(guaranteed);
    remainingPool = rest.filter((b) => b.id !== guaranteed.id);
  }

  picked.push(
    ...weightedSample(remainingPool, count - picked.length, customIds),
  );
  return picked;
}

// primary path: calls Gemini's own native API directly (not OpenRouter).
// key goes in the ?key= query param, request/response shape is Gemini's
// native format (contents/parts in, candidates[0].content.parts[0].text out).
async function callGeminiNative(
  apiKey: string,
  userMessage: string,
  maxOutputTokens: number,
): Promise<ReplyDraft[]> {
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
          maxOutputTokens,
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
  maxTokens: number,
): Promise<ReplyDraft[]> {
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
        max_tokens: maxTokens,
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
async function callGemini(
  userMessage: string,
  maxOutputTokens = BATCH_MAX_OUTPUT_TOKENS,
): Promise<ReplyDraft[]> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  try {
    return await callGeminiNative(GEMINI_API_KEY, userMessage, maxOutputTokens);
  } catch (primaryError) {
    console.error("Primary Gemini call failed:", primaryError);
    if (!GEMINI_API_KEY_FALLBACK) throw primaryError;
    console.log("Retrying with OpenRouter fallback...");
    return await callOpenRouter(GEMINI_API_KEY_FALLBACK, userMessage, maxOutputTokens);
  }
}

// one batch of replies = a list of groups. each group is "these bots all reply
// to this one parent" (parent null = they reply to the post itself).
type ReplyGroup = {
  parent: ParentInfo | null;
  bots: BotProfile[];
};

// builds ONE prompt that covers a whole batch of replies from several bots at
// once. this tells the model:
// (a) who actually wrote the original post (and which bot, if any, is that author)
// (b) each bot's personality, so every reply stays in its own voice
// (c) exactly which reply each bot is answering, and to @ that author
function buildBatchPrompt(
  postContent: string,
  postAuthorName: string | null,
  postAuthorBotId: string | null,
  threadReplies: { content: string; author: string }[],
  groups: ReplyGroup[],
): string {
  const lines: string[] = [];
  lines.push("You are writing replies on Spotlight for several different users at once.");
  // the real user is the original poster only on posts they wrote themselves.
  // on AI-generated posts the poster is a bot and the real user is just a
  // commenter, and the model has to be told which one it is.
  const posterIsRealUser = !postAuthorBotId;
  lines.push(
    `Original post (by ${postAuthorName ?? (posterIsRealUser ? "the real user" : "another user")}): "${postContent}"`,
  );
  lines.push(
    posterIsRealUser
      ? 'The real user (labeled "the real user" in the thread) wrote the original post. They are a real person, not one of the users you are writing as.'
      : 'The real user (labeled "the real user" in the thread) did NOT write the original post. They are just another commenter, so never treat them as the original poster.',
  );

  if (threadReplies.length) {
    lines.push("Thread so far:");
    threadReplies.forEach((r) => lines.push(`- ${r.author}: ${r.content}`));
  }

  lines.push(
    "Every user listed below has their own personality. Write each reply in THAT user's " +
      "voice and stay in character. The users must sound clearly different from each other " +
      "and must not repeat or echo each other's wording.",
  );
  lines.push(
    "Each reply is written BY the user it is assigned to, TO the person it is answering. " +
      "Nobody speaks as the original poster unless they are marked (original poster): no " +
      '"my post", "thanks for the replies", "glad you liked it" or "i posted this" from ' +
      "anyone else. Talk to the person you are answering in second person, as a separate " +
      "person from them.",
  );

  const authorIsInBatch =
    !!postAuthorBotId &&
    groups.some((g) => g.bots.some((b) => b.id === postAuthorBotId));
  if (authorIsInBatch) {
    lines.push(
      "The user marked (original poster) wrote the post and has firsthand knowledge of it. " +
        "Everyone else did NOT write it and knows nothing beyond what's written above: they " +
        "must not invent specific details (colors, exact events, feelings the poster didn't " +
        "mention) as if they experienced them. They react like bystanders: agree, joke, ask " +
        "their own question, or add a general reaction.",
    );
  } else {
    lines.push(
      "None of these users wrote the original post and they know nothing about it beyond " +
        "what's written above. They must not invent specific details (colors, exact events, " +
        "feelings the poster didn't mention) as if they experienced them. They react like " +
        "bystanders: agree, joke, ask their own question, or add a general reaction.",
    );
  }

  let total = 0;
  groups.forEach((group, i) => {
    lines.push("");
    if (group.parent) {
      lines.push(
        `GROUP ${i + 1} - replies to ${group.parent.authorName} (@${group.parent.handle}), ` +
          `who wrote: "${group.parent.content}". Every reply in this group must start with ` +
          `@${group.parent.handle} followed by the message.`,
      );
    } else {
      lines.push(
        `GROUP ${i + 1} - replies directly to the original post itself (not to another reply).`,
      );
    }
    group.bots.forEach((bot) => {
      total++;
      const op = bot.id === postAuthorBotId ? " (original poster)" : "";
      const persona = bot.personality
        ? formatPersonalityLine(bot.personality)
        : "No set personality, write like a normal casual user.";
      lines.push(
        `- ${bot.display_name} (@${cleanHandle(bot.handle)})${op}: ${persona}`,
      );
    });
  });

  lines.push("");
  lines.push(
    `Write exactly one reply for every user listed in every group (${total} replies total). ` +
      `Return {"replies": [{"parent": <group number>, "handle": "<that user's handle without @>", "content": "<the reply>"}]}`,
  );
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
      const selectedWorldIds = extractWorldIds(ownerProfile?.selected_worlds);
      console.log("custom bot lookup:", {
        threadOwnerId,
        worldEntryKeys: Array.isArray(ownerProfile?.selected_worlds)
          ? Object.keys(ownerProfile.selected_worlds[0] ?? {}).filter((k) => k !== "image")
          : typeof ownerProfile?.selected_worlds,
        selectedWorldIds,
      });

      if (selectedWorldIds.length) {
        const { data: customBotRows, error: customBotsError } = await supabase
          .from("bot_profiles")
          .select("id, display_name, handle, personality")
          .in("world_id", selectedWorldIds);
        if (customBotsError) {
          console.error("Could not load custom bots:", customBotsError);
        } else {
          customBots = (customBotRows || []) as BotProfile[];
          console.log(
            `bot_profiles rows for worlds [${selectedWorldIds.join(", ")}]:`,
            customBots.length,
          );
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

    // hard limit on the thread: bots answer the user's first MAX_REPLIES
    // replies and then go silent. the user's new reply is already saved
    // before this function runs, so it's included in this count.
    if (body.reason === "user_replied") {
      const userReplyCount = (existingReplies || []).filter(
        (r) => !r.bot_user_id,
      ).length;
      if (userReplyCount > MAX_REPLIES) {
        return jsonResponse({
          inserted: [],
          note: `Thread hit the ${MAX_REPLIES} reply limit, bots stopped replying`,
        });
      }
    }

    // reply_opened only seeds an empty thread. this stops two tabs (or a
    // retry) from each generating a full batch, which is a lot of calls now.
    if (body.reason === "reply_opened" && existingReplies?.length) {
      return jsonResponse({
        inserted: [],
        note: "Thread already has replies",
      });
    }

    // @mentioned bots get priority for a slot
    let mentionedBotIds: string[] = [];
    if (body.reason === "user_replied" && existingReplies?.length) {
      const lastReply = existingReplies[existingReplies.length - 1];
      if (!lastReply.bot_user_id) {
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
      botById.has(post.bot_user_id)
    ) {
      priorityBotIds.add(post.bot_user_id);
    }

    // the custom-bot guarantee lives inside pickReplyBots so it applies
    // to every batch, not just the first custom reply in a thread.
    const customBotIds = new Set(customBots.map((b) => b.id));
    if (!customBots.length) {
      console.warn(
        "No custom bots loaded for this thread",
        { threadOwnerId, loadedCustomBots: customBots.length },
      );
    }

    // picks `count` different bots for one batch of replies. excludeBotId
    // keeps a bot from replying to (and @ing) itself.
    const takeBots = (
      count: number,
      priorityIds: string[],
      excludeBotId: string | null,
    ): BotProfile[] => {
      const pool = botsList.filter((b) => b.id !== excludeBotId);
      return pickReplyBots(
        pool,
        priorityIds,
        Math.min(count, pool.length),
        customBotIds,
      );
    };

    // labels with handles so the model can tell exactly who said what, and
    // "the real user" instead of a bare "user" (that one got confused with
    // the poster)
    const threadForPrompt = (existingReplies || []).map((r) => {
      const bot = r.bot_user_id ? botById.get(r.bot_user_id) : undefined;
      return {
        content: r.content,
        author: r.bot_user_id
          ? bot
            ? `${bot.display_name} (@${cleanHandle(bot.handle)})`
            : "bot"
          : "the real user",
      };
    });

    // ONE model call for a whole batch. each group is "these bots reply to
    // this parent" -- returns, per group, the bots that actually produced a
    // usable reply (in the same order as group.bots). anything the model
    // returns that wasn't asked for (unknown group / handle, duplicate, empty)
    // is dropped, and a missing reply just means that bot is skipped.
    const generateBatch = async (
      groups: ReplyGroup[],
      thread: { content: string; author: string }[],
      callLabel: string,
    ): Promise<{ bot: BotProfile; content: string }[][]> => {
      const results: { bot: BotProfile; content: string }[][] = groups.map(
        () => [],
      );
      if (!groups.some((g) => g.bots.length)) return results;

      const prompt = buildBatchPrompt(
        post.content,
        postAuthorName,
        post.bot_user_id ?? null,
        thread,
        groups,
      );

      // logs the exact prompt the model receives (system prompt + user message)
      // to the function logs, before the call so it shows up even if it fails.
      console.log(
        `[${callLabel}] prompt sent to model (post ${postId}):\n` +
          `--- SYSTEM ---\n${BASE_SYSTEM_PROMPT}\n` +
          `--- USER ---\n${prompt}`,
      );

      let drafts: ReplyDraft[];
      try {
        drafts = await callGemini(prompt);
      } catch (err) {
        console.error("Batch reply generation failed:", err);
        return results;
      }

      const seen = new Set<string>();
      for (const draft of drafts) {
        const groupIdx = Number(draft.parent) - 1;
        const group = groups[groupIdx];
        const handle = cleanHandle(String(draft.handle ?? "")).toLowerCase();
        const content = String(draft.content ?? "").trim();
        if (!group || !handle || !content) continue;
        const bot = group.bots.find(
          (b) => cleanHandle(b.handle).toLowerCase() === handle,
        );
        const key = `${groupIdx}:${bot?.id}`;
        if (!bot || seen.has(key)) continue;
        seen.add(key);
        results[groupIdx].push({
          bot,
          content: group.parent
            ? withLeadingMention(content, group.parent.handle)
            : content,
        });
      }

      const asked = groups.reduce((n, g) => n + g.bots.length, 0);
      const got = results.reduce((n, g) => n + g.length, 0);
      if (got < asked) {
        console.warn(`Batch returned ${got} usable replies out of ${asked} asked for`);
      }
      return results;
    };

    const insertReplies = async (rows: Record<string, unknown>[]) => {
      if (!rows.length) return [];
      const { data, error } = await supabase
        .from("post_replies")
        .insert(rows)
        .select();
      if (error) throw error;
      return data ?? [];
    };

    // call 3 on reply_opened / call 2 on user_replied: replies to the replies
    // the bots just wrote. each source reply rolls REPLY_TO_REPLY_MIN..MAX
    // (0-1) bots, so it either gets no answer or exactly one. a reply that
    // rolls 0 is left out of the prompt (an empty group would just confuse the
    // model, and if every one rolls 0 there's no model call at all), the bot
    // can't be that reply's own author, and the reply @s that author. this uses
    // a plain weighted roll instead of takeBots: takeBots guarantees a custom
    // bot per group, and with one bot per group that would make EVERY
    // reply-to-reply a custom bot.
    const replyToReplies = async (
      sourceRows: any[],
      thread: { content: string; author: string }[],
    ) => {
      const replyGroups: ReplyGroup[] = [];
      const replyGroupParentIds: string[] = [];
      for (const row of sourceRows) {
        const sourceBot = botById.get(row.bot_user_id);
        if (!sourceBot) continue;
        const pool = botsList.filter((b) => b.id !== sourceBot.id);
        const replyBots = weightedSample(
          pool,
          Math.min(
            randInt(REPLY_TO_REPLY_MIN, REPLY_TO_REPLY_MAX),
            pool.length,
          ),
          customBotIds,
        );
        if (!replyBots.length) continue;
        replyGroups.push({
          parent: {
            content: row.content,
            authorName: sourceBot.display_name,
            handle: cleanHandle(sourceBot.handle),
          },
          bots: replyBots,
        });
        replyGroupParentIds.push(row.id);
      }
      const replyResults = await generateBatch(
        replyGroups,
        thread,
        "reply_to_reply",
      );
      return insertReplies(
        replyResults.flatMap((group, i) =>
          group.map(({ bot, content }) => ({
            post_id: postId,
            parent_reply_id: replyGroupParentIds[i],
            bot_user_id: bot.id,
            content,
            is_ai_generated: true,
          })),
        ),
      );
    };

    const inserted: any[] = [];

    if (body.reason === "reply_opened") {
      // CALL 1: 5-7 parent replies straight under the post, all in one
      // prompt. nothing to @ since the post itself is what they're answering.
      const topBots = takeBots(
        randInt(TOP_LEVEL_REPLIES_MIN, TOP_LEVEL_REPLIES_MAX),
        [...priorityBotIds],
        null,
      );
      const [topResults] = await generateBatch(
        [{ parent: null, bots: topBots }],
        [],
        "top_level",
      );
      // inserted first so the parent replies have ids for call 2
      const topInserted = await insertReplies(
        topResults.map(({ bot, content }) => ({
          post_id: postId,
          parent_reply_id: null,
          bot_user_id: bot.id,
          content,
          is_ai_generated: true,
        })),
      );
      inserted.push(...topInserted);

      // CALL 2: the parent replies that actually got saved go back into ONE
      // prompt together with the 0-4 bots assigned under each one (a bot
      // never replies under its own reply), and every nested reply comes back
      // at once, each starting with an @ of its parent reply's author.
      // CHILD_REPLIES_MIN is 0, so a parent reply can roll zero bots -- those
      // are left out of the prompt entirely (an empty group would just
      // confuse the model).
      const groups: ReplyGroup[] = [];
      const groupParentIds: string[] = [];
      for (const row of topInserted) {
        const parentBot = botById.get(row.bot_user_id);
        if (!parentBot) continue;
        const childBots = takeBots(
          randInt(CHILD_REPLIES_MIN, CHILD_REPLIES_MAX),
          [],
          parentBot.id,
        );
        if (!childBots.length) continue;
        groups.push({
          parent: {
            content: row.content,
            authorName: parentBot.display_name,
            handle: cleanHandle(parentBot.handle),
          },
          bots: childBots,
        });
        groupParentIds.push(row.id);
      }
      const childResults = await generateBatch(groups, [], "nested");
      const childRows = childResults.flatMap((group, i) =>
        group.map(({ bot, content }) => ({
          post_id: postId,
          parent_reply_id: groupParentIds[i],
          bot_user_id: bot.id,
          content,
          is_ai_generated: true,
        })),
      );
      const childInserted = await insertReplies(childRows);
      inserted.push(...childInserted);

      // CALL 3: replies to the nested replies from call 2 (see replyToReplies)
      inserted.push(...(await replyToReplies(childInserted, [])));
    } else {
      // user_replied: CALL 1 is 1-4 bots replying underneath the user's reply
      // (USER_REPLIES_MIN, not CHILD_REPLIES_MIN), each starting with an @ of
      // the user's handle
      const parentBot = parentReplyBotId
        ? botById.get(parentReplyBotId)
        : undefined;
      let parent: ParentInfo | null = null;
      if (parentReply) {
        if (parentBot) {
          parent = {
            content: parentReply.content,
            authorName: parentBot.display_name,
            handle: cleanHandle(parentBot.handle),
          };
        } else if (parentReply.user_id) {
          const { data: parentUser, error: parentUserError } = await supabase
            .from("profiles")
            .select("display_name, handle")
            .eq("id", parentReply.user_id)
            .single();
          if (parentUserError) {
            console.error(
              "Could not load the parent reply author's handle:",
              parentUserError,
            );
          }
          if (parentUser?.handle) {
            parent = {
              content: parentReply.content,
              authorName: parentUser.display_name || parentUser.handle,
              handle: cleanHandle(parentUser.handle),
            };
          }
        }
      }

      const bots = takeBots(
        randInt(USER_REPLIES_MIN, CHILD_REPLIES_MAX),
        [...priorityBotIds],
        parentReplyBotId,
      );
      const [results] = await generateBatch(
        [{ parent, bots }],
        threadForPrompt,
        "user_reply",
      );
      const userInserted = await insertReplies(
        results.map(({ bot, content }) => ({
          post_id: postId,
          parent_reply_id: parentReplyId,
          bot_user_id: bot.id,
          content,
          is_ai_generated: true,
        })),
      );
      inserted.push(...userInserted);

      // CALL 2: each of those bot replies can get one reply back (see
      // replyToReplies). the thread so far goes along so the bots can see what
      // the user actually said.
      inserted.push(...(await replyToReplies(userInserted, threadForPrompt)));
    }

    if (!inserted.length) {
      return jsonResponse({ inserted: [] });
    }

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

      // notify for every top-level reply to the post, plus any nested reply
      // that @ mentions the owner. nested replies that don't tag them stay
      // quiet, otherwise a first open would bury the page in ~40 rows.
      const mentionsOwner = (content: string) =>
        !!mentionRegex && mentionRegex.test(content);
      const notificationRows = (inserted ?? [])
        .filter(
          (reply) => !reply.parent_reply_id || mentionsOwner(reply.content),
        )
        .map((reply) => ({
          user_id: recipientId,
          type: mentionsOwner(reply.content) ? "mention_reply" : "bot_reply",
          post_id: reply.post_id,
          reply_id: reply.id,
          actor_bot_id: reply.bot_user_id,
          preview: reply.content,
        }));

      if (notificationRows.length) {
        const { error: notifError } = await supabase
          .from("notifications")
          .insert(notificationRows);
        if (notifError) {
          console.error("Could not insert reply notifications:", notifError);
        }
      }
    }

    return jsonResponse({ inserted });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: String(err) }, 500);
  }
});