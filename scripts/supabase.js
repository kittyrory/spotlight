// connects supabase for auth and user data
// railway will also be used for separate purposes

const supabaseUrl = "https://qhcohcxmxndexkhexbst.supabase.co";
const supabaseAnonKey = "sb_publishable_mX0YOWlolguEx3j0uCjtmQ_VlMdEYhz";

const supabaseClient = window.supabase.createClient(
  supabaseUrl,
  supabaseAnonKey,
);
