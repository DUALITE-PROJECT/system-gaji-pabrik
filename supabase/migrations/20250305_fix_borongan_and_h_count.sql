-- 1. CLEANUP: Hapus data BORONGAN dari tabel laporan bulanan
DELETE FROM public.laporan_bulanan_pabrik 
WHERE perusahaan = 'BORONGAN';

-- 2. UPDATE FUNCTION V39 (Fix H Count & Exclude Borongan)
CREATE OR REPLACE FUNCTION calculate_monthly_report_v39(
    p_bulan TEXT,
    p_kode TEXT,
    p_perusahaan TEXT,
    p_target_periode TEXT -- 'Periode 1' atau 'Periode 2'
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    -- Variabel Karyawan
    v_nama TEXT;
    v_grade TEXT;
    v_divisi TEXT;
    v_status_aktif BOOLEAN;
    
    -- Variabel Master Gaji
    v_gaji_pokok NUMERIC := 0;
    v_gaji_lembur_per_jam NUMERIC := 0;
    v_uang_makan_master NUMERIC := 0;
    v_uang_kehadiran_master NUMERIC := 0;
    v_bonus_master NUMERIC := 0;
    
    -- Variabel Kehadiran (Count)
    v_h NUMERIC := 0;      -- Hadir
    v_s_b NUMERIC := 0;    -- Sakit Berpengaruh
    v_s_tb NUMERIC := 0;   -- Sakit Tidak Berpengaruh
    v_i_b NUMERIC := 0;    -- Izin Berpengaruh
    v_i_tb NUMERIC := 0;   -- Izin Tidak Berpengaruh
    v_t_b NUMERIC := 0;    -- Alpha Berpengaruh
    v_t_tb NUMERIC := 0;   -- Alpha Tidak Berpengaruh
    v_set_h NUMERIC := 0;  -- Setengah Hari
    v_lp NUMERIC := 0;     -- Libur Perusahaan
    v_tm NUMERIC := 0;     -- Tanggal Merah
    v_total_lembur_jam NUMERIC := 0;
    
    -- Variabel Hasil Hitung
    v_gaji_pokok_diterima NUMERIC := 0;
    v_gaji_lembur_diterima NUMERIC := 0;
    v_uang_makan_diterima NUMERIC := 0;
    v_uang_kehadiran_diterima NUMERIC := 0;
    v_bonus_diterima NUMERIC := 0;
    v_total_gaji NUMERIC := 0;
    
    -- Variabel Penyesuaian & Lainnya
    v_kasbon NUMERIC := 0;
    v_penyesuaian_bonus NUMERIC := 0;
    v_keterangan TEXT := '';
    v_keluar_masuk TEXT := '';
    v_libur_perusahaan_status TEXT := '';
    
    -- Helper
    v_total_potongan_makan NUMERIC := 0;
    v_total_potongan_hadir NUMERIC := 0;
    v_rate_makan_harian NUMERIC := 0;
    v_rate_hadir_harian NUMERIC := 0;
    
    -- Multi PT Logic
    v_count_pt_tetap INT := 0;
    v_count_pt_borongan INT := 0;
    v_sunday_count INT := 0;
    v_potongan_5_minggu NUMERIC := 0;

BEGIN
    -- [CRITICAL] BLOCK BORONGAN: Jangan proses jika perusahaan adalah BORONGAN
    IF p_perusahaan = 'BORONGAN' THEN
        RETURN;
    END IF;

    -- 1. Ambil Data Karyawan
    SELECT nama, 
           CASE WHEN p_target_periode = 'Periode 1' THEN grade_p1 ELSE grade_p2 END,
           divisi, status_aktif
    INTO v_nama, v_grade, v_divisi, v_status_aktif
    FROM public.karyawan_pabrik
    WHERE kode = p_kode AND bulan = p_bulan
    LIMIT 1;

    -- Fallback jika data karyawan tidak lengkap di master karyawan, ambil dari presensi
    IF v_nama IS NULL THEN
        SELECT keterangan INTO v_nama 
        FROM public.presensi_harian_pabrik 
        WHERE kode = p_kode AND bulan = p_bulan LIMIT 1;
    END IF;

    -- 2. Ambil Master Gaji berdasarkan Grade
    SELECT gaji_pokok, lembur, uang_makan, uang_kehadiran, bonus
    INTO v_gaji_pokok, v_gaji_lembur_per_jam, v_uang_makan_master, v_uang_kehadiran_master, v_bonus_master
    FROM public.master_gaji
    WHERE grade = v_grade AND bulan = p_bulan
    LIMIT 1;

    -- Default 0 jika tidak ada master gaji
    v_gaji_pokok := COALESCE(v_gaji_pokok, 0);
    v_gaji_lembur_per_jam := COALESCE(v_gaji_lembur_per_jam, 0);
    v_uang_makan_master := COALESCE(v_uang_makan_master, 0);
    v_uang_kehadiran_master := COALESCE(v_uang_kehadiran_master, 0);
    v_bonus_master := COALESCE(v_bonus_master, 0);

    -- 3. Hitung Kehadiran (Agregasi dari Presensi Harian)
    -- [FIXED LOGIC FOR 'H']
    SELECT 
        COALESCE(SUM(CASE 
            WHEN kehadiran IN ('1', '1.0', 'Hadir', 'H', 'h') THEN 1 
            WHEN kehadiran IN ('0.5', 'Setengah') THEN 0.5 
            ELSE 0 
        END), 0),
        COALESCE(SUM(CASE WHEN kehadiran IN ('S', 'Sakit') THEN 1 ELSE 0 END), 0), -- S (Berpengaruh)
        COALESCE(SUM(CASE WHEN kehadiran IN ('SB', 'Sakit Biasa') THEN 1 ELSE 0 END), 0), -- S (Tidak Berpengaruh - Asumsi kode SB)
        COALESCE(SUM(CASE WHEN kehadiran IN ('I', 'Izin') THEN 1 ELSE 0 END), 0), -- I (Berpengaruh)
        COALESCE(SUM(CASE WHEN kehadiran IN ('IB', 'Izin Biasa') THEN 1 ELSE 0 END), 0), -- I (Tidak Berpengaruh)
        COALESCE(SUM(CASE WHEN kehadiran IN ('A', 'Alpha', 'T', 'Tanpa Keterangan') THEN 1 ELSE 0 END), 0), -- T (Berpengaruh)
        COALESCE(SUM(CASE WHEN kehadiran IN ('TB', 'Terlambat Biasa') THEN 1 ELSE 0 END), 0), -- T (Tidak Berpengaruh)
        COALESCE(SUM(CASE WHEN kehadiran IN ('0.5', 'Setengah') THEN 1 ELSE 0 END), 0), -- Count Setengah Hari
        COALESCE(SUM(CASE WHEN kehadiran IN ('LP', 'Libur Perusahaan') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN kehadiran IN ('TM', 'Tanggal Merah', 'M', 'Minggu') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(
            CASE 
                WHEN lembur ~ '^[0-9\.]+$' THEN lembur::numeric 
                ELSE 0 
            END
        ), 0)
    INTO v_h, v_s_b, v_s_tb, v_i_b, v_i_tb, v_t_b, v_t_tb, v_set_h, v_lp, v_tm, v_total_lembur_jam
    FROM public.presensi_harian_pabrik
    WHERE kode = p_kode 
      AND bulan = p_bulan 
      AND perusahaan = p_perusahaan
      AND periode = p_target_periode; -- Filter per periode

    -- 4. Hitung Komponen Gaji
    
    -- A. Gaji Pokok & Lembur (Dibayar per periode)
    -- Rumus Gapok: (Gaji Pokok Sebulan / 26) * (Hadir + LP + TM)
    -- Note: Setengah hari dihitung 0.5 di v_h, jadi aman.
    v_gaji_pokok_diterima := (v_gaji_pokok / 26) * (v_h + v_lp + v_tm);
    v_gaji_lembur_diterima := v_total_lembur_jam * v_gaji_lembur_per_jam;

    -- B. Uang Makan & Kehadiran (Hanya dibayar di Periode 2, tapi dihitung kumulatif)
    IF p_target_periode = 'Periode 2' THEN
        -- Ambil data Periode 1 untuk digabung
        DECLARE
            v_h_p1 NUMERIC := 0;
            v_lp_p1 NUMERIC := 0;
            v_tm_p1 NUMERIC := 0;
            v_s_b_p1 NUMERIC := 0;
            v_i_b_p1 NUMERIC := 0;
            v_t_b_p1 NUMERIC := 0;
            
            -- Total Kumulatif
            v_total_lp NUMERIC := 0;
            v_total_tm NUMERIC := 0;
            v_total_s_b NUMERIC := 0;
            v_total_i_b NUMERIC := 0;
            v_total_t_b NUMERIC := 0;
            
            -- Denda
            v_denda_s NUMERIC := 0;
            v_denda_i NUMERIC := 0;
            v_denda_t NUMERIC := 0;
        BEGIN
            -- Get P1 Stats
            SELECT 
                COALESCE(h, 0), COALESCE(lp, 0), COALESCE(tm, 0), 
                COALESCE(s_b, 0), COALESCE(i_b, 0), COALESCE(t_b, 0)
            INTO v_h_p1, v_lp_p1, v_tm_p1, v_s_b_p1, v_i_b_p1, v_t_b_p1
            FROM public.laporan_bulanan_pabrik
            WHERE kode = p_kode AND bulan = p_bulan AND perusahaan = p_perusahaan AND periode = 'Periode 1';

            -- Gabung P1 + P2
            v_total_lp := v_lp + v_lp_p1;
            v_total_tm := v_tm + v_tm_p1;
            v_total_s_b := v_s_b + v_s_b_p1;
            v_total_i_b := v_i_b + v_i_b_p1;
            v_total_t_b := v_t_b + v_t_b_p1;

            v_rate_makan_harian := v_uang_makan_master / 26;
            v_rate_hadir_harian := v_uang_kehadiran_master / 26;

            -- Hitung Potongan Libur (Proporsional)
            v_total_potongan_makan := (v_total_lp + v_total_tm) * v_rate_makan_harian;
            v_total_potongan_hadir := (v_total_lp + v_total_tm) * v_rate_hadir_harian;

            -- Hitung Denda Pelanggaran (Progresif)
            -- Rumus: 10k + (n-1)*2k -> 10, 12, 14...
            -- SAKIT
            IF v_total_s_b > 0 THEN
                FOR i IN 1..v_total_s_b LOOP
                    v_denda_s := v_denda_s + (10000 + (i-1) * 2000);
                END LOOP;
            END IF;
            -- IZIN
            IF v_total_i_b > 0 THEN
                FOR i IN 1..v_total_i_b LOOP
                    v_denda_i := v_denda_i + (10000 + (i-1) * 2000);
                END LOOP;
            END IF;
            -- ALPHA
            IF v_total_t_b > 0 THEN
                FOR i IN 1..v_total_t_b LOOP
                    v_denda_t := v_denda_t + (10000 + (i-1) * 2000);
                END LOOP;
            END IF;

            -- Total Denda Nominal
            DECLARE v_total_denda NUMERIC;
            BEGIN
                v_total_denda := v_denda_s + v_denda_i + v_denda_t;
                
                -- Terapkan Potongan ke Uang Makan & Hadir
                v_uang_makan_diterima := v_uang_makan_master - v_total_potongan_makan - v_total_denda;
                v_uang_kehadiran_diterima := v_uang_kehadiran_master - v_total_potongan_hadir - v_total_denda;
                
                -- Pastikan tidak negatif
                IF v_uang_makan_diterima < 0 THEN v_uang_makan_diterima := 0; END IF;
                IF v_uang_kehadiran_diterima < 0 THEN v_uang_kehadiran_diterima := 0; END IF;
            END;

            -- C. Bonus (Hanya cair jika tidak ada pelanggaran & tidak ada LP)
            IF v_total_s_b = 0 AND v_total_i_b = 0 AND v_total_t_b = 0 AND v_total_lp = 0 THEN
                v_bonus_diterima := v_bonus_master;
            ELSE
                v_bonus_diterima := 0;
            END IF;

            -- D. Potongan 5 Minggu & Multi PT (V38 Logic)
            v_sunday_count := count_sundays_in_month(p_bulan);
            
            IF v_sunday_count = 5 THEN
                -- Cek Multi PT
                SELECT COUNT(DISTINCT perusahaan) INTO v_count_pt_tetap
                FROM presensi_harian_pabrik
                WHERE kode = p_kode AND bulan = p_bulan AND perusahaan IN ('CV ADNAN', 'CV HANAN');

                SELECT COUNT(DISTINCT perusahaan) INTO v_count_pt_borongan
                FROM presensi_harian_pabrik
                WHERE kode = p_kode AND bulan = p_bulan AND perusahaan = 'BORONGAN';

                -- Hitung nilai 1 hari (untuk dipotong)
                v_potongan_5_minggu := v_rate_makan_harian; -- Asumsi potong 1 hari makan

                IF v_count_pt_tetap = 2 THEN
                    -- Bagi 2
                    v_uang_makan_diterima := v_uang_makan_diterima - (v_potongan_5_minggu / 2);
                    v_uang_kehadiran_diterima := v_uang_kehadiran_diterima - (v_rate_hadir_harian / 2);
                ELSIF v_count_pt_tetap = 1 AND v_count_pt_borongan >= 1 THEN
                    -- Kena Full di PT Tetap
                    v_uang_makan_diterima := v_uang_makan_diterima - v_potongan_5_minggu;
                    v_uang_kehadiran_diterima := v_uang_kehadiran_diterima - v_rate_hadir_harian;
                END IF;
            END IF;

        END;
    ELSE
        -- Periode 1: Tidak dapat tunjangan bulanan
        v_uang_makan_diterima := 0;
        v_uang_kehadiran_diterima := 0;
        v_bonus_diterima := 0;
    END IF;

    -- 5. Ambil Penyesuaian & Kasbon
    SELECT COALESCE(penyesuaian_bonus, 0), COALESCE(kasbon, 0)
    INTO v_penyesuaian_bonus, v_kasbon
    FROM public.penyesuaian_gaji_pabrik
    WHERE kode = p_kode AND bulan = p_bulan AND periode = p_target_periode AND perusahaan = p_perusahaan
    LIMIT 1;

    -- 6. Total Akhir
    v_total_gaji := v_gaji_pokok_diterima + v_gaji_lembur_diterima + v_uang_makan_diterima + v_uang_kehadiran_diterima + v_bonus_diterima + v_penyesuaian_bonus - v_kasbon;

    -- 7. Insert / Update Laporan
    INSERT INTO public.laporan_bulanan_pabrik (
        bulan, periode, perusahaan, kode, nama, grade_p1, grade_p2, divisi,
        h, s_b, s_tb, i_b, i_tb, t_b, t_tb, set_h, lp, tm, lembur,
        gapok, gaji_lembur, u_m, u_k, uang_bonus, kasbon, penyesuaian_bonus, hasil_gaji,
        keterangan, created_at, updated_at
    ) VALUES (
        p_bulan, p_target_periode, p_perusahaan, p_kode, v_nama, 
        CASE WHEN p_target_periode = 'Periode 1' THEN v_grade ELSE NULL END,
        CASE WHEN p_target_periode = 'Periode 2' THEN v_grade ELSE NULL END,
        v_divisi,
        v_h, v_s_b, v_s_tb, v_i_b, v_i_tb, v_t_b, v_t_tb, v_set_h, v_lp, v_tm, v_total_lembur_jam,
        v_gaji_pokok_diterima, v_gaji_lembur_diterima, v_uang_makan_diterima, v_uang_kehadiran_diterima, 
        v_bonus_diterima, v_kasbon, v_penyesuaian_bonus, v_total_gaji,
        v_keterangan, NOW(), NOW()
    )
    ON CONFLICT (kode, bulan, periode, perusahaan) DO UPDATE SET
        nama = EXCLUDED.nama,
        grade_p1 = COALESCE(EXCLUDED.grade_p1, public.laporan_bulanan_pabrik.grade_p1),
        grade_p2 = COALESCE(EXCLUDED.grade_p2, public.laporan_bulanan_pabrik.grade_p2),
        divisi = EXCLUDED.divisi,
        h = EXCLUDED.h, s_b = EXCLUDED.s_b, s_tb = EXCLUDED.s_tb, 
        i_b = EXCLUDED.i_b, i_tb = EXCLUDED.i_tb, t_b = EXCLUDED.t_b, t_tb = EXCLUDED.t_tb,
        set_h = EXCLUDED.set_h, lp = EXCLUDED.lp, tm = EXCLUDED.tm, lembur = EXCLUDED.lembur,
        gapok = EXCLUDED.gapok, gaji_lembur = EXCLUDED.gaji_lembur, 
        u_m = EXCLUDED.u_m, u_k = EXCLUDED.u_k, uang_bonus = EXCLUDED.uang_bonus,
        kasbon = EXCLUDED.kasbon, penyesuaian_bonus = EXCLUDED.penyesuaian_bonus, 
        hasil_gaji = EXCLUDED.hasil_gaji,
        updated_at = NOW();

END;
$$;
