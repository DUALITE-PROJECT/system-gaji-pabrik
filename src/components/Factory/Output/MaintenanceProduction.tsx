import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Loader2, RefreshCw, Filter, Calendar, 
  CheckCircle2, X, Info,
  TrendingUp
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';

export const MaintenanceProduction: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isViewMissing, setIsViewMissing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0); 
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modals
  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  
  // Helper: Fetch with Retry
  const fetchWithRetry = async <T,>(fn: () => Promise<{ data: T | null; error: any }>, retries = 3, delay = 1000): Promise<{ data: T | null; error: any }> => {
    for (let i = 0; i < retries; i++) {
      try {
        const result = await fn();
        if (result.error) throw result.error;
        return result;
      } catch (error: any) {
        if (i === retries - 1) return { data: null, error };
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return { data: null, error: new Error('Max retries reached') };
  };

  const fetchData = async () => {
    setIsLoading(true);
    setIsViewMissing(false);
    setLoadingProgress(0);

    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }

    try {
      // 1. Fetch Main Data (Maintenance & Production) with Retry
      const { data: result, error } = await fetchWithRetry(async () => {
        let query = supabase
          .from('data_maintenance_produksi_garut')
          .select('*'); 

        if (searchTerm) {
          query = query.ilike('kode', `%${searchTerm}%`);
        }
        
        if (startDate) query = query.gte('tanggal', startDate);
        if (endDate) query = query.lte('tanggal', endDate);

        return await query
          .order('tanggal', { ascending: false })
          .limit(1000); // Reduced limit to prevent timeout
      });

      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') {
          setIsViewMissing(true);
        } else {
          throw error;
        }
      } else if (result && result.length > 0) {
        // 2. Fetch Lead Time Data Separately (SEQUENTIAL BATCHING)
        const ids = result.map((r: any) => r.id);
        const CHUNK_SIZE = 20; 
        const chunks = [];
        
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            chunks.push(ids.slice(i, i + CHUNK_SIZE));
        }

        let allLeadTimeData: any[] = [];
        let processedChunks = 0;

        for (const chunkIds of chunks) {
            try {
                // Retry for chunks as well
                const { data: chunkData } = await fetchWithRetry(async () => {
                    return await supabase
                        .from('data_maintenance_lead_time')
                        .select('id, lead_time_hari, lead_time_hari_produksi') 
                        .in('id', chunkIds);
                }, 2, 500); // 2 retries, 500ms delay
                
                if (chunkData) {
                    allLeadTimeData = [...allLeadTimeData, ...chunkData];
                }
            } catch (err) {
                console.warn("Network error on chunk (partial data):", err);
            }
            
            processedChunks++;
            setLoadingProgress(Math.round((processedChunks / chunks.length) * 100));
            
            await new Promise(resolve => setTimeout(resolve, 50));
        }
            
        // Merge Data
        const ltMap = new Map(allLeadTimeData.map((l: any) => [l.id, l]));
        
        const mergedData = result.map((item: any) => {
            const lt = ltMap.get(item.id);
            return {
                ...item,
                lead_time_hari: lt ? lt.lead_time_hari : null, 
                lead_time_hari_produksi: lt ? lt.lead_time_hari_produksi : null
            };
        });
        
        setData(mergedData);
      } else {
        setData([]);
      }
    } catch (error: any) {
      console.error("Fetch Error:", error);
      if (!error.message?.includes('does not exist')) {
          setErrorModal({ isOpen: true, title: 'Gagal Memuat Data', message: error.message });
      }
    } finally {
      setIsLoading(false);
      setLoadingProgress(0);
    }
  };

  useEffect(() => {
    fetchData();
  }, [searchTerm, startDate, endDate]);

  // --- CALCULATE TOTALS (REMAINING / DIFFERENCE) ---
  const totals = useMemo(() => {
    const acc = {
      target: 0,
      inbound: 0,
      gudang_reject: 0,
      
      // Process columns
      cutting: 0, persiapan: 0,
      line_1: 0, line_2: 0, line_3: 0, line_4: 0, line_5: 0,
      bb_line_1: 0, bb_line_2: 0, bb_line_3: 0, bb_line_4: 0, bb_line_5: 0,
      qc_line_1: 0, qc_line_2: 0, qc_line_3: 0, qc_line_4: 0, qc_line_5: 0,
      iron_kancing: 0, packing: 0,
      gudang_barang_jadi: 0
    };

    // Helper to safely parse number
    const safeNum = (val: any) => {
        const n = Number(val);
        return isNaN(n) ? 0 : n;
    };

    data.forEach(item => {
      const t = safeNum(item.target_qty);
      acc.target += t;
      acc.gudang_reject += safeNum(item.gudang_reject); // Reject is absolute sum

      // Check if code starts with PMT
      const isPMT = (item.kode || '').toString().toUpperCase().startsWith('PMT');

      // Helper for Difference (Progress - Target)
      // Negative = Hutang (Red), Positive = Lebih (Green)
      // isOptional: If true, and val is 0, we don't count it as a deficit.
      const calcDiff = (key: keyof typeof acc, isOptional: boolean = false) => {
        const rawVal = item[key];
        let val = 0;
        
        // FIX: Handle 'done' status (Treat as equal to target)
        if (typeof rawVal === 'string' && rawVal.toLowerCase() === 'done') {
            val = t;
        } else {
            val = safeNum(rawVal);
        }
        
        // NEW LOGIC: For optional lines (Sewing, BB, QC, PMT Iron), if val is 0, ignore target (diff = 0)
        if (isOptional && val === 0) {
            acc[key] += 0;
        } else {
            acc[key] += (val - t); 
        }
      };

      calcDiff('cutting'); calcDiff('persiapan');
      
      // Optional Lines (Lines, BB, QC)
      calcDiff('line_1', true); calcDiff('line_2', true); calcDiff('line_3', true); calcDiff('line_4', true); calcDiff('line_5', true);
      calcDiff('bb_line_1', true); calcDiff('bb_line_2', true); calcDiff('bb_line_3', true); calcDiff('bb_line_4', true); calcDiff('bb_line_5', true);
      calcDiff('qc_line_1', true); calcDiff('qc_line_2', true); calcDiff('qc_line_3', true); calcDiff('qc_line_4', true); calcDiff('qc_line_5', true);
      
      // Iron Kancing is optional if code starts with PMT
      calcDiff('iron_kancing', isPMT); 
      
      calcDiff('packing');
      
      calcDiff('gudang_barang_jadi');
      calcDiff('inbound'); 
    });

    return acc;
  }, [data]);

  const handleResetFilters = () => {
      setStartDate('');
      setEndDate('');
      setSearchTerm('');
  };

  // Helper to render progress cell
  const renderProgressCell = (value: string) => {
    if (value === 'done') {
      return (
        <div className="flex justify-center items-center h-full">
          <CheckCircle2 size={18} className="text-green-600 fill-green-100" />
        </div>
      );
    }
    const num = Number(value);
    return (
      <span className={`font-medium ${num > 0 ? 'text-green-600' : 'text-gray-300'}`}>
        {num > 0 ? num : '-'}
      </span>
    );
  };

  // Helper to render Lead Time cell
  const renderLeadTime = (days: any, isProd: boolean = false) => {
    if (days === null || days === undefined) return <span className="text-gray-300">-</span>;
    const num = Number(days);
    
    const colorClass = isProd 
        ? (num > 0 ? 'text-purple-600 bg-purple-50 border-purple-100' : 'text-green-600 bg-green-50 border-green-100')
        : (num > 0 ? 'text-blue-600 bg-blue-50 border-blue-100' : 'text-green-600 bg-green-50 border-green-100');

    if (num === 0) return <span className={`font-bold text-[10px] px-2 py-0.5 rounded-full border ${colorClass}`}>Hari Sama</span>;
    if (num > 0) return <span className={`font-bold text-[10px] px-2 py-0.5 rounded-full border ${colorClass}`}>{num} Hari</span>;
    
    return <span className="text-gray-500 text-[10px]">{num} Hari</span>;
  };

  // Helper to render difference cell (Total Row) - NEW STYLE
  const renderDifferenceCell = (value: number) => {
    if (value === 0) return (
        <span className="inline-flex items-center justify-center px-2 py-1 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold border border-gray-200">
            OK
        </span>
    );
    const isNegative = value < 0;
    const colorClass = isNegative 
        ? 'bg-red-50 text-red-600 border-red-100' 
        : 'bg-green-50 text-green-600 border-green-100';
    const sign = value > 0 ? '+' : '';
    
    return (
      <span className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-[10px] font-bold border ${colorClass} min-w-[60px]`}>
        {sign}{value.toLocaleString()}
      </span>
    );
  };

  // Helper to render total cell (Absolute Sum)
  const renderTotalCell = (value: number, isReject: boolean = false) => {
    if (value === 0) return <span className="text-gray-300">-</span>;
    return (
      <span className={`font-bold text-xs ${isReject ? 'text-red-600' : 'text-gray-700'}`}>
        {value.toLocaleString()}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 items-end shrink-0">
        <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Rentang Tanggal</label>
            <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-200">
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
                className="w-full bg-transparent text-sm focus:outline-none px-2 py-1"
              />
              <span className="text-gray-400">-</span>
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)} 
                className="w-full bg-transparent text-sm focus:outline-none px-2 py-1"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Cari Kode</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Cari..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink outline-none" 
              />
            </div>
          </div>

          <div className="flex items-end">
             <button 
                onClick={handleResetFilters}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center gap-2"
             >
                <X size={16}/> Reset
             </button>
          </div>
        </div>

        <div className="flex gap-2">
            <button 
                onClick={fetchData} 
                className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm font-medium transition-colors"
            >
                <RefreshCw size={16}/> Refresh
            </button>
        </div>
      </div>

      {/* Data Table Container - FIXED HEIGHT FOR SCROLL */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        {isLoading && loadingProgress > 0 && (
            <div className="w-full bg-gray-100 h-1">
                <div 
                    className="bg-erp-pink h-1 transition-all duration-300" 
                    style={{ width: `${loadingProgress}%` }}
                ></div>
            </div>
        )}
        <div 
          className="overflow-auto custom-scrollbar relative"
          style={{ height: 'calc(100vh - 280px)' }}
        >
          <table className="w-full text-xs text-center whitespace-nowrap border-collapse min-w-full">
            <thead className="bg-gray-100 text-gray-700 font-bold sticky top-0 z-50 shadow-sm">
              {/* TOTAL ROW (MOVED TO THEAD) */}
              {!isLoading && data.length > 0 && (
                <tr className="bg-gradient-to-r from-blue-50 to-white font-bold text-gray-800 border-b-2 border-blue-100 z-50 shadow-sm">
                  <th className="px-4 py-3 border-r border-gray-200 bg-blue-50 sticky left-0 z-50 text-left text-blue-800 flex items-center gap-2">
                    <TrendingUp size={14}/> TOTAL SISA
                  </th>
                  <th className="px-4 py-3 border-r border-gray-200 bg-blue-50 sticky left-28 z-50"></th>
                  <th className="px-4 py-3 border-r border-gray-200 bg-blue-100 text-blue-900 sticky left-[17rem] z-50 shadow-md text-right px-6">{totals.target.toLocaleString()}</th>
                  
                  <th className="px-4 py-3 border-r border-gray-200"></th>
                  <th className="px-4 py-3 border-r border-gray-200"></th>

                  {/* Process Columns - Render Difference */}
                  <th className="px-2 py-3 border-r border-gray-200">{renderDifferenceCell(totals.cutting)}</th>
                  <th className="px-2 py-3 border-r border-gray-200">{renderDifferenceCell(totals.persiapan)}</th>
                  
                  <th className="px-2 py-3 border-r border-gray-200 bg-yellow-50/30">{renderDifferenceCell(totals.line_1)}</th>
                  <th className="px-2 py-3 border-r border-gray-200 bg-yellow-50/30">{renderDifferenceCell(totals.line_2)}</th>
                  <th className="px-2 py-3 border-r border-gray-200 bg-yellow-50/30">{renderDifferenceCell(totals.line_3)}</th>
                  <th className="px-2 py-3 border-r border-gray-200 bg-yellow-50/30">{renderDifferenceCell(totals.line_4)}</th>
                  <th className="px-2 py-3 border-r border-gray-200 bg-yellow-50/30">{renderDifferenceCell(totals.line_5)}</th>

                  <th className="px-2 py-3 border-r border-gray-200">{renderDifferenceCell(totals.bb_line_1)}</th>
                  <th className="px-2 py-3 border-r border-gray-200">{renderDifferenceCell(totals.bb_line_2)}</th>
                  <th className="px-2 py-3 border-r border-gray-200">{renderDifferenceCell(totals.bb_line_3)}</th>
                  <th className="px-2 py-3 border-r border-gray-200">{renderDifferenceCell(totals.bb_line_4)}</th>
                  <th className="px-2 py-3 border-r border-gray-200">{renderDifferenceCell(totals.bb_line_5)}</th>

                  <th className="px-2 py-3 border-r border-gray-200 bg-purple-50/30">{renderDifferenceCell(totals.qc_line_1)}</th>
                  <th className="px-2 py-3 border-r border-gray-200 bg-purple-50/30">{renderDifferenceCell(totals.qc_line_2)}</th>
                  <th className="px-2 py-3 border-r border-gray-200 bg-purple-50/30">{renderDifferenceCell(totals.qc_line_3)}</th>
                  <th className="px-2 py-3 border-r border-gray-200 bg-purple-50/30">{renderDifferenceCell(totals.qc_line_4)}</th>
                  <th className="px-2 py-3 border-r border-gray-200 bg-purple-50/30">{renderDifferenceCell(totals.qc_line_5)}</th>

                  <th className="px-2 py-3 border-r border-gray-200">{renderDifferenceCell(totals.iron_kancing)}</th>
                  <th className="px-2 py-3 border-r border-gray-200">{renderDifferenceCell(totals.packing)}</th>
                  
                  {/* Reject is absolute sum */}
                  <th className="px-2 py-3 border-r border-gray-200 bg-red-50/30 text-red-700">{renderTotalCell(totals.gudang_reject, true)}</th>
                  
                  {/* FG is Difference */}
                  <th className="px-2 py-3 border-r border-gray-200 bg-green-50/30 text-green-700">{renderDifferenceCell(totals.gudang_barang_jadi)}</th>
                  
                  {/* Inbound is Difference (NEW) */}
                  <th className="px-2 py-3 border-r border-gray-200 bg-blue-50/30">{renderDifferenceCell(totals.inbound)}</th>
                </tr>
              )}

              <tr>
                {/* STICKY COLUMNS: Tanggal & Kode */}
                <th className="px-4 py-3 border-r border-gray-200 bg-gray-100 sticky left-0 top-0 z-[60] w-28 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Tanggal</th>
                <th className="px-4 py-3 border-r border-gray-200 bg-gray-100 sticky left-28 top-0 z-[60] w-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Kode</th>
                
                {/* STICKY TARGET COLUMN */}
                <th className="px-4 py-3 border-r border-gray-200 bg-blue-50 text-blue-800 w-20 sticky left-[17rem] top-0 z-[60] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Target</th>
                
                {/* Lead Time Columns */}
                <th className="px-4 py-3 border-r border-gray-200 bg-indigo-50 text-indigo-800 w-24 sticky top-0 z-50" title="Maint -> Cutting">Lead Time</th>
                <th className="px-4 py-3 border-r border-gray-200 bg-purple-50 text-purple-800 w-24 sticky top-0 z-50" title="Cutting -> FG (Durasi Produksi)">LT Produksi</th>

                {/* Stages */}
                <th className="px-2 py-3 border-r border-gray-200 w-16 sticky top-0 z-50 bg-gray-100">Cutting</th>
                <th className="px-2 py-3 border-r border-gray-200 w-16 sticky top-0 z-50 bg-gray-100">Persiapan</th>
                
                {/* Sewing */}
                <th className="px-2 py-3 border-r border-gray-200 bg-yellow-50 w-16 sticky top-0 z-50">Line 1</th>
                <th className="px-2 py-3 border-r border-gray-200 bg-yellow-50 w-16 sticky top-0 z-50">Line 2</th>
                <th className="px-2 py-3 border-r border-gray-200 bg-yellow-50 w-16 sticky top-0 z-50">Line 3</th>
                <th className="px-2 py-3 border-r border-gray-200 bg-yellow-50 w-16 sticky top-0 z-50">Line 4</th>
                <th className="px-2 py-3 border-r border-gray-200 bg-yellow-50 w-16 sticky top-0 z-50">Line 5</th>

                {/* BB */}
                <th className="px-2 py-3 border-r border-gray-200 w-16 sticky top-0 z-50 bg-gray-100">BB L1</th>
                <th className="px-2 py-3 border-r border-gray-200 w-16 sticky top-0 z-50 bg-gray-100">BB L2</th>
                <th className="px-2 py-3 border-r border-gray-200 w-16 sticky top-0 z-50 bg-gray-100">BB L3</th>
                <th className="px-2 py-3 border-r border-gray-200 w-16 sticky top-0 z-50 bg-gray-100">BB L4</th>
                <th className="px-2 py-3 border-r border-gray-200 w-16 sticky top-0 z-50 bg-gray-100">BB L5</th>

                {/* QC */}
                <th className="px-2 py-3 border-r border-gray-200 bg-purple-50 w-16 sticky top-0 z-50">QC L1</th>
                <th className="px-2 py-3 border-r border-gray-200 bg-purple-50 w-16 sticky top-0 z-50">QC L2</th>
                <th className="px-2 py-3 border-r border-gray-200 bg-purple-50 w-16 sticky top-0 z-50">QC L3</th>
                <th className="px-2 py-3 border-r border-gray-200 bg-purple-50 w-16 sticky top-0 z-50">QC L4</th>
                <th className="px-2 py-3 border-r border-gray-200 bg-purple-50 w-16 sticky top-0 z-50">QC L5</th>

                {/* Finishing */}
                <th className="px-2 py-3 border-r border-gray-200 w-20 sticky top-0 z-50 bg-gray-100">Iron+Kancing</th>
                <th className="px-2 py-3 border-r border-gray-200 w-20 sticky top-0 z-50 bg-gray-100">Packing</th>
                
                {/* Warehouse */}
                <th className="px-2 py-3 border-r border-gray-200 bg-red-50 text-red-800 w-20 sticky top-0 z-50">Reject</th>
                <th className="px-2 py-3 border-r border-gray-200 bg-green-50 text-green-800 w-20 sticky top-0 z-50">FG</th>
                <th className="px-2 py-3 border-r border-gray-200 bg-blue-50 text-blue-800 w-20 sticky top-0 z-50">Inbound</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={28} className="p-12 text-center"><Loader2 className="animate-spin inline text-erp-pink mr-2"/> Memuat data...</td></tr>
              ) : data.length > 0 ? (
                data.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    {/* STICKY DATA CELLS */}
                    <td className="px-4 py-2 border-r border-gray-100 bg-white sticky left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">{item.tanggal}</td>
                    <td className="px-4 py-2 border-r border-gray-100 bg-white sticky left-28 z-30 font-mono text-gray-600 text-left shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">{item.kode}</td>
                    
                    {/* STICKY TARGET CELL */}
                    <td className="px-4 py-2 border-r border-gray-100 font-bold bg-blue-50 text-blue-700 sticky left-[17rem] z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">{item.target_qty}</td>
                    
                    {/* Lead Time Cells */}
                    <td className="px-4 py-2 border-r border-gray-100 bg-indigo-50/20">
                        {renderLeadTime(item.lead_time_hari)}
                    </td>
                    <td className="px-4 py-2 border-r border-gray-100 bg-purple-50/20">
                        {renderLeadTime(item.lead_time_hari_produksi, true)}
                    </td>

                    {/* Stages */}
                    <td className="px-2 py-2 border-r border-gray-100">{renderProgressCell(item.cutting)}</td>
                    <td className="px-2 py-2 border-r border-gray-100">{renderProgressCell(item.persiapan)}</td>
                    
                    <td className="px-2 py-2 border-r border-gray-100 bg-yellow-50/10">{renderProgressCell(item.line_1)}</td>
                    <td className="px-2 py-2 border-r border-gray-100 bg-yellow-50/10">{renderProgressCell(item.line_2)}</td>
                    <td className="px-2 py-2 border-r border-gray-100 bg-yellow-50/10">{renderProgressCell(item.line_3)}</td>
                    <td className="px-2 py-2 border-r border-gray-100 bg-yellow-50/10">{renderProgressCell(item.line_4)}</td>
                    <td className="px-2 py-2 border-r border-gray-100 bg-yellow-50/10">{renderProgressCell(item.line_5)}</td>

                    <td className="px-2 py-2 border-r border-gray-100">{renderProgressCell(item.bb_line_1)}</td>
                    <td className="px-2 py-2 border-r border-gray-100">{renderProgressCell(item.bb_line_2)}</td>
                    <td className="px-2 py-2 border-r border-gray-100">{renderProgressCell(item.bb_line_3)}</td>
                    <td className="px-2 py-2 border-r border-gray-100">{renderProgressCell(item.bb_line_4)}</td>
                    <td className="px-2 py-2 border-r border-gray-100">{renderProgressCell(item.bb_line_5)}</td>

                    <td className="px-2 py-2 border-r border-gray-100 bg-purple-50/10">{renderProgressCell(item.qc_line_1)}</td>
                    <td className="px-2 py-2 border-r border-gray-100 bg-purple-50/10">{renderProgressCell(item.qc_line_2)}</td>
                    <td className="px-2 py-2 border-r border-gray-100 bg-purple-50/10">{renderProgressCell(item.qc_line_3)}</td>
                    <td className="px-2 py-2 border-r border-gray-100 bg-purple-50/10">{renderProgressCell(item.qc_line_4)}</td>
                    <td className="px-2 py-2 border-r border-gray-100 bg-purple-50/10">{renderProgressCell(item.qc_line_5)}</td>

                    <td className="px-2 py-2 border-r border-gray-100">{renderProgressCell(item.iron_kancing)}</td>
                    <td className="px-2 py-2 border-r border-gray-100">{renderProgressCell(item.packing)}</td>
                    
                    <td className="px-2 py-2 border-r border-gray-100 bg-red-50/10">{renderProgressCell(item.gudang_reject)}</td>
                    <td className="px-2 py-2 border-r border-gray-100 bg-green-50/10">{renderProgressCell(item.gudang_barang_jadi)}</td>
                    <td className="px-2 py-2 border-r border-gray-100 bg-blue-50/10">{renderProgressCell(item.inbound)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={28} className="p-16 text-center text-gray-400 italic">
                    {isViewMissing ? 'View Database belum dibuat.' : 'Tidak ada data maintenance untuk filter ini.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message} />
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message} />
    </div>
  );
};
