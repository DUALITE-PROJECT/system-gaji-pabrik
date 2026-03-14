-- Pastikan tabel karyawan_pabrik memiliki kolom yang benar
ALTER TABLE public.karyawan_pabrik ADD COLUMN IF NOT EXISTS jenis_kelamin TEXT DEFAULT 'L';
ALTER TABLE public.karyawan_pabrik ADD COLUMN IF NOT EXISTS grade_p1 TEXT;
ALTER TABLE public.karyawan_pabrik ADD COLUMN IF NOT EXISTS grade_p2 TEXT;
ALTER TABLE public.karyawan_pabrik ADD COLUMN IF NOT EXISTS divisi TEXT;
ALTER TABLE public.karyawan_pabrik ADD COLUMN IF NOT EXISTS bulan TEXT;
ALTER TABLE public.karyawan_pabrik ADD COLUMN IF NOT EXISTS keterangan TEXT;
ALTER TABLE public.karyawan_pabrik ADD COLUMN IF NOT EXISTS status_aktif BOOLEAN DEFAULT true;

-- Hapus constraint lama jika ada dan buat yang baru
ALTER TABLE public.karyawan_pabrik DROP CONSTRAINT IF EXISTS unique_karyawan_kode_bulan;
ALTER TABLE public.karyawan_pabrik ADD CONSTRAINT unique_karyawan_kode_bulan UNIQUE (kode, bulan);

NOTIFY pgrst, 'reload config';
