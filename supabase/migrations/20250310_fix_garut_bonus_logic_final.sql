-- =================================================================
-- GARUT BONUS LOGIC FIX (FINAL)
-- Implements strict priority rules for uang_bonus calculation
-- =================================================================

-- 1. Main Calculation Function
CREATE OR REPLACE FUNCTION refresh_total_gaji_for_month(p_bulan TEXT)
RETURNS VOID AS $$
DECLARE
    emp_rec RECORD;
    att_rec RECORD;
    
    -- Counters for Streaks
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
        ph.bulan,
        ph.periode,
        ph.kode,
        k.nama,
        k.perusahaan,
        k.bagian,
        k.divisi,
        CASE WHEN ph.periode = 'Periode 1' THEN k.grade_p1 ELSE k.grade_p2 END,
        CASE WHEN ph.periode = 'Periode 1' THEN k.grade_p1 ELSE NULL END,
        CASE WHEN ph.periode = 'Periode 2' THEN k.grade_p2 ELSE NULL END,
        NOW(),
        NOW()
    FROM public.presensi_harian_pabrik_garut ph
    LEFT JOIN public.data_karyawan_pabrik_garut k 
        ON ph.kode = k.kode AND ph.bulan = k.bulan
    WHERE ph.bulan = p_bulan;

    -- C. Update Statistik Kehadiran
    UPDATE public.total_gaji_pabrik_garut t
    SET 
        h = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran = 'H'),
        lembur = (SELECT COALESCE(SUM(CASE WHEN p.lembur ~ '^[0-9\\.]+$' THEN CAST(p.lembur AS NUMERIC) ELSE 0 END), 0) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode),
        set_h = (SELECT COALESCE(SUM(CASE WHEN p.kehadiran ~ '^[0-9\\.]+$' THEN CAST(p.kehadiran AS NUMERIC) ELSE 0 END), 0) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode),
        
        -- Cumulative Stats for Periode 2 (P1 + P2)
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
            SELECT kehadiran FROM public.presensi_harian_pabrik_garut 
            WHERE kode = emp_rec.kode AND bulan = p_bulan
              AND ((emp_rec.periode = 'Periode 1' AND periode = 'Periode 1') OR (emp_rec.periode = 'Periode 2' AND periode IN ('Periode 1', 'Periode 2')))
            ORDER BY tanggal ASC
        LOOP
            -- S Streak
            IF att_rec.kehadiran = 'S' THEN v_streak_s := v_streak_s + 1;
            ELSIF att_rec.kehadiran IN ('M', 'TM') THEN NULL;
            ELSE IF v_streak_s >= 2 THEN v_s_b := v_s_b + v_streak_s; ELSIF v_streak_s = 1 THEN v_s_tb := v_s_tb + 1; END IF; v_streak_s := 0; END IF;
            
            -- I Streak
            IF att_rec.kehadiran = 'I' THEN v_streak_i := v_streak_i + 1;
            ELSIF att_rec.kehadiran IN ('M', 'TM') THEN NULL;
            ELSE IF v_streak_i >= 2 THEN v_i_b := v_i_b + v_streak_i; ELSIF v_streak_i = 1 THEN v_i_tb := v_i_tb + 1; END IF; v_streak_i := 0; END IF;
            
            -- T Streak
            IF att_rec.kehadiran = 'T' THEN v_streak_t := v_streak_t + 1;
            ELSIF att_rec.kehadiran IN ('M', 'TM') THEN NULL;
            ELSE IF v_streak_t >= 2 THEN v_t_b := v_t_b + v_streak_t; ELSIF v_streak_t = 1 THEN v_t_tb := v_t_tb + 1; END IF; v_streak_t := 0; END IF;
        END LOOP;
        
        IF v_streak_s >= 2 THEN v_s_b := v_s_b + v_streak_s; ELSIF v_streak_s = 1 THEN v_s_tb := v_s_tb + 1; END IF;
        IF v_streak_i >= 2 THEN v_i_b := v_i_b + v_streak_i; ELSIF v_streak_i = 1 THEN v_i_tb := v_i_tb + 1; END IF;
        IF v_streak_t >= 2 THEN v_t_b := v_t_b + v_streak_t; ELSIF v_streak_t = 1 THEN v_t_tb := v_t_tb + 1; END IF;

        UPDATE public.total_gaji_pabrik_garut SET s_b = v_s_b, s_tb = v_s_tb, i_b = v_i_b, i_tb = v_i_tb, t_b = v_t_b, t_tb = v_t_tb WHERE id = emp_rec.id;
    END LOOP;

    -- E. Sync Penyesuaian & Karyawan Info
    UPDATE public.total_gaji_pabrik_garut t
    SET 
        penyesuaian_bonus = COALESCE((SELECT penyesuaian_bonus FROM public.penyesuaian_gaji_pabrik p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode LIMIT 1), 0),
        kasbon = COALESCE((SELECT kasbon FROM public.penyesuaian_gaji_pabrik p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode LIMIT 1), 0),
        keluar_masuk = k.keluar_masuk,
        keterangan = k.keterangan
    FROM public.data_karyawan_pabrik_garut k
    WHERE t.kode = k.kode AND t.bulan = k.bulan AND t.bulan = p_bulan;

    -- F. Hitung Nominal Gaji (STRICT PRIORITY RULES)
    UPDATE public.total_gaji_pabrik_garut t
    SET
        gapok = COALESCE((COALESCE(m.gaji_harian, 0) * COALESCE(t.h, 0)) + (COALESCE(m.gaji_per_jam, 0) * COALESCE(t.set_h, 0)), 0),
        gaji_lembur = COALESCE(COALESCE(m.lembur, 0) * COALESCE(t.lembur, 0), 0),
        
        -- Uang Makan & Kehadiran (Standard Logic)
        u_m = CASE WHEN t.periode = 'Periode 1' THEN 0 ELSE GREATEST(0, COALESCE(m.uang_makan, 0) - (((COALESCE(t.i_tb, 0) + COALESCE(t.s_tb, 0) + COALESCE(t.t_tb, 0)) * 10000) + (COALESCE(m.uang_makan_harian, 0) * (COALESCE(t.lp, 0) + COALESCE(t.tm, 0) + COALESCE(t.b, 0))) + (9000 * COALESCE(t.i_b, 0) + 1000 * COALESCE(t.i_b, 0) * COALESCE(t.i_b, 0)) + (9000 * COALESCE(t.s_b, 0) + 1000 * COALESCE(t.s_b, 0) * COALESCE(t.s_b, 0)) + (9000 * COALESCE(t.t_b, 0) + 1000 * COALESCE(t.t_b, 0) * COALESCE(t.t_b, 0)))) END,
        u_k = CASE WHEN t.periode = 'Periode 1' THEN 0 ELSE GREATEST(0, COALESCE(m.uang_kehadiran, 0) - (((COALESCE(t.i_tb, 0) + COALESCE(t.s_tb, 0) + COALESCE(t.t_tb, 0)) * 10000) + (COALESCE(m.uang_kehadiran_harian, 0) * (COALESCE(t.lp, 0) + COALESCE(t.tm, 0) + COALESCE(t.b, 0))) + (9000 * COALESCE(t.i_b, 0) + 1000 * COALESCE(t.i_b, 0) * COALESCE(t.i_b, 0)) + (9000 * COALESCE(t.s_b, 0) + 1000 * COALESCE(t.s_b, 0) * COALESCE(t.s_b, 0)) + (9000 * COALESCE(t.t_b, 0) + 1000 * COALESCE(t.t_b, 0) * COALESCE(t.t_b, 0)))) END,

        -- === LOGIKA BONUS (STRICT PRIORITY) ===
        uang_bonus = CASE 
            -- Rule 0: Hanya Periode 2
            WHEN t.periode = 'Periode 1' THEN 0
            ELSE
                GREATEST(0, (
                    CASE
                        -- PRIORITAS 1: Keluar Masuk terisi dan bukan '-'
                        WHEN t.keluar_masuk IS NOT NULL AND t.keluar_masuk NOT IN ('', '-') THEN 0
                        
                        -- PRIORITAS 2: Total Absensi (S, I, T) > 0
                        WHEN (COALESCE(t.i_b,0) + COALESCE(t.i_tb,0) + COALESCE(t.s_b,0) + COALESCE(t.s_tb,0) + COALESCE(t.t_b,0) + COALESCE(t.t_tb,0)) > 0 THEN 0
                        
                        -- PRIORITAS 3: Keterangan = 'libur pribadi'
                        WHEN t.keterangan ILIKE '%libur pribadi%' THEN 0
                        
                        -- JIKA LOLOS PRIORITAS 1-3, HITUNG BONUS
                        ELSE
                            CASE 
                                -- A. KARYAWAN BORONGAN (Cek kolom bagian)
                                WHEN t.bagian ILIKE '%BORONGAN%' THEN
                                    CASE 
                                        -- Kondisi: Ada LP atau Libur Perusahaan
                                        WHEN COALESCE(t.lp, 0) > 0 OR t.keterangan ILIKE '%libur perusahaan%' THEN COALESCE(m.bonus, 0) / 8
                                        -- Kondisi Normal
                                        ELSE COALESCE(m.bonus, 0) / 4
                                    END
                                
                                -- B. KARYAWAN NON BORONGAN
                                ELSE
                                    CASE 
                                        -- Kondisi: Ada LP atau Libur Perusahaan
                                        WHEN COALESCE(t.lp, 0) > 0 OR t.keterangan ILIKE '%libur perusahaan%' THEN COALESCE(m.bonus, 0) / 2
                                        -- Kondisi Normal
                                        ELSE COALESCE(m.bonus, 0)
                                    END
                            END
                    END
                ) - COALESCE(t.penyesuaian_bonus, 0)) -- PENYESUAIAN BONUS DIKURANGI DI AKHIR
        END,
        
        updated_at = NOW()
    FROM public.master_gaji m
    WHERE t.grade = m.grade AND t.bulan = m.bulan AND t.bulan = p_bulan;

    -- G. Hitung Total Gaji (Final)
    UPDATE public.total_gaji_pabrik_garut
    SET hasil_gaji = gapok + gaji_lembur + u_m + u_k + COALESCE(uang_bonus, 0) - COALESCE(kasbon, 0) + COALESCE(penyesuaian_bonus, 0)
    WHERE bulan = p_bulan;

