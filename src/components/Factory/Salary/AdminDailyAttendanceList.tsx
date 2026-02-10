import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Edit2, Trash2, Loader2, RefreshCw, 
  ChevronLeft, ChevronRight, Download, Upload, 
  FileSpreadsheet, Filter, X, Calendar, Plus, 
  Clock, AlertCircle, CheckCircle2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { AdminDailyAttendanceModal } from './AdminDailyAttendanceModal';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';
import { ConfirmationModal } from '../../Warehouse/ConfirmationModal';

export const AdminDailyAttendanceList: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTableMissing, setIsTableMissing] = useState(false);
  
  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalData, setTotalData] = useState(0);

  // Selection
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  
  // Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  // Modals
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
            .from('presensi_harian_admin_pabrik')
            .select('*', { count: 'exact' });

        // Apply Filters
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
            if (error.code === '42P01' || error.message.includes('does not exist')) {
                setIsTableMissing(true);
            }
            throw error;
        }
        setData(result || []);
        setTotalData(count || 0);
    } catch (error: any) {
        console.error("Fetch error:", error.message);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [page, pageSize, searchTerm, startDate, endDate, filterMonth]);
  useEffect(() => { setPage(1); }, [searchTerm, startDate, endDate, filterMonth]);

  // --- HANDLERS ---

  const handleSave = async (formData: any) => {
    try {
        // Auto-fill employee data if missing
        if (!formData.nama || !formData.jabatan) {
            const { data: emp } = await supabase
                .from('data_karyawan_admin_pabrik')
                .select('nama, jabatan, divisi, perusahaan')
                .eq('kode', formData.kode)
                .eq('bulan', formData.bulan) // Ensure we get the correct month's data
                .maybeSingle();
            
            if (emp) {
                formData.nama = emp.nama;
                formData.jabatan = emp.jabatan;
                formData.divisi = emp.divisi;
                formData.perusahaan = emp.perusahaan;
            }
        }

        if (selectedItem) {
            const { error } = await supabase.from('presensi_harian_admin_pabrik').update(formData).eq('id', selectedItem.id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('presensi_harian_admin_pabrik').insert([formData]);
            if (error) throw error;
        }
        setIsModalOpen(false);
        setSuccessModal({ isOpen: true, title: 'Berhasil', message: 'Data presensi admin tersimpan.' });
        fetchData();
    } catch (error: any) {
        setErrorModal({ isOpen: true, title: 'Gagal', message: error.message });
    }
  };

  const handleDelete = (id: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Data',
      message: 'Yakin ingin menghapus data presensi ini?',
      confirmLabel: 'Hapus',
      isDangerous: true,
      onConfirm: async () => {
        const { error } = await supabase.from('presensi_harian_admin_pabrik').delete().eq('id', id);
        if (error) {
            setErrorModal({ isOpen: true, title: 'Gagal Hapus', message: error.message });
        } else {
            fetchData();
            setSuccessModal({ isOpen: true, title: 'Berhasil', message: 'Data dihapus.' });
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Massal',
      message: `Hapus ${selectedIds.length} data terpilih?`,
      confirmLabel: 'Hapus Semua',
      isDangerous: true,
      onConfirm: async () => {
        const { error } = await supabase.from('presensi_harian_admin_pabrik').delete().in('id', selectedIds);
        if (error) {
            setErrorModal({ isOpen: true, title: 'Gagal Hapus', message: error.message });
        } else {
            fetchData();
            setSelectedIds([]);
            setSuccessModal({ isOpen: true, title: 'Berhasil', message: 'Data terpilih dihapus.' });
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // --- IMPORT / EXPORT ---

  const handleDownloadTemplate = () => {
    const template = [{ 
      'Tanggal': new Date().toISOString().split('T')[0], 
      'Kode': 'ADM-001', 
      'Bulan': 'Oktober 2025', 
      'Kehadiran': 'Hadir', 
      'Lembur (Jam)': 2, 
      'Lembur TM': 0,
      'Keterangan': '' 
    }];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(template);
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Presensi_Admin.xlsx");
  };

  const handleExport = async () => {
    setIsLoading(true);
    try {
        let allData: any[] = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;

        while (hasMore) {
            let query = supabase.from('presensi_harian_admin_pabrik').select('*');
            if (searchTerm) query = query.or(`kode.ilike.%${searchTerm}%,nama.ilike.%${searchTerm}%`);
            if (startDate) query = query.gte('tanggal', startDate);
            if (endDate) query = query.lte('tanggal', endDate);
            if (filterMonth) query = query.ilike('bulan', `%${filterMonth}%`);

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

        if (allData.length === 0) { alert("Tidak ada data."); return; }

        const exportData = allData.map(item => ({
            'Tanggal': item.tanggal,
            'Kode': item.kode,
            'Nama': item.nama,
            'Bulan': item.bulan, 
            'Jabatan': item.jabatan,
            'Divisi': item.divisi,
            'Kehadiran': item.kehadiran,
            'Lembur (Jam)': item.jam_lembur,
            'Lembur TM': item.lembur_tm,
            'Keterangan': item.keterangan
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(wb, ws, "Data Presensi");
        XLSX.writeFile(wb, `Presensi_Admin_${startDate || 'All'}.xlsx`);

    } catch (error: any) {
        setErrorModal({ isOpen: true, title: 'Gagal Export', message: error.message });
    } finally {
        setIsLoading(false);
    }
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
        setImportProgress('Mencari data karyawan...');

        // 1. Get Employee Data for Auto-fill (Fetch ALL to map correctly)
        const { data: employees } = await supabase.from('data_karyawan_admin_pabrik').select('kode, nama, jabatan, divisi, perusahaan, bulan');
        
        // Map by "KODE-BULAN" to handle multiple months correctly
        const empMap = new Map();
        if (employees) {
            employees.forEach(emp => {
                const key = `${emp.kode.trim().toUpperCase()}-${emp.bulan.trim().toUpperCase()}`;
                empMap.set(key, emp);
            });
        }

        // 2. Process Data
        const itemsToInsert = rawData.map(row => {
            let dateStr = row['Tanggal'];
            if (typeof dateStr === 'number') {
                dateStr = new Date(Math.round((dateStr - 25569) * 86400 * 1000)).toISOString().split('T')[0];
            }

            const kode = (row['Kode'] || '').toString().trim();
            const bulan = (row['Bulan'] || '').toString().trim(); // Get Month from Excel
            
            // Lookup using composite key
            const empKey = `${kode.toUpperCase()}-${bulan.toUpperCase()}`;
            const emp = empMap.get(empKey);

            return {
                tanggal: dateStr,
                kode: kode,
                bulan: bulan, // Use month from Excel
                nama: emp?.nama || '', // Auto-fill
                jabatan: emp?.jabatan || '',
                divisi: emp?.divisi || '',
                perusahaan: emp?.perusahaan || 'CV GARUT',
                kehadiran: (row['Kehadiran'] || '').toString(),
                jam_lembur: Number(row['Lembur (Jam)'] || row['Lembur'] || 0),
                lembur_tm: Number(row['Lembur TM'] || 0),
                keterangan: (row['Keterangan'] || '').toString()
            };
        }).filter(i => i.kode);

        if (itemsToInsert.length === 0) {
            setErrorModal({ isOpen: true, title: 'Gagal', message: 'Tidak ada data valid (Kode wajib).' });
            setIsImporting(false);
            return;
        }

        setImportProgress('Menyimpan...');
        
        const { error } = await supabase.from('presensi_harian_admin_pabrik').upsert(itemsToInsert, { onConflict: 'tanggal,kode' });
        
        if (error) throw error;

        setSuccessModal({ isOpen: true, title: 'Import Selesai', message: `Berhasil mengimport ${itemsToInsert.length} data presensi.` });
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

  // --- SELECTION ---
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedIds(data.map(item => item.id));
    else setSelectedIds([]);
  };

  const handleSelectOne = (id: number) => {
    if (selectedIds.includes(id)) setSelectedIds(prev => prev.filter(item => item !== id));
    else setSelectedIds(prev => [...prev, id]);
  };

  const isAllSelected = data.length > 0 && data.every(item => selectedIds.includes(item.id));

  return (
    <div className="space-y-6 h-full flex flex-col">
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

          <button onClick={handleExport} className="px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-medium flex items-center gap-2 shadow-sm shadow-green-200 transition-all">
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
                <th className="px-6 py-4">Jabatan</th>
                <th className="px-6 py-4">Divisi</th>
                <th className="px-6 py-4">Bulan</th>
                <th className="px-6 py-4 text-center">Kehadiran</th>
                <th className="px-6 py-4 text-center">Lembur</th>
                <th className="px-6 py-4 text-center bg-red-50 text-red-700">Lembur TM</th>
                <th className="px-6 py-4">Keterangan</th>
                <th className="px-6 py-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={13} className="p-12 text-center"><Loader2 className="animate-spin inline text-erp-pink mr-2"/> Memuat data...</td></tr>
              ) : data.length > 0 ? (
                data.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 text-center text-gray-500">{idx + 1 + ((page - 1) * pageSize)}</td>
                    <td className="px-4 py-2 text-center">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-gray-300 text-erp-pink focus:ring-erp-pink cursor-pointer"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => {
                            if (selectedIds.includes(item.id)) setSelectedIds(prev => prev.filter(i => i !== item.id));
                            else setSelectedIds(prev => [...prev, item.id]);
                        }}
                      />
                    </td>
                    <td className="px-6 py-4 text-gray-700 font-medium">{item.tanggal}</td>
                    <td className="px-6 py-4 font-mono text-gray-600 bg-gray-50/50 rounded px-2 w-fit">{item.kode}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{item.nama}</td>
                    <td className="px-6 py-4 text-gray-600">{item.jabatan}</td>
                    <td className="px-6 py-4 text-gray-600">{item.divisi}</td>
                    <td className="px-6 py-4 text-gray-600">{item.bulan}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        item.kehadiran === 'Hadir' || item.kehadiran === 'H' ? 'bg-green-100 text-green-700 border-green-200' :
                        item.kehadiran === 'Sakit' || item.kehadiran === 'S' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                        item.kehadiran === 'Izin' || item.kehadiran === 'I' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                        'bg-gray-100 text-gray-600 border-gray-200'
                      }`}>
                        {item.kehadiran}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {item.jam_lembur > 0 ? (
                        <span className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-1 rounded text-xs font-bold flex items-center justify-center gap-1">
                          <Clock size={12}/> {item.jam_lembur}
                        </span>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {item.lembur_tm > 0 ? (
                        <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded text-xs font-bold flex items-center justify-center gap-1">
                          <Clock size={12}/> {item.lembur_tm}
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
                  <td colSpan={13} className="p-16 text-center text-gray-400 italic">
                    {searchTerm || filterMonth ? 'Data tidak ditemukan.' : 'Belum ada data presensi admin.'}
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
              <option value="50">50</option>
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

      <AdminDailyAttendanceModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSave} initialData={selectedItem} isLoading={false} />
      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message} />
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message} />
      <ConfirmationModal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} onConfirm={confirmModal.onConfirm} title={confirmModal.title || "Hapus Data"} message={confirmModal.message || "Yakin hapus?"} confirmLabel={confirmModal.confirmLabel || "Hapus"} isDangerous={confirmModal.isDangerous !== undefined ? confirmModal.isDangerous : true} />
    </div>
  );
};
