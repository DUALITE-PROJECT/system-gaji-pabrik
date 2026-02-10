-- [FIX V16] FINAL STAFF FINANCIAL LOGIC
-- Implements strict financial rules based on Division (STAFF vs NON-STAFF)
-- Source: master_gaji

-- 1. Helper Function: Progressive Penalty
-- n=1 -> 10.000
-- n=2 -> 10.000 + 12.000 = 22.000
-- n=3 -> 10.000 + 12.000 + 14.000 = 36.000
CREATE OR REPLACE FUNCTION public.calc_progressive_penalty(n INT)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
    total NUMERIC := 0;
    i INT;
BEGIN
    IF n <= 0 THEN RETURN 0; END IF;
    
    FOR i IN 0..(n-1) LOOP
        total := total + (10000 + (2000 * i));
    END LOOP;
    
    RETURN total;
END;
$$;

-- 2. Main Recalculation Function
CREATE OR REPLACE FUNCTION public.recalc_laporan_bulanan_staff(p_bulan TEXT, p_kode TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    -- Employee Data
    v_nama TEXT; v_grade TEXT; v_divisi TEXT; v_perusahaan TEXT;
    
    -- Attendance Counters
    v_h NUMERIC := 0; v_set_h NUMERIC := 0; v_lp INT := 0; v_lembur NUMERIC := 0;
    v_i_b INT := 0; v_i_tb INT := 0;
    v_s_b INT := 0; v_s_tb INT := 0;
    v_t_b INT := 0; v_t_tb INT := 0;
    
    -- Streak Logic
    v_current_status TEXT := '';
    v_current_streak INT := 0;
    v_kehadiran_clean TEXT;
    r RECORD;
    
    -- Master Salary Data
    r_master RECORD;
    v_gp NUMERIC := 0; v_um NUMERIC := 0; v_uk NUMERIC := 0; v_bn NUMERIC := 0;
    
    -- Final Values
    v_final_gapok NUMERIC := 0;
    v_final_um NUMERIC := 0;
    v_final_uk NUMERIC := 0;
    v_final_bonus NUMERIC := 0;
    v_hasil_gaji NUMERIC := 0;
    
    -- Potongan Variables
    v_pot_hari NUMERIC; v_pot_jam NUMERIC;
    v_pot_sb NUMERIC; v_pot_ib NUMERIC; v_pot_tb NUMERIC; v_pot_tb_all NUMERIC;
    v_pot_ib_k NUMERIC; v_pot_tb_k NUMERIC; v_pot_tb_it NUMERIC;

BEGIN
    -- A. Get Employee Metadata (Priority: Presensi -> Master)
    SELECT nama, grade, divisi, perusahaan INTO v_nama, v_grade, v_divisi, v_perusahaan
    FROM public.presensi_harian_staff_pabrik
    WHERE bulan = p_bulan AND kode = p_kode
    ORDER BY tanggal DESC LIMIT 1;
    
    IF v_nama IS NULL THEN
        SELECT nama, grade, divisi, perusahaan INTO v_nama, v_grade, v_divisi, v_perusahaan
        FROM public.data_karyawan_staff_pabrik
        WHERE bulan = p_bulan AND kode = p_kode
        LIMIT 1;
    END IF;

    -- B. Calculate Attendance Counters (Strict Streak Logic)
    FOR r IN 
        SELECT kehadiran, lembur 
        FROM public.presensi_harian_staff_pabrik 
        WHERE bulan = p_bulan AND kode = p_kode
        ORDER BY tanggal ASC
    LOOP
        v_kehadiran_clean := UPPER(TRIM(r.kehadiran));
        
        -- Aggregates
        IF v_kehadiran_clean = 'H' THEN v_h := v_h + 1; END IF;
        IF v_kehadiran_clean ~ '^[0-9]+(\.[0-9]+)?$' THEN v_set_h := v_set_h + CAST(v_kehadiran_clean AS NUMERIC); END IF;
        IF v_kehadiran_clean = 'LP' THEN v_lp := v_lp + 1; END IF;
        
        -- Lembur (Sum Numeric)
        IF r.lembur IS NOT NULL THEN
             BEGIN
                v_lembur := v_lembur + CAST(REGEXP_REPLACE(r.lembur, '[^0-9\.]', '', 'g') AS NUMERIC);
             EXCEPTION WHEN OTHERS THEN NULL; END;
        END IF;

        -- Streak Logic (Skip M/TM)
        IF v_kehadiran_clean IN ('M', 'TM') THEN
            CONTINUE; 
        ELSIF v_kehadiran_clean IN ('I', 'S', 'T') THEN
            IF v_kehadiran_clean = v_current_status THEN
                v_current_streak := v_current_streak + 1;
            ELSE
                -- Finalize previous
                IF v_current_status = 'I' THEN IF v_current_streak > 1 THEN v_i_b := v_i_b + v_current_streak; ELSE v_i_tb := v_i_tb + v_current_streak; END IF; END IF;
                IF v_current_status = 'S' THEN IF v_current_streak > 1 THEN v_s_b := v_s_b + v_current_streak; ELSE v_s_tb := v_s_tb + v_current_streak; END IF; END IF;
                IF v_current_status = 'T' THEN IF v_current_streak > 1 THEN v_t_b := v_t_b + v_current_streak; ELSE v_t_tb := v_t_tb + v_current_streak; END IF; END IF;
                
                v_current_status := v_kehadiran_clean;
                v_current_streak := 1;
            END IF;
        ELSE
            -- Break streak
            IF v_current_status = 'I' THEN IF v_current_streak > 1 THEN v_i_b := v_i_b + v_current_streak; ELSE v_i_tb := v_i_tb + v_current_streak; END IF; END IF;
            IF v_current_status = 'S' THEN IF v_current_streak > 1 THEN v_s_b := v_s_b + v_current_streak; ELSE v_s_tb := v_s_tb + v_current_streak; END IF; END IF;
            IF v_current_status = 'T' THEN IF v_current_streak > 1 THEN v_t_b := v_t_b + v_current_streak; ELSE v_t_tb := v_t_tb + v_current_streak; END IF; END IF;
            
            v_current_status := '';
            v_current_streak := 0;
        END IF;
    END LOOP;
    
    -- Finalize last streak
    IF v_current_status = 'I' THEN IF v_current_streak > 1 THEN v_i_b := v_i_b + v_current_streak; ELSE v_i_tb := v_i_tb + v_current_streak; END IF; END IF;
    IF v_current_status = 'S' THEN IF v_current_streak > 1 THEN v_s_b := v_s_b + v_current_streak; ELSE v_s_tb := v_s_tb + v_current_streak; END IF; END IF;
    IF v_current_status = 'T' THEN IF v_current_streak > 1 THEN v_t_b := v_t_b + v_current_streak; ELSE v_t_tb := v_t_tb + v_current_streak; END IF; END IF;

    -- C. Financial Calculation
    -- 1. Get Master Salary
    SELECT * INTO r_master FROM master_gaji WHERE grade = v_grade AND bulan = p_bulan LIMIT 1;
    -- Fallback to latest grade if month not found (Optional safety)
    IF r_master IS NULL THEN
        SELECT * INTO r_master FROM master_gaji WHERE grade = v_grade ORDER BY created_at DESC LIMIT 1;
    END IF;

    v_gp := COALESCE(r_master.gaji_pokok, 0);
    v_um := COALESCE(r_master.uang_makan, 0);
    v_uk := COALESCE(r_master.uang_kehadiran, 0);
    v_bn := COALESCE(r_master.bonus, 0);

    -- 2. Apply Rules based on Divisi
    IF UPPER(v_divisi) = 'STAFF' THEN
        v_final_gapok := v_gp;
        v_final_um := v_um;
        v_final_uk := v_uk;
        v_final_bonus := v_bn;
    ELSE
        -- NON-STAFF LOGIC
        
        -- Gapok
        v_pot_hari := (v_s_b + v_s_tb + v_i_b + v_i_tb + v_t_b + v_t_tb) * (v_gp / 26);
        v_pot_jam := (8 - v_set_h) * (v_gp / 26 / 8);
        v_final_gapok := v_gp - (v_pot_hari + v_pot_jam);
        
        -- Uang Makan
        v_pot_sb := public.calc_progressive_penalty(v_s_b);
        v_pot_ib := public.calc_progressive_penalty(v_i_b);
        v_pot_tb := public.calc_progressive_penalty(v_t_b);
        v_pot_tb_all := (v_i_tb + v_s_tb + v_t_tb) * 10000;
        v_final_um := v_um - (v_pot_sb + v_pot_ib + v_pot_tb + v_pot_tb_all);
        
        -- Uang Kehadiran
        v_pot_ib_k := public.calc_progressive_penalty(v_i_b);
        v_pot_tb_k := public.calc_progressive_penalty(v_t_b);
        v_pot_tb_it := (v_i_tb + v_t_tb) * 10000;
        v_final_uk := v_uk - (v_pot_ib_k + v_pot_tb_k + v_pot_tb_it);
        
        -- Bonus
        IF (v_i_tb + v_s_b + v_s_tb + v_t_b + v_t_tb) > 0 THEN
            v_final_bonus := 0;
        ELSE
            v_final_bonus := v_bn;
        END IF;
    END IF;

    -- Safety: Ensure non-negative allowances
    v_final_um := GREATEST(0, v_final_um);
    v_final_uk := GREATEST(0, v_final_uk);
    v_final_gapok := GREATEST(0, v_final_gapok);

    -- Calculate Total
    -- Note: Kasbon & Penyesuaian are preserved from existing data if not passed, 
    -- but here we are recalculating derived fields. Kasbon/Penyesuaian should ideally be fetched or kept.
    -- Since this function updates a row, we should preserve existing manual inputs (Kasbon/Penyesuaian).
    -- We'll do this by using DO UPDATE SET ... = laporan.kasbon (which is already there).
    -- But we don't have access to 'OLD' row here easily without another SELECT.
    -- Let's fetch existing manual values first.
    DECLARE
        v_existing_kasbon NUMERIC := 0;
        v_existing_penyesuaian NUMERIC := 0;
    BEGIN
        SELECT kasbon, penyesuaian_bonus INTO v_existing_kasbon, v_existing_penyesuaian
        FROM public.laporan_bulanan_staff_pabrik
        WHERE bulan = p_bulan AND kode = p_kode;
        
        v_existing_kasbon := COALESCE(v_existing_kasbon, 0);
        v_existing_penyesuaian := COALESCE(v_existing_penyesuaian, 0);
    END;

    v_hasil_gaji := v_final_gapok + v_lembur + v_final_um + v_final_uk + v_final_bonus - v_existing_kasbon + v_existing_penyesuaian;

    -- D. Upsert Report
    INSERT INTO public.laporan_bulanan_staff_pabrik (
        bulan, kode, nama, grade, divisi, perusahaan,
        h, set_h, lp, lembur,
        i_b, i_tb, s_b, s_tb, t_b, t_tb,
        gapok, u_m, u_k, uang_bonus, gaji_lembur,
        hasil_gaji,
        updated_at
    )
    VALUES (
        p_bulan, p_kode, v_nama, v_grade, v_divisi, v_perusahaan,
        v_h, v_set_h, v_lp, v_lembur,
        v_i_b, v_i_tb, v_s_b, v_s_tb, v_t_b, v_t_tb,
        v_final_gapok, v_final_um, v_final_uk, v_final_bonus, v_lembur,
        v_hasil_gaji,
        NOW()
    )
    ON CONFLICT (bulan, kode) DO UPDATE SET
        h = EXCLUDED.h, set_h = EXCLUDED.set_h, lp = EXCLUDED.lp, lembur = EXCLUDED.lembur,
        i_b = EXCLUDED.i_b, i_tb = EXCLUDED.i_tb,
        s_b = EXCLUDED.s_b, s_tb = EXCLUDED.s_tb,
        t_b = EXCLUDED.t_b, t_tb = EXCLUDED.t_tb,
        gapok = EXCLUDED.gapok,
        u_m = EXCLUDED.u_m,
        u_k = EXCLUDED.u_k,
        uang_bonus = EXCLUDED.uang_bonus,
        gaji_lembur = EXCLUDED.gaji_lembur,
        hasil_gaji = EXCLUDED.hasil_gaji,
        updated_at = NOW();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calc_progressive_penalty(INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalc_laporan_bulanan_staff(TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload config';
