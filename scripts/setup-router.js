const SETUP_STEPS = [
  { page: 'tutorial.html',       field: 'tutorial_complete', type: 'boolean' },
  { page: 'identity.html',       field: 'identity' },
  { page: 'fame-path.html',      field: 'fame_path' },
  { page: 'origin.html',         field: 'origin' },
  { page: 'profile.html',        field: 'display_name' },
  { page: 'world-selection.html', field: 'selected_worlds' }
];

window.getPostLoginDestination = async function () {
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

  if (userError || !user) {
    return 'login.html';
  }

  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('tutorial_complete, identity, fame_path, origin, display_name, selected_worlds')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    console.error('Error fetching profile for setup check:', error);
    return SETUP_STEPS[0].page;
  }

  for (const step of SETUP_STEPS) {
    const value = profile[step.field];

    if (step.type === 'boolean') {
      if (!value) return step.page;
      continue;
    }

    const isEmpty =
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (isEmpty) return step.page;
  }

  return 'Feed.html';
};