import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';

interface DailyAdnanHananModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  initialData?: any;
  isLoading: boolean;
}

export const DailyAdnanHananModal: React.FC<DailyAdnanHananModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading
}) => {
  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    kode: '',
    grade: '',
    bulan: '',
    kehadiran: '',
    lembur: '',
    periode: 'Periode 1',
    perusahaan: 'CV ADNAN',
    keterangan: '',
    divisi: '',
    gaji: 0
  });

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          tanggal: initialData.tanggal,
          kode: initialData.kode,
          grade: initialData.grade || '',
          bulan: initialData.bulan || '',
          kehadiran: initialData.kehadiran || '',
          lembur: initialData.lembur || '',
          periode: initialData.periode || 'Periode 1',
          perusahaan: initialData.perusahaan || 'CV ADNAN',
          keterangan: initialData.keterangan || '',
          divisi: initialData.divisi || '',
          gaji: Number(initialData.gaji) || 0 
        });
      } else {
        // Reset form
        const today = new Date();
        const monthName = today.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        
        setFormData({
          tanggal: today.toISOString().split('T')[0],
          kode: '',
          grade: '',
          bulan: monthName,
          kehadiran: '1',
          lembur: '0',
          periode: 'Periode 1',
          perusahaan: 'CV ADNAN',
          keterangan: '',
          divisi: '',
          gaji: 0
        });
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
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

  const formatRupiah = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-dark-600 bg-white dark:bg-dark-800 sticky top-0 z-10">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {initialData ? 'Edit Gaji Harian' : 'Input Gaji Harian'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
              <input
                type="date"
                name="tanggal"
                value={formData.tanggal}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kode Karyawan</label>
              <input
                type="text"
                name="kode"
                value={formData.kode}
                onChange={handleChange}
                placeholder="Contoh: K001"
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
                placeholder="Contoh: A"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Divisi</label>
              <input
                type="text"
                name="divisi"
                value={formData.divisi}
                onChange={handleChange}
                placeholder="Contoh: Produksi"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bulan</label>
              <input
                type="text"
                name="bulan"
                value={formData.bulan}
                onChange={handleChange}
                placeholder="Contoh: Oktober 2025"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Periode</label>
              <select
                name="periode"
                value={formData.periode}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
              >
                <option value="Periode 1">Periode 1</option>
                <option value="Periode 2">Periode 2</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Perusahaan</label>
              <select
                name="perusahaan"
                value={formData.perusahaan}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
              >
                <option value="CV ADNAN">CV ADNAN</option>
                <option value="CV HANAN">CV HANAN</option>
              </select>
            </div>
            
            {/* Gaji Field - Read Only Display */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Gaji Harian (Rp)</label>
              <div className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg font-bold text-green-700 flex justify-between items-center">
                 <span>{formatRupiah(formData.gaji)}</span>
                 <span className="text-[10px] text-gray-400 font-normal">Auto-Sync</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kehadiran</label>
              <input
                type="text"
                name="kehadiran"
                value={formData.kehadiran}
                onChange={handleChange}
                placeholder="1, 0.5, S, I"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lembur</label>
              <input
                type="text"
                name="lembur"
                value={formData.lembur}
                onChange={handleChange}
                placeholder="Contoh: 2 jam"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
            <textarea
              name="keterangan"
              value={formData.keterangan}
              onChange={handleChange}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
              placeholder="Catatan tambahan..."
            />
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
              {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              Simpan Data
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
