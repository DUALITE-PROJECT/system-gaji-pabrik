-- ==========================================
-- LOGIC UPDATE: KOLOM KETERANGAN (GARUT)
-- Priority: 1. Libur Pribadi, 2. Libur Perusahaan
-- ==========================================

-- 1. Create Function to Calculate Keterangan
CREATE OR REPLACE FUNCTION get_keterangan_garut(p_kode TEXT, p_bulan TEXT)
RETURNS TEXT AS $$
DECLARE
    v_result TEXT;
BEGIN
    -- Priority 1: Cek 'libur pribadi'
    SELECT keterangan INTO v_result
    FROM presensi_harian_pabrik_garut
    WHERE kode = p_kode 
      AND bulan = p_bulan 
      AND keterangan = 'libur pribadi'
    LIMIT 1;

    IF FOUND THEN
        RETURN 'libur pribadi';
    END IF;

    -- Priority 2: Cek 'libur perusahaan'
    SELECT keterangan INTO v_result
    FROM presensi_harian_pabrik_garut
    WHERE kode = p_kode 
      AND bulan = p_bulan 
      AND keterangan = 'libur perusahaan'
    LIMIT 1;

    IF FOUND THEN
        RETURN 'libur perusahaan';
    END IF;

    -- Priority 3: NULL if neither found
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Create Trigger Function to Auto-Update Total Gaji
CREATE OR REPLACE FUNCTION trigger_update_keterangan_garut()
RETURNS TRIGGER AS $$
DECLARE
    target_kode TEXT;
    target_bulan TEXT;
    new_ket TEXT;
BEGIN
    -- Determine target based on operation
    IF (TG_OP = 'DELETE') THEN
        target_kode := OLD.kode;
        target_bulan := OLD.bulan;
    ELSE
        target_kode := NEW.kode;
        target_bulan := NEW.bulan;
    END IF;

    -- Calculate new keterangan using the logic function
    new_ket := get_keterangan_garut(target_kode, target_bulan);

    -- Update total_gaji_pabrik_garut (All periods for this kode+bulan)
    UPDATE total_gaji_pabrik_garut
    SET keterangan = new_ket
    WHERE kode = target_kode AND bulan = target_bulan;

    -- Handle case where UPDATE changes kode or bulan (Update OLD record too)
    IF (TG_OP = 'UPDATE' AND (OLD.kode IS DISTINCT FROM NEW.kode OR OLD.bulan IS DISTINCT FROM NEW.bulan)) THEN
        target_kode := OLD.kode;
        target_bulan := OLD.bulan;
        new_ket := get_keterangan_garut(target_kode, target_bulan);
        
        UPDATE total_gaji_pabrik_garut
        SET keterangan = new_ket
        WHERE kode = target_kode AND bulan = target_bulan;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach Trigger to Presensi Harian
DROP TRIGGER IF EXISTS on_presensi_garut_change_keterangan ON presensi_harian_pabrik_garut;

CREATE TRIGGER on_presensi_garut_change_keterangan
AFTER INSERT OR UPDATE OF keterangan, kode, bulan OR DELETE
ON presensi_harian_pabrik_garut
FOR EACH ROW
EXECUTE FUNCTION trigger_update_keterangan_garut();

-- 4. Helper Function to Sync Existing Data (Manual Run)
CREATE OR REPLACE FUNCTION sync_all_keterangan_garut(p_bulan TEXT)
RETURNS TEXT AS $$
DECLARE
    r RECORD;
    v_ket TEXT;
    v_count INT := 0;
BEGIN
    -- Loop through all unique employees in total_gaji for the month
    FOR r IN 
        SELECT DISTINCT kode 
        FROM total_gaji_pabrik_garut 
        WHERE bulan = p_bulan
    LOOP
        v_ket := get_keterangan_garut(r.kode, p_bulan);
        
        UPDATE total_gaji_pabrik_garut
        SET keterangan = v_ket
        WHERE kode = r.kode AND bulan = p_bulan;
        
        v_count := v_count + 1;
    END LOOP;

    RETURN 'Synced keterangan for ' || v_count || ' employees in ' || p_bulan;
END;
$$ LANGUAGE plpgsql;

-- 5. Force Sync Function Wrapper (Optional, integrates with existing buttons)
CREATE OR REPLACE FUNCTION force_sync_garut_keterangan_only(p_bulan TEXT)
RETURNS VOID AS $$
BEGIN
    PERFORM sync_all_keterangan_garut(p_bulan);
END;
$$ LANGUAGE plpgsql;
