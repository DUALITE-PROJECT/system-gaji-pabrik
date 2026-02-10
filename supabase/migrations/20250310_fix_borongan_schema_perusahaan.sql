-- Fix missing 'perusahaan' column in data_gaji_borongan_pabrik_garut
ALTER TABLE public.data_gaji_borongan_pabrik_garut ADD COLUMN IF NOT EXISTS perusahaan TEXT;

-- Refresh schema cache
NOTIFY pgrst, 'reload config';
