-- SCRIPT UNTUK DEBUGGING BORONGAN GARUT

-- 1. Cek isi tabel presensi borongan (Apakah data masuk?)
SELECT * FROM presensi_harian_borongan_pabrik_garut LIMIT 10;

-- 2. Cek isi tabel gaji borongan (Apakah sync berjalan?)
SELECT * FROM gaji_harian_borongan_pabrik_garut LIMIT 10;

-- 3. Cek Output Produksi (Apakah ada output di tanggal tersebut?)
SELECT tanggal, SUM(total_hasil) as total_output 
FROM output_harian_pabrik 
GROUP BY tanggal 
ORDER BY tanggal DESC LIMIT 10;

-- 4. Cek Master Gaji (Apakah grade yang diinput ada di master?)
SELECT * FROM master_gaji;
