-- FIX: AMBIGUOUS COLUMN REFERENCE "LEMBUR"
-- Menambahkan alias tabel (ph, ph_sub, dll) pada semua query untuk menghindari ambiguitas dengan variabel.

CREATE OR REPLACE FUNCTION generate_laporan_bulanan_proporsional(p_bulan TEXT)
RETURNS TEXT AS $$
DECLARE
    v_count INT := 0;
    rec_presensi RECORD;
    rec_total_gaji RECORD;
    rec_karyawan RECORD;
    
    v_total_h_all NUMERIC; v_total_seth_all NUMERIC; v_total_lembur_all NUMERIC; v_total_days_all NUMERIC;
    v_h NUMERIC; v_set_h NUMERIC; v_lp INT; v_tm INT; v_lembur NUMERIC; v_b INT;
    v_streak_s JSONB; v_streak_i JSONB; v_streak_t JSONB;
    v_gapok NUMERIC; v_gaji_lembur NUMERIC; v_uk NUMERIC; v_um NUMERIC; v_bonus NUMERIC; v_kasbon NUMERIC; v_penyesuaian NUMERIC; v_hasil_gaji NUMERIC;
    v_ratio_gapok NUMERIC; v_ratio_lembur NUMERIC; v_ratio_allowance NUMERIC;

