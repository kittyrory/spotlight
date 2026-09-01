// maps a footer button's class to the reaction_type value stored in post_reactions
const REACTION_TYPE_BY_CLASS = {
  likes: "like",
  dislikes: "dislike",
  retweets: "repost",
};

function createReaction(type, icon, count) {
  const button = document.createElement("button");
  button.className = `reaction ${type}`;
  const label = {
    likes: "Like",
    retweets: "Retweet",
    dislikes: "Dislike",
    reply: "Reply",
  }[type];
  button.setAttribute("aria-label", `${label} this post`);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${icon}`);
  svg.appendChild(use);
  const countSpan = document.createElement("span");
  countSpan.className = "reactionCount";
  countSpan.textContent = count;
  button.append(svg, countSpan);
  return button;
}

function formatCount(value) {
  return value >= 1000
    ? `${(value / 1000).toFixed(1).replace(".0", "")}k`
    : value;
}

function timeSince(dateString) {
  const minutes = Math.max(
    1,
    Math.floor((Date.now() - new Date(dateString)) / 60000),
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function renderUserPost(
  post,
  profile,
  currentUser,
  myReactions,
) {
  const card = document.createElement("article");
  card.className = post.is_ai_generated ? "postCard aiPost" : "postCard";
  card.dataset.postId = post.id;

  const meta = document.createElement("div");
  meta.className = "userMeta";
  const avatar = document.createElement("img");
  avatar.className = "avatar";
  avatar.src = profile?.avatar_url || "https://placehold.co/36x36/png";
  avatar.alt = `${profile?.display_name || "User"} avatar`;
  const displayName = document.createElement("span");
  displayName.className = "displayName";
  displayName.textContent = profile?.display_name || "Spotlight user";
  const handle = document.createElement("span");
  handle.className = "username";
  handle.textContent = profile?.handle
    ? `@${profile.handle.replace(/^@/, "")}`
    : "@spotlightuser";
  const time = document.createElement("span");
  time.className = "postTime";
  time.textContent = timeSince(post.created_at);
  meta.append(avatar, displayName, handle, time);

  const content = document.createElement("div");
  content.className = "postContent";
  if (post.content) {
    const text = document.createElement("p");
    text.textContent = post.content;
    content.appendChild(text);
  }
  if (Array.isArray(post.image_urls) && post.image_urls.length) {
    const media = document.createElement("div");
    media.className = "postMedia";
    post.image_urls.forEach((url) => {
      const image = document.createElement("img");
      image.src = url;
      image.alt = "Post image";
      media.appendChild(image);
    });
    content.appendChild(media);
  }

  const footer = document.createElement("div");
  footer.className = "footerSpan";
  const likeBtn = createReaction(
    "likes",
    "icon-like",
    formatCount(post.like_count || 0),
  );
  const retweetBtn = createReaction(
    "retweets",
    "icon-retweet",
    formatCount(post.repost_count || 0),
  );
  const dislikeBtn = createReaction(
    "dislikes",
    "icon-dislike",
    formatCount(post.dislike_count || 0),
  );
  const replyBtn = createReaction("reply", "icon-reply", "Reply");

  [likeBtn, dislikeBtn, retweetBtn].forEach((button) => {
    const type =
      REACTION_TYPE_BY_CLASS[
        [...button.classList].find((c) => c in REACTION_TYPE_BY_CLASS)
      ];
    if (myReactions.has(type)) button.classList.add("active");
    button.addEventListener("click", () =>
      toggleReaction(post.id, type, button, currentUser),
    );
  });

  footer.append(likeBtn, retweetBtn, dislikeBtn, replyBtn);
  content.appendChild(footer);

  card.style.cursor = "pointer";
  card.addEventListener("click", (event) => {
    if (event.target.closest(".reaction.likes, .reaction.retweets, .reaction.dislikes")) {
      return;
    }
    window.location.href = `post.html?id=${post.id}`;
  });

  card.append(meta, content);
  return card;
}

async function toggleReaction(postId, type, button, currentUser) {
  if (!currentUser) return;
  const countSpan = button.querySelector(".reactionCount");
  const wasActive = button.classList.contains("active");
  const rawCount = parseCount(countSpan.textContent);
  button.disabled = true;
  try {
    if (wasActive) {
      const { error } = await supabaseClient
        .from("post_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", currentUser.id)
        .eq("reaction_type", type);
      if (error) throw error;
      button.classList.remove("active");
      countSpan.textContent = formatCount(Math.max(0, rawCount - 1));
    } else {
      const { error } = await supabaseClient.from("post_reactions").insert({
        post_id: postId,
        user_id: currentUser.id,
        reaction_type: type,
      });
      if (error) throw error;
      button.classList.add("active");
      countSpan.textContent = formatCount(rawCount + 1);

      // likes and dislikes are mutually exclusive: dropping one clears the other
      const opposite =
        type === "like" ? "dislike" : type === "dislike" ? "like" : null;
      if (opposite) {
        const card = button.closest(".postCard");
        const oppositeClass = opposite === "like" ? "likes" : "dislikes";
        const oppositeBtn = card.querySelector(`.reaction.${oppositeClass}`);
        if (oppositeBtn?.classList.contains("active")) {
          const oppositeCountSpan = oppositeBtn.querySelector(".reactionCount");
          const oppositeCount = parseCount(oppositeCountSpan.textContent);
          await supabaseClient
            .from("post_reactions")
            .delete()
            .eq("post_id", postId)
            .eq("user_id", currentUser.id)
            .eq("reaction_type", opposite);
          oppositeBtn.classList.remove("active");
          oppositeCountSpan.textContent = formatCount(
            Math.max(0, oppositeCount - 1),
          );
        }
      }
    }
  } catch (error) {
    console.error("Could not update reaction:", error);
  } finally {
    button.disabled = false;
  }
}

function parseCount(text) {
  if (text.endsWith("k")) return Math.round(parseFloat(text) * 1000);
  return parseInt(text, 10) || 0;
}

// renders a flat list of { post, author, reactions } render-ready
// entries into .posts. shared by the cache-hit fast path and the
// real network load
function renderPostsList(renderReady, currentUser) {
  const feedEl = document.querySelector(".posts");
  feedEl.innerHTML = "";
  renderReady
    .slice()
    .reverse()
    .forEach(({ post, author, reactions }) =>
      feedEl.prepend(
        renderUserPost(post, author, currentUser, new Set(reactions || [])),
      ),
    );
}

// does the real supabase round trip and writes the result to the cache.
// deliberately has no DOM dependency (no ".posts" lookup, no rendering)
// so it can be called from pages that don't render a feed at all, like
// loadingpage.html, which just wants the cache warmed before Feed.html loads.
//
// returns the render-ready array (possibly empty), or null on error.
async function fetchAndCacheUserPosts(currentUser) {
  if (!currentUser) return null;

  console.log("[feed] doing full fetch");
  console.log("[feed] if cache is newer than 10s & new content wasnt added, this is a bug!");
  const { data: posts, error } = await supabaseClient
    .from("posts")
    .select(
      "id, user_id, bot_user_id, content, image_urls, like_count, dislike_count, repost_count, created_at, is_ai_generated, ai_owner_id",
    )
    .or(`user_id.eq.${currentUser.id},ai_owner_id.eq.${currentUser.id}`)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) {
    console.error("Could not load posts:", error);
    return null;
  }

  if (!posts?.length) {
    window.SpotlightPostCache?.writeFeed(currentUser.id, []);
    return [];
  }

  const postIds = posts.map((post) => post.id);
  const userIds = [
    ...new Set(posts.map((post) => post.user_id).filter(Boolean)),
  ];
  const botUserIds = [
    ...new Set(posts.map((post) => post.bot_user_id).filter(Boolean)),
  ];

  // reactions, profiles, and bot profiles all depend on `posts` (just
  // fetched above) but not on each other, so run them together instead
  // of one after another.
  const [reactionsResult, profilesResult, botProfilesResult] = await Promise.all([
    currentUser
      ? supabaseClient
          .from("post_reactions")
          .select("post_id, reaction_type")
          .eq("user_id", currentUser.id)
          .in("post_id", postIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseClient
      .from("profiles")
      .select("id, display_name, handle, avatar_url")
      .in("id", userIds),
    botUserIds.length
      ? supabaseClient
          .from("bot_profiles")
          .select("id, display_name, handle, avatar_url")
          .in("id", botUserIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const { data: myReactionRows, error: reactionError } = reactionsResult;
  if (reactionError)
    console.error("Could not load reactions:", reactionError);

  const { data: profiles, error: profileError } = profilesResult;
  if (profileError)
    console.error("Could not load post profiles:", profileError);
  const profileById = new Map(
    (profiles || []).map((profile) => [profile.id, profile]),
  );

  // bot authors live in a separate table since they aren't real
  // auth users. fold their profiles into the same lookup keyed by post id
  const { data: botProfiles, error: botProfileError } = botProfilesResult;
  if (botProfileError)
    console.error("Could not load bot profiles:", botProfileError);
  const botProfileById = new Map(
    (botProfiles || []).map((profile) => [profile.id, profile]),
  );
  const authorByPostId = new Map(
    posts.map((post) => [
      post.id,
      post.bot_user_id
        ? botProfileById.get(post.bot_user_id)
        : profileById.get(post.user_id),
    ]),
  );

  const reactionsByPost = new Map();
  (myReactionRows || []).forEach((row) => {
    if (!reactionsByPost.has(row.post_id))
      reactionsByPost.set(row.post_id, new Set());
    reactionsByPost.get(row.post_id).add(row.reaction_type);
  });

  const renderReady = posts.map((post) => ({
    post,
    author: authorByPostId.get(post.id) || null,
    reactions: [...(reactionsByPost.get(post.id) || [])],
  }));

  window.SpotlightPostCache?.writeFeed(currentUser.id, renderReady);
  console.log(
    "[feed] wrote cache at",
    Date.now(),
    "for user",
    currentUser.id,
  );

  return renderReady;
}

// thin wrapper used by Feed.html: renders the cache immediately (if asked),
// then does the real fetch/cache via fetchAndCacheUserPosts and renders
// the fresh result over top.
async function loadUserPosts(currentUser, { useCache = false } = {}) {
  if (!currentUser) return;

  // render whatever we last cached for this user immediately,
  // so the feed isn't blank while the network call below is in flight.
  // this always gets replaced by the fresh network result further down.
  if (useCache) {
    const cached = window.SpotlightPostCache?.readFeed(currentUser.id);
    if (cached?.length) renderPostsList(cached, currentUser);
  }

  const renderReady = await fetchAndCacheUserPosts(currentUser);
  if (renderReady === null) return; // error already logged, keep whatever was rendered

  const feedEl = document.querySelector(".posts");
  if (!feedEl) return; // e.g. called from a page with no feed to render into

  if (!renderReady.length) {
    feedEl.innerHTML = "";
    return;
  }

  renderPostsList(renderReady, currentUser);
}

const AI_POST_COOLDOWN_MS = 60 * 1000;
let lastAiPostGenerationAt = 0;

// pregen world ids are plain array indices (small numbers), custom
// world ids are Date.now() timestamps (always > 1,000,000) -- see
// world-scripts.js where each is assigned. use that to know which
// source to resolve each selected world against.
async function resolveSelectedWorlds(selectedWorlds) {
  if (!Array.isArray(selectedWorlds) || !selectedWorlds.length) return [];

  const pregenIds = selectedWorlds
    .filter((w) => w.id < 1000000)
    .map((w) => w.id);
  const customIds = selectedWorlds
    .filter((w) => w.id >= 1000000)
    .map((w) => w.id);

  const pregenResolved = (window.WORLDS || [])
    .filter((w) => pregenIds.includes(w.id))
    .map((w) => ({
      title: w.title,
      description: w.description || w.descripton || "",
      tags: w.tags || [],
      category: w.category,
    }));

  let customResolved = [];
  if (customIds.length) {
    const { data: customWorlds, error } = await supabaseClient
      .from("custom_worlds")
      .select(
        "title, description, category, tags, characters, drama, cross_universe",
      )
      .in("id", customIds);
    if (error) {
      console.error("Could not load custom worlds:", error);
    } else {
      customResolved = customWorlds || [];
    }
  }

  return [...pregenResolved, ...customResolved];
}

// calls the supabase edge function that generates AI posts via gemini
// and inserts them into the posts table.

// the function itself decides how many posts to make (3) and does the
// actual gemini call server-side so the api key never touches the client

// also enforced server-side
async function generateAiPosts(reason, currentUser) {
  if (!currentUser) return;
  console.log("generateAiPosts called, reason=" + reason);

  const now = Date.now();
  if (now - lastAiPostGenerationAt < AI_POST_COOLDOWN_MS) {
    console.log("AI post generation skipped: cooldown active");
    alert("Slow down, you're on cooldown!");
    return;
  }
  lastAiPostGenerationAt = now;

  try {
    // pull the profile fields that give the model context about this
    // specific user
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select(
        "origin, fame_path, identity, display_name, handle, bio, selected_worlds",
      )
      .eq("id", currentUser.id)
      .single();
    if (profileError) {
      console.error("Could not load profile context:", profileError);
    }

    const worlds = await resolveSelectedWorlds(profile?.selected_worlds);

    const { error } = await supabaseClient.functions.invoke(
      "generate-ai-posts",
      {
        body: {
          reason,
          user_id: currentUser.id,
          profile: profile
            ? {
                origin: profile.origin,
                fame_path: profile.fame_path,
                identity: profile.identity,
                display_name: profile.display_name,
                handle: profile.handle,
                bio: profile.bio,
              }
            : null,
          worlds,
        },
      },
    );
    console.log(
      "generate-ai-posts invoke returned, error=" + JSON.stringify(error),
    );
    if (error) {
      console.error("Could not generate AI posts:", error);
      return;
    }
    // pull in whatever got inserted so the feed reflects it without a full reload
    await loadUserPosts(currentUser);
  } catch (error) {
    console.error("Could not generate AI posts:", error);
  }
}

// "has this ever run for THIS user" check,
// backed by a column on profiles. so logging in
//  on a new device never re-triggers it
async function FirstLoadAiPosts(currentUser) {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("ai_posts_seeded")
    .eq("id", currentUser.id)
    .single();
  if (error) {
    console.error("Could not check profile ai_posts_seeded:", error);
    return;
  }
  if (data?.ai_posts_seeded) return;

  // flip the flag first so two tabs loading at the same moment
  // can't both pass this check before the update lands
  const { error: updateError } = await supabaseClient
    .from("profiles")
    .update({ ai_posts_seeded: true })
    .eq("id", currentUser.id)
    .eq("ai_posts_seeded", false);
  if (updateError) {
    console.error("Could not set ai_posts_seeded flag:", updateError);
    return;
  }
  await generateAiPosts("first_load", currentUser);
}

function hidePageLoader() {
  const loader = document.getElementById("pageLoader");
  if (loader) loader.classList.add("hidden");
}

async function initFeed() {
  const cachedProfileId = window.__cachedProfile?.id;
  const cachedFeed = cachedProfileId
    ? window.SpotlightPostCache?.readFeed(cachedProfileId)
    : null;
  console.log(
    "[feed] cachedProfileId:",
    cachedProfileId,
    "found cache:",
    !!cachedFeed?.length,
  );

  if (cachedFeed?.length) {
    renderPostsList(cachedFeed, { id: cachedProfileId });
    hidePageLoader();
  }

  // if loadingpage.html ran (and cached the profile + feed) moments ago,
  // don't immediately throw that away and refetch everything over the
  // network again -- just render what it already fetched.
  const FRESH_FROM_LOADER_MS = 15000;

  try {
    let currentUser = null;
    try {
      ({ user: currentUser } =
        await window.SpotlightProfileCache.load(supabaseClient));
    } catch (error) {
      console.error("Could not preload Feed profile:", error);
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();
      currentUser = user;
    }

    const feedMeta = currentUser
      ? window.SpotlightPostCache?.readFeedMeta(currentUser.id)
      : null;
    const cameFromWarmLoader =
      feedMeta && Date.now() - feedMeta.cachedAt < FRESH_FROM_LOADER_MS;

    if (cameFromWarmLoader) {
      console.log(
        "[feed] cache was warmed by loadingpage.html",
        Date.now() - feedMeta.cachedAt,
        "ms ago, skipping refetch",
      );
      renderPostsList(feedMeta.posts, currentUser);
    } else {
      await loadUserPosts(currentUser, { useCache: !cachedFeed?.length });
    }

    // cheap no-op if loadingpage.html already ran this (it's guarded by
    // the ai_posts_seeded db flag), so always safe to call again here.
    await FirstLoadAiPosts(currentUser);
  } catch (error) {
    console.error("Could not finish loading the feed:", error);
  } finally {
    hidePageLoader();
  }
}

// exposed so loadingpage.html can warm the cache (feed + ai posts) before
// the user ever lands on Feed.html, without needing a ".posts" element
// or running the feed-page-only initFeed() flow.
window.SpotlightFeed = { fetchAndCacheUserPosts, FirstLoadAiPosts };

// feed.js is shared with loadingpage.html now (so it can reuse the fetch
// logic above), but initFeed() is Feed.html-only -- only auto-run it when
// there's actually a feed to render into.
if (document.querySelector(".posts")) {
  initFeed();
}