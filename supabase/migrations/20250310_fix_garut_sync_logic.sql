-- REVISI LOGIC SYNC GARUT (V2)
-- Masalah: Force Sync memunculkan Periode 2 padahal data presensi kosong.
-- Solusi: Ubah logic insert agar strictly SELECT DISTINCT dari presensi harian.

CREATE OR REPLACE FUNCTION force_sync_garut_month(p_bulan TEXT)
RETURNS VOID AS $$
BEGIN
    -- 1. Hapus data lama di total_gaji untuk bulan ini (Reset Total)
    DELETE FROM public.total_gaji_pabrik_garut WHERE bulan = p_bulan;

    -- 2. Insert data baru HANYA jika kombinasi (Kode + Periode) ada di presensi harian
    INSERT INTO public.total_gaji_pabrik_garut (
        bulan, periode, kode, nama, grade, divisi, bagian, perusahaan, created_at, updated_at
    )
    SELECT DISTINCT 
        ph.bulan,
        ph.periode,
        ph.kode,
        k.nama,
        CASE WHEN ph.periode = 'Periode 1' THEN k.grade_p1 ELSE k.grade_p2 END,
        k.divisi,
        k.bagian,
        k.perusahaan,
        NOW(),
        NOW()
    FROM public.presensi_harian_pabrik_garut ph
    LEFT JOIN public.data_karyawan_pabrik_garut k ON ph.kode = k.kode AND ph.bulan = k.bulan
    WHERE ph.bulan = p_bulan;

    -- 3. Update Statistik Kehadiran (H, S, I, dll)
    
    -- Hadir (1, H, Full)
    UPDATE public.total_gaji_pabrik_garut t
    SET h = (
        SELECT COUNT(*) 
        FROM public.presensi_harian_pabrik_garut p 
        WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode
        AND (p.kehadiran IN ('1', 'H', 'Hadir', 'Full', '8'))
    )
    WHERE t.bulan = p_bulan;

    -- Setengah Hari (0.5, Setengah)
    UPDATE public.total_gaji_pabrik_garut t
    SET set_h = (
        SELECT COUNT(*) 
        FROM public.presensi_harian_pabrik_garut p 
        WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode
        AND (p.kehadiran IN ('0.5', 'Setengah', '4'))
    )
    WHERE t.bulan = p_bulan;

    -- Bolos (B)
    UPDATE public.total_gaji_pabrik_garut t
    SET b = (
        SELECT COUNT(*) 
        FROM public.presensi_harian_pabrik_garut p 
        WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode
        AND (p.kehadiran = 'B')
    )
    WHERE t.bulan = p_bulan;

    -- Sakit (S)
    UPDATE public.total_gaji_pabrik_garut t
    SET s_b = (
        SELECT COUNT(*) 
        FROM public.presensi_harian_pabrik_garut p 
        WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode
        AND (p.kehadiran ILIKE 'S%')
    )
    WHERE t.bulan = p_bulan;

    -- Izin (I)
    UPDATE public.total_gaji_pabrik_garut t
    SET i_b = (
        SELECT COUNT(*) 
        FROM public.presensi_harian_pabrik_garut p 
        WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode
        AND (p.kehadiran ILIKE 'I%')
    )
    WHERE t.bulan = p_bulan;

    -- Alpha/Tanpa Keterangan (T/A)
    UPDATE public.total_gaji_pabrik_garut t
    SET t_b = (
        SELECT COUNT(*) 
        FROM public.presensi_harian_pabrik_garut p 
        WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode
        AND (p.kehadiran IN ('A', 'Alpha', 'M', 'Mangkir', 'T', 'Tanpa Keterangan'))
    )
    WHERE t.bulan = p_bulan;

    -- Lembur (Sum Numeric)
    UPDATE public.total_gaji_pabrik_garut t
    SET lembur = (
        SELECT COALESCE(SUM(CASE WHEN p.lembur ~ '^[0-9\.]+$' THEN CAST(p.lembur AS NUMERIC) ELSE 0 END), 0)
        FROM public.presensi_harian_pabrik_garut p 
        WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode
    )
    WHERE t.bulan = p_bulan;

    -- Keterangan (Ambil yang terakhir diinput jika ada)
    UPDATE public.total_gaji_pabrik_garut t
    SET keterangan = (
        SELECT keterangan 
        FROM public.presensi_harian_pabrik_garut p 
        WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode 
        AND p.keterangan IS NOT NULL AND p.keterangan != ''
        ORDER BY p.tanggal DESC 
        LIMIT 1
    )
    WHERE t.bulan = p_bulan;

    -- Keluar/Masuk (Ambil dari Data Karyawan)
    UPDATE public.total_gaji_pabrik_garut t
    SET keluar_masuk = k.keterangan
    FROM public.data_karyawan_pabrik_garut k
    WHERE t.kode = k.kode AND t.bulan = k.bulan
    AND t.bulan = p_bulan;

END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload config';
