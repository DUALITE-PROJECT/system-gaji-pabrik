import React, { useState, useEffect } from 'react';
import { X, User, DollarSign, Clock, Calendar, PieChart, Loader2, Info } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface WholesaleRecapDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: any;
  dailyData: any[];
}

export const WholesaleRecapDetailModal: React.FC<WholesaleRecapDetailModalProps> = ({
  isOpen,
  onClose,
  employee,
  dailyData
}) => {
  const [poolTotal, setPoolTotal] = useState(0);
  const [loadingPool, setLoadingPool] = useState(false);

  useEffect(() => {
    if (isOpen && employee) {
      fetchPoolTotal();
    }
  }, [isOpen, employee]);

  const fetchPoolTotal = async () => {
    setLoadingPool(true);
    try {
      // Fetch hanya kolom gaji untuk menghitung total pool periode ini
      const { data, error } = await supabase
        .from('data_gaji_borongan_pabrik_garut')
        .select('gaji')
        .eq('bulan', employee.bulan)
        .eq('periode', employee.periode);

      if (error) throw error;

      // Hitung total pool
      const total = data?.reduce((sum, item) => sum + (Number(item.gaji) || 0), 0) || 0;
      setPoolTotal(total);
    } catch (err) {
      console.error("Error fetching pool total:", err);
    } finally {
      setLoadingPool(false);
    }
  };

  if (!isOpen || !employee) return null;

  const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const totalGaji = dailyData.reduce((acc, curr) => acc + (Number(curr.gaji) || 0), 0);
  const totalBonus = dailyData.reduce((acc, curr) => acc + (Number(curr.bonus) || 0), 0);
  
  // Hitung Persentase Kontribusi
  const contributionPercentage = poolTotal > 0 ? (totalGaji / poolTotal) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn font-sans">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-start bg-gradient-to-r from-blue-600 to-blue-500 text-white">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <User size={20} className="text-blue-200"/>
              Rincian Gaji Borongan
            </h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-blue-100 opacity-90">
              <span className="flex items-center gap-1"><User size={12}/> {employee.nama} ({employee.kode})</span>
              <span className="flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded text-white font-medium">{employee.periode} - {employee.bulan}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-blue-100 hover:text-white p-1 rounded-full hover:bg-white/20 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-4 space-y-4 bg-gray-50">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase font-bold flex items-center gap-1 mb-1"><DollarSign size={14}/> Total Upah</p>
                    <p className="text-2xl font-bold text-blue-600">{formatRupiah(totalGaji)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-purple-100 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase font-bold flex items-center gap-1 mb-1"><DollarSign size={14}/> Total Bonus</p>
                    <p className="text-2xl font-bold text-purple-600">{formatRupiah(totalBonus)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase font-bold flex items-center gap-1 mb-1"><DollarSign size={14}/> Total Diterima</p>
                    <p className="text-2xl font-bold text-green-600">{formatRupiah(totalGaji + totalBonus)}</p>
                </div>
            </div>

            {/* Contribution Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-full">
                        <PieChart size={18} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-blue-800">Kontribusi ke Total Borongan ({employee.periode})</p>
                        <p className="text-xs text-blue-600">
                            {loadingPool ? 'Menghitung...' : `Dari Total Pool: ${formatRupiah(poolTotal)}`}
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    {loadingPool ? (
                        <Loader2 className="animate-spin text-blue-500" size={20}/>
                    ) : (
                        <span className="text-xl font-bold text-blue-700">{contributionPercentage.toFixed(4)}%</span>
                    )}
                </div>
            </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto p-0 bg-white custom-scrollbar border-t border-gray-200">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-gray-50 text-gray-600 font-semibold sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3 border-b border-gray-200">Tanggal</th>
                <th className="px-4 py-3 border-b border-gray-200 text-center">Kehadiran</th>
                <th className="px-4 py-3 border-b border-gray-200 text-center">Jam Kerja</th>
                <th className="px-4 py-3 border-b border-gray-200 text-right">Upah Harian</th>
                <th className="px-4 py-3 border-b border-gray-200 text-right">Bonus</th>
                <th className="px-4 py-3 border-b border-gray-200">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dailyData.length > 0 ? (
                dailyData.map((item, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap font-medium">
                        <div className="flex items-center gap-2">
                            <Calendar size={14} className="text-gray-400"/>
                            {formatDate(item.tanggal)}
                        </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            ['H','1','HADIR','FULL'].includes(String(item.kehadiran).toUpperCase()) ? 'bg-green-100 text-green-700' : 
                            ['S','I','A'].includes(String(item.kehadiran).toUpperCase()) ? 'bg-red-100 text-red-700' : 
                            ['0.5','SETENGAH'].includes(String(item.kehadiran).toUpperCase()) ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-600'
                        }`}>
                            {item.kehadiran}
                        </span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-gray-600 font-mono">
                        {item.jam_kerja > 0 ? (
                            <span className="flex items-center justify-center gap-1">
                                <Clock size={12} className="text-blue-400"/> {item.jam_kerja}
                            </span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-blue-700">
                        {formatRupiah(item.gaji)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-purple-700">
                        {formatRupiah(item.bonus)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs italic">
                        {item.keterangan || '-'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400 italic">Tidak ada data harian.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 text-right">
          <button onClick={onClose} className="px-6 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg font-medium transition-colors text-sm shadow-sm">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
