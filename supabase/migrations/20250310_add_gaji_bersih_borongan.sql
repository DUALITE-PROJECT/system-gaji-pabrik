-- 1. Tambahkan kolom gaji_bersih
ALTER TABLE public.data_gaji_borongan_pabrik_garut 
ADD COLUMN IF NOT EXISTS gaji_bersih NUMERIC DEFAULT 0;

-- 2. Buat Fungsi Trigger untuk Menghitung Gaji Bersih
CREATE OR REPLACE FUNCTION public.calculate_gaji_bersih_borongan()
RETURNS TRIGGER AS $$
BEGIN
    -- Rumus: gaji_bersih = gaji + bonus - kasbon
    -- Menggunakan COALESCE untuk menangani nilai NULL sebagai 0
    NEW.gaji_bersih := COALESCE(NEW.gaji, 0) + COALESCE(NEW.bonus, 0) - COALESCE(NEW.kasbon, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Pasang Trigger (BEFORE INSERT OR UPDATE)
DROP TRIGGER IF EXISTS trg_calculate_gaji_bersih_borongan ON public.data_gaji_borongan_pabrik_garut;

CREATE TRIGGER trg_calculate_gaji_bersih_borongan
BEFORE INSERT OR UPDATE ON public.data_gaji_borongan_pabrik_garut
FOR EACH ROW EXECUTE FUNCTION public.calculate_gaji_bersih_borongan();

-- 4. Update data lama agar kolom gaji_bersih terisi
UPDATE public.data_gaji_borongan_pabrik_garut
SET gaji_bersih = COALESCE(gaji, 0) + COALESCE(bonus, 0) - COALESCE(kasbon, 0)
WHERE gaji_bersih IS NULL OR gaji_bersih = 0;

-- 5. Refresh Schema Cache (Supabase specific)
NOTIFY pgrst, 'reload config';
