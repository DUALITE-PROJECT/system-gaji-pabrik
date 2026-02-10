import React from 'react';
import { X, Calculator, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';

interface SalaryFormulaInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SalaryFormulaInfoModal: React.FC<SalaryFormulaInfoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn font-sans">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-blue-600 to-blue-500 text-white">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Calculator size={20} className="text-blue-200"/> 
            Rumus Perhitungan Gaji (V7)
          </h3>
          <button 
            onClick={onClose} 
            className="text-blue-100 hover:text-white p-1 rounded-full hover:bg-white/20 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 text-gray-700 text-sm">
          
          {/* Formula Utama */}
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
            <p className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-2">Total Gaji Harian</p>
            <div className="text-lg font-bold text-blue-900 flex flex-wrap justify-center gap-2 items-center">
              <span>Gapok</span> + <span>Lembur</span> + <span>Makan (Harian)</span> + <span>Hadir (Harian)</span> + <span>Bonus (Harian)</span>
            </div>
          </div>

          <div className="space-y-4">
            {/* 1. Gapok & Lembur */}
            <div className="border border-gray-200 rounded-xl p-4">
              <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                <span className="bg-gray-200 text-gray-700 w-5 h-5 rounded-full flex items-center justify-center text-xs">1</span>
                Gaji Pokok & Lembur
              </h4>
              <ul className="space-y-2 ml-2">
                <li className="flex gap-2 items-start">
                  <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0"/>
                  <div>
                    <span className="font-semibold">Hadir Full (H/1):</span> Sesuai <code>gaji_harian</code> di Master.
                  </div>
                </li>
                <li className="flex gap-2 items-start">
                  <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0"/>
                  <div>
                    <span className="font-semibold">Setengah Hari (Angka):</span> <code>(Gaji Harian / 8) × Jam Kerja</code>.
                  </div>
                </li>
                <li className="flex gap-2 items-start">
                  <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0"/>
                  <div>
                    <span className="font-semibold">Lembur:</span> <code>Jam Lembur × Tarif Lembur Master</code>.
                  </div>
                </li>
              </ul>
            </div>

            {/* 2. Tunjangan (Makan & Hadir) */}
            <div className="border border-gray-200 rounded-xl p-4">
              <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                <span className="bg-gray-200 text-gray-700 w-5 h-5 rounded-full flex items-center justify-center text-xs">2</span>
                Uang Makan & Kehadiran (Distribusi)
              </h4>
              <p className="text-xs text-gray-500 mb-3 italic">
                Nilai bulanan dibersihkan dari denda & pengurang dulu, baru dibagi ke harian.
              </p>
              
              <div className="bg-gray-50 p-3 rounded-lg space-y-2 mb-3">
                <div className="flex justify-between items-center border-b border-gray-200 pb-1">
                  <span>Nilai Master Bulanan</span>
                  <span className="font-bold">A</span>
                </div>
                <div className="flex justify-between items-center text-red-600">
                  <span>Denda Progresif (I/S/T)</span>
                  <span>- B</span>
                </div>
                <div className="flex justify-between items-center text-red-600 border-b border-gray-200 pb-1">
                  <span>Pengurang Tambahan (B/LP/TM)</span>
                  <span>- C</span>
                </div>
                <div className="flex justify-between items-center font-bold text-blue-700">
                  <span>Nilai Bersih</span>
                  <span>= A - B - C</span>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-blue-100 p-2 rounded text-blue-800 font-bold justify-center">
                <span>Nilai Harian = </span>
                <span>Nilai Bersih</span>
                <span>÷</span>
                <span>Pembagi Bulan (Config / Aktual)</span>
              </div>
            </div>

            {/* 3. Bonus */}
            <div className="border border-gray-200 rounded-xl p-4">
              <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                <span className="bg-gray-200 text-gray-700 w-5 h-5 rounded-full flex items-center justify-center text-xs">3</span>
                Bonus (Logika Prioritas)
              </h4>
              
              <div className="space-y-2">
                <div className="flex gap-2 items-start bg-red-50 p-2 rounded">
                  <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0"/>
                  <div>
                    <span className="font-bold text-red-700">HANGUS (Rp 0)</span>
                    <p className="text-xs text-red-600">Jika: Ada Keluar/Masuk, atau I/S/T &gt; 0, atau Libur Pribadi.</p>
                  </div>
                </div>
                
                <div className="flex gap-2 items-start bg-yellow-50 p-2 rounded">
                  <AlertTriangle size={16} className="text-yellow-600 mt-0.5 shrink-0"/>
                  <div>
                    <span className="font-bold text-yellow-700">DIPOTONG</span>
                    <p className="text-xs text-yellow-600">Jika: Libur Perusahaan (LP).</p>
                    <ul className="text-xs list-disc ml-4 mt-1 text-yellow-700">
                      <li>Borongan: Master ÷ 8</li>
                      <li>Staff: Master ÷ 2</li>
                    </ul>
                  </div>
                </div>

                <div className="flex gap-2 items-start bg-green-50 p-2 rounded">
                  <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0"/>
                  <div>
                    <span className="font-bold text-green-700">NORMAL</span>
                    <p className="text-xs text-green-600">Jika hadir full tanpa pelanggaran.</p>
                    <ul className="text-xs list-disc ml-4 mt-1 text-green-700">
                      <li>Borongan: Master ÷ 4</li>
                      <li>Staff: Master Full</li>
                    </ul>
                  </div>
                </div>
                
                <p className="text-xs text-gray-500 mt-2 text-center">
                  *Nilai akhir bonus juga <b>dibagi Pembagi Bulan</b> agar menjadi harian.
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button 
            onClick={onClose}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-sm hover:bg-blue-700 transition-colors"
          >
            Mengerti
          </button>
        </div>
      </div>
    </div>
  );
};
