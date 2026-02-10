-- =================================================================
-- GARUT AUTO-SYNC SYSTEM - REVISI V10 (UANG KEHADIRAN)
-- Update: Formula Uang Kehadiran dengan Potongan Bertahap
-- =================================================================

-- 1. Helper Function (Ensure exists)
CREATE OR REPLACE FUNCTION calculate_potongan_bertahap(n INT)
RETURNS NUMERIC AS $$
BEGIN
    IF n <= 0 THEN RETURN 0; END IF;
    RETURN (9000 * n) + (1000 * n * n);
END;
$$ LANGUAGE plpgsql;

-- 2. Update Main Refresh Function
CREATE OR REPLACE FUNCTION refresh_total_gaji_for_month(p_bulan TEXT)
RETURNS VOID AS $$
DECLARE
    emp_rec RECORD;
    att_rec RECORD;
    
    -- Counters
    v_s_b INT; v_s_tb INT; v_streak_s INT;
    v_i_b INT; v_i_tb INT; v_streak_i INT;
    v_t_b INT; v_t_tb INT; v_streak_t INT;
BEGIN
    -- A. Reset Data Bulan Ini
    DELETE FROM public.total_gaji_pabrik_garut WHERE bulan = p_bulan;

    -- B. Insert Data Dasar
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

    -- C. Update Statistik Kehadiran (H, Lembur, Set.H, LP, TM, B)
    UPDATE public.total_gaji_pabrik_garut t
    SET 
        h = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran = 'H'),
        lembur = (SELECT COALESCE(SUM(CASE WHEN p.lembur ~ '^[0-9\\.]+$' THEN CAST(p.lembur AS NUMERIC) ELSE 0 END), 0) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode),
        set_h = (SELECT COALESCE(SUM(CASE WHEN p.kehadiran ~ '^[0-9\\.]+$' THEN CAST(p.kehadiran AS NUMERIC) ELSE 0 END), 0) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode),
        -- LP, TM, B (Cumulative Logic for Periode 2)
        lp = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.kehadiran = 'LP' AND ((t.periode = 'Periode 1' AND p.periode = 'Periode 1') OR (t.periode = 'Periode 2' AND p.periode IN ('Periode 1', 'Periode 2')))),
        tm = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.kehadiran = 'TM' AND ((t.periode = 'Periode 1' AND p.periode = 'Periode 1') OR (t.periode = 'Periode 2' AND p.periode IN ('Periode 1', 'Periode 2')))),
        b = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.kehadiran = 'B' AND ((t.periode = 'Periode 1' AND p.periode = 'Periode 1') OR (t.periode = 'Periode 2' AND p.periode IN ('Periode 1', 'Periode 2'))))
    WHERE t.bulan = p_bulan;

    -- D. Calculate Streaks (S, I, T)
    FOR emp_rec IN SELECT id, kode, periode FROM public.total_gaji_pabrik_garut WHERE bulan = p_bulan LOOP
        v_s_b := 0; v_s_tb := 0; v_streak_s := 0;
        v_i_b := 0; v_i_tb := 0; v_streak_i := 0;
        v_t_b := 0; v_t_tb := 0; v_streak_t := 0;
        
        FOR att_rec IN 
            SELECT kehadiran 
            FROM public.presensi_harian_pabrik_garut 
            WHERE kode = emp_rec.kode AND bulan = p_bulan
              AND ((emp_rec.periode = 'Periode 1' AND periode = 'Periode 1') OR (emp_rec.periode = 'Periode 2' AND periode IN ('Periode 1', 'Periode 2')))
            ORDER BY tanggal ASC
        LOOP
            -- Logic Streak S
            IF att_rec.kehadiran = 'S' THEN v_streak_s := v_streak_s + 1;
            ELSIF att_rec.kehadiran IN ('M', 'TM') THEN NULL; 
            ELSE IF v_streak_s >= 2 THEN v_s_b := v_s_b + v_streak_s; ELSIF v_streak_s = 1 THEN v_s_tb := v_s_tb + 1; END IF; v_streak_s := 0; END IF;

            -- Logic Streak I
            IF att_rec.kehadiran = 'I' THEN v_streak_i := v_streak_i + 1;
            ELSIF att_rec.kehadiran IN ('M', 'TM') THEN NULL; 
            ELSE IF v_streak_i >= 2 THEN v_i_b := v_i_b + v_streak_i; ELSIF v_streak_i = 1 THEN v_i_tb := v_i_tb + 1; END IF; v_streak_i := 0; END IF;

            -- Logic Streak T
            IF att_rec.kehadiran = 'T' THEN v_streak_t := v_streak_t + 1;
            ELSIF att_rec.kehadiran IN ('M', 'TM') THEN NULL; 
            ELSE IF v_streak_t >= 2 THEN v_t_b := v_t_b + v_streak_t; ELSIF v_streak_t = 1 THEN v_t_tb := v_t_tb + 1; END IF; v_streak_t := 0; END IF;
        END LOOP;
        
        -- Final Flush
        IF v_streak_s >= 2 THEN v_s_b := v_s_b + v_streak_s; ELSIF v_streak_s = 1 THEN v_s_tb := v_s_tb + 1; END IF;
        IF v_streak_i >= 2 THEN v_i_b := v_i_b + v_streak_i; ELSIF v_streak_i = 1 THEN v_i_tb := v_i_tb + 1; END IF;
        IF v_streak_t >= 2 THEN v_t_b := v_t_b + v_streak_t; ELSIF v_streak_t = 1 THEN v_t_tb := v_t_tb + 1; END IF;

        UPDATE public.total_gaji_pabrik_garut 
        SET s_b = v_s_b, s_tb = v_s_tb, i_b = v_i_b, i_tb = v_i_tb, t_b = v_t_b, t_tb = v_t_tb 
        WHERE id = emp_rec.id;
    END LOOP;

    -- E. Hitung Nominal Gaji (REVISI V10: U_M & U_K)
    UPDATE public.total_gaji_pabrik_garut t
    SET
        -- Gapok & Lembur (V8)
        gapok = COALESCE(
            (COALESCE(m.gaji_pokok, 0) * COALESCE(t.h, 0)) + 
            (COALESCE(m.gaji_per_jam, 0) * COALESCE(t.set_h, 0)), 
            0
        ),
        gaji_lembur = COALESCE(
            COALESCE(m.lembur, 0) * COALESCE(t.lembur, 0), 
            0
        ),
        
        -- Uang Makan (V9)
        u_m = CASE 
            WHEN t.periode = 'Periode 1' THEN 0
            WHEN t.periode = 'Periode 2' THEN 
                GREATEST(0, 
                    COALESCE(m.uang_makan, 0) - (
                        -- 1. Potongan TB (10k flat)
                        ((COALESCE(t.i_tb, 0) + COALESCE(t.s_tb, 0) + COALESCE(t.t_tb, 0)) * 10000) +
                        -- 2. Potongan Harian (LP, TM, B)
                        ((COALESCE(t.lp, 0) + COALESCE(t.tm, 0) + COALESCE(t.b, 0)) * COALESCE(m.uang_makan_harian, 0)) +
                        -- 3. Potongan Bertahap (I_B, S_B, T_B)
                        calculate_potongan_bertahap(COALESCE(t.i_b, 0)) +
                        calculate_potongan_bertahap(COALESCE(t.s_b, 0)) +
                        calculate_potongan_bertahap(COALESCE(t.t_b, 0))
                    )
                )
            ELSE 0 
        END,

        -- Uang Kehadiran (REVISI V10)
        u_k = CASE 
            WHEN t.periode = 'Periode 1' THEN 0
            WHEN t.periode = 'Periode 2' THEN 
                GREATEST(0, 
                    COALESCE(m.uang_kehadiran, 0) - (
                        -- 1. Potongan TB (10k flat)
                        ((COALESCE(t.i_tb, 0) + COALESCE(t.s_tb, 0) + COALESCE(t.t_tb, 0)) * 10000) +
                        -- 2. Potongan Harian (LP, TM, B)
                        ((COALESCE(t.lp, 0) + COALESCE(t.tm, 0) + COALESCE(t.b, 0)) * COALESCE(m.uang_kehadiran_harian, 0)) +
                        -- 3. Potongan Bertahap (I_B, S_B, T_B)
                        calculate_potongan_bertahap(COALESCE(t.i_b, 0)) +
                        calculate_potongan_bertahap(COALESCE(t.s_b, 0)) +
                        calculate_potongan_bertahap(COALESCE(t.t_b, 0))
                    )
                )
            ELSE 0 
        END,

        -- Bonus (Default V8)
        uang_bonus = CASE WHEN (COALESCE(t.s_b, 0) + COALESCE(t.s_tb, 0) + COALESCE(t.i_b, 0) + COALESCE(t.i_tb, 0) + COALESCE(t.b, 0) + COALESCE(t.t_b, 0) + COALESCE(t.t_tb, 0)) > 0 THEN 0 ELSE COALESCE(m.bonus, 0) END

    FROM public.master_gaji m
    WHERE t.grade = m.grade AND t.bulan = m.bulan AND t.bulan = p_bulan;

    -- F. Hitung Total Akhir
    UPDATE public.total_gaji_pabrik_garut
    SET hasil_gaji = COALESCE(gapok, 0) + COALESCE(u_m, 0) + COALESCE(u_k, 0) + COALESCE(gaji_lembur, 0) + COALESCE(uang_bonus, 0) - COALESCE(kasbon, 0) + COALESCE(penyesuaian_bonus, 0)
    WHERE bulan = p_bulan;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload config';
