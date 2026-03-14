-- 1. Hapus constraint unik lama pada kolom 'kode'
ALTER TABLE public.data_karyawan_pabrik DROP CONSTRAINT IF EXISTS data_karyawan_pabrik_kode_key;

-- 2. Tambahkan constraint unik baru kombinasi (kode, bulan)
-- Ini memungkinkan kode yang sama diinput lagi di bulan yang berbeda
ALTER TABLE public.data_karyawan_pabrik ADD CONSTRAINT unique_kode_bulan UNIQUE (kode, bulan);

NOTIFY pgrst, 'reload config';
