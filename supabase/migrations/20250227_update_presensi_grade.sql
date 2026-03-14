-- Perbaiki fungsi trigger untuk update grade
CREATE OR REPLACE FUNCTION update_presensi_grade()
RETURNS TRIGGER AS $$
BEGIN
    -- Ambil grade dari tabel karyawan_pabrik berdasarkan kode dan bulan
    SELECT grade_p1, grade_p2 INTO NEW.grade_p1, NEW.grade_p2
    FROM public.karyawan_pabrik
    WHERE kode = NEW.kode AND bulan = NEW.bulan
    LIMIT 1;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Pastikan trigger terpasang
DROP TRIGGER IF EXISTS trigger_update_presensi_grade ON public.presensi_harian_pabrik;
CREATE TRIGGER trigger_update_presensi_grade
BEFORE INSERT OR UPDATE ON public.presensi_harian_pabrik
FOR EACH ROW EXECUTE FUNCTION update_presensi_grade();

NOTIFY pgrst, 'reload config';
