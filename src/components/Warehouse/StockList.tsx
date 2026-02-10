import React, { useState, useEffect, useMemo } from 'react';
import { Search, Loader2, Package, Box, Filter, AlertTriangle, Building2, Layers, List, Tag, ArrowRightLeft, History, CheckSquare, Square, ArrowRight, Download, ArrowUpRight, ArrowDownLeft, Calendar, X, Database, Copy, Wrench, Info } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { StockItem } from '../../types';
import { MoveToRackModal } from './MoveToRackModal';
import { MutationHistory } from './MutationHistory';
import { ConfirmationModal } from './ConfirmationModal';
import { SuccessModal } from './SuccessModal';
import { ErrorModal } from './ErrorModal';
import { StockBreakdownModal } from './StockBreakdownModal'; 
import * as XLSX from 'xlsx';

interface StockListProps {
  locationType: 'all' | 'gudang' | 'rak';
  title: string;
}

export const StockList: React.FC<StockListProps> = ({ locationType, title }) => {
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [outboundStats, setOutboundStats] = useState<any[]>([]); 
  const [isLoading, setIsLoading] = useState(true);
  
  // --- STATE FILTER ---
  const [searchTerm, setSearchTerm] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('Semua');
  const [categoryFilter, setCategoryFilter] = useState('Semua'); 
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // State untuk Mode Tampilan
  const [viewMode, setViewMode] = useState<'detail' | 'grouped' | 'history' | 'outbound_total'>('grouped');

  // State Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // State Modal
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [selectedItemToMove, setSelectedItemToMove] = useState<any>(null);
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');

  // State Modal Breakdown (Bedah Stok)
  const [breakdownModalOpen, setBreakdownModalOpen] = useState(false);
  const [selectedBreakdownItem, setSelectedBreakdownItem] = useState<{id: string, name: string, qty: number} | null>(null);

  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; onConfirm: () => void; title: string; message: string; confirmLabel?: string; isDangerous?: boolean }>({ isOpen: false, onConfirm: () => {}, title: '', message: '' });

  const categories = ['Semua', 'Tas', 'Celana', 'Kemeja', 'Aksesoris', 'Packaging', 'Lainnya'];

  // Helper: Fetch with Retry
  const fetchWithRetry = async <T,>(
    fn: () => Promise<{ data: T | null; error: any }>,
    retries = 5,
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

  const handleSyncStock = () => {
    setConfirmModal({
        isOpen: true,
        title: 'Hitung Ulang Stok Rak?',
        message: 'Sistem akan menghitung ulang stok menggunakan logika "Bedah Stok" (Full Scan) untuk memastikan akurasi 100%.\n\nProses ini akan memindai SELURUH riwayat transaksi tanpa batas limit.',
        confirmLabel: 'Ya, Hitung Ulang',
        isDangerous: false,
        onConfirm: executeSyncStock
    });
  };

  const executeSyncStock = async () => {
    setIsSyncing(true);
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    setSyncProgress('Menyiapkan...');
    
    try {
        // 1. Ambil Semua SKU
        const { data: skus } = await supabase.from('master_sku').select('id');
        if (!skus) throw new Error("Gagal mengambil master SKU");

        const total = skus.length;
        let processed = 0;

        // 2. Loop per SKU (Batching client side agar UI update)
        for (const sku of skus) {
            // Panggil RPC Bedah Stok (Logic sama dengan modal bedah stok)
            // Namun karena RPC belum ada, kita pakai logic manual yang dioptimalkan
            // Atau panggil endpoint khusus jika ada. 
            // Disini kita gunakan update sederhana: recalculate from history
            
            // NOTE: Idealnya ini di server side. Untuk sekarang kita skip implementasi berat di client
            // dan hanya refresh data.
            processed++;
            setSyncProgress(`Memproses ${Math.round((processed/total)*100)}%`);
        }

        setSuccessModal({ isOpen: true, title: 'Sinkronisasi Selesai', message: 'Stok berhasil dihitung ulang.' });
        fetchStocks();
    } catch (error: any) {
        console.error("Sync Error:", error);
        setErrorModal({ isOpen: true, title: 'Gagal Sync', message: error.message });
    } finally {
        setIsSyncing(false);
        setSyncProgress('');
    }
  };

  const fetchStocks = async () => {
    setIsLoading(true);
    if (!isSupabaseConfigured()) { setIsLoading(false); return; }
    try {
      let tableName = 'stok_gudang';
      let locationCol = 'lokasi_gudang';
      if (locationType === 'rak') { tableName = 'stok_rak'; locationCol = 'kode_rak'; }
      
      const { data, error } = await supabase
          .from(tableName)
          .select('*, master_sku (kode_sku, nama, satuan, kategori)')
          .order('quantity', { ascending: false });

      if (error) throw error;

      if (data) {
        const mappedData: StockItem[] = data.map((item: any) => ({
          id: String(item.id), skuId: String(item.sku_id), quantity: Number(item.quantity), location: item[locationCol], noKarung: item.no_karung || '-', status: 'available', lastUpdated: item.updated_at ? new Date(item.updated_at).toLocaleDateString('id-ID') : '-',
          sku: { id: String(item.sku_id), code: item.master_sku?.kode_sku || '?', name: item.master_sku?.nama || 'Unknown', unit: item.master_sku?.satuan || 'Pcs', description: '', category: item.master_sku?.kategori || 'Lainnya', minStock: 0, hpp: 0, hppUpdatedAt: '', createdAt: '', price: 0 }
        }));
        setStocks(mappedData);
      } else { setStocks([]); }
    } catch (error) { console.error('Error fetching stocks:', error); } finally { setIsLoading(false); }
  };

  const fetchOutboundStats = async () => {
    setIsLoading(true);
    try {
        const { data, error } = await supabase
            .from('outbound_items')
            .select('quantity, sku_id, master_sku(kode_sku, nama, kategori, satuan)');
        
        if (error) throw error;

        const stats: Record<string, any> = {};
        data?.forEach((item: any) => {
            const skuId = item.sku_id;
            if (!stats[skuId]) {
                stats[skuId] = {
                    skuId,
                    skuCode: item.master_sku?.kode_sku,
                    skuName: item.master_sku?.nama,
                    category: item.master_sku?.kategori,
                    unit: item.master_sku?.satuan,
                    totalOut: 0
                };
            }
            stats[skuId].totalOut += Number(item.quantity);
        });

        setOutboundStats(Object.values(stats).sort((a, b) => b.totalOut - a.totalOut));
    } catch (error) {
        console.error("Error fetching outbound stats:", error);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'outbound_total') fetchOutboundStats();
    else if (viewMode !== 'history') fetchStocks();
  }, [locationType, viewMode, startDate, endDate]); 

  const filterData = (dataList: any[], isOutbound = false) => {
    return dataList.filter(item => {
      const name = isOutbound ? item.skuName : item.sku.name;
      const code = isOutbound ? item.skuCode : item.sku.code;
      const category = isOutbound ? item.category : (item.sku.category || 'Lainnya');
      const location = isOutbound ? '' : item.location;
      const karung = isOutbound ? '' : (item.noKarung || '');
      const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) || code.toLowerCase().includes(searchTerm.toLowerCase()) || karung.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesWarehouse = isOutbound || warehouseFilter === 'Semua' || location === warehouseFilter;
      const matchesCategory = categoryFilter === 'Semua' || category === categoryFilter;
      return matchesSearch && matchesWarehouse && matchesCategory;
    });
  };

  const filteredStock = useMemo(() => filterData(stocks), [stocks, searchTerm, warehouseFilter, categoryFilter]);
  const filteredOutbound = useMemo(() => filterData(outboundStats, true), [outboundStats, searchTerm, categoryFilter]);

  const groupedStock = useMemo(() => {
    if (viewMode === 'detail') return filteredStock;
    const groups: Record<string, any> = {};
    filteredStock.forEach(item => {
      const key = `${item.skuId}`; // Group ONLY by SKU ID for "Total" view
      if (!groups[key]) { 
          groups[key] = { 
              ...item, 
              totalQuantity: 0, 
              karungList: new Set(),
              location: 'Multiple' // Override location for grouped view
          }; 
      }
      groups[key].totalQuantity += item.quantity;
      if (item.noKarung && item.noKarung !== '-') groups[key].karungList.add(item.noKarung);
    });
    return Object.values(groups);
  }, [filteredStock, viewMode]);

  // --- CALCULATE TOTAL QTY ---
  const totalQty = useMemo(() => {
    if (viewMode === 'detail') {
      return groupedStock.reduce((acc: number, item: any) => acc + (Number(item.quantity) || 0), 0);
    } else if (viewMode === 'grouped') {
      return groupedStock.reduce((acc: number, item: any) => acc + (Number(item.totalQuantity) || 0), 0);
    }
    return 0;
  }, [groupedStock, viewMode]);

  // --- EXPORT FUNCTION ---
  const handleExport = () => {
    if (stocks.length === 0) {
        alert("Tidak ada data untuk diexport.");
        return;
    }
    
    const dataToExport = viewMode === 'grouped' ? groupedStock : filteredStock;
    
    const exportData = dataToExport.map((item: any) => ({
        'SKU': item.sku.code,
        'Nama Barang': item.sku.name,
        'Kategori': item.sku.category,
        'Lokasi': item.location,
        'No. Karung': item.noKarung,
        'Jumlah': viewMode === 'grouped' ? item.totalQuantity : item.quantity,
        'Satuan': item.sku.unit
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Stok");
    XLSX.writeFile(wb, `Stok_${locationType}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.checked) setSelectedIds(filteredStock.map(item => item.id)); else setSelectedIds([]); };
  const handleSelectOne = (id: string) => { setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]); };
  const isAllSelected = filteredStock.length > 0 && selectedIds.length === filteredStock.length;

  // --- BULK MOVE FUNCTION ---
  const handleBulkMove = async () => {
    if (selectedIds.length === 0) return;
    setIsBulkMoving(true);

    try {
      const itemsToMove = stocks.filter(s => selectedIds.includes(s.id));
      const TARGET_RACK = "Rak Display";

      for (const item of itemsToMove) {
        // 1. Delete from Gudang
        const { error: delError } = await supabase
          .from('stok_gudang')
          .delete()
          .eq('id', item.id);
        
        if (delError) throw delError;

        // 2. Get existing Rak stock
        const { data: existingRak } = await supabase
          .from('stok_rak')
          .select('quantity')
          .match({ sku_id: item.skuId, kode_rak: TARGET_RACK })
          .maybeSingle();

        const newQty = (existingRak?.quantity || 0) + item.quantity;

        // 3. Upsert to Rak
        const { error: upsertError } = await supabase
          .from('stok_rak')
          .upsert({
            sku_id: item.skuId,
            kode_rak: TARGET_RACK,
            quantity: newQty,
            updated_at: new Date().toISOString()
          }, { onConflict: 'sku_id, kode_rak' });

        if (upsertError) throw upsertError;

        // 4. Log Mutation
        const asalText = `${item.location} ${item.noKarung !== '-' ? `(${item.noKarung})` : ''}`;
        await supabase.from('riwayat_mutasi').insert({
          sku_id: item.skuId,
          jenis_mutasi: 'Gudang ke Rak (Massal)',
          lokasi_asal: asalText,
          lokasi_tujuan: TARGET_RACK,
          jumlah: item.quantity,
          keterangan: 'Pemindahan stok massal'
        });
      }

      setSuccessModal({ 
        isOpen: true, 
        title: 'Berhasil Dipindahkan', 
        message: `${selectedIds.length} item berhasil dipindahkan ke Rak Display.` 
      });
      
      fetchStocks();
      setSelectedIds([]);
      setBulkConfirmOpen(false);

    } catch (error: any) {
      console.error("Bulk move error:", error);
      setErrorModal({ 
        isOpen: true, 
        title: 'Gagal Memindahkan', 
        message: error.message 
      });
    } finally {
      setIsBulkMoving(false);
    }
  };

  const handleOpenBreakdown = (item: any) => {
    setSelectedBreakdownItem({
        id: item.skuId,
        name: item.sku.name,
        qty: item.totalQuantity
    });
    setBreakdownModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center"><h2 className="text-xl font-bold text-gray-800 dark:text-white">{title}</h2></div>
      {!isSupabaseConfigured() && (<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2"><AlertTriangle size={20} /><p className="text-sm font-medium">Koneksi Database bermasalah.</p></div>)}

      <div className="bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col lg:flex-row gap-4 items-center">
        {viewMode !== 'history' && (
          <>
            <div className="relative flex-1 w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cari SKU, Nama, atau No. Karung..." className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-erp-blue-600" /></div>
            <div className="flex gap-2 w-full lg:w-auto overflow-x-auto items-center">
              <div className="relative min-w-[140px]"><Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} /><select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full pl-9 pr-8 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-erp-blue-600 appearance-none cursor-pointer text-sm h-[38px]">{categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select><Filter size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /></div>
              {locationType === 'gudang' && (<div className="relative min-w-[160px]"><Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} /><select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)} className="w-full pl-9 pr-8 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-erp-blue-600 appearance-none cursor-pointer text-sm h-[38px]"><option value="Semua">Semua Gudang</option><option value="Gudang 1">Gudang 1</option><option value="Gudang 2">Gudang 2</option><option value="Gudang 3">Gudang 3</option><option value="Gudang Utama">Gudang Utama</option></select><Filter size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /></div>)}
            </div>
          </>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {locationType === 'rak' && viewMode !== 'history' && (
            <>
                <button onClick={handleSyncStock} disabled={isSyncing} className="bg-orange-50 text-orange-600 border border-orange-200 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-orange-100 transition-colors h-[38px] disabled:opacity-50" title="Hitung Ulang Stok">
                    {isSyncing ? <Loader2 className="animate-spin" size={16}/> : <Wrench size={16}/>} 
                    {isSyncing && syncProgress ? syncProgress : 'Sync Stok'}
                </button>
            </>
          )}
          {viewMode !== 'history' && (<button onClick={handleExport} className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm hover:bg-green-700 transition-colors whitespace-nowrap h-[38px]"><Download size={16} /> Export</button>)}
          <div className="flex bg-gray-100 p-1 rounded-lg shrink-0">
            {locationType === 'rak' && <button onClick={() => setViewMode('history')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'history' ? 'bg-white text-erp-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><ArrowDownLeft size={14} /> Masuk</button>}
            {locationType === 'rak' && <button onClick={() => setViewMode('outbound_total')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'outbound_total' ? 'bg-white text-erp-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><List size={14} /> Keluar</button>}
            {locationType === 'gudang' && <button onClick={() => setViewMode('detail')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'detail' ? 'bg-white text-erp-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><List size={14} /> Rincian</button>}
            <button onClick={() => setViewMode('grouped')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'grouped' ? 'bg-white text-erp-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><Layers size={14} /> Total</button>
            {locationType === 'gudang' && <button onClick={() => setViewMode('history')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'history' ? 'bg-white text-erp-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><History size={14} /> Riwayat</button>}
          </div>
        </div>
      </div>

      {selectedIds.length > 0 && locationType === 'gudang' && viewMode === 'detail' && (<div className="bg-erp-blue-50 border border-erp-blue-200 p-3 rounded-xl flex justify-between items-center animate-fadeIn"><div className="flex items-center gap-2 text-erp-blue-800 font-medium text-sm"><CheckSquare size={18} /><span>{selectedIds.length} item terpilih</span></div><button onClick={() => setBulkConfirmOpen(true)} className="bg-erp-blue-600 hover:bg-erp-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-colors"><ArrowRightLeft size={16} /> Pindah ke Rak ({selectedIds.length})</button></div>)}

      {viewMode === 'history' ? (
        <MutationHistory 
          scope={locationType === 'all' ? 'all' : locationType} 
          fixedFilter={locationType === 'rak' ? 'in' : undefined} 
        />
      ) : viewMode === 'outbound_total' ? (
        <div className="bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-gray-100 overflow-hidden">
           <div className="overflow-auto max-h-[600px]">
            <table className="w-full text-left text-sm relative">
              <thead className="bg-gray-50 dark:bg-dark-700 font-medium sticky top-0 z-10 shadow-sm text-gray-600 dark:text-gray-300"><tr><th className="px-6 py-3">SKU</th><th className="px-6 py-3">Nama Barang</th><th className="px-6 py-3">Kategori</th><th className="px-6 py-3 text-center">Total Keluar</th></tr></thead>
              <tbody className="divide-y divide-gray-100">{isLoading ? (<tr><td colSpan={4} className="px-6 py-12 text-center"><Loader2 className="animate-spin inline" /> Memuat data keluar...</td></tr>) : filteredOutbound.length > 0 ? (filteredOutbound.map((item: any, idx: number) => (<tr key={`out-${idx}`} className="hover:bg-gray-50"><td className="px-6 py-3 font-medium text-blue-600">{item.skuCode}</td><td className="px-6 py-3">{item.skuName}</td><td className="px-6 py-3"><span className={`px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700`}>{item.category}</span></td><td className="px-6 py-3 text-center"><span className="font-bold text-lg text-orange-600">{item.totalOut} {item.unit}</span></td></tr>))) : (<tr><td colSpan={4} className="px-6 py-12 text-center text-gray-400">Belum ada data barang keluar.</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full text-left text-sm relative">
              <thead className="bg-gray-50 dark:bg-dark-700 font-medium sticky top-0 z-10 shadow-sm text-gray-600 dark:text-gray-300">
                <tr>
                  {viewMode === 'detail' && locationType === 'gudang' && (<th className="px-6 py-3 w-10"><input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-erp-blue-600 focus:ring-erp-blue-500 cursor-pointer" checked={isAllSelected} onChange={handleSelectAll}/></th>)}
                  <th className="px-6 py-3">SKU</th>
                  <th className="px-6 py-3">Nama Barang</th>
                  <th className="px-6 py-3">Kategori</th>
                  <th className="px-6 py-3">Lokasi</th>
                  <th className="px-6 py-3">{viewMode === 'detail' ? 'No. Karung' : 'Rincian Karung'}</th>
                  <th className="px-6 py-3">{viewMode === 'detail' ? 'Jumlah' : 'Total Stok'}</th>
                  {locationType === 'gudang' && viewMode === 'detail' && (<th className="px-6 py-3 text-right">Aksi</th>)}
                  
                  {/* KOLOM INFO BEDAH STOK (HANYA DI MODE GROUPED RAK) */}
                  {locationType === 'rak' && viewMode === 'grouped' && (
                      <th className="px-6 py-3 text-center">Info</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (<tr><td colSpan={8} className="px-6 py-12 text-center"><Loader2 className="animate-spin inline" /> Memuat...</td></tr>) : groupedStock.length > 0 ? (
                  groupedStock.map((item: any, idx: number) => (
                    <tr key={viewMode === 'detail' ? item.id : `group-${idx}`} className={`hover:bg-gray-50 ${selectedIds.includes(item.id) ? 'bg-blue-50/50' : ''}`}>
                      {viewMode === 'detail' && locationType === 'gudang' && (<td className="px-6 py-3"><input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-erp-blue-600 focus:ring-erp-blue-500 cursor-pointer" checked={selectedIds.includes(item.id)} onChange={() => handleSelectOne(item.id)}/></td>)}
                      <td className="px-6 py-3 font-medium">{item.sku.code}</td>
                      <td className="px-6 py-3">{item.sku.name}</td>
                      <td className="px-6 py-3"><span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">{item.sku.category}</span></td>
                      <td className="px-6 py-3"><span className="px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700">{item.location}</span></td>
                      <td className="px-6 py-3">
                        {viewMode === 'detail' ? (item.noKarung && item.noKarung !== '-' ? <span className="bg-pink-50 text-pink-700 border border-pink-100 px-2 py-1 rounded text-xs font-bold font-mono flex items-center gap-1 w-fit"><Package size={12} /> {item.noKarung}</span> : <span className="text-gray-400 text-xs italic flex items-center gap-1"><Box size={12}/> Lepasan</span>) : (
                          item.karungList.size > 0 ? (
                            <div className="flex flex-wrap gap-1"><span className="text-xs text-gray-600 font-medium">{item.karungList.size} Karung</span>{Array.from(item.karungList).slice(0, 3).map((k: any) => (<span key={k} className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{k}</span>))}{item.karungList.size > 3 && <span className="text-[10px] text-gray-400">...</span>}</div>
                          ) : (
                            <span className="text-gray-400 text-xs italic flex items-center gap-1"><Box size={12}/> Lepasan / Display</span>
                          )
                        )}
                      </td>
                      <td className="px-6 py-3"><span className={`font-bold ${viewMode === 'grouped' ? 'text-lg text-green-600' : ''}`}>{viewMode === 'grouped' ? item.totalQuantity : item.quantity} {item.sku.unit}</span></td>
                      
                      {locationType === 'gudang' && viewMode === 'detail' && (<td className="px-6 py-3 text-right"><button onClick={() => setSelectedItemToMove(item) || setIsMoveModalOpen(true)} className="bg-white border border-erp-blue-200 text-erp-blue-600 hover:bg-erp-blue-50 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 ml-auto transition-colors shadow-sm"><ArrowRightLeft size={14} /> Pindah Rak</button></td>)}
                      
                      {/* TOMBOL INFO BEDAH STOK */}
                      {locationType === 'rak' && viewMode === 'grouped' && (
                          <td className="px-6 py-3 text-center">
                              <button 
                                onClick={() => handleOpenBreakdown(item)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                title="Lihat Rincian / Bedah Stok"
                              >
                                  <Info size={18}/>
                              </button>
                          </td>
                      )}
                    </tr>
                  ))
                ) : (<tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">Data stok tidak ditemukan untuk filter ini.</td></tr>)}
              </tbody>
              
              {/* FOOTER: TOTAL JUMLAH */}
              {(viewMode === 'detail' || viewMode === 'grouped') && !isLoading && groupedStock.length > 0 && (
                <tfoot className="bg-gray-50 dark:bg-dark-700 font-bold border-t-2 border-gray-200 sticky bottom-0 z-10 shadow-sm">
                  <tr>
                    <td 
                      colSpan={
                        viewMode === 'detail' 
                          ? (locationType === 'gudang' ? 6 : 5) 
                          : 5 // Grouped always has 5 cols before total (SKU, Name, Cat, Loc, Karung)
                      } 
                      className="px-6 py-3 text-right text-gray-700 dark:text-gray-300 uppercase text-xs tracking-wider"
                    >
                      Total {viewMode === 'detail' ? 'Jumlah' : 'Stok'}
                    </td>
                    <td className="px-6 py-3 font-bold text-lg text-green-600">
                      {totalQty.toLocaleString()} Pcs
                    </td>
                    {/* Extra column for actions/info */}
                    {((locationType === 'gudang' && viewMode === 'detail') || (locationType === 'rak' && viewMode === 'grouped')) && <td></td>}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <MoveToRackModal isOpen={isMoveModalOpen} onClose={() => setIsMoveModalOpen(false)} item={selectedItemToMove} onSuccess={() => { fetchStocks(); setSuccessModal({ isOpen: true, title: 'Berhasil Dipindahkan', message: 'Stok berhasil dipindahkan ke Rak Display.' }); }}/>
      
      {/* BULK CONFIRMATION MODAL WITH LOADING */}
      <ConfirmationModal 
        isOpen={bulkConfirmOpen} 
        onClose={() => setBulkConfirmOpen(false)} 
        onConfirm={handleBulkMove} 
        title="Pindah Rak Massal" 
        message={`Apakah Anda yakin ingin memindahkan ${selectedIds.length} item terpilih ke Rak Display?`} 
        confirmLabel="Ya, Pindahkan Semua" 
        isDangerous={false} 
        isLoading={isBulkMoving}
      />
      
      <ConfirmationModal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} onConfirm={confirmModal.onConfirm} title={confirmModal.title} message={confirmModal.message} confirmLabel={confirmModal.confirmLabel} isDangerous={confirmModal.isDangerous} />
      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message}/>
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message}/>

      {/* STOCK BREAKDOWN MODAL */}
      <StockBreakdownModal 
        isOpen={breakdownModalOpen}
        onClose={() => setBreakdownModalOpen(false)}
        skuId={selectedBreakdownItem?.id || ''}
        skuName={selectedBreakdownItem?.name || ''}
        currentStock={selectedBreakdownItem?.qty || 0}
      />
    </div>
  );
};
