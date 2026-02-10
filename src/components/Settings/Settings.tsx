import React, { useState } from 'react';
import { Trash2, AlertTriangle, Database, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ConfirmationModal } from '../Warehouse/ConfirmationModal';

export const Settings: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: ''
  });

  const handleResetData = async () => {
    setIsLoading(true);
    try {
      // URUTAN PENGHAPUSAN PENTING:
      // 1. Hapus tabel detail/items terlebih dahulu (Child)
      // 2. Hapus tabel header/transaksi utama (Parent)
      // 3. Hapus tabel stok dan riwayat

      // A. Hapus Detail Transaksi (Items)
      await supabase.from('outbound_pabrik_items').delete().neq('id', 0);
      await supabase.from('outbound_items').delete().neq('id', 0);
      await supabase.from('retur_items').delete().neq('id', 0);
      
      // UPDATE: Hapus tabel baru stock_opname_gudang
      await supabase.from('stock_opname_gudang').delete().neq('id', 0);
      // Hapus juga tabel lama jika masih ada
      await supabase.from('stock_opname_items').delete().neq('id', 0);

      // B. Hapus Header Transaksi
      await supabase.from('outbound_pabrik').delete().neq('id', 0); 
      await supabase.from('outbound').delete().neq('id', 0);
      await supabase.from('retur').delete().neq('id', 0);
      await supabase.from('stock_opname').delete().neq('id', 0);

      // C. Hapus Stok & Riwayat
      await supabase.from('riwayat_mutasi').delete().neq('id', 0); 
      await supabase.from('stok_gudang').delete().neq('id', 0);
      await supabase.from('stok_rak').delete().neq('id', 0);

      alert('Berhasil! Semua data transaksi, stok, dan riwayat telah dibersihkan. Master SKU tetap aman.');
      window.location.reload();
    } catch (error: any) {
      console.error('Reset error:', error);
      alert(`Gagal mereset data: ${error.message}`);
    } finally {
      setIsLoading(false);
      setConfirmModal({ isOpen: false, title: '', message: '' });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Pengaturan Sistem</h1>
        <p className="text-gray-500">Kelola konfigurasi aplikasi dan manajemen data.</p>
      </div>

      {/* Card Reset Data */}
      <div className="bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-red-100 dark:border-red-900/30 overflow-hidden">
        <div className="p-6 border-b border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 flex items-center gap-3">
          <div className="p-2 bg-red-100 text-red-600 rounded-lg">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-red-700 dark:text-red-400">Zona Bahaya (Data Management)</h3>
            <p className="text-sm text-red-600/80 dark:text-red-400/80">Tindakan di sini tidak dapat dibatalkan.</p>
          </div>
        </div>
        
        <div className="p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2">
              <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Database size={18} className="text-gray-500" />
                Reset Data Transaksi & Stok
              </h4>
              <div className="text-sm text-gray-500 leading-relaxed max-w-xl">
                Fitur ini akan <strong>MENGHAPUS SEMUA</strong> data berikut:
                <ul className="list-disc list-inside mt-1 ml-1 space-y-0.5 text-gray-600 dark:text-gray-400">
                  <li>Stok Gudang & Stok Rak</li>
                  <li>Riwayat Mutasi & Perpindahan Barang</li>
                  <li>Riwayat Outbound Pabrik (Pengiriman & Inbound)</li>
                  <li>Riwayat Penjualan (Outbound) & Retur</li>
                  <li>Data Stock Opname (Audit)</li>
                </ul>
                <span className="block mt-3 font-medium text-green-600 flex items-center gap-1">
                  <CheckCircle2 size={16} /> Master Data SKU TIDAK akan dihapus.
                </span>
              </div>
            </div>

            <button 
              onClick={() => setConfirmModal({
                isOpen: true,
                title: 'Reset Database?',
                message: 'Apakah Anda yakin ingin menghapus SELURUH data transaksi, stok, dan riwayat? Tindakan ini tidak bisa dibatalkan. Pastikan tidak ada orang lain yang sedang menginput data.'
              })}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl font-medium shadow-lg shadow-red-600/20 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Trash2 size={20} />}
              {isLoading ? 'Sedang Menghapus...' : 'Reset Data Sekarang'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={handleResetData}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel="Ya, Hapus Semuanya"
        isDangerous={true}
      />
    </div>
  );
};
