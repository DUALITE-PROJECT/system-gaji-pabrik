import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Calendar, Clock, Wand2 } from 'lucide-react';
import { SKU } from '../../types';

interface SKUFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<SKU>) => void;
  initialData?: SKU; // Jika ada, berarti mode Edit
}

export const SKUFormModal: React.FC<SKUFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData
}) => {
  const [formData, setFormData] = useState<Partial<SKU>>({
    code: '',
    name: '',
    description: '',
    category: 'Lainnya',
    minStock: 0,
    unit: 'Pcs',
    hpp: 0,
    price: 0
  });

  const isEditMode = !!initialData;

  // Helper: Deteksi Kategori Otomatis berdasarkan Nama
  const detectCategory = (name: string) => {
    const upperName = name.toUpperCase();
    if (upperName.includes('TAS')) return 'Tas';
    if (upperName.includes('CELANA')) return 'Celana';
    if (upperName.includes('KEMEJA')) return 'Kemeja';
    if (upperName.includes('DOMPET') || upperName.includes('POUCH') || upperName.includes('AKSESORIS')) return 'Aksesoris';
    if (upperName.includes('BOX') || upperName.includes('KOTAK') || upperName.includes('PACKAGING')) return 'Packaging';
    return 'Lainnya';
  };

  // Reset atau isi form saat modal dibuka/initialData berubah
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData(initialData);
      } else {
        setFormData({
          code: '',
          name: '',
          description: '',
          category: 'Lainnya',
          minStock: 0, // Default 0 (Hidden)
          unit: 'Pcs',
          hpp: 0,
          price: 0 // Default 0 (Hidden)
        });
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    onClose();
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    // Update nama DAN deteksi kategori otomatis
    setFormData(prev => ({
      ...prev,
      name: newName,
      category: detectCategory(newName)
    }));
  };

  // Helper untuk styling input (Enabled vs Disabled)
  const getInputClass = (enabled: boolean = true) => `
    w-full px-3 py-2 border rounded-lg outline-none transition-colors
    ${enabled 
      ? 'border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-erp-blue-600' 
      : 'border-gray-200 dark:border-dark-700 bg-gray-100 dark:bg-dark-800 text-gray-500 dark:text-gray-500 cursor-not-allowed'}
  `;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-dark-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-dark-600 sticky top-0 bg-white dark:bg-dark-800 z-10">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {isEditMode ? 'Edit SKU' : 'Tambah SKU Baru'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {isEditMode && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 px-4 py-3 rounded-lg text-sm flex items-start gap-2 border border-blue-100 dark:border-blue-800">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p>Dalam mode Edit, Anda dapat mengubah <strong>Deskripsi</strong> dan <strong>HPP</strong>. Kode SKU dan Nama Barang dikunci untuk menjaga konsistensi data.</p>
              </div>

              {/* Info Tanggal Read-Only */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-dark-700 rounded-lg border border-gray-100 dark:border-dark-600">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white dark:bg-dark-600 rounded-full text-gray-500">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-wider font-medium">Tanggal Dibuat</label>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{formData.createdAt || '-'}</p>
                    <p className="text-[10px] text-gray-400">Permanen (Sejak input pertama)</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white dark:bg-dark-600 rounded-full text-erp-blue-500">
                    <Clock size={18} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-wider font-medium">Update HPP Terakhir</label>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{formData.hppUpdatedAt || '-'}</p>
                    <p className="text-[10px] text-gray-400">Berubah saat HPP diganti</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Kode SKU - LOCKED ON EDIT */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kode SKU</label>
              <input
                required
                type="text"
                value={formData.code}
                onChange={e => setFormData({...formData, code: e.target.value})}
                disabled={isEditMode}
                className={getInputClass(!isEditMode)}
                placeholder="Contoh: BRG-001"
              />
            </div>

            {/* Nama Barang - LOCKED ON EDIT (Auto Category Trigger) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama Barang</label>
              <input
                required
                type="text"
                value={formData.name}
                onChange={handleNameChange}
                disabled={isEditMode}
                className={getInputClass(!isEditMode)}
                placeholder="Nama Produk"
              />
            </div>

            {/* Satuan - LOCKED ON EDIT */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Satuan (Unit)</label>
              <select
                value={formData.unit}
                onChange={e => setFormData({...formData, unit: e.target.value})}
                disabled={isEditMode}
                className={getInputClass(!isEditMode)}
              >
                <option value="Pcs">Pcs</option>
                <option value="Box">Box</option>
                <option value="Lusin">Lusin</option>
                <option value="Kg">Kg</option>
                <option value="Meter">Meter</option>
              </select>
            </div>

            {/* HPP - Harga Pokok Penjualan (ALWAYS EDITABLE) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">HPP (Harga Pokok)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">Rp</span>
                <input
                  required
                  type="number"
                  min="0"
                  value={formData.hpp}
                  onChange={e => setFormData({...formData, hpp: Number(e.target.value)})}
                  className={`${getInputClass(true)} pl-10 font-semibold text-gray-900`} // Always enabled
                />
              </div>
            </div>
          </div>

          {/* Kategori Otomatis (Read Only / Info) */}
          <div className="bg-gray-50 dark:bg-dark-700 p-3 rounded-lg border border-gray-200 dark:border-dark-600 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wand2 size={16} className="text-purple-500" />
              <span className="text-sm text-gray-600 dark:text-gray-300">Kategori Terdeteksi:</span>
            </div>
            <span className="font-bold text-gray-900 dark:text-white px-3 py-1 bg-white dark:bg-dark-600 rounded border border-gray-200 dark:border-dark-500 text-sm">
              {formData.category || 'Lainnya'}
            </span>
          </div>

          {/* Deskripsi (ALWAYS EDITABLE) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Deskripsi</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              className={getInputClass(true)} // Always enabled
              placeholder="Deskripsi detail produk..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-dark-600">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-erp-blue-600 hover:bg-erp-blue-800 text-white rounded-lg shadow-sm flex items-center gap-2 transition-colors"
            >
              <Save size={18} /> Simpan SKU
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
