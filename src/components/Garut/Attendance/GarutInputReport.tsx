import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Download, Filter, Loader2, 
  RefreshCw, Calculator, ArrowRight, CheckCircle2, Users,
  Wallet, CalendarCheck, Coins, AlertCircle, AlertTriangle, Layers, Database, Copy, X
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';
import { ConfirmationModal } from '../../Warehouse/ConfirmationModal';
import { SalaryDetailModal } from '../../Factory/Attendance/SalaryDetailModal'; 
import * as XLSX from 'xlsx';

interface GarutInputReportProps {
  hideTitle?: boolean;
}

export const GarutInputReport: React.FC<GarutInputReportProps> = ({
  hideTitle = false
}) => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTableMissing, setIsTableMissing] = useState(false);
  
  // Filters & View Mode
  const [filterMonth, setFilterMonth] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [filterBagian, setFilterBagian] = useState(''); 
  const [filterDivision, setFilterDivision] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Dropdown Options
  const [optMonths, setOptMonths] = useState<string[]>([]);
  const [optPeriods, setOptPeriods] = useState<string[]>([]);
  const [optBagians, setOptBagians] = useState<string[]>([]); 
  const [optDivisions, setOptDivisions] = useState<string[]>([]);
  const [optCompanies, setOptCompanies] = useState<string[]>([]);

  // Modals
  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedDetailData, setSelectedDetailData] = useState<any>(null);
  
  // Confirm Modal
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; onConfirm: () => void; title?: string; message?: string; confirmLabel?: string; isDangerous?: boolean }>({ isOpen: false, onConfirm: () => {}, title: '', message: '' });

  // View Mode
  const [viewMode, setViewMode] = useState<'kehadiran' | 'gaji'>('kehadiran');

  // Helper Format Rupiah
  const formatRupiah = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  // --- INITIAL LOAD ---
  useEffect(() => {
    const fetchOptions = async () => {
      if (!isSupabaseConfigured()) return;
      
      // 1. Ambil Bulan dari Master Karyawan
      const { data: empData } = await supabase
        .from('data_karyawan_pabrik_garut')
        .select('bulan'); 

      // 2. Ambil Data dari Laporan (Total Gaji) - Termasuk Bulan
      const { data: reportData } = await supabase
        .from('total_gaji_pabrik_garut')
        .select('bulan, perusahaan, divisi, bagian');

      // Gabungkan bulan dari kedua sumber
      const allMonths = new Set<string>();
      
      if (empData) {
        empData.forEach(d => {
            if (d.bulan) allMonths.add(d.bulan);
        });
      }

      if (reportData) {
        reportData.forEach(d => {
            if (d.bulan) allMonths.add(d.bulan);
        });
      }

      // Sort Bulan Secara Kronologis (Bukan Alfabet)
      const monthMap: Record<string, number> = {
        'januari': 1, 'februari': 2, 'maret': 3, 'april': 4, 'mei': 5, 'juni': 6,
        'juli': 7, 'agustus': 8, 'september': 9, 'oktober': 10, 'november': 11, 'desember': 12
      };

      const sortedMonths = Array.from(allMonths).sort((a, b) => {
          const partsA = a.split(' ');
          const partsB = b.split(' ');
          const monthA = partsA[0]?.toLowerCase();
          const monthB = partsB[0]?.toLowerCase();
          const yearA = parseInt(partsA[1]) || 0;
          const yearB = parseInt(partsB[1]) || 0;

          if (yearA !== yearB) return yearB - yearA; // Descending Year
          return (monthMap[monthB] || 0) - (monthMap[monthA] || 0); // Descending Month
      });

      setOptMonths(sortedMonths);

      // Auto select latest month if not set
      if (sortedMonths.length > 0 && !filterMonth) {
        // Coba cari bulan saat ini dulu
        const currentMonthName = new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        const match = sortedMonths.find(m => m.toLowerCase() === currentMonthName.toLowerCase());
        setFilterMonth(match || sortedMonths[0]);
      }

      // Process Companies, Divisions, Bagians from Report Data
      if (reportData) {
         const divisions = [...new Set(reportData.map(d => d.divisi).filter(Boolean))].sort();
         const bagians = [...new Set(reportData.map(d => d.bagian).filter(Boolean))].sort();
         
         // Filter perusahaan untuk membuang data kotor
         let companies = [...new Set(
             reportData.map(d => d.perusahaan)
             .filter(p => p && p.trim() !== '' && isNaN(parseInt(p.trim()[0]))) 
         )].sort();
         
         // Fallback: Jika kosong, ambil dari master
         if (companies.length === 0) {
             const { data: masterCompanies } = await supabase
                .from('data_karyawan_pabrik_garut')
                .select('perusahaan')
                .limit(2000);
             
             if (masterCompanies) {
                 companies = [...new Set(
                     masterCompanies.map(d => d.perusahaan)
                     .filter(p => p && (p.toUpperCase().includes('ADNAN') || p.toUpperCase().includes('HANAN')))
                 )].sort();
             }
         }

         setOptDivisions(divisions);
         setOptBagians(bagians);
         setOptCompanies(companies);
      }
      
      setOptPeriods(['Periode 1', 'Periode 2']);
    };
    fetchOptions();
  }, []);

  const fetchData = async () => {
    if (!filterMonth) return;
    setIsLoading(true);

    try {
      // UPDATED: Sumber dari total_gaji_pabrik_garut
      let query = supabase
        .from('total_gaji_pabrik_garut')
        .select('*');

      if (filterMonth) query = query.eq('bulan', filterMonth);
      if (filterPeriod && filterPeriod !== 'Semua Periode') query = query.eq('periode', filterPeriod);
      if (filterCompany && filterCompany !== 'Semua Perusahaan') query = query.eq('perusahaan', filterCompany);
      if (filterDivision && filterDivision !== 'Semua Divisi') query = query.eq('divisi', filterDivision);
      if (filterBagian && filterBagian !== 'Semua Bagian') query = query.eq('bagian', filterBagian);
      
      if (searchTerm) {
        query = query.or(`nama.ilike.%${searchTerm}%,kode.ilike.%${searchTerm}%`);
      }

      const { data: result, error } = await query.order('kode', { ascending: true });

      if (error) throw error;

      setData(result || []);
    } catch (error: any) {
      console.error("Error fetching report:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterMonth, filterPeriod, filterCompany, filterDivision, filterBagian]);

  const handleExport = () => {
    if (data.length === 0) return;
    
    const exportData = data.map((item, index) => {
      const gajiKotor = Number(item.gapok || 0) + Number(item.gaji_lembur || 0) + Number(item.u_m || 0) + Number(item.u_k || 0) + Number(item.uang_bonus || 0);
      
      return {
        'No': index + 1,
        'Bulan': item.bulan,
        'Periode': item.periode,
        'Perusahaan': item.perusahaan,
        'Kode': item.kode,
        'Nama': item.nama,
        'Grade P1': item.grade_p1,
        'Grade P2': item.grade_p2,
        'Divisi': item.divisi,
        'Bagian': item.bagian, // Added Bagian
        'H': Number(item.h || 0),
        'B': Number(item.b || 0),
        'S_B': Number(item.s_b || 0),
        'S_TB': Number(item.s_tb || 0),
        'I_B': Number(item.i_b || 0),
        'I_TB': Number(item.i_tb || 0),
        'T_B': Number(item.t_b || 0),
        'T_TB': Number(item.t_tb || 0),
        'Set.H': Number(item.set_h || 0),
        'LP': Number(item.lp || 0),
        'TM': Number(item.tm || 0),
        'Lembur': Number(item.lembur || 0),
        'Gapok': Number(item.gapok || 0),
        'Gaji Lembur': Number(item.gaji_lembur || 0),
        'Uang Makan': Number(item.u_m || 0),
        'Uang Kehadiran': Number(item.u_k || 0),
        'Bonus': Number(item.uang_bonus || 0),
        'Total Gaji Kotor': gajiKotor, // Added Total Kotor
        'Kasbon': Number(item.kasbon || 0),
        'Penyesuaian': Number(item.penyesuaian_bonus || 0),
        'Total Gaji (Net)': Number(item.hasil_gaji || item.total_gaji || 0), 
        'Keterangan': item.keterangan || '',
        'Keluar/Masuk': item.keluar_masuk || '' 
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Input");
    XLSX.writeFile(wb, `Laporan_Input_Garut_${filterMonth || 'All'}.xlsx`);
  };

  // --- FILTERED DATA MEMO ---
  const filteredData = useMemo(() => {
    return data.filter(item => 
      item.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.kode.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data, searchTerm]);

  // --- CALCULATE TOTALS ---
  const totals = useMemo(() => {
    return filteredData.reduce((acc, item) => {
      const net = Number(item.hasil_gaji || item.total_gaji || 0);
      
      const gapok = Number(item.gapok || 0);
      const lembur = Number(item.gaji_lembur || 0);
      const makan = Number(item.u_m || 0);
      const hadir = Number(item.u_k || 0);
      const bonus = Number(item.uang_bonus || 0);
      const gross = gapok + lembur + makan + hadir + bonus;

      return {
        gaji: acc.gaji + net,
        karyawan: acc.karyawan + 1,
        gross: acc.gross + gross
      };
    }, { gaji: 0, karyawan: 0, gross: 0 });
  }, [filteredData]);

  const handleNameClick = (item: any) => {
    setSelectedDetailData(item);
    setIsDetailOpen(true);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* --- HEADER SECTION (Title + Toggle + Actions) --- */}
      <div className="flex flex-col lg:flex-row justify-between items-end gap-4">
        {!hideTitle && (
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                Laporan Input (Total Gaji)
            </h2>
            <p className="text-sm text-gray-500">Sumber: total_gaji_pabrik_garut</p>
          </div>
        )}
        
        <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex bg-white border border-gray-200 p-1 rounded-lg shadow-sm mr-2">
                <button 
                    onClick={() => setViewMode('kehadiran')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                        viewMode === 'kehadiran' 
                        ? 'bg-erp-pink/10 text-erp-pink border border-erp-pink/20' 
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    <CalendarCheck size={16}/> Kehadiran
                </button>
                <button 
                    onClick={() => setViewMode('gaji')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                        viewMode === 'gaji' 
                        ? 'bg-erp-pink/10 text-erp-pink border border-erp-pink/20' 
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    <Wallet size={16}/> Gaji
                </button>
            </div>

            {/* Actions */}
             <button onClick={() => fetchData()} className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 shadow-sm flex items-center gap-2 text-sm font-medium transition-colors">
                <RefreshCw size={16} /> Refresh
             </button>
             
             <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm flex items-center gap-2 text-sm font-medium transition-colors">
                <Download size={16} /> Export
             </button>
        </div>
      </div>

      {/* --- FILTERS SECTION (Full Width Row) --- */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                    type="text" 
                    placeholder="Cari Nama / Kode..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-erp-pink" 
                />
            </div>
            
            {/* Month */}
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none cursor-pointer bg-white w-full">
                <option value="">Semua Bulan</option>
                {optMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            {/* Period */}
            <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none cursor-pointer bg-white w-full">
                <option value="">Semua Periode</option>
                {optPeriods.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            {/* Company */}
            <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none cursor-pointer bg-white w-full">
                <option value="">Semua Perusahaan</option>
                {optCompanies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* Division */}
            <select value={filterDivision} onChange={e => setFilterDivision(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none cursor-pointer bg-white w-full">
                <option value="">Semua Divisi</option>
                {optDivisions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            
            {/* Bagian Filter */}
            <select value={filterBagian} onChange={e => setFilterBagian(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none cursor-pointer bg-white w-full">
                <option value="">Semua Bagian</option>
                {optBagians.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
        </div>
      </div>

      {/* --- SUMMARY CARDS --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-green-50 border border-green-200 p-4 rounded-xl shadow-sm flex flex-col justify-between">
             <div className="flex items-center gap-2 text-green-700 font-bold text-xs uppercase mb-1">
                <Wallet size={14}/> Total Gaji (Net)
             </div>
             <p className="text-2xl font-bold text-green-800">{formatRupiah(totals.gaji)}</p>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl shadow-sm flex flex-col justify-between">
             <div className="flex items-center gap-2 text-blue-700 font-bold text-xs uppercase mb-1">
                <Coins size={14}/> TOTAL GAJI KOTOR
             </div>
             <p className="text-2xl font-bold text-blue-800">{formatRupiah(totals.gross)}</p>
          </div>
      </div>

      {/* --- TABLE --- */}
      {isTableMissing ? (
         <div className="p-12 text-center bg-white border border-red-200 rounded-xl">
            <AlertTriangle className="mx-auto text-red-400 mb-4" size={48}/>
            <h3 className="text-lg font-bold text-gray-800">Database Belum Siap</h3>
            <p className="text-gray-500 mb-4">Tabel <code>total_gaji_pabrik_garut</code> belum dibuat atau kosong.</p>
         </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
            <div className="overflow-auto max-h-[650px] custom-scrollbar relative">
            <table className="w-full text-xs text-left whitespace-nowrap relative border-collapse">
                <thead className="bg-gray-50 text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                <tr>
                    <th className="px-4 py-3 border-r border-gray-200 bg-gray-100 w-10 text-center">No</th>
                    <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Bulan</th>
                    <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Periode</th>
                    <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Perusahaan</th>
                    <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Kode</th>
                    <th className="px-4 py-3 border-r border-gray-200 bg-gray-100 min-w-[150px]">Nama</th>
                    <th className="px-2 py-3 border-r border-gray-200 bg-gray-100 text-center">P1</th>
                    <th className="px-2 py-3 border-r border-gray-200 bg-gray-100 text-center">P2</th>
                    <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Divisi</th>
                    <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Bagian</th>
                    
                    {viewMode === 'kehadiran' && (
                      <>
                        <th className="px-2 py-3 border-r border-blue-200 bg-blue-50 text-center w-10 font-bold text-blue-800">H</th>
                        <th className="px-2 py-3 border-r border-red-200 bg-red-50 text-center w-10 font-bold text-red-800">B</th>
                        
                        <th className="px-2 py-3 border-r border-green-200 bg-green-50 text-center w-10 font-bold text-green-800">I_B</th>
                        <th className="px-2 py-3 border-r border-green-200 bg-green-50 text-center w-10 font-bold text-green-800">I_TB</th>

                        <th className="px-2 py-3 border-r border-green-200 bg-green-50 text-center w-10 font-bold text-green-800">S_B</th>
                        <th className="px-2 py-3 border-r border-green-200 bg-green-50 text-center w-10 font-bold text-green-800">S_TB</th>

                        <th className="px-2 py-3 border-r border-green-200 bg-green-50 text-center w-10 font-bold text-green-800">T_B</th>
                        <th className="px-2 py-3 border-r border-green-200 bg-green-50 text-center w-10 font-bold text-green-800">T_TB</th>
                        
                        <th className="px-2 py-3 border-r border-blue-200 bg-blue-50 text-center w-10 font-bold text-blue-800">Set.H</th>
                        <th className="px-2 py-3 border-r border-blue-200 bg-blue-50 text-center w-10 text-gray-500">LP</th>
                        <th className="px-2 py-3 border-r border-blue-200 bg-blue-50 text-center w-10 text-gray-500">TM</th>
                        <th className="px-3 py-3 border-r border-yellow-200 bg-yellow-50 text-center font-bold text-yellow-800">Lembur</th>
                        
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
                        <th className="px-3 py-3 border-r border-gray-300 bg-blue-50 text-right min-w-[100px] font-bold text-blue-800">Total Kotor</th>
                        <th className="px-3 py-3 border-r border-gray-300 bg-red-50 text-right min-w-[100px] text-red-700">Kasbon</th>
                        <th className="px-3 py-3 border-r border-gray-300 bg-blue-50 text-right text-blue-700">Penyesuaian</th>
                        <th className="px-3 py-3 border-r border-green-100 text-right font-bold text-green-800 bg-green-100/30">Total Gaji (Net)</th>
                      </>
                    )}
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                    <tr><td colSpan={25} className="p-12 text-center"><Loader2 className="animate-spin inline text-erp-pink mr-2"/> Memuat data dari database...</td></tr>
                ) : filteredData.length > 0 ? (
                    filteredData.map((item, idx) => {
                      const gajiKotor = Number(item.gapok || 0) + Number(item.gaji_lembur || 0) + Number(item.u_m || 0) + Number(item.u_k || 0) + Number(item.uang_bonus || 0);
                      
                      return (
                      <tr key={item.id || idx} className="hover:bg-gray-50 transition-colors">
                          {/* IDENTIFYING DATA */}
                          <td className="px-4 py-2 border-r border-gray-100 text-center text-gray-500">{idx + 1}</td>
                          <td className="px-4 py-2 border-r border-gray-100 text-gray-600">{item.bulan}</td>
                          <td className="px-4 py-2 border-r border-gray-100 text-gray-600">{item.periode}</td>
                          <td className="px-4 py-2 border-r border-gray-100 font-medium text-gray-700">{item.perusahaan}</td>
                          <td className="px-4 py-2 border-r border-gray-100 font-mono text-gray-500">{item.kode}</td>
                          <td 
                              className="px-4 py-2 border-r border-gray-100 font-bold text-blue-600 cursor-pointer hover:underline"
                              onClick={() => handleNameClick(item)}
                              title="Klik untuk lihat rincian hitungan"
                          >
                              {item.nama}
                          </td>
                          <td className="px-2 py-2 border-r border-gray-100 text-center font-bold text-blue-600">{item.grade_p1 || '-'}</td>
                          <td className="px-2 py-2 border-r border-gray-100 text-center font-bold text-purple-600">{item.grade_p2 || '-'}</td>
                          <td className="px-4 py-2 border-r border-gray-100 text-gray-600">{item.divisi}</td>
                          <td className="px-4 py-2 border-r border-gray-100 text-gray-600">{item.bagian || '-'}</td>
                          
                          {/* ATTENDANCE DATA */}
                          {viewMode === 'kehadiran' && (
                            <>
                              <td className="px-2 py-2 border-r border-blue-50 text-center font-bold bg-blue-50/20">{item.h}</td>
                              <td className="px-2 py-2 border-r border-red-50 text-center font-bold bg-red-50/20 text-red-600">{item.b}</td>
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

                          {/* SALARY DATA */}
                          {viewMode === 'gaji' && (
                            <>
                              <td className="px-3 py-2 border-r border-green-50 text-right text-gray-600 bg-green-50/10">{formatRupiah(item.gapok)}</td>
                              <td className="px-3 py-2 border-r border-green-50 text-right text-gray-600 bg-green-50/10">{formatRupiah(item.gaji_lembur)}</td>
                              <td className="px-3 py-2 border-r border-green-50 text-right text-gray-600 bg-green-50/10">{formatRupiah(item.u_m)}</td>
                              <td className="px-3 py-2 border-r border-green-50 text-right text-gray-600 bg-green-50/10">{formatRupiah(item.u_k)}</td>
                              <td className="px-3 py-2 border-r border-green-50 text-right text-gray-600 bg-green-50/10">{formatRupiah(item.uang_bonus)}</td>
                              
                              {/* TOTAL GAJI KOTOR */}
                              <td className="px-3 py-2 border-r border-blue-100 text-right font-bold text-blue-800 bg-blue-50/20">{formatRupiah(gajiKotor)}</td>

                              <td className="px-3 py-2 border-r border-red-50 text-right text-red-500 bg-red-50/10">{formatRupiah(item.kasbon)}</td>
                              <td className="px-3 py-2 border-r border-blue-50 text-right text-blue-500 bg-blue-50/10">{formatRupiah(item.penyesuaian_bonus)}</td>
                              <td className="px-3 py-2 border-r border-green-100 text-right font-bold text-green-800 bg-green-100/30">{formatRupiah(item.hasil_gaji || item.total_gaji)}</td>
                            </>
                          )}
                      </tr>
                      )
                    })
                ) : (
                    <tr><td colSpan={25} className="p-16 text-center text-gray-400 italic">
                        {searchTerm || filterMonth ? 'Data tidak ditemukan.' : 'Belum ada data laporan.'}
                    </td>
                    </tr>
                )}
                </tbody>
            </table>
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
      
      {/* DETAIL MODAL (GARUT MODE) */}
      <SalaryDetailModal 
        isOpen={isDetailOpen} 
        onClose={() => setIsDetailOpen(false)} 
        data={selectedDetailData} 
        isGarut={true}
      />
    </div>
  );
};