END;
$$ LANGUAGE plpgsql;

-- 2. Debug Function (To Verify Logic)
CREATE OR REPLACE FUNCTION debug_garut_bonus(p_bulan TEXT, p_kode TEXT)
RETURNS TEXT AS $$
DECLARE
    t RECORD;
    m RECORD;
    v_log TEXT := '';
    v_base_bonus NUMERIC := 0;
    v_final_bonus NUMERIC := 0;
    v_absensi INT := 0;
BEGIN
    SELECT * INTO t FROM total_gaji_pabrik_garut WHERE bulan = p_bulan AND kode = p_kode;
    IF NOT FOUND THEN RETURN 'Data tidak ditemukan in total_gaji'; END IF;

    SELECT * INTO m FROM master_gaji WHERE grade = t.grade AND bulan = t.bulan;
    IF NOT FOUND THEN RETURN 'Master Gaji tidak ditemukan'; END IF;

    v_log := 'Debug Bonus ' || t.nama || ' (' || t.kode || ')' || CHR(10);
    v_log := v_log || '--------------------------------' || CHR(10);
    v_log := v_log || 'Master Bonus: ' || COALESCE(m.bonus, 0) || CHR(10);
    v_log := v_log || 'Bagian: ' || COALESCE(t.bagian, '-') || CHR(10);
    v_log := v_log || 'Keterangan: ' || COALESCE(t.keterangan, '-') || CHR(10);
    v_log := v_log || 'Keluar/Masuk: ' || COALESCE(t.keluar_masuk, '-') || CHR(10);
    v_log := v_log || 'LP: ' || COALESCE(t.lp, 0) || CHR(10);
    
    v_absensi := COALESCE(t.i_b,0) + COALESCE(t.i_tb,0) + COALESCE(t.s_b,0) + COALESCE(t.s_tb,0) + COALESCE(t.t_b,0) + COALESCE(t.t_tb,0);
    v_log := v_log || 'Total Absen (S/I/T): ' || v_absensi || CHR(10);
    v_log := v_log || '--------------------------------' || CHR(10);

    IF t.periode = 'Periode 1' THEN
        v_log := v_log || 'Periode 1 -> Bonus = 0';
        v_base_bonus := 0;
    ELSIF t.keluar_masuk IS NOT NULL AND t.keluar_masuk NOT IN ('', '-') THEN
        v_log := v_log || '[PRIORITAS 1] Keluar Masuk terisi -> Bonus = 0';
        v_base_bonus := 0;
    ELSIF v_absensi > 0 THEN
        v_log := v_log || '[PRIORITAS 2] Ada Absensi -> Bonus = 0';
        v_base_bonus := 0;
    ELSIF t.keterangan ILIKE '%libur pribadi%' THEN
        v_log := v_log || '[PRIORITAS 3] Libur Pribadi -> Bonus = 0';
        v_base_bonus := 0;
    ELSE
        IF t.bagian ILIKE '%BORONGAN%' THEN
             v_log := v_log || '[KATEGORI] BORONGAN' || CHR(10);
             IF COALESCE(t.lp, 0) > 0 OR t.keterangan ILIKE '%libur perusahaan%' THEN
                 v_log := v_log || 'Kondisi: Ada LP/Libur Perusahaan (/8)';
                 v_base_bonus := COALESCE(m.bonus, 0) / 8;
             ELSE
                 v_log := v_log || 'Kondisi: Normal (/4)';
                 v_base_bonus := COALESCE(m.bonus, 0) / 4;
             END IF;
        ELSE
             v_log := v_log || '[KATEGORI] NON-BORONGAN' || CHR(10);
             IF COALESCE(t.lp, 0) > 0 OR t.keterangan ILIKE '%libur perusahaan%' THEN
                 v_log := v_log || 'Kondisi: Ada LP/Libur Perusahaan (/2)';
                 v_base_bonus := COALESCE(m.bonus, 0) / 2;
             ELSE
                 v_log := v_log || 'Kondisi: Normal (Full)';
                 v_base_bonus := COALESCE(m.bonus, 0);
             END IF;
        END IF;
    END IF;

    v_log := v_log || CHR(10) || '--------------------------------' || CHR(10);
    v_log := v_log || 'Base Bonus: ' || v_base_bonus || CHR(10);
    v_log := v_log || 'Penyesuaian: ' || COALESCE(t.penyesuaian_bonus, 0) || CHR(10);
    
    v_final_bonus := GREATEST(0, v_base_bonus - COALESCE(t.penyesuaian_bonus, 0));
    
    v_log := v_log || 'Final Uang Bonus: ' || v_final_bonus;

    RETURN v_log;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload config';
