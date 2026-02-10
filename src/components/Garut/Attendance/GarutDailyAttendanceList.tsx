import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Edit2, Trash2, Loader2, RefreshCw, 
  ChevronLeft, ChevronRight, Download, AlertTriangle, 
  Upload, FileSpreadsheet, Filter, X, Calendar, 
  AlertCircle, Clock, Plus, Copy, Database, CheckCircle2
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { GarutDailyAttendanceModal } from './GarutDailyAttendanceModal';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';
import { ConfirmationModal } from '../../Warehouse/ConfirmationModal';
import * as XLSX from 'xlsx';

export const GarutDailyAttendanceList: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTableMissing, setIsTableMissing] = useState(false);
  
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
  
  // Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false); 

  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; onConfirm: () => void; title?: string; message?: string; confirmLabel?: string; isDangerous?: boolean; isLoading?: boolean }>({ isOpen: false, onConfirm: () => {}, title: '', message: '' });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- FETCH DATA ---
  const fetchData = async () => {
    setIsLoading(true);
    setIsTableMissing(false);
    setSelectedIds([]); 
    
    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }
    
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('presensi_harian_pabrik_garut')
        .select('*', { count: 'exact' });

      if (searchTerm) {
        query = query.or(`kode.ilike.%${searchTerm}%,keterangan.ilike.%${searchTerm}%`);
      }
      if (startDate) query = query.gte('tanggal', startDate);
      if (endDate) query = query.lte('tanggal', endDate);
      if (filterMonth) query = query.ilike('bulan', `%${filterMonth}%`);
      if (filterPeriod && filterPeriod !== 'Semua') query = query.eq('periode', filterPeriod);

      const { data: result, error, count } = await query
        .order('tanggal', { ascending: false })
        .range(from, to);

      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205' || error.message.includes('does not exist')) {
          setIsTableMissing(true);
        }
        setData([]);
        setTotalData(0);
      } else {
        setData(result || []);
        setTotalData(count || 0);
      }
    } catch (error: any) {
      console.warn("Fetch skipped:", error.message);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [page, pageSize, searchTerm, startDate, endDate, filterMonth, filterPeriod]);
  useEffect(() => { setPage(1); }, [searchTerm, startDate, endDate, filterMonth, filterPeriod]);

  // --- CRUD (STRICTLY NO UPSERT FOR SINGLE EDIT) ---
  const handleSave = async (formData: any) => {
    if (!formData) return;
    if (!isSupabaseConfigured()) {
        alert("Koneksi database belum dikonfigurasi.");
        return;
    }

    setIsSaving(true);
    
    try {
      const payload = {
          tanggal: formData.tanggal || new Date().toISOString().split('T')[0],
          kode: formData.kode || '',
          nama: formData.nama || '', 
          grade_p1: formData.grade_p1 || '',
          grade_p2: formData.grade_p2 || '',
          divisi: formData.divisi || '',
          bagian: formData.bagian || '',
          bulan: formData.bulan || '',
          periode: formData.periode || '',
          perusahaan: formData.perusahaan || '',
          kehadiran: formData.kehadiran || '',
          lembur: formData.lembur ? String(formData.lembur).replace(',', '.') : '0',
          keterangan: formData.keterangan || '',
          updated_at: new Date().toISOString()
      };

      if (selectedItem && selectedItem.id) {
        // --- MODE EDIT (UPDATE BY ID) ---
        const { error } = await supabase
            .from('presensi_harian_pabrik_garut')
            .update(payload)
            .eq('id', selectedItem.id);
        
        if (error) throw error; 
      } else {
        // --- MODE TAMBAH (INSERT) ---
        // 1. Cek Duplikat Manual
        const { data: existing } = await supabase
            .from('presensi_harian_pabrik_garut')
            .select('id')
            .eq('tanggal', payload.tanggal)
            .eq('kode', payload.kode)
            .maybeSingle();
        
        if (existing) {
            // Jika ada, update saja (Fallback)
             const { error: updateErr } = await supabase
                .from('presensi_harian_pabrik_garut')
                .update(payload)
                .eq('id', existing.id);
             if (updateErr) throw updateErr;
        } else {
            // Jika tidak ada, insert
            const { error: insertErr } = await supabase
                .from('presensi_harian_pabrik_garut')
                .insert([payload]);
            if (insertErr) throw insertErr;
        }
      }
      
      setIsModalOpen(false);
      await fetchData(); 
      setSuccessModal({ isOpen: true, title: 'Berhasil', message: 'Data presensi tersimpan.' });

    } catch (error: any) {
      console.error("Save Error:", error);
      
      let msg = error.message || 'Terjadi kesalahan sistem.';
      let title = 'Gagal Menyimpan';
      
      if (error.code === '42P01') {
          msg = 'Tabel database tidak ditemukan.';
      } else if (error.message?.includes('column')) {
          msg = 'Struktur tabel tidak sesuai.';
      } else if (error.code === '42P10' || error.message?.includes('constraint')) {
          title = 'Konflik Database (Trigger)';
          msg = 'Database menolak penyimpanan karena ada TRIGGER otomatis yang gagal.';
      }

      setErrorModal({ isOpen: true, title: title, message: msg });
    } finally {
        setIsSaving(false);
    }
  };

  // --- IMPORT HANDLER (OPTIMIZED BATCH UPSERT) ---
  const executeImportBatch = async (itemsToInsert: any[]) => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    setIsImporting(true);
    setImportProgress('0%');
    
    const BATCH_SIZE = 100; 
    const total = itemsToInsert.length;
    let processed = 0;
    
    try {
        for (let i = 0; i < total; i += BATCH_SIZE) {
            const chunk = itemsToInsert.slice(i, i + BATCH_SIZE);
            
            // MENGGUNAKAN UPSERT
            const { error } = await supabase
                .from('presensi_harian_pabrik_garut')
                .upsert(chunk, { onConflict: 'tanggal,kode' });

            if (error) {
                if (error.code === '42P10') {
                    throw new Error("Gagal Import: Constraint database belum terpasang.");
                }
                if (error.code === '57014' || error.message.includes('timeout')) {
                     throw new Error("Database Timeout: Terlalu banyak data diproses sekaligus. Silakan coba lagi dengan file yang lebih kecil atau hubungi developer untuk tuning.");
                }
                throw error;
            }
            
            processed += chunk.length;
            const percent = Math.round((processed / total) * 100);
            setImportProgress(`${percent}% (${processed}/${total})`);
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        setSuccessModal({ 
            isOpen: true, 
            title: 'Import Selesai', 
            message: `Berhasil mengimport ${processed} data presensi.` 
        });
        fetchData();
    } catch (err: any) {
        setErrorModal({ isOpen: true, title: 'Error Import', message: err.message });
    } finally {
        setIsImporting(false);
        setImportProgress('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- DELETE HANDLER (OPTIMIZED FOR TIMEOUT) ---
  const handleDelete = (id: number) => {
    setConfirmModal({
        isOpen: true,
        title: 'Hapus Data',
        message: 'Yakin ingin menghapus data presensi ini?',
        confirmLabel: 'Hapus',
        isDangerous: true,
        isLoading: false,
        onConfirm: async () => {
            setConfirmModal(prev => ({ ...prev, isLoading: true }));
            try {
                const { error: rpcError } = await supabase.rpc('delete_presensi_garut', { p_id: id });
                
                if (rpcError) {
                    if (rpcError.message.includes('function') || rpcError.code === '42883') {
                         const { error: stdError } = await supabase.from('presensi_harian_pabrik_garut').delete().eq('id', id);
                         if (stdError) throw stdError;
                    } else {
                        throw rpcError;
                    }
                }
                
                fetchData();
                setSuccessModal({ isOpen: true, title: 'Berhasil', message: 'Data berhasil dihapus.' });
            } catch (err: any) {
                if (err.code === '57014' || err.message?.includes('timeout')) {
                    setErrorModal({ 
                        isOpen: true, 
                        title: 'Timeout Database', 
                        message: 'Proses hapus terlalu lama karena data yang besar.' 
                    });
                } else {
                    setErrorModal({ isOpen: true, title: 'Gagal Hapus', message: err.message });
                }
            } finally {
                setConfirmModal(prev => ({ ...prev, isOpen: false, isLoading: false }));
            }
        }
    });
  };

  // --- BULK DELETE HANDLER (BATCHED) ---
  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Massal',
      message: `Hapus ${selectedIds.length} data terpilih?`,
      confirmLabel: 'Mulai Hapus',
      isDangerous: true,
      isLoading: false,
      onConfirm: async () => {
          setConfirmModal(prev => ({ ...prev, isLoading: true }));
          
          const BATCH_SIZE = 50; // Safe batch size
          const total = selectedIds.length;
          let processed = 0;
          let errorOccurred = false;

          try {
              for (let i = 0; i < total; i += BATCH_SIZE) {
                  const chunk = selectedIds.slice(i, i + BATCH_SIZE);
                  
                  const { error: rpcError } = await supabase.rpc('delete_presensi_garut_bulk', { p_ids: chunk });

                  if (rpcError) {
                      if (rpcError.message.includes('function') || rpcError.code === '42883') {
                          const { error: stdError } = await supabase.from('presensi_harian_pabrik_garut').delete().in('id', chunk);
                          if (stdError) throw stdError;
                      } else {
                          throw rpcError;
                      }
                  }
                  processed += chunk.length;
              }
              
              fetchData();
              setSelectedIds([]);
              setSuccessModal({ isOpen: true, title: 'Berhasil', message: `${processed} data berhasil dihapus.` });

          } catch (err: any) {
              errorOccurred = true;
              if (err.code === '57014' || err.message?.includes('timeout')) {
                  setErrorModal({ 
                      isOpen: true, 
                      title: 'Timeout Database', 
                      message: `Hapus parsial (${processed}/${total}). Sisanya gagal karena timeout.` 
                  });
              } else {
                  setErrorModal({ isOpen: true, title: 'Gagal Hapus', message: err.message });
              }
          } finally {
              setConfirmModal(prev => ({ ...prev, isOpen: false, isLoading: false }));
          }
      }
    });
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
                grade_p1: (row['Grade P1'] || '').toString(),
                grade_p2: (row['Grade P2'] || '').toString(),
                bulan: (row['Bulan'] || '').toString(),
                kehadiran: (row['Kehadiran'] || '').toString(),
                lembur: (row['Lembur'] || '').toString(),
                periode: (row['Periode'] || '').toString(),
                perusahaan: (row['Perusahaan'] || 'CV GARUT').toString(),
                keterangan: (row['Keterangan'] || '').toString()
            };
        }).filter(i => i.kode); 
        if (itemsToInsert.length === 0) {
            setErrorModal({ isOpen: true, title: 'Gagal', message: 'Tidak ada data valid (Kolom Kode wajib diisi).' });
            return;
        }
        setConfirmModal({
            isOpen: true,
            title: 'Mulai Import?',
            message: `Akan mengimport ${itemsToInsert.length} baris data.\n\nMetode: Batch Upsert (Aman & Stabil).`,
            confirmLabel: 'Mulai Import',
            isDangerous: false,
            onConfirm: () => executeImportBatch(itemsToInsert)
        });
      } catch (error: any) {
        setErrorModal({ isOpen: true, title: 'Gagal Import', message: error.message });
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = () => {
    const template = [{ 'Tanggal': '2025-10-01', 'Kode': 'G001', 'Grade P1': 'A', 'Grade P2': 'Senior', 'Bulan': 'Oktober 2025', 'Kehadiran': '1', 'Lembur': '2 jam', 'Periode': 'Periode 1', 'Perusahaan': 'CV GARUT', 'Keterangan': 'Hadir' }];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(template);
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Presensi_Garut.xlsx");
  };

  const handleExportAll = async () => {
    setIsLoading(true);
    try {
        let allData: any[] = [];
        let from = 0;
        const step = 500;
        let hasMore = true;
        while (hasMore) {
            let query = supabase.from('presensi_harian_pabrik_garut').select('*');
            if (searchTerm) query = query.or(`kode.ilike.%${searchTerm}%,keterangan.ilike.%${searchTerm}%`);
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
        if (!allData || allData.length === 0) { alert("Tidak ada data."); return; }
        const exportData = allData.map(item => ({
            'Tanggal': item.tanggal, 'Kode': item.kode, 'Grade P1': item.grade_p1, 'Grade P2': item.grade_p2,
            'Bulan': item.bulan, 'Kehadiran': item.kehadiran, 'Lembur': item.lembur, 'Periode': item.periode,
            'Perusahaan': item.perusahaan, 'Keterangan': item.keterangan
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(wb, ws, "Data Presensi Garut");
        XLSX.writeFile(wb, `Presensi_Garut_${startDate || 'All'}.xlsx`);
    } catch (error: any) { alert(`Gagal Export: ${error.message}`); } finally { setIsLoading(false); }
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

  const getKehadiranBadge = (val: any) => {
    if (!val) return 'bg-gray-100 text-gray-600 border-gray-200';
    
    const v = String(val).toLowerCase();
    if (v === '1' || v === 'hadir') return 'bg-green-100 text-green-700 border-green-200';
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
            placeholder="Cari kode karyawan atau keterangan..." 
            value={searchTerm} 
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }} 
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-erp-pink/30 focus:border-erp-pink transition-all shadow-sm" 
          />
        </div>

        <div className="flex flex-wrap gap-2 w-full xl:w-auto items-center justify-end">
          
          {selectedIds.length > 0 && (
            <button 
              onClick={handleBulkDelete} 
              className="px-4 py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-red-100 transition-all animate-fadeIn"
            >
              <Trash2 size={18}/> Hapus ({selectedIds.length})
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

          <button onClick={handleExportAll} className="px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-medium flex items-center gap-2 shadow-sm shadow-green-200 transition-all">
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
            onClick={() => { setSearchTerm(''); setStartDate(''); setEndDate(''); setFilterMonth(''); setFilterPeriod(''); setPage(1); }} 
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
                <th className="px-6 py-4 text-center">Grade</th>
                <th className="px-6 py-4 text-center">Bulan</th>
                <th className="px-6 py-4 text-center">Periode</th>
                <th className="px-6 py-4 text-center">Perusahaan</th>
                <th className="px-6 py-4 text-center">Kehadiran</th>
                <th className="px-6 py-4 text-center">Lembur</th>
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
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-1">
                        <span className={`min-w-[24px] px-1 py-0.5 rounded text-[10px] font-bold border flex items-center justify-center ${item.grade_p1 ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'}`}>
                          {item.grade_p1 || '-'}
                        </span>
                        <span className={`min-w-[24px] px-1 py-0.5 rounded text-[10px] font-bold border flex items-center justify-center ${item.grade_p2 ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'}`}>
                          {item.grade_p2 || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-gray-600">{item.bulan}</td>
                    <td className="px-6 py-4 text-center text-gray-600">{item.periode}</td>
                    <td className="px-6 py-4 text-center text-gray-600">{item.perusahaan}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getKehadiranBadge(item.kehadiran)}`}>
                        {item.kehadiran}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {item.lembur && item.lembur !== '0' && item.lembur !== '-' ? (
                        <span className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-1 rounded text-xs font-bold flex items-center justify-center gap-1">
                          <Clock size={12}/> {item.lembur}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
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
                      <p>Tidak ada data presensi ditemukan.</p>
                      <button onClick={() => setIsModalOpen(true)} className="text-erp-pink hover:underline text-sm font-medium">Tambah Data Baru</button>
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

      <GarutDailyAttendanceModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSave} initialData={selectedItem} isLoading={false} />
      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message} />
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message} />
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
