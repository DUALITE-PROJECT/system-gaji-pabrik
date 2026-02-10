import React, { useEffect, useState } from 'react';
import { History, ArrowRight, Loader2, Calendar, Search, Download, X, ClipboardCheck, Filter, ArrowDownLeft, ArrowUpRight, Clock, Archive, AlertCircle, RefreshCw, CheckCircle2, Settings } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';

interface MutationHistoryProps {
  scope?: 'all' | 'gudang' | 'rak';
  fixedFilter?: 'all' | 'in' | 'out' | 'so';
}

export const MutationHistory: React.FC<MutationHistoryProps> = ({ 
  scope = 'all',
  fixedFilter
}) => {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(''); 
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // State for Grand Total
  const [grandTotal, setGrandTotal] = useState(0);
  const [isCalculatingTotal, setIsCalculatingTotal] = useState(false);
  
  // State Filter Tanggal
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // State Filter Jenis Mutasi
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out' | 'so'>(fixedFilter || 'all');

  // --- STOCK OPNAME SPLIT LOGIC ---
  const [latestSODate, setLatestSODate] = useState<string | null>(null); // Format: YYYY-MM-DD
  const [manualCutoff, setManualCutoff] = useState<string>(''); // Format: YYYY-MM-DD
  const [soFilterMode, setSoFilterMode] = useState<'after' | 'before'>('after');
  const [isFetchingSO, setIsFetchingSO] = useState(false);
  const [soSource, setSoSource] = useState<string>('');

  // Logic to show/hide "Jenis Mutasi" column
  const showMutationType = scope !== 'gudang';

  // Update filter type if fixedFilter changes
  useEffect(() => {
    if (fixedFilter) setFilterType(fixedFilter);
  }, [fixedFilter]);

  // Debounce Search Term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // --- FETCH LATEST SO DATE (ROBUST COMPARISON) ---
  const fetchLatestSO = async () => {
    if (scope !== 'rak') return;
    setIsFetchingSO(true);
    setLatestSODate(null);
    setSoSource('');

    try {
      let candidateDate = '';
      let candidateSource = '';

      // 1. Cek Header SO (stock_opname)
      const { data: headerData } = await supabase
        .from('stock_opname')
        .select('tanggal, created_at')
        .ilike('lokasi', '%Rak%')
        .neq('status', 'Aktif') // Exclude ongoing sessions
        .order('tanggal', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (headerData && headerData.tanggal) {
         candidateDate = headerData.tanggal;
         candidateSource = `Header SO (${new Date(headerData.tanggal).toLocaleDateString('id-ID')})`;
      }

      // 2. Cek Item SO (stock_opname_rak) - Compare with Header
      const { data: itemData } = await supabase
        .from('stock_opname_rak')
        .select('tanggal, created_at')
        .eq('status', 'Diterapkan')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (itemData) {
         // Prefer tanggal column if available, else created_at
         const itemDate = itemData.tanggal || new Date(itemData.created_at).toISOString().split('T')[0];
         
         // If item date is newer than header date (or header is null), use item date
         if (!candidateDate || new Date(itemDate) > new Date(candidateDate)) {
             candidateDate = itemDate;
             candidateSource = `Item SO Fisik`;
         }
      }

      // 3. Cek Log Mutasi (Fallback Ultimate) - Compare with current candidate
      const { data: mutationData } = await supabase
        .from('riwayat_mutasi')
        .select('created_at')
        .ilike('jenis_mutasi', '%Opname%') 
        .or('lokasi_tujuan.ilike.%Rak%,lokasi_tujuan.ilike.%Display%,lokasi_asal.ilike.%Rak%,lokasi_asal.ilike.%Display%') 
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (mutationData) {
         const logDate = new Date(mutationData.created_at).toISOString().split('T')[0];
         
         // If log date is newer than current candidate, use log date
         if (!candidateDate || new Date(logDate) > new Date(candidateDate)) {
             candidateDate = logDate;
             candidateSource = `Log Mutasi`;
         }
      }

      // SET FINAL RESULT
      if (candidateDate) {
          setLatestSODate(candidateDate);
          setSoSource(candidateSource);
      } else {
          setLatestSODate(null);
      }

    } catch (err) {
      console.error("Error fetching latest SO:", err);
    } finally {
      setIsFetchingSO(false);
    }
  };

  useEffect(() => {
    fetchLatestSO();
  }, [scope]);

  // Helper: Fetch with Retry
  const fetchWithRetry = async <T,>(
    fn: () => Promise<{ data: T | null; error: any }>,
    retries = 3,
    baseDelay = 1000
  ): Promise<{ data: T | null; error: any }> => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        const isNetworkError = error.message && (error.message.includes('Failed to fetch') || error.message.includes('Network request failed'));
        if (i === retries - 1 || !isNetworkError) throw error;
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Max retries reached');
  };
  
  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      let skuIds: string[] = [];
      if (debouncedSearch) {
        const { data: skus } = await supabase
          .from('master_sku')
          .select('id')
          .or(`kode_sku.ilike.%${debouncedSearch}%,nama.ilike.%${debouncedSearch}%`);
        if (skus) skuIds = skus.map(s => s.id);
      }

      const { data, error } = await fetchWithRetry(async () => {
        let query = supabase
          .from('riwayat_mutasi')
          .select(`*, master_sku (kode_sku, nama, satuan)`);

        if (scope === 'gudang') {
          query = query.or('lokasi_asal.ilike.%Gudang%,lokasi_tujuan.ilike.%Gudang%');
        }

        if (filterType === 'so') {
            query = query.ilike('jenis_mutasi', '%Opname%');
            if (scope === 'rak') query = query.or('lokasi_tujuan.ilike.%Rak%,lokasi_tujuan.ilike.%Display%');
        } else if (filterType === 'in') {
            // --- LOGIKA FILTER MASUK ---
            if (scope === 'rak') {
                query = query.or('lokasi_tujuan.ilike.%Rak%,lokasi_tujuan.ilike.%Display%,jenis_mutasi.ilike.%Opname%');
                
                // --- CUTOFF LOGIC (DATE ONLY) ---
                const activeCutoff = manualCutoff || latestSODate;

                if (activeCutoff) {
                    if (soFilterMode === 'after') {
                        // Current: >= Tanggal SO 00:00:00
                        // Ini akan mengambil semua transaksi pada hari SO dan setelahnya
                        query = query.gte('created_at', `${activeCutoff}T00:00:00`);
                    } else {
                        // Archive: < Tanggal SO 00:00:00
                        // Ini akan mengambil semua transaksi SEBELUM hari SO
                        query = query.lt('created_at', `${activeCutoff}T00:00:00`);
                    }
                } else {
                    // No cutoff found
                    if (soFilterMode === 'before') {
                        query = query.eq('id', -1); // Empty
                    }
                }
            } else {
                query = query.ilike('lokasi_tujuan', '%Gudang%');
            }
        } else if (filterType === 'out') {
            if (scope === 'rak') query = query.ilike('lokasi_asal', '%Rak%').not('jenis_mutasi', 'ilike', '%Opname%');
            else query = query.ilike('lokasi_asal', '%Gudang%').not('jenis_mutasi', 'ilike', '%Opname%');
        } else if (scope === 'rak') {
             query = query.or('lokasi_tujuan.ilike.%Rak%,lokasi_tujuan.ilike.%Display%,lokasi_asal.ilike.%Rak%,lokasi_asal.ilike.%Display%');
        }

        if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
        if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);

        if (debouncedSearch) {
          const conditions = [];
          if (skuIds.length > 0) conditions.push(`sku_id.in.(${skuIds.join(',')})`);
          conditions.push(`lokasi_asal.ilike.%${debouncedSearch}%`);
          conditions.push(`lokasi_tujuan.ilike.%${debouncedSearch}%`);
          conditions.push(`keterangan.ilike.%${debouncedSearch}%`);
          conditions.push(`jenis_mutasi.ilike.%${debouncedSearch}%`);
          query = query.or(conditions.join(','));
        }

        const isFiltering = debouncedSearch || startDate || endDate || filterType !== 'all';
        const limit = isFiltering ? 1000 : 200;

        return await query.order('created_at', { ascending: false }).limit(limit);
      });

      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGrandTotal = async () => {
    setIsCalculatingTotal(true);
    try {
      let skuIds: string[] = [];
      if (debouncedSearch) {
        const { data: skus } = await supabase
          .from('master_sku')
          .select('id')
          .or(`kode_sku.ilike.%${debouncedSearch}%,nama.ilike.%${debouncedSearch}%`);
        if (skus) skuIds = skus.map(s => s.id);
      }

      let totalSum = 0;
      let from = 0;
      const step = 500;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error } = await fetchWithRetry(async () => {
            let query = supabase.from('riwayat_mutasi').select('jumlah, created_at, jenis_mutasi, lokasi_tujuan, lokasi_asal');

            if (scope === 'gudang') query = query.or('lokasi_asal.ilike.%Gudang%,lokasi_tujuan.ilike.%Gudang%');

            if (filterType === 'so') {
                query = query.ilike('jenis_mutasi', '%Opname%');
                if (scope === 'rak') query = query.or('lokasi_tujuan.ilike.%Rak%,lokasi_tujuan.ilike.%Display%');
            } else if (filterType === 'in') {
                if (scope === 'rak') {
                    query = query.or('lokasi_tujuan.ilike.%Rak%,lokasi_tujuan.ilike.%Display%,jenis_mutasi.ilike.%Opname%');
                    
                    const activeCutoff = manualCutoff || latestSODate;

                    if (activeCutoff) {
                        if (soFilterMode === 'after') query = query.gte('created_at', `${activeCutoff}T00:00:00`);
                        else query = query.lt('created_at', `${activeCutoff}T00:00:00`);
                    } else if (soFilterMode === 'before') {
                        query = query.eq('id', -1);
                    }
                } else {
                    query = query.ilike('lokasi_tujuan', '%Gudang%');
                }
            } else if (filterType === 'out') {
                if (scope === 'rak') query = query.ilike('lokasi_asal', '%Rak%').not('jenis_mutasi', 'ilike', '%Opname%');
                else query = query.ilike('lokasi_asal', '%Gudang%').not('jenis_mutasi', 'ilike', '%Opname%');
            } else if (scope === 'rak') {
                 query = query.or('lokasi_tujuan.ilike.%Rak%,lokasi_tujuan.ilike.%Display%,lokasi_asal.ilike.%Rak%,lokasi_asal.ilike.%Display%');
            }

            if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);

            if (debouncedSearch) {
              const conditions = [];
              if (skuIds.length > 0) conditions.push(`sku_id.in.(${skuIds.join(',')})`);
              conditions.push(`lokasi_asal.ilike.%${debouncedSearch}%`);
              conditions.push(`lokasi_tujuan.ilike.%${debouncedSearch}%`);
              conditions.push(`keterangan.ilike.%${debouncedSearch}%`);
              query = query.or(conditions.join(','));
            }

            return await query.range(from, from + step - 1);
        });

        if (error) throw error;

        if (batch && batch.length > 0) {
            const batchSum = batch.reduce((acc, curr) => acc + (Number(curr.jumlah) || 0), 0);
            totalSum += batchSum;
            if (batch.length < step) hasMore = false; else from += step;
        } else {
            hasMore = false;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      setGrandTotal(totalSum);
    } catch (error) {
      console.error('Error calculating total:', error);
    } finally {
      setIsCalculatingTotal(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchGrandTotal();
  }, [scope, startDate, endDate, debouncedSearch, filterType, soFilterMode, latestSODate, manualCutoff]);

  const handleExport = () => {
    if (history.length === 0) {
      alert("Tidak ada data untuk diexport.");
      return;
    }

    const exportData = history.map(item => ({
      'Waktu': new Date(item.created_at).toLocaleString('id-ID'),
      'Jenis Mutasi': item.jenis_mutasi,
      'SKU': item.master_sku?.kode_sku,
      'Nama Barang': item.master_sku?.nama,
      'Dari (Asal)': item.lokasi_asal,
      'Ke (Tujuan)': item.lokasi_tujuan,
      'Jumlah': item.jumlah,
      'Satuan': item.master_sku?.satuan || 'Pcs',
      'Keterangan': item.keterangan || '-'
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wscols = [
        { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 30 }
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Riwayat Mutasi");
    XLSX.writeFile(wb, `Riwayat_Mutasi_${filterType}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const getTitle = () => {
    if (fixedFilter === 'in') return 'Rincian Barang Masuk';
    if (fixedFilter === 'out') return 'Rincian Barang Keluar';
    if (fixedFilter === 'so') return 'Riwayat Stock Opname';
    return scope === 'rak' ? 'Riwayat Mutasi Rak' : `Riwayat ${scope === 'all' ? 'Semua' : 'Stok Gudang'}`;
  };

  const resetDateFilter = () => {
    setStartDate('');
    setEndDate('');
  };

  return (
    <>
      <div className="bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-gray-100 dark:border-dark-600 overflow-hidden">
        
        {/* HEADER & FILTERS */}
        <div className="p-4 border-b border-gray-100 dark:border-dark-600 bg-white dark:bg-dark-700 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="flex flex-col gap-3 w-full xl:w-auto">
            <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 whitespace-nowrap text-lg">
              <History size={20} className="text-gray-700" /> 
              {getTitle()}
            </h3>
            
            <div className="flex flex-wrap items-center gap-3">
                {/* QUICK FILTERS */}
                {!fixedFilter && scope !== 'gudang' && (
                <div className="flex bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                    <button 
                        onClick={() => setFilterType('all')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${filterType === 'all' ? 'bg-gray-100 text-gray-800 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        Semua
                    </button>
                    <button 
                        onClick={() => setFilterType('in')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${filterType === 'in' ? 'bg-green-50 text-green-700 font-bold border border-green-100' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <ArrowDownLeft size={12}/> Masuk
                    </button>
                    <button 
                        onClick={() => setFilterType('out')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${filterType === 'out' ? 'bg-orange-50 text-orange-700 font-bold border border-orange-100' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <ArrowUpRight size={12}/> Keluar
                    </button>
                    <button 
                        onClick={() => setFilterType('so')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${filterType === 'so' ? 'bg-purple-100 text-purple-700 font-bold border border-purple-200' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <ClipboardCheck size={12}/> Stock Opname
                    </button>
                </div>
                )}

                {/* --- SUB TABS FOR RAK INBOUND (SO SPLIT) --- */}
                {scope === 'rak' && filterType === 'in' && (
                    <div className="flex flex-col gap-2 w-full sm:w-auto">
                        <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-sm items-center w-full sm:w-auto">
                            <button 
                                onClick={() => setSoFilterMode('after')}
                                className={`flex-1 sm:flex-none px-4 py-2 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-2 ${
                                    soFilterMode === 'after' 
                                    ? 'bg-white text-blue-600 shadow-sm font-bold border border-gray-200' 
                                    : 'text-gray-500 hover:bg-gray-200'
                                }`}
                            >
                                <Clock size={14}/> Stok Masuk SO (Current)
                            </button>
                            <button 
                                onClick={() => setSoFilterMode('before')}
                                className={`flex-1 sm:flex-none px-4 py-2 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-2 ${
                                    soFilterMode === 'before' 
                                    ? 'bg-white text-gray-800 shadow-sm font-bold border border-gray-200' 
                                    : 'text-gray-500 hover:bg-gray-200'
                                }`}
                            >
                                <Archive size={14}/> Stok Sebelum SO (Arsip)
                            </button>
                            <button 
                                onClick={fetchLatestSO}
                                className="ml-1 p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                title="Refresh Info SO"
                            >
                                <RefreshCw size={14} className={isFetchingSO ? "animate-spin" : ""}/>
                            </button>
                        </div>
                        
                        {/* Info Tanggal SO & Manual Override */}
                        <div className="flex flex-wrap items-center gap-2">
                            {latestSODate && !manualCutoff ? (
                                <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 border border-blue-100 rounded-md text-xs text-blue-700 w-fit animate-fadeIn">
                                    <CheckCircle2 size={12} className="text-blue-600"/>
                                    <span>
                                        Cutoff: <b>{new Date(latestSODate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</b>
                                        <span className="text-[10px] text-blue-500 ml-1 opacity-75">
                                            ({soSource})
                                        </span>
                                    </span>
                                </div>
                            ) : manualCutoff ? (
                                <div className="flex items-center gap-2 px-2 py-1 bg-purple-50 border border-purple-100 rounded-md text-xs text-purple-700 w-fit animate-fadeIn">
                                    <Settings size={12}/>
                                    <span>
                                        Manual Cutoff: <b>{new Date(manualCutoff).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</b>
                                    </span>
                                    <button onClick={() => setManualCutoff('')} className="ml-1 hover:text-red-500"><X size={12}/></button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 px-2 py-1 bg-orange-50 border border-orange-100 rounded-md text-xs text-orange-700 w-fit animate-fadeIn">
                                    <AlertCircle size={12}/>
                                    <span>Belum ada data SO otomatis.</span>
                                </div>
                            )}

                            {/* MANUAL DATE PICKER (DATE ONLY) */}
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-400">Set Manual:</span>
                                <input 
                                    type="date" 
                                    className="text-[10px] border border-gray-300 rounded px-1 py-0.5 bg-white focus:ring-1 focus:ring-blue-500"
                                    onChange={(e) => setManualCutoff(e.target.value)}
                                    value={manualCutoff}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3 w-full xl:w-auto flex-wrap">
            {/* Date & Search Inputs */}
            <div className="flex items-center gap-2 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-lg px-3 py-2 shadow-sm">
              <Calendar size={16} className="text-gray-400" />
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-sm border-none focus:ring-0 p-0 text-gray-600 bg-transparent w-28" placeholder="mm/dd/yyyy"/>
              <span className="text-gray-300 mx-1">-</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-sm border-none focus:ring-0 p-0 text-gray-600 bg-transparent w-28" placeholder="mm/dd/yyyy"/>
              {(startDate || endDate) && <button onClick={resetDateFilter} className="text-gray-400 hover:text-red-500 ml-1"><X size={14} /></button>}
            </div>

            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input type="text" placeholder="Cari barang..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-erp-blue-500 bg-white" />
            </div>

            {/* Export Button */}
            <button onClick={handleExport} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm hover:bg-green-700 transition-colors">
                <Download size={16}/> Export
            </button>
          </div>
        </div>
        
        {/* TABLE */}
        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="animate-spin mx-auto text-erp-blue-600 mb-3" size={32} />
            <p className="text-gray-500">Memuat riwayat...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="p-12 text-center">
            <Search className="mx-auto text-gray-300 mb-3" size={48} />
            <p className="text-gray-500">Tidak ditemukan data yang cocok.</p>
            {filterType === 'so' && <p className="text-xs text-purple-500 mt-2">Belum ada riwayat Stock Opname yang tercatat.</p>}
            {scope === 'rak' && filterType === 'in' && soFilterMode === 'before' && !latestSODate && !manualCutoff && (
                <p className="text-xs text-orange-500 mt-2 font-medium">
                    Belum ada data Stock Opname yang tercatat di sistem. <br/>
                    Tab "Stok Sebelum SO" kosong karena tidak ada titik potong.
                </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-sm text-left relative border-collapse">
              <thead className="bg-white dark:bg-dark-800 text-gray-500 border-b border-gray-100 sticky top-0 z-10 shadow-sm font-semibold">
                <tr>
                  <th className="px-6 py-4 w-48">Waktu</th>
                  {/* Conditionally Show Jenis Mutasi (Hidden for Gudang) */}
                  {showMutationType && <th className="px-6 py-4">Jenis Mutasi</th>}
                  <th className="px-6 py-4">Barang</th>
                  <th className="px-6 py-4 w-1/4">Dari (Asal)</th>
                  <th className="px-2 py-4 w-10"></th>
                  <th className="px-6 py-4 w-1/4">Ke (Tujuan)</th>
                  <th className="px-6 py-4 text-right w-32">Jumlah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-dark-700">
                {history.map((item) => {
                  const isSO = (item.jenis_mutasi || '').toLowerCase().includes('opname');
                  const isRak = (item.lokasi_tujuan || '').toLowerCase().match(/rak|display/);
                  
                  return (
                    <tr 
                        key={item.id} 
                        className={`hover:bg-gray-50 dark:hover:bg-dark-700 group ${isSO ? 'bg-purple-50/30' : (isRak ? 'bg-blue-50' : '')}`}
                    >
                      <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} />
                          {new Date(item.created_at).toLocaleString('id-ID', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit', second: '2-digit'
                          }).replace(/\./g, '/').replace(',', ',')}
                        </div>
                      </td>
                      {showMutationType && (
                        <td className="px-6 py-4 text-gray-700 font-medium text-sm">
                          {isSO ? (
                              <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold border border-purple-200">
                                  <ClipboardCheck size={12}/> Stock Opname
                              </span>
                          ) : (
                              item.jenis_mutasi
                          )}
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900 dark:text-white">{item.master_sku?.nama}</div>
                        <div className="text-xs text-gray-400 font-mono mt-0.5">{item.master_sku?.kode_sku}</div>
                      </td>
                      <td className="px-6 py-4 text-gray-600 text-sm">
                        {item.lokasi_asal}
                      </td>
                      <td className="px-2 py-4 text-center">
                        <ArrowRight size={16} className="text-gray-300" />
                      </td>
                      <td className={`px-6 py-4 font-medium text-sm ${isRak ? 'text-blue-600' : 'text-gray-700 dark:text-gray-300'}`}>
                        {item.lokasi_tujuan}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-white whitespace-nowrap">
                        {item.jumlah} {item.master_sku?.satuan || 'Pcs'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 dark:bg-dark-700 border-t-2 border-gray-200 dark:border-dark-600 sticky bottom-0 z-10">
                <tr>
                  <td colSpan={showMutationType ? 6 : 5} className="px-6 py-4 text-right font-bold text-gray-700 dark:text-gray-300 uppercase text-xs tracking-wider">
                    TOTAL JUMLAH {isCalculatingTotal ? '(Menghitung...)' : ''}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-gray-900 text-lg flex items-center justify-end gap-2">
                    {isCalculatingTotal ? <Loader2 className="animate-spin" size={16}/> : grandTotal.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
};
