-- =================================================================
-- GARUT AUTO-SYNC SYSTEM (REAL-TIME)
-- Menjaga sinkronisasi total_gaji_pabrik_garut dengan presensi & karyawan
-- =================================================================

-- 1. FUNCTION: Refresh Total Gaji (Core Logic)
-- Fungsi ini menghapus dan membuat ulang data total gaji untuk bulan tertentu
-- berdasarkan data presensi yang AKTUAL (No Phantom Records).
CREATE OR REPLACE FUNCTION refresh_total_gaji_for_month(p_bulan TEXT)
RETURNS VOID AS $$
BEGIN
    -- A. Hapus data lama untuk bulan ini (Reset)
    DELETE FROM public.total_gaji_pabrik_garut WHERE bulan = p_bulan;

    -- B. Insert data baru HANYA untuk kombinasi yang ADA di presensi
    -- Menggunakan DISTINCT untuk memastikan unique (bulan, periode, kode)
    INSERT INTO public.total_gaji_pabrik_garut (
        bulan, 
        periode, 
        kode, 
        nama, 
        perusahaan, 
        bagian, 
        divisi, 
        grade, -- Kolom grade umum (opsional, bisa diisi salah satu)
        grade_p1, 
        grade_p2, 
        created_at, 
        updated_at
    )
    SELECT DISTINCT
        ph.bulan,
        ph.periode,
        ph.kode,
        k.nama,
        k.perusahaan,
        k.bagian,
        k.divisi,
        -- Isi grade umum untuk referensi join master gaji
        CASE WHEN ph.periode = 'Periode 1' THEN k.grade_p1 ELSE k.grade_p2 END,
        -- Conditional Grade Logic (Sesuai Request)
        CASE WHEN ph.periode = 'Periode 1' THEN k.grade_p1 ELSE NULL END,
        CASE WHEN ph.periode = 'Periode 2' THEN k.grade_p2 ELSE NULL END,
        NOW(),
        NOW()
    FROM public.presensi_harian_pabrik_garut ph
    LEFT JOIN public.data_karyawan_pabrik_garut k 
        ON ph.kode = k.kode AND ph.bulan = k.bulan
    WHERE ph.bulan = p_bulan;

    -- C. Update Statistik Kehadiran (Hitung dari Presensi Harian)
    UPDATE public.total_gaji_pabrik_garut t
    SET 
        h = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran IN ('1', 'H', 'Hadir', 'Full', '8')),
        set_h = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran IN ('0.5', 'Setengah')),
        lp = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran = 'LP'),
        tm = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran IN ('TM', 'M', 'Minggu', 'Tanggal Merah')),
        b = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran = 'B'),
        s_b = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran ILIKE 'S%'),
        i_b = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran ILIKE 'I%'),
        t_b = (SELECT COUNT(*) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode AND p.kehadiran IN ('A', 'Alpha', 'T')),
        lembur = (SELECT COALESCE(SUM(CASE WHEN p.lembur ~ '^[0-9\.]+$' THEN CAST(p.lembur AS NUMERIC) ELSE 0 END), 0) FROM public.presensi_harian_pabrik_garut p WHERE p.kode = t.kode AND p.bulan = t.bulan AND p.periode = t.periode)
    WHERE t.bulan = p_bulan;

    -- D. Hitung Nominal Gaji (Join Master Gaji) - DENGAN PEMBULATAN & FALLBACK
    -- Menggunakan 'grade' (yang sudah diisi conditional di langkah B) untuk join
    UPDATE public.total_gaji_pabrik_garut t
    SET
        -- Gapok: Bulatkan ke integer. Jika harian 0, pakai (Bulanan / 26)
        gapok = ROUND(
            (COALESCE(t.h, 0) + COALESCE(t.set_h, 0) + COALESCE(t.lp, 0) + COALESCE(t.tm, 0)) * 
            CASE WHEN COALESCE(m.gaji_harian, 0) > 0 THEN m.gaji_harian ELSE COALESCE(m.gaji_pokok, 0) / 26 END
        ),
        -- Uang Makan: Fallback ke (Bulanan / 26) jika harian 0
        u_m = ROUND(
            (COALESCE(t.h, 0) + COALESCE(t.set_h, 0)) * 
            CASE WHEN COALESCE(m.uang_makan_harian, 0) > 0 THEN m.uang_makan_harian ELSE COALESCE(m.uang_makan, 0) / 26 END
        ),
        -- Uang Kehadiran: Fallback ke (Bulanan / 26) jika harian 0
        u_k = ROUND(
            (COALESCE(t.h, 0) + COALESCE(t.set_h, 0)) * 
            CASE WHEN COALESCE(m.uang_kehadiran_harian, 0) > 0 THEN m.uang_kehadiran_harian ELSE COALESCE(m.uang_kehadiran, 0) / 26 END
        ),
        -- Lembur: Bulatkan
        gaji_lembur = ROUND(COALESCE(t.lembur, 0) * COALESCE(m.lembur, 0)),
        -- Bonus: Hangus jika ada absen (S/I/A/B)
        uang_bonus = CASE 
            WHEN (COALESCE(t.s_b, 0) + COALESCE(t.i_b, 0) + COALESCE(t.t_b, 0) + COALESCE(t.b, 0)) > 0 THEN 0
            ELSE COALESCE(m.bonus, 0)
        END
    FROM public.master_gaji m
    WHERE t.grade = m.grade AND t.bulan = m.bulan AND t.bulan = p_bulan;

    -- E. Hitung Total Akhir
    UPDATE public.total_gaji_pabrik_garut
    SET hasil_gaji = COALESCE(gapok, 0) + COALESCE(u_m, 0) + COALESCE(u_k, 0) + COALESCE(gaji_lembur, 0) + COALESCE(uang_bonus, 0) - COALESCE(kasbon, 0) + COALESCE(penyesuaian_bonus, 0)
    WHERE bulan = p_bulan;

