import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Package, Save, Search, Filter, Download, Trash2, 
  Loader2, TrendingUp, RefreshCw, Database, Copy, Edit2, XCircle, PenTool, List, X, Wrench 
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import * as XLSX from 'xlsx';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';
import { ConfirmationModal } from '../../Warehouse/ConfirmationModal';

export const DailyOutput: React.FC = () => {
  // --- STATE ---
  const [data, setData] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTableMissing, setIsTableMissing] = useState(false);
  
  // SQL Fix State
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [sqlFixCode, setSqlFixCode] = useState('');

  // Edit State
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form State
  const [isManualSku, setIsManualSku] = useState(false);
  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    skuId: '',
    skuManual: '',
    hargaPerPcs: '',
    output: ''
  });

  // Filter State
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterSku, setFilterSku] = useState('');

  // Modals
  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; onConfirm: () => void }>({ isOpen: false, onConfirm: () => {} });

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

  // SQL Code untuk Fix Function Missing
  const FIX_FUNCTION_SQL = `
CREATE OR REPLACE FUNCTION calculate_gaji_borongan_garut_by_date(p_tanggal DATE)
RETURNS VOID AS $$
BEGIN
    -- Placeholder function to prevent "function does not exist" error on insert trigger
    NULL;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION calculate_gaji_borongan_garut_by_date(DATE) TO authenticated, service_role;
NOTIFY pgrst, 'reload config';
`;

  // --- FETCH DATA ---
  const fetchData = async () => {
    setIsLoading(true);
    setIsTableMissing(false);

    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }

    try {
      const { data: skuData } = await supabase.from('master_sku').select('id, kode_sku, nama, hpp');
      setSkus(skuData || []);

      const { data: outputData, error } = await fetchWithRetry(async () => {
        return await supabase
          .from('output_harian_pabrik')
          .select(`*, master_sku (kode_sku, nama)`)
          .order('tanggal', { ascending: false })
          .order('created_at', { ascending: false });
      });

      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') {
          setIsTableMissing(true);
          return; 
        }
        throw error;
      }

      setData(outputData || []);
    } catch (error: any) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- HANDLERS ---
  const handleSkuChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const selectedSku = skus.find(s => s.id.toString() === selectedId);
    
    setFormData(prev => ({
      ...prev,
      skuId: selectedId,
      hargaPerPcs: prev.hargaPerPcs || (selectedSku?.hpp ? selectedSku.hpp.toString() : '')
    }));
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    const isManual = !item.sku_id;
    setIsManualSku(isManual);

    setFormData({
      tanggal: item.tanggal,
      skuId: item.sku_id ? item.sku_id.toString() : '',
      skuManual: item.sku_manual || '',
      hargaPerPcs: item.harga_per_pcs.toString(),
      output: item.output.toString()
    });
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setIsManualSku(false);
    setFormData({
      tanggal: new Date().toISOString().split('T')[0],
      skuId: '',
      skuManual: '',
      hargaPerPcs: '',
      output: ''
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const outputVal = Number(formData.output);
      const hargaVal = Number(formData.hargaPerPcs);
      const totalVal = outputVal * hargaVal;

      const payload = {
        tanggal: formData.tanggal,
        sku_id: isManualSku ? null : formData.skuId,
        sku_manual: isManualSku ? formData.skuManual : null,
        output: outputVal,
        harga_per_pcs: hargaVal,
        total_hasil: totalVal
      };

      if (editingId) {
        const { error } = await supabase.from('output_harian_pabrik').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('output_harian_pabrik').insert(payload);
        if (error) throw error;
      }

      setSuccessModal({ isOpen: true, title: 'Berhasil', message: `Data output produksi berhasil ${editingId ? 'diperbarui' : 'disimpan'}.` });
      handleCancelEdit();
      fetchData();
    } catch (error: any) {
      // DETEKSI ERROR SPESIFIK
      if (error.message && error.message.includes('calculate_gaji_borongan_garut_by_date')) {
          setSqlFixCode(FIX_FUNCTION_SQL);
          setShowSqlModal(true);
      } else {
          setErrorModal({ isOpen: true, title: 'Gagal Simpan', message: error.message });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    setConfirmModal({
      isOpen: true,
      onConfirm: async () => {
        const { error } = await supabase.from('output_harian_pabrik').delete().eq('id', id);
        if (error) {
          setErrorModal({ isOpen: true, title: 'Gagal Hapus', message: error.message });
        } else {
          fetchData();
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleCopySQL = () => {
    navigator.clipboard.writeText(sqlFixCode);
    setSuccessModal({ isOpen: true, title: 'SQL Disalin', message: 'Silakan jalankan kode di SQL Editor Supabase.' });
  };

  // --- CALCULATIONS & FILTER ---
  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchStartDate = filterStartDate ? item.tanggal >= filterStartDate : true;
      const matchEndDate = filterEndDate ? item.tanggal <= filterEndDate : true;
      const matchSku = filterSku ? item.sku_id?.toString() === filterSku : true;
      return matchStartDate && matchEndDate && matchSku;
    });
  }, [data, filterStartDate, filterEndDate, filterSku]);

  const stats = useMemo(() => {
    const totalOutput = filteredData.reduce((acc, curr) => acc + Number(curr.output), 0);
    const totalHasil = filteredData.reduce((acc, curr) => acc + Number(curr.total_hasil), 0);
    const uniqueKeys = new Set(filteredData.map(d => d.sku_id ? `ID-${d.sku_id}` : `MANUAL-${d.sku_manual}`));
    return { totalOutput, totalHasil, uniqueSku: uniqueKeys.size };
  }, [filteredData]);

  const formatRupiah = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Input Form */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Calendar className="text-erp-pink" size={20} />
              <div>
                <h2 className="font-bold text-gray-900">{editingId ? 'Edit Output' : 'Input Output Harian'}</h2>
                <p className="text-xs text-gray-500">Catat hasil produksi per hari</p>
              </div>
            </div>
            {editingId && (
              <button onClick={handleCancelEdit} className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-1">
                <XCircle size={16} /> Batal Edit
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Tanggal *</label>
                <input type="date" value={formData.tanggal} onChange={e => setFormData({...formData, tanggal: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink outline-none" required />
              </div>

              <div className="md:col-span-2">
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-gray-700">
                    {isManualSku ? 'Nama Barang (Manual) *' : 'Pilih Master SKU *'}
                  </label>
                  <button type="button" onClick={() => { setIsManualSku(!isManualSku); setFormData(prev => ({ ...prev, skuId: '', skuManual: '', hargaPerPcs: '' })); }} className="text-xs text-erp-pink hover:text-pink-700 font-medium flex items-center gap-1">
                    {isManualSku ? <List size={12}/> : <PenTool size={12}/>}
                    {isManualSku ? 'Pilih dari Master SKU' : 'Input Manual / Barang Luar'}
                  </button>
                </div>

                {isManualSku ? (
                  <input type="text" placeholder="Contoh: Baju Gamis (Jahitan Luar)" value={formData.skuManual} onChange={e => setFormData({...formData, skuManual: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink outline-none bg-yellow-50" required />
                ) : (
                  <select value={formData.skuId} onChange={handleSkuChange} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink outline-none bg-white" required>
                    <option value="">-- Pilih SKU --</option>
                    {skus.map(s => (
                      <option key={s.id} value={s.id}>{s.kode_sku} - {s.nama}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Harga/Pcs (Rp) *</label>
                <input type="number" placeholder="0" value={formData.hargaPerPcs} onChange={e => setFormData({...formData, hargaPerPcs: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink outline-none" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Output (Unit) *</label>
                <input type="number" placeholder="Jumlah output" value={formData.output} onChange={e => setFormData({...formData, output: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink outline-none" required />
              </div>
            </div>

            <button type="submit" disabled={isSaving} className={`w-full py-3 rounded-lg font-medium shadow-md transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-70 ${editingId ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-200' : 'bg-erp-pink hover:bg-pink-600 text-white shadow-pink-200'}`}>
              {isSaving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
              {editingId ? 'Simpan Perubahan' : 'Simpan Data Output'}
            </button>
          </form>
        </div>

        {/* RIGHT: Summary Stats */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-100">
            <TrendingUp className="text-erp-pink" size={20} />
            <div>
              <h2 className="font-bold text-gray-900">Total Output</h2>
              <p className="text-xs text-gray-500">Total keseluruhan produksi</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-pink-50 rounded-lg p-4 flex justify-between items-center border border-pink-100">
              <span className="text-sm font-medium text-gray-600">Total Output</span>
              <span className="text-lg font-bold text-erp-pink">{stats.totalOutput.toLocaleString()} unit</span>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 flex justify-between items-center border border-gray-200">
              <span className="text-sm font-medium text-gray-600">Total Hasil</span>
              <span className="text-lg font-bold text-gray-800">{formatRupiah(stats.totalHasil)}</span>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 flex justify-between items-center border border-gray-200">
              <span className="text-sm font-medium text-gray-600">Total Jenis</span>
              <span className="text-lg font-bold text-gray-800">{stats.uniqueSku} Item</span>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM: History Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col max-h-[800px]">
        <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <Package className="text-gray-700" size={20} />
            <h2 className="font-bold text-gray-900">Riwayat Output</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-200">
              <span className="text-xs text-gray-500 pl-2">Filter:</span>
              <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="bg-transparent text-xs border-none focus:ring-0 py-1 w-24" placeholder="Dari" />
              <span className="text-gray-400">-</span>
              <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="bg-transparent text-xs border-none focus:ring-0 py-1 w-24" placeholder="Sampai" />
              {(filterStartDate || filterEndDate) && (
                <button onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }} className="text-gray-400 hover:text-red-500 p-1"><X size={14} /></button>
              )}
            </div>

            <select value={filterSku} onChange={e => setFilterSku(e.target.value)} className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none">
              <option value="">Semua SKU</option>
              {skus.map(s => <option key={s.id} value={s.id}>{s.kode_sku}</option>)}
            </select>

            <button onClick={fetchData} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors" title="Refresh"><RefreshCw size={16}/></button>
          </div>
        </div>

        <div className="overflow-auto custom-scrollbar relative flex-1">
          <table className="w-full text-sm text-left relative border-collapse">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-3 bg-gray-50">Tanggal</th>
                <th className="px-6 py-3 bg-gray-50">Nama Barang / SKU</th>
                <th className="px-6 py-3 bg-gray-50">Tipe</th>
                <th className="px-6 py-3 bg-gray-50">Harga/Pcs</th>
                <th className="px-6 py-3 bg-gray-50">Output</th>
                <th className="px-6 py-3 bg-gray-50">Hasil</th>
                <th className="px-6 py-3 text-center bg-gray-50">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center"><Loader2 className="animate-spin inline text-erp-pink"/></td></tr>
              ) : filteredData.length > 0 ? (
                filteredData.map((item) => (
                  <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${editingId === item.id ? 'bg-orange-50' : ''}`}>
                    <td className="px-6 py-3 text-gray-700">{new Date(item.tanggal).toLocaleDateString('id-ID')}</td>
                    <td className="px-6 py-3">
                      {item.sku_id ? (
                        <>
                          <div className="font-medium text-gray-900">{item.master_sku?.kode_sku}</div>
                          <div className="text-xs text-gray-500">{item.master_sku?.nama}</div>
                        </>
                      ) : (
                        <div className="font-medium text-gray-900 italic">{item.sku_manual}</div>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${item.sku_id ? 'bg-blue-50 text-blue-600' : 'bg-yellow-50 text-yellow-700'}`}>
                        {item.sku_id ? 'Master SKU' : 'Manual'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{formatRupiah(item.harga_per_pcs)}</td>
                    <td className="px-6 py-3 font-bold text-gray-800">{item.output}</td>
                    <td className="px-6 py-3 font-bold text-erp-pink">{formatRupiah(item.total_hasil)}</td>
                    <td className="px-6 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => handleEdit(item)} className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors" title="Edit"><Edit2 size={16}/></button>
                        <button onClick={() => handleDelete(item.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Hapus"><Trash2 size={16}/></button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400 italic">Belum ada data output.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SQL FIX MODAL */}
      {showSqlModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-red-50">
              <h3 className="font-bold text-lg text-red-800 flex items-center gap-2">
                <Wrench size={20}/> Perbaikan Database Diperlukan
              </h3>
              <button onClick={() => setShowSqlModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 text-sm mb-4">
                Sistem mendeteksi fungsi database yang hilang (<code>calculate_gaji_borongan_garut_by_date</code>). 
                Hal ini menyebabkan gagal simpan.
                <br/><br/>
                Silakan salin kode SQL di bawah ini dan jalankan di <b>Supabase SQL Editor</b> untuk memperbaikinya.
              </p>
              
              <div className="relative">
                <textarea 
                  className="w-full h-48 p-4 text-xs font-mono bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
                  readOnly
                  value={sqlFixCode}
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

      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message} />
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message} />
      <ConfirmationModal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} onConfirm={confirmModal.onConfirm} title="Hapus Data" message="Yakin ingin menghapus data output ini?" confirmLabel="Hapus" isDangerous={true} />
    </div>
  );
};
