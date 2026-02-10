-- =================================================================
-- GARUT AUTO-SYNC SYSTEM (REAL-TIME) - REVISI V6 (FULL STREAK S & I)
-- Update: S_B, S_TB, I_B, I_TB
-- Logic: 'M' dan 'TM' TIDAK memutus urutan S maupun I
-- =================================================================

CREATE OR REPLACE FUNCTION refresh_total_gaji_for_month(p_bulan TEXT)
RETURNS VOID AS $$
DECLARE
    emp_rec RECORD;
    att_rec RECORD;
    
    -- Counters for S
    v_s_b INT;
    v_s_tb INT;
    v_streak_s INT;

    -- Counters for I
    v_i_b INT;
    v_i_tb INT;
    v_streak_i INT;
BEGIN
    -- A. Hapus data lama untuk bulan ini (Reset)
    DELETE FROM public.total_gaji_pabrik_garut WHERE bulan = p_bulan;

    -- B. Insert data baru HANYA untuk kombinasi yang ADA di presensi
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

    -- C. Update Statistik Kehadiran (Simple Columns)
    UPDATE public.total_gaji_pabrik_garut t
    SET 
        -- H: Hitung jumlah kehadiran = 'H' (Eksak)
        h = (
            SELECT COUNT(*) 
            FROM public.presensi_harian_pabrik_garut p 
            WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode 
              AND p.kehadiran = 'H'
        ),
        
        -- LEMBUR: Sum kolom lembur (jika angka)
        lembur = (
            SELECT COALESCE(SUM(CASE 
                WHEN p.lembur ~ '^[0-9\.]+$' THEN CAST(p.lembur AS NUMERIC) 
                ELSE 0 
            END), 0) 
            FROM public.presensi_harian_pabrik_garut p 
            WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode
        ),

        -- SET.H: Sum kehadiran (jika angka) -> Mengcover 0.5, 1, dll
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
        )
    WHERE t.bulan = p_bulan;

    -- D. CALCULATE STREAK S_B, S_TB, I_B, I_TB (Procedural Loop)
    FOR emp_rec IN SELECT id, kode, periode FROM public.total_gaji_pabrik_garut WHERE bulan = p_bulan LOOP
        -- Init S counters
        v_s_b := 0; v_s_tb := 0; v_streak_s := 0;
        -- Init I counters
        v_i_b := 0; v_i_tb := 0; v_streak_i := 0;
        
        -- Iterate attendance ordered by date
        FOR att_rec IN 
            SELECT kehadiran 
            FROM public.presensi_harian_pabrik_garut 
            WHERE kode = emp_rec.kode 
              AND bulan = p_bulan
              AND (
                  (emp_rec.periode = 'Periode 1' AND periode = 'Periode 1')
                  OR
                  (emp_rec.periode = 'Periode 2' AND periode IN ('Periode 1', 'Periode 2'))
              )
            ORDER BY tanggal ASC
        LOOP
            -- LOGIC SAKIT (S)
            IF att_rec.kehadiran = 'S' THEN
                v_streak_s := v_streak_s + 1;
            ELSIF att_rec.kehadiran IN ('M', 'TM') THEN
                NULL; -- Ignore (Don't break streak)
            ELSE
                -- Break streak S
                IF v_streak_s >= 2 THEN v_s_b := v_s_b + v_streak_s;
                ELSIF v_streak_s = 1 THEN v_s_tb := v_s_tb + 1;
                END IF;
                v_streak_s := 0;
            END IF;

            -- LOGIC IZIN (I)
            IF att_rec.kehadiran = 'I' THEN
                v_streak_i := v_streak_i + 1;
            ELSIF att_rec.kehadiran IN ('M', 'TM') THEN
                NULL; -- Ignore (Don't break streak)
            ELSE
                -- Break streak I
                IF v_streak_i >= 2 THEN v_i_b := v_i_b + v_streak_i;
                ELSIF v_streak_i = 1 THEN v_i_tb := v_i_tb + 1;
                END IF;
                v_streak_i := 0;
            END IF;
        END LOOP;
        
        -- Final Check S (After loop ends)
        IF v_streak_s >= 2 THEN v_s_b := v_s_b + v_streak_s;
        ELSIF v_streak_s = 1 THEN v_s_tb := v_s_tb + 1;
        END IF;

        -- Final Check I (After loop ends)
        IF v_streak_i >= 2 THEN v_i_b := v_i_b + v_streak_i;
        ELSIF v_streak_i = 1 THEN v_i_tb := v_i_tb + 1;
        END IF;

        -- Update row
        UPDATE public.total_gaji_pabrik_garut 
        SET s_b = v_s_b, s_tb = v_s_tb, i_b = v_i_b, i_tb = v_i_tb
        WHERE id = emp_rec.id;
        
    END LOOP;

    -- E. Hitung Nominal Gaji
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
        
        -- Bonus (Hangus jika ada absen S_B, S_TB, I_B, I_TB, B)
        -- Note: I_B dan I_TB ditambahkan ke kondisi hangus bonus
        uang_bonus = CASE 
            WHEN (COALESCE(t.s_b, 0) + COALESCE(t.s_tb, 0) + COALESCE(t.i_b, 0) + COALESCE(t.i_tb, 0) + COALESCE(t.b, 0)) > 0 
            THEN 0 
            ELSE COALESCE(m.bonus, 0) 
        END
    FROM public.master_gaji m
    WHERE t.grade = m.grade AND t.bulan = m.bulan AND t.bulan = p_bulan;

    -- F. Hitung Total Akhir
    UPDATE public.total_gaji_pabrik_garut
    SET hasil_gaji = COALESCE(gapok, 0) + COALESCE(u_m, 0) + COALESCE(u_k, 0) + COALESCE(gaji_lembur, 0) + COALESCE(uang_bonus, 0) - COALESCE(kasbon, 0) + COALESCE(penyesuaian_bonus, 0)
    WHERE bulan = p_bulan;
END;
$$ LANGUAGE plpgsql;

-- Refresh Trigger Cache
NOTIFY pgrst, 'reload config';
