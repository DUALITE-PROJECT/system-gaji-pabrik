-- ============================================================================
-- MIGRATION V38: LOGIKA GAJI PABRIK (POTONGAN 5 MINGGU + MULTI PT)
-- ============================================================================

-- 1. Helper: Parse Nama Bulan Indonesia ke Date
CREATE OR REPLACE FUNCTION parse_indo_month(month_str text) RETURNS date AS $$
DECLARE
    parts text[];
    m_name text;
    y_text text;
    m_num int;
BEGIN
    -- Asumsi format: "Oktober 2025"
    parts := regexp_split_to_array(trim(month_str), '\s+');
    
    IF array_length(parts, 1) < 2 THEN
        RETURN NULL;
    END IF;

    m_name := lower(parts[1]);
    y_text := parts[2];
    
    CASE m_name
        WHEN 'januari' THEN m_num := 1;
        WHEN 'februari' THEN m_num := 2;
        WHEN 'maret' THEN m_num := 3;
        WHEN 'april' THEN m_num := 4;
        WHEN 'mei' THEN m_num := 5;
        WHEN 'juni' THEN m_num := 6;
        WHEN 'juli' THEN m_num := 7;
        WHEN 'agustus' THEN m_num := 8;
        WHEN 'september' THEN m_num := 9;
        WHEN 'oktober' THEN m_num := 10;
        WHEN 'november' THEN m_num := 11;
        WHEN 'desember' THEN m_num := 12;
        ELSE m_num := 1; -- Default
    END CASE;
    
    -- Return tanggal 1 bulan tersebut
    RETURN make_date(y_text::int, m_num, 1);
EXCEPTION WHEN OTHERS THEN
    RETURN NULL; -- Handle error parsing
END;
$$ LANGUAGE plpgsql;

-- 2. Helper: Hitung Jumlah Hari Minggu dalam Bulan
CREATE OR REPLACE FUNCTION count_sundays_in_month(month_str text) RETURNS integer AS $$
DECLARE
    start_date date;
    end_date date;
    d date;
    sunday_count integer := 0;
BEGIN
    start_date := parse_indo_month(month_str);
    
    IF start_date IS NULL THEN
        RETURN 4; -- Default aman jika gagal parse
    END IF;

    -- Hitung tanggal terakhir bulan tersebut
    end_date := (start_date + interval '1 month' - interval '1 day')::date;
    
    -- Loop setiap hari dalam bulan
    FOR d IN SELECT generate_series(start_date, end_date, '1 day') LOOP
        IF extract(isodow from d) = 7 THEN -- 7 is Sunday in ISO (Postgres uses 0-6 for dow, 1-7 for isodow where 7 is Sunday)
            sunday_count := sunday_count + 1;
        END IF;
    END LOOP;
    
    RETURN sunday_count;
END;
$$ LANGUAGE plpgsql;

