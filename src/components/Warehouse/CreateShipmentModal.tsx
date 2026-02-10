import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Save, RefreshCw, Calendar, ChevronDown, Search, Check, AlertCircle } from 'lucide-react';
import { Shipment } from '../../types';
import { supabase } from '../../lib/supabase';

interface CreateShipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Shipment> & { noKarung?: string }) => void;
  type: Shipment['type'];
  title: string;
}

export const CreateShipmentModal: React.FC<CreateShipmentModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  type,
  title
}) => {
  // Helper untuk generate PO Batch Otomatis
  const generateBatchPO = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    if (type === 'outbound') {
        return `INV-${year}${month}${day}-${hours}${minutes}${seconds}`; // Invoice Penjualan
    }
    return `PO-BATCH-${year}${month}${day}-${hours}${minutes}${seconds}`;
  };

  const [formData, setFormData] = useState({
    referenceNo: '',
    // Use local date string to avoid timezone issues (UTC vs Local)
    date: new Date().toLocaleDateString('en-CA'), // YYYY-MM-DD format
    source: type === 'outbound' ? 'Gudang (Rak Display)' : 'AULIA', 
    destination: type === 'outbound' ? 'Customer Umum' : 'Gudang Utama',
    notes: '',
    noKarung: '' 
  });

  const [singleItem, setSingleItem] = useState({ skuId: '', qty: 0 });
  
  // State untuk Fitur Pencarian SKU
  const [skuOptions, setSkuOptions] = useState<any[]>([]);
  const [isSkuDropdownOpen, setIsSkuDropdownOpen] = useState(false);
  const [skuSearchTerm, setSkuSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // State untuk Stok Rak (Khusus Outbound)
  const [rackStocks, setRackStocks] = useState<Record<string, number>>({});

  // Tutup dropdown jika klik di luar
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSkuDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // State untuk tipe lain (Multiple Items)
  const [items, setItems] = useState<{ skuId: string; qty: number }[]>([
    { skuId: '', qty: 0 }
  ]);

  useEffect(() => {
    if (isOpen) {
      const fetchSKUsAndStock = async () => {
        // 1. Ambil Master SKU
        const { data: skus } = await supabase.from('master_sku').select('id, kode_sku, nama');
        if (skus) setSkuOptions(skus);

        // 2. Jika Outbound (Penjualan), Ambil Stok Rak
        if (type === 'outbound') {
            const { data: stocks } = await supabase
                .from('stok_rak')
                .select('sku_id, quantity')
                .eq('kode_rak', 'Rak Display'); // Hardcode sesuai request sebelumnya
            
            const stockMap: Record<string, number> = {};
            stocks?.forEach((s: any) => {
                stockMap[s.sku_id] = Number(s.quantity);
            });
            setRackStocks(stockMap);
        }
      };
      fetchSKUsAndStock();

      // Reset Form & Generate Kode Otomatis
      if (type === 'factory_outbound' || type === 'outbound') {
        const autoCode = generateBatchPO(); 
        setFormData({
          referenceNo: autoCode, 
          date: new Date().toLocaleDateString('en-CA'), // YYYY-MM-DD Local
          source: type === 'outbound' ? 'Rak Display' : 'AULIA',
          destination: type === 'outbound' ? 'Customer' : 'Gudang Utama',
          notes: '',
          noKarung: ''
        });
        setSingleItem({ skuId: '', qty: 0 });
        setItems([{ skuId: '', qty: 0 }]);
        setSkuSearchTerm('');
      } else {
        setFormData(prev => ({ ...prev, referenceNo: '' }));
      }
    }
  }, [isOpen, type]);

  if (!isOpen) return null;

  // --- Logic untuk Tipe Lain (Multiple Items) ---
  const handleAddItem = () => setItems([...items, { skuId: '', qty: 0 }]);
  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };
  const handleItemChange = (index: number, field: 'skuId' | 'qty', value: string | number) => {
    const newItems = [...items];
    // @ts-ignore
    newItems[index][field] = value;
    setItems(newItems);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalItems;

    if (type === 'factory_outbound') {
      if (!singleItem.skuId || singleItem.qty <= 0) {
        alert("Mohon pilih SKU dan isi Quantity dengan benar.");
        return;
      }
      const sku = skuOptions.find(s => s.id === singleItem.skuId);
      finalItems = [{
        skuId: singleItem.skuId,
        skuName: sku ? sku.nama : 'Unknown Item',
        qty: Number(singleItem.qty)
      }];
    } else {
      // Validasi Stok Rak untuk Outbound
      if (type === 'outbound') {
        for (const item of items) {
            const available = rackStocks[item.skuId] || 0;
            if (item.qty > available) {
                const sku = skuOptions.find(s => s.id === item.skuId);
                alert(`Stok tidak cukup untuk ${sku?.nama || 'Item'}. Tersedia: ${available}, Diminta: ${item.qty}`);
                return;
            }
        }
      }

      finalItems = items.map(item => {
        const sku = skuOptions.find(s => s.id === item.skuId);
        return {
          skuId: item.skuId,
          skuName: sku ? sku.nama : 'Unknown Item',
          qty: Number(item.qty)
        };
      }).filter(item => item.skuId && item.qty > 0);
    }

    if (finalItems.length === 0) {
        alert("Mohon isi minimal satu barang.");
        return;
    }

    onSubmit({
      ...formData,
      type,
      status: type === 'outbound' ? 'Selesai' : 'pending', // Outbound penjualan langsung selesai
      items: finalItems,
      noKarung: formData.noKarung 
    });
    
    onClose();
  };

  // Filter SKU berdasarkan pencarian
  const filteredSkus = skuOptions.filter(s => 
    s.nama.toLowerCase().includes(skuSearchTerm.toLowerCase()) ||
    s.kode_sku.toLowerCase().includes(skuSearchTerm.toLowerCase())
  );

  // --- RENDER KHUSUS OUTBOUND PABRIK ---
  if (type === 'factory_outbound') {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 font-sans">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fadeIn">
            <div className="p-6 pb-2 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Tambah Pengiriman dari Pabrik</h2>
                <p className="text-gray-500 text-sm mt-1">Masukkan detail pengiriman barang dari pabrik.</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
               <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1.5">Tanggal</label>
                <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full px-4 py-3 bg-pink-50 border border-pink-100 rounded-xl text-gray-700 focus:ring-2 focus:ring-pink-200 outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1.5">No. Karung</label>
                <input required type="text" value={formData.noKarung} onChange={e => setFormData({...formData, noKarung: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-erp-blue-600 focus:bg-white outline-none transition-all" placeholder="K1, K2..." />
              </div>
              <div ref={dropdownRef}>
                <label className="block text-sm font-semibold text-gray-900 mb-1.5">SKU</label>
                <div className="relative">
                  <div onClick={() => setIsSkuDropdownOpen(!isSkuDropdownOpen)} className="w-full px-4 py-3 border rounded-xl text-gray-900 outline-none transition-all cursor-pointer flex justify-between items-center bg-gray-50 border-gray-200 hover:bg-white">
                    <span className={singleItem.skuId ? "text-gray-900 font-medium" : "text-gray-400"}>{singleItem.skuId ? skuOptions.find(s => s.id === singleItem.skuId)?.nama : 'Pilih SKU Barang'}</span>
                    <ChevronDown size={20} className="text-gray-400" />
                  </div>
                  {isSkuDropdownOpen && (
                    <div className="absolute z-20 w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-xl max-h-64 overflow-hidden flex flex-col animate-fadeIn">
                      <div className="p-3 border-b border-gray-50 bg-gray-50 sticky top-0"><input type="text" autoFocus placeholder="Cari..." value={skuSearchTerm} onChange={(e) => setSkuSearchTerm(e.target.value)} className="w-full pl-3 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-erp-blue-100 text-gray-900" /></div>
                      <div className="overflow-y-auto flex-1 p-1 custom-scrollbar">
                        {filteredSkus.map(sku => (
                          <div key={sku.id} onClick={() => { setSingleItem({ ...singleItem, skuId: sku.id }); setIsSkuDropdownOpen(false); setSkuSearchTerm(''); }} className="px-4 py-3 rounded-lg cursor-pointer hover:bg-gray-50">
                            <div className="font-medium text-gray-900">{sku.nama}</div>
                            <div className="text-xs text-gray-500 font-mono">{sku.kode_sku}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1.5">Quantity</label>
                <input required type="number" min="1" value={singleItem.qty} onChange={e => setSingleItem({...singleItem, qty: Number(e.target.value)})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-erp-blue-600 focus:bg-white outline-none transition-all" />
              </div>
              <div className="flex gap-3 pt-4 mt-2">
                <button type="button" onClick={onClose} className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors">Batal</button>
                <button type="submit" className="flex-1 py-3 bg-[#0D47A1] hover:bg-blue-900 text-white rounded-xl font-semibold shadow-lg shadow-blue-900/20 transition-colors">Simpan</button>
              </div>
            </form>
          </div>
        </div>
    );
  }

  // --- RENDER DEFAULT (INBOUND / OUTBOUND / RETURN) ---
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-dark-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-dark-600 sticky top-0 bg-white dark:bg-dark-800 z-10">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {type === 'outbound' ? 'Input Penjualan (Outbound)' : `Input ${title} Baru`}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {type === 'outbound' && (
             <div className="bg-blue-50 text-blue-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle size={18} />
                <span>Stok akan otomatis dikurangi dari <strong>Rak Display</strong>.</span>
             </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No. Invoice / Referensi</label>
              <input
                required
                type="text"
                value={formData.referenceNo}
                onChange={e => setFormData({...formData, referenceNo: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-gray-100 dark:bg-dark-700 text-gray-500 dark:text-white cursor-not-allowed"
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tanggal</label>
              <input
                required
                type="date"
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-erp-blue-600 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sumber</label>
              <input
                required
                type="text"
                value={formData.source}
                readOnly={type === 'outbound'}
                onChange={e => setFormData({...formData, source: e.target.value})}
                className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-erp-blue-600 outline-none ${type === 'outbound' ? 'bg-gray-100 text-gray-500' : 'bg-white'}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tujuan / Customer</label>
              <input
                required
                type="text"
                value={formData.destination}
                onChange={e => setFormData({...formData, destination: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-erp-blue-600 outline-none"
                placeholder={type === 'outbound' ? 'Nama Customer' : 'Tujuan'}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Daftar Barang Terjual</label>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-sm text-erp-blue-600 hover:text-erp-blue-800 font-medium flex items-center gap-1"
              >
                <Plus size={16} /> Tambah Baris
              </button>
            </div>
            
            <div className="space-y-3 bg-gray-50 dark:bg-dark-700 p-4 rounded-xl max-h-60 overflow-y-auto custom-scrollbar">
              {items.map((item, index) => {
                const availableStock = rackStocks[item.skuId] || 0;
                return (
                  <div key={index} className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Pilih Barang</label>
                      <select
                        required
                        value={item.skuId}
                        onChange={e => handleItemChange(index, 'skuId', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-erp-blue-600 outline-none text-sm"
                      >
                        <option value="">-- Pilih Barang --</option>
                        {skuOptions.map(sku => (
                          <option key={sku.id} value={sku.id}>
                            {sku.kode_sku} - {sku.nama} 
                            {type === 'outbound' ? ` (Stok: ${rackStocks[sku.id] || 0})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="block text-xs text-gray-500 mb-1">Qty</label>
                      <input
                        required
                        type="number"
                        min="1"
                        max={type === 'outbound' ? availableStock : undefined}
                        value={item.qty}
                        onChange={e => handleItemChange(index, 'qty', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-erp-blue-600 outline-none text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors mb-[1px]"
                      disabled={items.length === 1}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-dark-600">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-erp-blue-900 hover:bg-erp-blue-800 text-white rounded-lg shadow-sm flex items-center gap-2 transition-colors"
            >
              <Save size={18} /> {type === 'outbound' ? 'Proses Penjualan' : 'Simpan Data'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
