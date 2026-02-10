-- FUNGSI HITUNG ULANG LAPORAN BULANAN GARUT (UPDATE LOGIC B & SET_H)
-- Rule:
-- 1. Kolom 'b': Hitung jumlah kehadiran 'B'. Periode 2 bersifat kumulatif (P1 + P2).
-- 2. Kolom 'set_h': Jumlahkan nilai kehadiran angka (misal 0.5, 1). Periode 2 bersifat kumulatif (P1 + P2).

CREATE OR REPLACE FUNCTION public.calculate_garut_monthly_report(p_bulan text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Update Kolom B dan Set_H dengan Logika Baru
    UPDATE public.laporan_bulanan_pabrik_garut lb
    SET 
        -- LOGIKA KOLOM B (Hitung Jumlah 'B')
        b = (
            SELECT COUNT(*) 
            FROM public.presensi_harian_pabrik_garut ph 
            WHERE ph.bulan = lb.bulan 
              AND ph.kode = lb.kode 
              AND ph.perusahaan = lb.perusahaan
              AND UPPER(ph.kehadiran) = 'B'
              AND (
                  -- Jika Laporan Periode 1, hanya hitung Presensi Periode 1
                  (lb.periode = 'Periode 1' AND ph.periode = 'Periode 1')
                  OR 
                  -- Jika Laporan Periode 2, hitung Presensi Periode 1 + Periode 2 (KUMULATIF)
                  (lb.periode = 'Periode 2' AND ph.periode IN ('Periode 1', 'Periode 2'))
              )
        ),
        
        -- LOGIKA KOLOM SET_H (Jumlahkan Nilai Angka)
        set_h = (
            SELECT COALESCE(SUM(CAST(ph.kehadiran AS NUMERIC)), 0)
            FROM public.presensi_harian_pabrik_garut ph 
            WHERE ph.bulan = lb.bulan 
              AND ph.kode = lb.kode 
              AND ph.perusahaan = lb.perusahaan
              -- Cek apakah isi kolom kehadiran adalah angka (regex)
              AND ph.kehadiran ~ '^[0-9]+(\.[0-9]+)?$' 
              AND (
                  -- Jika Laporan Periode 1, hanya hitung Presensi Periode 1
                  (lb.periode = 'Periode 1' AND ph.periode = 'Periode 1')
                  OR 
                  -- Jika Laporan Periode 2, hitung Presensi Periode 1 + Periode 2 (KUMULATIF)
                  (lb.periode = 'Periode 2' AND ph.periode IN ('Periode 1', 'Periode 2'))
              )
        ),
        
        updated_at = NOW()
    WHERE lb.bulan = p_bulan;
END;
$function$;
