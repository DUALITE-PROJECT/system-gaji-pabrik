-- [FIX] Update Force Sync Logic to Include Salary Calculation
-- Masalah: Kolom Gapok, Lembur, dll kosong (0) setelah sync.
-- Solusi: Tambahkan logic perhitungan nominal gaji (Join Master Gaji) ke dalam fungsi sync.

CREATE OR REPLACE FUNCTION force_sync_garut_month(p_bulan TEXT)
RETURNS VOID AS $$
BEGIN
    -- 1. Hapus data lama di total_gaji untuk bulan ini (Clean Slate)
    DELETE FROM public.total_gaji_pabrik_garut WHERE bulan = p_bulan;

    -- 2. Insert data baru (Identitas) HANYA jika ada di presensi harian
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

    -- 3. Update Statistik Kehadiran LENGKAP
    UPDATE public.total_gaji_pabrik_garut t
    SET 
        h = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran IN ('1', 'H', 'Hadir', 'Full', '8')),
        set_h = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran IN ('0.5', 'Setengah')),
        lp = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran = 'LP'),
        tm = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran IN ('TM', 'M', 'Minggu', 'Tanggal Merah')),
        b = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran = 'B'),
        
        -- Absen (Sakit/Izin/Alpha)
        s_b = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran ILIKE 'S%'),
        i_b = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran ILIKE 'I%'),
        t_b = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran IN ('A', 'Alpha', 'T', 'Tanpa Keterangan')),
        
        -- Lembur (Sum Jam)
        lembur = (SELECT COALESCE(SUM(CASE WHEN p.lembur ~ '^[0-9\.]+$' THEN CAST(p.lembur AS NUMERIC) ELSE 0 END), 0) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode)
    WHERE t.bulan = p_bulan;

    -- 4. Hitung Nominal Gaji (Join Master Gaji)
    -- Pastikan Master Gaji sudah diinput untuk Bulan & Grade yang sesuai
    UPDATE public.total_gaji_pabrik_garut t
    SET
        -- Gapok = (H + SetH + LP + TM) * Rate Harian
        gapok = (COALESCE(t.h, 0) + COALESCE(t.set_h, 0) + COALESCE(t.lp, 0) + COALESCE(t.tm, 0)) * COALESCE(m.gaji_harian, 0),
        
        -- Uang Makan = (H + SetH) * Rate Makan
        u_m = (COALESCE(t.h, 0) + COALESCE(t.set_h, 0)) * COALESCE(m.uang_makan_harian, 0),
        
        -- Uang Kehadiran = (H + SetH) * Rate Hadir
        u_k = (COALESCE(t.h, 0) + COALESCE(t.set_h, 0)) * COALESCE(m.uang_kehadiran_harian, 0),
        
        -- Lembur = Jam * Rate Lembur
        gaji_lembur = COALESCE(t.lembur, 0) * COALESCE(m.lembur, 0),
        
        -- Bonus (Hangus jika ada S/I/A/B)
        uang_bonus = CASE 
            WHEN (COALESCE(t.s_b, 0) + COALESCE(t.i_b, 0) + COALESCE(t.t_b, 0) + COALESCE(t.b, 0)) > 0 THEN 0
            ELSE COALESCE(m.bonus, 0)
        END
    FROM public.master_gaji m
    WHERE t.grade = m.grade 
      AND t.bulan = m.bulan -- Match Bulan
      AND t.bulan = p_bulan;

    -- 5. Hitung Total Akhir (Termasuk Kasbon & Penyesuaian)
    UPDATE public.total_gaji_pabrik_garut
    SET hasil_gaji = COALESCE(gapok, 0) + COALESCE(u_m, 0) + COALESCE(u_k, 0) + COALESCE(gaji_lembur, 0) + COALESCE(uang_bonus, 0) - COALESCE(kasbon, 0) + COALESCE(penyesuaian_bonus, 0)
    WHERE bulan = p_bulan;

END;
$$ LANGUAGE plpgsql;
