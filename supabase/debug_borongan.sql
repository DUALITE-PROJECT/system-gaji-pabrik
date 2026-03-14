-- [DEBUG] Analisa Kenapa Bonus Borongan 0
-- Jalankan script ini di SQL Editor untuk melihat hasilnya

-- 1. Cek Data Absensi untuk Karyawan Tertentu
SELECT 
    tanggal, kode, nama, kehadiran, lembur, keterangan
FROM input_absensi_harian_borongan
WHERE kode = 'B001' AND bulan ILIKE '%Maret%';

-- 2. Cek Master Gaji yang Cocok
SELECT 
    m.grade, m.bulan, m.gaji_pokok, m.gaji_harian, m.bonus
FROM master_gaji m
JOIN input_absensi_harian_borongan a ON m.grade = a.grade
WHERE a.kode = 'B001' AND a.bulan ILIKE '%Maret%'
LIMIT 1;

-- 3. Cek Output Produksi pada Tanggal Tersebut
SELECT 
    tanggal, SUM(total_hasil) as total_output
FROM output_harian_pabrik
WHERE tanggal IN (SELECT tanggal FROM input_absensi_harian_borongan WHERE kode = 'B001' AND bulan ILIKE '%Maret%')
GROUP BY tanggal;

-- 4. Cek Data Akhir di Tabel Gaji Harian
SELECT 
    tanggal, kode, gaji_dasar, porsi_awal, jam_kerja, sisa_potongan, bonus_redistribusi, gaji, bonus, info_debug
FROM gaji_harian_borongan_pabrik_garut
WHERE kode = 'B001' AND bulan ILIKE '%Maret%';
