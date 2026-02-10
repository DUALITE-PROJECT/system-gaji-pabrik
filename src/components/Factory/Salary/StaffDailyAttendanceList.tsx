import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Edit2, Trash2, Loader2, RefreshCw, 
  ChevronLeft, ChevronRight, Download, AlertTriangle, 
  Upload, FileSpreadsheet, Filter, X, Calendar, 
  Database, Copy, Clock, AlertCircle, CheckCircle2, Plus, Zap
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { StaffSalaryModal } from './StaffSalaryModal';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';
import { ConfirmationModal } from '../../Warehouse/ConfirmationModal';
import * as XLSX from 'xlsx';

export const StaffDailyAttendanceList: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  
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
  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; onConfirm: () => void; title?: string; message?: string; confirmLabel?: string; isDangerous?: boolean }>({ isOpen: false, onConfirm: () => {}, title: '', message: '' });
  
  // SQL Modal
  const [showSqlModal, setShowSqlModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // SQL Code for Auto-Sync
  const sqlAutoSyncCode = `
-- AUTO-SYNC NAMA, GRADE, DIVISI
-- dari data_karyawan ke presensi_harian

-- 1. Pastikan kolom ada
ALTER TABLE public.presensi_harian_staff_pabrik ADD COLUMN IF NOT EXISTS nama TEXT;
ALTER TABLE public.presensi_harian_staff_pabrik ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.presensi_harian_staff_pabrik ADD COLUMN IF NOT EXISTS divisi TEXT;

-- 2. TRIGGER: Auto-fill saat INSERT/UPDATE presensi
CREATE OR REPLACE FUNCTION autofill_karyawan_to_presensi()
RETURNS TRIGGER AS $$
DECLARE
    v_nama TEXT;
    v_grade TEXT;
    v_divisi TEXT;
BEGIN
    SELECT nama, grade, divisi INTO v_nama, v_grade, v_divisi
    FROM data_karyawan_staff_pabrik
    WHERE kode = NEW.kode AND bulan = NEW.bulan
    LIMIT 1;
    
    IF FOUND THEN
        NEW.nama := v_nama;
        NEW.grade := v_grade;
        NEW.divisi := v_divisi;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_autofill_karyawan_presensi ON public.presensi_harian_staff_pabrik;
CREATE TRIGGER trigger_autofill_karyawan_presensi
BEFORE INSERT OR UPDATE ON public.presensi_harian_staff_pabrik
FOR EACH ROW EXECUTE FUNCTION autofill_karyawan_to_presensi();

-- 3. TRIGGER: Sync saat data_karyawan berubah
CREATE OR REPLACE FUNCTION sync_karyawan_to_presensi()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        UPDATE public.presensi_harian_staff_pabrik
        SET nama = NEW.nama, grade = NEW.grade, divisi = NEW.divisi
        WHERE kode = NEW.kode AND bulan = NEW.bulan;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.presensi_harian_staff_pabrik
        SET nama = NULL, grade = NULL, divisi = NULL
        WHERE kode = OLD.kode AND bulan = OLD.bulan;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_karyawan_presensi ON public.data_karyawan_staff_pabrik;
CREATE TRIGGER trigger_sync_karyawan_presensi
AFTER INSERT OR UPDATE OR DELETE ON public.data_karyawan_staff_pabrik
FOR EACH ROW EXECUTE FUNCTION sync_karyawan_to_presensi();

-- 4. Sync Data Existing
UPDATE public.presensi_harian_staff_pabrik p
SET nama = k.nama, grade = k.grade, divisi = k.divisi
FROM public.data_karyawan_staff_pabrik k
WHERE p.kode = k.kode AND p.bulan = k.bulan;
  `;

  const handleCopySQL = () => {
    navigator.clipboard.writeText(sqlAutoSyncCode);
    setSuccessModal({ isOpen: true, title: 'SQL Disalin', message: 'Silakan jalankan di SQL Editor Supabase.' });
  };

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
        .from('presensi_harian_staff_pabrik')
        .select('*', { count: 'exact' });

      if (searchTerm) {
        query = query.or(`kode.ilike.%${searchTerm}%,nama.ilike.%${searchTerm}%,keterangan.ilike.%${searchTerm}%`);
      }
      if (startDate) query = query.gte('tanggal', startDate);
      if (endDate) query = query.lte('tanggal', endDate);
      if (filterMonth) query = query.ilike('bulan', `%${filterMonth}%`);

      const { data: result, error, count } = await query
        .order('tanggal', { ascending: false })
        .range(from, to);

      if (error) {
        throw error;
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

  useEffect(() => { fetchData(); }, [page, pageSize, searchTerm, startDate, endDate, filterMonth]);
  useEffect(() => { setPage(1); }, [searchTerm, startDate, endDate, filterMonth]);

  // --- ACTIONS ---
  const handleSave = async (formData: any) => {
    if (!isSupabaseConfigured()) return;
    try {
      if (selectedItem) {
        await supabase.from('presensi_harian_staff_pabrik').update(formData).eq('id', selectedItem.id);
      } else {
        await supabase.from('presensi_harian_staff_pabrik').insert([formData]);
      }
      setIsModalOpen(false);
      fetchData();
      setSuccessModal({ isOpen: true, title: 'Berhasil', message: 'Data presensi staff tersimpan.' });
    } catch (error: any) {
      setErrorModal({ isOpen: true, title: 'Gagal', message: error.message });
    }
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
                const { error } = await supabase.from('presensi_harian_staff_pabrik').delete().eq('id', id);
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

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Massal',
      message: `Hapus ${selectedIds.length} data terpilih?`,
      confirmLabel: 'Mulai Hapus',
      isDangerous: true,
      onConfirm: async () => {
        try {
            const { error } = await supabase.from('presensi_harian_staff_pabrik').delete().in('id', selectedIds);
            if (error) throw error;
            fetchData();
            setSelectedIds([]);
            setSuccessModal({ isOpen: true, title: 'Berhasil', message: 'Data terpilih dihapus.' });
        } catch (err: any) {
            setErrorModal({ isOpen: true, title: 'Gagal', message: err.message });
        } finally {
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // --- IMPORT / EXPORT / TEMPLATE ---
  const handleDownloadTemplate = () => {
    // Template disederhanakan sesuai request
    const template = [{ 
      'Tanggal': '2025-10-01', 
      'Kode': 'STF-001', 
      'Bulan': 'Oktober 2025', 
      'Kehadiran': '1', 
      'Lembur': '2', 
      'Perusahaan': 'CV ADNAN', 
      'Keterangan': 'Hadir' 
    }];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(template);
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Presensi_Staff.xlsx");
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
        setImportProgress('Menganalisa Data...');

        // 1. Kumpulkan semua Bulan dari data Excel untuk fetch data karyawan
        const uniqueMonths = new Set<string>();
        rawData.forEach(row => {
            const bulan = row['Bulan']?.toString().trim();
            if (bulan) uniqueMonths.add(bulan);
        });

        // 2. Fetch Data Karyawan berdasarkan bulan yang ada di Excel
        let employeeMap = new Map<string, any>();
        if (uniqueMonths.size > 0) {
            const { data: employees, error: empError } = await supabase
                .from('data_karyawan_staff_pabrik')
                .select('kode, bulan, nama, grade, divisi')
                .in('bulan', Array.from(uniqueMonths));
            
            if (empError) throw empError;

            if (employees) {
                employees.forEach(emp => {
                    // Key: KODE-BULAN (Case insensitive)
                    const key = `${emp.kode.trim().toUpperCase()}-${emp.bulan.trim().toUpperCase()}`;
                    employeeMap.set(key, emp);
                });
            }
        }

        // 3. Map Excel Data + Auto Fill Employee Info
        const itemsToInsert = rawData.map(row => {
            // Handle Date Parsing
            let dateStr = row['Tanggal'];
            if (typeof dateStr === 'number') {
                dateStr = new Date(Math.round((dateStr - 25569) * 86400 * 1000)).toISOString().split('T')[0];
            } else if (!dateStr) {
                dateStr = new Date().toISOString().split('T')[0];
            }

            const kode = (row['Kode'] || '').toString().trim();
            const bulan = (row['Bulan'] || '').toString().trim();
            
            // Lookup Employee Data
            const empKey = `${kode.toUpperCase()}-${bulan.toUpperCase()}`;
            const empData = employeeMap.get(empKey);

            return {
                tanggal: dateStr,
                kode: kode,
                // Auto-fill dari data karyawan jika ada, jika tidak kosongkan/strip
                nama: empData?.nama || '',
                grade: empData?.grade || '',
                divisi: empData?.divisi || '',
                
                bulan: bulan,
                kehadiran: (row['Kehadiran'] || '1').toString(),
                lembur: (row['Lembur'] || '0').toString(),
                perusahaan: (row['Perusahaan'] || '').toString(),
                keterangan: (row['Keterangan'] || '').toString()
            };
        }).filter(i => i.kode); // Filter yang tidak punya kode

        if (itemsToInsert.length === 0) {
            setErrorModal({ isOpen: true, title: 'Gagal Import', message: 'Tidak ada data valid (Kode wajib diisi).' });
            setIsImporting(false);
            return;
        }

        setImportProgress('Menyimpan...');

        // Batch Insert
        const BATCH_SIZE = 50;
        let successCount = 0;
        
        for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
            const chunk = itemsToInsert.slice(i, i + BATCH_SIZE);
            
            // Gunakan upsert agar jika data tanggal+kode sama, diupdate
            const { error } = await supabase.from('presensi_harian_staff_pabrik').upsert(chunk, { onConflict: 'tanggal,kode' });
            
            if (error) {
                console.error("Batch insert error:", error);
                // Lanjut ke batch berikutnya jika error (opsional: bisa throw error)
            } else {
                successCount += chunk.length;
            }
            setImportProgress(`Proses ${Math.min(i + BATCH_SIZE, itemsToInsert.length)}/${itemsToInsert.length}...`);
        }

        setSuccessModal({ isOpen: true, title: 'Import Selesai', message: `Berhasil memproses ${successCount} data.\nData Nama, Grade, dan Divisi telah diisi otomatis sesuai Data Karyawan.` });
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

  const handleExportAll = async () => {
    setIsLoading(true);
    try {
        let allData: any[] = [];
        let from = 0;
        const step = 500;
        let hasMore = true;

        while (hasMore) {
            let query = supabase.from('presensi_harian_staff_pabrik').select('*');
            if (searchTerm) query = query.or(`kode.ilike.%${searchTerm}%,nama.ilike.%${searchTerm}%,keterangan.ilike.%${searchTerm}%`);
            if (startDate) query = query.gte('tanggal', startDate);
            if (endDate) query = query.lte('tanggal', endDate);
            if (filterMonth) query = query.ilike('bulan', `%${filterMonth}%`);

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
            'Tanggal': item.tanggal, 
            'Kode': item.kode, 
            'Nama': item.nama,
            'Grade': item.grade,
            'Bulan': item.bulan, 
            'Kehadiran': item.kehadiran, 
            'Lembur': item.lembur,
            'Perusahaan': item.perusahaan, 
            'Divisi': item.divisi,
            'Keterangan': item.keterangan
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(wb, ws, "Data Presensi Staff");
        XLSX.writeFile(wb, `Presensi_Staff_${startDate || 'All'}.xlsx`);
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

  const getKehadiranBadge = (val: string) => {
    const v = (val || '').toString().toLowerCase();
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
            placeholder="Cari kode, nama, atau keterangan..." 
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

          {/* HIDDEN: Setup Auto-Sync Button */}
          {/* 
          <button onClick={() => setShowSqlModal(true)} className="px-4 py-2.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-blue-100 transition-all shadow-sm">
            <Zap size={18}/> Setup Auto-Sync
          </button>
          */}

          <button onClick={handleDownloadTemplate} className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-600 text-sm font-medium flex items-center gap-2 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
            <FileSpreadsheet size={18}/> Template
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isImporting}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-600 text-sm font-medium flex items-center gap-2 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px] justify-center"
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

        <div className="col-span-1 md:col-span-2">
          <button 
            onClick={() => { setSearchTerm(''); setStartDate(''); setEndDate(''); setFilterMonth(''); setPage(1); }} 
            className="w-full px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 hover:text-gray-800 flex items-center justify-center gap-2 transition-colors"
          >
            <X size={18} /> Reset Filter
          </button>
        </div>
      </div>

      {/* --- DATA TABLE --- */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-0">
        <div className="overflow-auto max-h-[600px] custom-scrollbar relative">
          <table className="w-full text-sm text-left whitespace-nowrap relative border-collapse">
            <thead className="bg-gray-100 text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3 w-12 text-center">No</th>
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
                <th className="px-6 py-4">Divisi</th>
                <th className="px-6 py-4 text-center">Grade</th>
                <th className="px-6 py-4">Perusahaan</th>
                <th className="px-6 py-4 w-32 text-center">Kehadiran</th>
                <th className="px-6 py-4 w-24 text-center">Lembur</th>
                <th className="px-6 py-4">Keterangan</th>
                <th className="px-6 py-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={12} className="p-12 text-center"><Loader2 className="animate-spin inline text-erp-pink mr-2"/> Memuat data...</td></tr>
              ) : data.length > 0 ? (
                data.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 text-center text-gray-500">{idx + 1 + ((page - 1) * pageSize)}</td>
                    <td className="px-4 py-2 text-center">
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
                    <td className="px-6 py-4 text-gray-600">{item.divisi}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-blue-600">{item.grade || '-'}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-xs">{item.perusahaan}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getKehadiranBadge(item.kehadiran)}`}>
                        {item.kehadiran}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {item.lembur && item.lembur !== '0' ? (
                        <span className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-1 rounded text-xs font-bold flex items-center justify-center gap-1">
                          <Clock size={12}/> {item.lembur}
                        </span>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-sm italic truncate max-w-[150px]">{item.keterangan}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-2">
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
                  <td colSpan={12} className="p-16 text-center text-gray-400 italic">
                    {searchTerm || filterMonth ? 'Data tidak ditemukan.' : 'Belum ada data presensi staff.'}
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
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="border border-gray-300 rounded-lg py-1.5 px-2 bg-white focus:ring-2 focus:ring-erp-pink/50 outline-none cursor-pointer text-xs font-medium">
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
            </select>
            <span>dari <b>{totalData.toLocaleString()}</b> data</span>
          </div>
          
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(prev => Math.max(prev - 1, 1))} disabled={page === 1 || isLoading} className="p-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-white shadow-sm">
              <ChevronLeft size={16} />
            </button>
            <span className="font-medium px-2">Halaman {page} / {Math.ceil(totalData / pageSize) || 1}</span>
            <button onClick={() => setPage(prev => Math.min(prev + 1, Math.ceil(totalData / pageSize)))} disabled={page >= Math.ceil(totalData / pageSize) || isLoading} className="p-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-white shadow-sm">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* SQL Modal */}
      {showSqlModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-blue-50">
              <h3 className="font-bold text-lg text-blue-800 flex items-center gap-2">
                <Database size={20}/> Setup Auto-Sync Database
              </h3>
              <button onClick={() => setShowSqlModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 text-sm mb-4">
                Salin kode SQL di bawah ini dan jalankan di <b>Supabase SQL Editor</b> untuk mengaktifkan fitur sinkronisasi otomatis data karyawan ke presensi.
              </p>
              
              <div className="relative">
                <textarea 
                  className="w-full h-64 p-4 text-xs font-mono bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
                  readOnly
                  value={sqlAutoSyncCode}
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

      <StaffSalaryModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSave} initialData={selectedItem} isLoading={false} />
      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message} />
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message} />
      <ConfirmationModal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} onConfirm={confirmModal.onConfirm} title={confirmModal.title || "Hapus Data"} message={confirmModal.message || "Yakin hapus?"} confirmLabel={confirmModal.confirmLabel || "Hapus"} isDangerous={confirmModal.isDangerous !== undefined ? confirmModal.isDangerous : true} />
    </div>
  );
};
