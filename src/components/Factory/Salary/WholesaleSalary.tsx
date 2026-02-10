import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, RefreshCw, Database, Filter, Download, 
  Loader2, Wallet, Calculator, ChevronDown, ChevronRight,
  CheckCircle2, AlertTriangle, PenTool, ClipboardList,
  Clock, Info, Users, X, TrendingUp, Calendar, ChevronLeft, Coins
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import * as XLSX from 'xlsx';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';
import { ConfirmationModal } from '../../Warehouse/ConfirmationModal';
import { WholesaleBoronganInput } from './WholesaleBoronganInput'; 
import { WholesaleBoronganList } from './WholesaleBoronganList'; 
import { WholesaleCalculationDetailModal } from './WholesaleCalculationDetailModal';

interface WholesaleSalaryProps {
  isGarut?: boolean; 
}

export const WholesaleSalary: React.FC<WholesaleSalaryProps> = ({ isGarut = false }) => {
  // Tabs: 'input' | 'presensi' | 'data'
  const [activeTab, setActiveTab] = useState<'input' | 'presensi' | 'data'>('data');

  const [data, setData] = useState<any[]>([]);
  const [dailyOutputs, setDailyOutputs] = useState<Record<string, number>>({}); 
  const [dailyBaseTotals, setDailyBaseTotals] = useState<Record<string, number>>({}); 
  const [isLoading, setIsLoading] = useState(true);
  const [isTableMissing, setIsTableMissing] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isSyncingMaster, setIsSyncingMaster] = useState(false); 
  const [recalcProgress, setRecalcProgress] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('Semua Periode');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10); // Default 10 Days per page
  const [totalData, setTotalData] = useState(0);

  // Totals State
  const [totals, setTotals] = useState({ gaji: 0, bonus: 0, kasbon: 0, gaji_bersih: 0 });
  const [isCalculatingTotal, setIsCalculatingTotal] = useState(false);

  // Options
  const [uniqueMonths, setUniqueMonths] = useState<string[]>([]);

  const [confirmModal, setConfirmModal] = useState<{ 
    isOpen: boolean; 
    title: string; 
    message: string; 
    confirmLabel?: string; 
    isDangerous?: boolean; 
    onConfirm: () => void; 
  }>({ 
    isOpen: false, 
    title: '', 
    message: '', 
    onConfirm: () => {}, 
    isDangerous: false 
  });

  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  
  // SQL Modal State
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [sqlFixCode, setSqlFixCode] = useState('');
  
  const [collapsedDates, setCollapsedDates] = useState<string[]>([]);

  // DETAIL MODAL STATE
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDetailItem, setSelectedDetailItem] = useState<any>(null);

  const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID', { 
    style: 'currency', 
    currency: 'IDR', 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  }).format(value);

  const formatDateIndo = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  // SQL for Sync Master Function
  const SQL_SYNC_MASTER = `
CREATE OR REPLACE FUNCTION public.ui_sync_master_borongan(p_bulan text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_updated_count integer := 0;
    v_temp_count integer;
BEGIN
    -- 1. Update Periode 1 (Grade P1)
    UPDATE data_gaji_borongan_pabrik_garut t
    SET 
        nama = m.nama,
        grade = m.grade_p1
    FROM data_karyawan_pabrik_garut m
    WHERE LOWER(TRIM(t.kode)) = LOWER(TRIM(m.kode)) 
      AND LOWER(TRIM(t.bulan)) = LOWER(TRIM(m.bulan))
      AND LOWER(TRIM(t.bulan)) = LOWER(TRIM(p_bulan))
      AND t.periode = 'Periode 1';
      
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_updated_count := v_updated_count + v_temp_count;

    -- 2. Update Periode 2 (Grade P2)
    UPDATE data_gaji_borongan_pabrik_garut t
    SET 
        nama = m.nama,
        grade = m.grade_p2
    FROM data_karyawan_pabrik_garut m
    WHERE LOWER(TRIM(t.kode)) = LOWER(TRIM(m.kode)) 
      AND LOWER(TRIM(t.bulan)) = LOWER(TRIM(m.bulan))
      AND LOWER(TRIM(t.bulan)) = LOWER(TRIM(p_bulan))
      AND t.periode = 'Periode 2';

    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_updated_count := v_updated_count + v_temp_count;

    RETURN 'Sync Master Berhasil: ' || v_updated_count || ' data diperbarui.';
END;
$function$;
  `;

  // Helper: Fetch with Retry
  const fetchWithRetry = async <T,>(fn: () => Promise<{ data: T | null; error: any }>, retries = 3, delay = 1000): Promise<{ data: T | null; error: any }> => {
    for (let i = 0; i < retries; i++) {
      try {
        const result = await fn();
        if (result.error) throw result.error;
        return result;
      } catch (error: any) {
        if (error.name === 'AbortError' || error.message?.toLowerCase().includes('abort')) return { data: null, error };
        if (i === retries - 1) return { data: null, error };
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return { data: null, error: new Error('Max retries reached') };
  };

  // --- FETCH DATA ---
  const fetchData = async () => {
    setIsLoading(true);
    setIsTableMissing(false);

    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }

    try {
      const tableName = 'data_gaji_borongan_pabrik_garut';
      let allData: any[] = [];
      let from = 0;
      const batchSize = 500; 
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error } = await fetchWithRetry(async () => {
            let query = supabase
                .from(tableName)
                .select('*')
                .order('tanggal', { ascending: false })
                .order('nama', { ascending: true })
                .order('id', { ascending: true })
                .range(from, from + batchSize - 1);
            
            if (searchTerm) {
                query = query.or(`kode.ilike.%${searchTerm}%,nama.ilike.%${searchTerm}%`);
            }
            if (filterStartDate) query = query.gte('tanggal', filterStartDate);
            if (filterEndDate) query = query.lte('tanggal', filterEndDate);
            if (filterMonth) {
                query = query.ilike('bulan', `%${filterMonth}%`);
            }
            if (filterPeriod && filterPeriod !== 'Semua Periode') query = query.eq('periode', filterPeriod);

            return await query;
        });
        
        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST205' || error.message?.includes('does not exist')) {
            setIsTableMissing(true);
            setData([]);
            return;
          } else {
            throw error;
          }
        }

        if (batch && batch.length > 0) {
            allData = [...allData, ...batch];
            if (batch.length < batchSize) {
                hasMore = false;
            } else {
                from += batchSize;
            }
        } else {
            hasMore = false;
        }
        
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      
      const uniqueData = Array.from(new Map(allData.map(item => [item.id, item])).values());
      setData(uniqueData);
      setTotalData(uniqueData.length);

      // Extract Unique Months
      const months = Array.from(new Set(uniqueData.map(item => item.bulan).filter(Boolean)));
      setUniqueMonths(months.sort());

      // Calculate Daily Base Totals
      const baseTotals: Record<string, number> = {};
      uniqueData.forEach(d => {
          if (!baseTotals[d.tanggal]) baseTotals[d.tanggal] = 0;
          if (Number(d.jam_kerja) > 0) {
             baseTotals[d.tanggal] += Number(d.gaji_dasar || 0);
          }
      });
      setDailyBaseTotals(baseTotals);

      // Fetch Outputs
      let allOutputs: any[] = [];
      let outFrom = 0;
      let outHasMore = true;
      
      while (outHasMore) {
          const { data: batch, error } = await fetchWithRetry(async () => {
              return await supabase
                .from('output_harian_pabrik')
                .select('tanggal, total_hasil')
                .range(outFrom, outFrom + batchSize - 1);
          });
            
          if (error) throw error;
          
          if (batch && batch.length > 0) {
              allOutputs = [...allOutputs, ...batch];
              if (batch.length < batchSize) outHasMore = false;
              else outFrom += batchSize;
          } else {
              outHasMore = false;
          }
          await new Promise(resolve => setTimeout(resolve, 20));
      }
      
      const outputMap: Record<string, number> = {};
      allOutputs.forEach((o: any) => {
        if (!outputMap[o.tanggal]) outputMap[o.tanggal] = 0;
        outputMap[o.tanggal] += Number(o.total_hasil || 0);
      });
      setDailyOutputs(outputMap);

    } catch (error: any) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- CALCULATE TOTALS ---
  useEffect(() => {
    const controller = new AbortController();

    const fetchTotal = async () => {
        if (!isSupabaseConfigured()) return;
        setIsCalculatingTotal(true);
        
        let sumGaji = 0;
        let sumBonus = 0;
        let sumKasbon = 0;
        let sumGajiBersih = 0;

        let hasMore = true;
        let pageFetch = 0;
        const FETCH_SIZE = 1000; 

        try {
            while (hasMore) {
                if (controller.signal.aborted) return;

                const { data: batch, error } = await fetchWithRetry(async () => {
                    let query = supabase.from('data_gaji_borongan_pabrik_garut')
                        .select('gaji, bonus, kasbon, gaji_bersih')
                        .abortSignal(controller.signal);
                    
                    if (searchTerm) query = query.or(`kode.ilike.%${searchTerm}%,nama.ilike.%${searchTerm}%`);
                    if (filterStartDate) query = query.gte('tanggal', filterStartDate);
                    if (filterEndDate) query = query.lte('tanggal', filterEndDate);
                    if (filterMonth) query = query.ilike('bulan', `%${filterMonth}%`);
                    if (filterPeriod && filterPeriod !== 'Semua Periode') query = query.eq('periode', filterPeriod);
                    
                    return await query.range(pageFetch * FETCH_SIZE, (pageFetch + 1) * FETCH_SIZE - 1);
                });
                
                if (error) throw error;

                if (batch && batch.length > 0) {
                    batch.forEach(curr => {
                        const g = Number(curr.gaji) || 0;
                        const b = Number(curr.bonus) || 0;
                        const k = Number(curr.kasbon) || 0;
                        
                        sumGaji += g;
                        sumBonus += b;
                        sumKasbon += k;
                        
                        if (curr.gaji_bersih !== undefined && curr.gaji_bersih !== null) {
                            sumGajiBersih += Number(curr.gaji_bersih);
                        } else {
                            sumGajiBersih += (g + b - k);
                        }
                    });
                    
                    if (batch.length < FETCH_SIZE) hasMore = false;
                    else pageFetch++;
                } else {
                    hasMore = false;
                }
            }
            
            if (!controller.signal.aborted) {
                setTotals({
                    gaji: sumGaji,
                    bonus: sumBonus,
                    kasbon: sumKasbon,
                    gaji_bersih: sumGajiBersih
                });
            }

        } catch (err: any) {
            if (!err.message?.toLowerCase().includes('abort')) {
                console.error("Error calculating total:", err);
            }
        } finally {
            if (!controller.signal.aborted) setIsCalculatingTotal(false);
        }
    };
    
    const timer = setTimeout(() => {
        fetchTotal();
    }, 500);
    
    return () => {
        clearTimeout(timer);
        controller.abort();
    };
  }, [searchTerm, filterStartDate, filterEndDate, filterMonth, filterPeriod]);

  useEffect(() => {
    if (activeTab === 'data') {
        fetchData();
    }
  }, [activeTab, searchTerm, filterStartDate, filterEndDate, filterMonth, filterPeriod]);

  // --- FILTERING & GROUPING ---
  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchSearch = 
        (item.nama || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.kode || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchMonth = filterMonth ? item.bulan === filterMonth : true;
      const matchPeriod = filterPeriod && filterPeriod !== 'Semua Periode' ? item.periode === filterPeriod : true;
      const matchDate = (!filterStartDate || item.tanggal >= filterStartDate) && (!filterEndDate || item.tanggal <= filterEndDate);
      return matchSearch && matchMonth && matchPeriod && matchDate;
    });
  }, [data, searchTerm, filterMonth, filterPeriod, filterStartDate, filterEndDate]);

  const allGroupedData = useMemo(() => {
    const groups: Record<string, { items: any[], totalGaji: number }> = {};
    filteredData.forEach(item => {
        const date = item.tanggal;
        if (!groups[date]) groups[date] = { items: [], totalGaji: 0 };
        groups[date].items.push(item);
        groups[date].totalGaji += Number(item.gaji || 0);
    });
    return Object.entries(groups).sort(([dateA], [dateB]) => new Date(dateB).getTime() - new Date(dateA).getTime());
  }, [filteredData]);

  const paginatedGroups = useMemo(() => {
    const start = (page - 1) * pageSize;
    return allGroupedData.slice(start, start + pageSize);
  }, [allGroupedData, page, pageSize]);

  // --- ACTIONS ---
  const handleCalculateSalary = () => {
    if (filterMonth) {
        setConfirmModal({
            isOpen: true,
            title: 'Hitung Gaji Bulanan',
            message: `Anda akan menghitung ulang gaji borongan untuk bulan **${filterMonth}**.\n\nLogic V27: Robust Match (Case Insensitive) & Fallback Gaji.\n\nLanjutkan?`,
            confirmLabel: 'Mulai Hitung',
            isDangerous: false,
            onConfirm: () => executeCalculationMonth(filterMonth)
        });
        return;
    }
    alert("Silakan pilih Bulan terlebih dahulu untuk menghitung gaji.");
  };

  const executeCalculationMonth = async (month: string) => {
    setConfirmModal({ ...confirmModal, isOpen: false });
    setIsRecalculating(true);
    setRecalcProgress('Menghitung...');
    
    try {
        const { data: msg, error } = await supabase.rpc('hitung_gaji_harian_borongan_garut_bulanan', { p_bulan: month });
        if (error) throw error;

        setSuccessModal({ isOpen: true, title: 'Perhitungan Selesai', message: msg || `Gaji borongan bulan ${month} telah dihitung.` });
        fetchData();
    } catch (error: any) {
        setErrorModal({ isOpen: true, title: 'Gagal Menghitung', message: error.message });
    } finally {
        setIsRecalculating(false);
        setRecalcProgress('');
    }
  };

  const handleSyncMaster = () => {
    if (!filterMonth) {
        alert("Silakan pilih Bulan terlebih dahulu untuk sinkronisasi master.");
        return;
    }

    setConfirmModal({
        isOpen: true,
        title: 'Sync Master Karyawan',
        message: `Anda akan memperbarui Nama, Perusahaan, dan Grade di data gaji harian borongan bulan **${filterMonth}** sesuai Master Karyawan.\n\nData Presensi dan Gaji TIDAK akan berubah.\n\nLanjutkan?`,
        confirmLabel: 'Ya, Sync Master',
        isDangerous: false,
        onConfirm: () => executeSyncMaster(filterMonth)
    });
  };

  const executeSyncMaster = async (month: string) => {
    setConfirmModal({ ...confirmModal, isOpen: false });
    setIsSyncingMaster(true);
    
    try {
        const { data: msg, error } = await supabase.rpc('ui_sync_master_borongan', { p_bulan: month });
        
        if (error) {
            if (error.message.includes('function') || error.message.includes('Could not find the function') || error.code === '42883') {
                setSqlFixCode(SQL_SYNC_MASTER);
                setShowSqlModal(true);
                return;
            }
            throw error;
        }

        setSuccessModal({ isOpen: true, title: 'Sync Master Berhasil', message: msg || 'Data master berhasil diperbarui.' });
        fetchData();
    } catch (error: any) {
        setErrorModal({ isOpen: true, title: 'Gagal Sync Master', message: error.message });
    } finally {
        setIsSyncingMaster(false);
    }
  };

  const handleExport = () => {
    if (data.length === 0) return;
    const exportData = data.map(item => ({
        'Tanggal': item.tanggal,
        'Kode': item.kode,
        'Nama': item.nama,
        'Grade': item.grade,
        'Bulan': item.bulan,
        'Periode': item.periode,
        'Kehadiran': item.kehadiran,
        'Jam Kerja': item.jam_kerja || 0,
        'Keterangan': item.keterangan,
        'Keluar/Masuk': item.keluar_masuk,
        'Gaji Borongan': item.gaji,
        'Bonus': item.bonus || 0,
        'Kasbon': item.kasbon || 0,
        'Gaji Bersih': (Number(item.gaji) + Number(item.bonus) - Number(item.kasbon))
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Gaji Borongan");
    XLSX.writeFile(wb, `Gaji_Borongan_Final_${filterMonth || 'All'}.xlsx`);
  };

  const handleResetFilters = () => {
      setSearchTerm('');
      setFilterStartDate('');
      setFilterEndDate('');
      setFilterMonth('');
      setFilterPeriod('Semua Periode');
      setPage(1);
  };

  const toggleDateCollapse = (date: string) => {
    setCollapsedDates(prev => prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]);
  };

  const handleOpenDetail = (item: any) => {
    setSelectedDetailItem(item);
    setDetailModalOpen(true);
  };

  const handleCopySQL = () => {
    navigator.clipboard.writeText(sqlFixCode);
    setSuccessModal({ isOpen: true, title: 'SQL Disalin', message: 'Silakan jalankan kode di SQL Editor Supabase.' });
  };

  return (
    <div className="space-y-6 h-full flex flex-col font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-erp-pink mb-2 flex items-center gap-2">
            <Wallet className="text-erp-pink" /> Gaji Borongan (Garut) V8
          </h1>
          <p className="text-gray-600 text-sm md:text-lg">Sistem bagi hasil output produksi</p>
        </div>
      </div>

      {/* TABS */}
      <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-200 w-fit">
        <button
          onClick={() => setActiveTab('input')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'input' 
              ? 'bg-erp-pink text-white shadow-sm' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <PenTool size={16} /> Input Data Borongan
        </button>
        <button
          onClick={() => setActiveTab('presensi')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'presensi' 
              ? 'bg-erp-pink text-white shadow-sm' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <ClipboardList size={16} /> Presensi Harian Borongan
        </button>
        <button
          onClick={() => setActiveTab('data')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'data' 
              ? 'bg-erp-pink text-white shadow-sm' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Database size={16} /> Data & Perhitungan
        </button>
      </div>

      {/* CONTENT AREA */}
      <div className="animate-fadeIn">
        {activeTab === 'input' && <WholesaleBoronganInput />}
        {activeTab === 'presensi' && <WholesaleBoronganList />}
        
        {activeTab === 'data' && (
          <div className="space-y-6">
            {/* TOOLBAR */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
              <div className="relative w-full xl:w-96 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-erp-pink transition-colors" size={20} />
                <input 
                  type="text" 
                  placeholder="Cari kode atau nama..." 
                  value={searchTerm} 
                  onChange={e => { setSearchTerm(e.target.value); setPage(1); }} 
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-erp-pink/30 focus:border-erp-pink transition-all shadow-sm" 
                />
              </div>
              
              <div className="flex flex-wrap gap-2 w-full xl:w-auto items-center justify-end">
                <button 
                  onClick={handleSyncMaster} 
                  disabled={isSyncingMaster} 
                  className="px-4 py-2.5 bg-white text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-50 text-sm font-medium flex items-center gap-2 shadow-sm transition-all disabled:opacity-70"
                >
                  {isSyncingMaster ? <Loader2 className="animate-spin" size={18}/> : <Users size={18}/>} 
                  Sync Master
                </button>

                <button 
                  onClick={handleCalculateSalary} 
                  disabled={isRecalculating} 
                  className="px-4 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 text-sm font-medium flex items-center gap-2 shadow-sm shadow-orange-200 transition-all disabled:opacity-70"
                >
                  {isRecalculating ? <Loader2 className="animate-spin" size={18}/> : <Calculator size={18}/>} 
                  {isRecalculating ? recalcProgress : 'Hitung Gaji'}
                </button>

                <button 
                  onClick={handleExport} 
                  className="px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-medium flex items-center gap-2 shadow-sm shadow-green-200 transition-all"
                >
                  <Download size={18}/> Export Excel
                </button>
                
                <button 
                  onClick={() => fetchData()} 
                  className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 shadow-sm transition-all" 
                  title="Refresh Data"
                >
                  <RefreshCw size={20}/>
                </button>
              </div>
            </div>

            {/* FILTER SECTION */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="col-span-1 md:col-span-12 flex items-center gap-2 text-sm font-bold text-erp-pink mb-1">
                <Filter size={18}/> Filter Data
              </div>
              
              <div className="col-span-1 md:col-span-4">
                <label className="block text-xs font-medium text-gray-500 mb-1.5 ml-1">Rentang Tanggal</label>
                <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl border border-gray-200">
                  <div className="relative flex-1">
                    <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="date" 
                      value={filterStartDate} 
                      onChange={(e) => setFilterStartDate(e.target.value)} 
                      className="w-full pl-9 pr-2 py-2 bg-transparent text-sm focus:outline-none text-gray-700"
                    />
                  </div>
                  <span className="text-gray-400">-</span>
                  <div className="relative flex-1">
                    <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="date" 
                      value={filterEndDate} 
                      onChange={(e) => setFilterEndDate(e.target.value)} 
                      className="w-full pl-9 pr-2 py-2 bg-transparent text-sm focus:outline-none text-gray-700"
                    />
                  </div>
                </div>
              </div>

              <div className="col-span-1 md:col-span-3">
                <label className="block text-xs font-medium text-gray-500 mb-1.5 ml-1">Bulan</label>
                <select 
                  value={filterMonth} 
                  onChange={(e) => setFilterMonth(e.target.value)} 
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-erp-pink/30 focus:border-erp-pink outline-none cursor-pointer"
                >
                  <option value="">Semua Bulan</option>
                  {uniqueMonths.map(m => (
                      <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-1 md:col-span-3">
                <label className="block text-xs font-medium text-gray-500 mb-1.5 ml-1">Periode</label>
                <select 
                  value={filterPeriod} 
                  onChange={(e) => setFilterPeriod(e.target.value)} 
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-erp-pink/30 focus:border-erp-pink outline-none cursor-pointer"
                >
                  <option value="Semua Periode">Semua Periode</option>
                  <option value="Periode 1">Periode 1</option>
                  <option value="Periode 2">Periode 2</option>
                </select>
              </div>

              <div className="col-span-1 md:col-span-2">
                <button 
                  onClick={handleResetFilters} 
                  className="w-full px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 hover:text-gray-800 flex items-center justify-center gap-2 transition-colors"
                >
                  <X size={18} /> Reset
                </button>
              </div>
            </div>

            {/* SUMMARY CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 shadow-sm">
                    <h3 className="text-green-800 font-bold text-xs uppercase mb-1">TOTAL GAJI</h3>
                    <p className="text-green-600 text-xs mb-1">Upah Borongan</p>
                    <div className="text-2xl font-bold text-green-700">
                        {isCalculatingTotal ? <Loader2 className="animate-spin" size={24}/> : formatRupiah(totals.gaji)}
                    </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 shadow-sm">
                    <h3 className="text-yellow-800 font-bold text-xs uppercase mb-1">TOTAL BONUS</h3>
                    <p className="text-yellow-600 text-xs mb-1">Tambahan</p>
                    <div className="text-2xl font-bold text-yellow-700">
                        {isCalculatingTotal ? <Loader2 className="animate-spin" size={24}/> : formatRupiah(totals.bonus)}
                    </div>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
                    <h3 className="text-red-800 font-bold text-xs uppercase mb-1">TOTAL KASBON</h3>
                    <p className="text-red-600 text-xs mb-1">Potongan</p>
                    <div className="text-2xl font-bold text-red-700">
                        {isCalculatingTotal ? <Loader2 className="animate-spin" size={24}/> : formatRupiah(totals.kasbon)}
                    </div>
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 shadow-sm">
                    <h3 className="text-blue-800 font-bold text-xs uppercase mb-1">TOTAL NET (BERSIH)</h3>
                    <p className="text-blue-600 text-xs mb-1">Gaji + Bonus - Kasbon</p>
                    <div className="text-2xl font-extrabold text-blue-700">
                        {isCalculatingTotal ? <Loader2 className="animate-spin" size={24}/> : formatRupiah(totals.gaji_bersih)}
                    </div>
                </div>
            </div>

            {/* DATA TABLE */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
              <div className="overflow-auto max-h-[600px] custom-scrollbar relative">
              <table className="w-full text-xs text-left whitespace-nowrap relative border-collapse">
                  <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 sticky top-0 z-10 shadow-sm uppercase text-xs tracking-wider">
                  <tr>
                      <th className="px-6 py-4">TANGGAL</th>
                      <th className="px-6 py-4">KODE</th>
                      <th className="px-6 py-4">NAMA</th>
                      <th className="px-6 py-4 text-center">GRADE</th>
                      <th className="px-6 py-4 text-center">BULAN</th>
                      <th className="px-6 py-4 text-center">PERIODE</th>
                      <th className="px-6 py-4 text-center">KEHADIRAN</th>
                      <th className="px-6 py-4">KETERANGAN</th>
                      <th className="px-6 py-4 text-center">KELUAR/MASUK</th>
                      
                      {/* COLORED COLUMNS */}
                      <th className="px-6 py-4 text-center text-blue-800 bg-blue-50">JAM KERJA</th>
                      <th className="px-6 py-4 text-right bg-green-50 text-green-800 border-l border-green-100 font-bold">GAJI BORONGAN</th>
                      <th className="px-6 py-4 text-right text-yellow-800 bg-yellow-50">BONUS</th>
                      <th className="px-6 py-4 text-right text-red-800 bg-red-50">KASBON</th>
                      <th className="px-6 py-4 text-right text-blue-800 bg-blue-100 font-extrabold border-l border-blue-200">GAJI BERSIH</th>
                      
                      <th className="px-4 py-4 text-center">DETIL</th>
                  </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                  {isLoading ? (
                      <tr><td colSpan={15} className="p-16 text-center"><Loader2 className="animate-spin inline text-erp-pink mr-2" size={32}/> <span className="text-gray-500">Memuat data...</span></td></tr>
                  ) : isTableMissing ? (
                    <tr>
                      <td colSpan={15} className="p-16 text-center bg-red-50/30">
                        <div className="flex flex-col items-center justify-center gap-3 text-red-800">
                          <Database size={48} className="text-red-300"/>
                          <h3 className="font-bold text-lg">Tabel Belum Dibuat</h3>
                          <p className="text-sm text-gray-600 max-w-md">
                            Database belum memiliki tabel <code>data_gaji_borongan_pabrik_garut</code>.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : paginatedGroups.length > 0 ? (
                      paginatedGroups.map(([date, group]) => {
                          const isCollapsed = collapsedDates.includes(date);
                          const targetOutput = dailyOutputs[date] || 0;
                          const distributed = group.totalGaji;
                          const diff = targetOutput - distributed;
                          const isBalanced = Math.abs(diff) < 100;

                          return (
                          <React.Fragment key={date}>
                              {/* DATE HEADER ROW */}
                              <tr 
                                  className="bg-slate-100 hover:bg-slate-200 cursor-pointer transition-colors border-b border-slate-200"
                                  onClick={() => setCollapsedDates(prev => prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date])}
                              >
                                  <td colSpan={15} className="px-6 py-3">
                                      <div className="flex flex-col md:flex-row justify-between items-center gap-2">
                                          <div className="flex items-center gap-2 font-bold text-slate-700">
                                              {isCollapsed ? <ChevronRight size={18}/> : <ChevronDown size={18}/>}
                                              <span>{formatDateIndo(date)}</span>
                                              <span className="text-xs font-normal text-slate-500 bg-white px-2 py-0.5 rounded-full border ml-2">
                                                  {group.items.length} Karyawan
                                              </span>
                                          </div>
                                          
                                          <div className="flex items-center gap-3">
                                              {targetOutput > 0 ? (
                                                  <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-xs font-medium ${isBalanced ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                      {isBalanced ? <CheckCircle2 size={14}/> : <AlertTriangle size={14}/>}
                                                      <span>Target Output: {formatRupiah(targetOutput)}</span>
                                                      <span className="mx-1">|</span>
                                                      <span>Terbagi: {formatRupiah(distributed)}</span>
                                                      {!isBalanced && (
                                                          <span className="font-bold ml-1">(Selisih: {formatRupiah(diff)})</span>
                                                      )}
                                                  </div>
                                              ) : (
                                                  <div className="flex items-center gap-2 px-3 py-1 rounded-lg border text-xs font-medium bg-yellow-50 text-yellow-700 border-yellow-200">
                                                      <TrendingUp size={14}/>
                                                      <span>Output Harian Belum Diinput</span>
                                                  </div>
                                              )}
                                          </div>
                                      </div>
                                  </td>
                              </tr>

                              {/* EMPLOYEE ROWS */}
                              {!isCollapsed && group.items.map((item: any) => {
                                  let jam = item.jam_kerja;
                                  const gaji = Number(item.gaji || 0);
                                  const bonus = Number(item.bonus || 0);
                                  const kasbon = Number(item.kasbon || 0);
                                  const bersih = item.gaji_bersih !== undefined ? Number(item.gaji_bersih) : (gaji + bonus - kasbon);
                                  
                                  return (
                                  <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                                      <td className="px-6 py-3 text-gray-400 text-xs pl-12">{item.tanggal}</td>
                                      <td className="px-6 py-3 font-mono text-gray-600 bg-gray-50/50 rounded px-2 w-fit">{item.kode}</td>
                                      <td className="px-6 py-3 font-medium text-gray-900">{item.nama}</td>
                                      <td className="px-6 py-3 text-center text-blue-600 font-bold">{item.grade || '-'}</td>
                                      <td className="px-6 py-3 text-center text-gray-600">{item.bulan}</td>
                                      <td className="px-6 py-3 text-center text-gray-600">{item.periode}</td>
                                      <td className="px-6 py-3 text-center">
                                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                                          ['1', 'H', 'Hadir'].includes(item.kehadiran) ? 'bg-green-100 text-green-700 border-green-200' :
                                          ['0.5', 'Setengah'].includes(item.kehadiran) ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                                          'bg-gray-100 text-gray-600 border-gray-200'
                                      }`}>
                                          {item.kehadiran}
                                      </span>
                                      </td>
                                      <td className="px-6 py-3 text-gray-500 text-sm italic truncate max-w-[150px]">{item.keterangan}</td>
                                      <td className="px-6 py-3 text-center">
                                          <span className={`text-xs ${item.keluar_masuk ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                                              {item.keluar_masuk || '-'}
                                          </span>
                                      </td>
                                      
                                      {/* COLORED COLUMNS */}
                                      <td className="px-6 py-3 text-center bg-blue-50/30 font-mono text-blue-800 font-bold">
                                          <div className="flex items-center justify-center gap-1">
                                              <Clock size={12} className="text-blue-400"/> {jam}
                                          </div>
                                      </td>
                                      <td className="px-6 py-3 text-right font-bold text-green-700 bg-green-50/30 border-l border-green-50">
                                          {formatRupiah(gaji)}
                                      </td>
                                      <td className="px-6 py-3 text-right bg-yellow-50/30 font-medium text-yellow-700">
                                          {formatRupiah(bonus)}
                                      </td>
                                      <td className="px-6 py-3 text-right bg-red-50/30 font-medium text-red-700">
                                          {formatRupiah(kasbon)}
                                      </td>
                                      <td className="px-6 py-3 text-right bg-blue-100/50 font-extrabold text-blue-800 border-l border-blue-200">
                                          {formatRupiah(bersih)}
                                      </td>

                                      <td className="px-4 py-3 text-center">
                                          <div className="flex items-center justify-center gap-2">
                                              <div className="group relative">
                                                  <button 
                                                      onClick={() => { setSelectedDetailItem(item); setDetailModalOpen(true); }}
                                                      className="p-1.5 text-green-600 hover:bg-green-100 rounded-full transition-colors"
                                                      title="Bedah Hitungan Gaji"
                                                  >
                                                      <Info size={20} strokeWidth={2.5} />
                                                  </button>
                                                  {item.info_debug && item.info_debug !== 'OK' && (
                                                      <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 w-48 bg-gray-800 text-white text-[10px] p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                                                          {item.info_debug}
                                                      </div>
                                                  )}
                                              </div>
                                          </div>
                                      </td>
                                  </tr>
                              )})}
                          </React.Fragment>
                          );
                      })
                  ) : (
                      <tr>
                      <td colSpan={15} className="p-16 text-center text-gray-400 bg-gray-50/30">
                          <div className="flex flex-col items-center justify-center gap-3">
                          <Database size={48} className="text-gray-200"/>
                          <p>Tidak ada data gaji harian borongan ditemukan.</p>
                          </div>
                      </td>
                      </tr>
                  )}
                  </tbody>
              </table>
              </div>
              
              {/* --- PAGINATION --- */}
              <div className="p-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                  <span>Menampilkan</span>
                  <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="border border-gray-300 rounded-lg py-1.5 px-2 bg-white focus:ring-2 focus:ring-erp-pink/50 outline-none cursor-pointer text-xs font-medium"
                  >
                  <option value="5">5 Hari</option>
                  <option value="10">10 Hari</option>
                  <option value="20">20 Hari</option>
                  <option value="31">Semua (31 Hari)</option>
                  </select>
                  <span>dari <b>{allGroupedData.length}</b> Hari</span>
              </div>
              
              <div className="flex items-center gap-2">
                  <button 
                  onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                  disabled={page === 1 || isLoading}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-white shadow-sm"
                  >
                  <ChevronLeft size={16} />
                  </button>
                  <span className="font-medium px-2">
                  Halaman {page} / {Math.ceil(allGroupedData.length / pageSize) || 1}
                  </span>
                  <button 
                  onClick={() => setPage(prev => Math.min(prev + 1, Math.ceil(allGroupedData.length / pageSize)))}
                  disabled={page >= Math.ceil(allGroupedData.length / pageSize) || isLoading}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-white shadow-sm"
                  >
                  <ChevronRight size={16} />
                  </button>
              </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <WholesaleCalculationDetailModal 
        isOpen={detailModalOpen} 
        onClose={() => setDetailModalOpen(false)} 
        data={selectedDetailItem} 
        dailyTotalOutput={dailyOutputs[selectedDetailItem?.tanggal] || 0}
        dailyTotalBase={dailyBaseTotals[selectedDetailItem?.tanggal] || 0}
      />

      <ConfirmationModal 
        isOpen={confirmModal.isOpen} 
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} 
        onConfirm={confirmModal.onConfirm} 
        title={confirmModal.title} 
        message={confirmModal.message} 
        confirmLabel={confirmModal.confirmLabel} 
        isDangerous={confirmModal.isDangerous}
      />

      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message} />
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message} />
      
      {/* SQL FIX MODAL */}
      {showSqlModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-blue-50">
              <h3 className="font-bold text-lg text-blue-800 flex items-center gap-2">
                <Database size={20}/> Setup Database Function (V27)
              </h3>
              <button onClick={() => setShowSqlModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 text-sm mb-4">
                Fungsi database untuk perhitungan gaji borongan (V27) perlu diperbarui untuk perbaikan bug.
                <br/><br/>
                Silakan salin kode SQL di bawah ini dan jalankan di <b>Supabase SQL Editor</b>.
              </p>
              
              <div className="relative">
                <textarea 
                  className="w-full h-64 p-4 text-xs font-mono bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
                  readOnly
                  value={sqlFixCode}
                  onClick={(e) => e.currentTarget.select()}
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(sqlFixCode);
                    setSuccessModal({ isOpen: true, title: 'SQL Disalin', message: 'Silakan jalankan kode di SQL Editor Supabase.' });
                  }}
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
    </div>
  );
};
