-- [V9] FIX VIEW UI ONLY (Tanpa Ubah Logic)
-- Memperbarui View agar membaca kolom breakdown dari tabel

-- 1. Pastikan kolom breakdown ada di tabel utama (Safety Check)
ALTER TABLE public.gaji_harian_pabrik_garut ADD COLUMN IF NOT EXISTS gaji_pokok NUMERIC DEFAULT 0;
ALTER TABLE public.gaji_harian_pabrik_garut ADD COLUMN IF NOT EXISTS gaji_lembur NUMERIC DEFAULT 0;
ALTER TABLE public.gaji_harian_pabrik_garut ADD COLUMN IF NOT EXISTS uang_makan NUMERIC DEFAULT 0;
ALTER TABLE public.gaji_harian_pabrik_garut ADD COLUMN IF NOT EXISTS uang_kehadiran NUMERIC DEFAULT 0;
ALTER TABLE public.gaji_harian_pabrik_garut ADD COLUMN IF NOT EXISTS uang_bonus NUMERIC DEFAULT 0;

-- 2. Update View UI (Sesuai Request: Tanpa Nama, Dengan Breakdown)
CREATE OR REPLACE VIEW public.v_gaji_harian_garut_ui AS
SELECT
    id,
    tanggal,
    kode,
    grade,
    divisi,
    bagian,
    perusahaan,
    bulan,
    periode,
    kehadiran,
    lembur,
    keluar_masuk,
    keterangan,
    gaji_pokok,
    gaji_lembur,
    uang_makan,
    uang_kehadiran,
    uang_bonus,
    gaji,
    created_at,
    updated_at
FROM public.gaji_harian_pabrik_garut;

-- 3. Grant Permissions
GRANT SELECT ON public.v_gaji_harian_garut_ui TO anon, authenticated, service_role;

-- 4. Refresh Schema Cache
NOTIFY pgrst, 'reload config';
