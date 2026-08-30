// profile preload/cache used to avoid repeating the first profile request on every page.

(function () {
  const STORAGE_KEY = "spotlight-profile";
  const PROFILE_FIELDS =
    "id, display_name, handle, bio, avatar_url, header_url, identity, origin, fame_path, selected_worlds";

  function read() {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error("Could not read cached Spotlight profile:", error);
      return null;
    }
  }

  function write(profile) {
    if (!profile) return null;

    const merged = { ...(read() || {}), ...profile };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch (error) {
      console.error("Could not cache Spotlight profile:", error);
    }
    return merged;
  }

  async function load(client) {
    if (!client) {
      throw new Error("Supabase client is required to load the profile.");
    }

    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser();

    if (userError) {
      if (
        userError.name === "AuthSessionMissingError" ||
        userError.message === "Auth session missing!"
      ) {
        return { user: null, profile: read() };
      }
      throw userError;
    }
    if (!user) return { user: null, profile: read() };

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select(PROFILE_FIELDS)
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    return {
      user,
      profile: write(profile ? { ...profile, id: user.id } : { id: user.id }),
    };
  }

  window.SpotlightProfileCache = { read, write, load };
})();