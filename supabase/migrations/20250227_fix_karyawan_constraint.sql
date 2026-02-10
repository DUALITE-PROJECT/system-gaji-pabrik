-- FIX: Mengubah constraint unik agar Kode Karyawan boleh sama ASALKAN Bulan berbeda
-- Ini memungkinkan import data karyawan yang sama untuk periode bulan yang berbeda

-- 1. Hapus constraint lama (jika ada) yang terlalu ketat
ALTER TABLE public.karyawan_pabrik DROP CONSTRAINT IF EXISTS karyawan_pabrik_kode_karyawan_key;
DROP INDEX IF EXISTS karyawan_pabrik_kode_karyawan_key;

-- 2. Buat index unik baru (Composite Key: Kode + Bulan)
-- Artinya: Kombinasi Kode 'K001' dan Bulan 'Januari' hanya boleh ada satu.
-- Tapi 'K001' di 'Februari' diperbolehkan.
CREATE UNIQUE INDEX IF NOT EXISTS idx_karyawan_kode_bulan ON public.karyawan_pabrik (kode, bulan);

-- 3. Pastikan kolom-kolom penting ada (Idempotent check)
ALTER TABLE public.karyawan_pabrik 
ADD COLUMN IF NOT EXISTS kode TEXT,
ADD COLUMN IF NOT EXISTS bulan TEXT;
