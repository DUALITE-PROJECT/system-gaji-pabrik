import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Loader2, RefreshCw, Download, Info, Wallet, Package, Table, Database, Copy, X
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import * as XLSX from 'xlsx';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';
import { BiayaGajiDetailModal } from './BiayaGajiDetailModal';

export const BiayaOutput: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  
  // Options
  const [optMonths, setOptMonths] = useState<string[]>([]);
  const [optCompanies, setOptCompanies] = useState<string[]>([]);

  // Modals
  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  const [showSqlModal, setShowSqlModal] = useState(false);
  
  // Detail Modal State
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<any>(null);

  // SQL Code for View Update (V3 - Realtime & Consistent)
  const sqlViewUpdate = `
-- VIEW: BIAYA OUTPUT PABRIK GARUT (V3 - Realtime Consistency)
-- Menggabungkan Input Produksi + Gaji Pabrik + Gaji Staff

CREATE OR REPLACE VIEW view_biaya_output_pabrik_garut AS
WITH 
-- 1. AGREGASI PRODUKSI (Sumber Utama Identity)
produktivitas AS (
    SELECT 
        bulan,
        perusahaan,
        bagian,
        posisi,
        sku,
        SUM(qty) AS qty,
        AVG(jumlah_orang) AS jumlah_orang,
        -- Hitung total qty per bagian untuk pembagi HPP proporsional
        SUM(SUM(qty)) OVER (PARTITION BY bulan, perusahaan, bagian) as total_qty_bagian
    FROM input_data_produksi
    GROUP BY bulan, perusahaan, bagian, posisi, sku
),

-- 2. AGREGASI GAJI (Pabrik + Staff)
gaji_gabungan AS (
    -- Sumber 1: Laporan Bulanan Pabrik (Produksi)
    SELECT 
        bulan,
        perusahaan,
        divisi AS bagian,
        kode,
        (COALESCE(gapok,0) + COALESCE(gaji_lembur,0) + COALESCE(u_m,0) + COALESCE(u_k,0) + COALESCE(uang_bonus,0)) as total_gaji_person
    FROM laporan_bulanan_pabrik_garut
    
    UNION ALL
    
    -- Sumber 2: Laporan Bulanan Staff
    SELECT 
        bulan,
        perusahaan,
        divisi AS bagian,
        kode,
        (COALESCE(gapok,0) + COALESCE(gaji_lembur,0) + COALESCE(u_m,0) + COALESCE(u_k,0) + COALESCE(uang_bonus,0)) as total_gaji_person
    FROM laporan_bulanan_staff_pabrik
),

-- 3. TOTAL GAJI PER BAGIAN
total_gaji_bagian AS (
    SELECT 
        bulan,
        perusahaan,
        bagian,
        COUNT(DISTINCT kode) as jumlah_karyawan, -- Hitung jumlah orang unik
        SUM(total_gaji_person) as gaji_total
    FROM gaji_gabungan
    GROUP BY bulan, perusahaan, bagian
)

-- 4. FINAL JOIN
SELECT 
    p.bulan,
    p.perusahaan,
    p.bagian,
    p.posisi,
    p.sku,
    
    -- Data Produksi
    p.qty,
    ROUND(p.jumlah_orang, 2) as jumlah_orang,
    
    -- Data Gaji (Diambil dari mapping Bagian = Divisi)
    COALESCE(g.gaji_total, 0) as gaji,
    COALESCE(g.jumlah_karyawan, 0) as jumlah_karyawan,
    
    -- Perhitungan HPP (Cost Per Unit)
    -- Rumus: Total Gaji Divisi / Total Output Divisi
    CASE 
        WHEN p.total_qty_bagian > 0 THEN (COALESCE(g.gaji_total, 0) / p.total_qty_bagian)
        ELSE 0 
    END as hpp

FROM produktivitas p
LEFT JOIN total_gaji_bagian g ON 
    p.bulan = g.bulan AND 
    p.perusahaan = g.perusahaan AND 
    p.bagian = g.bagian;

-- Grant Permissions
GRANT SELECT ON view_biaya_output_pabrik_garut TO authenticated, service_role;
  `;

  const handleCopySQL = () => {
    navigator.clipboard.writeText(sqlViewUpdate);
    setSuccessModal({ isOpen: true, title: 'SQL Disalin', message: 'Silakan jalankan kode di SQL Editor Supabase untuk memperbarui logika View.' });
  };

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

  // --- FETCH DATA ---
  const fetchData = async () => {
    setIsLoading(true);

    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }

    try {
      const { data: result, error } = await fetchWithRetry(async () => {
        // Try fetching from the VIEW first
        let query = supabase
          .from('view_biaya_output_pabrik_garut') 
          .select('*');

        if (filterMonth) query = query.ilike('bulan', filterMonth);
        if (filterCompany) query = query.ilike('perusahaan', filterCompany);
        
        if (searchTerm) {
          query = query.or(`sku.ilike.%${searchTerm}%,bagian.ilike.%${searchTerm}%,posisi.ilike.%${searchTerm}%`);
        }

        return await query.order('bulan', { ascending: false });
      });

      if (error) {
        // If view doesn't exist, try the table (backward compatibility)
        if (error.code === '42P01' || error.code === 'PGRST205') {
           console.warn("View not found, trying table...");
           const { data: tableResult, error: tableError } = await supabase
              .from('biaya_output_pabrik_garut')
              .select('*')
              .order('bulan', { ascending: false });
           
           if (tableError) {
               console.error("Fetch Error:", tableError);
               // If both fail, likely schema issue
               if (tableError.code === '42P01') setShowSqlModal(true);
           } else {
               setData(tableResult || []);
           }
        } else {
           console.error("Fetch Error:", error);
        }
      } else {
        setData(result || []);
        
        // Extract Options
        if (result) {
            const months = [...new Set(result.map((d: any) => d.bulan).filter(Boolean))].sort();
            const companies = [...new Set(result.map((d: any) => d.perusahaan).filter(Boolean))].sort();
            if (optMonths.length === 0) setOptMonths(months);
            if (optCompanies.length === 0) setOptCompanies(companies);
        }
      }
    } catch (error: any) {
      console.error("Fetch Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterMonth, filterCompany, searchTerm]);

  // --- CALCULATE TOTALS ---
  const totals = useMemo(() => {
    const uniqueSalaries = new Set<string>();
    let sumQty = 0;
    let sumGaji = 0;

    data.forEach(curr => {
      // Qty is per SKU row, so we sum it all
      const qty = Number(curr.qty || 0);
      sumQty += qty;

      // Gaji is per Division (Bagian), so we must deduplicate
      const gaji = Number(curr.gaji || 0);
      
      // Key: Bulan + Perusahaan + Bagian
      const key = `${curr.bulan}|${curr.perusahaan}|${curr.bagian}`;
      
      if (!uniqueSalaries.has(key)) {
        uniqueSalaries.add(key);
        sumGaji += gaji;
      }
    });

    return { qty: sumQty, gaji: sumGaji };
  }, [data]);

  // --- PIVOT LOGIC ---
  const PIVOT_COLUMNS = [
    'Cutting', 'Persiapan',
    'Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5',
    'BB Line 1', 'BB Line 2', 'BB Line 3', 'BB Line 4', 'BB Line 5',
    'QC Line 1', 'QC Line 2', 'QC Line 3', 'QC Line 4', 'QC Line 5',
    'Iron+Kancing', 'Packing',
    'Gudang Reject', 'Gudang Barang Jadi', 'Inbound'
  ];

  const mapBagianToColumn = (bagian: string, posisi: string) => {
    const text = `${bagian} ${posisi || ''}`.toUpperCase();
    
    if (text.includes('BB LINE 1')) return 'BB Line 1';
    if (text.includes('BB LINE 2')) return 'BB Line 2';
    if (text.includes('QC LINE 1')) return 'QC Line 1';
    if (text.includes('LINE 1')) return 'Line 1';
    if (text.includes('CUTTING')) return 'Cutting';
    if (text.includes('PERSIAPAN')) return 'Persiapan';
    if (text.includes('STEAM') || text.includes('IRON') || text.includes('KANCING')) return 'Iron+Kancing';
    if (text.includes('PACKING')) return 'Packing';
    if (text.includes('REJECT')) return 'Gudang Reject';
    if (text.includes('JADI') || text.includes('FG')) return 'Gudang Barang Jadi';
    if (text.includes('INBOUND')) return 'Inbound';

    return null;
  };

  const pivotData = useMemo(() => {
    const groups: Record<string, any> = {};

    data.forEach(item => {
      const key = `${item.bulan}|${item.perusahaan}|${item.sku}`;
      
      if (!groups[key]) {
        groups[key] = {
          bulan: item.bulan,
          perusahaan: item.perusahaan,
          sku: item.sku,
          values: {}
        };
        PIVOT_COLUMNS.forEach(col => groups[key].values[col] = 0);
      }

      const colName = mapBagianToColumn(item.bagian || '', item.posisi || '');
      if (colName && groups[key].values[colName] !== undefined) {
        const val = item.hpp || 0;
        groups[key].values[colName] += Number(val);
      }
    });

    return Object.values(groups);
  }, [data]);

  const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  const handleExport = () => {
    if (data.length === 0) return;
    
    const exportData = data.map(item => ({
        'Bulan': item.bulan,
        'Perusahaan': item.perusahaan,
        'Bagian': item.bagian,
        'Posisi': item.posisi,
        'SKU': item.sku,
        'Total Output (Qty)': item.qty || 0,
        'Jumlah Orang': Math.round(item.jumlah_orang || 0),
        'Total Gaji Divisi': item.gaji || 0,
        'Jumlah Karyawan': Number(item.jumlah_karyawan || 0).toFixed(1), // Format decimal for export
        'HPP (Cost/Unit)': item.hpp || 0
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Biaya Output");
    XLSX.writeFile(wb, `Biaya_Output_${filterMonth || 'All'}.xlsx`);
  };

  const handleOpenDetail = (item: any) => {
    setSelectedDetail({
        bulan: item.bulan,
        perusahaan: item.perusahaan,
        bagian: item.bagian,
        sku: item.sku
    });
    setIsDetailOpen(true);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 items-end shrink-0">
        <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Bulan</label>
            <select 
                value={filterMonth} 
                onChange={(e) => setFilterMonth(e.target.value)} 
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink outline-none cursor-pointer bg-white"
            >
                <option value="">Semua Bulan</option>
                {optMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Perusahaan</label>
            <select 
                value={filterCompany} 
                onChange={(e) => setFilterCompany(e.target.value)} 
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink outline-none cursor-pointer bg-white"
            >
                <option value="">Semua Perusahaan</option>
                {optCompanies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Cari SKU / Bagian</label>
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
        </div>

        <div className="flex gap-2">
            <button 
                onClick={() => setShowSqlModal(true)} 
                className="px-4 py-2 bg-blue-50 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-100 flex items-center gap-2 text-sm font-medium transition-colors"
            >
                <Database size={16}/> Update View Logic
            </button>
            <button 
                onClick={fetchData} 
                className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm font-medium transition-colors"
            >
                <RefreshCw size={16}/> Refresh
            </button>
            <button 
                onClick={handleExport} 
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
            >
                <Download size={16}/> Export
            </button>
        </div>
      </div>

      {/* --- SUMMARY TOTALS --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm flex items-center justify-between">
           <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Total Output (Qty)</p>
              <h3 className="text-2xl font-bold text-blue-600">{totals.qty.toLocaleString()}</h3>
           </div>
           <div className="p-3 bg-blue-50 rounded-full text-blue-600">
              <Package size={24} />
           </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-green-100 shadow-sm flex items-center justify-between">
           <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Total Gaji Divisi (Nominal)</p>
              <h3 className="text-2xl font-bold text-green-600">{formatRupiah(totals.gaji)}</h3>
           </div>
           <div className="p-3 bg-green-50 rounded-full text-green-600">
              <Wallet size={24} />
           </div>
        </div>
      </div>

      {/* Warning Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3 shrink-0">
         <Info className="text-blue-600 shrink-0 mt-0.5" size={20}/>
         <div className="text-sm text-blue-800">
            <p className="font-bold">Informasi Perhitungan HPP (Realtime V3)</p>
            <p className="mt-1">
                Data ini <b>selalu sinkron</b> dengan Input Produksi dan Laporan Gaji.
                <br/>
                <i>Rumus HPP: (Total Gaji Divisi) ÷ (Total Output Divisi)</i> = Cost Per Unit
            </p>
         </div>
      </div>

      {/* --- PIVOT TABLE --- */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-gray-700 flex items-center gap-2">
                <Table size={16} className="text-erp-pink"/> Rincian HPP per Proses (Pivot)
            </h3>
        </div>
        <div className="overflow-auto custom-scrollbar relative max-h-[400px]">
            <table className="w-full text-xs text-left whitespace-nowrap border-collapse min-w-full">
                <thead className="bg-gray-100 text-gray-700 font-bold sticky top-0 z-40 shadow-sm">
                    <tr>
                        <th className="px-4 py-3 border-r border-gray-200 bg-gray-100 sticky left-0 z-50 w-[120px] min-w-[120px] max-w-[120px]">Bulan</th>
                        <th className="px-4 py-3 border-r border-gray-200 bg-gray-100 sticky left-[120px] z-50 w-[150px] min-w-[150px] max-w-[150px]">Perusahaan</th>
                        <th className="px-4 py-3 border-r border-gray-200 bg-gray-100 sticky left-[270px] z-50 w-[150px] min-w-[150px] max-w-[150px]">SKU</th>
                        {PIVOT_COLUMNS.map(col => (
                            <th key={col} className="px-4 py-3 border-r border-gray-200 bg-gray-100 text-center">{col}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {isLoading ? (
                        <tr><td colSpan={PIVOT_COLUMNS.length + 3} className="p-12 text-center"><Loader2 className="animate-spin inline text-erp-pink mr-2"/> Memuat pivot...</td></tr>
                    ) : pivotData.length > 0 ? (
                        pivotData.map((row: any, idx: number) => (
                            <tr key={idx} className="hover:bg-gray-50 transition-colors group">
                                <td className="px-4 py-2 border-r border-gray-100 sticky left-0 bg-white group-hover:bg-gray-50 z-30 w-[120px] min-w-[120px] max-w-[120px]">{row.bulan}</td>
                                <td className="px-4 py-2 border-r border-gray-100 sticky left-[120px] bg-white group-hover:bg-gray-50 z-30 w-[150px] min-w-[150px] max-w-[150px]">{row.perusahaan}</td>
                                <td className="px-4 py-2 border-r border-gray-100 font-mono text-gray-600 sticky left-[270px] bg-white group-hover:bg-gray-50 z-30 w-[150px] min-w-[150px] max-w-[150px]">{row.sku}</td>
                                {PIVOT_COLUMNS.map(col => (
                                    <td key={col} className="px-4 py-2 border-r border-gray-100 text-right text-gray-600">
                                        {row.values[col] > 0 ? formatRupiah(row.values[col]) : '-'}
                                    </td>
                                ))}
                            </tr>
                        ))
                    ) : (
                        <tr><td colSpan={PIVOT_COLUMNS.length + 3} className="p-8 text-center text-gray-400 italic">Tidak ada data untuk pivot.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>

      {/* Total Data Count Display */}
      <div className="flex justify-end px-1">
        <span className="text-sm font-medium text-gray-600 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm flex items-center gap-2">
          Total Data: <b className="text-gray-900">{isLoading ? '...' : data.length}</b>
        </span>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div 
            className="overflow-auto custom-scrollbar relative"
            style={{ height: '500px' }}
        >
          <table className="w-full text-xs text-left whitespace-nowrap border-collapse min-w-full">
            <thead className="bg-gray-100 text-gray-700 font-bold sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Bulan</th>
                <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Perusahaan</th>
                <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">Bagian / Divisi</th>
                <th className="px-4 py-3 border-r border-gray-200 bg-gray-100">SKU</th>
                <th className="px-4 py-3 border-r border-gray-200 bg-blue-50 text-blue-800 text-right">Total Output</th>
                <th className="px-4 py-3 border-r border-gray-200 bg-blue-50 text-blue-800 text-center">Avg Orang</th>
                <th className="px-4 py-3 border-r border-gray-200 bg-green-50 text-green-800 text-right">Total Gaji Divisi</th>
                <th className="px-4 py-3 border-r border-gray-200 bg-green-50 text-green-800 text-center">Jml Karyawan</th>
                <th className="px-4 py-3 border-r border-gray-200 bg-purple-50 text-purple-800 text-right font-bold">HPP (Cost/Unit)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={9} className="p-12 text-center"><Loader2 className="animate-spin inline text-erp-pink mr-2"/> Memuat data...</td></tr>
              ) : data.length > 0 ? (
                data.map((item, idx) => {
                  const qty = item.qty || 0;
                  const gaji = item.gaji || 0;
                  const hpp = item.hpp || 0;
                  const karyawan = item.jumlah_karyawan || 0;
                  const avgOrang = Math.round(item.jumlah_orang || 0);

                  return (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 border-r border-gray-100">{item.bulan}</td>
                      <td className="px-4 py-3 border-r border-gray-100">{item.perusahaan}</td>
                      <td className="px-4 py-3 border-r border-gray-100">
                          <div className="font-medium">{item.bagian}</div>
                          {item.posisi && <div className="text-[10px] text-gray-500">{item.posisi}</div>}
                      </td>
                      <td className="px-4 py-3 border-r border-gray-100 font-mono text-gray-600">{item.sku}</td>
                      <td className="px-4 py-3 border-r border-gray-100 text-right font-bold text-blue-700">
                        {Number(qty).toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-3 border-r border-gray-100 text-center text-blue-600">{avgOrang}</td>
                      
                      {/* TOTAL GAJI (CLICKABLE) */}
                      <td 
                        className="px-4 py-3 border-r border-gray-100 text-right font-bold text-green-700 cursor-pointer hover:bg-green-100 hover:underline transition-colors"
                        onClick={() => handleOpenDetail(item)}
                        title="Klik untuk melihat rincian karyawan"
                      >
                          {formatRupiah(gaji)}
                      </td>
                      
                      <td className="px-4 py-3 border-r border-gray-100 text-center text-green-600">
                        {Number(karyawan).toLocaleString('id-ID', { maximumFractionDigits: 1 })}
                      </td>
                      
                      {/* HPP ESTIMASI */}
                      <td className="px-4 py-3 border-r border-gray-100 text-right font-bold text-purple-700 bg-purple-50/30">
                          {formatRupiah(hpp)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="p-16 text-center text-gray-400 italic">
                    Tidak ada data output untuk filter ini.
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
                <Database size={20}/> Update Logic View Database
              </h3>
              <button onClick={() => setShowSqlModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 text-sm mb-4">
                Salin kode SQL di bawah ini dan jalankan di <b>Supabase SQL Editor</b> untuk memperbarui logika perhitungan HPP dan Gaji pada View.
              </p>
              
              <div className="relative">
                <textarea 
                  className="w-full h-64 p-4 text-xs font-mono bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
                  readOnly
                  value={sqlViewUpdate}
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

      {/* MODAL DETAIL GAJI */}
      <BiayaGajiDetailModal 
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        filters={selectedDetail || { bulan: '', perusahaan: '', bagian: '', sku: '' }}
      />

      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message} />
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message} />
    </div>
  );
};
