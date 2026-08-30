const REACTION_TYPE_BY_CLASS = {
  likes: "like",
  dislikes: "dislike",
  retweets: "repost",
};

// replies flatten into sibling rows after 2 indent levels
const MAX_INDENT_DEPTH = 2;

function formatCount(value) {
  return value >= 1000
    ? `${(value / 1000).toFixed(1).replace(".0", "")}k`
    : value;
}

function parseCount(text) {
  if (text.endsWith("k")) return Math.round(parseFloat(text) * 1000);
  return parseInt(text, 10) || 0;
}

function timeSince(dateString) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(dateString)) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function createReaction(type, icon, count) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `reaction ${type}`;
  const label = { likes: "Like", retweets: "Retweet", dislikes: "Dislike", reply: "Reply" }[type];
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

function getPostIdFromUrl() {
  return new URLSearchParams(window.location.search).get("id");
}

async function toggleReaction(postId, type, button, currentUser, container) {
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

      const opposite = type === "like" ? "dislike" : type === "dislike" ? "like" : null;
      if (opposite) {
        const oppositeClass = opposite === "like" ? "likes" : "dislikes";
        const oppositeBtn = container.querySelector(`.reaction.${oppositeClass}`);
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
          oppositeCountSpan.textContent = formatCount(Math.max(0, oppositeCount - 1));
        }
      }
    }
  } catch (error) {
    console.error("Could not update reaction:", error);
  } finally {
    button.disabled = false;
  }
}

function buildReplyTree(flatReplies) {
  const byId = new Map(flatReplies.map((r) => [r.id, { ...r, children: [] }]));
  const roots = [];
  byId.forEach((reply) => {
    if (reply.parent_reply_id && byId.has(reply.parent_reply_id)) {
      byId.get(reply.parent_reply_id).children.push(reply);
    } else {
      roots.push(reply);
    }
  });
  return roots;
}

function authorFor(row, profileById, botProfileById) {
  return row.bot_user_id ? botProfileById.get(row.bot_user_id) : profileById.get(row.user_id);
}

// re-check for new activity at most this often. if the cache is younger
// than this, we skip even the cheap query below and just trust it.
const POST_STALE_CHECK_TTL_MS = 10 * 1000;

