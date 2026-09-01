// caches the feed list and individual posts (with their replies/profiles)
// in localStorage so revisiting a page doesn't have to wait on supabase
// again.

(function () {
  const FEED_KEY = "spotlight-feed-cache";
  const POST_PREFIX = "spotlight-post-cache:";
  const RECENT_POSTS_KEY = "spotlight-recent-posts";
  const MAX_RECENT_POSTS = 15;
  const NOTIFICATIONS_KEY = "spotlight-notifications-cache";

  function safeGet(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error(`Could not read cache for ${key}:`, error);
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Could not write cache for ${key}:`, error);
    }
  }

  // feed list cache (keyed by user)

  function readFeed(userId) {
    const cached = safeGet(FEED_KEY);
    if (!cached || cached.userId !== userId) return null;
    return cached.posts || null;
  }

  // same as readFeed but also returns cachedAt, so callers can decide
  // whether the cache is fresh enough to skip a network round trip
  function readFeedMeta(userId) {
    const cached = safeGet(FEED_KEY);
    if (!cached || cached.userId !== userId) return null;
    if (!cached.posts) return null;
    return { posts: cached.posts, cachedAt: cached.cachedAt || 0 };
  }

  function writeFeed(userId, posts) {
    if (!userId) return;
    safeSet(FEED_KEY, { userId, posts, cachedAt: Date.now() });
  }

  // individual post cache (post + replies + resolved profiles)

  function readPost(postId) {
    return safeGet(POST_PREFIX + postId);
  }

  function writePost(postId, data) {
    safeSet(POST_PREFIX + postId, { ...data, cachedAt: Date.now() });

    try {
      const recent = safeGet(RECENT_POSTS_KEY) || [];
      const withoutThis = recent.filter((id) => id !== postId);
      withoutThis.unshift(postId);
      const trimmed = withoutThis.slice(0, MAX_RECENT_POSTS);
      // drop any cached posts that fell out of the recent list so the
      // cache doesn't grow without bound
      recent
        .filter((id) => !trimmed.includes(id))
        .forEach((id) => localStorage.removeItem(POST_PREFIX + id));
      safeSet(RECENT_POSTS_KEY, trimmed);
    } catch (error) {
      console.error("Could not update recent posts list:", error);
    }
  }

  // notifications list cache (keyed by user)

  function readNotifications(userId) {
    const cached = safeGet(NOTIFICATIONS_KEY);
    if (!cached || cached.userId !== userId) return null;
    if (!cached.notifications) return null;
    return {
      notifications: cached.notifications,
      botProfiles: cached.botProfiles || [],
      cachedAt: cached.cachedAt || 0,
    };
  }

  function writeNotifications(userId, notifications, botProfiles) {
    if (!userId) return;
    safeSet(NOTIFICATIONS_KEY, {
      userId,
      notifications,
      botProfiles,
      cachedAt: Date.now(),
    });
  }

  window.SpotlightPostCache = {
    readFeed,
    readFeedMeta,
    writeFeed,
    readPost,
    writePost,
    readNotifications,
    writeNotifications,
  };
})();