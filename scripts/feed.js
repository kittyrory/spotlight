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
const svg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
);
const use = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "use",
);
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

function renderReplyItem(reply, profile) {
const item = document.createElement("div");
item.className = reply.is_ai_generated
    ? "replyItem aiReply"
    : "replyItem";
const avatar = document.createElement("img");
avatar.className = "avatar";
avatar.src = profile?.avatar_url || "https://placehold.co/26x26/png";
avatar.alt = `${profile?.display_name || "User"} avatar`;
const body = document.createElement("div");
const metaSpan = document.createElement("span");
metaSpan.className = "replyMeta";
const nameSpan = document.createElement("span");
nameSpan.className = "displayName";
nameSpan.textContent = profile?.display_name || "Spotlight user";
metaSpan.append(
    nameSpan,
    document.createTextNode(
    ` @${profile?.handle?.replace(/^@/, "") || "spotlightuser"} · ${timeSince(reply.created_at)}`,
    ),
);
const textDiv = document.createElement("div");
textDiv.textContent = reply.content;
body.append(metaSpan, textDiv);
item.append(avatar, body);
return item;
}

function renderUserPost(
post,
profile,
currentUser,
myReactions,
replies,
profileById,
botProfileById,
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

// reply section: hidden thread + composer, toggled by the Reply button
const replySection = document.createElement("div");
replySection.className = "replySection";

const replyList = document.createElement("div");
replyList.className = "replyList";
replies.forEach((reply) =>
    replyList.appendChild(
    renderReplyItem(
        reply,
        reply.bot_user_id
        ? botProfileById.get(reply.bot_user_id)
        : profileById.get(reply.user_id),
    ),
    ),
);

const replyForm = document.createElement("div");
replyForm.className = "replyForm";
const textarea = document.createElement("textarea");
textarea.placeholder = currentUser
    ? "Post your reply"
    : "Log in to reply";
textarea.disabled = !currentUser;
textarea.maxLength = 250;
const submitBtn = document.createElement("button");
submitBtn.className = "replySubmit";
submitBtn.textContent = "Reply";
submitBtn.disabled = !currentUser;
submitBtn.addEventListener("click", async () => {
    const value = textarea.value.trim();
    if (!value || !currentUser) return;
    submitBtn.disabled = true;
    submitBtn.textContent = "Posting...";
    const { data, error } = await supabaseClient
    .from("post_replies")
    .insert({
        post_id: post.id,
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
    replyList.appendChild(
    renderReplyItem(data, profileById.get(currentUser.id)),
    );
    textarea.value = "";
    triggerBotReplies("user_replied");
});
replyForm.append(textarea, submitBtn);
replySection.append(replyForm, replyList);

// bot replies: triggered two ways -- (1) first time this thread is
// opened with zero replies, 3 random bots reply to the post itself,
// (2) every time the user submits their own reply, bots (chosen by
// @ mention if present, else random, capped at 3 replies per bot
// per thread) reply again to the thread. both calls hit a separate
// edge function so the caps/mentions logic stays isolated from the
// ai-post generation logic.
let hasTriggeredInitialBotReplies = replies.length > 0;
async function triggerBotReplies(reason) {
    try {
    const { data: result, error } =
        await supabaseClient.functions.invoke("generate-bot-replies", {
        body: { post_id: post.id, reason },
        });
    if (error) {
        console.error("Could not generate bot replies:", error);
        return;
    }
    (result?.inserted || []).forEach((reply) => {
        const bot = botProfileById.get(reply.bot_user_id);
        replyList.appendChild(renderReplyItem(reply, bot));
    });
    } catch (error) {
    console.error("Could not generate bot replies:", error);
    }
}

replyBtn.addEventListener("click", () => {
    replySection.classList.toggle("open");
    if (
    replySection.classList.contains("open") &&
    !hasTriggeredInitialBotReplies
    ) {
    hasTriggeredInitialBotReplies = true;
    triggerBotReplies("reply_opened");
    }
});

card.append(meta, content, replySection);
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
    const { error } = await supabaseClient
        .from("post_reactions")
        .insert({
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
        const oppositeBtn = card.querySelector(
        `.reaction.${oppositeClass}`,
        );
        if (oppositeBtn?.classList.contains("active")) {
        const oppositeCountSpan =
            oppositeBtn.querySelector(".reactionCount");
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

async function loadUserPosts(currentUser) {
if (!currentUser) return;

// this feed is entirely private per user: only the logged-in user's
// own posts, plus the AI posts generated privately for them
// (ai_owner_id = them). nobody else's posts show up here at all.
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
    return;
}

// clear out whatever's currently rendered before re-rendering, since
// this can now be called again after generating new AI posts
const feedEl = document.querySelector(".posts");
feedEl.innerHTML = "";

if (!posts?.length) return;

const postIds = posts.map((post) => post.id);

const { data: replies, error: repliesError } = await supabaseClient
    .from("post_replies")
    .select(
    "id, post_id, user_id, bot_user_id, content, is_ai_generated, created_at",
    )
    .in("post_id", postIds)
    .order("created_at", { ascending: true });
if (repliesError)
    console.error("Could not load replies:", repliesError);

let myReactionRows = [];
if (currentUser) {
    const { data, error: reactionError } = await supabaseClient
    .from("post_reactions")
    .select("post_id, reaction_type")
    .eq("user_id", currentUser.id)
    .in("post_id", postIds);
    if (reactionError)
    console.error("Could not load reactions:", reactionError);
    myReactionRows = data || [];
}

const userIds = [
    ...new Set([
    ...posts.map((post) => post.user_id).filter(Boolean),
    ...(replies || []).map((reply) => reply.user_id).filter(Boolean),
    ]),
];
const { data: profiles, error: profileError } = await supabaseClient
    .from("profiles")
    .select("id, display_name, handle, avatar_url")
    .in("id", userIds);
if (profileError)
    console.error("Could not load post profiles:", profileError);
const profileById = new Map(
    (profiles || []).map((profile) => [profile.id, profile]),
);

// bot authors live in a separate table since they aren't real
// auth users. fetch those for any AI posts AND any AI replies
// and fold them into the same lookup keyed by post id
const botUserIds = [
    ...new Set([
    ...posts.map((post) => post.bot_user_id).filter(Boolean),
    ...(replies || [])
        .map((reply) => reply.bot_user_id)
        .filter(Boolean),
    ]),
];
let botProfileById = new Map();
if (botUserIds.length) {
    const { data: botProfiles, error: botProfileError } =
    await supabaseClient
        .from("bot_profiles")
        .select("id, display_name, handle, avatar_url")
        .in("id", botUserIds);
    if (botProfileError)
    console.error("Could not load bot profiles:", botProfileError);
    botProfileById = new Map(
    (botProfiles || []).map((profile) => [profile.id, profile]),
    );
}
const authorByPostId = new Map(
    posts.map((post) => [
    post.id,
    post.bot_user_id
        ? botProfileById.get(post.bot_user_id)
        : profileById.get(post.user_id),
    ]),
);

const repliesByPost = new Map();
(replies || []).forEach((reply) => {
    if (!repliesByPost.has(reply.post_id))
    repliesByPost.set(reply.post_id, []);
    repliesByPost.get(reply.post_id).push(reply);
});

const reactionsByPost = new Map();
myReactionRows.forEach((row) => {
    if (!reactionsByPost.has(row.post_id))
    reactionsByPost.set(row.post_id, new Set());
    reactionsByPost.get(row.post_id).add(row.reaction_type);
});

const feed = document.querySelector(".posts");
posts
    .reverse()
    .forEach((post) =>
    feed.prepend(
        renderUserPost(
        post,
        authorByPostId.get(post.id),
        currentUser,
        reactionsByPost.get(post.id) || new Set(),
        repliesByPost.get(post.id) || [],
        profileById,
        botProfileById,
        ),
    ),
    );
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

// also enforced server-side since a client-side check alone can be bypassed
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
    // specific user, so generated posts feel personal instead of generic
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

async function initFeed() {
const {
    data: { user: currentUser },
} = await supabaseClient.auth.getUser();
await loadUserPosts(currentUser);
await FirstLoadAiPosts(currentUser);
}

// only fires when tweet-tab.html redirected here after a post
// refreshing/revisiting the feed afterward doesn't keep re-showing the toast.
function ShowAnalyticsToast() {
if (!sessionStorage.getItem("analytics-toast")) return;
sessionStorage.removeItem("analytics-toast");

const toast = document.getElementById("analyticsToast");
const overlay = document.getElementById("analyticsOverlay");
const viewBtn = document.getElementById("analyticsViewBtn");
const skipBtn = document.getElementById("analyticsSkipBtn");

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

initFeed().then(ShowAnalyticsToast);