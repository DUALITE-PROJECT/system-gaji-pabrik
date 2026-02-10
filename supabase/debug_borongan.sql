-- ============================================================
-- SCRIPT DIAGNOSA DATA GAJI BORONGAN (GARUT)
-- Jalankan ini untuk melihat apakah data benar-benar ada
-- ============================================================

-- 1. Cek Total Baris Data di Tabel Borongan
SELECT 
    'Total Data' as info, 
    COUNT(*) as jumlah_baris 
FROM public.data_gaji_borongan_pabrik_garut;

-- 2. Cek Bulan Apa Saja yang Tersedia (Untuk memastikan format string bulan)
SELECT 
    bulan, 
    COUNT(*) as jumlah_data 
FROM public.data_gaji_borongan_pabrik_garut 
GROUP BY bulan;

-- 3. Cek Sample 5 Data Teratas (Untuk memastikan kolom terisi)
SELECT 
    id, tanggal, kode, nama, bulan, periode, gaji, bonus 
FROM public.data_gaji_borongan_pabrik_garut 
ORDER BY created_at DESC 
LIMIT 5;

-- 4. Cek Apakah Ada Data yang 'Nyasar' (Bulan NULL atau Kosong)
SELECT COUNT(*) as data_tanpa_bulan 
FROM public.data_gaji_borongan_pabrik_garut 
WHERE bulan IS NULL OR bulan = '';
