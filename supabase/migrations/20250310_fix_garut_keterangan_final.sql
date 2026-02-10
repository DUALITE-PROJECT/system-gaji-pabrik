-- =================================================================
-- GARUT KETERANGAN LOGIC (PRIORITY FIX)
-- =================================================================

-- 1. Main Calculation Function (Updated with 2-Pass Update)
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

    -- E. PASS 1: Sync Penyesuaian, KELUAR_MASUK & KETERANGAN (PRIORITY LOGIC)
    UPDATE public.total_gaji_pabrik_garut t
    SET 
        penyesuaian_bonus = COALESCE((SELECT penyesuaian_bonus FROM public.penyesuaian_gaji_pabrik p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode LIMIT 1), 0),
        kasbon = COALESCE((SELECT kasbon FROM public.penyesuaian_gaji_pabrik p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode LIMIT 1), 0),
        
        -- Logic Keluar Masuk: Ambil yang paling awal berdasarkan created_at
        keluar_masuk = (
            SELECT keterangan 
            FROM public.data_karyawan_pabrik_garut k 
            WHERE k.kode = t.kode 
              AND k.bulan = t.bulan 
              AND k.keterangan IN ('KELUAR', 'BARU MASUK')
            ORDER BY k.created_at ASC 
            LIMIT 1
        ),
        
        -- Logic Keterangan: Priority 1 (Libur Pribadi) > Priority 2 (Libur Perusahaan)
        keterangan = CASE
            WHEN EXISTS (SELECT 1 FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.keterangan = 'libur pribadi') THEN 'libur pribadi'
            WHEN EXISTS (SELECT 1 FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.keterangan = 'libur perusahaan') THEN 'libur perusahaan'
            ELSE NULL
        END
    WHERE t.bulan = p_bulan;

    -- F. PASS 2: Hitung Nominal Gaji & Bonus (Uses Updated Keterangan & Keluar Masuk)
    UPDATE public.total_gaji_pabrik_garut t
    SET
        gapok = COALESCE((COALESCE(m.gaji_harian, 0) * COALESCE(t.h, 0)) + (COALESCE(m.gaji_per_jam, 0) * COALESCE(t.set_h, 0)), 0),
        gaji_lembur = COALESCE(COALESCE(m.lembur, 0) * COALESCE(t.lembur, 0), 0),
        
        -- Uang Makan & Kehadiran
        u_m = CASE WHEN t.periode = 'Periode 1' THEN 0 ELSE GREATEST(0, COALESCE(m.uang_makan, 0) - (((COALESCE(t.i_tb, 0) + COALESCE(t.s_tb, 0) + COALESCE(t.t_tb, 0)) * 10000) + (COALESCE(m.uang_makan_harian, 0) * (COALESCE(t.lp, 0) + COALESCE(t.tm, 0) + COALESCE(t.b, 0))) + (9000 * COALESCE(t.i_b, 0) + 1000 * COALESCE(t.i_b, 0) * COALESCE(t.i_b, 0)) + (9000 * COALESCE(t.s_b, 0) + 1000 * COALESCE(t.s_b, 0) * COALESCE(t.s_b, 0)) + (9000 * COALESCE(t.t_b, 0) + 1000 * COALESCE(t.t_b, 0) * COALESCE(t.t_b, 0)))) END,
        u_k = CASE WHEN t.periode = 'Periode 1' THEN 0 ELSE GREATEST(0, COALESCE(m.uang_kehadiran, 0) - (((COALESCE(t.i_tb, 0) + COALESCE(t.s_tb, 0) + COALESCE(t.t_tb, 0)) * 10000) + (COALESCE(m.uang_kehadiran_harian, 0) * (COALESCE(t.lp, 0) + COALESCE(t.tm, 0) + COALESCE(t.b, 0))) + (9000 * COALESCE(t.i_b, 0) + 1000 * COALESCE(t.i_b, 0) * COALESCE(t.i_b, 0)) + (9000 * COALESCE(t.s_b, 0) + 1000 * COALESCE(t.s_b, 0) * COALESCE(t.s_b, 0)) + (9000 * COALESCE(t.t_b, 0) + 1000 * COALESCE(t.t_b, 0) * COALESCE(t.t_b, 0)))) END,

        -- === LOGIKA BONUS (DEPENDS ON KELUAR_MASUK & KETERANGAN) ===
        uang_bonus = CASE 
            WHEN t.periode = 'Periode 1' THEN 0
            ELSE
                GREATEST(0, (
                    CASE
                        -- P1: Keluar Masuk Check
                        WHEN t.keluar_masuk IS NOT NULL AND t.keluar_masuk NOT IN ('', '-') THEN 0
                        -- P2: Absensi Check
                        WHEN (COALESCE(t.i_b,0) + COALESCE(t.i_tb,0) + COALESCE(t.s_b,0) + COALESCE(t.s_tb,0) + COALESCE(t.t_b,0) + COALESCE(t.t_tb,0)) > 0 THEN 0
                        -- P3: Keterangan Check (Libur Pribadi)
                        WHEN t.keterangan = 'libur pribadi' THEN 0
                        
                        ELSE
                            CASE 
                                -- Borongan
                                WHEN t.bagian ILIKE '%BORONGAN%' THEN
                                    CASE 
                                        WHEN COALESCE(t.lp, 0) > 0 OR t.keterangan = 'libur perusahaan' THEN COALESCE(m.bonus, 0) / 8
                                        ELSE COALESCE(m.bonus, 0) / 4
                                    END
                                -- Non Borongan
                                ELSE
                                    CASE 
                                        WHEN COALESCE(t.lp, 0) > 0 OR t.keterangan = 'libur perusahaan' THEN COALESCE(m.bonus, 0) / 2
                                        ELSE COALESCE(m.bonus, 0)
                                    END
                            END
                    END
                ) - COALESCE(t.penyesuaian_bonus, 0))
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

