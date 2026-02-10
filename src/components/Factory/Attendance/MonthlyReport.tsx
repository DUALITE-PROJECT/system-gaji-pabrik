import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, RefreshCw, CalendarCheck, Wallet, Download, Filter, Search, Database, Info, Zap, CheckCircle2, Calculator, AlertTriangle, Trash2, Copy, Activity, Users, Eraser } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import * as XLSX from 'xlsx';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';
import { ConfirmationModal } from '../../Warehouse/ConfirmationModal';
import { SalaryDetailModal } from './SalaryDetailModal';

interface MonthlyReportProps {
  defaultView?: 'kehadiran' | 'gaji';
  hideTitle?: boolean;
}

export const MonthlyReport: React.FC<MonthlyReportProps> = ({ 
  defaultView = 'kehadiran',
  hideTitle = false
}) => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kehadiran' | 'gaji'>(defaultView);
  
  // State Hitung Ulang
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcProgress, setRecalcProgress] = useState('');

  // Filter State
  const [filterMonth, setFilterMonth] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDivision, setFilterDivision] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Dropdown Options State (Fetched separately)
  const [optMonths, setOptMonths] = useState<string[]>([]);
  const [optPeriods, setOptPeriods] = useState<string[]>([]);
  const [optCompanies, setOptCompanies] = useState<string[]>([]);
  const [optDivisions, setOptDivisions] = useState<string[]>([]);

  // Modals
  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState<any>({ isOpen: false });
  
  // STATE BARU UNTUK MODAL DETAIL
  const [detailModalData, setDetailModalData] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  
  const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  // --- 1. FETCH FILTER OPTIONS (ON MOUNT) ---
  useEffect(() => {
    const fetchOptions = async () => {
      if (!isSupabaseConfigured()) return;
      
      const { data: optionsData } = await supabase
        .from('laporan_bulanan_pabrik')
        .select('bulan, periode, perusahaan, divisi')
        .neq('perusahaan', 'BORONGAN'); // Exclude Borongan from filters

      if (optionsData) {
        const months = [...new Set(optionsData.map(d => d.bulan).filter(Boolean))].sort();
        const periods = [...new Set(optionsData.map(d => d.periode).filter(Boolean))].sort();
        const companies = [...new Set(optionsData.map(d => d.perusahaan).filter(Boolean))].sort();
        const divisions = [...new Set(optionsData.map(d => d.divisi).filter(Boolean))].sort();

        setOptMonths(months);
        setOptPeriods(periods);
        setOptCompanies(companies);
        setOptDivisions(divisions);
      }
    };
    fetchOptions();
  }, []);

  // --- 2. FETCH TABLE DATA (SERVER-SIDE FILTERING WITH BATCHING) ---
  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (!isSupabaseConfigured()) {
        setData([]);
        return;
      }

      let query = supabase
        .from('laporan_bulanan_pabrik')
        .select('*')
        .neq('perusahaan', 'BORONGAN'); // FILTER WAJIB: Hapus Borongan dari tampilan

      // Terapkan Filter Langsung di Database
      if (filterMonth) query = query.eq('bulan', filterMonth);
      if (filterPeriod) query = query.eq('periode', filterPeriod);
      if (filterCompany) query = query.eq('perusahaan', filterCompany);
      if (filterDivision) query = query.eq('divisi', filterDivision);
      
      if (searchTerm) {
        query = query.or(`nama.ilike.%${searchTerm}%,kode.ilike.%${searchTerm}%`);
      }

      // Batch fetch to prevent "Failed to fetch" on large datasets
      let allData: any[] = [];
      let from = 0;
      const BATCH_SIZE = 500; // Safe batch size
      const MAX_LIMIT = 10000; 

      while (from < MAX_LIMIT) {
        const { data: batch, error } = await query
          .order('bulan', { ascending: false })
          .order('nama', { ascending: true })
          .order('id', { ascending: true }) 
          .range(from, from + BATCH_SIZE - 1);

        if (error) throw error;
        
        if (batch && batch.length > 0) {
          allData = [...allData, ...batch];
          from += BATCH_SIZE;
          if (batch.length < BATCH_SIZE) break; // End of data
        } else {
          break;
        }
      }
      
      setData(allData);
    } catch (error: any) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger Fetch saat Filter Berubah
  useEffect(() => {
    fetchData();
  }, [filterMonth, filterPeriod, filterCompany, filterDivision]);

  // Trigger Fetch saat Search Berubah (Debounce)
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchData();
    }, 500); 
    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  // --- RECALCULATE LOGIC (V41 + CLEANUP) ---
  const handleRecalculate = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Hitung Ulang & Bersihkan?',
      message: `Sistem akan:\n1. Menghapus data BORONGAN dari laporan.\n2. Memperbaiki hitungan GAPOK (V41).\n3. Menghitung gaji V39 (5 Minggu).\n\nLanjutkan?`,
      confirmLabel: 'Ya, Proses',
      onConfirm: () => executeRecalculate()
    });
  };

  const executeRecalculate = async () => {
    setConfirmModal({ isOpen: false });
    setIsRecalculating(true);
    setRecalcProgress('Menyiapkan...');

    try {
      // STEP 0: CLEANUP ORPHANS & BORONGAN FIRST
      setRecalcProgress('Membersihkan data lama...');
      try {
        // Panggil fungsi cleanup khusus untuk menghapus Borongan dari tabel laporan
        await supabase.from('laporan_bulanan_pabrik').delete().eq('perusahaan', 'BORONGAN');
        await supabase.rpc('cleanup_monthly_report_orphans', { p_bulan: filterMonth });
      } catch (e) {
        console.warn("Cleanup function not found or failed, skipping cleanup step.", e);
      }

      // STEP 1: Fetch ALL unique targets using Batching (EXCLUDE BORONGAN)
      let allPresensi: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('presensi_harian_pabrik')
          .select('bulan, kode, perusahaan')
          .neq('perusahaan', 'BORONGAN') // PENTING: Jangan ambil data borongan untuk dihitung
          .range(from, from + step - 1);
        
        if (filterMonth) {
            query = query.eq('bulan', filterMonth);
        }

        const { data: batchData, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        
        if (batchData && batchData.length > 0) {
          allPresensi = [...allPresensi, ...batchData];
          from += step;
          setRecalcProgress(`Mengumpulkan data... (${allPresensi.length})`);
          if (batchData.length < step) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      // 2. Deduplicate to get unique targets (KARYAWAN)
      const uniqueSet = new Set(allPresensi.map(r => `${r.bulan}|${r.kode}|${r.perusahaan}`));
      const targets = Array.from(uniqueSet).map(s => {
        const [bulan, kode, perusahaan] = s.split('|');
        return { bulan, kode, perusahaan };
      });

      if (targets.length === 0) {
        setSuccessModal({
            isOpen: true,
            title: 'Selesai (Data Kosong)',
            message: 'Data lama telah dibersihkan. Tidak ada data presensi baru untuk dihitung.'
        });
        fetchData();
        setIsRecalculating(false);
        return;
      }

      // 3. Process Calculation in Batches
      let processed = 0;
      const total = targets.length; // Ini jumlah KARYAWAN
      const PROCESS_BATCH_SIZE = 5; 
      
      for (let i = 0; i < total; i += PROCESS_BATCH_SIZE) {
        const batch = targets.slice(i, i + PROCESS_BATCH_SIZE);
        const promises = batch.map(async (target) => {
           // Panggil V41 (Update terbaru) untuk KEDUA periode
           // V41 memastikan Gapok = (H + LP + TM) * Rate
           const funcName = 'calculate_monthly_report_v41'; 
           
           await supabase.rpc(funcName, {
             p_bulan: target.bulan,
             p_kode: target.kode,
             p_perusahaan: target.perusahaan,
             p_target_periode: 'Periode 1'
           });
           await supabase.rpc(funcName, {
             p_bulan: target.bulan,
             p_kode: target.kode,
             p_perusahaan: target.perusahaan,
             p_target_periode: 'Periode 2'
           });
        });
        
        await Promise.all(promises);
        processed += batch.length;
        setRecalcProgress(`Memproses... ${Math.round((processed / total) * 100)}% (${processed}/${total} Karyawan)`);
        await new Promise(r => setTimeout(r, 20)); 
      }

      setSuccessModal({
        isOpen: true,
        title: 'Hitung Ulang Selesai',
        message: `Perhitungan Gapok V41 Selesai.\n\nTotal Karyawan Diproses: ${total}`
      });
      fetchData();

    } catch (error: any) {
      console.error('Recalculate error:', error);
      // Fallback error message jika fungsi V41 belum ada
      if (error.message.includes('function calculate_monthly_report_v41 does not exist')) {
         setErrorModal({ 
           isOpen: true, 
           title: 'Update Diperlukan', 
           message: 'Fungsi database V41 belum terinstall. Silakan jalankan kode SQL yang disediakan.' 
         });
      } else {
         setErrorModal({ isOpen: true, title: 'Gagal Hitung Ulang', message: error.message });
      }
    } finally {
      setIsRecalculating(false);
      setRecalcProgress('');
    }
  };

  // --- EXPORT (SERVER-SIDE FETCH WITH BATCHING) ---
  const handleExport = async () => {
    setIsLoading(true);
    try {
      let allData: any[] = [];
      let from = 0;
      const step = 500; // Reduced from 1000 to prevent network errors
      let hasMore = true;

      // Loop untuk mengambil data per 500 baris
      while (hasMore) {
        let query = supabase
          .from('laporan_bulanan_pabrik')
          .select('*')
          .neq('perusahaan', 'BORONGAN'); // EXCLUDE BORONGAN

        if (filterMonth) query = query.eq('bulan', filterMonth);
        if (filterPeriod) query = query.eq('periode', filterPeriod);
        if (filterCompany) query = query.eq('perusahaan', filterCompany);
        if (filterDivision) query = query.eq('divisi', filterDivision);
        if (searchTerm) {
          query = query.or(`nama.ilike.%${searchTerm}%,kode.ilike.%${searchTerm}%`);
        }

        const { data: batch, error } = await query
          .order('nama', { ascending: true })
          .order('id', { ascending: true }) 
          .range(from, from + step - 1);

        if (error) throw error;

        if (batch && batch.length > 0) {
          allData = [...allData, ...batch];
          from += step;
          if (batch.length < step) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      if (allData.length === 0) {
        alert("Tidak ada data yang cocok untuk diexport.");
        return;
      }
    
      const exportData = allData.map(row => ({
        'Bulan': row.bulan,
        'Periode': row.periode,
        'Perusahaan': row.perusahaan,
        'Nama': row.nama,
        'Kode': row.kode,
        'Divisi': row.divisi,
        'Grade P1': row.grade_p1,
        'Grade P2': row.grade_p2,
        'Hadir': row.h,
        'Sakit (B)': row.s_b,
        'Izin (B)': row.i_b,
        'Telat (B)': row.t_b,
        'Gapok': row.gapok,
        'Lembur': row.gaji_lembur,
        'Uang Makan': row.u_m,
        'Uang Hadir': row.u_k,
        'Bonus': row.uang_bonus,
        'Kasbon': row.kasbon,
        'Penyesuaian': row.penyesuaian_bonus,
        'Total Gaji': row.hasil_gaji,
        'Keterangan': row.keterangan,
        'Libur PT': row.libur_perusahaan
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(wb, ws, "Laporan Bulanan");
      XLSX.writeFile(wb, `Laporan_Gaji_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch (error: any) {
      console.error("Export error:", error);
      alert(`Gagal Export: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNameClick = (item: any) => {
    setDetailModalData(item);
    setIsDetailModalOpen(true);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        {!hideTitle && (
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              Laporan Bulanan 
              <span className="text-xs font-normal bg-green-100 text-green-700 border border-green-200 px-2 py-1 rounded-full flex items-center gap-1">
                <Zap size={12} className="fill-green-700"/> V41 (Fix Gapok)
              </span>
            </h2>
            <p className="text-xs text-gray-500 mt-1">Khusus CV HANAN & CV ADNAN (Exclude Borongan)</p>
          </div>
        )}
        
        <div className={`flex items-center gap-3 ${hideTitle ? 'w-full justify-between' : ''}`}>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button onClick={() => setViewMode('kehadiran')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'kehadiran' ? 'bg-white text-erp-pink shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <CalendarCheck size={16} /> Kehadiran
            </button>
            <button onClick={() => setViewMode('gaji')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'gaji' ? 'bg-white text-erp-pink shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Wallet size={16} /> Gaji
            </button>
          </div>

          <div className="flex gap-2">
            {/* Tombol Hitung Ulang (Sekarang termasuk Cleanup) */}
            <button 
              onClick={handleRecalculate} 
              disabled={isRecalculating}
              className="px-4 py-2 bg-orange-50 border border-orange-200 text-orange-700 rounded-lg hover:bg-orange-100 shadow-sm flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50"
              title="Hitung Ulang & Bersihkan Data"
            >
              {isRecalculating ? <Loader2 className="animate-spin" size={16}/> : <Calculator size={16} />} 
              {isRecalculating ? recalcProgress : 'Hitung Ulang'}
            </button>

            <button onClick={() => fetchData()} className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 shadow-sm flex items-center gap-2 text-sm font-medium transition-colors" title="Muat Ulang Data">
              <RefreshCw size={16} /> Refresh
            </button>
            
            <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm flex items-center gap-2 text-sm font-medium transition-colors">
              <Download size={16} /> Export
            </button>
          </div>
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input type="text" placeholder="Cari Nama / Kode..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink/50 outline-none" />
        </div>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none cursor-pointer">
          <option value="">Semua Bulan</option>
          {optMonths.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none cursor-pointer">
          <option value="">Semua Periode</option>
          {optPeriods.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none cursor-pointer">
          <option value="">Semua Perusahaan</option>
          {optCompanies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterDivision} onChange={e => setFilterDivision(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none cursor-pointer">
          <option value="">Semua Divisi</option>
          {optDivisions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
        <div className="overflow-auto max-h-[600px] custom-scrollbar relative">
          <table className="w-full text-xs text-left whitespace-nowrap relative border-collapse">
            <thead className="bg-gray-100 dark:bg-dark-700 text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Bulan</th>
                <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Periode</th>
                <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Perusahaan</th>
                <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Nama</th>
                <th className="px-4 py-3 border-r border-gray-200">Kode</th>
                <th className="px-2 py-3 text-center border-r border-gray-200">P1</th>
                <th className="px-2 py-3 text-center border-r border-gray-200">P2</th>
                <th className="px-4 py-3 border-r border-gray-200">Divisi</th>

                {viewMode === 'kehadiran' && (
                  <>
                    <th className="px-2 py-3 text-center bg-blue-50 border-r border-blue-100">H</th>
                    <th className="px-2 py-3 text-center bg-blue-50 border-r border-blue-100">I/B</th>
                    <th className="px-2 py-3 text-center bg-blue-50 border-r border-blue-100">I/TB</th>
                    <th className="px-2 py-3 text-center bg-blue-50 border-r border-blue-100">S/B</th>
                    <th className="px-2 py-3 text-center bg-blue-50 border-r border-blue-100">S/TB</th>
                    <th className="px-2 py-3 text-center bg-blue-50 border-r border-blue-100">T/B</th>
                    <th className="px-2 py-3 text-center bg-blue-50 border-r border-blue-100">T/TB</th>
                    <th className="px-2 py-3 text-center bg-blue-50 border-r border-blue-100">Set.H</th>
                    <th className="px-2 py-3 text-center bg-blue-50 border-r border-blue-100">LP</th>
                    <th className="px-2 py-3 text-center bg-yellow-50 border-r border-yellow-100">Lembur</th>
                    <th className="px-2 py-3 text-center bg-blue-50 border-r border-blue-100">TM</th>
                    <th className="px-4 py-3 border-r border-gray-200 bg-purple-50 text-purple-700">Keluar/Masuk</th>
                    <th className="px-4 py-3 border-r border-gray-200 w-40">Ket</th>
                    <th className="px-4 py-3 border-r border-gray-200 bg-orange-50 text-orange-700">Libur PT</th>
                  </>
                )}

                {viewMode === 'gaji' && (
                  <>
                    <th className="px-4 py-3 text-right bg-green-50 border-r border-green-100">Gapok</th>
                    <th className="px-4 py-3 text-right bg-green-50 border-r border-green-100">Gaji Lembur</th>
                    <th className="px-4 py-3 text-right bg-green-50 border-r border-green-100">U. Makan</th>
                    <th className="px-4 py-3 text-right bg-green-50 border-r border-green-100">U. Hadir</th>
                    <th className="px-4 py-3 text-right bg-green-50 border-r border-green-100">Bonus</th>
                    <th className="px-4 py-3 text-right bg-red-50 border-r border-red-100 text-red-600">Kasbon</th>
                    <th className="px-4 py-3 text-right bg-green-50 border-r border-green-100 text-blue-600">Penyesuaian</th>
                    <th className="px-4 py-3 text-right font-bold bg-green-100/50 border-l border-green-200 text-green-800">TOTAL GAJI</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={25} className="p-12 text-center"><Loader2 className="animate-spin inline text-erp-pink"/> Memuat data dari database...</td></tr>
              ) : data.length > 0 ? (
                data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-2 border-r border-gray-100">{row.bulan}</td>
                    <td className="px-4 py-2 border-r border-gray-100">{row.periode}</td>
                    <td className="px-4 py-2 border-r border-gray-100">{row.perusahaan}</td>
                    
                    {/* KOLOM NAMA YANG BISA DIKLIK */}
                    <td 
                      className={`px-4 py-2 font-bold border-r border-gray-100 cursor-pointer hover:underline ${row.nama === 'Unknown' ? 'text-red-500' : 'text-blue-600'}`}
                      onClick={() => handleNameClick(row)}
                      title="Klik untuk melihat rincian hitungan"
                    >
                      {row.nama}
                    </td>
                    
                    <td className="px-4 py-2 font-mono text-gray-500 border-r border-gray-100">{row.kode}</td>
                    <td className="px-2 py-2 text-center border-r border-gray-100">{row.grade_p1}</td>
                    <td className="px-2 py-2 text-center border-r border-gray-100">{row.grade_p2}</td>
                    <td className="px-4 py-2 border-r border-gray-100">{row.divisi}</td>
                    
                    {viewMode === 'kehadiran' && (
                      <>
                        <td className="px-2 py-2 text-center bg-blue-50/30 font-bold border-r border-blue-50">{row.h}</td>
                        <td className="px-2 py-2 text-center bg-blue-50/30 text-gray-500 border-r border-blue-50">{row.i_b}</td>
                        <td className="px-2 py-2 text-center bg-blue-50/30 text-gray-500 border-r border-blue-50">{row.i_tb}</td>
                        <td className="px-2 py-2 text-center bg-blue-50/30 text-gray-500 border-r border-blue-50">{row.s_b}</td>
                        <td className="px-2 py-2 text-center bg-blue-50/30 text-gray-500 border-r border-blue-50">{row.s_tb}</td>
                        <td className="px-2 py-2 text-center bg-blue-50/30 text-gray-500 border-r border-blue-50">{row.t_b}</td>
                        <td className="px-2 py-2 text-center bg-blue-50/30 text-gray-500 border-r border-blue-50">{row.t_tb}</td>
                        <td className="px-2 py-2 text-center bg-blue-50/30 text-gray-500 border-r border-blue-50">{row.set_h}</td>
                        <td className="px-2 py-2 text-center bg-blue-50/30 text-gray-500 border-r border-blue-50">{row.lp}</td>
                        <td className="px-2 py-2 text-center bg-yellow-50/30 font-medium border-r border-yellow-50">{row.lembur}</td>
                        <td className="px-2 py-2 text-center bg-blue-50/30 text-gray-500 border-r border-blue-50">{row.tm}</td>
                        <td className="px-4 py-2 border-r border-gray-100 text-purple-600 font-medium">{row.keluar_masuk || '-'}</td>
                        <td className="px-4 py-2 border-r border-gray-100 text-xs text-gray-500 truncate max-w-[12rem]" title={row.keterangan}>
                          {row.keterangan}
                        </td>
                        <td className="px-4 py-2 border-r border-gray-100 text-orange-600 font-medium">{row.libur_perusahaan || '-'}</td>
                      </>
                    )}

                    {viewMode === 'gaji' && (
                      <>
                        <td className="px-4 py-2 text-right bg-green-50/30 text-gray-600 border-r border-green-50">
                          {formatRupiah(row.gapok)}
                        </td>
                        <td className="px-4 py-2 text-right bg-green-50/30 text-gray-600 border-r border-green-50">{formatRupiah(row.gaji_lembur)}</td>
                        <td className="px-4 py-2 text-right bg-green-50/30 text-gray-600 border-r border-green-50">{formatRupiah(row.u_m)}</td>
                        <td className="px-4 py-2 text-right bg-green-50/30 text-gray-600 border-r border-green-50">{formatRupiah(row.u_k)}</td>
                        <td className="px-4 py-2 text-right bg-green-50/30 text-gray-600 border-r border-green-50">{formatRupiah(row.uang_bonus)}</td>
                        <td className="px-4 py-2 text-right bg-red-50/30 text-red-600 border-r border-red-50">{formatRupiah(row.kasbon)}</td>
                        <td className="px-4 py-2 text-right bg-green-50/30 text-blue-600 border-r border-green-50">{formatRupiah(row.penyesuaian_bonus)}</td>
                        <td className="px-4 py-2 text-right font-bold bg-green-100/50 border-l border-green-200 text-green-800">{formatRupiah(row.hasil_gaji)}</td>
                      </>
                    )}
                  </tr>
                ))
              ) : (
                <tr><td colSpan={25} className="p-16 text-center text-gray-400">
                  {searchTerm || filterMonth ? 'Data tidak ditemukan.' : 'Belum ada data laporan.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message} />
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message} />
      <ConfirmationModal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} onConfirm={confirmModal.onConfirm} title={confirmModal.title} message={confirmModal.message} confirmLabel={confirmModal.confirmLabel} />
      
      {/* MODAL RINCIAN GAJI - FIXED VARIABLE NAME */}
      <SalaryDetailModal 
        isOpen={isDetailModalOpen} 
        onClose={() => setIsDetailModalOpen(false)} 
        data={detailModalData} 
      />
    </div>
  );
};
