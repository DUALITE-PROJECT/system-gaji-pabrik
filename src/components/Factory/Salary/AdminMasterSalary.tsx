import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Plus, Edit2, Trash2, Loader2, RefreshCw, Database, FileSpreadsheet, Upload, Download, CheckSquare, Filter, X } from 'lucide-react';
import { AdminMasterSalaryModal } from './AdminMasterSalaryModal';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';
import { ConfirmationModal } from '../../Warehouse/ConfirmationModal';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import * as XLSX from 'xlsx';

export const AdminMasterSalary: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTableMissing, setIsTableMissing] = useState(false);
  
  // --- FILTER STATE ---
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title?: string; message?: string; confirmLabel?: string; isDangerous?: boolean; onConfirm: () => void }>({ isOpen: false, onConfirm: () => {} });

  const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

  const fetchData = async () => {
    setIsLoading(true);
    setIsTableMissing(false);
    setSelectedIds([]); // Reset selection on refresh
    
    if (!isSupabaseConfigured()) {
        setIsLoading(false);
        return;
    }

    try {
        const { data: result, error } = await supabase
            .from('master_gaji_admin_pabrik')
            .select('*')
            .order('id', { ascending: false });

        if (error) {
            if (error.code === '42P01' || error.message.includes('does not exist')) {
                setIsTableMissing(true);
            }
            throw error;
        }
        
        setData(result || []);
        
        // Auto-select latest month if not set
        if (!filterMonth && result && result.length > 0) {
            const months = [...new Set(result.map((item: any) => item.bulan))];
            // Simple sort logic, ideally parse dates
            if (months.length > 0) setFilterMonth(months[0]); 
        }

    } catch (error: any) {
        console.error("Fetch error:", error.message);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // --- UNIQUE MONTHS ---
  const uniqueMonths = useMemo(() => {
    const months = data.map(item => item.bulan).filter(Boolean);
    return [...new Set(months)].sort();
  }, [data]);

  // --- FILTERING ---
  const filteredData = useMemo(() => {
    return data.filter(item => {
        const matchesSearch = (item.jabatan || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                              (item.divisi || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesMonth = filterMonth === '' || item.bulan === filterMonth;

        return matchesSearch && matchesMonth;
    });
  }, [data, searchTerm, filterMonth]);

  // --- SELECTION LOGIC ---
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredData.map(item => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(item => item !== id));
    } else {
      setSelectedIds(prev => [...prev, id]);
    }
  };

  const isAllSelected = filteredData.length > 0 && selectedIds.length === filteredData.length;
  const isIndeterminate = selectedIds.length > 0 && selectedIds.length < filteredData.length;

  // --- CRUD HANDLERS ---
  const handleSave = async (formData: any) => {
    setIsSaving(true);
    try {
        if (selectedItem) {
            const { error } = await supabase.from('master_gaji_admin_pabrik').update(formData).eq('id', selectedItem.id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('master_gaji_admin_pabrik').insert([formData]);
            if (error) throw error;
        }
        setSuccessModal({ isOpen: true, title: 'Berhasil', message: 'Data master gaji admin tersimpan.' });
        fetchData();
        setIsModalOpen(false);
    } catch (error: any) {
        setErrorModal({ isOpen: true, title: 'Gagal', message: error.message });
    } finally {
        setIsSaving(false);
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
        const { error } = await supabase.from('master_gaji_admin_pabrik').delete().eq('id', id);
        if (error) {
            setErrorModal({ isOpen: true, title: 'Gagal Hapus', message: error.message });
        } else {
            fetchData();
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
      message: `Apakah Anda yakin ingin menghapus ${selectedIds.length} data yang dipilih?`,
      confirmLabel: 'Hapus Semua',
      isDangerous: true,
      onConfirm: async () => {
        const { error } = await supabase.from('master_gaji_admin_pabrik').delete().in('id', selectedIds);
        if (error) {
            setErrorModal({ isOpen: true, title: 'Gagal Hapus Massal', message: error.message });
        } else {
            fetchData();
            setSelectedIds([]);
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // --- IMPORT / EXPORT / TEMPLATE ---

  const handleDownloadTemplate = () => {
    const template = [
      {
        'Bulan': 'Oktober 2025',
        'Divisi': 'Keuangan',
        'Jabatan': 'Manager',
        'Gaji Pokok': 8000000,
        'Uang Makan': 1000000,
        'Uang Kehadiran': 500000,
        'Insentif': 2000000,
        'Uang Jabatan': 1500000,
        'Uang Transport': 1000000
      }
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(template);
    
    const wscols = Object.keys(template[0]).map(() => ({ wch: 20 }));
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Template Master Admin");
    XLSX.writeFile(wb, "Template_Master_Gaji_Admin.xlsx");
  };

  const handleExport = () => {
    if (data.length === 0) {
      alert("Tidak ada data untuk diexport.");
      return;
    }

    const exportData = filteredData.map(item => ({
      'Bulan': item.bulan,
      'Divisi': item.divisi,
      'Jabatan': item.jabatan,
      'Gaji Pokok': item.gaji_pokok,
      'Uang Makan': item.uang_makan,
      'Uang Kehadiran': item.uang_kehadiran,
      'Lembur Per Jam': item.lembur_per_jam,
      'Insentif': item.insentif,
      'Uang Jabatan': item.tunjangan_jabatan,
      'Uang Transport': item.tunjangan_transportasi,
      'Lembur TM': item.lembur_tanggal_merah
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Master Gaji Admin");
    XLSX.writeFile(wb, `Master_Gaji_Admin_${new Date().toISOString().slice(0,10)}.xlsx`);
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
        const jsonData = XLSX.utils.sheet_to_json(ws);

        if (jsonData.length === 0) {
          setErrorModal({ isOpen: true, title: 'File Kosong', message: 'File Excel tidak memiliki data.' });
          return;
        }

        setIsImporting(true);

        const processedData = jsonData.map((row: any) => {
          const gajiPokok = Number(row['Gaji Pokok'] || 0);
          
          const hourlyBase = gajiPokok / 26 / 8;
          const autoLembur = Math.round(hourlyBase * 1.4);
          const autoLemburTM = Math.round(hourlyBase);

          const lemburPerJam = Number(row['Lembur Per Jam'] || autoLembur);
          const lemburTM = Number(row['Lembur TM'] || autoLemburTM);

          return {
            bulan: row['Bulan'] || '',
            divisi: row['Divisi'] || '',
            jabatan: row['Jabatan'] || '',
            gaji_pokok: gajiPokok,
            uang_makan: Number(row['Uang Makan'] || 0),
            uang_kehadiran: Number(row['Uang Kehadiran'] || 0),
            lembur_per_jam: lemburPerJam,
            insentif: Number(row['Insentif'] || 0),
            tunjangan_jabatan: Number(row['Uang Jabatan'] || 0),
            tunjangan_transport: Number(row['Uang Transport'] || 0),
            lembur_tanggal_merah: lemburTM,
            updated_at: new Date().toISOString()
          };
        });

        const { error } = await supabase.from('master_gaji_admin_pabrik').insert(processedData);
        
        if (error) throw error;

        setSuccessModal({ 
          isOpen: true, 
          title: 'Import Berhasil', 
          message: `Berhasil mengimport ${processedData.length} data master gaji admin.\nKolom Lembur telah dihitung otomatis.` 
        });
        fetchData();
      } catch (error: any) {
        setErrorModal({ isOpen: true, title: 'Gagal Import', message: error.message });
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".xlsx, .xls" />

      {/* --- TOOLBAR --- */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 shrink-0">
        <div className="flex flex-col md:flex-row gap-3 w-full xl:w-auto">
            {/* Search Bar */}
            <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Cari Jabatan / Divisi..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-erp-pink/50 shadow-sm" 
                />
            </div>

            {/* Month Dropdown Filter */}
            <div className="relative w-full md:w-48">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <select
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-erp-pink/50 shadow-sm bg-white appearance-none cursor-pointer"
                >
                    <option value="">Semua Bulan</option>
                    {uniqueMonths.map(m => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
            </div>
            
            {/* Reset Filter Button */}
            {(searchTerm || filterMonth) && (
                <button 
                    onClick={() => { setSearchTerm(''); setFilterMonth(''); }}
                    className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Reset Filter"
                >
                    <X size={18} />
                </button>
            )}
        </div>

        <div className="flex flex-wrap gap-2 w-full xl:w-auto justify-end">
          {isTableMissing && (
             <div className="text-red-500 text-xs font-bold flex items-center bg-red-50 px-2 rounded">
                <Database size={14} className="mr-1"/> Tabel Belum Ada
             </div>
          )}

          {selectedIds.length > 0 && (
            <button 
              onClick={handleBulkDelete} 
              className="bg-red-100 text-red-600 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-red-200 transition-colors animate-fadeIn"
            >
              <Trash2 size={16}/> Hapus ({selectedIds.length})
            </button>
          )}
          
          <button onClick={handleDownloadTemplate} className="px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 shadow-sm flex items-center gap-2 text-sm font-medium">
            <FileSpreadsheet size={16}/> Template
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isImporting}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 shadow-sm flex items-center gap-2 text-sm font-medium disabled:opacity-50"
          >
            {isImporting ? <Loader2 className="animate-spin" size={16}/> : <Upload size={16}/>} Import
          </button>
          
          <button onClick={handleExport} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm flex items-center gap-2 text-sm font-medium transition-colors">
            <Download size={16}/> Export
          </button>

          <button onClick={fetchData} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 shadow-sm transition-colors" title="Refresh">
            <RefreshCw size={18}/>
          </button>
          
          <button onClick={() => { setSelectedItem(null); setIsModalOpen(true); }} className="bg-erp-pink text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-pink-600 shadow-md transition-colors">
            <Plus size={16}/> Tambah Master
          </button>
        </div>
      </div>

      {/* --- SCROLLABLE TABLE --- */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-auto custom-scrollbar relative max-h-[600px]">
          <table className="w-full text-xs text-left whitespace-nowrap relative border-collapse">
            <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-200 uppercase sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-4 w-10 text-center bg-gray-50">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-gray-300 text-erp-pink focus:ring-erp-pink cursor-pointer"
                    checked={isAllSelected}
                    ref={input => { if (input) input.indeterminate = isIndeterminate; }}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="px-4 py-4 bg-gray-50">Bulan</th>
                <th className="px-4 py-4 bg-gray-50">Divisi</th>
                <th className="px-4 py-4 bg-gray-50">Jabatan</th>
                <th className="px-4 py-4 text-right bg-gray-50">Gaji</th>
                <th className="px-4 py-4 text-right bg-gray-50">U. Makan</th>
                <th className="px-4 py-4 text-right bg-gray-50">U. Kehadiran</th>
                <th className="px-4 py-4 text-right bg-gray-50">Lembur/Jam</th>
                <th className="px-4 py-4 text-right bg-gray-50">Insentif</th>
                <th className="px-4 py-4 text-right bg-gray-50">U. Jabatan</th>
                <th className="px-4 py-4 text-right bg-gray-50">U. Transport</th>
                <th className="px-4 py-4 text-right bg-gray-50">Lembur TM</th>
                <th className="px-4 py-4 text-center bg-gray-50">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={13} className="p-12 text-center"><Loader2 className="animate-spin inline mr-2"/> Memuat...</td></tr>
              ) : filteredData.length > 0 ? (
                filteredData.map((item) => (
                  <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.includes(item.id) ? 'bg-pink-50/30' : ''}`}>
                    <td className="px-4 py-3 text-center">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-gray-300 text-erp-pink focus:ring-erp-pink cursor-pointer"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => handleSelectOne(item.id)}
                      />
                    </td>
                    <td className="px-4 py-3">{item.bulan}</td>
                    <td className="px-4 py-3 text-gray-600">{item.divisi}</td>
                    <td className="px-4 py-3 font-bold text-gray-800">{item.jabatan}</td>
                    <td className="px-4 py-3 text-right text-green-700 font-medium">{formatRupiah(item.gaji_pokok)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatRupiah(item.uang_makan)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatRupiah(item.uang_kehadiran)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatRupiah(item.lembur_per_jam)}</td>
                    <td className="px-4 py-3 text-right text-blue-600">{formatRupiah(item.insentif)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatRupiah(item.tunjangan_jabatan)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatRupiah(item.tunjangan_transportasi)}</td>
                    <td className="px-4 py-3 text-right text-orange-600">{formatRupiah(item.lembur_tanggal_merah)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => { setSelectedItem(item); setIsModalOpen(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded border border-transparent hover:border-blue-100 transition-all"><Edit2 size={16}/></button>
                        <button onClick={() => handleDelete(item.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded border border-transparent hover:border-red-100 transition-all"><Trash2 size={16}/></button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={13} className="p-12 text-center text-gray-500 italic">Tidak ada data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AdminMasterSalaryModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSave} initialData={selectedItem} isLoading={isSaving} />
      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message} />
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message} />
      <ConfirmationModal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} onConfirm={confirmModal.onConfirm} title={confirmModal.title || "Hapus Data"} message={confirmModal.message || "Yakin ingin menghapus data ini?"} confirmLabel={confirmModal.confirmLabel || "Hapus"} isDangerous={confirmModal.isDangerous} />
    </div>
  );
};
