-- [V40] FIX GAPOK LOGIC: Gapok = (H + LP + TM) * Rate
-- LP dan TM tetap dibayar gapoknya, tapi memotong tunjangan.

CREATE OR REPLACE FUNCTION public.calculate_monthly_report_v40(p_bulan TEXT, p_kode TEXT, p_perusahaan TEXT, p_target_periode TEXT)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    -- Variabel Metadata
    v_nama TEXT; v_grade_p1 TEXT; v_grade_p2 TEXT; v_divisi TEXT; v_keluar_masuk TEXT; v_current_grade TEXT;
    
    -- Variabel Presensi
    v_h NUMERIC := 0; v_set_h NUMERIC := 0; v_s_b INT := 0; v_s_tb INT := 0;
    v_i_b INT := 0; v_i_tb INT := 0; v_t_b INT := 0; v_t_tb INT := 0;
    v_lp INT := 0; v_tm INT := 0; v_lembur NUMERIC := 0;

    -- Variabel Master Gaji
    v_master_gapok NUMERIC := 0; v_master_lembur NUMERIC := 0; v_master_makan NUMERIC := 0; v_master_hadir NUMERIC := 0; v_master_bonus NUMERIC := 0;

    -- Variabel Konfigurasi
    v_config_hari NUMERIC; v_pembagi_bulan NUMERIC;

    -- Variabel Hasil Hitung
    v_hasil_gapok NUMERIC := 0; v_hasil_lembur NUMERIC := 0; v_hasil_makan NUMERIC := 0; v_hasil_hadir NUMERIC := 0; v_hasil_bonus NUMERIC := 0; v_total_gaji NUMERIC := 0;
    v_kasbon NUMERIC := 0; v_penyesuaian NUMERIC := 0;

    -- Variabel Bantuan
    v_denda_flat NUMERIC := 0; v_potongan_makan NUMERIC := 0; v_potongan_hadir NUMERIC := 0; v_total_pelanggaran INT := 0; v_total_pengurang_hari INT := 0;

    -- Variabel Streak Logic
    v_current_status TEXT := ''; v_current_streak INT := 0; v_kehadiran_clean TEXT; r RECORD;
    v_p1_lp INT := 0; v_p1_tm INT := 0;

