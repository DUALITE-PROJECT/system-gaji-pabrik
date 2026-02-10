-- [FIX V14] FINAL STAFF SALARY LOGIC (STRICT STREAK RULES)
-- Implements: I/S/T Streak (M/TM Skip), Set.H Sum, Lembur Sum, Auto-Trigger

-- 1. Ensure Table Columns Exist
ALTER TABLE public.laporan_bulanan_staff_pabrik ADD COLUMN IF NOT EXISTS h NUMERIC DEFAULT 0;
ALTER TABLE public.laporan_bulanan_staff_pabrik ADD COLUMN IF NOT EXISTS set_h NUMERIC DEFAULT 0;
ALTER TABLE public.laporan_bulanan_staff_pabrik ADD COLUMN IF NOT EXISTS lp NUMERIC DEFAULT 0;
ALTER TABLE public.laporan_bulanan_staff_pabrik ADD COLUMN IF NOT EXISTS lembur NUMERIC DEFAULT 0;

ALTER TABLE public.laporan_bulanan_staff_pabrik ADD COLUMN IF NOT EXISTS i_b NUMERIC DEFAULT 0;
ALTER TABLE public.laporan_bulanan_staff_pabrik ADD COLUMN IF NOT EXISTS i_tb NUMERIC DEFAULT 0;
ALTER TABLE public.laporan_bulanan_staff_pabrik ADD COLUMN IF NOT EXISTS s_b NUMERIC DEFAULT 0;
ALTER TABLE public.laporan_bulanan_staff_pabrik ADD COLUMN IF NOT EXISTS s_tb NUMERIC DEFAULT 0;
ALTER TABLE public.laporan_bulanan_staff_pabrik ADD COLUMN IF NOT EXISTS t_b NUMERIC DEFAULT 0;
ALTER TABLE public.laporan_bulanan_staff_pabrik ADD COLUMN IF NOT EXISTS t_tb NUMERIC DEFAULT 0;

