import React, { useState, useEffect } from 'react';
import { X, Loader2, User, Calendar, Wallet, Building2, AlertCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface BiayaGajiDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: {
    bulan: string;
    perusahaan: string;
    bagian: string; // Ini akan dicocokkan dengan 'divisi' di tabel gaji
    sku: string;
  };
}

export const BiayaGajiDetailModal: React.FC<BiayaGajiDetailModalProps> = ({
  isOpen,
  onClose,
  filters
}) => {
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalGaji, setTotalGaji] = useState(0);

  const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  useEffect(() => {
    if (isOpen && filters.bulan) {
      fetchDetails();
    }
  }, [isOpen, filters]);

  const fetchDetails = async () => {
    setIsLoading(true);
    setItems([]);
    setTotalGaji(0);

    try {
      // Sumber Data:
      // 1. rekap_gaji_harian (Gabungan Harian & Borongan) - Data per hari
      // 2. laporan_bulanan_staff_pabrik (Staff) - Data per bulan

      const bulanFilter = filters.bulan;
      const ptFilter = filters.perusahaan;
      const divisiFilter = filters.bagian; // Di Biaya Output, 'Bagian' = 'Divisi' di Gaji

      const promises = [
        // 1. Fetch dari Rekap Gaji Harian
        supabase
          .from('rekap_gaji_harian')
          .select('nama, kode, total_gaji, divisi, perusahaan')
          .eq('bulan', bulanFilter)
          .ilike('perusahaan', ptFilter)
          .ilike('divisi', divisiFilter),

        // 2. Fetch Gaji Staff
        supabase
          .from('laporan_bulanan_staff_pabrik')
          .select('nama, kode, hasil_gaji, divisi, perusahaan')
          .eq('bulan', bulanFilter)
          .ilike('perusahaan', ptFilter)
          .ilike('divisi', divisiFilter)
      ];

      const [resRekap, resStaff] = await Promise.all(promises);

      // --- AGREGASI DATA PER KODE KARYAWAN ---
      const aggregation: Record<string, {
        nama: string;
        kode: string;
        tipe: string;
        nominal: number;
        perusahaan: string;
      }> = {};

      // Helper untuk update/insert ke aggregation map
      const upsertAggregation = (kode: string, nama: string, nominal: number, tipe: string, perusahaan: string) => {
        if (!kode) return;
        
        if (!aggregation[kode]) {
          aggregation[kode] = {
            nama: nama || 'Tanpa Nama',
            kode: kode,
            tipe: tipe,
            nominal: 0,
            perusahaan: perusahaan
          };
        }
        
        // Tambahkan nominal
        aggregation[kode].nominal += nominal;
        
        // Update nama jika sebelumnya 'Tanpa Nama' dan sekarang ada namanya
        if (aggregation[kode].nama === 'Tanpa Nama' && nama) {
            aggregation[kode].nama = nama;
        }
      };

      // Process Rekap (Harian & Borongan)
      if (resRekap.data) {
        resRekap.data.forEach((item: any) => {
          const nominal = Number(item.total_gaji || 0);
          
          // Tentukan Tipe berdasarkan Perusahaan
          let tipe = 'Harian';
          if ((item.perusahaan || '').toUpperCase().includes('BORONGAN')) {
              tipe = 'Borongan';
          }

          upsertAggregation(item.kode, item.nama, nominal, tipe, item.perusahaan);
        });
      }

      // Process Staff
      if (resStaff.data) {
        resStaff.data.forEach((item: any) => {
          const nominal = Number(item.hasil_gaji || 0);
          upsertAggregation(item.kode, item.nama, nominal, 'Staff', item.perusahaan);
        });
      }

      // Convert Map to Array & Calculate Total
      let combinedItems = Object.values(aggregation);
      let grandTotal = combinedItems.reduce((sum, item) => sum + item.nominal, 0);

      // Sort by Name
      combinedItems.sort((a, b) => a.nama.localeCompare(b.nama));

      setItems(combinedItems);
      setTotalGaji(grandTotal);

    } catch (error) {
      console.error("Error fetching details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-start bg-gradient-to-r from-blue-600 to-blue-500 text-white">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Wallet size={20} className="text-blue-200"/> 
              Rincian Gaji Divisi
            </h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-blue-100 opacity-90">
              <span className="flex items-center gap-1"><Calendar size={12}/> {filters.bulan}</span>
              <span className="flex items-center gap-1"><Building2 size={12}/> {filters.perusahaan}</span>
              <span className="flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded text-white font-medium uppercase">{filters.bagian}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-blue-100 hover:text-white p-1 rounded-full hover:bg-white/20 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Summary */}
        <div className="p-4 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
            <div className="text-sm text-blue-800">
                Total Gaji Terhitung ({items.length} Karyawan):
            </div>
            <div className="text-2xl font-bold text-blue-700">
                {formatRupiah(totalGaji)}
            </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-0 bg-gray-50 custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Loader2 className="animate-spin mb-2 text-blue-500" size={32}/>
              <p>Mengambil dan menjumlahkan data gaji...</p>
            </div>
          ) : items.length > 0 ? (
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-gray-100 text-gray-600 font-semibold sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 border-b border-gray-200 w-12 text-center">No</th>
                  <th className="px-4 py-3 border-b border-gray-200">Nama Karyawan</th>
                  <th className="px-4 py-3 border-b border-gray-200">Kode</th>
                  <th className="px-4 py-3 border-b border-gray-200 text-center">Tipe Gaji</th>
                  <th className="px-4 py-3 border-b border-gray-200 text-right">Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {items.map((item, idx) => (
                  <tr key={item.kode} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-4 py-2.5 text-center text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800 flex items-center gap-2">
                        <User size={14} className="text-gray-400"/>
                        {item.nama}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{item.kode}</td>
                    <td className="px-4 py-2.5 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                            item.tipe === 'Borongan' ? 'bg-orange-50 text-orange-700 border-orange-100' : 
                            item.tipe === 'Staff' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                            'bg-green-50 text-green-700 border-green-100'
                        }`}>
                            {item.tipe}
                        </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-700">{formatRupiah(item.nominal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-gray-400 italic flex flex-col items-center gap-2">
              <AlertCircle size={32} className="text-gray-300"/>
              <p>Tidak ada data gaji yang ditemukan untuk bagian ini.</p>
              <p className="text-xs">Pastikan nama Bagian di Output sama dengan Divisi di Gaji.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-white text-right">
          <button onClick={onClose} className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors text-sm">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
