import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validasi URL Supabase
const isValidUrl = (url: string | undefined) => {
  if (!url) return false;
  // Cek apakah URL valid dan bukan placeholder default
  return url.startsWith('https://') && 
         !url.includes('://.') && 
         !url.includes('your-project');
};

export const isSupabaseConfigured = () => {
  return isValidUrl(supabaseUrl) && !!supabaseAnonKey;
};

// Membuat client Supabase
// Fallback ke string kosong jika undefined agar tidak crash saat init, 
// tapi isSupabaseConfigured akan mengembalikan false.
const clientUrl = isValidUrl(supabaseUrl) ? supabaseUrl : 'https://placeholder.supabase.co';
const clientKey = supabaseAnonKey || 'placeholder-key';

export const supabase = createClient(clientUrl, clientKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