-- 2. CORE CALCULATION FUNCTION
CREATE OR REPLACE FUNCTION public.recalc_laporan_bulanan_staff(p_bulan TEXT, p_kode TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    -- Variables for counting
    v_h NUMERIC := 0;
    v_set_h NUMERIC := 0;
    v_lp INT := 0;
    v_lembur NUMERIC := 0;
    v_tm INT := 0;
    
    v_i_b INT := 0;
    v_i_tb INT := 0;
    v_s_b INT := 0;
    v_s_tb INT := 0;
    v_t_b INT := 0;
    v_t_tb INT := 0;

    -- Streak tracking
    rec RECORD;
    v_streak_type TEXT := NULL; -- 'I', 'S', 'T'
    v_streak_count INT := 0;
    v_curr_type TEXT;

    -- Financials
    v_grade TEXT;
    v_divisi TEXT;
    v_perusahaan TEXT;
    v_nama TEXT;
    
    r_master RECORD;
    v_gapok NUMERIC := 0;
    v_gaji_lembur NUMERIC := 0;
    v_u_m NUMERIC := 0;
    v_u_k NUMERIC := 0;
    v_bonus NUMERIC := 0;
    v_kasbon NUMERIC := 0;
    v_penyesuaian NUMERIC := 0;
    v_total NUMERIC := 0;

BEGIN
    -- 1. Ensure record exists in laporan_bulanan_staff_pabrik
    SELECT nama, grade, divisi, perusahaan INTO v_nama, v_grade, v_divisi, v_perusahaan
    FROM data_karyawan_staff_pabrik
    WHERE kode = p_kode AND bulan = p_bulan
    LIMIT 1;

    IF v_nama IS NULL THEN
        -- Fallback: Try to get from existing report
        SELECT nama, grade, divisi, perusahaan INTO v_nama, v_grade, v_divisi, v_perusahaan
        FROM laporan_bulanan_staff_pabrik
        WHERE kode = p_kode AND bulan = p_bulan;
    END IF;

    -- Upsert report row
    INSERT INTO public.laporan_bulanan_staff_pabrik (bulan, kode, nama, grade, divisi, perusahaan)
    VALUES (p_bulan, p_kode, COALESCE(v_nama, ''), v_grade, v_divisi, v_perusahaan)
    ON CONFLICT (bulan, kode, perusahaan) DO UPDATE
    SET updated_at = NOW(); 

    -- 2. Iterate Attendance for Counts
    FOR rec IN 
        SELECT kehadiran, lembur 
        FROM presensi_harian_staff_pabrik 
        WHERE bulan = p_bulan AND kode = p_kode
        ORDER BY tanggal ASC
    LOOP
        -- Normalize input
        v_curr_type := NULL;
        
        -- Analyze Kehadiran
        IF rec.kehadiran IN ('H', '1', 'Hadir') THEN
            v_h := v_h + 1;
            v_curr_type := 'RESET';
        ELSIF rec.kehadiran IN ('0.5', 'Setengah') THEN
            v_set_h := v_set_h + 0.5; 
            v_curr_type := 'RESET';
        ELSIF rec.kehadiran ~ '^[0-9\.]+$' THEN
            -- Handle other numeric values as Setengah Hari logic (add to set_h)
            v_set_h := v_set_h + CAST(rec.kehadiran AS NUMERIC);
            v_curr_type := 'RESET';
        ELSIF rec.kehadiran = 'LP' THEN
            v_lp := v_lp + 1;
            v_curr_type := 'RESET';
        ELSIF rec.kehadiran IN ('I', 'Izin') THEN
            v_curr_type := 'I';
        ELSIF rec.kehadiran IN ('S', 'Sakit') THEN
            v_curr_type := 'S';
        ELSIF rec.kehadiran IN ('T', 'Alpha', 'A', 'Tanpa Keterangan') THEN
            v_curr_type := 'T';
        ELSIF rec.kehadiran IN ('M', 'TM', 'Minggu', 'Tanggal Merah') THEN
            v_tm := v_tm + 1;
            v_curr_type := 'SKIP'; -- Do not break streak
        ELSE
            -- Any other text breaks streak
            v_curr_type := 'RESET';
        END IF;

        -- Lembur Sum
        IF rec.lembur ~ '^[0-9\.]+$' THEN
            v_lembur := v_lembur + CAST(rec.lembur AS NUMERIC);
        END IF;

        -- Streak Processing
        IF v_curr_type = 'SKIP' THEN
            -- Continue loop, don't change streak state
            CONTINUE;
        END IF;

        IF v_curr_type = v_streak_type THEN
            -- Continue streak
            v_streak_count := v_streak_count + 1;
        ELSE
            -- Streak broken or changed
            -- Commit previous streak
            IF v_streak_count > 0 THEN
                IF v_streak_count = 1 THEN
                    -- Tunggal
                    IF v_streak_type = 'I' THEN v_i_tb := v_i_tb + 1; END IF;
                    IF v_streak_type = 'S' THEN v_s_tb := v_s_tb + 1; END IF;
                    IF v_streak_type = 'T' THEN v_t_tb := v_t_tb + 1; END IF;
                ELSE
                    -- Berurutan
                    IF v_streak_type = 'I' THEN v_i_b := v_i_b + v_streak_count; END IF;
                    IF v_streak_type = 'S' THEN v_s_b := v_s_b + v_streak_count; END IF;
                    IF v_streak_type = 'T' THEN v_t_b := v_t_b + v_streak_count; END IF;
                END IF;
            END IF;

            -- Start new streak
            IF v_curr_type IN ('I', 'S', 'T') THEN
                v_streak_type := v_curr_type;
                v_streak_count := 1;
            ELSE
                v_streak_type := NULL;
                v_streak_count := 0;
            END IF;
        END IF;
    END LOOP;

    -- Commit final streak after loop
    IF v_streak_count > 0 THEN
        IF v_streak_count = 1 THEN
            IF v_streak_type = 'I' THEN v_i_tb := v_i_tb + 1; END IF;
            IF v_streak_type = 'S' THEN v_s_tb := v_s_tb + 1; END IF;
            IF v_streak_type = 'T' THEN v_t_tb := v_t_tb + 1; END IF;
        ELSE
            IF v_streak_type = 'I' THEN v_i_b := v_i_b + v_streak_count; END IF;
            IF v_streak_type = 'S' THEN v_s_b := v_s_b + v_streak_count; END IF;
            IF v_streak_type = 'T' THEN v_t_b := v_t_b + v_streak_count; END IF;
        END IF;
    END IF;

    -- 3. Calculate Financials
    SELECT * INTO r_master FROM master_gaji WHERE grade = v_grade AND bulan ILIKE p_bulan LIMIT 1;
    IF NOT FOUND THEN
         SELECT * INTO r_master FROM master_gaji WHERE grade = v_grade LIMIT 1;
    END IF;

    SELECT COALESCE(kasbon, 0), COALESCE(penyesuaian_bonus, 0) 
    INTO v_kasbon, v_penyesuaian 
    FROM penyesuaian_gaji_pabrik 
    WHERE kode = p_kode AND bulan = p_bulan;

    v_gapok := COALESCE(r_master.gaji_pokok, 0);
    v_u_m := COALESCE(r_master.uang_makan, 0);
    v_u_k := COALESCE(r_master.uang_kehadiran, 0);
    v_bonus := COALESCE(r_master.bonus, 0);
    v_gaji_lembur := v_lembur * COALESCE(r_master.lembur, 0);

    v_total := v_gapok + v_u_m + v_u_k + v_bonus + v_gaji_lembur + COALESCE(v_penyesuaian, 0) - COALESCE(v_kasbon, 0);

    -- 4. Update Report
    UPDATE public.laporan_bulanan_staff_pabrik
    SET 
        h = v_h,
        set_h = v_set_h,
        lp = v_lp,
        tm = v_tm,
        lembur = v_lembur,
        i_b = v_i_b,
        i_tb = v_i_tb,
        s_b = v_s_b,
        s_tb = v_s_tb,
        t_b = v_t_b,
        t_tb = v_t_tb,
        gapok = v_gapok,
        gaji_lembur = v_gaji_lembur,
        u_m = v_u_m,
        u_k = v_u_k,
        uang_bonus = v_bonus,
        kasbon = COALESCE(v_kasbon, 0),
        penyesuaian_bonus = COALESCE(v_penyesuaian, 0),
        hasil_gaji = v_total,
        updated_at = NOW()
    WHERE bulan = p_bulan AND kode = p_kode;

END;
$function$;

-- 3. TRIGGER: Auto-Recalc on Presensi Change
CREATE OR REPLACE FUNCTION trigger_recalc_staff_attendance()
RETURNS TRIGGER AS $$
DECLARE
    t_bulan TEXT; t_kode TEXT;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        t_bulan := OLD.bulan; t_kode := OLD.kode;
    ELSE
        t_bulan := NEW.bulan; t_kode := NEW.kode;
    END IF;

    PERFORM public.recalc_laporan_bulanan_staff(t_bulan, t_kode);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_recalc_staff ON public.presensi_harian_staff_pabrik;
CREATE TRIGGER trg_auto_recalc_staff
AFTER INSERT OR UPDATE OR DELETE ON public.presensi_harian_staff_pabrik
FOR EACH ROW EXECUTE FUNCTION trigger_recalc_staff_attendance();

-- 4. BATCH FUNCTION (For "Hitung Ulang" Button)
CREATE OR REPLACE FUNCTION public.recalc_all_staff_monthly(p_bulan TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    rec RECORD;
    v_count INT := 0;
BEGIN
    FOR rec IN 
        SELECT DISTINCT kode FROM presensi_harian_staff_pabrik WHERE bulan = p_bulan
        UNION
        SELECT kode FROM data_karyawan_staff_pabrik WHERE bulan = p_bulan
    LOOP
        PERFORM public.recalc_laporan_bulanan_staff(p_bulan, rec.kode);
        v_count := v_count + 1;
    END LOOP;
    
    RETURN 'Berhasil menghitung ulang ' || v_count || ' data staff.';
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_laporan_bulanan_staff(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalc_all_staff_monthly(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload config';
