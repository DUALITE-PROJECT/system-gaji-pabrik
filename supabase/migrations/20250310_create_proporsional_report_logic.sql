-- =================================================================
-- V16: LOGIKA LAPORAN BULANAN PROPORSIONAL (MULTI-COMPANY)
-- =================================================================

-- 1. Helper Function: Hitung Streak per Perusahaan
CREATE OR REPLACE FUNCTION calculate_streak_per_company(
    p_bulan TEXT, 
    p_kode TEXT, 
    p_perusahaan TEXT, 
    p_type TEXT -- 'S', 'I', or 'T'
)
RETURNS JSONB AS $$
DECLARE
    rec RECORD;
    v_streak INT := 0;
    v_berurut INT := 0;
    v_tidak_berurut INT := 0;
BEGIN
    FOR rec IN 
        SELECT kehadiran 
        FROM presensi_harian_pabrik_garut 
        WHERE bulan = p_bulan AND kode = p_kode AND perusahaan = p_perusahaan
        ORDER BY tanggal ASC
    LOOP
        IF rec.kehadiran = p_type THEN
            v_streak := v_streak + 1;
        ELSIF rec.kehadiran IN ('M', 'TM', 'Minggu', 'Tanggal Merah') THEN
            -- Do nothing, streak continues
            NULL;
        ELSE
            -- Streak broken
            IF v_streak >= 2 THEN
                v_berurut := v_berurut + v_streak;
            ELSIF v_streak = 1 THEN
                v_tidak_berurut := v_tidak_berurut + 1;
            END IF;
            v_streak := 0;
        END IF;
    END LOOP;

    -- Final check
    IF v_streak >= 2 THEN
        v_berurut := v_berurut + v_streak;
    ELSIF v_streak = 1 THEN
        v_tidak_berurut := v_tidak_berurut + 1;
    END IF;

    RETURN jsonb_build_object('b', v_berurut, 'tb', v_tidak_berurut);
END;
$$ LANGUAGE plpgsql;


-- 2. Main Generation Function
CREATE OR REPLACE FUNCTION generate_laporan_bulanan_proporsional(p_bulan TEXT)
RETURNS TEXT AS $$
DECLARE
    v_count INT := 0;
    
    -- Record holders
    rec_presensi RECORD;
    rec_total_gaji RECORD;
    rec_karyawan RECORD;
    
    -- Denominators (Total satu karyawan di semua PT)
    v_total_h_all NUMERIC;
    v_total_seth_all NUMERIC;
    v_total_lembur_all NUMERIC;
    v_total_days_all NUMERIC; -- (h + seth)
    
    -- Local Stats (Per PT)
    v_h NUMERIC;
    v_set_h NUMERIC;
    v_lp INT;
    v_tm INT;
    v_lembur NUMERIC;
    v_b INT;
    
    -- Streaks
    v_streak_s JSONB;
    v_streak_i JSONB;
    v_streak_t JSONB;
    
    -- Financials
    v_gapok NUMERIC;
    v_gaji_lembur NUMERIC;
    v_uk NUMERIC;
    v_um NUMERIC;
    v_bonus NUMERIC;
    v_kasbon NUMERIC;
    v_penyesuaian NUMERIC;
    v_hasil_gaji NUMERIC;

    -- Ratios
    v_ratio_gapok NUMERIC;
    v_ratio_lembur NUMERIC;
    v_ratio_allowance NUMERIC;

