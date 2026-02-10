-- 1. Tambahkan Kolom Baru ke Tabel Gaji Harian
ALTER TABLE public.gaji_harian_pabrik_garut ADD COLUMN IF NOT EXISTS bagian TEXT;
ALTER TABLE public.gaji_harian_pabrik_garut ADD COLUMN IF NOT EXISTS keluar_masuk TEXT;

-- 2. Update Function Sync untuk Mengisi Kolom Baru Otomatis
CREATE OR REPLACE FUNCTION sync_presensi_to_gaji_harian()
RETURNS TRIGGER AS $$
DECLARE
    v_divisi TEXT;
    v_grade TEXT;
    v_bagian TEXT;
    v_keluar_masuk TEXT;
BEGIN
    -- Handle Delete
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM public.gaji_harian_pabrik_garut 
        WHERE tanggal = OLD.tanggal AND kode = OLD.kode;
        RETURN OLD;
    END IF;

    -- Ambil Data dari Master Karyawan (Bagian & Keterangan untuk Keluar/Masuk)
    SELECT divisi, bagian, keterangan 
    INTO v_divisi, v_bagian, v_keluar_masuk
    FROM public.data_karyawan_pabrik_garut
    WHERE kode = NEW.kode AND bulan = NEW.bulan 
    LIMIT 1;

    -- Tentukan Grade berdasarkan Periode
    IF NEW.periode = 'Periode 2' THEN v_grade := NEW.grade_p2;
    ELSE v_grade := NEW.grade_p1; END IF;

    -- Insert atau Update ke Gaji Harian
    INSERT INTO public.gaji_harian_pabrik_garut (
        tanggal, kode, grade, bulan, kehadiran, lembur, 
        periode, perusahaan, keterangan, 
        divisi, bagian, keluar_masuk, -- Kolom Baru
        gaji, updated_at
    ) VALUES (
        NEW.tanggal, NEW.kode, v_grade, NEW.bulan, NEW.kehadiran, NEW.lembur,
        NEW.periode, NEW.perusahaan, NEW.keterangan, 
        v_divisi, v_bagian, v_keluar_masuk, -- Value Baru
        0, NOW()
    )
    ON CONFLICT (tanggal, kode) DO UPDATE SET
        grade = EXCLUDED.grade, 
        bulan = EXCLUDED.bulan, 
        kehadiran = EXCLUDED.kehadiran,
        lembur = EXCLUDED.lembur, 
        periode = EXCLUDED.periode, 
        perusahaan = EXCLUDED.perusahaan,
        keterangan = EXCLUDED.keterangan, 
        divisi = EXCLUDED.divisi, 
        bagian = EXCLUDED.bagian,             -- Update Bagian
        keluar_masuk = EXCLUDED.keluar_masuk, -- Update Keluar Masuk
        updated_at = NOW();
        
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Backfill Data Lama (Isi data yang sudah ada)
UPDATE public.gaji_harian_pabrik_garut g
SET 
    bagian = k.bagian,
    keluar_masuk = k.keterangan
FROM public.data_karyawan_pabrik_garut k
WHERE g.kode = k.kode AND g.bulan = k.bulan;

NOTIFY pgrst, 'reload config';
