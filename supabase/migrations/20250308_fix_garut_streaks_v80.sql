-- V80: FIX MISSING FUNCTION FOR GARUT ATTENDANCE
-- Fungsi ini diperlukan agar trigger delete/update tidak error

CREATE OR REPLACE FUNCTION calculate_all_streaks_garut(p_kode text, p_bulan text, p_periode text)
RETURNS TABLE (
    i_b numeric,
    i_tb numeric,
    s_b numeric,
    s_tb numeric,
    t_b numeric,
    t_tb numeric
) AS $$
BEGIN
    -- Versi Basic: Mengembalikan nilai 0 untuk mencegah error saat penghapusan
    -- Anda dapat mengupdate logika ini nanti untuk perhitungan streak yang lebih kompleks
    RETURN QUERY SELECT 
        0::numeric as i_b,
        0::numeric as i_tb,
        0::numeric as s_b,
        0::numeric as s_tb,
        0::numeric as t_b,
        0::numeric as t_tb;
END;
$$ LANGUAGE plpgsql;

-- Refresh Cache
NOTIFY pgrst, 'reload config';
