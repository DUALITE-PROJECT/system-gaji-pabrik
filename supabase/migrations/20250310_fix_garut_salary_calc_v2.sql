-- [FIX V2] Update Force Sync Logic (Rounding & Fallbacks)
-- Mengatasi masalah desimal (koma) dan nilai 0 pada tunjangan

CREATE OR REPLACE FUNCTION force_sync_garut_month(p_bulan TEXT)
RETURNS VOID AS $$
BEGIN
    -- 1. Hapus data lama di total_gaji untuk bulan ini (Reset)
    DELETE FROM public.total_gaji_pabrik_garut WHERE bulan = p_bulan;

    -- 2. Insert data baru HANYA jika ada di presensi harian
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

    -- 3. Update Statistik Kehadiran
    UPDATE public.total_gaji_pabrik_garut t
    SET 
        h = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran IN ('1', 'H', 'Hadir', 'Full', '8')),
        set_h = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran IN ('0.5', 'Setengah')),
        lp = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran = 'LP'),
        tm = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran IN ('TM', 'M', 'Minggu', 'Tanggal Merah')),
        b = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran = 'B'),
        s_b = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran ILIKE 'S%'),
        i_b = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran ILIKE 'I%'),
        t_b = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran IN ('A', 'Alpha', 'T')),
        lembur = (SELECT COALESCE(SUM(CASE WHEN p.lembur ~ '^[0-9\\.]+$' THEN CAST(p.lembur AS NUMERIC) ELSE 0 END), 0) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode)
    WHERE t.bulan = p_bulan;

    -- 4. Hitung Nominal Gaji (Join Master Gaji) - DENGAN PEMBULATAN & FALLBACK
    UPDATE public.total_gaji_pabrik_garut t
    SET
        -- Gapok: Bulatkan ke integer. Jika harian 0, pakai (Bulanan / 26)
        gapok = ROUND(
            (COALESCE(t.h, 0) + COALESCE(t.set_h, 0) + COALESCE(t.lp, 0) + COALESCE(t.tm, 0)) * 
            CASE WHEN COALESCE(m.gaji_harian, 0) > 0 THEN m.gaji_harian ELSE COALESCE(m.gaji_pokok, 0) / 26 END
        ),
        -- Uang Makan: Fallback ke (Bulanan / 26) jika harian 0
        u_m = ROUND(
            (COALESCE(t.h, 0) + COALESCE(t.set_h, 0)) * 
            CASE WHEN COALESCE(m.uang_makan_harian, 0) > 0 THEN m.uang_makan_harian ELSE COALESCE(m.uang_makan, 0) / 26 END
        ),
        -- Uang Kehadiran: Fallback ke (Bulanan / 26) jika harian 0
        u_k = ROUND(
            (COALESCE(t.h, 0) + COALESCE(t.set_h, 0)) * 
            CASE WHEN COALESCE(m.uang_kehadiran_harian, 0) > 0 THEN m.uang_kehadiran_harian ELSE COALESCE(m.uang_kehadiran, 0) / 26 END
        ),
        -- Lembur: Bulatkan
        gaji_lembur = ROUND(COALESCE(t.lembur, 0) * COALESCE(m.lembur, 0)),
        -- Bonus: Hangus jika ada absen (S/I/A/B)
        uang_bonus = CASE 
            WHEN (COALESCE(t.s_b, 0) + COALESCE(t.i_b, 0) + COALESCE(t.t_b, 0) + COALESCE(t.b, 0)) > 0 THEN 0
            ELSE COALESCE(m.bonus, 0)
        END
    FROM public.master_gaji m
    WHERE t.grade = m.grade AND t.bulan = m.bulan AND t.bulan = p_bulan;

    -- 5. Hitung Total Akhir
    UPDATE public.total_gaji_pabrik_garut
    SET hasil_gaji = COALESCE(gapok, 0) + COALESCE(u_m, 0) + COALESCE(u_k, 0) + COALESCE(gaji_lembur, 0) + COALESCE(uang_bonus, 0) - COALESCE(kasbon, 0) + COALESCE(penyesuaian_bonus, 0)
    WHERE bulan = p_bulan;
END;
$$ LANGUAGE plpgsql;
