-- ============================================
-- AUTO-SYNC NAMA, GRADE, DIVISI
-- dari data_karyawan ke presensi_harian
-- ============================================

-- 1. Pastikan kolom ada di presensi_harian_staff_pabrik
ALTER TABLE public.presensi_harian_staff_pabrik ADD COLUMN IF NOT EXISTS nama TEXT;
ALTER TABLE public.presensi_harian_staff_pabrik ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.presensi_harian_staff_pabrik ADD COLUMN IF NOT EXISTS divisi TEXT;

-- 2. TRIGGER: Auto-fill saat INSERT/UPDATE presensi
CREATE OR REPLACE FUNCTION autofill_karyawan_to_presensi()
RETURNS TRIGGER AS $$
DECLARE
    v_nama TEXT;
    v_grade TEXT;
    v_divisi TEXT;
BEGIN
    -- Ambil data dari data_karyawan
    SELECT nama, grade, divisi INTO v_nama, v_grade, v_divisi
    FROM data_karyawan_staff_pabrik
    WHERE kode = NEW.kode AND bulan = NEW.bulan
    LIMIT 1;
    
    -- Auto-fill kolom
    IF FOUND THEN
        NEW.nama := v_nama;
        NEW.grade := v_grade;
        NEW.divisi := v_divisi;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_autofill_karyawan_presensi ON public.presensi_harian_staff_pabrik;
CREATE TRIGGER trigger_autofill_karyawan_presensi
BEFORE INSERT OR UPDATE ON public.presensi_harian_staff_pabrik
FOR EACH ROW EXECUTE FUNCTION autofill_karyawan_to_presensi();

-- 3. TRIGGER: Sync saat data_karyawan berubah
CREATE OR REPLACE FUNCTION sync_karyawan_to_presensi()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        -- Update presensi yang matching
        UPDATE public.presensi_harian_staff_pabrik
        SET 
            nama = NEW.nama,
            grade = NEW.grade,
            divisi = NEW.divisi
        WHERE kode = NEW.kode AND bulan = NEW.bulan;
        
    ELSIF (TG_OP = 'DELETE') THEN
        -- Set NULL saat karyawan dihapus
        UPDATE public.presensi_harian_staff_pabrik
        SET nama = NULL, grade = NULL, divisi = NULL
        WHERE kode = OLD.kode AND bulan = OLD.bulan;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_karyawan_presensi ON public.data_karyawan_staff_pabrik;
CREATE TRIGGER trigger_sync_karyawan_presensi
AFTER INSERT OR UPDATE OR DELETE ON public.data_karyawan_staff_pabrik
FOR EACH ROW EXECUTE FUNCTION sync_karyawan_to_presensi();

-- 4. One-time sync untuk data existing
UPDATE public.presensi_harian_staff_pabrik p
SET 
    nama = k.nama,
    grade = k.grade,
    divisi = k.divisi
FROM public.data_karyawan_staff_pabrik k
WHERE p.kode = k.kode AND p.bulan = k.bulan;