BEGIN
    -- [CEK BORONGAN] Jangan hitung jika perusahaan mengandung kata BORONGAN
    IF UPPER(p_perusahaan) LIKE '%BORONGAN%' THEN
        RETURN 'Skip Borongan';
    END IF;

    -- 1. Ambil Metadata Karyawan
    SELECT nama, grade_p1, grade_p2, divisi, keterangan INTO v_nama, v_grade_p1, v_grade_p2, v_divisi, v_keluar_masuk
    FROM public.karyawan_pabrik WHERE kode = p_kode AND bulan = p_bulan LIMIT 1;

    IF v_nama IS NULL THEN
        SELECT nama, grade_p1, grade_p2, divisi, keterangan INTO v_nama, v_grade_p1, v_grade_p2, v_divisi, v_keluar_masuk
        FROM public.presensi_harian_pabrik WHERE kode = p_kode AND bulan = p_bulan ORDER BY tanggal DESC LIMIT 1;
    END IF;

    v_current_grade := CASE WHEN p_target_periode = 'Periode 1' THEN v_grade_p1 ELSE v_grade_p2 END;

    -- 2. Hitung Presensi (Streak Logic)
    FOR r IN 
        SELECT kehadiran, lembur 
        FROM public.presensi_harian_pabrik 
        WHERE kode = p_kode AND bulan = p_bulan AND periode = p_target_periode AND perusahaan = p_perusahaan
        ORDER BY tanggal ASC
    LOOP
        v_kehadiran_clean := UPPER(TRIM(r.kehadiran));
        
        -- Hitung Agregat Dasar
        IF v_kehadiran_clean IN ('H', '1', 'HADIR') THEN v_h := v_h + 1; END IF;
        IF v_kehadiran_clean IN ('0.5', 'SETENGAH') THEN v_set_h := v_set_h + 1; END IF;
        IF v_kehadiran_clean = 'LP' THEN v_lp := v_lp + 1; END IF;
        IF v_kehadiran_clean = 'TM' THEN v_tm := v_tm + 1; END IF;
        
        IF r.lembur IS NOT NULL AND r.lembur != '' AND r.lembur != '0' THEN
            BEGIN v_lembur := v_lembur + CAST(REGEXP_REPLACE(r.lembur, '[^0-9\.]', '', 'g') AS NUMERIC); EXCEPTION WHEN OTHERS THEN NULL; END;
        END IF;

        -- Streak Logic (S, I, T)
        IF v_kehadiran_clean IN ('I', 'S', 'A', 'T') THEN
            IF v_kehadiran_clean = 'A' THEN v_kehadiran_clean := 'T'; END IF;
            IF v_kehadiran_clean = v_current_status THEN v_current_streak := v_current_streak + 1;
            ELSE
                IF v_current_status = 'I' THEN IF v_current_streak > 1 THEN v_i_b := v_i_b + v_current_streak; ELSE v_i_tb := v_i_tb + v_current_streak; END IF; END IF;
                IF v_current_status = 'S' THEN IF v_current_streak > 1 THEN v_s_b := v_s_b + v_current_streak; ELSE v_s_tb := v_s_tb + v_current_streak; END IF; END IF;
                IF v_current_status = 'T' THEN IF v_current_streak > 1 THEN v_t_b := v_t_b + v_current_streak; ELSE v_t_tb := v_t_tb + v_current_streak; END IF; END IF;
                v_current_status := v_kehadiran_clean; v_current_streak := 1;
            END IF;
        ELSE
            IF v_current_status = 'I' THEN IF v_current_streak > 1 THEN v_i_b := v_i_b + v_current_streak; ELSE v_i_tb := v_i_tb + v_current_streak; END IF; END IF;
            IF v_current_status = 'S' THEN IF v_current_streak > 1 THEN v_s_b := v_s_b + v_current_streak; ELSE v_s_tb := v_s_tb + v_current_streak; END IF; END IF;
            IF v_current_status = 'T' THEN IF v_current_streak > 1 THEN v_t_b := v_t_b + v_current_streak; ELSE v_t_tb := v_t_tb + v_current_streak; END IF; END IF;
            v_current_status := ''; v_current_streak := 0;
        END IF;
    END LOOP;
    
    IF v_current_status = 'I' THEN IF v_current_streak > 1 THEN v_i_b := v_i_b + v_current_streak; ELSE v_i_tb := v_i_tb + v_current_streak; END IF; END IF;
    IF v_current_status = 'S' THEN IF v_current_streak > 1 THEN v_s_b := v_s_b + v_current_streak; ELSE v_s_tb := v_s_tb + v_current_streak; END IF; END IF;
    IF v_current_status = 'T' THEN IF v_current_streak > 1 THEN v_t_b := v_t_b + v_current_streak; ELSE v_t_tb := v_t_tb + v_current_streak; END IF; END IF;

    -- 3. Ambil Master Gaji
    SELECT gaji_harian, lembur, uang_makan, uang_kehadiran, bonus INTO v_master_gapok, v_master_lembur, v_master_makan, v_master_hadir, v_master_bonus
    FROM public.master_gaji WHERE grade = v_current_grade AND bulan = p_bulan LIMIT 1;

    IF v_master_gapok IS NULL THEN
        SELECT gaji_harian, lembur, uang_makan, uang_kehadiran, bonus INTO v_master_gapok, v_master_lembur, v_master_makan, v_master_hadir, v_master_bonus
        FROM public.master_gaji WHERE grade = v_current_grade ORDER BY created_at DESC LIMIT 1;
    END IF;

    v_master_gapok := COALESCE(v_master_gapok, 0); v_master_lembur := COALESCE(v_master_lembur, 0); v_master_makan := COALESCE(v_master_makan, 0); v_master_hadir := COALESCE(v_master_hadir, 0); v_master_bonus := COALESCE(v_master_bonus, 0);

    -- 4. Ambil Konfigurasi Hari Kerja
    SELECT jumlah_hari_kerja INTO v_config_hari FROM public.konfigurasi_gaji_bulanan WHERE bulan = p_bulan LIMIT 1;
    IF v_config_hari IS NULL OR v_config_hari = 0 THEN
        v_pembagi_bulan := v_h + v_set_h;
        IF v_pembagi_bulan = 0 THEN v_pembagi_bulan := 26; END IF;
    ELSE
        v_pembagi_bulan := v_config_hari;
    END IF;

    -- 5. Hitung Gaji Pokok & Lembur (Harian)
    -- [V40 FIX]: Gapok = (H + LP + TM) * Rate + (Set.H * Rate/2)
    v_hasil_gapok := ((v_h + v_lp + v_tm) * v_master_gapok) + (v_set_h * (v_master_gapok / 2));
    v_hasil_lembur := v_lembur * v_master_lembur;

    -- 6. Hitung Tunjangan (Hanya di Periode 2)
    IF p_target_periode = 'Periode 2' THEN
        SELECT lp, tm INTO v_p1_lp, v_p1_tm FROM public.laporan_bulanan_pabrik WHERE kode = p_kode AND bulan = p_bulan AND periode = 'Periode 1' AND perusahaan = p_perusahaan LIMIT 1;
        v_p1_lp := COALESCE(v_p1_lp, 0); v_p1_tm := COALESCE(v_p1_tm, 0);

        v_total_pelanggaran := v_s_b + v_i_b + v_t_b + v_s_tb + v_i_tb + v_t_tb;
        v_total_pengurang_hari := v_lp + v_p1_lp + v_tm + v_p1_tm; 

        v_denda_flat := public.calculate_progressive_penalty(v_s_b) + public.calculate_progressive_penalty(v_i_b) + public.calculate_progressive_penalty(v_t_b) + ((v_s_tb + v_i_tb + v_t_tb) * 10000);
        v_potongan_makan := (v_master_makan / v_pembagi_bulan) * v_total_pengurang_hari;
        v_potongan_hadir := (v_master_hadir / v_pembagi_bulan) * v_total_pengurang_hari;

        v_hasil_makan := GREATEST(0, v_master_makan - v_denda_flat - v_potongan_makan);
        v_hasil_hadir := GREATEST(0, v_master_hadir - v_denda_flat - v_potongan_hadir);

        IF v_keluar_masuk IS NOT NULL AND v_keluar_masuk != '' THEN v_hasil_bonus := 0;
        ELSIF v_total_pelanggaran > 0 THEN v_hasil_bonus := 0;
        ELSIF v_total_pengurang_hari > 0 THEN v_hasil_bonus := v_master_bonus / 2;
        ELSE v_hasil_bonus := v_master_bonus; END IF;
    ELSE
        v_hasil_makan := 0; v_hasil_hadir := 0; v_hasil_bonus := 0;
    END IF;

    -- 7. Ambil Penyesuaian & Kasbon
    SELECT penyesuaian_bonus, kasbon INTO v_penyesuaian, v_kasbon FROM public.penyesuaian_gaji_pabrik WHERE kode = p_kode AND bulan = p_bulan AND periode = p_target_periode AND perusahaan = p_perusahaan LIMIT 1;
    v_penyesuaian := COALESCE(v_penyesuaian, 0); v_kasbon := COALESCE(v_kasbon, 0);

    -- 8. Total Akhir
    v_total_gaji := v_hasil_gapok + v_hasil_lembur + v_hasil_makan + v_hasil_hadir + v_hasil_bonus + v_penyesuaian - v_kasbon;

    -- 9. Upsert ke Laporan
    INSERT INTO public.laporan_bulanan_pabrik (
        bulan, periode, perusahaan, kode, nama, grade_p1, grade_p2, divisi,
        h, i_b, i_tb, s_b, s_tb, t_b, t_tb, set_h, lp, tm, lembur,
        gapok, gaji_lembur, u_m, u_k, uang_bonus, kasbon, penyesuaian_bonus, hasil_gaji,
        keterangan, keluar_masuk, updated_at
    )
    VALUES (
        p_bulan, p_target_periode, p_perusahaan, p_kode, v_nama, v_grade_p1, v_grade_p2, v_divisi,
        v_h, v_i_b, v_i_tb, v_s_b, v_s_tb, v_t_b, v_t_tb, v_set_h, v_lp, v_tm, v_lembur,
        v_hasil_gapok, v_hasil_lembur, v_hasil_makan, v_hasil_hadir, v_hasil_bonus, v_kasbon, v_penyesuaian, v_total_gaji,
        'Auto-calculated V40', v_keluar_masuk, NOW()
    )
    ON CONFLICT (bulan, periode, kode) DO UPDATE SET
        nama = EXCLUDED.nama, grade_p1 = EXCLUDED.grade_p1, grade_p2 = EXCLUDED.grade_p2, divisi = EXCLUDED.divisi,
        h = EXCLUDED.h, i_b = EXCLUDED.i_b, i_tb = EXCLUDED.i_tb, s_b = EXCLUDED.s_b, s_tb = EXCLUDED.s_tb, t_b = EXCLUDED.t_b, t_tb = EXCLUDED.t_tb, set_h = EXCLUDED.set_h, lp = EXCLUDED.lp, tm = EXCLUDED.tm, lembur = EXCLUDED.lembur,
        gapok = EXCLUDED.gapok, gaji_lembur = EXCLUDED.gaji_lembur, u_m = EXCLUDED.u_m, u_k = EXCLUDED.u_k, uang_bonus = EXCLUDED.uang_bonus,
        kasbon = EXCLUDED.kasbon, penyesuaian_bonus = EXCLUDED.penyesuaian_bonus, hasil_gaji = EXCLUDED.hasil_gaji,
        keterangan = EXCLUDED.keterangan, keluar_masuk = EXCLUDED.keluar_masuk, updated_at = NOW();

    RETURN 'Success V40';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calculate_monthly_report_v40(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
NOTIFY pgrst, 'reload config';
