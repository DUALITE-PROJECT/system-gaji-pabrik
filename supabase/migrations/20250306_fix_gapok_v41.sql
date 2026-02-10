-- =================================================================
-- MIGRATION: FIX GAPOK CALCULATION (V41)
-- Description: Memastikan Gapok menghitung (H + LP + TM + Setengah Hari)
-- =================================================================

CREATE OR REPLACE FUNCTION calculate_monthly_report_v41(
    p_bulan TEXT,
    p_kode TEXT,
    p_perusahaan TEXT,
    p_target_periode TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    -- Variabel Data Karyawan
    v_nama TEXT;
    v_grade_p1 TEXT;
    v_grade_p2 TEXT;
    v_divisi TEXT;
    v_status_karyawan TEXT;
    v_keterangan_karyawan TEXT;
    
    -- Variabel Master Gaji
    v_gaji_pokok NUMERIC := 0;
    v_gaji_harian NUMERIC := 0; -- Rate Harian
    v_gaji_lembur_per_jam NUMERIC := 0;
    v_uang_makan NUMERIC := 0;
    v_uang_kehadiran NUMERIC := 0;
    v_bonus_target NUMERIC := 0;
    
    -- Variabel Hitungan Absensi (Per Periode)
    v_h NUMERIC := 0;
    v_set_h NUMERIC := 0; -- Setengah Hari (0.5)
    v_s_b NUMERIC := 0;
    v_s_tb NUMERIC := 0;
    v_i_b NUMERIC := 0;
    v_i_tb NUMERIC := 0;
    v_t_b NUMERIC := 0;
    v_t_tb NUMERIC := 0;
    v_lp NUMERIC := 0; -- Libur Perusahaan
    v_tm NUMERIC := 0; -- Tanggal Merah
    v_lembur NUMERIC := 0; -- Jam Lembur
    
    -- Variabel Akumulasi (P1 + P2) untuk Bonus & Tunjangan
    v_total_h NUMERIC := 0;
    v_total_lp NUMERIC := 0;
    v_total_tm NUMERIC := 0;
    
    -- Variabel Hasil Uang
    v_hasil_gapok NUMERIC := 0;
    v_hasil_lembur NUMERIC := 0;
    v_hasil_makan NUMERIC := 0;
    v_hasil_kehadiran NUMERIC := 0;
    v_hasil_bonus NUMERIC := 0;
    v_penyesuaian_bonus NUMERIC := 0;
    v_kasbon NUMERIC := 0;
    v_total_gaji NUMERIC := 0;
    
    -- Helper
    v_grade_target TEXT;
    v_total_hari_gapok NUMERIC := 0;
    v_potongan_makan NUMERIC := 0;
    v_potongan_kehadiran NUMERIC := 0;
    v_denda_pelanggaran NUMERIC := 0;
    
    -- Multi PT Check
    v_count_minggu INT := 0;
    v_pt_tetap_count INT := 0;
    v_pt_borongan_count INT := 0;
    v_potongan_multi_pt NUMERIC := 0;

BEGIN
    -- 1. Ambil Data Karyawan
    SELECT nama, grade_p1, grade_p2, divisi, keterangan
    INTO v_nama, v_grade_p1, v_grade_p2, v_divisi, v_keterangan_karyawan
    FROM karyawan_pabrik
    WHERE kode = p_kode AND bulan = p_bulan
    LIMIT 1;

    IF v_nama IS NULL THEN
        -- Fallback jika tidak ada di master karyawan (ambil dari presensi)
        SELECT keterangan INTO v_nama 
        FROM presensi_harian_pabrik 
        WHERE kode = p_kode AND bulan = p_bulan LIMIT 1;
        v_nama := COALESCE(v_nama, 'Unknown');
    END IF;

    -- Tentukan Grade berdasarkan Periode
    IF p_target_periode = 'Periode 1' THEN
        v_grade_target := v_grade_p1;
    ELSE
        v_grade_target := v_grade_p2;
    END IF;

    -- 2. Ambil Master Gaji (Sesuai Grade & Bulan)
    SELECT 
        COALESCE(gaji_pokok, 0),
        COALESCE(gaji_harian, 0),
        COALESCE(lembur, 0),
        COALESCE(uang_makan, 0),
        COALESCE(uang_kehadiran, 0),
        COALESCE(bonus, 0)
    INTO 
        v_gaji_pokok, v_gaji_harian, v_gaji_lembur_per_jam, 
        v_uang_makan, v_uang_kehadiran, v_bonus_target
    FROM master_gaji
    WHERE grade = v_grade_target 
    AND (bulan ILIKE '%' || p_bulan || '%' OR p_bulan ILIKE '%' || bulan || '%')
    LIMIT 1;

    -- Fallback Gaji Harian jika 0 (Gunakan Rumus / 26)
    IF v_gaji_harian = 0 AND v_gaji_pokok > 0 THEN
        v_gaji_harian := v_gaji_pokok / 26;
    END IF;

    -- 3. Hitung Absensi (HANYA UNTUK PERIODE & PERUSAHAAN INI)
    -- Logic V39: Konversi kehadiran text ke numeric
    SELECT 
        COALESCE(SUM(CASE 
            WHEN kehadiran ~ '^[0-9\.]+$' THEN CAST(kehadiran AS NUMERIC)
            WHEN LOWER(kehadiran) IN ('h', 'hadir') THEN 1
            ELSE 0 
        END), 0),
        COALESCE(SUM(CASE 
            WHEN LOWER(kehadiran) IN ('0.5', 'setengah') THEN 1 
            ELSE 0 
        END), 0),
        COALESCE(SUM(CASE WHEN LOWER(kehadiran) = 'lp' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(kehadiran) = 'tm' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(kehadiran) IN ('s', 'sakit') AND LOWER(keterangan) LIKE '%berurut%' THEN 1 ELSE 0 END), 0), -- S Berurut
        COALESCE(SUM(CASE WHEN LOWER(kehadiran) IN ('s', 'sakit') AND (LOWER(keterangan) NOT LIKE '%berurut%' OR keterangan IS NULL) THEN 1 ELSE 0 END), 0), -- S TB
        COALESCE(SUM(CASE WHEN LOWER(kehadiran) IN ('i', 'izin') AND LOWER(keterangan) LIKE '%berurut%' THEN 1 ELSE 0 END), 0), -- I Berurut
        COALESCE(SUM(CASE WHEN LOWER(kehadiran) IN ('i', 'izin') AND (LOWER(keterangan) NOT LIKE '%berurut%' OR keterangan IS NULL) THEN 1 ELSE 0 END), 0), -- I TB
        COALESCE(SUM(CASE WHEN LOWER(kehadiran) IN ('a', 'alpha') AND LOWER(keterangan) LIKE '%berurut%' THEN 1 ELSE 0 END), 0), -- T Berurut
        COALESCE(SUM(CASE WHEN LOWER(kehadiran) IN ('a', 'alpha') AND (LOWER(keterangan) NOT LIKE '%berurut%' OR keterangan IS NULL) THEN 1 ELSE 0 END), 0), -- T TB
        COALESCE(SUM(CASE 
            WHEN lembur ~ '^[0-9\.]+$' THEN CAST(lembur AS NUMERIC)
            WHEN lembur ~ '^[0-9]+' THEN CAST(REGEXP_REPLACE(lembur, '[^0-9\.]', '', 'g') AS NUMERIC)
            ELSE 0 
        END), 0)
    INTO 
        v_h, v_set_h, v_lp, v_tm, 
        v_s_b, v_s_tb, v_i_b, v_i_tb, v_t_b, v_t_tb, 
        v_lembur
    FROM presensi_harian_pabrik
    WHERE kode = p_kode 
    AND bulan = p_bulan 
    AND periode = p_target_periode
    AND perusahaan = p_perusahaan;

    -- 4. HITUNG GAPOK (V41 FIX)
    -- Gapok = (Hadir + Libur Perusahaan + Tanggal Merah + (Setengah Hari * 0.5)) * Rate Harian
    -- Ini memastikan LP dan TM dibayar sebagai gaji pokok.
    v_total_hari_gapok := v_h + v_lp + v_tm + (v_set_h * 0.5);
    v_hasil_gapok := v_total_hari_gapok * v_gaji_harian;

    -- 5. Hitung Lembur
    v_hasil_lembur := v_lembur * v_gaji_lembur_per_jam;

    -- 6. Hitung Tunjangan & Bonus (HANYA DI PERIODE 2)
    IF p_target_periode = 'Periode 2' THEN
        
        -- Ambil Data Absensi Periode 1 (Untuk Akumulasi)
        DECLARE
            v_h_p1 NUMERIC := 0;
            v_lp_p1 NUMERIC := 0;
            v_tm_p1 NUMERIC := 0;
        BEGIN
            SELECT h, lp, tm INTO v_h_p1, v_lp_p1, v_tm_p1
            FROM laporan_bulanan_pabrik
            WHERE kode = p_kode AND bulan = p_bulan AND periode = 'Periode 1' AND perusahaan = p_perusahaan;
            
            v_total_h := v_h + COALESCE(v_h_p1, 0);
            v_total_lp := v_lp + COALESCE(v_lp_p1, 0);
            v_total_tm := v_tm + COALESCE(v_tm_p1, 0);
        END;

        -- A. Hitung Potongan LP & TM (Proporsional dari Uang Makan/Hadir)
        -- Rumus: (Master / 26) * Jumlah Hari Libur
        v_potongan_makan := (v_uang_makan / 26) * (v_total_lp + v_total_tm);
        v_potongan_kehadiran := (v_uang_kehadiran / 26) * (v_total_lp + v_total_tm);

        -- B. Hitung Denda Pelanggaran (S/I/T)
        -- Denda Berurut (Progresif): 10k, 12k, 14k...
        -- Denda Tidak Berurut (Flat): 10k
        DECLARE
            calc_denda NUMERIC := 0;
            i INT;
        BEGIN
            -- Sakit Berurut
            FOR i IN 1..v_s_b LOOP calc_denda := calc_denda + (10000 + (i-1)*2000); END LOOP;
            -- Izin Berurut
            FOR i IN 1..v_i_b LOOP calc_denda := calc_denda + (10000 + (i-1)*2000); END LOOP;
            -- Alpha Berurut
            FOR i IN 1..v_t_b LOOP calc_denda := calc_denda + (10000 + (i-1)*2000); END LOOP;
            
            -- Flat (TB)
            calc_denda := calc_denda + (v_s_tb * 10000);
            calc_denda := calc_denda + (v_i_tb * 10000);
            calc_denda := calc_denda + (v_t_tb * 10000);
            
            v_denda_pelanggaran := calc_denda;
        END;

        -- C. Hitung Final Uang Makan & Kehadiran
        v_hasil_makan := GREATEST(0, v_uang_makan - v_potongan_makan - v_denda_pelanggaran);
        v_hasil_kehadiran := GREATEST(0, v_uang_kehadiran - v_potongan_kehadiran - v_denda_pelanggaran);

        -- D. Hitung Bonus
        -- Syarat: Tidak ada pelanggaran (S/I/T/Setengah Hari) & Status Aktif
        IF (v_s_b + v_s_tb + v_i_b + v_i_tb + v_t_b + v_t_tb + v_set_h) > 0 THEN
            v_hasil_bonus := 0; -- Hangus jika ada pelanggaran
        ELSE
            v_hasil_bonus := v_bonus_target;
        END IF;

        -- E. Cek Potongan 5 Minggu (V39 Logic)
        -- Hanya jika bulan memiliki 5 hari minggu
        v_count_minggu := count_sundays_in_month(p_bulan);
        
        IF v_count_minggu = 5 THEN
            -- Cek Multi PT
            SELECT COUNT(DISTINCT perusahaan) INTO v_pt_tetap_count 
            FROM presensi_harian_pabrik 
            WHERE kode = p_kode AND bulan = p_bulan AND perusahaan != 'BORONGAN';
            
            SELECT COUNT(DISTINCT perusahaan) INTO v_pt_borongan_count 
            FROM presensi_harian_pabrik 
            WHERE kode = p_kode AND bulan = p_bulan AND perusahaan = 'BORONGAN';

            -- Hitung Potongan (1 Hari Gaji)
            -- Jika 2 PT Tetap: Dibagi 2
            IF v_pt_tetap_count >= 2 THEN
                v_potongan_multi_pt := (v_uang_makan / 26) / 2; -- Setengah hari makan
                -- Terapkan potongan ke Makan & Hadir
                v_hasil_makan := GREATEST(0, v_hasil_makan - v_potongan_multi_pt);
                v_hasil_kehadiran := GREATEST(0, v_hasil_kehadiran - v_potongan_multi_pt);
            
            -- Jika 1 PT Tetap + Borongan: PT Tetap kena full
            ELSIF v_pt_tetap_count = 1 AND v_pt_borongan_count >= 1 THEN
                v_potongan_multi_pt := (v_uang_makan / 26); -- Full 1 hari
                v_hasil_makan := GREATEST(0, v_hasil_makan - v_potongan_multi_pt);
                v_hasil_kehadiran := GREATEST(0, v_hasil_kehadiran - v_potongan_multi_pt);
            END IF;
        END IF;

        -- Ambil Penyesuaian & Kasbon
        SELECT COALESCE(penyesuaian_bonus, 0), COALESCE(kasbon, 0)
        INTO v_penyesuaian_bonus, v_kasbon
        FROM penyesuaian_gaji_pabrik
        WHERE kode = p_kode AND bulan = p_bulan AND perusahaan = p_perusahaan
        LIMIT 1;

    END IF;

    -- 7. Total Gaji Akhir
    v_total_gaji := v_hasil_gapok + v_hasil_lembur + v_hasil_makan + v_hasil_kehadiran + v_hasil_bonus + v_penyesuaian_bonus - v_kasbon;

    -- 8. UPSERT ke Tabel Laporan
    INSERT INTO laporan_bulanan_pabrik (
        bulan, periode, perusahaan, kode, nama, grade_p1, grade_p2, divisi,
        h, s_b, s_tb, i_b, i_tb, t_b, t_tb, set_h, lp, tm, lembur,
        gapok, gaji_lembur, u_m, u_k, uang_bonus, 
        penyesuaian_bonus, kasbon, hasil_gaji, keterangan, updated_at
    ) VALUES (
        p_bulan, p_target_periode, p_perusahaan, p_kode, v_nama, v_grade_p1, v_grade_p2, v_divisi,
        v_h, v_s_b, v_s_tb, v_i_b, v_i_tb, v_t_b, v_t_tb, v_set_h, v_lp, v_tm, v_lembur,
        v_hasil_gapok, v_hasil_lembur, v_hasil_makan, v_hasil_kehadiran, v_hasil_bonus,
        v_penyesuaian_bonus, v_kasbon, v_total_gaji, 'Generated V41', NOW()
    )
    ON CONFLICT (kode, bulan, periode, perusahaan) 
    DO UPDATE SET
        h = EXCLUDED.h,
        gapok = EXCLUDED.gapok,
        gaji_lembur = EXCLUDED.gaji_lembur,
        u_m = EXCLUDED.u_m,
        u_k = EXCLUDED.u_k,
        uang_bonus = EXCLUDED.uang_bonus,
        hasil_gaji = EXCLUDED.hasil_gaji,
        lp = EXCLUDED.lp,
        tm = EXCLUDED.tm,
        updated_at = NOW();

END;
$$;
