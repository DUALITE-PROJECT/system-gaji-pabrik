import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, Edit2, Trash2, Loader2, RefreshCw, 
  ChevronLeft, ChevronRight, Download, AlertTriangle, 
  Upload, FileSpreadsheet, Filter, X, Calendar, 
  Database, Copy, Clock, AlertCircle 
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { DailyAttendanceModal } from './DailyAttendanceModal';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';
import { ConfirmationModal } from '../../Warehouse/ConfirmationModal';
import * as XLSX from 'xlsx';

export const DailyAttendance: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTableMissing, setIsTableMissing] = useState(false);
  
  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [totalData, setTotalData] = useState(0);

  // Selection
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  
  // Batch Process
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; onConfirm: () => void; title?: string; message?: string; confirmLabel?: string; isDangerous?: boolean }>({ isOpen: false, onConfirm: () => {}, title: '', message: '' });

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
        .from('presensi_harian_pabrik')
        .select('*', { count: 'exact' });

      if (searchTerm) {
        query = query.or(`kode.ilike.%${searchTerm}%,keterangan.ilike.%${searchTerm}%`);
      }
      if (startDate) query = query.gte('tanggal', startDate);
      if (endDate) query = query.lte('tanggal', endDate);
      if (filterMonth) query = query.ilike('bulan', `%${filterMonth}%`);
      if (filterPeriod && filterPeriod !== 'Semua') query = query.eq('periode', filterPeriod);
      if (filterCompany && filterCompany !== 'Semua') query = query.ilike('perusahaan', `%${filterCompany}%`);

      const { data: result, error, count } = await query
        .order('tanggal', { ascending: false })
        .range(from, to);

      if (error) {
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          setIsTableMissing(true);
        }
        setData([]);
        setTotalData(0);
      } else {
        setData(result || []);
        setTotalData(count || 0);
      }
    } catch (error: any) {
      console.warn("Fetch skipped safely:", error.message);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [page, pageSize, searchTerm, startDate, endDate, filterMonth, filterPeriod, filterCompany]);
  useEffect(() => { setPage(1); }, [searchTerm, startDate, endDate, filterMonth, filterPeriod, filterCompany]);

  // --- FIXED ADAPTIVE SMART QUEUE (ANTI INFINITE LOOP) ---
  const processSmartQueue = async <T,>(
    items: T[], 
    processFn: (batch: T[]) => Promise<void>, 
    onProgress: (processed: number, total: number, speed: number) => void
  ) => {
    let currentIndex = 0;
    let batchSize = 100; 
    const total = items.length;
    const errors: string[] = [];
    const MAX_BATCH = 1000; 
    let safetyLoop = 0; // SAFETY GUARD

    while (currentIndex < total) {
      safetyLoop++;
      if (safetyLoop > 10000) { // Circuit Breaker
          console.error("Infinite loop detected in batch processing. Aborting.");
          errors.push("Proses dihentikan paksa (Safety Limit).");
          break;
      }

      if (batchSize < 1) batchSize = 1;
      
      const end = Math.min(currentIndex + batchSize, total);
      const batch = items.slice(currentIndex, end);
      
      try {
        await processFn(batch);
        
        currentIndex += batch.length;
        onProgress(currentIndex, total, batchSize);
        
        // Success: Ramp up speed
        if (batchSize < MAX_BATCH) {
          batchSize = Math.min(batchSize * 2, MAX_BATCH);
        }
        
        // Small delay to prevent browser freeze
        await new Promise(r => setTimeout(r, 50)); 

      } catch (err: any) {
        // Failure handling
        if (batch.length <= 1) {
           // Single item failed, skip it
           console.error("Item failed:", batch[0], err);
           errors.push(`Row ${currentIndex + 1}: ${err.message}`);
           currentIndex++; 
        } else {
           // Reduce batch size to isolate problem
           batchSize = Math.floor(batchSize / 2);
           await new Promise(r => setTimeout(r, 500));
        }
      }
    }
    return errors;
  };

  // --- BATCH DELETE ---
  const executeBatchDelete = async (idsToDelete: number[] | 'ALL') => {
    setIsDeleting(true);
    setDeleteProgress('Menyiapkan penghapusan...');
    
    try {
      let targetIds: number[] = [];

      if (idsToDelete === 'ALL') {
        let hasMore = true;
        let pageFetch = 0;
        const FETCH_SIZE = 1000; 
        
        while (hasMore) {
          let query = supabase.from('presensi_harian_pabrik').select('id').range(pageFetch * FETCH_SIZE, (pageFetch + 1) * FETCH_SIZE - 1);
          
          if (searchTerm) query = query.or(`kode.ilike.%${searchTerm}%,keterangan.ilike.%${searchTerm}%`);
          if (startDate) query = query.gte('tanggal', startDate);
          if (endDate) query = query.lte('tanggal', endDate);
          if (filterMonth) query = query.ilike('bulan', `%${filterMonth}%`);
          if (filterPeriod && filterPeriod !== 'Semua') query = query.eq('periode', filterPeriod);
          if (filterCompany && filterCompany !== 'Semua') query = query.ilike('perusahaan', `%${filterCompany}%`);
            
          const { data: ids, error } = await query;
          if (error) throw error;
          
          if (ids && ids.length > 0) {
            targetIds = [...targetIds, ...ids.map(i => i.id)];
            setDeleteProgress(`Mengumpulkan ID... (${targetIds.length})`);
            pageFetch++;
            if (ids.length < FETCH_SIZE) hasMore = false;
          } else {
            hasMore = false;
          }
        }
      } else {
        targetIds = idsToDelete;
      }

      if (targetIds.length === 0) {
        alert("Tidak ada data yang sesuai filter untuk dihapus.");
        setIsDeleting(false);
        return;
      }

      const errors = await processSmartQueue(
        targetIds,
        async (batchIds) => {
          const { error } = await supabase.from('presensi_harian_pabrik').delete().in('id', batchIds);
          if (error) throw error;
        },
        (processed, total, speed) => {
          setDeleteProgress(`Menghapus... ${Math.round((processed/total)*100)}% (${processed}/${total})`);
        }
      );

      if (errors.length > 0) {
        setErrorModal({ isOpen: true, title: 'Selesai dengan Error', message: `${errors.length} data gagal dihapus.` });
      } else {
        setSuccessModal({ isOpen: true, title: 'Penghapusan Selesai', message: `Berhasil menghapus ${targetIds.length} data presensi.` });
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

  // --- HELPER: ROBUST DATE PARSER ---
  const parseExcelDate = (input: any): string => {
    if (!input) return new Date().toISOString().split('T')[0];

    // 1. Handle Excel Serial Number
    if (typeof input === 'number') {
      const date = new Date(Math.round((input - 25569) * 86400 * 1000));
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // 2. Handle String
    if (typeof input === 'string') {
      let str = input.trim();
      
      // A. Format DD/MM/YYYY atau DD-MM-YYYY
      const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dmyMatch) {
        const day = dmyMatch[1].padStart(2, '0');
        const month = dmyMatch[2].padStart(2, '0');
        const year = dmyMatch[3];
        return `${year}-${month}-${day}`;
      }

      // B. Format YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

      // C. Format Nama Bulan Indonesia (31 Oktober 2025)
      const indoMonths = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
      const engMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      
      let normalizedStr = str.toLowerCase();
      indoMonths.forEach((indo, idx) => {
        if (normalizedStr.includes(indo)) {
          normalizedStr = normalizedStr.replace(indo, engMonths[idx]);
        }
      });

      const d = new Date(normalizedStr);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }

    // Fallback
    return new Date().toISOString().split('T')[0];
  };

  // --- IMPORT ---
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        
        if (rawData.length === 0) {
           setErrorModal({ isOpen: true, title: 'File Kosong', message: 'File Excel tidak memiliki data.' });
           if (fileInputRef.current) fileInputRef.current.value = '';
           return;
        }

        // Header Detection
        let headerRowIndex = -1;
        let headers: string[] = [];
        for (let i = 0; i < Math.min(20, rawData.length); i++) {
           const row = rawData[i];
           const rowStr = row.join(' ').toLowerCase();
           if (rowStr.includes('kode') && (rowStr.includes('tanggal') || rowStr.includes('date'))) {
              headerRowIndex = i;
              headers = row.map((h: any) => (h ? h.toString().trim() : ''));
              break;
           }
        }
        if (headerRowIndex === -1) { 
            headerRowIndex = 0; 
            headers = rawData[0].map((h: any) => (h ? h.toString().trim() : '')); 
        }

        const dataRows = rawData.slice(headerRowIndex + 1);
        const itemsToInsert: any[] = [];
        const getIdx = (keys: string[]) => headers.findIndex(h => h && keys.some(k => h.toLowerCase() === k.toLowerCase()));
        
        const idxTanggal = getIdx(['tanggal', 'date', 'tgl']);
        const idxKode = getIdx(['kode', 'nik']);
        const idxP1 = getIdx(['grade p1', 'p1']);
        const idxP2 = getIdx(['grade p2', 'p2']);
        const idxBulan = getIdx(['bulan', 'month']);
        const idxHadir = getIdx(['kehadiran', 'hadir']);
        const idxLembur = getIdx(['lembur', 'overtime']);
        const idxPeriode = getIdx(['periode', 'period']);
        const idxPT = getIdx(['perusahaan', 'pt']);
        const idxKet = getIdx(['keterangan', 'ket']);

        for (const row of dataRows) {
           if (!row[idxKode] && !row[idxTanggal]) continue;
           
           // Gunakan parser baru
           const dateStr = parseExcelDate(row[idxTanggal]);

           itemsToInsert.push({
              tanggal: dateStr,
              kode: (row[idxKode] || '').toString(),
              grade_p1: (row[idxP1] || '').toString(),
              grade_p2: (row[idxP2] || '').toString(),
              bulan: (row[idxBulan] || '').toString(),
              kehadiran: (row[idxHadir] || '').toString(),
              lembur: (row[idxLembur] || '').toString(),
              periode: (row[idxPeriode] || '').toString(),
              perusahaan: (row[idxPT] || '').toString(),
              keterangan: (row[idxKet] || '').toString()
           });
        }

        setConfirmModal({
            isOpen: true,
            title: 'Konfirmasi Import',
            message: `Sistem mendeteksi ${itemsToInsert.length} baris data valid.\n\nLanjutkan import?`,
            confirmLabel: 'Mulai Import',
            isDangerous: false,
            onConfirm: () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                executeImportBatch(itemsToInsert);
            }
        });

      } catch (error: any) {
        setErrorModal({ isOpen: true, title: 'Gagal Import', message: error.message });
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const executeImportBatch = async (itemsToInsert: any[]) => {
    setIsImporting(true);
    setImportProgress('Menyiapkan Import...');
    
    try {
      const errors = await processSmartQueue(
        itemsToInsert,
        async (batch) => {
          const { error } = await supabase.from('presensi_harian_pabrik').insert(batch);
          if (error) throw error;
        },
        (processed, total, speed) => {
          setImportProgress(`Mengimport... ${Math.round((processed/total)*100)}% (${processed}/${total})`);
        }
      );

      setSuccessModal({ 
        isOpen: true, 
        title: 'Import Selesai', 
        message: `Total: ${itemsToInsert.length}\n✅ Berhasil: ${itemsToInsert.length - errors.length}\n❌ Gagal: ${errors.length}`
      });
      
      handleResetFilter();
      fetchData();
    } catch (err: any) {
      setErrorModal({ isOpen: true, title: 'Error Fatal', message: err.message });
    } finally {
      setIsImporting(false);
      setImportProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleResetFilter = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setFilterMonth('');
    setFilterPeriod('');
    setFilterCompany('');
    setPage(1);
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

  const handleSave = async (formData: any) => {
    if (!isSupabaseConfigured()) return;
    try {
      if (selectedItem) {
        await supabase.from('presensi_harian_pabrik').update(formData).eq('id', selectedItem.id);
      } else {
        await supabase.from('presensi_harian_pabrik').insert([formData]);
      }
      setIsModalOpen(false);
      fetchData();
      setSuccessModal({ isOpen: true, title: 'Berhasil', message: 'Data presensi tersimpan.' });
    } catch (error: any) {
      setErrorModal({ isOpen: true, title: 'Gagal', message: error.message });
    }
  };

  const handleDownloadTemplate = () => {
    const template = [{ 'Tanggal': '2025-10-01', 'Kode': 'K001', 'Grade P1': 'A', 'Grade P2': 'Senior', 'Bulan': 'Oktober 2025', 'Kehadiran': '1', 'Lembur': '2 jam', 'Periode': 'Periode 1', 'Perusahaan': 'CV ADNAN', 'Keterangan': 'Hadir' }];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(template);
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Presensi_Harian.xlsx");
  };

  const handleExportAll = async () => {
    setIsLoading(true);
    try {
        let allData: any[] = [];
        let from = 0;
        const step = 500; // Reduced from 1000 to prevent network errors
        let hasMore = true;

        while (hasMore) {
            let query = supabase.from('presensi_harian_pabrik').select('*');
            if (searchTerm) query = query.or(`kode.ilike.%${searchTerm}%,keterangan.ilike.%${searchTerm}%`);
            if (startDate) query = query.gte('tanggal', startDate);
            if (endDate) query = query.lte('tanggal', endDate);
            if (filterMonth) query = query.ilike('bulan', `%${filterMonth}%`);
            if (filterPeriod && filterPeriod !== 'Semua') query = query.eq('periode', filterPeriod);
            if (filterCompany && filterCompany !== 'Semua') query = query.ilike('perusahaan', `%${filterCompany}%`);

            const { data: batch, error } = await query
                .order('tanggal', { ascending: false })
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

        if (!allData || allData.length === 0) { alert("Tidak ada data."); return; }

        const exportData = allData.map(item => ({
            'Tanggal': item.tanggal, 'Kode': item.kode, 'Grade P1': item.grade_p1, 'Grade P2': item.grade_p2,
            'Bulan': item.bulan, 'Kehadiran': item.kehadiran, 'Lembur': item.lembur, 'Periode': item.periode,
            'Perusahaan': item.perusahaan, 'Keterangan': item.keterangan
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(wb, ws, "Data Presensi");
        XLSX.writeFile(wb, `Presensi_${startDate || 'All'}.xlsx`);
    } catch (error: any) { alert(`Gagal Export: ${error.message}`); } finally { setIsLoading(false); }
  };

  const handleDeleteAll = () => {
    setConfirmModal({
      isOpen: true,
      title: 'HAPUS SEMUA DATA?',
      message: `PERINGATAN: Anda akan menghapus SEMUA data yang tampil sesuai filter saat ini.\n\nProses ini menggunakan Adaptive Queue untuk kecepatan maksimal.`,
      confirmLabel: 'Ya, Hapus Semua',
      isDangerous: true,
      onConfirm: () => executeBatchDelete('ALL')
    });
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Massal',
      message: `Hapus ${selectedIds.length} data terpilih?`,
      confirmLabel: 'Mulai Hapus',
      isDangerous: true,
      onConfirm: () => executeBatchDelete(selectedIds)
    });
  };

  const getKehadiranBadge = (val: string) => {
    const v = val.toString().toLowerCase();
    if (v === '1' || v === 'hadir') return 'bg-green-100 text-green-700 border-green-200';
    if (v === '0.5' || v === 'setengah') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    if (['s', 'i', 'a', 'sakit', 'izin', 'alpha'].includes(v)) return 'bg-red-100 text-red-700 border-red-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  };

  const handleDelete = (id: number) => {
    setConfirmModal({
        isOpen: true,
        title: 'Hapus Data',
        message: 'Yakin ingin menghapus data ini?',
        confirmLabel: 'Hapus',
        isDangerous: true,
        onConfirm: async () => {
            try {
                const { error } = await supabase.from('presensi_harian_pabrik').delete().eq('id', id);
                if (error) throw error;
                fetchData();
                setSuccessModal({ isOpen: true, title: 'Berhasil', message: 'Data dihapus.' });
            } catch (err: any) {
                setErrorModal({ isOpen: true, title: 'Gagal', message: err.message });
            } finally {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
            }
        }
    });
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
              disabled={isDeleting}
              className="px-4 py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-red-100 transition-all animate-fadeIn disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="animate-spin" size={18}/> : <Trash2 size={18}/>} 
              Hapus ({selectedIds.length})
            </button>
          )}

          {totalData > 0 && (
            <button 
              onClick={handleDeleteAll} 
              disabled={isDeleting}
              className="px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-medium flex items-center gap-2 shadow-sm shadow-red-200 transition-all disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="animate-spin" size={18}/> : <AlertTriangle size={18}/>} 
              {isDeleting ? deleteProgress : 'Hapus Semua'}
            </button>
          )}

          <div className="h-8 w-px bg-gray-200 mx-1 hidden md:block"></div>

          <button onClick={handleDownloadTemplate} className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-600 text-sm font-medium flex items-center gap-2 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
            <FileSpreadsheet size={18}/> Template
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isImporting}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-600 text-sm font-medium flex items-center gap-2 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImporting ? <Loader2 className="animate-spin" size={18}/> : <Upload size={18}/>} 
            {isImporting ? importProgress : 'Import'}
          </button>

          <button onClick={handleExportAll} className="px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-medium flex items-center gap-2 shadow-sm shadow-green-200 transition-all">
            <Download size={18}/> Export Semua
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

        <div className="col-span-1 md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1.5 ml-1">Bulan</label>
          <input 
            type="text" 
            placeholder="Contoh: Oktober" 
            value={filterMonth} 
            onChange={(e) => setFilterMonth(e.target.value)} 
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-erp-pink/30 focus:border-erp-pink outline-none transition-all"
          />
        </div>

        <div className="col-span-1 md:col-span-2">
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
          <label className="block text-xs font-medium text-gray-500 mb-1.5 ml-1">Perusahaan</label>
          <input 
            type="text" 
            placeholder="Cari Perusahaan..." 
            value={filterCompany} 
            onChange={(e) => setFilterCompany(e.target.value)} 
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-erp-pink/30 focus:border-erp-pink outline-none transition-all"
          />
        </div>

        <div className="col-span-1 md:col-span-2">
          <button 
            onClick={handleResetFilter} 
            className="w-full px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 hover:text-gray-800 flex items-center justify-center gap-2 transition-colors"
          >
            <X size={18} /> Reset Filter
          </button>
        </div>
      </div>

      {/* --- DATA TABLE --- */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
        <div className="overflow-auto max-h-[600px] custom-scrollbar relative">
          <table className="w-full text-sm text-left whitespace-nowrap relative border-collapse">
            <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 sticky top-0 z-10 shadow-sm uppercase text-xs tracking-wider">
              <tr>
                <th className="px-4 py-4 w-10 text-center">
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
                <th className="px-6 py-4 text-center">Kehadiran</th>
                <th className="px-6 py-4 text-center">Lembur</th>
                <th className="px-6 py-4 text-center">Periode</th>
                <th className="px-6 py-4 text-center">Perusahaan</th>
                <th className="px-6 py-4">Keterangan</th>
                <th className="px-6 py-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={12} className="p-16 text-center"><Loader2 className="animate-spin inline text-erp-pink mr-2" size={32}/> <span className="text-gray-500">Memuat data...</span></td></tr>
              ) : data.length > 0 ? (
                data.map((item) => (
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
                        <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded text-[10px] font-bold">{item.grade_p1}</span>
                        <span className="bg-purple-50 text-purple-700 border border-purple-100 px-2 py-0.5 rounded text-[10px] font-bold">{item.grade_p2}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-gray-600">{item.bulan}</td>
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
                    <td className="px-6 py-4 text-center text-gray-600">{item.periode}</td>
                    <td className="px-6 py-4 text-center text-gray-600">{item.perusahaan}</td>
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
                  <td colSpan={12} className="p-16 text-center text-gray-400 bg-gray-50/30">
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

      <DailyAttendanceModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSave} initialData={selectedItem} isLoading={false} />
      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message} />
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message} />
      <ConfirmationModal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} onConfirm={confirmModal.onConfirm} title={confirmModal.title || "Hapus Data"} message={confirmModal.message || "Yakin hapus?"} confirmLabel={confirmModal.confirmLabel || "Hapus"} isDangerous={confirmModal.isDangerous !== undefined ? confirmModal.isDangerous : true} isLoading={isDeleting} />
    </div>
  );
};
