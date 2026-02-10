import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Edit2, Trash2, Loader2, RefreshCw, 
  Download, Filter, X, Calendar, 
  AlertCircle, Upload, FileSpreadsheet, Plus,
  ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { WholesaleBoronganListModal } from './WholesaleBoronganListModal';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';
import { ConfirmationModal } from '../../Warehouse/ConfirmationModal';
import * as XLSX from 'xlsx';

export const WholesaleBoronganList: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [totalData, setTotalData] = useState(0);

  // Selection
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // --- BATCH DELETE STATE ---
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState('');

  // Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  
  const [confirmModal, setConfirmModal] = useState<{ 
    isOpen: boolean; 
    onConfirm: () => void; 
    title?: string; 
    message?: string; 
    confirmLabel?: string; 
    isDangerous?: boolean;
    isLoading?: boolean;
  }>({ isOpen: false, onConfirm: () => {}, title: '', message: '' });
  
  const [statusMessage, setStatusMessage] = useState<{type: 'success'|'error'|'info', text: string} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- FETCH DATA ---
  const fetchData = async () => {
    setIsLoading(true);
    setSelectedIds([]); 
    
    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }
    
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('presensi_harian_borongan_pabrik_garut')
        .select('*', { count: 'exact' });

      if (searchTerm) {
        query = query.or(`kode.ilike.%${searchTerm}%,nama.ilike.%${searchTerm}%,keterangan.ilike.%${searchTerm}%`);
      }
      if (startDate) query = query.gte('tanggal', startDate);
      if (endDate) query = query.lte('tanggal', endDate);
      if (filterMonth) query = query.ilike('bulan', `%${filterMonth}%`);
      if (filterPeriod && filterPeriod !== 'Semua') query = query.eq('periode', filterPeriod);

      const { data: result, error, count } = await query
        .order('tanggal', { ascending: false })
        .order('nama', { ascending: true })
        .range(from, to);

      if (error) {
        throw error;
      } else {
        setData(result || []);
        setTotalData(count || 0);
      }
    } catch (error: any) {
      console.warn("Fetch error:", error.message);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [page, pageSize, searchTerm, startDate, endDate, filterMonth, filterPeriod]);
  useEffect(() => { setPage(1); }, [searchTerm, startDate, endDate, filterMonth, filterPeriod]);

  // --- SMART QUEUE PROCESSOR (ANTI-TIMEOUT FIX) ---
  const processSmartQueue = async <T,>(
    items: T[], 
    processFn: (batch: T[]) => Promise<void>, 
    onProgress: (processed: number, total: number) => void
  ) => {
    let currentIndex = 0;
    let batchSize = 20; // REDUCED INITIAL BATCH (Was 100)
    const total = items.length;
    const errors: string[] = [];
    const MAX_BATCH = 100; // REDUCED MAX BATCH (Was 1000)

    while (currentIndex < total) {
      if (batchSize < 1) batchSize = 1;
      const end = Math.min(currentIndex + batchSize, total);
      const batch = items.slice(currentIndex, end);
      
      try {
        await processFn(batch);
        currentIndex += batch.length;
        onProgress(currentIndex, total);
        
        // Success: Ramp up speed slowly
        if (batchSize < MAX_BATCH) {
          batchSize = Math.min(batchSize + 5, MAX_BATCH); // Slower ramp up
        }
        
        // Delay to let DB breathe
        await new Promise(r => setTimeout(r, 100)); 

      } catch (err: any) {
        console.error("Batch failed, retrying smaller chunk...", err);
        // Failure: Reduce batch size significantly
        if (batch.length <= 1) {
           // If single item fails, skip it and log error
           errors.push(`Item at index ${currentIndex}: ${err.message}`);
           currentIndex++; 
        } else {
           batchSize = Math.floor(batchSize / 2);
           if (batchSize < 1) batchSize = 1;
           await new Promise(r => setTimeout(r, 1000)); // Longer delay on error
        }
      }
    }
    return errors;
  };

  // --- BATCH DELETE EXECUTOR ---
  const executeBatchDelete = async (idsToDelete: number[]) => {
    setIsDeleting(true);
    setDeleteProgress('Menyiapkan penghapusan...');
    
    try {
      if (idsToDelete.length === 0) {
        alert("Tidak ada data yang dipilih untuk dihapus.");
        setIsDeleting(false);
        return;
      }

      // EXECUTE DELETE IN BATCHES
      const errors = await processSmartQueue(
        idsToDelete,
        async (batchIds) => {
          const { error } = await supabase.from('presensi_harian_borongan_pabrik_garut').delete().in('id', batchIds);
          if (error) throw error;
        },
        (processed, total) => {
          setDeleteProgress(`Menghapus... ${Math.round((processed/total)*100)}% (${processed}/${total})`);
        }
      );

      if (errors.length > 0) {
        setErrorModal({ isOpen: true, title: 'Selesai dengan Error', message: `${errors.length} data gagal dihapus.` });
      } else {
        setSuccessModal({ isOpen: true, title: 'Penghapusan Selesai', message: `Berhasil menghapus ${idsToDelete.length} data presensi.` });
      }
      
      fetchData();
      setSelectedIds([]);

    } catch (error: any) {
      setErrorModal({ isOpen: true, title: 'Terjadi Kesalahan', message: error.message });
    } finally {
      setIsDeleting(false);
      setDeleteProgress('');
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
    }
  };

  // --- HANDLERS ---
  const handleSave = async (formData: any) => {
    if (!isSupabaseConfigured()) return;
    setIsSaving(true);
    try {
      if (selectedItem) {
        const { error } = await supabase
          .from('presensi_harian_borongan_pabrik_garut')
          .update(formData)
          .eq('id', selectedItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('presensi_harian_borongan_pabrik_garut')
          .insert([formData]);
        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchData();
      setSuccessModal({ isOpen: true, title: 'Berhasil', message: 'Data presensi borongan disimpan.' });
    } catch (error: any) {
      console.error("Save Error:", error);
      if (error.code === '23505') {
         setErrorModal({ isOpen: true, title: 'Data Duplikat', message: `Gagal menyimpan: Data untuk Kode dan Tanggal tersebut sudah ada.` });
      } else {
         setErrorModal({ isOpen: true, title: 'Gagal Menyimpan', message: error.message });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    setConfirmModal({
        isOpen: true,
        title: 'Hapus Data',
        message: 'Yakin ingin menghapus data presensi ini?',
        confirmLabel: 'Hapus',
        isDangerous: true,
        isLoading: false,
        onConfirm: () => executeBatchDelete([id])
    });
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Massal',
      message: `Hapus ${selectedIds.length} data terpilih?\n\nProses ini akan dilakukan bertahap untuk mencegah timeout.`,
      confirmLabel: 'Mulai Hapus',
      isDangerous: true,
      isLoading: false,
      onConfirm: () => executeBatchDelete(selectedIds)
    });
  };

  const handleResetFilters = () => {
      setSearchTerm('');
      setStartDate('');
      setEndDate('');
      setFilterMonth('');
      setFilterPeriod('');
      setPage(1);
  };

  // --- EXPORT / IMPORT ---
  const handleExport = async () => {
    setIsLoading(true);
    try {
      let allData: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('presensi_harian_borongan_pabrik_garut')
          .select('*')
          .order('tanggal', { ascending: false });

        if (searchTerm) query = query.or(`kode.ilike.%${searchTerm}%,nama.ilike.%${searchTerm}%`);
        if (startDate) query = query.gte('tanggal', startDate);
        if (endDate) query = query.lte('tanggal', endDate);
        if (filterMonth) query = query.ilike('bulan', `%${filterMonth}%`);
        if (filterPeriod && filterPeriod !== 'Semua') query = query.eq('periode', filterPeriod);

        const { data: batch, error } = await query.range(from, from + step - 1);
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
        alert("Tidak ada data untuk diexport.");
        return;
      }

      const exportData = allData.map(item => ({
          'Tanggal': item.tanggal,
          'Kode': item.kode,
          'Nama': item.nama,
          'Grade': item.grade,
          'Bulan': item.bulan,
          'Periode': item.periode,
          'Perusahaan': item.perusahaan,
          'Kehadiran': item.kehadiran,
          'Keterangan': item.keterangan
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(wb, ws, "Presensi Borongan");
      XLSX.writeFile(wb, `Presensi_Borongan_Garut_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch (error: any) {
      setErrorModal({ isOpen: true, title: 'Gagal Export', message: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const template = [{ 'Tanggal': '2025-10-01', 'Kode': 'B001', 'Nama': 'Asep Borongan', 'Grade': 'A', 'Bulan': 'Desember 2025', 'Periode': 'Periode 1', 'Perusahaan': 'BORONGAN', 'Kehadiran': '1', 'Keterangan': 'Hadir' }];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(template);
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Presensi_Borongan.xlsx");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws) as any[];
        
        if (rawData.length === 0) {
           setErrorModal({ isOpen: true, title: 'File Kosong', message: 'File Excel tidak memiliki data.' });
           return;
        }

        setIsImporting(true);
        setImportProgress('Memproses Data...');

        const itemsToInsert = rawData.map(row => {
            let dateStr = row['Tanggal'];
            if (typeof dateStr === 'number') {
                dateStr = new Date(Math.round((dateStr - 25569) * 86400 * 1000)).toISOString().split('T')[0];
            } else if (!dateStr) {
                dateStr = new Date().toISOString().split('T')[0];
            }

            return {
                tanggal: dateStr,
                kode: (row['Kode'] || '').toString(),
                nama: (row['Nama'] || '').toString(),
                grade: (row['Grade'] || '').toString(),
                bulan: (row['Bulan'] || '').toString(),
                periode: (row['Periode'] || 'Periode 1').toString(),
                perusahaan: (row['Perusahaan'] || 'BORONGAN').toString(),
                kehadiran: (row['Kehadiran'] || '1').toString(),
                keterangan: (row['Keterangan'] || '').toString()
            };
        }).filter(i => i.kode);

        if (itemsToInsert.length === 0) {
            setErrorModal({ isOpen: true, title: 'Gagal Import', message: 'Tidak ada data valid (Kode wajib diisi).' });
            setIsImporting(false);
            return;
        }

        // BATCH INSERT (Using Smart Queue for Import too)
        const errors = await processSmartQueue(
            itemsToInsert,
            async (batch) => {
                const { error } = await supabase
                    .from('presensi_harian_borongan_pabrik_garut')
                    .upsert(batch, { onConflict: 'tanggal,kode' });
                if (error) throw error;
            },
            (processed, total) => {
                setImportProgress(`Mengimport... ${Math.round((processed/total)*100)}%`);
            }
        );

        if (errors.length > 0) {
             setErrorModal({ isOpen: true, title: 'Import Selesai dengan Error', message: `${errors.length} data gagal diimport.` });
        } else {
             setSuccessModal({ isOpen: true, title: 'Import Selesai', message: `Berhasil mengimport ${itemsToInsert.length} data.` });
        }
        
        fetchData();
      } catch (error: any) {
        setErrorModal({ isOpen: true, title: 'Gagal Import', message: error.message });
      } finally {
        setIsImporting(false);
        setImportProgress('');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedIds(data.map(item => item.id));
    else setSelectedIds([]);
  };

  const handleSelectOne = (id: number) => {
    if (selectedIds.includes(id)) setSelectedIds(prev => prev.filter(item => item !== id));
    else setSelectedIds(prev => [...prev, id]);
  };

  const isAllSelected = data.length > 0 && data.every(item => selectedIds.includes(item.id));

  const getKehadiranBadge = (val: string) => {
    const v = val.toString().toLowerCase();
    if (v === '1' || v === 'hadir' || v === 'h') return 'bg-green-100 text-green-700 border-green-200';
    if (v === '0.5' || v === 'setengah') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    if (['s', 'i', 'a', 'sakit', 'izin', 'alpha'].includes(v)) return 'bg-red-100 text-red-700 border-red-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  };

  return (
    <div className="space-y-6 h-full flex flex-col font-sans">
      <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".xlsx, .xls" />

      {/* --- TOP TOOLBAR --- */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 shrink-0">
        <div className="relative w-full xl:w-96 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-erp-pink transition-colors" size={20} />
          <input 
            type="text" 
            placeholder="Cari nama, kode, atau keterangan..." 
            value={searchTerm} 
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }} 
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-erp-pink/30 focus:border-erp-pink transition-all shadow-sm" 
          />
        </div>

        <div className="flex flex-wrap gap-2 w-full xl:w-auto items-center justify-end">
          
          {selectedIds.length > 0 && (
            <button 
              onClick={handleBulkDelete} 
              disabled={isDeleting}
              className="px-4 py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-red-100 transition-all animate-fadeIn disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="animate-spin" size={18}/> : <Trash2 size={18}/>} 
              Hapus ({selectedIds.length})
            </button>
          )}

          <button onClick={handleDownloadTemplate} className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-600 text-sm font-medium flex items-center gap-2 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
            <FileSpreadsheet size={18}/> Template
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isImporting}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-600 text-sm font-medium flex items-center gap-2 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed min-w-[120px] justify-center"
          >
            {isImporting ? <Loader2 className="animate-spin" size={18}/> : <Upload size={18}/>} 
            {isImporting ? importProgress : 'Import'}
          </button>

          <button onClick={handleExport} className="px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-medium flex items-center gap-2 shadow-sm shadow-green-200 transition-all">
            <Download size={18}/> Export
          </button>

          <button onClick={() => fetchData()} className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 shadow-sm transition-all" title="Refresh Data">
            <RefreshCw size={20}/>
          </button>

          <button onClick={() => { setSelectedItem(null); setIsModalOpen(true); }} className="bg-erp-pink text-white px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-pink-600 text-sm font-medium shadow-md shadow-pink-200 transition-all">
            <Plus size={20}/> Tambah
          </button>
        </div>
      </div>

      {/* --- FILTER SECTION --- */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
        <div className="col-span-1 md:col-span-12 flex items-center gap-2 text-sm font-bold text-erp-pink mb-1">
          <Filter size={18}/> Filter Data Lanjutan
        </div>
        
        <div className="col-span-1 md:col-span-4">
          <label className="block text-xs font-medium text-gray-500 mb-1.5 ml-1">Rentang Tanggal</label>
          <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl border border-gray-200">
            <div className="relative flex-1">
              <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
                className="w-full pl-9 pr-2 py-2 bg-transparent text-sm focus:outline-none text-gray-700"
                placeholder="Dari"
              />
            </div>
            <span className="text-gray-400">-</span>
            <div className="relative flex-1">
              <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)} 
                className="w-full pl-9 pr-2 py-2 bg-transparent text-sm focus:outline-none text-gray-700"
                placeholder="Sampai"
              />
            </div>
          </div>
        </div>

        <div className="col-span-1 md:col-span-3">
          <label className="block text-xs font-medium text-gray-500 mb-1.5 ml-1">Bulan</label>
          <input 
            type="text" 
            placeholder="Contoh: Oktober" 
            value={filterMonth} 
            onChange={(e) => setFilterMonth(e.target.value)} 
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-erp-pink/30 focus:border-erp-pink outline-none transition-all"
          />
        </div>

        <div className="col-span-1 md:col-span-3">
          <label className="block text-xs font-medium text-gray-500 mb-1.5 ml-1">Periode</label>
          <select 
            value={filterPeriod} 
            onChange={(e) => setFilterPeriod(e.target.value)} 
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-erp-pink/30 focus:border-erp-pink outline-none cursor-pointer"
          >
            <option value="">Semua Periode</option>
            <option value="Periode 1">Periode 1</option>
            <option value="Periode 2">Periode 2</option>
          </select>
        </div>

        <div className="col-span-1 md:col-span-2">
          <button 
            onClick={handleResetFilters} 
            className="w-full px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 hover:text-gray-800 flex items-center justify-center gap-2 transition-colors"
          >
            <X size={18} /> Reset Filter
          </button>
        </div>
      </div>

      {/* --- DATA TABLE --- */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
        <div className="overflow-auto max-h-[600px] custom-scrollbar relative">
          <table className="w-full text-sm text-left whitespace-nowrap relative border-collapse">
            <thead className="bg-gray-100 text-gray-600 font-bold sticky top-0 z-10 shadow-sm uppercase text-xs tracking-wider">
              <tr>
                <th className="px-4 py-3 w-10 text-center">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-gray-300 text-erp-pink focus:ring-erp-pink cursor-pointer"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="px-6 py-4">Tanggal</th>
                <th className="px-6 py-4">Kode</th>
                <th className="px-6 py-4">Nama Karyawan</th>
                <th className="px-6 py-4 text-center">Grade</th>
                <th className="px-6 py-4 text-center">Bulan</th>
                <th className="px-6 py-4 text-center">Periode</th>
                <th className="px-6 py-4 text-center">Perusahaan</th>
                <th className="px-6 py-4 text-center">Kehadiran</th>
                <th className="px-6 py-4">Keterangan</th>
                <th className="px-6 py-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={11} className="p-16 text-center"><Loader2 className="animate-spin inline text-erp-pink mr-2" size={32}/> Memuat data...</td></tr>
              ) : data.length > 0 ? (
                data.map((item, idx) => (
                  <tr key={item.id} className={`hover:bg-gray-50 transition-colors group ${selectedIds.includes(item.id) ? 'bg-pink-50/40' : ''}`}>
                    <td className="px-4 py-4 text-center">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-gray-300 text-erp-pink focus:ring-erp-pink cursor-pointer"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => handleSelectOne(item.id)}
                      />
                    </td>
                    <td className="px-6 py-4 text-gray-700 font-medium">{item.tanggal}</td>
                    <td className="px-6 py-4 font-mono text-gray-600 bg-gray-50/50 rounded px-2 w-fit">{item.kode}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{item.nama}</td>
                    <td className="px-6 py-4 text-center">
                        <span className={`min-w-[24px] px-1 py-0.5 rounded text-[10px] font-bold border flex items-center justify-center ${item.grade ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'}`}>
                          {item.grade || '-'}
                        </span>
                    </td>
                    <td className="px-6 py-4 text-center text-gray-600">{item.bulan}</td>
                    <td className="px-6 py-4 text-center text-gray-600">{item.periode}</td>
                    <td className="px-6 py-4 text-center text-gray-600">{item.perusahaan}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getKehadiranBadge(item.kehadiran)}`}>
                        {item.kehadiran}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-sm italic truncate max-w-[150px]">{item.keterangan}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setSelectedItem(item); setIsModalOpen(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-100 transition-all" title="Edit">
                          <Edit2 size={16}/>
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-all" title="Hapus">
                          <Trash2 size={16}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11} className="p-16 text-center text-gray-400 bg-gray-50/30">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <AlertCircle size={48} className="text-gray-200"/>
                      <p>Tidak ada data presensi borongan ditemukan.</p>
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
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
            </select>
            <span>dari <b>{totalData.toLocaleString()}</b> data</span>
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
              Halaman {page} / {Math.ceil(totalData / pageSize) || 1}
            </span>
            <button 
              onClick={() => setPage(prev => Math.min(prev + 1, Math.ceil(totalData / pageSize)))}
              disabled={page >= Math.ceil(totalData / pageSize) || isLoading}
              className="p-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-white shadow-sm"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <WholesaleBoronganListModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSave} initialData={selectedItem} isLoading={isSaving} />
      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message} />
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message} />
      
      {/* CONFIRMATION MODAL WITH LOADING */}
      <ConfirmationModal 
        isOpen={confirmModal.isOpen} 
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} 
        onConfirm={confirmModal.onConfirm} 
        title={confirmModal.title || "Hapus Data"} 
        message={confirmModal.message || "Yakin hapus?"} 
        confirmLabel={confirmModal.confirmLabel || "Hapus"} 
        isDangerous={confirmModal.isDangerous !== undefined ? confirmModal.isDangerous : true}
        isLoading={confirmModal.isLoading}
      />
    </div>
  );
};
