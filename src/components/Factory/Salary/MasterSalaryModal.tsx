import React, { useState, useEffect } from 'react';
import { X, Save, Calculator } from 'lucide-react';

interface MasterSalaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  initialData?: any;
  isLoading: boolean;
}

export const MasterSalaryModal: React.FC<MasterSalaryModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading
}) => {
  const [formData, setFormData] = useState({
    bulan: '',
    grade: '',
    gaji_pokok: 0,
    gaji_harian: 0,
    gaji_setengah_hari: 0,
    gaji_per_jam: 0,
    lembur: 0,
    uang_makan: 0,
    uang_kehadiran: 0,
    bonus: 0,
    uang_makan_harian: 0,
    uang_kehadiran_harian: 0
  });

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData(initialData);
      } else {
        // Reset form untuk data baru
        const today = new Date();
        const monthYear = today.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        
        setFormData({
          bulan: monthYear,
          grade: '',
          gaji_pokok: 0,
          gaji_harian: 0,
          gaji_setengah_hari: 0,
          gaji_per_jam: 0,
          lembur: 0,
          uang_makan: 0,
          uang_kehadiran: 0,
          bonus: 0,
          uang_makan_harian: 0,
          uang_kehadiran_harian: 0
        });
      }
    }
  }, [isOpen, initialData]);

  // --- AUTO CALCULATION LOGIC ---
  useEffect(() => {
    // Hitung otomatis jika user mengubah nilai dasar
    // Rumus:
    // 1. gapok 26 hari = gapok 1 bulan / 26
    // 2. setengah hari = gapok 26 hari / 2
    // 3. perjam = gapok 26 hari / 8
    // 4. uang makan perhari = uang makan / 26
    // 5. uang kehadiran perhari = uang kehadiran / 26

    const gapok = Number(formData.gaji_pokok) || 0;
    const makan = Number(formData.uang_makan) || 0;
    const hadir = Number(formData.uang_kehadiran) || 0;

    const gapok26 = Math.round(gapok / 26);
    const setengah = Math.round(gapok26 / 2);
    const perJam = Math.round(gapok26 / 8);
    
    const makanHarian = Math.round(makan / 26);
    const hadirHarian = Math.round(hadir / 26);

    // Update state hanya jika ada perbedaan untuk menghindari loop tak terbatas
    // (Sebenarnya aman karena dependensi useEffect)
    setFormData(prev => ({
      ...prev,
      gaji_harian: gapok26,
      gaji_setengah_hari: setengah,
      gaji_per_jam: perJam,
      uang_makan_harian: makanHarian,
      uang_kehadiran_harian: hadirHarian
    }));

  }, [formData.gaji_pokok, formData.uang_makan, formData.uang_kehadiran]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-dark-600 sticky top-0 bg-white dark:bg-dark-800 z-10">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {initialData ? 'Edit Data Gaji' : 'Tambah Master Gaji'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Informasi Dasar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bulan & Tahun</label>
              <input
                type="text"
                name="bulan"
                value={formData.bulan}
                onChange={handleChange}
                placeholder="Contoh: September 2025"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
              <input
                type="text"
                name="grade"
                value={formData.grade}
                onChange={handleChange}
                placeholder="Contoh: A, B, Staff"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
                required
              />
            </div>
          </div>

          <div className="border-t border-gray-100 my-4"></div>

          {/* Komponen Gaji Pokok */}
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            Komponen Gaji Pokok 
            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Calculator size={12} /> Otomatis
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Gapok 1 Bulan (Input)</label>
              <input 
                type="number" 
                name="gaji_pokok" 
                value={formData.gaji_pokok} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-erp-pink/50 bg-pink-50/30 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-erp-pink" 
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Gapok Perhari (26 Hari)</label>
              <input 
                type="number" 
                name="gaji_harian" 
                value={formData.gaji_harian} 
                readOnly 
                className="w-full px-3 py-2 border border-gray-200 bg-gray-100 rounded-lg text-sm text-gray-500 cursor-not-allowed" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Setengah Hari</label>
              <input 
                type="number" 
                name="gaji_setengah_hari" 
                value={formData.gaji_setengah_hari} 
                readOnly 
                className="w-full px-3 py-2 border border-gray-200 bg-gray-100 rounded-lg text-sm text-gray-500 cursor-not-allowed" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Per Jam</label>
              <input 
                type="number" 
                name="gaji_per_jam" 
                value={formData.gaji_per_jam} 
                readOnly 
                className="w-full px-3 py-2 border border-gray-200 bg-gray-100 rounded-lg text-sm text-gray-500 cursor-not-allowed" 
              />
            </div>
          </div>

          {/* Tunjangan & Bonus */}
          <h3 className="font-semibold text-gray-800 pt-2">Tunjangan & Bonus (Bulanan)</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Lembur (Per Jam)</label>
              <input type="number" name="lembur" value={formData.lembur} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Uang Makan (Bulanan)</label>
              <input type="number" name="uang_makan" value={formData.uang_makan} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Uang Kehadiran (Bulanan)</label>
              <input type="number" name="uang_kehadiran" value={formData.uang_kehadiran} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Bonus</label>
              <input type="number" name="bonus" value={formData.bonus} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>

          {/* Harian */}
          <h3 className="font-semibold text-gray-800 pt-2 flex items-center gap-2">
            Komponen Harian
            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Calculator size={12} /> Otomatis
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Uang Makan / Hari</label>
              <input 
                type="number" 
                name="uang_makan_harian" 
                value={formData.uang_makan_harian} 
                readOnly 
                className="w-full px-3 py-2 border border-gray-200 bg-gray-100 rounded-lg text-sm text-gray-500 cursor-not-allowed" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Uang Kehadiran / Hari</label>
              <input 
                type="number" 
                name="uang_kehadiran_harian" 
                value={formData.uang_kehadiran_harian} 
                readOnly 
                className="w-full px-3 py-2 border border-gray-200 bg-gray-100 rounded-lg text-sm text-gray-500 cursor-not-allowed" 
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-erp-pink hover:bg-pink-600 text-white rounded-lg shadow-sm flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Save size={18} /> {isLoading ? 'Menyimpan...' : 'Simpan Data'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
