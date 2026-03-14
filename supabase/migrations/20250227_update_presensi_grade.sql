-- Tambahkan kolom grade_p1 dan grade_p2 jika belum ada
ALTER TABLE public.presensi_harian_pabrik ADD COLUMN IF NOT EXISTS grade_p1 TEXT;
ALTER TABLE public.presensi_harian_pabrik ADD COLUMN IF NOT EXISTS grade_p2 TEXT;

NOTIFY pgrst, 'reload config';
