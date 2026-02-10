-- Hapus kolom grade lama
ALTER TABLE public.presensi_harian_pabrik 
DROP COLUMN IF EXISTS grade;

-- Tambahkan kolom grade_p1 dan grade_p2
ALTER TABLE public.presensi_harian_pabrik 
ADD COLUMN IF NOT EXISTS grade_p1 TEXT,
ADD COLUMN IF NOT EXISTS grade_p2 TEXT;

-- Update view atau policy jika diperlukan (biasanya otomatis tercover jika select *)
