import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, Calculator } from 'lucide-react';

interface AdminMasterSalaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  initialData?: any;
  isLoading: boolean;
}

export const AdminMasterSalaryModal: React.FC<AdminMasterSalaryModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading
}) => {
  const [formData, setFormData] = useState({
    bulan: '',
    divisi: '',
    jabatan: '',
    gaji_pokok: 0,
    uang_makan: 0,
    uang_kehadiran: 0,
    lembur_per_jam: 0,
    insentif: 0,
    tunjangan_jabatan: 0,
    tunjangan_transportasi: 0,
    lembur_tanggal_merah: 0
  });

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData(initialData);
      } else {
        const today = new Date();
        const monthYear = today.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        setFormData({
          bulan: monthYear,
          divisi: '',
          jabatan: '',
          gaji_pokok: 0,
          uang_makan: 0,
          uang_kehadiran: 0,
          lembur_per_jam: 0,
          insentif: 0,
          tunjangan_jabatan: 0,
          tunjangan_transportasi: 0,
          lembur_tanggal_merah: 0
        });
      }
    }
  }, [isOpen, initialData]);

  // AUTO CALCULATE LEMBUR (CORRECTED FORMULA)
  useEffect(() => {
    // Jika user mengetik gaji pokok, otomatis hitung lembur per jam
    const gapok = Number(formData.gaji_pokok) || 0;
    if (gapok > 0) {
        // Formula:
        // Lembur Biasa = (Gapok / 26 / 8) * 1.4
        // Lembur TM = Gapok / 26 / 8
        
        const hourlyBase = gapok / 26 / 8;
        const lembur = Math.round(hourlyBase * 1.4);
        const lemburTM = Math.round(hourlyBase);

        setFormData(prev => ({
            ...prev,
            lembur_per_jam: lembur,
            lembur_tanggal_merah: lemburTM
        }));
    }
  }, [formData.gaji_pokok]);

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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold text-gray-900">
            {initialData ? 'Edit Master Gaji Admin' : 'Tambah Master Gaji Admin'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Bulan</label>
              <input type="text" name="bulan" value={formData.bulan} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" required />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Divisi</label>
              <input type="text" name="divisi" value={formData.divisi} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" required placeholder="Contoh: Keuangan" />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Jabatan</label>
              <input type="text" name="jabatan" value={formData.jabatan} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" required placeholder="Contoh: Manager" />
            </div>
          </div>

          <div className="border-t border-gray-100 my-2"></div>
          <h3 className="font-semibold text-gray-800">Komponen Gaji</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gaji (Pokok)</label>
              <input type="number" name="gaji_pokok" value={formData.gaji_pokok} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Uang Jabatan</label>
              <input type="number" name="tunjangan_jabatan" value={formData.tunjangan_jabatan} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Uang Transportasi</label>
              <input type="number" name="tunjangan_transportasi" value={formData.tunjangan_transportasi} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Uang Makan</label>
              <input type="number" name="uang_makan" value={formData.uang_makan} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Uang Kehadiran</label>
              <input type="number" name="uang_kehadiran" value={formData.uang_kehadiran} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Insentif</label>
              <input type="number" name="insentif" value={formData.insentif} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" />
            </div>
          </div>

          <div className="border-t border-gray-100 my-2"></div>
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            Komponen Lembur 
            <span className="text-xs font-normal bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Calculator size={12}/> Otomatis
            </span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lembur (Per Jam)</label>
              <input type="number" name="lembur_per_jam" value={formData.lembur_per_jam} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 bg-gray-50 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" />
              <p className="text-[10px] text-gray-400 mt-1">Rumus: (Gapok / 26 / 8) x 1.4</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lembur Tanggal Merah</label>
              <input type="number" name="lembur_tanggal_merah" value={formData.lembur_tanggal_merah} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 bg-gray-50 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" />
              <p className="text-[10px] text-gray-400 mt-1">Rumus: Gapok / 26 / 8</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Batal</button>
            <button type="submit" disabled={isLoading} className="px-6 py-2 bg-erp-pink hover:bg-pink-600 text-white rounded-lg shadow-sm flex items-center gap-2">
              {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Simpan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
