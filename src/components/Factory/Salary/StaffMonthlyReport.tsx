import React, { useState, useEffect, useMemo } from 'react';
import { 
  Loader2, Database, Copy, RefreshCw, Calculator, Download, 
  FileText, Search, Filter, X, Wallet, Coins, CalendarCheck 
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';
import { ConfirmationModal } from '../../Warehouse/ConfirmationModal';
import { SalaryDetailModal } from '../../Factory/Attendance/SalaryDetailModal'; 
import * as XLSX from 'xlsx';

export const StaffMonthlyReport: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTableMissing, setIsTableMissing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  
  // Filters & View Mode
  const [viewMode, setViewMode] = useState<'kehadiran' | 'gaji'>('kehadiran'); 
  const [filterPeriod, setFilterPeriod] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDivision, setFilterDivision] = useState('');

  // Dropdown Options
  const [optMonths, setOptMonths] = useState<string[]>([]);
  const [optPeriods, setOptPeriods] = useState<string[]>([]);
  const [optCompanies, setOptCompanies] = useState<string[]>([]);
  const [optDivisions, setOptDivisions] = useState<string[]>([]);
  
  // Calc State
  const [isCalculating, setIsCalculating] = useState(false);
  
  // Modal States
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; onConfirm: () => void; title: string; message: string; confirmLabel?: string }>({ isOpen: false, onConfirm: () => {}, title: '', message: '' });

  // Detail Modal
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedDetailData, setSelectedDetailData] = useState<any>(null);

  // SQL Setup Code (New Logic V16)
  const sqlFixCode = `
-- [FIX V16] FINAL STAFF FINANCIAL LOGIC
-- Implements strict financial rules based on Division (STAFF vs NON-STAFF)
-- Source: master_gaji

-- 1. Helper Function: Progressive Penalty
CREATE OR REPLACE FUNCTION public.calc_progressive_penalty(n INT)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
    total NUMERIC := 0;
    i INT;
BEGIN
    IF n <= 0 THEN RETURN 0; END IF;
    
    FOR i IN 0..(n-1) LOOP
        total := total + (10000 + (2000 * i));
    END LOOP;
    
    RETURN total;
END;
$$;

-- 2. Main Recalculation Function
CREATE OR REPLACE FUNCTION public.recalc_laporan_bulanan_staff(p_bulan TEXT, p_kode TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    -- Employee Data
    v_nama TEXT; v_grade TEXT; v_divisi TEXT; v_perusahaan TEXT;
    
    -- Attendance Counters
    v_h NUMERIC := 0; v_set_h NUMERIC := 0; v_lp INT := 0; v_lembur NUMERIC := 0;
    v_i_b INT := 0; v_i_tb INT := 0;
    v_s_b INT := 0; v_s_tb INT := 0;
    v_t_b INT := 0; v_t_tb INT := 0;
    
    -- Streak Logic
    v_current_status TEXT := '';
    v_current_streak INT := 0;
    v_kehadiran_clean TEXT;
    r RECORD;
    
    -- Master Salary Data
    r_master RECORD;
    v_gp NUMERIC := 0; v_um NUMERIC := 0; v_uk NUMERIC := 0; v_bn NUMERIC := 0;
    
    -- Final Values
    v_final_gapok NUMERIC := 0;
    v_final_um NUMERIC := 0;
    v_final_uk NUMERIC := 0;
    v_final_bonus NUMERIC := 0;
    v_hasil_gaji NUMERIC := 0;
    
    -- Potongan Variables
    v_pot_hari NUMERIC; v_pot_jam NUMERIC;
    v_pot_sb NUMERIC; v_pot_ib NUMERIC; v_pot_tb NUMERIC; v_pot_tb_all NUMERIC;
    v_pot_ib_k NUMERIC; v_pot_tb_k NUMERIC; v_pot_tb_it NUMERIC;

    -- Existing Manual Values
    v_existing_kasbon NUMERIC := 0;
    v_existing_penyesuaian NUMERIC := 0;

BEGIN
    -- A. Get Employee Metadata (Priority: Presensi -> Master)
    SELECT nama, grade, divisi, perusahaan INTO v_nama, v_grade, v_divisi, v_perusahaan
    FROM public.presensi_harian_staff_pabrik
    WHERE bulan = p_bulan AND kode = p_kode
    ORDER BY tanggal DESC LIMIT 1;
    
    IF v_nama IS NULL THEN
        SELECT nama, grade, divisi, perusahaan INTO v_nama, v_grade, v_divisi, v_perusahaan
        FROM public.data_karyawan_staff_pabrik
        WHERE bulan = p_bulan AND kode = p_kode
        LIMIT 1;
    END IF;

    -- B. Calculate Attendance Counters (Strict Streak Logic)
    FOR r IN 
        SELECT kehadiran, lembur 
        FROM public.presensi_harian_staff_pabrik 
        WHERE bulan = p_bulan AND kode = p_kode
        ORDER BY tanggal ASC
    LOOP
        v_kehadiran_clean := UPPER(TRIM(r.kehadiran));
        
        -- Aggregates
        IF v_kehadiran_clean = 'H' THEN v_h := v_h + 1; END IF;
        IF v_kehadiran_clean ~ '^[0-9]+(\.[0-9]+)?$' THEN v_set_h := v_set_h + CAST(v_kehadiran_clean AS NUMERIC); END IF;
        IF v_kehadiran_clean = 'LP' THEN v_lp := v_lp + 1; END IF;
        
        -- Lembur (Sum Numeric)
        IF r.lembur IS NOT NULL THEN
             BEGIN
                v_lembur := v_lembur + CAST(REGEXP_REPLACE(r.lembur, '[^0-9\.]', '', 'g') AS NUMERIC);
             EXCEPTION WHEN OTHERS THEN NULL; END;
        END IF;

        -- Streak Logic (Skip M/TM)
        IF v_kehadiran_clean IN ('M', 'TM') THEN
            CONTINUE; 
        ELSIF v_kehadiran_clean IN ('I', 'S', 'T') THEN
            IF v_kehadiran_clean = v_current_status THEN
                v_current_streak := v_current_streak + 1;
            ELSE
                -- Finalize previous
                IF v_current_status = 'I' THEN IF v_current_streak > 1 THEN v_i_b := v_i_b + v_current_streak; ELSE v_i_tb := v_i_tb + v_current_streak; END IF; END IF;
                IF v_current_status = 'S' THEN IF v_current_streak > 1 THEN v_s_b := v_s_b + v_current_streak; ELSE v_s_tb := v_s_tb + v_current_streak; END IF; END IF;
                IF v_current_status = 'T' THEN IF v_current_streak > 1 THEN v_t_b := v_t_b + v_current_streak; ELSE v_t_tb := v_t_tb + v_current_streak; END IF; END IF;
                
                v_current_status := v_kehadiran_clean;
                v_current_streak := 1;
            END IF;
        ELSE
            -- Break streak
            IF v_current_status = 'I' THEN IF v_current_streak > 1 THEN v_i_b := v_i_b + v_current_streak; ELSE v_i_tb := v_i_tb + v_current_streak; END IF; END IF;
            IF v_current_status = 'S' THEN IF v_current_streak > 1 THEN v_s_b := v_s_b + v_current_streak; ELSE v_s_tb := v_s_tb + v_current_streak; END IF; END IF;
            IF v_current_status = 'T' THEN IF v_current_streak > 1 THEN v_t_b := v_t_b + v_current_streak; ELSE v_t_tb := v_t_tb + v_current_streak; END IF; END IF;
            
            v_current_status := '';
            v_current_streak := 0;
        END IF;
    END LOOP;
    
    -- Finalize last streak
    IF v_current_status = 'I' THEN IF v_current_streak > 1 THEN v_i_b := v_i_b + v_current_streak; ELSE v_i_tb := v_i_tb + v_current_streak; END IF; END IF;
    IF v_current_status = 'S' THEN IF v_current_streak > 1 THEN v_s_b := v_s_b + v_current_streak; ELSE v_s_tb := v_s_tb + v_current_streak; END IF; END IF;
    IF v_current_status = 'T' THEN IF v_current_streak > 1 THEN v_t_b := v_t_b + v_current_streak; ELSE v_t_tb := v_t_tb + v_current_streak; END IF; END IF;

    -- C. Financial Calculation
    -- 1. Get Master Salary
    SELECT * INTO r_master FROM master_gaji WHERE grade = v_grade AND bulan = p_bulan LIMIT 1;
    -- Fallback to latest grade if month not found (Optional safety)
    IF r_master IS NULL THEN
        SELECT * INTO r_master FROM master_gaji WHERE grade = v_grade ORDER BY created_at DESC LIMIT 1;
    END IF;

    v_gp := COALESCE(r_master.gaji_pokok, 0);
    v_um := COALESCE(r_master.uang_makan, 0);
    v_uk := COALESCE(r_master.uang_kehadiran, 0);
    v_bn := COALESCE(r_master.bonus, 0);

    -- 2. Apply Rules based on Divisi
    IF UPPER(v_divisi) = 'STAFF' THEN
        v_final_gapok := v_gp;
        v_final_um := v_um;
        v_final_uk := v_uk;
        v_final_bonus := v_bn;
    ELSE
        -- NON-STAFF LOGIC
        
        -- Gapok
        v_pot_hari := (v_s_b + v_s_tb + v_i_b + v_i_tb + v_t_b + v_t_tb) * (v_gp / 26);
        v_pot_jam := (8 - v_set_h) * (v_gp / 26 / 8);
        v_final_gapok := v_gp - (v_pot_hari + v_pot_jam);
        
        -- Uang Makan
        v_pot_sb := public.calc_progressive_penalty(v_s_b);
        v_pot_ib := public.calc_progressive_penalty(v_i_b);
        v_pot_tb := public.calc_progressive_penalty(v_t_b);
        v_pot_tb_all := (v_i_tb + v_s_tb + v_t_tb) * 10000;
        v_final_um := v_um - (v_pot_sb + v_pot_ib + v_pot_tb + v_pot_tb_all);
        
        -- Uang Kehadiran
        v_pot_ib_k := public.calc_progressive_penalty(v_i_b);
        v_pot_tb_k := public.calc_progressive_penalty(v_t_b);
        v_pot_tb_it := (v_i_tb + v_t_tb) * 10000;
        v_final_uk := v_uk - (v_pot_ib_k + v_pot_tb_k + v_pot_tb_it);
        
        -- Bonus
        IF (v_i_tb + v_s_b + v_s_tb + v_t_b + v_t_tb) > 0 THEN
            v_final_bonus := 0;
        ELSE
            v_final_bonus := v_bn;
        END IF;
    END IF;

    -- Safety: Ensure non-negative allowances
    v_final_um := GREATEST(0, v_final_um);
    v_final_uk := GREATEST(0, v_final_uk);
    v_final_gapok := GREATEST(0, v_final_gapok);

    -- Calculate Total (Preserving existing manual inputs)
    SELECT kasbon, penyesuaian_bonus INTO v_existing_kasbon, v_existing_penyesuaian
    FROM public.laporan_bulanan_staff_pabrik
    WHERE bulan = p_bulan AND kode = p_kode;
    
    v_existing_kasbon := COALESCE(v_existing_kasbon, 0);
    v_existing_penyesuaian := COALESCE(v_existing_penyesuaian, 0);

    v_hasil_gaji := v_final_gapok + v_lembur + v_final_um + v_final_uk + v_final_bonus - v_existing_kasbon + v_existing_penyesuaian;

    -- D. Upsert Report
    INSERT INTO public.laporan_bulanan_staff_pabrik (
        bulan, kode, nama, grade, divisi, perusahaan,
        h, set_h, lp, lembur,
        i_b, i_tb, s_b, s_tb, t_b, t_tb,
        gapok, u_m, u_k, uang_bonus, gaji_lembur,
        hasil_gaji,
        updated_at
    )
    VALUES (
        p_bulan, p_kode, v_nama, v_grade, v_divisi, v_perusahaan,
        v_h, v_set_h, v_lp, v_lembur,
        v_i_b, v_i_tb, v_s_b, v_s_tb, v_t_b, v_t_tb,
        v_final_gapok, v_final_um, v_final_uk, v_final_bonus, v_lembur,
        v_hasil_gaji,
        NOW()
    )
    ON CONFLICT (bulan, kode) DO UPDATE SET
        h = EXCLUDED.h, set_h = EXCLUDED.set_h, lp = EXCLUDED.lp, lembur = EXCLUDED.lembur,
        i_b = EXCLUDED.i_b, i_tb = EXCLUDED.i_tb,
        s_b = EXCLUDED.s_b, s_tb = EXCLUDED.s_tb,
        t_b = EXCLUDED.t_b, t_tb = EXCLUDED.t_tb,
        gapok = EXCLUDED.gapok,
        u_m = EXCLUDED.u_m,
        u_k = EXCLUDED.u_k,
        uang_bonus = EXCLUDED.uang_bonus,
        gaji_lembur = EXCLUDED.gaji_lembur,
        hasil_gaji = EXCLUDED.hasil_gaji,
        updated_at = NOW();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calc_progressive_penalty(INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalc_laporan_bulanan_staff(TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload config';
  `;

  const handleCopySQL = () => {
    navigator.clipboard.writeText(sqlFixCode);
    setSuccessModal({ isOpen: true, title: 'SQL Disalin', message: 'Silakan jalankan kode di SQL Editor Supabase.' });
  };

  // Fetch available months
  useEffect(() => {
    const fetchOptions = async () => {
        if (!isSupabaseConfigured()) return;
        const { data } = await supabase.from('laporan_bulanan_staff_pabrik').select('bulan, perusahaan, divisi');
        if (data && data.length > 0) {
            const rawMonths = [...new Set(data.map(item => item.bulan).filter(Boolean))];
            const rawCompanies = [...new Set(data.map(item => item.perusahaan).filter(Boolean))];
            const rawDivisions = [...new Set(data.map(item => item.divisi).filter(Boolean))];
            
            const parseMonth = (str: string) => {
                const parts = str.split(' ');
                if (parts.length < 2) return 0;
                const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
                const mIndex = monthNames.findIndex(m => m.toLowerCase() === parts[0].toLowerCase());
                const year = parseInt(parts[1]);
                if (mIndex === -1 || isNaN(year)) return 0;
                return new Date(year, mIndex).getTime();
            };
            
            const sortedMonths = rawMonths.sort((a, b) => parseMonth(b) - parseMonth(a));
            setAvailableMonths(sortedMonths);
            setOptCompanies(rawCompanies.sort());
            setOptDivisions(rawDivisions.sort());
            setOptPeriods(['Semua Periode']);
            
            setFilterMonth(current => current === '' ? sortedMonths[0] : current);
        }
    };
    fetchOptions();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setIsTableMissing(false);
    if (!isSupabaseConfigured()) { setIsLoading(false); return; }

    try {
      let query = supabase
        .from('laporan_bulanan_staff_pabrik')
        .select('*');

      if (searchTerm) {
        query = query.or(`nama.ilike.%${searchTerm}%,kode.ilike.%${searchTerm}%`);
      }
      if (filterMonth) {
        query = query.eq('bulan', filterMonth);
      }
      if (filterCompany && filterCompany !== 'Semua Perusahaan') {
        query = query.eq('perusahaan', filterCompany);
      }
      if (filterDivision && filterDivision !== 'Semua Divisi') {
        query = query.eq('divisi', filterDivision);
      }

      const { data: result, error } = await query.order('bulan', { ascending: false });

      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205' || error.message.includes('does not exist')) {
            setIsTableMissing(true);
        } else {
            throw error;
        }
      } else {
        setData(result || []);
      }
    } catch (error: any) {
      console.error("Error fetching report:", error);
      if (!error.message?.includes('does not exist')) {
          setErrorModal({ isOpen: true, title: 'Gagal Memuat Data', message: error.message });
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [searchTerm, filterMonth, filterCompany, filterDivision]);

  // --- CALCULATION HANDLER ---
  const handleCalculate = async () => {
    if (!filterMonth) {
        alert("Mohon filter bulan terlebih dahulu sebelum menghitung.");
        return;
    }
    
    setIsCalculating(true);
    setConfirmModal({ ...confirmModal, isOpen: false });
    
    try {
        // CALL NEW BATCH FUNCTION
        const { data: result, error } = await supabase.rpc('recalc_all_staff_monthly', { p_bulan: filterMonth });
        
        if (error) {
             if (error.message.includes('function') || error.message.includes('recalc_all_staff_monthly')) {
                setShowSqlModal(true); 
                throw new Error("Fungsi Hitung belum diinstall. Silakan jalankan SQL Setup.");
            }
            throw error;
        }

        setSuccessModal({
            isOpen: true,
            title: 'Perhitungan Selesai',
            message: result || 'Gaji staff berhasil dihitung ulang.'
        });
        fetchData();
    } catch (error: any) {
        setErrorModal({ isOpen: true, title: 'Gagal Menghitung', message: error.message });
    } finally {
        setIsCalculating(false);
    }
  };

  const confirmCalculate = () => {
      if (!filterMonth) {
          alert("Pilih bulan di filter atas terlebih dahulu.");
          return;
      }
      setConfirmModal({
          isOpen: true,
          title: 'Hitung Ulang Gaji Staff?',
          message: `Sistem akan menghitung ulang kehadiran dan gaji untuk bulan ${filterMonth} berdasarkan data presensi terbaru.`,
          confirmLabel: 'Ya, Hitung',
          onConfirm: handleCalculate
      });
  };

  const handleExport = () => {
    if (data.length === 0) return;
    
    const exportData = data.map(item => ({
        'Bulan': item.bulan,
        'Perusahaan': item.perusahaan,
        'Kode': item.kode,
        'Nama': item.nama,
        'Grade': item.grade,
        'Divisi': item.divisi,
        'Hadir (H)': item.h,
        'Izin (B)': item.i_b,
        'Izin (TB)': item.i_tb,
        'Sakit (B)': item.s_b,
        'Sakit (TB)': item.s_tb,
        'Telat (B)': item.t_b,
        'Telat (TB)': item.t_tb,
        'Set.H': item.set_h,
        'Lembur (Jam)': item.lembur,
        'Gaji Pokok': item.gapok,
        'Gaji Lembur': item.gaji_lembur,
        'Uang Kehadiran': item.u_k,
        'Uang Makan': item.u_m,
        'Bonus': item.uang_bonus,
        'Kasbon': item.kasbon,
        'Total Gaji': item.hasil_gaji,
        'Keterangan': item.keterangan
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Staff");
    XLSX.writeFile(wb, `Laporan_Bulanan_Staff_${filterMonth || 'All'}.xlsx`);
  };

  const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

  const filteredData = data.filter(item => 
    item.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.kode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totals = useMemo(() => {
    return filteredData.reduce((acc, item) => {
      const gapok = Number(item.gapok || 0);
      const lembur = Number(item.gaji_lembur || 0);
      const makan = Number(item.u_m || 0);
      const kehadiran = Number(item.u_k || 0);
      const bonus = Number(item.uang_bonus || 0);
      const gross = gapok + lembur + makan + kehadiran + bonus;
      
      return {
        net: acc.net + (Number(item.hasil_gaji) || 0),
        gross: acc.gross + gross
      };
    }, { net: 0, gross: 0 });
  }, [filteredData]);

  const handleNameClick = (item: any) => {
    setSelectedDetailData(item);
    setIsDetailOpen(true);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header & Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <FileText className="text-erp-pink"/> Laporan Bulanan Staff
          </h3>
          <p className="text-xs text-gray-500">Rekapitulasi Gaji & Kehadiran Staff Pabrik</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* View Mode Toggle */}
            <div className="flex bg-gray-100 p-1 rounded-lg">
                <button 
                    onClick={() => setViewMode('kehadiran')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                        viewMode === 'kehadiran' 
                        ? 'bg-white text-erp-pink shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <CalendarCheck size={16}/> Kehadiran
                </button>
                <button 
                    onClick={() => setViewMode('gaji')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                        viewMode === 'gaji' 
                        ? 'bg-white text-erp-pink shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <Wallet size={16}/> Gaji
                </button>
            </div>

            <div className="relative flex-1 md:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                    type="text" 
                    placeholder="Cari Nama/Kode..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-erp-pink w-full md:w-48"
                />
            </div>
            
            <div className="relative flex-1 md:flex-none">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <select 
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-erp-pink w-full md:w-40 bg-white cursor-pointer"
                >
                    <option value="">Semua Bulan</option>
                    {availableMonths.map(m => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>
            </div>

            <div className="flex gap-2">
                {isTableMissing && (
                    <button 
                        onClick={() => setShowSqlModal(true)}
                        className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-bold flex items-center gap-2 animate-pulse"
                    >
                        <Database size={16}/> Setup DB
                    </button>
                )}

                <button 
                    onClick={confirmCalculate} 
                    disabled={isCalculating}
                    className="px-4 py-2 bg-orange-50 text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-100 text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                    {isCalculating ? <Loader2 className="animate-spin" size={16}/> : <Calculator size={16}/>} 
                    <span className="hidden sm:inline">Hitung</span>
                </button>

                <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-2 transition-colors shadow-sm">
                    <Download size={16}/> <span className="hidden sm:inline">Export</span>
                </button>
                <button onClick={fetchData} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors" title="Refresh">
                    <RefreshCw size={18}/>
                </button>
            </div>
        </div>
      </div>

      {/* --- SUMMARY CARDS --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-cyan-50 border border-cyan-200 p-4 rounded-xl shadow-sm flex flex-col justify-between">
             <div className="flex items-center gap-2 text-cyan-700 font-bold text-xs uppercase mb-1">
                <Coins size={14}/> Total Gaji Kotor
             </div>
             <p className="text-xl font-bold text-cyan-800">{formatRupiah(totals.gross)}</p>
          </div>
          
          <div className="bg-green-50 border border-green-200 p-4 rounded-xl shadow-sm flex flex-col justify-between">
             <div className="flex items-center gap-2 text-green-700 font-bold text-xs uppercase mb-1">
                <Wallet size={14}/> Total Gaji Bersih (Net)
             </div>
             <p className="text-xl font-bold text-green-800">{formatRupiah(totals.net)}</p>
          </div>
      </div>

      {/* --- TABLE --- */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
          <div className="overflow-auto max-h-[650px] custom-scrollbar relative">
          <table className="w-full text-xs text-left whitespace-nowrap relative border-collapse">
              <thead className="bg-gray-100 text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
              <tr>
                  <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Bulan</th>
                  <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Kode</th>
                  <th className="px-4 py-3 border-r border-gray-200 bg-gray-100 min-w-[150px]">Nama</th>
                  <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Grade</th>
                  <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Divisi</th>
                  
                  {viewMode === 'kehadiran' && (
                    <>
                      <th className="px-2 py-3 text-center border-r border-blue-100 bg-blue-50 text-blue-800">H</th>
                      
                      <th className="px-2 py-3 text-center border-r border-green-200 bg-green-50 text-green-800">I_B</th>
                      <th className="px-2 py-3 text-center border-r border-green-200 bg-green-50 text-green-800">I_TB</th>

                      <th className="px-2 py-3 text-center border-r border-green-200 bg-green-50 text-green-800">S_B</th>
                      <th className="px-2 py-3 text-center border-r border-green-200 bg-green-50 text-green-800">S_TB</th>

                      <th className="px-2 py-3 text-center border-r border-green-200 bg-green-50 text-green-800">T_B</th>
                      <th className="px-2 py-3 text-center border-r border-green-200 bg-green-50 text-green-800">T_TB</th>
                      
                      <th className="px-2 py-3 text-center border-r border-blue-200 bg-blue-50 text-blue-800">Set.H</th>
                      <th className="px-2 py-3 text-center border-r border-blue-200 bg-blue-50 text-center w-10 text-gray-500">LP</th>
                      <th className="px-2 py-3 text-center border-r border-blue-200 bg-blue-50 text-center w-10 text-gray-500">TM</th>
                      <th className="px-3 py-3 text-center border-r border-yellow-100 bg-yellow-50 text-yellow-800">Lembur</th>
                      
                      <th className="px-3 py-3 border-r border-purple-200 bg-purple-50 text-center font-medium text-purple-800">Keluar/Masuk</th>
                      <th className="px-3 py-3 border-r border-gray-200 bg-gray-100 text-center font-medium text-gray-600 text-xs truncate max-w-[150px]">Keterangan</th>
                      <th className="px-4 py-3 border-r border-gray-200 bg-orange-50 text-orange-700">Libur PT</th>
                    </>
                  )}

                  {viewMode === 'gaji' && (
                    <>
                      <th className="px-3 py-3 border-r border-gray-300 bg-green-50 text-right min-w-[100px]">Gapok</th>
                      <th className="px-3 py-3 border-r border-gray-300 bg-green-50 text-right min-w-[100px]">Gaji Lembur</th>
                      <th className="px-3 py-3 border-r border-gray-300 bg-green-50 text-right min-w-[100px]">U. Makan</th>
                      <th className="px-3 py-3 border-r border-gray-300 bg-green-50 text-right min-w-[100px]">U. Kehadiran</th>
                      <th className="px-3 py-3 border-r border-gray-300 bg-green-50 text-right min-w-[100px]">Bonus</th>
                      <th className="px-3 py-3 border-r border-gray-300 bg-red-50 text-right min-w-[100px] text-red-700">Kasbon</th>
                      <th className="px-3 py-3 border-r border-gray-300 bg-blue-50 text-right text-blue-700">Penyesuaian</th>
                      <th className="px-3 py-3 border-r border-green-100 text-right font-bold text-green-800 bg-green-100/30">Total Gaji</th>
                    </>
                  )}
              </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                  <tr><td colSpan={20} className="p-12 text-center"><Loader2 className="animate-spin inline text-erp-pink mr-2"/> Memuat data...</td></tr>
              ) : filteredData.length > 0 ? (
                  filteredData.map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2 border-r border-gray-100 text-gray-600">{item.bulan}</td>
                      <td className="px-4 py-2 border-r border-gray-100 font-mono text-gray-500">{item.kode}</td>
                      <td 
                          className="px-4 py-2 border-r border-gray-100 font-bold text-blue-600 cursor-pointer hover:underline"
                          onClick={() => handleNameClick(item)}
                      >
                          {item.nama}
                      </td>
                      <td className="px-4 py-2 border-r border-gray-100 text-center">{item.grade}</td>
                      <td className="px-4 py-2 border-r border-gray-100 text-gray-600">{item.divisi}</td>
                      
                      {viewMode === 'kehadiran' && (
                        <>
                          <td className="px-2 py-2 border-r border-blue-50 text-center font-bold bg-blue-50/20">{item.h}</td>
                          
                          <td className="px-2 py-2 border-r border-green-50 text-center font-bold bg-green-50/20 text-green-700">{item.i_b}</td>
                          <td className="px-2 py-2 border-r border-green-50 text-center font-bold bg-green-50/20 text-green-600">{item.i_tb}</td>
                          <td className="px-2 py-2 border-r border-green-50 text-center font-bold bg-green-50/20 text-green-700">{item.s_b}</td>
                          <td className="px-2 py-2 border-r border-green-50 text-center font-bold bg-green-50/20 text-green-600">{item.s_tb}</td>
                          <td className="px-2 py-2 border-r border-green-50 text-center font-bold bg-green-50/20 text-green-700">{item.t_b}</td>
                          <td className="px-2 py-2 border-r border-green-50 text-center font-bold bg-green-50/20 text-green-600">{item.t_tb}</td>
                          
                          <td className="px-2 py-2 border-r border-blue-50 text-center font-bold bg-blue-50/20">{item.set_h}</td>
                          <td className="px-2 py-2 border-r border-blue-50 text-center bg-blue-50/20 text-gray-500">{item.lp}</td>
                          <td className="px-2 py-2 border-r border-blue-50 text-center bg-blue-50/20 text-gray-500">{item.tm}</td>
                          <td className="px-3 py-2 text-center border-r border-yellow-50 font-medium bg-yellow-50/20">{item.lembur}</td>
                          
                          <td className="px-3 py-2 border-r border-purple-50 text-center font-medium bg-purple-50/20">
                              <span className={`${
                                  item.keluar_masuk?.toUpperCase().includes('KELUAR') ? 'text-red-600' : 
                                  item.keluar_masuk?.toUpperCase().includes('MASUK') ? 'text-green-600' : 'text-gray-400'
                              }`}>
                                  {item.keluar_masuk || '-'}
                              </span>
                          </td>
                          <td className="px-3 py-2 border-r border-gray-100 text-center font-medium text-gray-600 text-xs truncate max-w-[150px]" title={item.keterangan}>
                              {item.keterangan || '-'}
                          </td>
                          <td className="px-4 py-2 border-r border-gray-100 text-orange-600 font-medium">{item.libur_perusahaan || '-'}</td>
                        </>
                      )}

                      {viewMode === 'gaji' && (
                        <>
                          <td className="px-3 py-2 border-r border-green-50 text-right text-gray-600 bg-green-50/10">{formatRupiah(item.gapok)}</td>
                          <td className="px-3 py-2 border-r border-green-50 text-right text-gray-600 bg-green-50/10">{formatRupiah(item.gaji_lembur)}</td>
                          <td className="px-3 py-2 border-r border-green-50 text-right text-gray-600 bg-green-50/10">{formatRupiah(item.u_m)}</td>
                          <td className="px-3 py-2 border-r border-green-50 text-right text-gray-600 bg-green-50/10">{formatRupiah(item.u_k)}</td>
                          <td className="px-3 py-2 border-r border-green-50 text-right text-gray-600 bg-green-50/10">{formatRupiah(item.uang_bonus)}</td>
                          <td className="px-3 py-2 border-r border-red-50 text-right text-red-500 bg-red-50/10">{formatRupiah(item.kasbon)}</td>
                          <td className="px-3 py-2 border-r border-blue-50 text-right text-blue-500 bg-blue-50/10">{formatRupiah(item.penyesuaian_bonus)}</td>
                          <td className="px-3 py-2 border-r border-green-100 text-right font-bold text-green-800 bg-green-100/30">{formatRupiah(item.hasil_gaji)}</td>
                        </>
                      )}
                  </tr>
                  ))
              ) : (
                  <tr><td colSpan={20} className="p-16 text-center text-gray-400 italic">
                      {searchTerm || filterMonth ? 'Data tidak ditemukan.' : 'Belum ada data laporan.'}
                  </td>
                  </tr>
              )}
              </tbody>
          </table>
          </div>
      </div>

      {/* SQL FIX MODAL */}
      {showSqlModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-blue-50">
              <h3 className="font-bold text-lg text-blue-800 flex items-center gap-2">
                <Database size={20}/> Setup Database (V16)
              </h3>
              <button onClick={() => setShowSqlModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 text-sm mb-4">
                Fungsi perhitungan gaji V16 (Aturan Final Staff/Non-Staff) belum terinstall. 
                <br/>Silakan jalankan kode SQL di bawah ini di <b>Supabase SQL Editor</b>.
              </p>
              <div className="relative">
                <textarea 
                  className="w-full h-64 p-4 text-xs font-mono bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
                  readOnly
                  value={sqlFixCode}
                  onClick={(e) => e.currentTarget.select()}
                />
                <button 
                  onClick={handleCopySQL} 
                  className="absolute top-2 right-2 p-2 bg-white rounded-md shadow-sm border border-gray-200 hover:bg-gray-50 text-gray-600"
                  title="Salin Kode"
                >
                  <Copy size={16}/>
                </button>
              </div>
              <div className="mt-4 flex justify-end gap-3">
                <button 
                    onClick={() => setShowSqlModal(false)} 
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium"
                >
                    Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message} />
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message} />
      <ConfirmationModal 
        isOpen={confirmModal.isOpen} 
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} 
        onConfirm={confirmModal.onConfirm} 
        title={confirmModal.title} 
        message={confirmModal.message} 
        confirmLabel={confirmModal.confirmLabel}
        isDangerous={false}
      />
      
      {/* DETAIL MODAL */}
      <SalaryDetailModal 
        isOpen={isDetailOpen} 
        onClose={() => setIsDetailOpen(false)} 
        data={selectedDetailData} 
        isGarut={false}
      />
    </div>
  );
};
