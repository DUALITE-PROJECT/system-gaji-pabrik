import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

interface AdminDailyAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  initialData?: any;
  isLoading: boolean;
}

export const AdminDailyAttendanceModal: React.FC<AdminDailyAttendanceModalProps> = ({
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
    kehadiran: '',
    jam_lembur: 0,
    keterangan: ''
  });

  useEffect(() => {
    if (isOpen && initialData) {
      setFormData(initialData);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold">Edit Presensi Admin</h2>
          <button onClick={onClose}><X size={24} className="text-gray-400"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div><label className="block text-sm font-medium mb-1">Tanggal</label><input type="date" value={formData.tanggal} onChange={e => setFormData({...formData, tanggal: e.target.value})} className="w-full border rounded p-2"/></div>
          <div><label className="block text-sm font-medium mb-1">Kehadiran</label><input type="text" value={formData.kehadiran} onChange={e => setFormData({...formData, kehadiran: e.target.value})} className="w-full border rounded p-2"/></div>
          <div><label className="block text-sm font-medium mb-1">Lembur (Jam)</label><input type="number" value={formData.jam_lembur} onChange={e => setFormData({...formData, jam_lembur: Number(e.target.value)})} className="w-full border rounded p-2"/></div>
          <div><label className="block text-sm font-medium mb-1">Keterangan</label><input type="text" value={formData.keterangan} onChange={e => setFormData({...formData, keterangan: e.target.value})} className="w-full border rounded p-2"/></div>
          <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={onClose} className="px-4 py-2 border rounded">Batal</button><button type="submit" className="px-6 py-2 bg-erp-pink text-white rounded">Simpan</button></div>
        </form>
      </div>
    </div>
  );
};