BEGIN
    -- Hapus data lama untuk bulan ini
    DELETE FROM public.laporan_bulanan_pabrik_garut WHERE bulan = p_bulan;

    -- Loop per Karyawan + Perusahaan
    FOR rec_presensi IN 
        SELECT 
            ph.kode, ph.perusahaan, ph.periode,
            COUNT(CASE WHEN ph.kehadiran IN ('H', 'Hadir', '1') THEN 1 END) as h_count,
            COUNT(CASE WHEN ph.kehadiran IN ('LP') THEN 1 END) as lp_count,
            COUNT(CASE WHEN ph.kehadiran IN ('TM') THEN 1 END) as tm_count,
            COUNT(CASE WHEN ph.kehadiran IN ('B') THEN 1 END) as b_count,
            SUM(CASE WHEN ph.kehadiran ~ '^[0-9\.]+$' AND ph.kehadiran NOT IN ('1') THEN CAST(ph.kehadiran AS NUMERIC) ELSE 0 END) as seth_sum,
            SUM(CASE WHEN ph.lembur ~ '^[0-9\.]+$' THEN CAST(ph.lembur AS NUMERIC) ELSE 0 END) as lembur_sum,
            MAX(CASE WHEN ph.keterangan = 'libur pribadi' THEN 2 WHEN ph.keterangan = 'libur perusahaan' THEN 1 ELSE 0 END) as ket_priority
        FROM public.presensi_harian_pabrik_garut ph
        WHERE ph.bulan = p_bulan
        GROUP BY ph.kode, ph.perusahaan, ph.periode
    LOOP
        -- Ambil Data Master & Total Gaji (Wallet)
        SELECT * INTO rec_karyawan FROM public.data_karyawan_pabrik_garut k WHERE k.kode = rec_presensi.kode AND k.bulan = p_bulan LIMIT 1;
        SELECT * INTO rec_total_gaji FROM public.total_gaji_pabrik_garut tg WHERE tg.kode = rec_presensi.kode AND tg.bulan = p_bulan AND tg.periode = rec_presensi.periode LIMIT 1;

        -- Hitung Total Global (Denominator) - Pakai Alias ph_sub
        SELECT 
            COUNT(CASE WHEN ph_sub.kehadiran IN ('H', 'Hadir', '1') THEN 1 END),
            SUM(CASE WHEN ph_sub.kehadiran ~ '^[0-9\.]+$' AND ph_sub.kehadiran NOT IN ('1') THEN CAST(ph_sub.kehadiran AS NUMERIC) ELSE 0 END),
            SUM(CASE WHEN ph_sub.lembur ~ '^[0-9\.]+$' THEN CAST(ph_sub.lembur AS NUMERIC) ELSE 0 END)
        INTO v_total_h_all, v_total_seth_all, v_total_lembur_all
        FROM public.presensi_harian_pabrik_garut ph_sub
        WHERE ph_sub.kode = rec_presensi.kode AND ph_sub.bulan = p_bulan AND ph_sub.periode = rec_presensi.periode;

        -- Hitung Total Hari Kerja (Untuk rasio allowance)
        IF rec_presensi.periode = 'Periode 2' THEN
             SELECT (COUNT(CASE WHEN ph_days.kehadiran IN ('H', 'Hadir', '1') THEN 1 END) + SUM(CASE WHEN ph_days.kehadiran ~ '^[0-9\.]+$' AND ph_days.kehadiran NOT IN ('1') THEN CAST(ph_days.kehadiran AS NUMERIC) ELSE 0 END))
             INTO v_total_days_all
             FROM public.presensi_harian_pabrik_garut ph_days WHERE ph_days.kode = rec_presensi.kode AND ph_days.bulan = p_bulan;
        ELSE
             v_total_days_all := (v_total_h_all + v_total_seth_all);
        END IF;

        -- Assign Variables
        v_h := rec_presensi.h_count; 
        v_set_h := rec_presensi.seth_sum; 
        v_lp := rec_presensi.lp_count; 
        v_tm := rec_presensi.tm_count; 
        v_b := rec_presensi.b_count; 
        v_lembur := rec_presensi.lembur_sum;

        -- Hitung Streak (Hanya Periode 2)
        IF rec_presensi.periode = 'Periode 2' THEN
            v_streak_s := calculate_streak_per_company(p_bulan, rec_presensi.kode, rec_presensi.perusahaan, 'S');
            v_streak_i := calculate_streak_per_company(p_bulan, rec_presensi.kode, rec_presensi.perusahaan, 'I');
            v_streak_t := calculate_streak_per_company(p_bulan, rec_presensi.kode, rec_presensi.perusahaan, 'T');
        ELSE
            v_streak_s := '{"b": 0, "tb": 0}'::jsonb; v_streak_i := '{"b": 0, "tb": 0}'::jsonb; v_streak_t := '{"b": 0, "tb": 0}'::jsonb;
        END IF;

        -- Hitung Rasio
        IF (v_total_h_all + v_total_seth_all) > 0 THEN v_ratio_gapok := (v_h + v_set_h) / (v_total_h_all + v_total_seth_all); ELSE v_ratio_gapok := 0; END IF;
        IF v_total_lembur_all > 0 THEN v_ratio_lembur := v_lembur / v_total_lembur_all; ELSE v_ratio_lembur := 0; END IF;

        IF rec_presensi.periode = 'Periode 2' AND v_total_days_all > 0 THEN
             DECLARE v_days_pt_total NUMERIC;
             BEGIN
                 SELECT (COUNT(CASE WHEN ph_pt.kehadiran IN ('H', 'Hadir', '1') THEN 1 END) + SUM(CASE WHEN ph_pt.kehadiran ~ '^[0-9\.]+$' AND ph_pt.kehadiran NOT IN ('1') THEN CAST(ph_pt.kehadiran AS NUMERIC) ELSE 0 END))
                 INTO v_days_pt_total
                 FROM public.presensi_harian_pabrik_garut ph_pt WHERE ph_pt.kode = rec_presensi.kode AND ph_pt.bulan = p_bulan AND ph_pt.perusahaan = rec_presensi.perusahaan;
                 v_ratio_allowance := v_days_pt_total / v_total_days_all;
             END;
        ELSE
             v_ratio_allowance := 0;
        END IF;

        -- Hitung Nominal Proporsional
        v_gapok := COALESCE(rec_total_gaji.gapok, 0) * v_ratio_gapok;
        v_gaji_lembur := COALESCE(rec_total_gaji.gaji_lembur, 0) * v_ratio_lembur;
        
        IF rec_presensi.periode = 'Periode 2' THEN
            v_uk := COALESCE(rec_total_gaji.u_k, 0) * v_ratio_allowance;
            v_um := COALESCE(rec_total_gaji.u_m, 0) * v_ratio_allowance;
            v_bonus := COALESCE(rec_total_gaji.uang_bonus, 0) * v_ratio_allowance;
            v_kasbon := COALESCE(rec_total_gaji.kasbon, 0) * v_ratio_allowance;
            v_penyesuaian := COALESCE(rec_total_gaji.penyesuaian_bonus, 0) * v_ratio_allowance;
        ELSE
            v_uk := 0; v_um := 0; v_bonus := 0; v_kasbon := 0; v_penyesuaian := 0;
        END IF;

        v_hasil_gaji := v_gapok + v_gaji_lembur + v_uk + v_um + v_bonus + v_penyesuaian - v_kasbon;

        -- Insert ke Laporan
        INSERT INTO public.laporan_bulanan_pabrik_garut (
            bulan, periode, kode, nama, perusahaan, bagian, divisi, grade, grade_p1, grade_p2,
            h, b, i_b, i_tb, s_b, s_tb, t_b, t_tb, set_h, lp, tm, lembur,
            gapok, gaji_lembur, u_m, u_k, uang_bonus, kasbon, penyesuaian_bonus, hasil_gaji,
            keterangan, keluar_masuk, created_at, updated_at
        ) VALUES (
            p_bulan, rec_presensi.periode, rec_presensi.kode, rec_karyawan.nama, rec_presensi.perusahaan, rec_karyawan.bagian, rec_karyawan.divisi,
            rec_total_gaji.grade, rec_karyawan.grade_p1, rec_karyawan.grade_p2,
            v_h, v_b, (v_streak_i->>'b')::int, (v_streak_i->>'tb')::int, (v_streak_s->>'b')::int, (v_streak_s->>'tb')::int, (v_streak_t->>'b')::int, (v_streak_t->>'tb')::int,
            v_set_h, v_lp, v_tm, v_lembur,
            v_gapok, v_gaji_lembur, v_um, v_uk, v_bonus, v_kasbon, v_penyesuaian, v_hasil_gaji,
            CASE WHEN rec_presensi.ket_priority = 2 THEN 'libur pribadi' WHEN rec_presensi.ket_priority = 1 THEN 'libur perusahaan' ELSE NULL END,
            rec_total_gaji.keluar_masuk, NOW(), NOW()
        );
        v_count := v_count + 1;
    END LOOP;
    RETURN 'Laporan Proporsional Berhasil: ' || v_count || ' baris data.';
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION generate_laporan_bulanan_proporsional(TEXT) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload config';
