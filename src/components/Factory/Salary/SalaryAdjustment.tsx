import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Plus, Edit2, Trash2, Loader2, Database, RefreshCw, Copy, Download, Upload, FileSpreadsheet, Filter, X, Wrench, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { SalaryAdjustmentModal } from './SalaryAdjustmentModal';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';
import { ConfirmationModal } from '../../Warehouse/ConfirmationModal';
import * as XLSX from 'xlsx';

export const SalaryAdjustment: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTableMissing, setIsTableMissing] = useState(false);
  
  // --- FILTER STATE ---
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');

  // --- SELECTION STATE ---
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // State untuk Loading Hapus
  const [isDeleting, setIsDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title?: string; message?: string; onConfirm: () => void }>({ isOpen: false, onConfirm: () => {} });

  const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

  const fetchData = async () => {
    setIsLoading(true);
    setIsTableMissing(false);
    setSelectedIds([]);
    
    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }

    try {
      const { data: result, error } = await supabase
        .from('penyesuaian_gaji_pabrik')
        .select('*')
        .order('id', { ascending: false });

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setIsTableMissing(true);
        }
        setData([]);
      } else {
        setData(result || []);
      }
    } catch (error) {
      console.warn("Unexpected error (Silent):", error);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // --- UNIQUE VALUES FOR FILTERS ---
  const uniqueMonths = useMemo(() => [...new Set(data.map(item => item.bulan))].sort(), [data]);
  const uniquePeriods = useMemo(() => [...new Set(data.map(item => item.periode))].sort(), [data]);

  // --- FILTERING LOGIC ---
  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesSearch = (item.kode || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMonth = filterMonth === '' || item.bulan === filterMonth;
      const matchesPeriod = filterPeriod === '' || item.periode === filterPeriod;
      return matchesSearch && matchesMonth && matchesPeriod;
    });
  }, [data, searchTerm, filterMonth, filterPeriod]);

  const handleResetFilter = () => {
    setSearchTerm('');
    setFilterMonth('');
    setFilterPeriod('');
  };

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

  // --- CRUD HANDLERS ---
  const handleSave = async (formData: any) => {
    setIsSaving(true);
    try {
      if (selectedItem) {
        const { error } = await supabase.from('penyesuaian_gaji_pabrik').update({ ...formData, updated_at: new Date() }).eq('id', selectedItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('penyesuaian_gaji_pabrik').insert([formData]);
        if (error) throw error;
      }
      setIsModalOpen(false);
      fetchData();
      setSuccessModal({ isOpen: true, title: 'Berhasil', message: 'Data tersimpan.' });
    } catch (error: any) {
      console.error("Save Error:", error);
      setErrorModal({ isOpen: true, title: 'Gagal', message: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Data',
      message: 'Apakah Anda yakin ingin menghapus data ini?',
      onConfirm: async () => {
        setIsDeleting(true);
        try {
            const { error } = await supabase.from('penyesuaian_gaji_pabrik').delete().eq('id', id);
            if (error) throw error;
            
            await fetchData();
            setSuccessModal({ isOpen: true, title: 'Berhasil', message: 'Data berhasil dihapus.' });
        } catch (error: any) {
            setErrorModal({ isOpen: true, title: 'Gagal Hapus', message: error.message });
        } finally {
            setIsDeleting(false);
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
      onConfirm: async () => {
        setIsDeleting(true);
        try {
            const { error } = await supabase.from('penyesuaian_gaji_pabrik').delete().in('id', selectedIds);
            if (error) throw error;
            
            await fetchData();
            setSelectedIds([]);
            setSuccessModal({ isOpen: true, title: 'Berhasil', message: 'Data terpilih berhasil dihapus.' });
        } catch (error: any) {
            setErrorModal({ isOpen: true, title: 'Gagal Hapus Massal', message: error.message });
        } finally {
            setIsDeleting(false);
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // --- IMPORT / EXPORT / TEMPLATE ---
  const handleDownloadTemplate = () => {
    const templateData = [
      { 
        'Bulan': 'Oktober 2025', 
        'Periode': 'Periode 1', 
        'Perusahaan': 'CV ADNAN', 
        'Kode': 'K001', 
        'Bonus (Adj)': 50000, 
        'Kasbon': 0 
      },
      { 
        'Bulan': 'Oktober 2025', 
        'Periode': 'Periode 1', 
        'Perusahaan': 'CV ADNAN', 
        'Kode': 'K002', 
        'Bonus (Adj)': 0, 
        'Kasbon': 100000 
      }
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templateData);
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Penyesuaian_Gaji.xlsx");
  };

  const handleExport = () => {
    if (filteredData.length === 0) {
      alert("Tidak ada data untuk diexport.");
      return;
    }
    const exportData = filteredData.map(item => ({
      'Bulan': item.bulan,
      'Periode': item.periode,
      'Perusahaan': item.perusahaan,
      'Kode': item.kode,
      'Bonus (Adj)': item.penyesuaian_bonus,
      'Kasbon': item.kasbon
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Data Penyesuaian");
    XLSX.writeFile(wb, `Penyesuaian_Gaji_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(ws);

      if (jsonData.length === 0) {
        setErrorModal({ isOpen: true, title: 'File Kosong', message: 'File Excel tidak memiliki data.' });
        return;
      }

      setIsLoading(true);
      try {
        const processedData = jsonData.map((row: any) => ({
          bulan: row['Bulan'] || '',
          periode: row['Periode'] || 'Periode 1',
          perusahaan: row['Perusahaan'] || 'CV ADNAN',
          kode: (row['Kode'] || '').toString(),
          penyesuaian_bonus: Number(row['Bonus (Adj)'] || row['Bonus'] || 0),
          kasbon: Number(row['Kasbon'] || 0),
          updated_at: new Date().toISOString()
        }));

        const { error } = await supabase.from('penyesuaian_gaji_pabrik').insert(processedData);
        if (error) throw error;

        setSuccessModal({ 
          isOpen: true, 
          title: 'Import Berhasil', 
          message: `Berhasil mengimport ${processedData.length} data penyesuaian.` 
        });
        fetchData();
      } catch (error: any) {
        setErrorModal({ isOpen: true, title: 'Gagal Import', message: error.message });
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".xlsx, .xls" />

      {/* --- TOOLBAR --- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Cari Kode Karyawan..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-erp-pink/50 shadow-sm" 
          />
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
          {selectedIds.length > 0 && (
            <button 
              onClick={handleBulkDelete} 
              disabled={isDeleting}
              className="bg-red-100 text-red-600 px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-red-200 transition-colors animate-fadeIn disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="animate-spin" size={16}/> : <Trash2 size={16}/>} 
              Hapus ({selectedIds.length})
            </button>
          )}
          
          <button onClick={handleDownloadTemplate} className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 shadow-sm flex items-center gap-2 text-sm font-medium">
            <FileSpreadsheet size={16}/> Template
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 shadow-sm flex items-center gap-2 text-sm font-medium">
            <Upload size={16}/> Import
          </button>
          <button onClick={handleExport} className="px-3 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm flex items-center gap-2 text-sm font-medium transition-colors">
            <Download size={16}/> Export
          </button>

          <button onClick={fetchData} className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 shadow-sm" title="Refresh">
            <RefreshCw size={16}/>
          </button>
          <button onClick={() => { setSelectedItem(null); setIsModalOpen(true); }} className="bg-erp-pink text-white px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-pink-600 shadow-md shadow-pink-200 transition-colors">
            <Plus size={16}/> Tambah
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
          <label className="block text-xs font-medium text-gray-500 mb-1.5 ml-1">Periode</label>
          <select 
            value={filterPeriod} 
            onChange={(e) => setFilterPeriod(e.target.value)} 
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-erp-pink/30 focus:border-erp-pink outline-none cursor-pointer"
          >
            <option value="">Semua Periode</option>
            {uniquePeriods.map(p => (
              <option key={p} value={p}>{p}</option>
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

      {/* --- TABLE SECTION --- */}
      {isTableMissing ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-red-50 border border-red-200 rounded-xl p-8 text-center">
          <Database size={48} className="text-red-400 mb-4" />
          <h3 className="text-xl font-bold text-red-800 mb-2">Tabel Belum Siap</h3>
          <p className="text-gray-600 mb-4">Tabel <code>penyesuaian_gaji_pabrik</code> tidak ditemukan.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
          <div className="overflow-auto max-h-[600px] custom-scrollbar relative">
            <table className="w-full text-sm text-left whitespace-nowrap relative border-collapse">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-4 w-10 text-center">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-erp-pink focus:ring-erp-pink cursor-pointer"
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-4">Bulan</th>
                  <th className="px-6 py-4">Periode</th>
                  <th className="px-6 py-4">Perusahaan</th>
                  <th className="px-6 py-4">Kode</th>
                  <th className="px-6 py-4 text-green-600 font-medium">Bonus (Adj)</th>
                  <th className="px-6 py-4 text-red-600 font-medium">Kasbon</th>
                  <th className="px-6 py-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={8} className="p-12 text-center"><Loader2 className="animate-spin inline text-erp-pink mr-2"/> Memuat...</td></tr>
                ) : filteredData.length > 0 ? (
                  filteredData.map((item) => (
                    <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.includes(item.id) ? 'bg-pink-50/30' : ''}`}>
                      <td className="px-4 py-4 text-center">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-gray-300 text-erp-pink focus:ring-erp-pink cursor-pointer"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => handleSelectOne(item.id)}
                        />
                      </td>
                      <td className="px-6 py-4">{item.bulan}</td>
                      <td className="px-6 py-4">{item.periode}</td>
                      <td className="px-6 py-4">{item.perusahaan}</td>
                      <td className="px-6 py-4 font-mono text-gray-600 bg-gray-50/50 rounded px-2 w-fit">{item.kode}</td>
                      <td className="px-6 py-4 text-green-600">{formatRupiah(item.penyesuaian_bonus)}</td>
                      <td className="px-6 py-4 text-red-600">{formatRupiah(item.kasbon)}</td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => { setSelectedItem(item); setIsModalOpen(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded border border-transparent hover:border-blue-100 transition-all"><Edit2 size={16}/></button>
                          <button onClick={() => handleDelete(item.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded border border-transparent hover:border-red-100 transition-all"><Trash2 size={16}/></button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={8} className="p-12 text-center text-gray-500 italic">Data tidak ditemukan.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SalaryAdjustmentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSave} initialData={selectedItem} isLoading={isSaving} />
      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message} />
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message} />
      <ConfirmationModal 
        isOpen={confirmModal.isOpen} 
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} 
        onConfirm={confirmModal.onConfirm} 
        title={confirmModal.title || "Hapus Data"} 
        message={confirmModal.message || "Yakin hapus data ini?"} 
        confirmLabel="Hapus" 
        isDangerous={true} 
        isLoading={isDeleting} 
      />
    </div>
  );
};