END;
$$ LANGUAGE plpgsql;

-- 2. TRIGGER 1: Sync saat Presensi Berubah (INSERT/UPDATE/DELETE)
CREATE OR REPLACE FUNCTION sync_total_gaji_after_presensi()
RETURNS TRIGGER AS $$
BEGIN
  -- Refresh data untuk bulan yang affected (NEW atau OLD)
  PERFORM refresh_total_gaji_for_month(COALESCE(NEW.bulan, OLD.bulan));
  RETURN NULL; -- Trigger AFTER, return value diabaikan
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_after_presensi ON public.presensi_harian_pabrik_garut;
CREATE TRIGGER trigger_sync_after_presensi
AFTER INSERT OR UPDATE OR DELETE ON public.presensi_harian_pabrik_garut
FOR EACH ROW EXECUTE FUNCTION sync_total_gaji_after_presensi();

-- 3. TRIGGER 2: Sync saat Data Karyawan Berubah (UPDATE)
CREATE OR REPLACE FUNCTION sync_total_gaji_after_karyawan()
RETURNS TRIGGER AS $$
BEGIN
  -- Update data employee info di total_gaji secara langsung
  UPDATE public.total_gaji_pabrik_garut
  SET 
    nama = NEW.nama,
    perusahaan = NEW.perusahaan,
    bagian = NEW.bagian,
    divisi = NEW.divisi,
    -- Update grade sesuai periode
    grade_p1 = CASE WHEN periode = 'Periode 1' THEN NEW.grade_p1 ELSE NULL END,
    grade_p2 = CASE WHEN periode = 'Periode 2' THEN NEW.grade_p2 ELSE NULL END,
    -- Update grade utama (untuk join master gaji)
    grade = CASE WHEN periode = 'Periode 1' THEN NEW.grade_p1 ELSE NEW.grade_p2 END,
    updated_at = NOW()
  WHERE kode = NEW.kode AND bulan = NEW.bulan;
  
  -- Opsional: Jika grade berubah, kita mungkin perlu hitung ulang gaji. 
  -- Uncomment baris bawah jika ingin full recalc saat grade berubah (sedikit lebih berat)
  -- IF (OLD.grade_p1 <> NEW.grade_p1 OR OLD.grade_p2 <> NEW.grade_p2) THEN
  --    PERFORM refresh_total_gaji_for_month(NEW.bulan);
  -- END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_after_karyawan ON public.data_karyawan_pabrik_garut;
CREATE TRIGGER trigger_sync_after_karyawan
AFTER UPDATE ON public.data_karyawan_pabrik_garut
FOR EACH ROW EXECUTE FUNCTION sync_total_gaji_after_karyawan();

-- 4. Refresh Cache
NOTIFY pgrst, 'reload config';
