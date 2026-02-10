-- =================================================================
-- UPDATE LOGIC: PEMBAGIAN PROPORSIONAL GAJI GARUT (U_K, U_M, BONUS, KASBON)
-- Sumber: total_gaji_pabrik_garut (Periode 2)
-- Target: laporan_bulanan_pabrik_garut
-- Logic: (Nilai Total / Total H Semua PT) * H Perusahaan
-- =================================================================

CREATE OR REPLACE FUNCTION update_garut_proporsional_values(p_bulan TEXT)
RETURNS TEXT AS $$
DECLARE
    v_count_p1 INT;
    v_count_p2 INT;
BEGIN
    -- 1. RESET PERIODE 1 KE 0
    -- Sesuai aturan: Periode 1 selalu 0 untuk komponen ini
    UPDATE laporan_bulanan_pabrik_garut
    SET u_k = 0, u_m = 0, uang_bonus = 0, kasbon = 0
    WHERE bulan = p_bulan AND periode = 'Periode 1';
    
    GET DIAGNOSTICS v_count_p1 = ROW_COUNT;

    -- 2. UPDATE PERIODE 2 SECARA PROPORSIONAL
    -- Menggunakan CTE untuk menghitung rasio terlebih dahulu
    WITH calculated_data AS (
        SELECT 
            lb.id,
            lb.kode,
            lb.perusahaan,
            lb.h as h_perusahaan,
            -- Hitung Total H karyawan ini di SEMUA perusahaan pada bulan tersebut
            (
                SELECT SUM(sub_lb.h) 
                FROM laporan_bulanan_pabrik_garut sub_lb 
                WHERE sub_lb.kode = lb.kode AND sub_lb.bulan = p_bulan
            ) as total_h_semua,
            -- Ambil nilai sumber dari total_gaji (Periode 2)
            tg.u_k as src_uk,
            tg.u_m as src_um,
            tg.uang_bonus as src_bonus,
            tg.kasbon as src_kasbon
        FROM laporan_bulanan_pabrik_garut lb
        JOIN total_gaji_pabrik_garut tg ON lb.kode = tg.kode AND lb.bulan = tg.bulan
        WHERE lb.bulan = p_bulan 
          AND lb.periode = 'Periode 2'
          AND tg.periode = 'Periode 2' -- Pastikan ambil sumber dari Periode 2
    )
    UPDATE laporan_bulanan_pabrik_garut target
    SET 
        -- Rumus: (Source / Total_H) * H_Perusahaan
        -- Handle division by zero dengan NULLIF
        u_k = CASE 
            WHEN cd.total_h_semua > 0 THEN (cd.src_uk::numeric / cd.total_h_semua) * cd.h_perusahaan 
            ELSE 0 
        END,
        u_m = CASE 
            WHEN cd.total_h_semua > 0 THEN (cd.src_um::numeric / cd.total_h_semua) * cd.h_perusahaan 
            ELSE 0 
        END,
        uang_bonus = CASE 
            WHEN cd.total_h_semua > 0 THEN (cd.src_bonus::numeric / cd.total_h_semua) * cd.h_perusahaan 
            ELSE 0 
        END,
        kasbon = CASE 
            WHEN cd.total_h_semua > 0 THEN (cd.src_kasbon::numeric / cd.total_h_semua) * cd.h_perusahaan 
            ELSE 0 
        END
    FROM calculated_data cd
    WHERE target.id = cd.id;

    GET DIAGNOSTICS v_count_p2 = ROW_COUNT;

    -- 3. UPDATE TOTAL GAJI AKHIR (HASIL_GAJI)
    -- Setelah komponen diupdate, hitung ulang total gaji per baris
    -- Rumus: Gapok + Lembur + U_M + U_K + Bonus - Kasbon + Penyesuaian
    UPDATE laporan_bulanan_pabrik_garut
    SET hasil_gaji = (
        COALESCE(gapok, 0) + 
        COALESCE(gaji_lembur, 0) + 
        COALESCE(u_m, 0) + 
        COALESCE(u_k, 0) + 
        COALESCE(uang_bonus, 0) - 
        COALESCE(kasbon, 0) + 
        COALESCE(penyesuaian_bonus, 0)
    )
    WHERE bulan = p_bulan;

    RETURN 'Sukses. Reset P1: ' || v_count_p1 || ' baris. Update Proporsional P2: ' || v_count_p2 || ' baris.';
END;
$$ LANGUAGE plpgsql;
