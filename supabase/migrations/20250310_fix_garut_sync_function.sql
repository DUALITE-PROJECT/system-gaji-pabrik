-- MEMPERBAIKI FUNGSI SINKRONISASI & RELOAD CACHE
-- Masalah: Frontend tidak bisa memanggil function karena belum terbaca di cache PostgREST

-- 1. Re-Create Fungsi Sync dengan Return Type TEXT (untuk feedback ke UI)
CREATE OR REPLACE FUNCTION public.sync_garut_laporan_bulanan(p_bulan TEXT)
RETURNS TEXT AS $$
DECLARE
    v_count INT;
BEGIN
    -- A. Hapus data lama di laporan bulanan untuk bulan ini (agar tidak duplikat)
    DELETE FROM public.laporan_bulanan_pabrik_garut WHERE bulan = p_bulan;

    -- B. Salin data dari total_gaji_pabrik_garut (Filter Non-Borongan)
    INSERT INTO public.laporan_bulanan_pabrik_garut (
        bulan, periode, kode, nama, perusahaan, bagian, divisi,
        grade, grade_p1, grade_p2,
        h, b, i_b, i_tb, s_b, s_tb, t_b, t_tb, set_h, lp, tm, lembur,
        gapok, gaji_lembur, u_m, u_k, uang_bonus, kasbon, penyesuaian_bonus, hasil_gaji,
        keterangan, keluar_masuk, created_at, updated_at
    )
    SELECT 
        bulan, periode, kode, nama, perusahaan, bagian, divisi,
        grade, grade_p1, grade_p2,
        h, b, i_b, i_tb, s_b, s_tb, t_b, t_tb, set_h, lp, tm, lembur,
        gapok, gaji_lembur, u_m, u_k, uang_bonus, kasbon, penyesuaian_bonus, hasil_gaji,
        keterangan, keluar_masuk, NOW(), NOW()
    FROM public.total_gaji_pabrik_garut
    WHERE bulan = p_bulan
      -- Filter Non-Borongan yang Lebih Ketat & Aman (Case Insensitive + Trim)
      AND (perusahaan IS NULL OR UPPER(TRIM(perusahaan)) NOT LIKE '%BORONGAN%')
      AND (bagian IS NULL OR UPPER(TRIM(bagian)) NOT LIKE '%BORONGAN%')
      AND (divisi IS NULL OR UPPER(TRIM(divisi)) NOT LIKE '%BORONGAN%');

    -- C. Cek berapa data yang berhasil masuk
    SELECT COUNT(*) INTO v_count FROM public.laporan_bulanan_pabrik_garut WHERE bulan = p_bulan;
    
    RETURN 'Berhasil sinkronisasi ' || v_count || ' data.';
END;
$$ LANGUAGE plpgsql;

-- 2. Grant Permissions Explicitly
GRANT EXECUTE ON FUNCTION public.sync_garut_laporan_bulanan(TEXT) TO anon, authenticated, service_role;

-- 3. CRITICAL: Force PostgREST Schema Cache Reload
-- Ini memberitahu API untuk membaca ulang struktur database agar function baru terlihat
NOTIFY pgrst, 'reload config';
