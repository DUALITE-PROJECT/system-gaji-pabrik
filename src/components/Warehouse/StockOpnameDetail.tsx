import React, { useState, useEffect } from 'react';
import { X, Save, Search, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface StockOpnameDetailProps {
  isOpen: boolean;
  onClose: () => void;
  session: any;
  onUpdate: () => void;
}

export const StockOpnameDetail: React.FC<StockOpnameDetailProps> = ({
  isOpen,
  onClose,
  session,
  onUpdate
}) => {
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [edits, setEdits] = useState<Record<string, number>>({});

  useEffect(() => {
    if (isOpen && session) {
      fetchItems();
      setEdits({});
    }
  }, [isOpen, session]);

  const fetchItems = async () => {
    setIsLoading(true);
    try {
      // UPDATE: Menggunakan tabel 'stock_opname_gudang'
      const { data, error } = await supabase
        .from('stock_opname_gudang')
        .select(`
          *,
          master_sku (kode_sku, nama, satuan, kategori)
        `)
        .eq('stock_opname_id', session.id)
        .order('id', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error("Error fetching SO items:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQtyChange = (id: string, val: string) => {
    const numVal = val === '' ? 0 : Number(val);
    setEdits(prev => ({ ...prev, [id]: numVal }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updates = Object.entries(edits).map(async ([id, newQtyFisik]) => {
        const originalItem = items.find(i => i.id === id);
        
        // UPDATE: Menggunakan kolom 'qty_sistem'
        const systemQty = Number(originalItem?.qty_sistem ?? 0);
        const newSelisih = newQtyFisik - systemQty;
        const status = newSelisih === 0 ? 'Sesuai' : 'Selisih';

        return supabase
          .from('stock_opname_gudang')
          .update({ 
            qty_fisik: newQtyFisik,
            selisih: newSelisih,
            status: status
          })
          .eq('id', id);
      });
      
      await Promise.all(updates);
      
      alert("Data perhitungan fisik berhasil disimpan!");
      await fetchItems();
      setEdits({});
      onUpdate();
    } catch (error: any) {
      alert(`Gagal menyimpan: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinishSession = async () => {
    if (!window.confirm("Apakah Anda yakin ingin menyelesaikan sesi Stock Opname ini?")) return;
    
    setIsSaving(true);
    try {
      await supabase.from('stock_opname').update({ status: 'Selesai' }).eq('id', session.id);
      alert("Sesi Stock Opname Selesai.");
      onClose();
      onUpdate();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !session) return null;

  const filteredItems = items.filter(item => 
    (item.master_sku?.nama || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.master_sku?.kode_sku || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.no_karung && item.no_karung.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Hitung Statistik Real-time
  const totalSistem = items.reduce((acc, curr) => acc + Number(curr.qty_sistem || 0), 0);

  const totalFisik = items.reduce((acc, curr) => {
    const fisik = edits[curr.id] !== undefined ? edits[curr.id] : Number(curr.qty_fisik || 0);
    return acc + fisik;
  }, 0);
  const totalSelisih = totalFisik - totalSistem;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-dark-600 flex justify-between items-start bg-white dark:bg-dark-800">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Input Hasil Perhitungan Fisik
              </h2>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 uppercase tracking-wider">
                {session.nomor_so}
              </span>
            </div>
            <p className="text-sm text-gray-500">Tanggal Audit: {session.tanggal}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2">
            <X size={24} />
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-dark-900 border-b border-gray-200 dark:border-dark-700">
          <div className="text-center border-r border-gray-200 dark:border-dark-700">
            <p className="text-xs text-gray-500 uppercase">Total Sistem</p>
            <p className="text-xl font-bold text-gray-700">{totalSistem.toLocaleString()}</p>
          </div>
          <div className="text-center border-r border-gray-200 dark:border-dark-700">
            <p className="text-xs text-gray-500 uppercase">Total Fisik (Input)</p>
            <p className="text-xl font-bold text-blue-600">{totalFisik.toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase">Discrepancy (Selisih)</p>
            <p className={`text-xl font-bold ${totalSelisih === 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totalSelisih > 0 ? '+' : ''}{totalSelisih.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="p-4 bg-white dark:bg-dark-800 border-b border-gray-100 flex justify-between items-center">
          <div className="relative w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari SKU atau No. Karung..." 
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-erp-blue-500"
            />
          </div>
          {Object.keys(edits).length > 0 && (
            <div className="text-sm text-orange-600 font-medium animate-pulse">
              Ada {Object.keys(edits).length} perubahan belum disimpan!
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto p-0 bg-gray-50 dark:bg-dark-900">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 dark:bg-dark-700 text-gray-600 font-medium sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3">Lokasi / Karung</th>
                <th className="px-4 py-3">SKU & Nama Barang</th>
                <th className="px-4 py-3 text-center">Stok Sistem</th>
                <th className="px-4 py-3 text-center w-32">Stok Fisik</th>
                <th className="px-4 py-3 text-center">Selisih</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-dark-600 bg-white dark:bg-dark-800">
              {isLoading ? (
                <tr><td colSpan={6} className="p-8 text-center">Memuat data...</td></tr>
              ) : filteredItems.length > 0 ? (
                filteredItems.map(item => {
                  const currentFisik = edits[item.id] !== undefined ? edits[item.id] : Number(item.qty_fisik || 0);
                  
                  // UPDATE: Menggunakan 'qty_sistem'
                  const sysQty = Number(item.qty_sistem || 0);
                  const locationVal = item.lokasi || '-';

                  const selisih = currentFisik - sysQty;
                  const isEdited = edits[item.id] !== undefined;

                  return (
                    <tr key={item.id} className={`hover:bg-gray-50 ${isEdited ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-700">{locationVal}</div>
                        <div className="text-xs text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded w-fit mt-1">
                          {item.no_karung || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-gray-900">{item.master_sku?.kode_sku}</div>
                        <div className="text-gray-600">{item.master_sku?.nama}</div>
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-gray-600">
                        {sysQty}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input 
                          type="number" 
                          min="0"
                          value={currentFisik}
                          onChange={(e) => handleQtyChange(item.id, e.target.value)}
                          className={`w-full px-2 py-1.5 text-center border rounded font-bold focus:outline-none focus:ring-2 ${
                            selisih !== 0 
                              ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-200' 
                              : 'border-green-300 bg-green-50 text-green-700 focus:ring-green-200'
                          }`}
                        />
                      </td>
                      <td className="px-4 py-3 text-center font-bold">
                        <span className={`${selisih === 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {selisih > 0 ? '+' : ''}{selisih}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {selisih === 0 ? (
                          <CheckCircle2 size={18} className="text-green-500 mx-auto" />
                        ) : (
                          <AlertTriangle size={18} className="text-red-500 mx-auto" />
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan={6} className="p-8 text-center text-gray-400">Tidak ada item dalam sesi ini.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-dark-600 bg-white dark:bg-dark-800 flex justify-between items-center">
          <div className="text-sm text-gray-500 italic">
            *Simpan perubahan sebelum menutup atau menyelesaikan sesi.
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">
              Tutup
            </button>
            <button 
              onClick={handleSave} 
              disabled={isSaving || Object.keys(edits).length === 0} 
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={18} /> Simpan Perubahan
            </button>
            <button 
              onClick={handleFinishSession} 
              disabled={isSaving} 
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-sm flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 size={18} /> Selesai & Finalisasi
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
