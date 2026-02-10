-- Fungsi untuk menghapus Laporan Bulanan yang tidak memiliki data di Presensi Harian
CREATE OR REPLACE FUNCTION cleanup_monthly_report_orphans(p_bulan text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count int;
BEGIN
    -- Jika bulan spesifik dipilih
    IF p_bulan IS NOT NULL AND p_bulan != '' THEN
        DELETE FROM public.laporan_bulanan_pabrik l
        WHERE l.bulan = p_bulan
        AND NOT EXISTS (
            SELECT 1
            FROM public.presensi_harian_pabrik p
            WHERE p.bulan = l.bulan
              AND p.kode = l.kode
              AND p.perusahaan = l.perusahaan
        );
    -- Jika tidak ada filter bulan (bersihkan semua)
    ELSE
        DELETE FROM public.laporan_bulanan_pabrik l
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.presensi_harian_pabrik p
            WHERE p.bulan = l.bulan
              AND p.kode = l.kode
              AND p.perusahaan = l.perusahaan
        );
    END IF;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN 'Berhasil membersihkan ' || deleted_count || ' data laporan yang tidak valid (tanpa sumber presensi).';
END;
$$;
