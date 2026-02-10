-- WRAPPER FUNCTION FOR SYNC INFO KARYAWAN
-- Tujuan: Menormalkan input (Trim) sebelum memanggil fungsi utama
-- Agar hasil UI konsisten dengan SQL Editor

CREATE OR REPLACE FUNCTION public.ui_sync_info_karyawan_gaji_harian(p_bulan text)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
    v_clean_bulan text;
    v_result text;
BEGIN
    -- 1. Normalisasi Input (Trim whitespace)
    -- Kita tidak melakukan LOWER() karena data bulan di database biasanya Title Case (e.g., "Desember 2025")
    -- dan fungsi utama menggunakan operator '=' yang case-sensitive.
    v_clean_bulan := TRIM(p_bulan);
    
    -- 2. Panggil fungsi utama dengan parameter bersih
    v_result := public.ui_sync_master_gaji_harian_pabrik(v_clean_bulan);
    
    RETURN v_result;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.ui_sync_info_karyawan_gaji_harian(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload config';
