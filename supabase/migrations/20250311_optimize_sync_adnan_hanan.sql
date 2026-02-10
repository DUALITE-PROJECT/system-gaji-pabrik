-- Migration: Optimize Sync Adnan & Hanan (Fix Timeout 57014)

-- 1. Create Indexes for Performance (Idempotent)
CREATE INDEX IF NOT EXISTS idx_gh_pabrik_garut_bulan_kode ON public.gaji_harian_pabrik_garut(bulan, kode);
CREATE INDEX IF NOT EXISTS idx_dk_pabrik_garut_bulan_kode ON public.data_karyawan_pabrik_garut(bulan, kode);

-- 2. Optimize Sync Function (Bulk Update)
CREATE OR REPLACE FUNCTION public.ui_sync_master_gaji_harian_pabrik(p_bulan text)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INT := 0;
BEGIN
    -- Update Periode 1 (Bulk Update using JOIN)
    UPDATE public.gaji_harian_pabrik_garut t
    SET 
        grade = m.grade_p1,
        divisi = m.divisi,
        bagian = m.bagian,
        nama = m.nama
        -- Note: Perusahaan TIDAK diupdate sesuai request (Business Rule)
    FROM public.data_karyawan_pabrik_garut m
    WHERE t.kode = m.kode 
      AND t.bulan = m.bulan
      AND t.bulan = p_bulan
      AND t.periode = 'Periode 1';
      
    -- Update Periode 2 (Bulk Update using JOIN)
    UPDATE public.gaji_harian_pabrik_garut t
    SET 
        grade = m.grade_p2,
        divisi = m.divisi,
        bagian = m.bagian,
        nama = m.nama
        -- Note: Perusahaan TIDAK diupdate sesuai request (Business Rule)
    FROM public.data_karyawan_pabrik_garut m
    WHERE t.kode = m.kode 
      AND t.bulan = m.bulan
      AND t.bulan = p_bulan
      AND t.periode = 'Periode 2';

    RETURN 'Sinkronisasi Data Berhasil (Optimized)';
END;
$function$;

-- 3. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload config';
