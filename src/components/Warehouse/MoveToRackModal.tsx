import React, { useState } from 'react';
import { X, ArrowRight, Warehouse, LayoutGrid, Package, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface MoveToRackModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any; // Data stok gudang yang dipilih
  onSuccess: () => void;
}

export const MoveToRackModal: React.FC<MoveToRackModalProps> = ({
  isOpen,
  onClose,
  item,
  onSuccess
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // KONFIGURASI: Tujuan tunggal sesuai request
  const TARGET_RACK_NAME = "Rak Display";

  if (!isOpen || !item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // 1. PINDAHKAN SEMUA: Hapus dari Stok Gudang
      const { error: deleteError } = await supabase
        .from('stok_gudang')
        .delete()
        .eq('id', item.id);

      if (deleteError) throw deleteError;

      // 2. TAMBAH ke Stok Rak (Upsert/Gabungkan)
      const { data: existingRak } = await supabase
        .from('stok_rak')
        .select('quantity')
        .match({ sku_id: item.skuId, kode_rak: TARGET_RACK_NAME })
        .maybeSingle();

      const newRakQty = (existingRak?.quantity || 0) + Number(item.quantity);

      const { error: rakError } = await supabase
        .from('stok_rak')
        .upsert({
          sku_id: item.skuId,
          kode_rak: TARGET_RACK_NAME,
          quantity: newRakQty,
          updated_at: new Date().toISOString()
        }, { onConflict: 'sku_id, kode_rak' });

      if (rakError) throw rakError;

      // 3. CATAT RIWAYAT (HISTORY) - BARU
      const asalText = `${item.location} ${item.noKarung !== '-' ? `(${item.noKarung})` : ''}`;
      
      await supabase.from('riwayat_mutasi').insert({
        sku_id: item.skuId,
        jenis_mutasi: 'Gudang ke Rak',
        lokasi_asal: asalText,
        lokasi_tujuan: TARGET_RACK_NAME,
        jumlah: Number(item.quantity),
        keterangan: 'Pemindahan stok otomatis'
      });

      onSuccess();
      onClose();

    } catch (error: any) {
      alert(`Gagal memindahkan: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        
        <div className="p-5 border-b border-gray-100 dark:border-dark-600 flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ArrowRight className="text-erp-blue-600" /> Pindah ke Rak
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          {/* Info Barang */}
          <div className="bg-gray-50 dark:bg-dark-700 p-4 rounded-lg border border-gray-200 dark:border-dark-600">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <Warehouse size={14} /> Sumber: {item.location}
            </div>
            <div className="font-bold text-gray-800 dark:text-white text-lg">{item.sku.name}</div>
            <div className="text-sm text-gray-600 flex justify-between mt-2 items-center">
              <span className="bg-white px-2 py-1 rounded border text-xs font-mono">
                {item.noKarung !== '-' ? `Karung: ${item.noKarung}` : 'Lepasan'}
              </span>
            </div>
          </div>

          <div className="flex justify-center -my-2 relative z-10">
            <div className="bg-white dark:bg-dark-800 p-2 rounded-full border border-gray-100 dark:border-dark-600 shadow-sm">
              <ArrowRight className="text-gray-400 rotate-90" size={20} />
            </div>
          </div>

          {/* Detail Pemindahan (Read Only) */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Tujuan</label>
              <div className="flex items-center gap-3 p-3 border border-erp-blue-200 bg-erp-blue-50/50 rounded-lg">
                <LayoutGrid className="text-erp-blue-600" size={20} />
                <span className="font-bold text-erp-blue-900">{TARGET_RACK_NAME}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Jumlah yang Dipindah</label>
              <div className="flex items-center gap-3 p-3 border border-green-200 bg-green-50/50 rounded-lg">
                <Package className="text-green-600" size={20} />
                <div className="flex-1 flex justify-between items-center">
                  <span className="font-bold text-green-900 text-lg">{item.quantity} {item.sku.unit}</span>
                  <span className="text-xs font-bold bg-green-200 text-green-800 px-2 py-1 rounded-full flex items-center gap-1">
                    <CheckCircle2 size={12} /> SEMUA
                  </span>
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-erp-blue-600 hover:bg-erp-blue-700 text-white rounded-xl font-semibold shadow-md flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mt-4"
          >
            {isSubmitting ? 'Memproses...' : 'Konfirmasi Pindah'} <ArrowRight size={18} />
          </button>

        </form>
      </div>
    </div>
  );
};