-- 2. TRIGGER: Auto-Update Keterangan from Presensi
CREATE OR REPLACE FUNCTION sync_keterangan_presensi_to_laporan()
RETURNS TRIGGER AS $$
DECLARE
    v_keterangan TEXT;
    v_kode TEXT;
    v_bulan TEXT;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_kode := OLD.kode;
        v_bulan := OLD.bulan;
    ELSE
        v_kode := NEW.kode;
        v_bulan := NEW.bulan;
    END IF;

    -- Hitung ulang keterangan berdasarkan prioritas
    -- Priority 1: Libur Pribadi
    -- Priority 2: Libur Perusahaan
    -- Priority 3: NULL
    
    SELECT 
        CASE
            WHEN EXISTS (SELECT 1 FROM public.presensi_harian_pabrik_garut p WHERE p.kode = v_kode AND p.bulan = v_bulan AND p.keterangan = 'libur pribadi') THEN 'libur pribadi'
            WHEN EXISTS (SELECT 1 FROM public.presensi_harian_pabrik_garut p WHERE p.kode = v_kode AND p.bulan = v_bulan AND p.keterangan = 'libur perusahaan') THEN 'libur perusahaan'
            ELSE NULL
        END
    INTO v_keterangan;

    -- Update total_gaji_pabrik_garut
    UPDATE public.total_gaji_pabrik_garut
    SET keterangan = v_keterangan
    WHERE kode = v_kode AND bulan = v_bulan;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_keterangan_presensi ON public.presensi_harian_pabrik_garut;
CREATE TRIGGER trg_sync_keterangan_presensi
AFTER INSERT OR UPDATE OR DELETE ON public.presensi_harian_pabrik_garut
FOR EACH ROW EXECUTE FUNCTION sync_keterangan_presensi_to_laporan();

NOTIFY pgrst, 'reload config';
