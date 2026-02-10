import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Search, Edit2, Trash2, Loader2, Database, RefreshCw, 
  Copy, FileSpreadsheet, Upload, AlertCircle, CheckCircle2, 
  Download, Filter, X, AlertTriangle 
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';
import { ConfirmationModal } from '../../Warehouse/ConfirmationModal';
import * as XLSX from 'xlsx';

export const EmployeeData: React.FC = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTableMissing, setIsTableMissing] = useState(false);
  
  // --- FILTER STATE ---
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterDivisi, setFilterDivisi] = useState('');
  
  // State untuk Selection
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  
  const [formData, setFormData] = useState({
    id: null, 
    kode: '', 
    nama: '', 
    jenis_kelamin: 'L', 
    grade_p1: '', 
    grade_p2: '',
    divisi: '', 
    bulan: '', 
    keterangan: '', 
    status_aktif: true
  });

  const fetchEmployees = async () => {
    setIsLoading(true);
    setIsTableMissing(false);
    setSelectedIds([]); // Reset selection on refresh
    
    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('karyawan_pabrik')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          setIsTableMissing(true);
        }
        setEmployees([]);
      } else {
        setEmployees(data || []);
      }
    } catch (error: any) {
      console.warn("Fetch error:", error.message);
      setEmployees([]); 
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchEmployees(); }, []);

  // --- UNIQUE VALUES FOR DROPDOWNS ---
  const uniqueMonths = useMemo(() => {
    const months = employees.map(e => e.bulan).filter(Boolean);
    return [...new Set(months)].sort();
  }, [employees]);

  const uniqueDivisions = useMemo(() => {
    const divisions = employees.map(e => e.divisi).filter(Boolean);
    return [...new Set(divisions)].sort();
  }, [employees]);

  // --- FILTERING LOGIC ---
  const filteredEmployees = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return employees.filter(e => {
      const matchesSearch = (e.nama || '').toLowerCase().includes(search) ||
                            (e.kode || '').toLowerCase().includes(search) ||
                            (e.keterangan || '').toLowerCase().includes(search);
      
      const matchesMonth = filterMonth === '' || e.bulan === filterMonth;
      const matchesDivisi = filterDivisi === '' || e.divisi === filterDivisi;

      return matchesSearch && matchesMonth && matchesDivisi;
    });
  }, [employees, searchTerm, filterMonth, filterDivisi]);

  const handleResetFilter = () => {
    setSearchTerm('');
    setFilterMonth('');
    setFilterDivisi('');
  };

  // --- SELECTION LOGIC ---
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredEmployees.map(e => e.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(i => i !== id));
    } else {
      setSelectedIds(prev => [...prev, id]);
    }
  };

  const isAllSelected = filteredEmployees.length > 0 && selectedIds.length === filteredEmployees.length;
  const isIndeterminate = selectedIds.length > 0 && selectedIds.length < filteredEmployees.length;

  // --- EXPORT LOGIC ---
  const handleExport = () => {
    if (filteredEmployees.length === 0) {
      setErrorModal({ isOpen: true, title: 'Data Kosong', message: 'Tidak ada data untuk diexport.' });
      return;
    }

    const dataToExport = filteredEmployees.map(e => ({
      'Kode': e.kode,
      'Nama': e.nama,
      'P/L': e.jenis_kelamin,
      'Grade P1': e.grade_p1,
      'Grade P2': e.grade_p2,
      'Divisi': e.divisi,
      'Bulan': e.bulan,
      'Keterangan': e.keterangan
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    
    // Auto width columns
    const wscols = [
      { wch: 10 }, { wch: 25 }, { wch: 5 }, { wch: 10 }, 
      { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 20 }
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Data Karyawan");
    XLSX.writeFile(wb, `Data_Karyawan_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // --- CRUD HANDLERS ---

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isSupabaseConfigured()) {
        setErrorModal({ 
          isOpen: true, 
          title: 'Koneksi Terputus', 
          message: 'Aplikasi belum terhubung ke database Supabase. Mohon cek koneksi Anda.' 
        });
        return;
    }

    setIsSaving(true);
    try {
      const payload = {
        kode: formData.kode.trim(), 
        nama: formData.nama.trim(), 
        jenis_kelamin: formData.jenis_kelamin,
        grade_p1: formData.grade_p1, 
        grade_p2: formData.grade_p2, 
        divisi: formData.divisi, 
        bulan: formData.bulan.trim(), 
        keterangan: formData.keterangan, 
        status_aktif: formData.status_aktif,
        updated_at: new Date().toISOString()
      };

      if (formData.id) {
        const { error } = await supabase.from('karyawan_pabrik').update(payload).eq('id', formData.id);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase.from('karyawan_pabrik').insert([payload]);
        if (error) {
            if (error.code === '23505') { 
                throw new Error(`Gagal: Kode "${payload.kode}" sudah terdaftar untuk bulan "${payload.bulan}".`);
            }
            throw error;
        }
      }
      setIsModalOpen(false);
      setSuccessModal({ isOpen: true, title: 'Berhasil', message: 'Data karyawan berhasil disimpan.' });
      fetchEmployees();
    } catch (error: any) {
      // Deteksi error spesifik trigger
      if (error.message?.includes('calculate_monthly_report_for_employee') || error.message?.includes('does not exist')) {
         setErrorModal({ 
           isOpen: true, 
           title: 'Trigger Database Kadaluarsa', 
           message: 'Sistem mendeteksi fungsi lama di database. \n\nSilakan hubungi admin.' 
         });
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
      message: 'Apakah Anda yakin ingin menghapus data karyawan ini?',
      onConfirm: async () => {
        if (!isSupabaseConfigured()) return;
        const { error } = await supabase.from('karyawan_pabrik').delete().eq('id', id);
        if (error) {
            setErrorModal({ isOpen: true, title: 'Gagal Hapus', message: error.message });
        } else {
            fetchEmployees();
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
      message: `Apakah Anda yakin ingin menghapus ${selectedIds.length} data karyawan yang dipilih?`,
      onConfirm: async () => {
        if (!isSupabaseConfigured()) return;
        const { error } = await supabase.from('karyawan_pabrik').delete().in('id', selectedIds);
        if (error) {
            setErrorModal({ isOpen: true, title: 'Gagal Hapus Massal', message: error.message });
        } else {
            fetchEmployees();
            setSelectedIds([]);
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const openModal = (employee?: any) => {
    if (employee) {
      setFormData({ ...employee });
    } else {
      const today = new Date();
      const monthYear = today.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
      setFormData({
        id: null, kode: '', nama: '', jenis_kelamin: 'L', grade_p1: '', grade_p2: '',
        divisi: '', bulan: monthYear, keterangan: '', status_aktif: true
      });
    }
    setIsModalOpen(true);
  };

  // --- IMPORT EXCEL ---
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(ws);
      
      setIsLoading(true);
      
      if (!isSupabaseConfigured()) {
          setIsLoading(false);
          setErrorModal({
            isOpen: true,
            title: 'Database Belum Terhubung',
            message: 'Fitur Import membutuhkan koneksi database Supabase.'
          });
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
      }

      try {
        const { data: existingData } = await supabase.from('karyawan_pabrik').select('kode, bulan');
        const existingMap = new Set(existingData?.map((e: any) => `${e.kode.trim().toUpperCase()}-${e.bulan.trim().toUpperCase()}`));
        
        const itemsToInsert: any[] = [];
        const duplicates: string[] = [];
        const internalDuplicates: string[] = [];
        const processedKeys = new Set();

        jsonData.forEach((row: any) => {
            const kode = (row['Kode'] || row['Kode Karyawan'] || '').toString().trim();
            const bulan = (row['Bulan'] || '').toString().trim();
            const nama = row['Nama'] || row['Nama Karyawan'];
            
            if (kode && bulan && nama) {
                const key = `${kode.toUpperCase()}-${bulan.toUpperCase()}`;
                
                if (existingMap.has(key)) {
                    duplicates.push(`${kode} (${bulan})`);
                } else if (processedKeys.has(key)) {
                    internalDuplicates.push(`${kode} (${bulan})`);
                } else {
                    processedKeys.add(key);
                    itemsToInsert.push({
                      kode: kode,
                      nama: nama,
                      jenis_kelamin: row['P/L'] || row['Jenis Kelamin'] || 'L',
                      grade_p1: row['Grade P1'] || '',
                      grade_p2: row['Grade P2'] || '',
                      divisi: row['Divisi'] || '',
                      bulan: bulan,
                      keterangan: row['Keterangan'] || '',
                      status_aktif: true
                    });
                }
            }
        });

        if (duplicates.length > 0 || internalDuplicates.length > 0) {
             let msg = 'Import Dibatalkan Total.\n\n';
             if (duplicates.length > 0) {
                 msg += `❌ Ditemukan ${duplicates.length} data SUDAH ADA di database.\n`;
             }
             if (internalDuplicates.length > 0) {
                 msg += `❌ Ditemukan ${internalDuplicates.length} duplikasi GANDA di file Excel.\n`;
             }
             msg += 'Mohon perbaiki data Excel Anda agar tidak ada duplikasi.';
             
             setErrorModal({ isOpen: true, title: 'Validasi Gagal', message: msg });
             setIsLoading(false);
             if (fileInputRef.current) fileInputRef.current.value = '';
             return;
        }

        if (itemsToInsert.length > 0) {
          const { error } = await supabase.from('karyawan_pabrik').insert(itemsToInsert);
          if (error) throw error;
          setSuccessModal({ isOpen: true, title: 'Import Selesai', message: `Berhasil mengimport ${itemsToInsert.length} data karyawan.` });
          fetchEmployees();
        } else {
            setErrorModal({ isOpen: true, title: 'Gagal Import', message: 'Tidak ada data valid atau format Excel salah.' });
        }
      } catch (error: any) {
        setErrorModal({ isOpen: true, title: 'Error Sistem', message: error.message });
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = () => {
    const template = [
        { 'Kode': 'K001', 'Nama': 'Budi Santoso', 'P/L': 'L', 'Grade P1': 'A', 'Grade P2': 'Senior', 'Divisi': 'Produksi', 'Bulan': 'Oktober 2025', 'Keterangan': 'Tetap' },
        { 'Kode': 'K001', 'Nama': 'Budi Santoso', 'P/L': 'L', 'Grade P1': 'A', 'Grade P2': 'Senior', 'Divisi': 'Produksi', 'Bulan': 'November 2025', 'Keterangan': 'Tetap' }
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(template);
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Data_Karyawan.xlsx");
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".xlsx, .xls" />
      
      {/* --- TOP TOOLBAR --- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Cari Nama / Kode / Keterangan..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-erp-pink/50 bg-white shadow-sm" 
          />
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto items-center justify-end">
          
          {/* Tombol Hapus Massal (Muncul jika ada yang dipilih) */}
          {selectedIds.length > 0 && (
            <button 
              onClick={handleBulkDelete} 
              className="px-4 py-2.5 bg-red-100 text-red-600 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-red-200 shadow-sm animate-fadeIn"
            >
              <Trash2 size={16}/> Hapus ({selectedIds.length})
            </button>
          )}

          <button onClick={handleDownloadTemplate} className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-600 text-sm font-medium flex items-center gap-2 hover:bg-gray-50 shadow-sm whitespace-nowrap">
            <FileSpreadsheet size={16}/> Template
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-600 text-sm font-medium flex items-center gap-2 hover:bg-gray-50 shadow-sm whitespace-nowrap">
            <Upload size={16}/> Import
          </button>
          <button onClick={handleExport} className="px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-green-700 shadow-sm shadow-green-200 whitespace-nowrap transition-all">
            <Download size={16}/> Export
          </button>
          <button onClick={fetchEmployees} className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 shadow-sm" title="Refresh">
            <RefreshCw size={18}/>
          </button>
          <button onClick={() => openModal()} className="bg-erp-pink text-white px-5 py-2.5 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-pink-600 shadow-md shadow-pink-200 whitespace-nowrap">
            <Plus size={18}/> Tambah
          </button>
        </div>
      </div>

      {/* --- FILTER SECTION --- */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
        <div className="col-span-1 md:col-span-12 flex items-center gap-2 text-sm font-bold text-erp-pink mb-1">
          <Filter size={18}/> Filter Data
        </div>
        
        <div className="col-span-1 md:col-span-4">
          <label className="block text-xs font-medium text-gray-500 mb-1.5 ml-1">Bulan</label>
          <select 
            value={filterMonth} 
            onChange={(e) => setFilterMonth(e.target.value)} 
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-erp-pink/30 focus:border-erp-pink outline-none cursor-pointer"
          >
            <option value="">Semua Bulan</option>
            {uniqueMonths.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="col-span-1 md:col-span-4">
          <label className="block text-xs font-medium text-gray-500 mb-1.5 ml-1">Divisi</label>
          <select 
            value={filterDivisi} 
            onChange={(e) => setFilterDivisi(e.target.value)} 
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-erp-pink/30 focus:border-erp-pink outline-none cursor-pointer"
          >
            <option value="">Semua Divisi</option>
            {uniqueDivisions.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="col-span-1 md:col-span-4">
          <button 
            onClick={handleResetFilter} 
            className="w-full px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 hover:text-gray-800 flex items-center justify-center gap-2 transition-colors"
          >
            <X size={18} /> Reset Filter
          </button>
        </div>
      </div>

      {/* Error States - Show if table missing */}
      {isTableMissing ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm">
          <Database size={48} className="text-red-400 mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Database Belum Siap</h3>
          <p className="text-gray-500 mb-6 max-w-md">
            Tabel <code>karyawan_pabrik</code> belum memiliki struktur kolom yang sesuai. 
            Silakan hubungi admin untuk setup database.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
          <div className="overflow-auto max-h-[600px] custom-scrollbar relative">
            <table className="w-full text-sm text-left whitespace-nowrap relative border-collapse">
              <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <tr>
                  {/* Checkbox Header */}
                  <th className="px-4 py-4 w-10 text-center">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-erp-pink focus:ring-erp-pink cursor-pointer"
                      checked={isAllSelected}
                      ref={input => { if (input) input.indeterminate = isIndeterminate; }}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-4">Kode</th>
                  <th className="px-6 py-4">Nama</th>
                  <th className="px-6 py-4 text-center">P/L</th>
                  <th className="px-6 py-4 text-center">Grade P1</th>
                  <th className="px-6 py-4 text-center">Grade P2</th>
                  <th className="px-6 py-4">Divisi</th>
                  <th className="px-6 py-4">Bulan</th>
                  <th className="px-6 py-4">Keterangan</th>
                  <th className="px-6 py-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={10} className="p-12 text-center"><Loader2 className="animate-spin inline text-erp-pink mr-2"/> Memuat data...</td></tr>
                ) : filteredEmployees.length > 0 ? (
                  filteredEmployees.map((emp) => (
                    <tr key={emp.id} className={`hover:bg-gray-50 transition-colors group ${selectedIds.includes(emp.id) ? 'bg-pink-50/30' : ''}`}>
                      {/* Checkbox Row */}
                      <td className="px-4 py-4 text-center">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-gray-300 text-erp-pink focus:ring-erp-pink cursor-pointer"
                          checked={selectedIds.includes(emp.id)}
                          onChange={() => handleSelectOne(emp.id)}
                        />
                      </td>
                      <td className="px-6 py-4 font-mono font-medium text-gray-700">{emp.kode}</td>
                      <td className="px-6 py-4 font-medium text-gray-900">{emp.nama}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${emp.jenis_kelamin === 'L' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}`}>
                          {emp.jenis_kelamin}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center"><span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-bold">{emp.grade_p1}</span></td>
                      <td className="px-6 py-4 text-center"><span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-bold">{emp.grade_p2}</span></td>
                      <td className="px-6 py-4 text-gray-600">{emp.divisi}</td>
                      <td className="px-6 py-4 font-medium text-gray-800">{emp.bulan}</td>
                      <td className="px-6 py-4 text-gray-500 italic">{emp.keterangan}</td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => openModal(emp)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded border border-blue-100 hover:border-blue-300 transition-all" title="Edit">
                            <Edit2 size={16}/>
                          </button>
                          <button onClick={() => handleDelete(emp.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded border border-red-100 hover:border-red-300 transition-all" title="Hapus">
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="p-16 text-center text-gray-400 italic">
                      Tidak ada data karyawan. <br/>
                      <span className="text-xs">Klik tombol "Tambah" atau "Import" untuk memulai.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <div>
                <h3 className="font-bold text-xl text-gray-900">{formData.id ? 'Edit Karyawan' : 'Tambah Karyawan Baru'}</h3>
                <p className="text-sm text-gray-500 mt-1">Isi data karyawan dengan lengkap.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><AlertCircle size={24}/></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Kode Karyawan <span className="text-red-500">*</span></label>
                  <input required value={formData.kode} onChange={e => setFormData({...formData, kode: e.target.value})} className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink focus:border-erp-pink outline-none transition-all" placeholder="Contoh: K001" />
                  <p className="text-xs text-gray-400 mt-1">Harus unik untuk bulan yang sama.</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nama Lengkap <span className="text-red-500">*</span></label>
                  <input required value={formData.nama} onChange={e => setFormData({...formData, nama: e.target.value})} className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink focus:border-erp-pink outline-none transition-all" placeholder="Nama Karyawan" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Bulan <span className="text-red-500">*</span></label>
                  <input required value={formData.bulan} onChange={e => setFormData({...formData, bulan: e.target.value})} className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink focus:border-erp-pink outline-none transition-all" placeholder="Contoh: Oktober 2025" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">P/L (Jenis Kelamin)</label>
                  <select value={formData.jenis_kelamin} onChange={e => setFormData({...formData, jenis_kelamin: e.target.value})} className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink focus:border-erp-pink outline-none transition-all bg-white">
                    <option value="L">L - Laki-laki</option>
                    <option value="P">P - Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Divisi</label>
                  <input value={formData.divisi} onChange={e => setFormData({...formData, divisi: e.target.value})} className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink focus:border-erp-pink outline-none transition-all" placeholder="Contoh: Produksi" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Grade P1</label>
                    <input value={formData.grade_p1} onChange={e => setFormData({...formData, grade_p1: e.target.value})} className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink focus:border-erp-pink outline-none transition-all" placeholder="A/B/C" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Grade P2</label>
                    <input value={formData.grade_p2} onChange={e => setFormData({...formData, grade_p2: e.target.value})} className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink focus:border-erp-pink outline-none transition-all" placeholder="Senior/Junior" />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Keterangan</label>
                  <input value={formData.keterangan} onChange={e => setFormData({...formData, keterangan: e.target.value})} className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink focus:border-erp-pink outline-none transition-all" placeholder="Opsional (Contoh: Karyawan Tetap)" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Batal</button>
                <button type="submit" disabled={isSaving} className="px-6 py-2.5 bg-erp-pink text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-pink-600 shadow-sm transition-colors disabled:opacity-70">
                  {isSaving ? <Loader2 className="animate-spin" size={18}/> : <CheckCircle2 size={18}/>} Simpan Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message} />
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message} />
      <ConfirmationModal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} onConfirm={confirmModal.onConfirm} title={confirmModal.title} message={confirmModal.message} confirmLabel="Hapus" isDangerous={true} />
    </div>
  );
};
