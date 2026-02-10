-- MIGRATION: Update Struktur Tabel Karyawan Pabrik
-- Menyesuaikan kolom sesuai permintaan: Kode, Nama, P/L, Grade P1, Grade P2, Divisi, Bulan, Keterangan

-- 1. Tambahkan kolom baru jika belum ada
ALTER TABLE public.karyawan_pabrik 
ADD COLUMN IF NOT EXISTS kode TEXT,
ADD COLUMN IF NOT EXISTS jenis_kelamin TEXT, -- 'L' atau 'P'
ADD COLUMN IF NOT EXISTS grade_p1 TEXT,
ADD COLUMN IF NOT EXISTS grade_p2 TEXT,
ADD COLUMN IF NOT EXISTS divisi TEXT,
ADD COLUMN IF NOT EXISTS bulan TEXT,
ADD COLUMN IF NOT EXISTS keterangan TEXT;

-- 2. Migrasi data lama (jika ada) agar tidak hilang
-- Pindahkan 'kode_karyawan' ke 'kode' jika 'kode' masih kosong
UPDATE public.karyawan_pabrik 
SET kode = kode_karyawan 
WHERE kode IS NULL AND kode_karyawan IS NOT NULL;

-- Pindahkan 'jabatan' ke 'divisi' jika 'divisi' masih kosong
UPDATE public.karyawan_pabrik 
SET divisi = jabatan 
WHERE divisi IS NULL AND jabatan IS NOT NULL;

-- 3. (Opsional) Anda bisa menghapus kolom lama jika sudah yakin tidak dipakai, 
-- tapi membiarkannya juga tidak masalah untuk keamanan data.
-- ALTER TABLE public.karyawan_pabrik DROP COLUMN kode_karyawan;
-- ALTER TABLE public.karyawan_pabrik DROP COLUMN jabatan;

-- 4. Pastikan Policy Keamanan tetap aktif
ALTER TABLE public.karyawan_pabrik ENABLE ROW LEVEL SECURITY;
