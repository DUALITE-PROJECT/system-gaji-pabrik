-- MIGRATION FIX: Perbaikan & Optimasi Tabel Karyawan Pabrik
-- Jalankan setelah migration utama selesai

-- ============================================
-- 1. TAMBAH CHECK CONSTRAINT untuk jenis_kelamin
-- ============================================
DO $$
BEGIN
    -- Validasi jenis_kelamin hanya boleh 'L' atau 'P'
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name='check_jenis_kelamin' 
        AND table_name='karyawan_pabrik'
    ) THEN
        ALTER TABLE public.karyawan_pabrik 
        ADD CONSTRAINT check_jenis_kelamin 
        CHECK (jenis_kelamin IN ('L', 'P'));
        
        RAISE NOTICE 'Constraint check_jenis_kelamin berhasil ditambahkan';
    ELSE
        RAISE NOTICE 'Constraint check_jenis_kelamin sudah ada';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error menambahkan check_jenis_kelamin: %', SQLERRM;
END $$;

-- ============================================
-- 2. SET NOT NULL untuk Kolom Penting
-- ============================================
-- CATATAN: Jika ada data existing dengan nilai NULL, 
-- update dulu sebelum menjalankan perintah ini

DO $$
BEGIN
    -- Update data NULL jadi default value (opsional, sesuaikan dengan kebutuhan)
    UPDATE public.karyawan_pabrik SET kode = 'UNKNOWN' WHERE kode IS NULL;
    UPDATE public.karyawan_pabrik SET nama = 'N/A' WHERE nama IS NULL;
    UPDATE public.karyawan_pabrik SET bulan = 'Januari 2025' WHERE bulan IS NULL;
    UPDATE public.karyawan_pabrik SET jenis_kelamin = 'L' WHERE jenis_kelamin IS NULL;

    -- Set NOT NULL
    ALTER TABLE public.karyawan_pabrik 
        ALTER COLUMN kode SET NOT NULL,
        ALTER COLUMN nama SET NOT NULL,
        ALTER COLUMN bulan SET NOT NULL,
        ALTER COLUMN jenis_kelamin SET NOT NULL;
    
    RAISE NOTICE 'NOT NULL constraints berhasil ditambahkan';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error set NOT NULL: %. Pastikan tidak ada data NULL di kolom kode, nama, bulan, jenis_kelamin', SQLERRM;
END $$;

-- ============================================
-- 3. TAMBAH INDEX untuk Performa Query
-- ============================================

-- Index untuk kolom kode (search by kode)
CREATE INDEX IF NOT EXISTS idx_karyawan_pabrik_kode 
    ON public.karyawan_pabrik(kode);

-- Index untuk kolom bulan (filter by bulan)
CREATE INDEX IF NOT EXISTS idx_karyawan_pabrik_bulan 
    ON public.karyawan_pabrik(bulan);

-- Index untuk kolom divisi (filter by divisi)
CREATE INDEX IF NOT EXISTS idx_karyawan_pabrik_divisi 
    ON public.karyawan_pabrik(divisi);

-- Composite index untuk kode + bulan (untuk check duplikat lebih cepat)
CREATE INDEX IF NOT EXISTS idx_karyawan_pabrik_kode_bulan 
    ON public.karyawan_pabrik(kode, bulan);

-- Index untuk nama (search by nama)
CREATE INDEX IF NOT EXISTS idx_karyawan_pabrik_nama 
    ON public.karyawan_pabrik(nama);

-- ============================================
-- 4. VERIFIKASI HASIL
-- ============================================

-- Cek struktur tabel
DO $$
DECLARE
    kolom_count INTEGER;
    constraint_count INTEGER;
    index_count INTEGER;
BEGIN
    -- Hitung jumlah kolom
    SELECT COUNT(*) INTO kolom_count
    FROM information_schema.columns 
    WHERE table_name = 'karyawan_pabrik'
    AND column_name IN ('kode', 'nama', 'jenis_kelamin', 'grade_p1', 'grade_p2', 'divisi', 'bulan', 'keterangan');
    
    -- Hitung jumlah constraint
    SELECT COUNT(*) INTO constraint_count
    FROM information_schema.table_constraints 
    WHERE table_name = 'karyawan_pabrik'
    AND constraint_name IN ('unique_kode_bulan', 'check_jenis_kelamin');
    
    -- Hitung jumlah index
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes 
    WHERE tablename = 'karyawan_pabrik'
    AND indexname LIKE 'idx_karyawan_pabrik_%';
    
    RAISE NOTICE '=================================';
    RAISE NOTICE 'VERIFIKASI MIGRATION';
    RAISE NOTICE '=================================';
    RAISE NOTICE 'Kolom penting tersedia: % dari 8', kolom_count;
    RAISE NOTICE 'Constraint aktif: % dari 2', constraint_count;
    RAISE NOTICE 'Index dibuat: %', index_count;
    RAISE NOTICE '=================================';
    
    IF kolom_count = 8 AND constraint_count = 2 THEN
        RAISE NOTICE '✅ Migration berhasil sempurna!';
    ELSE
        RAISE NOTICE '⚠️ Ada yang kurang, cek log di atas';
    END IF;
END $$;
