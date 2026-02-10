-- Create View for UI Access (v_gaji_harian_garut_ui)
-- This view mirrors the table 'gaji_harian_pabrik_garut' to ensure stable UI binding
CREATE OR REPLACE VIEW public.v_gaji_harian_garut_ui AS
SELECT 
    id,
    tanggal,
    kode,
    nama,
    grade,
    divisi,
    bagian,
    perusahaan,
    bulan,
    periode,
    kehadiran,
    lembur,
    keluar_masuk,
    keterangan,
    gaji,
    created_at,
    updated_at
FROM public.gaji_harian_pabrik_garut;

-- Grant Permissions to ensure API can read it
GRANT SELECT ON public.v_gaji_harian_garut_ui TO anon, authenticated, service_role;

-- Refresh Schema Cache to make it immediately available
NOTIFY pgrst, 'reload config';
