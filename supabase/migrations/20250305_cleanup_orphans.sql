-- FUNGSI CLEANUP ORPHANS (Menghapus data laporan yang tidak memiliki presensi)
CREATE OR REPLACE FUNCTION public.cleanup_monthly_report_orphans(p_bulan TEXT)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_deleted_count INT := 0;
BEGIN
    -- Hapus dari laporan_bulanan_pabrik jika kode tidak ada di presensi_harian_pabrik pada bulan yang sama
    DELETE FROM public.laporan_bulanan_pabrik l
    WHERE l.bulan = p_bulan
      AND NOT EXISTS (
          SELECT 1 
          FROM public.presensi_harian_pabrik p 
          WHERE p.kode = l.kode 
            AND p.bulan = l.bulan
      );
      
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RETURN 'Cleanup selesai. Menghapus ' || v_deleted_count || ' data yatim.';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cleanup_monthly_report_orphans(TEXT) TO authenticated, service_role;
NOTIFY pgrst, 'reload config';
