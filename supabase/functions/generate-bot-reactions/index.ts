// Edge function that rolls a random number of bots to react (like or
// retweet) to a user's own post. Pure randomness right now, no
// relationship logic -- that's intentional for this version. Once
// relationships exist, the spot to plug in weighted odds is called out
// below.
//
// HOW THE ROLL WORKS (deliberately dumb/random, per spec):
//   1. Roll how many bots react this time: a random number from 1 to
//      however many ids are currently in BOT_PROFILE_IDS (read
//      dynamically off the array's length, so adding more bots later
//      does not require touching this logic).
//   2. For that many rounds, roll a random bot from BOT_PROFILE_IDS.
//   3. Roll what that bot does: like or retweet.
//      - If this bot has never reacted yet this run: 50/50 like/retweet.
//      - If this bot already reacted once this run: it is FORCED into
//        the other reaction (a bot can never like twice or retweet
//        twice on the same post).
//      - If this bot has already reacted twice this run, it's excluded
//        from the pool entirely for the rest of the rounds (max 2
//        reactions per bot per post).
//   4. Insert one post_reactions row + one notifications row per roll.
//
// Expects a `post_reactions` table with a `bot_user_id` column (see
// notifications_migration.sql) and a `notifications` table (same file).
//
// This function does NOT decide *when* to run -- it expects to be
// invoked by the client right after a user's own post insert succeeds,
// the same way generate-ai-posts is invoked on "new_post". See the
// bottom of this file for the expected request body.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// keep this list in sync with the other two edge functions -- edge
// functions don't share code by default, so there are three copies of
// this array across the project right now. worth moving to a
// `_shared/bot-profile-ids.ts` import if you want a single source of
// truth later, but that's a refactor, not required for this to work.
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
];

const MAX_REACTIONS_PER_BOT = 2;

type ReactionType = "like" | "repost"; // "repost" matches the DB value used
// elsewhere (post_reactions.reaction_type, posts.repost_count) even though
// the user-facing word is "retweet" -- see REACTION_TYPE_BY_CLASS in
// Feed.html, which maps the same way.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Roll = { botId: string; reaction: ReactionType };

// the actual randomizer. no relationship weighting, no logic beyond the
// caps described above -- this is intentionally "dumb" per spec.
//
// FUTURE HOOK: once relationships exist, this is the function to change --
// e.g. instead of `pickRandomBot` drawing uniformly from `pool`, weight the
// draw by relationship closeness, and instead of a flat 1..N roll for
// reactionCount, bias it upward for bots with a close-friend/lover
// relationship to this user. Everything downstream (insert shape,
// notification shape) stays the same.
function rollBotReactions(botIds: string[]): Roll[] {
  const reactionCount = 1 + Math.floor(Math.random() * botIds.length);
  const reactionsByBot = new Map<string, Set<ReactionType>>();
  const rolls: Roll[] = [];

  for (let i = 0; i < reactionCount; i++) {
    const pool = botIds.filter(
      (id) => (reactionsByBot.get(id)?.size ?? 0) < MAX_REACTIONS_PER_BOT,
    );
    if (!pool.length) break; // every bot has hit its cap, stop early

    const botId = pool[Math.floor(Math.random() * pool.length)];
    const usedTypes = reactionsByBot.get(botId) ?? new Set<ReactionType>();

    let reaction: ReactionType;
    if (usedTypes.size === 0) {
      reaction = Math.random() < 0.5 ? "like" : "repost";
    } else {
      // already reacted once -- forced into whichever type it hasn't used
      reaction = usedTypes.has("like") ? "repost" : "like";
    }

    usedTypes.add(reaction);
    reactionsByBot.set(botId, usedTypes);
    rolls.push({ botId, reaction });
  }

  return rolls;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return jsonResponse({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { error: "Missing required environment variables/secrets" },
      500,
    );
  }

  // expected body: { post_id, user_id } -- post_id is the post to react
  // to, user_id is that post's owner (who gets notified). the client
  // already has both right after its own insert succeeds.
  let body: { post_id?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const postId = body.post_id;
  const userId = body.user_id;
  if (!postId || !userId) {
    return jsonResponse({ error: "post_id and user_id are required" }, 400);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, content, like_count, repost_count")
      .eq("id", postId)
      .single();
    if (postError) throw postError;
    if (!post) return jsonResponse({ error: "Post not found" }, 404);

    const rolls = rollBotReactions(BOT_PROFILE_IDS);
    if (!rolls.length) {
      return jsonResponse({ reactions: [] });
    }

    const { data: bots, error: botsError } = await supabase
      .from("bot_profiles")
      .select("id, display_name, handle")
      .in(
        "id",
        [...new Set(rolls.map((r) => r.botId))],
      );
    if (botsError) throw botsError;
    const botById = new Map((bots || []).map((b) => [b.id, b]));

    const reactionRows = rolls.map((roll) => ({
      post_id: postId,
      user_id: userId, // whose feed this reflects on, per the existing schema
      bot_user_id: roll.botId,
      reaction_type: roll.reaction,
    }));

    const { error: reactionError } = await supabase
      .from("post_reactions")
      .insert(reactionRows);
    if (reactionError) throw reactionError;

    // bump the denormalized counters on the post. read-then-write, same
    // as the rest of this codebase does for reaction counts -- fine at
    // this scale, but note it's not safe against a concurrent update
    // landing between the read above and this write.
    const likeIncrement = rolls.filter((r) => r.reaction === "like").length;
    const repostIncrement = rolls.filter((r) => r.reaction === "repost").length;
    if (likeIncrement || repostIncrement) {
      const { error: updateError } = await supabase
        .from("posts")
        .update({
          like_count: (post.like_count || 0) + likeIncrement,
          repost_count: (post.repost_count || 0) + repostIncrement,
        })
        .eq("id", postId);
      if (updateError) throw updateError;
    }

    const notificationRows = rolls.map((roll) => ({
      user_id: userId,
      type: roll.reaction === "like" ? "bot_like" : "bot_repost",
      post_id: postId,
      actor_bot_id: roll.botId,
      preview: post.content,
    }));
    const { error: notifError } = await supabase
      .from("notifications")
      .insert(notificationRows);
    if (notifError) {
      console.error("Could not insert reaction notifications:", notifError);
    }

    // handy for the client to show an immediate toast without waiting on
    // the notifications page, e.g. "AriaMonroe liked your tweet!"
    const reactions = rolls.map((roll) => ({
      bot_id: roll.botId,
      bot_display_name: botById.get(roll.botId)?.display_name ?? "A bot",
      reaction: roll.reaction,
    }));

    return jsonResponse({ reactions });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: String(err) }, 500);
  }
});