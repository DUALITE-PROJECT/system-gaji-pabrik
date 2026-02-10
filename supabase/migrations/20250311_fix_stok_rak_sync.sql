-- FUNGSI: Hitung Ulang Stok Rak per SKU berdasarkan Riwayat Mutasi
-- Logic: Base (Stock Opname Terakhir) + Masuk - Keluar

CREATE OR REPLACE FUNCTION recalculate_stock_rak(p_sku_id INT)
RETURNS NUMERIC AS $$
DECLARE
    v_last_so_date TIMESTAMPTZ;
    v_base_stock NUMERIC := 0;
    v_inbound NUMERIC := 0;
    v_outbound NUMERIC := 0;
    v_final_stock NUMERIC := 0;
BEGIN
    -- 1. Cari Stock Opname Terakhir (Sebagai Base)
    SELECT created_at, jumlah INTO v_last_so_date, v_base_stock
    FROM riwayat_mutasi
    WHERE sku_id = p_sku_id 
      AND (lokasi_tujuan ILIKE '%Rak%' OR lokasi_asal ILIKE '%Rak%')
      AND jenis_mutasi = 'Stock Opname'
    ORDER BY created_at DESC
    LIMIT 1;

    -- Jika tidak ada SO, mulai dari 0
    IF v_last_so_date IS NULL THEN
        v_last_so_date := '2000-01-01';
        v_base_stock := 0;
    END IF;

    -- 2. Hitung Barang Masuk (Inbound) SETELAH SO Terakhir
    -- Masuk = Tujuan ke Rak
    SELECT COALESCE(SUM(jumlah), 0) INTO v_inbound
    FROM riwayat_mutasi
    WHERE sku_id = p_sku_id
      AND lokasi_tujuan ILIKE '%Rak%'
      AND jenis_mutasi != 'Stock Opname'
      AND created_at > v_last_so_date;

    -- 3. Hitung Barang Keluar (Outbound) SETELAH SO Terakhir
    -- Keluar = Asal dari Rak
    SELECT COALESCE(SUM(jumlah), 0) INTO v_outbound
    FROM riwayat_mutasi
    WHERE sku_id = p_sku_id
      AND lokasi_asal ILIKE '%Rak%'
      AND jenis_mutasi != 'Stock Opname'
      AND created_at > v_last_so_date;

    -- 4. Hitung Stok Akhir
    v_final_stock := v_base_stock + v_inbound - v_outbound;

    -- 5. Update Tabel Stok Rak
    -- Pastikan row ada, jika tidak insert
    IF EXISTS (SELECT 1 FROM stok_rak WHERE sku_id = p_sku_id AND kode_rak = 'Rak Display') THEN
        UPDATE stok_rak SET quantity = v_final_stock, updated_at = NOW() 
        WHERE sku_id = p_sku_id AND kode_rak = 'Rak Display';
    ELSE
        IF v_final_stock > 0 THEN
            INSERT INTO stok_rak (sku_id, kode_rak, quantity) VALUES (p_sku_id, 'Rak Display', v_final_stock);
        END IF;
    END IF;

    RETURN v_final_stock;
END;
$$ LANGUAGE plpgsql;

-- FUNGSI: Gabungkan Duplikat di Stok Rak (Cleanup)
CREATE OR REPLACE FUNCTION merge_duplicate_stok_rak()
RETURNS VOID AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT sku_id, kode_rak, COUNT(*) as cnt
        FROM stok_rak
        GROUP BY sku_id, kode_rak
        HAVING COUNT(*) > 1
    LOOP
        -- Update row pertama dengan total jumlah
        UPDATE stok_rak
        SET quantity = (SELECT SUM(quantity) FROM stok_rak WHERE sku_id = r.sku_id AND kode_rak = r.kode_rak)
        WHERE id = (SELECT MIN(id) FROM stok_rak WHERE sku_id = r.sku_id AND kode_rak = r.kode_rak);

        -- Hapus row sisanya
        DELETE FROM stok_rak
        WHERE sku_id = r.sku_id 
          AND kode_rak = r.kode_rak 
          AND id != (SELECT MIN(id) FROM stok_rak WHERE sku_id = r.sku_id AND kode_rak = r.kode_rak);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- FUNGSI WRAPPER: Hitung Ulang Semua (Untuk Tombol UI)
CREATE OR REPLACE FUNCTION recalculate_all_stocks_rak()
RETURNS TEXT AS $$
DECLARE
    r RECORD;
    v_count INT := 0;
BEGIN
    -- 1. Bersihkan duplikat dulu
    PERFORM merge_duplicate_stok_rak();

    -- 2. Loop semua SKU yang pernah ada interaksi dengan Rak
    FOR r IN 
        SELECT DISTINCT sku_id FROM riwayat_mutasi WHERE lokasi_tujuan ILIKE '%Rak%' OR lokasi_asal ILIKE '%Rak%'
        UNION
        SELECT DISTINCT sku_id FROM stok_rak WHERE kode_rak ILIKE '%Rak%'
    LOOP
        PERFORM recalculate_stock_rak(r.sku_id);
        v_count := v_count + 1;
    END LOOP;

    RETURN 'Berhasil sinkronisasi ' || v_count || ' SKU berdasarkan riwayat mutasi.';
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION recalculate_all_stocks_rak() TO authenticated, service_role;
NOTIFY pgrst, 'reload config';
