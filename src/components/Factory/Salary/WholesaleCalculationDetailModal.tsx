import React from 'react';
import { X, Calculator, Clock, PieChart, ArrowRight, CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface WholesaleCalculationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any;
  dailyTotalOutput: number;
  dailyTotalBase: number;
}

export const WholesaleCalculationDetailModal: React.FC<WholesaleCalculationDetailModalProps> = ({
  isOpen,
  onClose,
  data,
  dailyTotalOutput,
  dailyTotalBase
}) => {
  if (!isOpen || !data) return null;

  const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID', { 
    style: 'currency', 
    currency: 'IDR', 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  }).format(value);

  const percentage = dailyTotalBase > 0 ? (data.gaji_dasar / dailyTotalBase) * 100 : 0;
  const isFullTime = data.jam_kerja >= 8;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 animate-fadeIn font-sans">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-blue-600 to-blue-500 text-white flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Calculator size={20} className="text-blue-200" />
              Bedah Hitungan Gaji
            </h2>
            <p className="text-blue-100 text-xs mt-1">
              {data.nama} ({data.kode}) - {new Date(data.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button onClick={onClose} className="text-blue-100 hover:text-white hover:bg-white/20 p-1 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
          
          {/* 1. DATA INPUT (SUMBER) */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <DatabaseIcon /> 1. Data Input (Sumber)
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Total Output Hari Ini</p>
                <p className="font-bold text-gray-800">{formatRupiah(dailyTotalOutput)}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 relative group cursor-help">
                <div className="flex items-center gap-1 mb-1">
                    <p className="text-xs text-gray-500">Total Gaji Dasar (Pool)</p>
                    <Info size={12} className="text-blue-400"/>
                </div>
                <p className="font-bold text-gray-800">{formatRupiah(dailyTotalBase)}</p>
                
                {/* TOOLTIP EXPLANATION */}
                <div className="absolute bottom-full left-0 w-64 bg-gray-800 text-white text-[10px] p-3 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 mb-2 leading-relaxed">
                    <p className="font-bold mb-1">Rumus Pool (Fix V2):</p>
                    {/* FIX: Menggunakan &gt; untuk menggantikan > */}
                    <p>Penjumlahan Gaji Dasar dari karyawan yang <b>AKTIF BEKERJA (Jam &gt; 0)</b>.</p>
                    <p className="mt-1 text-red-300 font-medium">*LP, Sakit, Izin, Alpha, dan input 0 jam DIKECUALIKAN dari Pool agar pembagi tidak bengkak.</p>
                </div>
              </div>
            </div>
          </div>

          {/* 2. PERHITUNGAN PORSI */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <PieChart size={14} /> 2. Faktor Pembagian
            </h3>
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-blue-800 font-medium">Gaji Dasar Karyawan</span>
                  <span className="font-bold text-blue-900">{formatRupiah(data.gaji_dasar)}</span>
                </div>
                <div className="w-full bg-blue-200 h-px mb-2"></div>
                <div className="flex justify-between items-center text-xs text-blue-600">
                  <span>Kontribusi ke Pool:</span>
                  <span className="font-bold">{percentage.toFixed(4)}%</span>
                </div>
                <p className="text-[10px] text-blue-400 mt-2 italic">
                  Rumus: (Gaji Dasar Karyawan ÷ Total Pool) x 100%
                </p>
              </div>
            </div>
          </div>

          {/* 3. HASIL & POTONGAN */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <Clock size={14} /> 3. Hasil & Potongan Jam Kerja
            </h3>
            
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Porsi Awal */}
              <div className="p-3 flex justify-between items-center bg-gray-50 border-b border-gray-100">
                <span className="text-sm text-gray-600">Porsi Awal (Jika Full 8 Jam)</span>
                <span className="font-bold text-gray-800">{formatRupiah(data.porsi_awal)}</span>
              </div>

              {/* Jam Kerja */}
              <div className="p-3 flex justify-between items-center bg-white border-b border-gray-100">
                <span className="text-sm text-gray-600 flex items-center gap-2">
                  Jam Kerja Aktual
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${isFullTime ? 'bg-green-100 text-green-700 border-green-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200'}`}>
                    {data.jam_kerja} Jam
                  </span>
                </span>
                <span className="text-xs text-gray-400">Input: "{data.kehadiran}"</span>
              </div>

              {/* Potongan */}
              {!isFullTime && (
                <div className="p-3 flex justify-between items-center bg-red-50 border-b border-red-100">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="text-red-500" />
                    <span className="text-sm text-red-700">Potongan Partial ({8 - data.jam_kerja} Jam)</span>
                  </div>
                  <span className="font-bold text-red-600">- {formatRupiah(data.sisa_potongan)}</span>
                </div>
              )}

              {/* Bonus */}
              {isFullTime && data.bonus_redistribusi > 0 && (
                <div className="p-3 flex justify-between items-center bg-green-50 border-b border-green-100">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-green-500" />
                    <span className="text-sm text-green-700">Bonus Redistribusi</span>
                  </div>
                  <span className="font-bold text-green-600">+ {formatRupiah(data.bonus_redistribusi)}</span>
                </div>
              )}

              {/* Final */}
              <div className="p-4 bg-gray-800 text-white flex justify-between items-center">
                <span className="font-bold uppercase text-sm">Gaji Final Diterima</span>
                <span className="text-xl font-bold text-green-400">{formatRupiah(data.gaji)}</span>
              </div>
            </div>
          </div>

          {!isFullTime && data.jam_kerja > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-xs text-yellow-800 flex gap-2 items-start">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <p>
                Karyawan ini bekerja <b>{data.jam_kerja} jam</b> (kurang dari 8 jam). 
                Maka gaji dipotong proporsional dan sisa potongannya dibagikan ke karyawan yang hadir Full Time sebagai bonus.
              </p>
            </div>
          )}

          {data.jam_kerja === 0 && (
             <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-xs text-red-800 flex gap-2 items-start">
               <AlertCircle size={16} className="shrink-0 mt-0.5" />
               <p>
                 <b>Jam Kerja = 0</b>. Karyawan ini tidak mendapatkan gaji borongan dan tidak dihitung dalam Pool Pembagi.
               </p>
             </div>
          )}

        </div>
      </div>
    </div>
  );
};

const DatabaseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
);
