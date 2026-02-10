-- FUNCTION V40: PERBAIKAN PERHITUNGAN GAPOK (PRIORITAS GAJI HARIAN MASTER)

CREATE OR REPLACE FUNCTION calculate_monthly_report_v40(
    p_bulan TEXT,
    p_kode TEXT,
    p_perusahaan TEXT,
    p_target_periode TEXT -- 'Periode 1' atau 'Periode 2'
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_karyawan RECORD;
    v_master_gaji RECORD;
    
    -- Variabel Hitungan Absensi
    v_h NUMERIC := 0;
    v_set_h NUMERIC := 0;
    v_s_b NUMERIC := 0;
    v_s_tb NUMERIC := 0;
    v_i_b NUMERIC := 0;
    v_i_tb NUMERIC := 0;
    v_t_b NUMERIC := 0;
    v_t_tb NUMERIC := 0;
    v_lp NUMERIC := 0;
    v_tm NUMERIC := 0;
    v_lembur NUMERIC := 0;
    v_keluar_masuk TEXT := '-';
    v_libur_perusahaan BOOLEAN := false;
    v_keterangan TEXT := '';
    
    -- Variabel Uang
    v_gaji_harian NUMERIC := 0;
    v_gaji_lembur_jam NUMERIC := 0;
    v_uang_makan_harian NUMERIC := 0;
    v_uang_hadir_harian NUMERIC := 0;
    
    -- Hasil Perhitungan
    v_gapok NUMERIC := 0;
    v_total_lembur_rp NUMERIC := 0;
    v_total_makan NUMERIC := 0;
    v_total_hadir NUMERIC := 0;
    v_bonus NUMERIC := 0;
    v_potongan_absen NUMERIC := 0;
    v_kasbon NUMERIC := 0;
    v_penyesuaian NUMERIC := 0;
    v_potongan_5_minggu NUMERIC := 0;
    v_hasil_akhir NUMERIC := 0;
    
    -- Helper
    v_sunday_count INT := 0;
    v_pt_count INT := 0;
    v_has_borongan BOOLEAN := false;

BEGIN
    -- 1. Ambil Data Karyawan
    SELECT * INTO v_karyawan FROM karyawan_pabrik 
    WHERE kode = p_kode AND bulan = p_bulan 
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE NOTICE 'Karyawan % tidak ditemukan di bulan %', p_kode, p_bulan;
        RETURN;
    END IF;

    -- 2. Ambil Master Gaji (Sesuai Grade P1 atau P2)
    -- Jika Periode 1 gunakan grade_p1, jika Periode 2 gunakan grade_p2
    SELECT * INTO v_master_gaji FROM master_gaji 
    WHERE grade = CASE WHEN p_target_periode = 'Periode 1' THEN v_karyawan.grade_p1 ELSE v_karyawan.grade_p2 END 
    LIMIT 1;

    -- Tentukan Rate Harian (Prioritas kolom gaji_harian di Master, kalau 0 baru hitung manual)
    IF v_master_gaji.gaji_harian > 0 THEN
        v_gaji_harian := v_master_gaji.gaji_harian;
    ELSE
        v_gaji_harian := COALESCE(v_master_gaji.gaji_pokok, 0) / 26;
    END IF;

    v_gaji_lembur_jam := COALESCE(v_master_gaji.lembur, 0);
    
    -- Rate Makan & Hadir (Hanya dipakai di Periode 2)
    v_uang_makan_harian := COALESCE(v_master_gaji.uang_makan, 0) / 26;
    v_uang_hadir_harian := COALESCE(v_master_gaji.uang_kehadiran, 0) / 26;

    -- 3. Hitung Absensi (Hanya untuk Perusahaan & Periode yg diminta)
    SELECT 
        COALESCE(SUM(CASE WHEN kehadiran IN ('1', '1.0', 'Hadir', 'H') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN kehadiran IN ('0.5', 'Setengah') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN kehadiran IN ('S', 'Sakit') AND keterangan ILIKE '%Berurut%' THEN 1 ELSE 0 END), 0), -- S_B (Logic sederhana, idealnya cek tanggal)
        COALESCE(SUM(CASE WHEN kehadiran IN ('S', 'Sakit') AND keterangan NOT ILIKE '%Berurut%' THEN 1 ELSE 0 END), 0), -- S_TB
        COALESCE(SUM(CASE WHEN kehadiran IN ('I', 'Izin') AND keterangan ILIKE '%Berurut%' THEN 1 ELSE 0 END), 0), -- I_B
        COALESCE(SUM(CASE WHEN kehadiran IN ('I', 'Izin') AND keterangan NOT ILIKE '%Berurut%' THEN 1 ELSE 0 END), 0), -- I_TB
        COALESCE(SUM(CASE WHEN kehadiran IN ('A', 'Alpha', 'T') AND keterangan ILIKE '%Berurut%' THEN 1 ELSE 0 END), 0), -- T_B
        COALESCE(SUM(CASE WHEN kehadiran IN ('A', 'Alpha', 'T') AND keterangan NOT ILIKE '%Berurut%' THEN 1 ELSE 0 END), 0), -- T_TB
        COALESCE(SUM(CASE WHEN kehadiran IN ('LP', 'Libur') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN kehadiran IN ('TM', 'Merah') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CAST(REGEXP_REPLACE(lembur, '[^0-9.]', '', 'g') AS NUMERIC)), 0)
    INTO 
        v_h, v_set_h, v_s_b, v_s_tb, v_i_b, v_i_tb, v_t_b, v_t_tb, v_lp, v_tm, v_lembur
    FROM presensi_harian_pabrik
    WHERE kode = p_kode 
      AND bulan = p_bulan 
      AND perusahaan = p_perusahaan
      AND periode = p_target_periode;

    -- 4. HITUNG GAPOK (CORE FIX V40)
    -- Rumus: (Hadir + LP + TM + (Setengah * 0.5)) * Gaji Harian
    v_gapok := (v_h + v_lp + v_tm + (v_set_h * 0.5)) * v_gaji_harian;

    -- 5. Hitung Lembur
    v_total_lembur_rp := v_lembur * v_gaji_lembur_jam;

    -- 6. Hitung Tunjangan & Bonus (HANYA DI PERIODE 2)
    IF p_target_periode = 'Periode 2' THEN
        -- Ambil total absensi Periode 1 + Periode 2 untuk tunjangan
        DECLARE
            v_total_h NUMERIC;
            v_total_lp NUMERIC;
            v_total_tm NUMERIC;
            v_total_set_h NUMERIC;
        BEGIN
            SELECT 
                COALESCE(SUM(CASE WHEN kehadiran IN ('1', '1.0', 'Hadir', 'H') THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN kehadiran IN ('LP', 'Libur') THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN kehadiran IN ('TM', 'Merah') THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN kehadiran IN ('0.5', 'Setengah') THEN 1 ELSE 0 END), 0)
            INTO v_total_h, v_total_lp, v_total_tm, v_total_set_h
            FROM presensi_harian_pabrik
            WHERE kode = p_kode AND bulan = p_bulan AND perusahaan = p_perusahaan; -- Total sebulan di PT ini

            -- Hitung Uang Makan & Hadir (Full sebulan dikurangi LP/TM/Absen)
            -- Logic: Base Full - Potongan Libur - Potongan Absen
            -- Simplifikasi: Dibayar sesuai hari kerja efektif (H + Set_H)
            -- ATAU Logic Existing: Full - Potongan. Kita pakai Logic Existing (Proposional Hari Kerja)
            
            -- Revisi V40: Uang Makan/Hadir dibayar per kedatangan (H + 0.5*Set_H)
            -- Tidak dibayar saat LP/TM
            v_total_makan := (v_total_h + (v_total_set_h * 0.5)) * v_uang_makan_harian;
            v_total_hadir := (v_total_h + (v_total_set_h * 0.5)) * v_uang_hadir_harian;
            
            -- Bonus (Base)
            v_bonus := COALESCE(v_master_gaji.bonus, 0);
            
            -- Potongan Pelanggaran (S/I/T) untuk Bonus & Tunjangan
            -- (Logic denda 10rb/20rb dsb bisa dimasukkan sini jika diperlukan detail)
            -- Di V40 kita fokus Gapok dulu, Bonus biarkan default master dikurangi jika ada S/I/T
            IF (v_s_b + v_s_tb + v_i_b + v_i_tb + v_t_b + v_t_tb) > 0 THEN
                v_bonus := 0; -- Hangus jika ada pelanggaran
            END IF;
            
            -- Ambil Penyesuaian & Kasbon
            SELECT penyesuaian_bonus, kasbon INTO v_penyesuaian, v_kasbon
            FROM penyesuaian_gaji_pabrik
            WHERE kode = p_kode AND bulan = p_bulan AND perusahaan = p_perusahaan;
            
            v_penyesuaian := COALESCE(v_penyesuaian, 0);
            v_kasbon := COALESCE(v_kasbon, 0);

            -- LOGIKA POTONGAN 5 MINGGU (V38 Logic)
            v_sunday_count := count_sundays_in_month(p_bulan);
            IF v_sunday_count = 5 THEN
                -- Cek Multi PT
                SELECT COUNT(DISTINCT perusahaan) INTO v_pt_count 
                FROM presensi_harian_pabrik 
                WHERE kode = p_kode AND bulan = p_bulan AND perusahaan != 'BORONGAN';
                
                SELECT EXISTS(SELECT 1 FROM presensi_harian_pabrik WHERE kode = p_kode AND bulan = p_bulan AND perusahaan = 'BORONGAN')
                INTO v_has_borongan;

                IF v_pt_count >= 2 THEN
                    v_potongan_5_minggu := v_gaji_harian / 2; -- Bagi 2 PT
                ELSIF v_pt_count = 1 AND v_has_borongan THEN
                    v_potongan_5_minggu := v_gaji_harian; -- Full kena di PT Tetap
                ELSE
                    v_potongan_5_minggu := 0; -- 1 PT saja aman
                END IF;
            END IF;

        END;
    END IF;

    -- 7. Total Akhir
    v_hasil_akhir := v_gapok + v_total_lembur_rp + v_total_makan + v_total_hadir + v_bonus + v_penyesuaian - v_kasbon - v_potongan_absen - v_potongan_5_minggu;

    -- 8. Update / Insert Laporan
    -- Cek apakah sudah ada
    IF EXISTS (SELECT 1 FROM laporan_bulanan_pabrik WHERE kode = p_kode AND bulan = p_bulan AND perusahaan = p_perusahaan AND periode = p_target_periode) THEN
        UPDATE laporan_bulanan_pabrik SET
            nama = v_karyawan.nama,
            grade_p1 = v_karyawan.grade_p1,
            grade_p2 = v_karyawan.grade_p2,
            divisi = v_karyawan.divisi,
            h = v_h, set_h = v_set_h, lp = v_lp, tm = v_tm,
            s_b = v_s_b, s_tb = v_s_tb, i_b = v_i_b, i_tb = v_i_tb, t_b = v_t_b, t_tb = v_t_tb,
            lembur = v_lembur,
            gapok = v_gapok,
            gaji_lembur = v_total_lembur_rp,
            u_m = v_total_makan,
            u_k = v_total_hadir,
            uang_bonus = v_bonus,
            kasbon = v_kasbon,
            penyesuaian_bonus = v_penyesuaian,
            hasil_gaji = v_hasil_akhir,
            updated_at = NOW()
        WHERE kode = p_kode AND bulan = p_bulan AND perusahaan = p_perusahaan AND periode = p_target_periode;
    ELSE
        INSERT INTO laporan_bulanan_pabrik (
            bulan, periode, perusahaan, kode, nama, grade_p1, grade_p2, divisi,
            h, set_h, lp, tm, s_b, s_tb, i_b, i_tb, t_b, t_tb, lembur,
            gapok, gaji_lembur, u_m, u_k, uang_bonus, kasbon, penyesuaian_bonus, hasil_gaji
        ) VALUES (
            p_bulan, p_target_periode, p_perusahaan, p_kode, v_karyawan.nama, v_karyawan.grade_p1, v_karyawan.grade_p2, v_karyawan.divisi,
            v_h, v_set_h, v_lp, v_tm, v_s_b, v_s_tb, v_i_b, v_i_tb, v_t_b, v_t_tb, v_lembur,
            v_gapok, v_total_lembur_rp, v_total_makan, v_total_hadir, v_bonus, v_kasbon, v_penyesuaian, v_hasil_akhir
        );
    END IF;

END;
$$;
