-- Add 'lembur_tm' column to presensi_harian_admin_pabrik table
ALTER TABLE public.presensi_harian_admin_pabrik 
ADD COLUMN IF NOT EXISTS lembur_tm NUMERIC DEFAULT 0;

-- Refresh schema cache
NOTIFY pgrst, 'reload config';
