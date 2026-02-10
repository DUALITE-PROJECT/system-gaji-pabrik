-- MEMPERBAIKI ERROR: function calculate_gaji_borongan_garut_by_date(date) does not exist
-- Error ini muncul karena ada Trigger di tabel output_harian_pabrik yang memanggil fungsi ini,
-- tapi fungsinya belum didefinisikan.

CREATE OR REPLACE FUNCTION calculate_gaji_borongan_garut_by_date(p_tanggal DATE)
RETURNS VOID AS $$
BEGIN
    -- Fungsi ini diperlukan oleh Trigger Database agar proses simpan tidak error.
    -- Saat ini, perhitungan gaji borongan yang kompleks (pembagian proporsional)
    -- ditangani melalui menu "Gaji Borongan" -> tombol "Hitung Ulang" di aplikasi.
    
    -- Kita biarkan kosong (NULL) agar insert/update berhasil.
    -- Jika ingin otomatisasi penuh di backend, logika hitung bisa dipindahkan ke sini nanti.
    NULL;
END;
$$ LANGUAGE plpgsql;

-- Berikan hak akses
GRANT EXECUTE ON FUNCTION calculate_gaji_borongan_garut_by_date(DATE) TO authenticated, service_role;

-- Refresh schema cache
NOTIFY pgrst, 'reload config';
