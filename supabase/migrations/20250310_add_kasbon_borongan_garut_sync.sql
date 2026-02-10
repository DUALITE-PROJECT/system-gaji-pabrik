-- 1. Tambahkan Kolom Kasbon ke Tabel Gaji Borongan
ALTER TABLE public.data_gaji_borongan_pabrik_garut 
ADD COLUMN IF NOT EXISTS kasbon NUMERIC DEFAULT 0;

-- 2. Fungsi Sync: Update Gaji saat Penyesuaian Berubah (Source -> Target)
CREATE OR REPLACE FUNCTION public.sync_kasbon_borongan_update_target()
RETURNS TRIGGER AS $$
BEGIN
    -- Jika DELETE: Set kasbon ke 0 pada data gaji yang cocok
    IF (TG_OP = 'DELETE') THEN
        UPDATE public.data_gaji_borongan_pabrik_garut
        SET kasbon = 0
        WHERE kode = OLD.kode 
          AND bulan = OLD.bulan 
          AND perusahaan = OLD.perusahaan
          AND periode = OLD.periode; -- Match Periode juga agar akurat
          
    -- Jika INSERT/UPDATE: Set kasbon sesuai nilai baru
    ELSE
        UPDATE public.data_gaji_borongan_pabrik_garut
        SET kasbon = NEW.kasbon
        WHERE kode = NEW.kode 
          AND bulan = NEW.bulan 
          AND perusahaan = NEW.perusahaan
          AND periode = NEW.periode; -- Match Periode juga agar akurat
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger pada Tabel Penyesuaian (Source)
DROP TRIGGER IF EXISTS trg_sync_kasbon_borongan_source ON public.data_penyesuaian_borongan_pabrik_garut;
CREATE TRIGGER trg_sync_kasbon_borongan_source
AFTER INSERT OR UPDATE OR DELETE ON public.data_penyesuaian_borongan_pabrik_garut
FOR EACH ROW EXECUTE FUNCTION public.sync_kasbon_borongan_update_target();

-- 4. Fungsi Sync: Ambil Kasbon saat Gaji Diinput/Update (Target -> Source)
-- Memastikan jika data gaji masuk belakangan, tetap dapat nilai kasbon
CREATE OR REPLACE FUNCTION public.sync_kasbon_borongan_fetch_source()
RETURNS TRIGGER AS $$
DECLARE
    v_kasbon NUMERIC;
BEGIN
    SELECT kasbon INTO v_kasbon
    FROM public.data_penyesuaian_borongan_pabrik_garut
    WHERE kode = NEW.kode 
      AND bulan = NEW.bulan 
      AND perusahaan = NEW.perusahaan
      AND periode = NEW.periode
    LIMIT 1;

    -- Jika ada data penyesuaian, pakai nilainya. Jika tidak, 0.
    IF v_kasbon IS NOT NULL THEN
        NEW.kasbon := v_kasbon;
    ELSE
        NEW.kasbon := 0;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger pada Tabel Gaji (Target)
DROP TRIGGER IF EXISTS trg_sync_kasbon_borongan_target ON public.data_gaji_borongan_pabrik_garut;
CREATE TRIGGER trg_sync_kasbon_borongan_target
BEFORE INSERT OR UPDATE ON public.data_gaji_borongan_pabrik_garut
FOR EACH ROW EXECUTE FUNCTION public.sync_kasbon_borongan_fetch_source();

-- 6. Initial Sync (Opsional: Meratakan data yang sudah ada)
UPDATE public.data_gaji_borongan_pabrik_garut g
SET kasbon = p.kasbon
FROM public.data_penyesuaian_borongan_pabrik_garut p
WHERE g.kode = p.kode 
  AND g.bulan = p.bulan 
  AND g.perusahaan = p.perusahaan
  AND g.periode = p.periode;

NOTIFY pgrst, 'reload config';
