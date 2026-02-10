-- =================================================================
-- GARUT AUTO-SYNC SYSTEM (REAL-TIME) - REVISI BAGIAN 2
-- Update: LP, TM, B (Cumulative for Periode 2)
-- =================================================================

CREATE OR REPLACE FUNCTION refresh_total_gaji_for_month(p_bulan TEXT)
RETURNS VOID AS $$
BEGIN
    -- 1. Reset Data Bulan Ini
    DELETE FROM public.total_gaji_pabrik_garut WHERE bulan = p_bulan;

    -- 2. Insert Base Data (Identity)
    INSERT INTO public.total_gaji_pabrik_garut (
        bulan, periode, kode, nama, perusahaan, bagian, divisi, 
        grade, grade_p1, grade_p2, created_at, updated_at
    )
    SELECT DISTINCT
        ph.bulan, ph.periode, ph.kode, k.nama, k.perusahaan, k.bagian, k.divisi,
        CASE WHEN ph.periode = 'Periode 1' THEN k.grade_p1 ELSE k.grade_p2 END,
        CASE WHEN ph.periode = 'Periode 1' THEN k.grade_p1 ELSE NULL END,
        CASE WHEN ph.periode = 'Periode 2' THEN k.grade_p2 ELSE NULL END,
        NOW(), NOW()
    FROM public.presensi_harian_pabrik_garut ph
    LEFT JOIN public.data_karyawan_pabrik_garut k 
        ON ph.kode = k.kode AND ph.bulan = k.bulan
    WHERE ph.bulan = p_bulan;

    -- 3. Update Statistik Kehadiran (LOGIC V4: Cumulative LP, TM, B)
    UPDATE public.total_gaji_pabrik_garut t
    SET 
        -- H (Tetap Per Periode)
        h = (
            SELECT COUNT(*) 
            FROM public.presensi_harian_pabrik_garut p 
            WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode 
              AND p.kehadiran = 'H'
        ),
        
        -- LEMBUR (Tetap Per Periode, Sum Numeric)
        lembur = (
            SELECT COALESCE(SUM(CASE 
                WHEN p.lembur ~ '^[0-9\.]+$' THEN CAST(p.lembur AS NUMERIC) 
                ELSE 0 
            END), 0) 
            FROM public.presensi_harian_pabrik_garut p 
            WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode
        ),

        -- SET.H (Tetap Per Periode, Sum Numeric)
        set_h = (
            SELECT COALESCE(SUM(CASE 
                WHEN p.kehadiran ~ '^[0-9\.]+$' THEN CAST(p.kehadiran AS NUMERIC) 
                ELSE 0 
            END), 0) 
            FROM public.presensi_harian_pabrik_garut p 
            WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode
        ),

        -- LP (CUMULATIVE: P1->P1, P2->P1+P2)
        lp = (
            SELECT COUNT(*) 
            FROM public.presensi_harian_pabrik_garut p 
            WHERE p.kode = t.kode AND p.bulan = t.bulan 
              AND p.kehadiran = 'LP'
              AND (
                  (t.periode = 'Periode 1' AND p.periode = 'Periode 1')
                  OR
                  (t.periode = 'Periode 2' AND p.periode IN ('Periode 1', 'Periode 2'))
              )
        ),

        -- TM (CUMULATIVE: P1->P1, P2->P1+P2)
        tm = (
            SELECT COUNT(*) 
            FROM public.presensi_harian_pabrik_garut p 
            WHERE p.kode = t.kode AND p.bulan = t.bulan 
              AND p.kehadiran = 'TM'
              AND (
                  (t.periode = 'Periode 1' AND p.periode = 'Periode 1')
                  OR
                  (t.periode = 'Periode 2' AND p.periode IN ('Periode 1', 'Periode 2'))
              )
        ),

        -- B (CUMULATIVE: P1->P1, P2->P1+P2)
        b = (
            SELECT COUNT(*) 
            FROM public.presensi_harian_pabrik_garut p 
            WHERE p.kode = t.kode AND p.bulan = t.bulan 
              AND p.kehadiran = 'B'
              AND (
                  (t.periode = 'Periode 1' AND p.periode = 'Periode 1')
                  OR
                  (t.periode = 'Periode 2' AND p.periode IN ('Periode 1', 'Periode 2'))
              )
        ),

        -- S, I, T (Standard Per Periode)
        s_b = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran ILIKE 'S%'),
        i_b = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran ILIKE 'I%'),
        t_b = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran IN ('A', 'Alpha', 'T'))

    WHERE t.bulan = p_bulan;

    -- 4. Hitung Nominal Gaji
    UPDATE public.total_gaji_pabrik_garut t
    SET
        -- Gapok: (H + SET.H + LP + TM) * Rate
        gapok = ROUND((COALESCE(t.h, 0) + COALESCE(t.set_h, 0) + COALESCE(t.lp, 0) + COALESCE(t.tm, 0)) * CASE WHEN COALESCE(m.gaji_harian, 0) > 0 THEN m.gaji_harian ELSE COALESCE(m.gaji_pokok, 0) / 26 END),
        
        -- Uang Makan: (H + SET.H) * Rate
        u_m = ROUND((COALESCE(t.h, 0) + COALESCE(t.set_h, 0)) * CASE WHEN COALESCE(m.uang_makan_harian, 0) > 0 THEN m.uang_makan_harian ELSE COALESCE(m.uang_makan, 0) / 26 END),
        
        -- Uang Kehadiran: (H + SET.H) * Rate
        u_k = ROUND((COALESCE(t.h, 0) + COALESCE(t.set_h, 0)) * CASE WHEN COALESCE(m.uang_kehadiran_harian, 0) > 0 THEN m.uang_kehadiran_harian ELSE COALESCE(m.uang_kehadiran, 0) / 26 END),
        
        -- Lembur
        gaji_lembur = ROUND(COALESCE(t.lembur, 0) * COALESCE(m.lembur, 0)),
        
        -- Bonus (Hangus jika ada absen S/I/T/B)
        uang_bonus = CASE WHEN (COALESCE(t.s_b, 0) + COALESCE(t.i_b, 0) + COALESCE(t.t_b, 0) + COALESCE(t.b, 0)) > 0 THEN 0 ELSE COALESCE(m.bonus, 0) END
    FROM public.master_gaji m
    WHERE t.grade = m.grade AND t.bulan = m.bulan AND t.bulan = p_bulan;

    -- 5. Hitung Total Akhir
    UPDATE public.total_gaji_pabrik_garut
    SET hasil_gaji = COALESCE(gapok, 0) + COALESCE(u_m, 0) + COALESCE(u_k, 0) + COALESCE(gaji_lembur, 0) + COALESCE(uang_bonus, 0) - COALESCE(kasbon, 0) + COALESCE(penyesuaian_bonus, 0)
    WHERE bulan = p_bulan;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload config';
