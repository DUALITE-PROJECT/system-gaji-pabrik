import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';

interface AdminEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  initialData?: any;
  isLoading: boolean;
}

export const AdminEmployeeModal: React.FC<AdminEmployeeModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading
}) => {
  const [formData, setFormData] = useState({
    kode: '',
    nama: '',
    jenis_kelamin: 'L',
    jabatan: '',
    divisi: '',
    perusahaan: '',
    bulan: '',
    keterangan: ''
  });

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData(initialData);
      } else {
        const today = new Date();
        const monthYear = today.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        setFormData({
          kode: '',
          nama: '',
          jenis_kelamin: 'L',
          jabatan: '',
          divisi: '',
          perusahaan: 'CV GARUT',
          bulan: monthYear,
          keterangan: ''
        });
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">
            {initialData ? 'Edit Karyawan Admin' : 'Tambah Karyawan Admin'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kode Karyawan</label>
              <input type="text" name="kode" value={formData.kode} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" required placeholder="ADM-001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
              <input type="text" name="nama" value={formData.nama} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Jenis Kelamin</label>
              <select name="jenis_kelamin" value={formData.jenis_kelamin} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none bg-white">
                <option value="L">L - Laki-laki</option>
                <option value="P">P - Perempuan</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Jabatan (Grade)</label>
              <input type="text" name="jabatan" value={formData.jabatan} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" placeholder="Harus sesuai Master Gaji" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Divisi</label>
              <input type="text" name="divisi" value={formData.divisi} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Perusahaan</label>
              <input type="text" name="perusahaan" value={formData.perusahaan} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bulan Data</label>
              <input type="text" name="bulan" value={formData.bulan} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
              <input type="text" name="keterangan" value={formData.keterangan} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none" />
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
