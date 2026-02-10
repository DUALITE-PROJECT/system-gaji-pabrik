-- [FIX V2] ROBUST SYNC LOGIC (HANDLE DUPLICATES)
-- Menggunakan DISTINCT ON untuk memastikan data master terbaru yang diambil
-- Mencegah isu di mana data lama (Grade A) menimpa data baru (Grade B) jika ada duplikat

CREATE OR REPLACE FUNCTION public.ui_sync_master_gaji_harian_pabrik(p_bulan text)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INT := 0;
BEGIN
    -- 1. Siapkan Data Master Unik (Ambil yang paling baru diupdate)
    --    Menggunakan CTE untuk performa dan kejelasan
    CREATE TEMP TABLE IF NOT EXISTS temp_master_unique AS
    SELECT DISTINCT ON (kode, bulan) 
        kode, 
        bulan, 
        nama, 
        grade_p1, 
        grade_p2, 
        divisi, 
        bagian,
        perusahaan
    FROM public.data_karyawan_pabrik_garut
    WHERE bulan = p_bulan
    ORDER BY kode, bulan, updated_at DESC;

    -- 2. Update Periode 1
    UPDATE public.gaji_harian_pabrik_garut t
    SET 
        grade = m.grade_p1,
        divisi = m.divisi,
        bagian = m.bagian,
        nama = m.nama
        -- Perusahaan TIDAK diupdate untuk menjaga history jika ada mutasi
    FROM temp_master_unique m
    WHERE t.kode = m.kode 
      AND t.bulan = m.bulan
      AND t.periode = 'Periode 1';
      
    -- 3. Update Periode 2
    UPDATE public.gaji_harian_pabrik_garut t
    SET 
        grade = m.grade_p2,
        divisi = m.divisi,
        bagian = m.bagian,
        nama = m.nama
    FROM temp_master_unique m
    WHERE t.kode = m.kode 
      AND t.bulan = m.bulan
      AND t.periode = 'Periode 2';

    -- Bersihkan temp table
    DROP TABLE IF EXISTS temp_master_unique;

    RETURN 'Sinkronisasi Data Berhasil (V2 - Deduplicated)';
END;
$function$;

-- Tambahkan Index untuk mempercepat pencarian
CREATE INDEX IF NOT EXISTS idx_dk_pabrik_garut_kode_bulan_updated ON public.data_karyawan_pabrik_garut(kode, bulan, updated_at DESC);

NOTIFY pgrst, 'reload config';