-- 3. Main Function: Calculate Monthly Report V38
CREATE OR REPLACE FUNCTION calculate_monthly_report_v38(
    p_bulan text,
    p_kode text,
    p_perusahaan text,
    p_target_periode text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    -- Data Karyawan
    r_karyawan RECORD;
    r_master RECORD;
    
    -- Data Presensi
    r_presensi RECORD;
    
    -- Variabel Hitungan Dasar
    v_hadir numeric := 0;
    v_sakit_b numeric := 0; -- Berpengaruh
    v_izin_b numeric := 0;
    v_telat_b numeric := 0;
    v_sakit_tb numeric := 0; -- Tidak Berpengaruh
    v_izin_tb numeric := 0;
    v_telat_tb numeric := 0;
    v_setengah numeric := 0;
    v_lp numeric := 0;
    v_tm numeric := 0;
    v_lembur_jam numeric := 0; -- Total jam lembur
    
    -- Variabel Gaji
    v_gapok numeric := 0;
    v_gaji_lembur numeric := 0;
    v_uang_makan numeric := 0;
    v_uang_kehadiran numeric := 0;
    v_bonus numeric := 0;
    v_kasbon numeric := 0;
    v_penyesuaian numeric := 0;
    v_total_gaji numeric := 0;
    
    -- Variabel Potongan & Denda
    v_potongan_absen numeric := 0;
    v_potongan_lp_tm_makan numeric := 0;
    v_potongan_lp_tm_hadir numeric := 0;
    
    -- Variabel V38 (5 Minggu & Multi PT)
    v_sunday_count int := 0;
    v_pt_count int := 0;
    v_has_borongan boolean := false;
    v_potongan_5_minggu_makan numeric := 0;
    v_potongan_5_minggu_hadir numeric := 0;
    v_is_multi_pt boolean := false;
    
    -- Konstanta
    c_hari_kerja int := 26;

BEGIN
    -- 1. Ambil Data Karyawan
    SELECT * INTO r_karyawan 
    FROM karyawan_pabrik 
    WHERE kode = p_kode AND bulan = p_bulan
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE NOTICE 'Karyawan % tidak ditemukan di bulan %', p_kode, p_bulan;
        RETURN;
    END IF;

    -- 2. Ambil Master Gaji (Sesuai Grade di Periode Tersebut)
    -- Grade bisa beda P1 dan P2, ambil sesuai target periode
    DECLARE
        v_grade_target text;
    BEGIN
        IF p_target_periode = 'Periode 1' THEN
            v_grade_target := r_karyawan.grade_p1;
        ELSE
            v_grade_target := r_karyawan.grade_p2;
        END IF;

        SELECT * INTO r_master 
        FROM master_gaji 
        WHERE grade = v_grade_target 
        AND bulan ILIKE '%' || split_part(p_bulan, ' ', 1) || '%' -- Match bulan (simple)
        LIMIT 1;
    END;

    IF NOT FOUND THEN
        -- Fallback jika master gaji spesifik bulan tidak ada, ambil master umum grade tsb
        SELECT * INTO r_master FROM master_gaji WHERE grade = r_karyawan.grade_p1 LIMIT 1; 
    END IF;

    -- 3. Hitung Agregat Presensi (Hanya untuk Periode Target)
    SELECT 
        COALESCE(SUM(CASE WHEN kehadiran = '1' THEN 1 ELSE 0 END), 0) as h,
        COALESCE(SUM(CASE WHEN kehadiran = '0.5' THEN 1 ELSE 0 END), 0) as set_h,
        COALESCE(SUM(CASE WHEN kehadiran = 'S' THEN 1 ELSE 0 END), 0) as s, -- Sakit total (nanti dipisah B/TB logic manual atau asumsi)
        COALESCE(SUM(CASE WHEN kehadiran = 'I' THEN 1 ELSE 0 END), 0) as i,
        COALESCE(SUM(CASE WHEN kehadiran = 'A' THEN 1 ELSE 0 END), 0) as a,
        COALESCE(SUM(CASE WHEN kehadiran = 'LP' THEN 1 ELSE 0 END), 0) as lp,
        COALESCE(SUM(CASE WHEN kehadiran = 'TM' THEN 1 ELSE 0 END), 0) as tm,
        COALESCE(SUM(CAST(REGEXP_REPLACE(lembur, '[^0-9.]', '', 'g') AS NUMERIC)), 0) as lembur_jam
    INTO r_presensi
    FROM presensi_harian_pabrik
    WHERE kode = p_kode 
      AND bulan = p_bulan 
      AND perusahaan = p_perusahaan
      AND periode = p_target_periode;

    -- Mapping Presensi ke Variabel
    v_hadir := r_presensi.h;
    v_setengah := r_presensi.set_h;
    v_lp := r_presensi.lp;
    v_tm := r_presensi.tm;
    v_lembur_jam := r_presensi.lembur_jam;
    
    -- Simple Logic untuk S/I/A (Asumsi masuk ke Berpengaruh/B dulu untuk safety, atau TB jika ada logic khusus)
    -- Di sistem V38 ini kita sederhanakan: S/I/A mengurangi bonus & kena denda
    v_sakit_b := r_presensi.s;
    v_izin_b := r_presensi.i;
    v_telat_b := r_presensi.a; -- Alpha dianggap Telat/Alpha Berpengaruh

    -- 4. Hitung Gaji Pokok & Lembur (Per Periode)
    -- Gapok Harian * (Hadir + 0.5 * Setengah)
    v_gapok := (r_master.gaji_harian * v_hadir) + (r_master.gaji_setengah_hari * v_setengah);
    v_gaji_lembur := v_lembur_jam * r_master.lembur;

    -- 5. Hitung Tunjangan (Makan, Hadir, Bonus) - HANYA DI PERIODE 2
    IF p_target_periode = 'Periode 2' THEN
        
        -- A. Ambil Data Periode 1 untuk Akumulasi
        DECLARE
            r_p1 RECORD;
        BEGIN
            SELECT lp, tm, s_b, i_b, t_b INTO r_p1 
            FROM laporan_bulanan_pabrik 
            WHERE kode = p_kode AND bulan = p_bulan AND perusahaan = p_perusahaan AND periode = 'Periode 1';
            
            -- Tambahkan akumulasi LP/TM/Absen dari P1
            v_lp := v_lp + COALESCE(r_p1.lp, 0);
            v_tm := v_tm + COALESCE(r_p1.tm, 0);
            v_sakit_b := v_sakit_b + COALESCE(r_p1.s_b, 0);
            v_izin_b := v_izin_b + COALESCE(r_p1.i_b, 0);
            v_telat_b := v_telat_b + COALESCE(r_p1.t_b, 0);
        END;

        -- B. Hitung Potongan LP & TM (Proporsional)
        -- Rumus: (Master / 26) * Jumlah Hari
        v_potongan_lp_tm_makan := (r_master.uang_makan / c_hari_kerja) * (v_lp + v_tm);
        v_potongan_lp_tm_hadir := (r_master.uang_kehadiran / c_hari_kerja) * (v_lp + v_tm);

        -- C. Hitung Denda Absen (S/I/A) - Progresif
        -- Contoh: 1 hari = 10rb, 2 hari = 10+12=22rb, dst.
        DECLARE
            func_denda_progresif numeric := 0;
            i int;
        BEGIN
            -- Hitung total hari pelanggaran (S+I+A)
            -- Note: Di V38 ini kita pisah per jenis jika mau, atau gabung. 
            -- Sesuai instruksi "jangan ubah yang lain", kita pakai logic denda yg sudah ada (Progresif per tipe)
            
            -- Denda Sakit
            FOR i IN 1..v_sakit_b LOOP
                v_potongan_absen := v_potongan_absen + (10000 + (i-1)*2000);
            END LOOP;
            -- Denda Izin
            FOR i IN 1..v_izin_b LOOP
                v_potongan_absen := v_potongan_absen + (10000 + (i-1)*2000);
            END LOOP;
            -- Denda Alpha/Telat
            FOR i IN 1..v_telat_b LOOP
                v_potongan_absen := v_potongan_absen + (10000 + (i-1)*2000);
            END LOOP;
        END;

        -- D. LOGIKA V38: POTONGAN 5 MINGGU & MULTI PT
        v_sunday_count := count_sundays_in_month(p_bulan);
        
        IF v_sunday_count = 5 THEN
            -- Cek Multi PT
            SELECT COUNT(DISTINCT perusahaan) INTO v_pt_count 
            FROM presensi_harian_pabrik 
            WHERE kode = p_kode AND bulan = p_bulan;
            
            -- Cek apakah ada Borongan
            SELECT EXISTS (
                SELECT 1 FROM presensi_harian_pabrik 
                WHERE kode = p_kode AND bulan = p_bulan AND perusahaan = 'BORONGAN'
            ) INTO v_has_borongan;

            -- Hitung Nilai 1 Hari (Potongan Dasar 5 Minggu)
            -- Asumsi: Potongan 5 Minggu = Nilai per hari (karena ada 5 minggu, hari kerja efektif berkurang 1 dr standar 26)
            -- Atau sesuai instruksi: "Potongan dibagi 2" dsb.
            -- Kita pakai basis: Potongan Full = 1 Hari Gaji (Makan & Hadir)
            DECLARE
                v_1_hari_makan numeric := r_master.uang_makan / c_hari_kerja;
                v_1_hari_hadir numeric := r_master.uang_kehadiran / c_hari_kerja;
            BEGIN
                IF v_pt_count >= 2 THEN
                    IF v_has_borongan THEN
                        -- Kasus: 1 PT Tetap + Borongan (atau lebih)
                        -- PT Tetap kena FULL (Tidak dibagi)
                        -- Borongan tidak kena (sudah dihandle di sistem borongan/tidak masuk sini krn ini report pabrik tetap)
                        v_potongan_5_minggu_makan := v_1_hari_makan;
                        v_potongan_5_minggu_hadir := v_1_hari_hadir;
                    ELSE
                        -- Kasus: 2 PT Tetap (Misal ADNAN + HANAN)
                        -- Potongan dibagi 2
                        v_potongan_5_minggu_makan := v_1_hari_makan / 2;
                        v_potongan_5_minggu_hadir := v_1_hari_hadir / 2;
                    END IF;
                ELSE
                    -- Kasus: 1 PT Saja
                    -- Instruksi: "Hanya 1 PT... Tidak ada potongan multi-PT"
                    -- Jadi jika M=5 tapi cuma kerja di 1 PT, tidak dipotong.
                    v_potongan_5_minggu_makan := 0;
                    v_potongan_5_minggu_hadir := 0;
                END IF;
            END;
        END IF;

        -- E. Hitung Final Uang Makan & Hadir
        v_uang_makan := r_master.uang_makan - v_potongan_lp_tm_makan - v_potongan_absen - v_potongan_5_minggu_makan;
        v_uang_kehadiran := r_master.uang_kehadiran - v_potongan_lp_tm_hadir - v_potongan_absen - v_potongan_5_minggu_hadir;

        -- Safety: Tidak boleh minus
        IF v_uang_makan < 0 THEN v_uang_makan := 0; END IF;
        IF v_uang_kehadiran < 0 THEN v_uang_kehadiran := 0; END IF;

        -- F. Bonus (Hangus jika ada pelanggaran atau LP/TM tertentu, sesuaikan rule lama)
        IF (v_sakit_b + v_izin_b + v_telat_b) > 0 THEN
            v_bonus := 0;
        ELSE
            v_bonus := r_master.bonus;
        END IF;

        -- Ambil Penyesuaian & Kasbon (Manual Input)
        SELECT penyesuaian_bonus, kasbon INTO v_penyesuaian, v_kasbon
        FROM penyesuaian_gaji_pabrik
        WHERE kode = p_kode AND bulan = p_bulan AND perusahaan = p_perusahaan;
        
        v_penyesuaian := COALESCE(v_penyesuaian, 0);
        v_kasbon := COALESCE(v_kasbon, 0);

    END IF; -- End Periode 2 Logic

    -- 6. Total Gaji
    v_total_gaji := v_gapok + v_gaji_lembur + v_uang_makan + v_uang_kehadiran + v_bonus + v_penyesuaian - v_kasbon;

    -- 7. Upsert ke Laporan Bulanan
    -- Cek apakah data sudah ada
    UPDATE laporan_bulanan_pabrik
    SET 
        nama = r_karyawan.nama,
        divisi = r_karyawan.divisi,
        grade_p1 = CASE WHEN p_target_periode = 'Periode 1' THEN r_karyawan.grade_p1 ELSE grade_p1 END,
        grade_p2 = CASE WHEN p_target_periode = 'Periode 2' THEN r_karyawan.grade_p2 ELSE grade_p2 END,
        h = v_hadir,
        set_h = v_setengah,
        s_b = v_sakit_b,
        i_b = v_izin_b,
        t_b = v_telat_b,
        lp = v_lp,
        tm = v_tm,
        lembur = v_lembur_jam,
        gapok = v_gapok,
        gaji_lembur = v_gaji_lembur,
        u_m = v_uang_makan,
        u_k = v_uang_kehadiran,
        uang_bonus = v_bonus,
        penyesuaian_bonus = v_penyesuaian,
        kasbon = v_kasbon,
        hasil_gaji = v_total_gaji,
        updated_at = NOW()
    WHERE kode = p_kode AND bulan = p_bulan AND perusahaan = p_perusahaan AND periode = p_target_periode;

    IF NOT FOUND THEN
        INSERT INTO laporan_bulanan_pabrik (
            bulan, periode, perusahaan, kode, nama, divisi, 
            grade_p1, grade_p2, 
            h, set_h, s_b, i_b, t_b, lp, tm, lembur,
            gapok, gaji_lembur, u_m, u_k, uang_bonus, penyesuaian_bonus, kasbon, hasil_gaji
        ) VALUES (
            p_bulan, p_target_periode, p_perusahaan, p_kode, r_karyawan.nama, r_karyawan.divisi,
            r_karyawan.grade_p1, r_karyawan.grade_p2,
            v_hadir, v_setengah, v_sakit_b, v_izin_b, v_telat_b, v_lp, v_tm, v_lembur_jam,
            v_gapok, v_gaji_lembur, v_uang_makan, v_uang_kehadiran, v_bonus, v_penyesuaian, v_kasbon, v_total_gaji
        );
    END IF;

END;
$$;