// cheap check: has anything actually changed since we cached this post?
// "changed" means a new reply landed, or the post's own reaction counts
// moved. this is two small single-row queries, not the full
// post + replies + reactions + profiles + bot-profiles fetch.
async function postHasNewActivity(postId, cachedPost, cachedReplies) {
  const [{ data: freshCounts, error: countsError }, { data: latestReply, error: replyError }] =
    await Promise.all([
      supabaseClient
        .from("posts")
        .select("like_count, dislike_count, repost_count")
        .eq("id", postId)
        .maybeSingle(),
      supabaseClient
        .from("post_replies")
        .select("id, created_at")
        .eq("post_id", postId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (countsError || replyError) {
    console.error(
      "Could not check post for new activity, falling back to full fetch:",
      countsError || replyError,
    );
    return true; // don't know, so err on the side of refetching
  }

  const countsMatch =
    !!freshCounts &&
    freshCounts.like_count === (cachedPost.like_count || 0) &&
    freshCounts.dislike_count === (cachedPost.dislike_count || 0) &&
    freshCounts.repost_count === (cachedPost.repost_count || 0);

  // post_replies is fetched ascending by created_at, so the newest cached
  // reply is the last one in the array
  const newestCachedReply = cachedReplies[cachedReplies.length - 1];
  const repliesMatch = !latestReply
    ? !newestCachedReply
    : !!newestCachedReply &&
      latestReply.id === newestCachedReply.id &&
      latestReply.created_at === newestCachedReply.created_at;

  return !(countsMatch && repliesMatch);
}

async function main() {
  const postId = getPostIdFromUrl();
  const wrap = document.getElementById("wrap");
  document.getElementById("backBtn").addEventListener("click", () => history.back());

  if (!postId) {
    wrap.innerHTML = '<div class="postNotFound">No post specified.</div>';
    return;
  }

  const pageLoader = document.getElementById("pageLoader");
  const currentUserProfile = window.__cachedProfile || window.SpotlightProfileCache?.read();

  let post, replyRows, myReactions, profileById, botProfileById, replyTree, currentUser;

  // best-effort guess before real auth resolves below, so reply boxes
  // rendered from cache aren't permanently broken while we wait on the network
  currentUser = window.__cachedProfile?.id ? { id: window.__cachedProfile.id } : null;

  // if we've viewed this post before this session, render it
  // immediately from cache instead of showing the loader/blank page.
  // if nothing's changed since, we stop right there instead of always
  // following up with the full network fetch.
  const cached = window.SpotlightPostCache?.readPost(postId);
  console.log(
    "[post] postId:",
    postId,
    "found cache:",
    !!cached?.post,
  );
  let skipNetworkFetch = false;
  if (cached?.post) {
    post = cached.post;
    replyRows = cached.replies || [];
    myReactions = new Set(cached.myReactions || []);
    profileById = new Map((cached.profiles || []).map((p) => [p.id, p]));
    botProfileById = new Map((cached.botProfiles || []).map((p) => [p.id, p]));
    replyTree = buildReplyTree(replyRows);
    renderMainPost(
      post,
      authorFor(post, profileById, botProfileById),
      currentUser,
    );
    renderThreadsSection(replyTree, profileById, botProfileById);
    pageLoader?.classList.add("hidden");

    const cacheAgeMs = Date.now() - (cached.cachedAt || 0);
    console.log(
      "[post] cache age ms:",
      cacheAgeMs,
      "cachedAt:",
      cached.cachedAt,
    );
    const isRecent = cacheAgeMs < POST_STALE_CHECK_TTL_MS;
    if (isRecent) {
      console.log("[post] trust-cache path: 0 network calls");
      skipNetworkFetch = true;
    } else {
      skipNetworkFetch = !(await postHasNewActivity(postId, post, replyRows));
      console.log(
        "[post] freshness check ran, nothing new:",
        skipNetworkFetch,
      );
    }

    if (skipNetworkFetch) {
      console.log("[post] skipped full fetch");
      // still seed bot replies for a thread that's empty, same
      // as the full-fetch path does below
      if (replyRows.length === 0) triggerBotReplies(postId, "reply_opened");
      return;
    }
  }

  try {
    console.log("[post] doing full fetch");
    console.log("[post] if cache is newer than 10s & new content wasnt added, this is a bug!");
    const [profileResult, postResult, repliesResult] = await Promise.all([
      window.SpotlightProfileCache.load(supabaseClient).catch(async (error) => {
        console.error("Could not preload profile:", error);
        const { data: { user } } = await supabaseClient.auth.getUser();
        return { user };
      }),
      supabaseClient
        .from("posts")
        .select(
          "id, user_id, bot_user_id, content, image_urls, like_count, dislike_count, repost_count, created_at, is_ai_generated",
        )
        .eq("id", postId)
        .single(),
      supabaseClient
        .from("post_replies")
        .select("id, post_id, parent_reply_id, user_id, bot_user_id, content, is_ai_generated, created_at")
        .eq("post_id", postId)
        .order("created_at", { ascending: true }),
    ]);

    currentUser = profileResult.user;
    const { data: freshPost, error: postError } = postResult;
    const { data: replies, error: repliesError } = repliesResult;

    if (postError || !freshPost) {
      console.error("Could not load post:", postError);
      if (!cached) {
        wrap.innerHTML = '<div class="postNotFound">This post couldn\'t be found.</div>';
      }
      return;
    }
    post = freshPost;
    if (repliesError) console.error("Could not load replies:", repliesError);
    replyRows = replies || [];

    // reactions, profiles, and bot profiles only depend on what we already
    // have (post, replyRows, currentUser) - not on each other, so these
    // also run together instead of sequentially.
    const userIds = [
      ...new Set(
        [post.user_id, currentUser?.id, ...replyRows.map((r) => r.user_id)].filter(Boolean),
      ),
    ];
    const botUserIds = [
      ...new Set([post.bot_user_id, ...replyRows.map((r) => r.bot_user_id)].filter(Boolean)),
    ];

    const [reactionsResult, profilesResult, botProfilesResult] = await Promise.all([
      currentUser
        ? supabaseClient
            .from("post_reactions")
            .select("reaction_type")
            .eq("user_id", currentUser.id)
            .eq("post_id", postId)
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

    const { data: myReactionRows, error: reactionsError } = reactionsResult;
    if (reactionsError) console.error("Could not load reactions:", reactionsError);
    myReactions = new Set((myReactionRows || []).map((r) => r.reaction_type));

    const { data: profiles, error: profileError } = profilesResult;
    if (profileError) console.error("Could not load profiles:", profileError);
    profileById = new Map((profiles || []).map((p) => [p.id, p]));

    const { data: botProfiles, error: botProfileError } = botProfilesResult;
    if (botProfileError) console.error("Could not load bot profiles:", botProfileError);
    botProfileById = new Map((botProfiles || []).map((p) => [p.id, p]));

    const postAuthor = authorFor(post, profileById, botProfileById);

    renderMainPost(post, postAuthor, currentUser);

    replyTree = buildReplyTree(replyRows);
    renderThreadsSection(replyTree, profileById, botProfileById);
    persistCache();

    if (replyRows.length === 0) {
      triggerBotReplies(postId, "reply_opened");
    }
  } catch (error) {
    // if anything above throws (bad connection, Supabase error, etc.)
    // don't leave the loading screen stuck forever with no explanation -
    // surface it and let whatever's already on screen (cache or empty
    // post) stand.
    console.error("Could not finish loading the post:", error);
  } finally {
    pageLoader?.classList.add("hidden");
  }

  // saves the current post/replies/profiles snapshot
  // revisiting this post later renders instantly from cache
  function persistCache() {
    window.SpotlightPostCache?.writePost(postId, {
      post,
      replies: replyRows,
      myReactions: [...myReactions],
      profiles: [...profileById.values()],
      botProfiles: [...botProfileById.values()],
    });
    console.log("[post] wrote cache at", Date.now(), "for post", postId);
  }

  // parentReplyId tells the edge function which reply the bots should
  // respond to. without it, bots always landed as top-level replies on
  // the post itself instead of continuing the thread the user replied in.
  async function triggerBotReplies(pid, reason, parentReplyId = null) {
    try {
      const { data: result, error } = await supabaseClient.functions.invoke("generate-bot-replies", {
        body: { post_id: pid, reason, parent_reply_id: parentReplyId },
      });
      if (error) {
        console.error("Could not generate bot replies:", error);
        return;
      }
      const inserted = result?.inserted || [];
      if (!inserted.length) return;
      const botIds = [...new Set(inserted.map((r) => r.bot_user_id).filter(Boolean))].filter(
        (id) => !botProfileById.has(id),
      );
      if (botIds.length) {
        const { data: newBots } = await supabaseClient
          .from("bot_profiles")
          .select("id, display_name, handle, avatar_url")
          .in("id", botIds);
        (newBots || []).forEach((p) => botProfileById.set(p.id, p));
      }
      replyRows.push(...inserted);
      replyTree = buildReplyTree(replyRows);
      renderThreadsSection(replyTree, profileById, botProfileById);
      persistCache();
    } catch (error) {
      console.error("Could not generate bot replies:", error);
    }
  }

  function replyFooterHtml(reply, idPrefix) {
    return `
      <div class="threadMeta">
        <span class="displayName"></span>
        <span class="username"></span>
        <span class="postTime"></span>
      </div>
      <div class="threadText"></div>
      <div class="threadFooter" data-reaction-row="${idPrefix}"></div>
      <div class="inlineReplyBox" data-box-for="${idPrefix}">
        <img class="avatar" src="${currentUserProfile?.avatar_url || "https://placehold.co/56x56/1a1a1a/888?text=you"}" alt="" />
        <textarea placeholder="Write a reply" rows="1"></textarea>
        <button type="button" class="inlineReplySubmit" disabled>Reply</button>
      </div>
    `;
  }

  function fillReplyMeta(body, reply, author) {
    body.querySelector(".displayName").textContent = author?.display_name || "Spotlight user";
    body.querySelector(".username").textContent = `@${author?.handle?.replace(/^@/, "") || "spotlightuser"}`;
    body.querySelector(".postTime").textContent = `· ${timeSince(reply.created_at)}`;
    body.querySelector(".threadText").textContent = reply.content;
  }

  function buildReactionRow(reply, container) {
    const row = document.createElement("div");
    row.style.display = "contents";
    const replyBtn = createReaction("reply", "icon-reply", "Reply");
    replyBtn.addEventListener("click", () => {
      const box = container.querySelector(`.inlineReplyBox[data-box-for="${reply.id}"]`);
      if (!box) return;
      box.classList.toggle("open");
      if (box.classList.contains("open")) box.querySelector("textarea").focus();
    });
    row.appendChild(replyBtn);
    return row;
  }

  function wireInlineReply(container, reply) {
    const box = container.querySelector(`.inlineReplyBox[data-box-for="${reply.id}"]`);
    if (!box) return;
    const textarea = box.querySelector("textarea");
    const submit = box.querySelector(".inlineReplySubmit");
    textarea.disabled = !currentUser;
    submit.disabled = true;
    if (!currentUser) textarea.placeholder = "Log in to reply";
    textarea.addEventListener("input", () => {
      submit.disabled = textarea.value.trim().length === 0;
    });
    submit.addEventListener("click", async () => {
      const value = textarea.value.trim();
      if (!value || !currentUser) return;
      submit.disabled = true;
      submit.textContent = "Posting...";
      const { data, error } = await supabaseClient
        .from("post_replies")
        .insert({
          post_id: postId,
          parent_reply_id: reply.id,
          user_id: currentUser.id,
          content: value,
        })
        .select()
        .single();
      submit.disabled = false;
      submit.textContent = "Reply";
      if (error) {
        console.error("Could not post reply:", error);
        return;
      }
      replyRows.push(data);
      replyTree = buildReplyTree(replyRows);
      textarea.value = "";
      box.classList.remove("open");
      renderThreadsSection(replyTree, profileById, botProfileById);
      persistCache();
      triggerBotReplies(postId, "user_replied", data.id);
    });
  }

  function flattenDescendants(reply) {
    const result = [];
    (function walk(list) {
      for (const r of list) {
        result.push(r);
        if (r.children && r.children.length) walk(r.children);
      }
    })(reply.children || []);
    return result;
  }

  function buildThreadNode(reply, depth) {
    const isFlush = depth >= MAX_INDENT_DEPTH;

    const el = document.createElement("div");
    el.className = "thread";
    el.dataset.replyId = reply.id;

    const node = document.createElement("div");
    node.className = isFlush ? "threadNode flush" : "threadNode";

    const rail = document.createElement("div");
    rail.className = "threadRail";
    const avatarEl = document.createElement("img");
    avatarEl.className = "avatar";
    const author = authorFor(reply, profileById, botProfileById);
    avatarEl.src = author?.avatar_url || "https://placehold.co/34x34/png";
    rail.appendChild(avatarEl);
    const hasChildren = !isFlush && reply.children && reply.children.length > 0;
    if (hasChildren) {
      const line = document.createElement("div");
      line.className = "threadLine";
      rail.appendChild(line);
    }

    const body = document.createElement("div");
    body.className = "threadBody";
    body.innerHTML = replyFooterHtml(reply, reply.id);
    fillReplyMeta(body, reply, author);

    const footerRow = body.querySelector(`[data-reaction-row="${reply.id}"]`);
    footerRow.appendChild(buildReactionRow(reply, el));

    if (!isFlush) {
      const childrenWrap = document.createElement("div");
      childrenWrap.className = "threadChildren";
      if (reply.children && reply.children.length) {
        reply.children.forEach((child) => {
          childrenWrap.appendChild(buildThreadNode(child, depth + 1));
          if (depth + 1 >= MAX_INDENT_DEPTH) {
            flattenDescendants(child).forEach((desc) => {
              childrenWrap.appendChild(buildThreadNode(desc, MAX_INDENT_DEPTH));
            });
          }
        });
      }
      body.appendChild(childrenWrap);
    }

    node.append(rail, body);
    el.appendChild(node);

    wireInlineReply(el, reply);
    return el;
  }

  function renderThreadsSection(tree, profileById, botProfileById) {
    let section = document.getElementById("threadsSection");
    section.innerHTML = "";
    const heading = document.createElement("div");
    heading.className = "threadsHeading";
    heading.textContent = "Replies";
    section.appendChild(heading);

    if (!tree.length) {
      const empty = document.createElement("div");
      empty.className = "threadsEmpty";
      empty.textContent = "No replies yet.";
      section.appendChild(empty);
      return;
    }

    tree.forEach((reply) => {
      section.appendChild(buildThreadNode(reply, 0));
    });
  }

  function renderMainPost(post, author, currentUser) {
    const el = document.getElementById("mainPost");
    el.innerHTML = "";

    const meta = document.createElement("div");
    meta.className = "userMeta";
    const avatar = document.createElement("img");
    avatar.className = "avatar";
    avatar.src = author?.avatar_url || "https://placehold.co/44x44/png";
    const names = document.createElement("div");
    names.className = "userNames";
    const nameSpan = document.createElement("span");
    nameSpan.className = "displayName";
    nameSpan.textContent = author?.display_name || "Spotlight user";
    const handleSpan = document.createElement("span");
    handleSpan.className = "username";
    handleSpan.textContent = `@${author?.handle?.replace(/^@/, "") || "spotlightuser"}`;
    names.append(nameSpan, handleSpan);
    meta.append(avatar, names);

    const body = document.createElement("div");
    body.className = "mainPostBody";
    body.textContent = post.content || "";

    el.append(meta, body);

    if (Array.isArray(post.image_urls) && post.image_urls.length) {
      const media = document.createElement("div");
      media.className = "postMedia";
      post.image_urls.forEach((url) => {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "Post image";
        media.appendChild(img);
      });
      el.appendChild(media);
    }

    const time = document.createElement("div");
    time.className = "mainPostTime";
    time.textContent = `${timeSince(post.created_at)} ago`;
    el.appendChild(time);

    const footer = document.createElement("div");
    footer.className = "footerSpan";
    const likeBtn = createReaction("likes", "icon-like", formatCount(post.like_count || 0));
    const retweetBtn = createReaction("retweets", "icon-retweet", formatCount(post.repost_count || 0));
    const dislikeBtn = createReaction("dislikes", "icon-dislike", formatCount(post.dislike_count || 0));
    const replyBtn = createReaction("reply", "icon-reply", "Reply");

    [likeBtn, dislikeBtn, retweetBtn].forEach((button) => {
      const type = REACTION_TYPE_BY_CLASS[[...button.classList].find((c) => c in REACTION_TYPE_BY_CLASS)];
      if (myReactions.has(type)) button.classList.add("active");
      button.addEventListener("click", () => toggleReaction(post.id, type, button, currentUser, el));
    });

    replyBtn.addEventListener("click", () => {
      document.getElementById("mainReplyInput")?.focus();
    });

    footer.append(likeBtn, retweetBtn, dislikeBtn, replyBtn);
    el.appendChild(footer);

    const composer = document.createElement("div");
    composer.className = "replyComposer";
    const composerAvatar = document.createElement("img");
    composerAvatar.className = "avatar";
    composerAvatar.src =
      currentUserProfile?.avatar_url || "https://placehold.co/60x60/1a1a1a/888?text=you";
    const textarea = document.createElement("textarea");
    textarea.id = "mainReplyInput";
    textarea.rows = 1;
    textarea.placeholder = currentUser ? "Post your reply" : "Log in to reply";
    textarea.disabled = !currentUser;
    textarea.maxLength = 250;
    const submitBtn = document.createElement("button");
    submitBtn.type = "button";
    submitBtn.className = "replySubmit";
    submitBtn.textContent = "Reply";
    submitBtn.disabled = true;
    textarea.addEventListener("input", () => {
      submitBtn.disabled = textarea.value.trim().length === 0;
    });
    submitBtn.addEventListener("click", async () => {
      const value = textarea.value.trim();
      if (!value || !currentUser) return;
      submitBtn.disabled = true;
      submitBtn.textContent = "Posting...";
      const { data, error } = await supabaseClient
        .from("post_replies")
        .insert({
          post_id: post.id,
          parent_reply_id: null,
          user_id: currentUser.id,
          content: value,
        })
        .select()
        .single();
      submitBtn.disabled = false;
      submitBtn.textContent = "Reply";
      if (error) {
        console.error("Could not post reply:", error);
        return;
      }
      replyRows.push(data);
      replyTree = buildReplyTree(replyRows);
      textarea.value = "";
      renderThreadsSection(replyTree, profileById, botProfileById);
      persistCache();
      triggerBotReplies(post.id, "user_replied", data.id);
    });
    composer.append(composerAvatar, textarea, submitBtn);
    el.appendChild(composer);
  }
}

// only fires when tweet-tab.html redirected here right after a post.
// visiting/revisiting a post afterward doesn't keep re-showing the toast.
function ShowAnalyticsToast() {
  if (!localStorage.getItem("analytics-toast")) return;
  localStorage.removeItem("analytics-toast");

  const toast = document.getElementById("analyticsToast");
  const overlay = document.getElementById("analyticsOverlay");
  const viewBtn = document.getElementById("analyticsViewBtn");
  const skipBtn = document.getElementById("analyticsSkipBtn");
  if (!toast || !overlay || !viewBtn || !skipBtn) return;

  toast.classList.add("show");

  skipBtn.addEventListener("click", () => {
    toast.classList.remove("show");
  });

  viewBtn.addEventListener("click", () => {
    toast.classList.remove("show");
    overlay.classList.add("show");
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("show");
  });
}

main().then(ShowAnalyticsToast);