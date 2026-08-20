import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const missingConfigurationError = new Error(
  "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the local environment."
);

function createUnavailableSupabaseClient() {
  return {
    auth: {
      async getSession() {
        return { data: { session: null }, error: missingConfigurationError };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signInWithPassword() {
        return { data: { user: null }, error: missingConfigurationError };
      },
      async signUp() {
        return { data: { user: null, session: null }, error: missingConfigurationError };
      },
      async signOut() {
        return { error: missingConfigurationError };
      },
    },
  };
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createUnavailableSupabaseClient();