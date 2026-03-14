-- Hapus constraint unik lama jika ada
ALTER TABLE public.data_karyawan_pabrik DROP CONSTRAINT IF EXISTS data_karyawan_pabrik_kode_key;

-- Tambahkan constraint unik kombinasi kode dan bulan
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_kode_bulan') THEN
        ALTER TABLE public.data_karyawan_pabrik ADD CONSTRAINT unique_kode_bulan UNIQUE (kode, bulan);
    END IF;
END $$;

NOTIFY pgrst, 'reload config';
