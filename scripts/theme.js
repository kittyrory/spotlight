// shared light/dark theme handler.

(function () {
  const STORAGE_KEY = 'spotlight-theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  const localTheme = localStorage.getItem(STORAGE_KEY) || 'dark';
  applyTheme(localTheme);

  // inherit theme
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      applyTheme(event.newValue);
    }
  });

  // if logged in via Supabase, fetch the saved theme and reconcile
  async function syncFromSupabase() {
    const client = window.supabaseClient;
    if (!client) return;

    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    const { data, error } = await client
      .from('user_settings')
      .select('theme')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!error && data && data.theme) {
      localStorage.setItem(STORAGE_KEY, data.theme);
      applyTheme(data.theme);
    } else if (!error && !data) {
      await client.from('user_settings').upsert({ user_id: user.id, theme: localTheme });
    }
  }

  // toggle handler
  async function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);

    const client = window.supabaseClient;
    if (client) {
      const { data: { user } } = await client.auth.getUser();
      if (user) {
        await client.from('user_settings').upsert({ user_id: user.id, theme: next });
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    syncFromSupabase();
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', toggleTheme);
  });
})();