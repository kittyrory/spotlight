// figures out how far a user has gotten through onboarding and returns
// the page they should be sent to next

const SETUP_STEPS = [
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
    .select('identity, fame_path, origin, display_name, selected_worlds')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    console.error('Error fetching profile for setup check:', error);
    return SETUP_STEPS[0].page;
  }

  for (const step of SETUP_STEPS) {
    const value = profile[step.field];
    const isEmpty =
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (isEmpty) return step.page;
  }

  return 'Feed.html';
};