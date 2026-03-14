-- Hapus constraint lama jika ada
ALTER TABLE public.karyawan_pabrik DROP CONSTRAINT IF EXISTS unique_karyawan_kode_bulan;

-- Tambahkan constraint baru yang benar
ALTER TABLE public.karyawan_pabrik ADD CONSTRAINT unique_karyawan_kode_bulan UNIQUE (kode, bulan);

-- Refresh cache
NOTIFY pgrst, 'reload config';
