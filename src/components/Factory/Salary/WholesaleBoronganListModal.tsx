import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';

interface WholesaleBoronganListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  initialData?: any;
  isLoading: boolean;
}

export const WholesaleBoronganListModal: React.FC<WholesaleBoronganListModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading
}) => {
  const [formData, setFormData] = useState({
    tanggal: '',
    kode: '',
    nama: '',
    grade: '',
    bulan: '',
    perusahaan: 'BORONGAN',
    periode: '',
    kehadiran: '',
    keterangan: ''
  });

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          tanggal: initialData.tanggal,
          kode: initialData.kode,
          nama: initialData.nama,
          grade: initialData.grade,
          bulan: initialData.bulan,
          perusahaan: 'BORONGAN', // Force BORONGAN
          periode: initialData.periode,
          kehadiran: initialData.kehadiran,
          keterangan: initialData.keterangan || ''
        });
      } else {
        // Default empty
        setFormData({
          tanggal: new Date().toISOString().split('T')[0],
          kode: '',
          nama: '',
          grade: '',
          bulan: '',
          perusahaan: 'BORONGAN',
          periode: 'Periode 1',
          kehadiran: '1',
          keterangan: ''
        });
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-dark-600 bg-white dark:bg-dark-800">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Edit Presensi Borongan
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kode</label>
              <input
                type="text"
                name="kode"
                value={formData.kode}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama</label>
              <input
                type="text"
                name="nama"
                value={formData.nama}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                readOnly
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
              <input
                type="text"
                name="grade"
                value={formData.grade}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kehadiran</label>
              <input
                type="text"
                name="kehadiran"
                value={formData.kehadiran}
                onChange={handleChange}
                placeholder="1 / M / S"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bulan</label>
            <input
              type="text"
              name="bulan"
              value={formData.bulan}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
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
              <input
                type="text"
                name="perusahaan"
                value={formData.perusahaan}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                readOnly
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
            <textarea
              name="keterangan"
              value={formData.keterangan}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
              placeholder="Tambahkan catatan..."
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
              Simpan Perubahan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