BEGIN
    -- A. BERSIHKAN DATA LAMA (Untuk bulan ini)
    DELETE FROM public.laporan_bulanan_pabrik_garut WHERE bulan = p_bulan;

    -- B. LOOP SETIAP KOMBINASI UNIK (Kode + Perusahaan + Periode) DARI PRESENSI
    FOR rec_presensi IN 
        SELECT 
            kode, perusahaan, periode,
            -- Agregasi Kehadiran Dasar
            COUNT(CASE WHEN kehadiran IN ('H', 'Hadir', '1') THEN 1 END) as h_count,
            COUNT(CASE WHEN kehadiran IN ('LP') THEN 1 END) as lp_count,
            COUNT(CASE WHEN kehadiran IN ('TM') THEN 1 END) as tm_count,
            COUNT(CASE WHEN kehadiran IN ('B') THEN 1 END) as b_count,
            -- Sum Numeric Fields (Set H & Lembur)
            SUM(CASE WHEN kehadiran ~ '^[0-9\.]+$' AND kehadiran NOT IN ('1') THEN CAST(kehadiran AS NUMERIC) ELSE 0 END) as seth_sum,
            SUM(CASE WHEN lembur ~ '^[0-9\.]+$' THEN CAST(lembur AS NUMERIC) ELSE 0 END) as lembur_sum,
            -- Get Keterangan (Priority: Libur Pribadi > Libur Perusahaan)
            MAX(CASE WHEN keterangan = 'libur pribadi' THEN 2 WHEN keterangan = 'libur perusahaan' THEN 1 ELSE 0 END) as ket_priority
        FROM public.presensi_harian_pabrik_garut
        WHERE bulan = p_bulan
        GROUP BY kode, perusahaan, periode
    LOOP
        -- 1. Ambil Data Master Karyawan (Nama, Grade, Divisi)
        SELECT * INTO rec_karyawan 
        FROM public.data_karyawan_pabrik_garut 
        WHERE kode = rec_presensi.kode AND bulan = p_bulan 
        LIMIT 1;

        -- 2. Ambil Data Total Gaji (Sumber Dana)
        -- Note: Total Gaji is per-period in the table structure
        SELECT * INTO rec_total_gaji 
        FROM public.total_gaji_pabrik_garut 
        WHERE kode = rec_presensi.kode AND bulan = p_bulan AND periode = rec_presensi.periode
        LIMIT 1;

        -- 3. Hitung Denominator (Total Aktivitas Karyawan Ini di SEMUA PT pada Periode Ini)
        SELECT 
            COUNT(CASE WHEN kehadiran IN ('H', 'Hadir', '1') THEN 1 END),
            SUM(CASE WHEN kehadiran ~ '^[0-9\.]+$' AND kehadiran NOT IN ('1') THEN CAST(kehadiran AS NUMERIC) ELSE 0 END),
            SUM(CASE WHEN lembur ~ '^[0-9\.]+$' THEN CAST(lembur AS NUMERIC) ELSE 0 END)
        INTO v_total_h_all, v_total_seth_all, v_total_lembur_all
        FROM public.presensi_harian_pabrik_garut
        WHERE kode = rec_presensi.kode AND bulan = p_bulan AND periode = rec_presensi.periode;

        -- Denominator untuk Tunjangan (P1 + P2) khusus Periode 2
        IF rec_presensi.periode = 'Periode 2' THEN
             SELECT 
                (COUNT(CASE WHEN kehadiran IN ('H', 'Hadir', '1') THEN 1 END) + 
                 SUM(CASE WHEN kehadiran ~ '^[0-9\.]+$' AND kehadiran NOT IN ('1') THEN CAST(kehadiran AS NUMERIC) ELSE 0 END))
             INTO v_total_days_all
             FROM public.presensi_harian_pabrik_garut
             WHERE kode = rec_presensi.kode AND bulan = p_bulan; -- All periods
        ELSE
             v_total_days_all := (v_total_h_all + v_total_seth_all);
        END IF;

        -- 4. Hitung Statistik Lokal (Perusahaan Ini)
        v_h := rec_presensi.h_count;
        v_set_h := rec_presensi.seth_sum;
        v_lp := rec_presensi.lp_count;
        v_tm := rec_presensi.tm_count;
        v_b := rec_presensi.b_count;
        v_lembur := rec_presensi.lembur_sum;

        -- Hitung Streaks (Hanya Periode 2)
        IF rec_presensi.periode = 'Periode 2' THEN
            v_streak_s := calculate_streak_per_company(p_bulan, rec_presensi.kode, rec_presensi.perusahaan, 'S');
            v_streak_i := calculate_streak_per_company(p_bulan, rec_presensi.kode, rec_presensi.perusahaan, 'I');
            v_streak_t := calculate_streak_per_company(p_bulan, rec_presensi.kode, rec_presensi.perusahaan, 'T');
        ELSE
            v_streak_s := '{"b": 0, "tb": 0}'::jsonb;
            v_streak_i := '{"b": 0, "tb": 0}'::jsonb;
            v_streak_t := '{"b": 0, "tb": 0}'::jsonb;
        END IF;

        -- 5. HITUNG PROPORSIONAL NOMINAL
        -- Ratio Gapok: (H + SetH PT ini) / (Total H + SetH Semua PT)
        IF (v_total_h_all + v_total_seth_all) > 0 THEN
            v_ratio_gapok := (v_h + v_set_h) / (v_total_h_all + v_total_seth_all);
        ELSE
            v_ratio_gapok := 0;
        END IF;

        -- Ratio Lembur
        IF v_total_lembur_all > 0 THEN
            v_ratio_lembur := v_lembur / v_total_lembur_all;
        ELSE
            v_ratio_lembur := 0;
        END IF;

        -- Ratio Allowance (Based on Total Days Worked P1+P2)
        -- Jika Periode 1, Allowance = 0 (Sesuai aturan lama, dibayar di P2)
        IF rec_presensi.periode = 'Periode 2' AND v_total_days_all > 0 THEN
             -- Hitung kontribusi hari kerja PT ini (P1+P2)
             -- Query ulang untuk ambil total hari PT ini di P1+P2
             DECLARE v_days_pt_total NUMERIC;
             BEGIN
                 SELECT (COUNT(CASE WHEN kehadiran IN ('H', 'Hadir', '1') THEN 1 END) + 
                         SUM(CASE WHEN kehadiran ~ '^[0-9\.]+$' AND kehadiran NOT IN ('1') THEN CAST(kehadiran AS NUMERIC) ELSE 0 END))
                 INTO v_days_pt_total
                 FROM public.presensi_harian_pabrik_garut
                 WHERE kode = rec_presensi.kode AND bulan = p_bulan AND perusahaan = rec_presensi.perusahaan;
                 
                 v_ratio_allowance := v_days_pt_total / v_total_days_all;
             END;
        ELSE
             v_ratio_allowance := 0;
        END IF;

        -- Apply Ratios to Total Gaji Source
        -- Jika data total gaji tidak ada (belum dihitung), maka 0
        v_gapok := COALESCE(rec_total_gaji.gapok, 0) * v_ratio_gapok;
        v_gaji_lembur := COALESCE(rec_total_gaji.gaji_lembur, 0) * v_ratio_lembur;
        
        -- Komponen Periode 2
        IF rec_presensi.periode = 'Periode 2' THEN
            v_uk := COALESCE(rec_total_gaji.u_k, 0) * v_ratio_allowance;
            v_um := COALESCE(rec_total_gaji.u_m, 0) * v_ratio_allowance;
            v_bonus := COALESCE(rec_total_gaji.uang_bonus, 0) * v_ratio_allowance;
            
            -- Kasbon & Penyesuaian juga proporsional terhadap hari kerja
            v_kasbon := COALESCE(rec_total_gaji.kasbon, 0) * v_ratio_allowance;
            v_penyesuaian := COALESCE(rec_total_gaji.penyesuaian_bonus, 0) * v_ratio_allowance;
        ELSE
            v_uk := 0;
            v_um := 0;
            v_bonus := 0;
            v_kasbon := 0;
            v_penyesuaian := 0;
        END IF;

        -- Hitung Hasil Akhir Baris Ini
        v_hasil_gaji := v_gapok + v_gaji_lembur + v_uk + v_um + v_bonus + v_penyesuaian - v_kasbon;

        -- 6. INSERT KE LAPORAN BULANAN
        INSERT INTO public.laporan_bulanan_pabrik_garut (
            bulan, periode, kode, nama, perusahaan, bagian, divisi,
            grade, grade_p1, grade_p2,
            h, b, 
            i_b, i_tb, s_b, s_tb, t_b, t_tb, 
            set_h, lp, tm, lembur,
            gapok, gaji_lembur, u_m, u_k, uang_bonus, kasbon, penyesuaian_bonus, hasil_gaji,
            keterangan, keluar_masuk, created_at, updated_at
        ) VALUES (
            p_bulan,
            rec_presensi.periode,
            rec_presensi.kode,
            rec_karyawan.nama,       -- Dari Master
            rec_presensi.perusahaan, -- DARI PRESENSI (DIMENSI UTAMA)
            rec_karyawan.bagian,
            rec_karyawan.divisi,
            rec_total_gaji.grade,    -- Dari Total Gaji (Grade Aktif)
            rec_karyawan.grade_p1,
            rec_karyawan.grade_p2,
            v_h, v_b,
            (v_streak_i->>'b')::int, (v_streak_i->>'tb')::int,
            (v_streak_s->>'b')::int, (v_streak_s->>'tb')::int,
            (v_streak_t->>'b')::int, (v_streak_t->>'tb')::int,
            v_set_h, v_lp, v_tm, v_lembur,
            v_gapok, v_gaji_lembur, v_um, v_uk, v_bonus, v_kasbon, v_penyesuaian, v_hasil_gaji,
            -- Keterangan Logic
            CASE WHEN rec_presensi.ket_priority = 2 THEN 'libur pribadi' 
                 WHEN rec_presensi.ket_priority = 1 THEN 'libur perusahaan' 
                 ELSE NULL END,
            rec_total_gaji.keluar_masuk,
            NOW(), NOW()
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN 'Laporan Proporsional Berhasil: ' || v_count || ' baris data.';
END;
$$ LANGUAGE plpgsql;

-- Grant Access
GRANT EXECUTE ON FUNCTION generate_laporan_bulanan_proporsional(TEXT) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload config';
