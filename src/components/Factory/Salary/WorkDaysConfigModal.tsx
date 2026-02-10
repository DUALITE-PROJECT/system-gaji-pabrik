import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, Calendar, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface WorkDaysConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMonth: string;
}

export const WorkDaysConfigModal: React.FC<WorkDaysConfigModalProps> = ({
  isOpen,
  onClose,
  currentMonth
}) => {
  const [days, setDays] = useState<number | ''>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [existingId, setExistingId] = useState<number | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    if (isOpen && currentMonth) {
      fetchConfig();
      setStatus(null); // Reset status on open
    }
  }, [isOpen, currentMonth]);

  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      // Cek apakah tabel ada
      const { data, error } = await supabase
        .from('konfigurasi_gaji_bulanan')
        .select('*')
        .eq('bulan', currentMonth)
        .maybeSingle();

      if (error && error.code !== '42P01') {
        console.error("Error fetching config:", error);
      }

      if (data) {
        // Jika data ada tapi null, set ke '' agar input kosong (auto)
        setDays(data.jumlah_hari_kerja !== null ? data.jumlah_hari_kerja : '');
        setExistingId(data.id);
      } else {
        setDays('');
        setExistingId(null);
      }
    } catch (err) {
      console.warn("Table might not exist yet.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatus(null);
    
    try {
      const payload = {
        bulan: currentMonth,
        // Jika kosong atau 0, kirim null agar backend menggunakan hitungan otomatis (Hadir)
        jumlah_hari_kerja: days === '' || days === 0 ? null : Number(days),
        updated_at: new Date().toISOString()
      };

      if (existingId) {
        const { error } = await supabase
          .from('konfigurasi_gaji_bulanan')
          .update(payload)
          .eq('id', existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('konfigurasi_gaji_bulanan')
          .insert([payload]);
        if (error) throw error;
      }

      // Tampilkan pesan sukses inline
      setStatus({ type: 'success', message: 'Konfigurasi berhasil disimpan.' });
      
      // Tutup otomatis setelah 1.5 detik
      setTimeout(() => {
        onClose();
        setStatus(null);
      }, 1500);

    } catch (error: any) {
      if (error.code === '42P01') {
        setStatus({ type: 'error', message: "Tabel konfigurasi belum dibuat. Silakan jalankan 'Setup Auto-Sync' terlebih dahulu." });
      } else {
        setStatus({ type: 'error', message: `Gagal menyimpan: ${error.message}` });
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn font-sans">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white">
          <div>
            <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
              <Calendar size={20} className="text-erp-pink"/> 
              Config Pembagi Bulan
            </h3>
            <p className="text-xs text-gray-500 mt-1">Atur jumlah hari kerja untuk perhitungan gaji.</p>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          
          {/* Status Message (Success/Error) */}
          {status && (
            <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
              status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 
              status.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
              'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {status.type === 'success' ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}
              {status.message}
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-100 text-blue-800 p-4 rounded-xl text-sm flex gap-3 items-start">
            <Info size={18} className="shrink-0 mt-0.5 text-blue-600"/>
            <div className="space-y-1">
              <p>
                Target Bulan: <span className="font-bold">{currentMonth || 'Tidak Dipilih'}</span>
              </p>
              <p className="text-blue-600/80 text-xs leading-relaxed">
                Angka ini digunakan sebagai pembagi rumus <b>Uang Makan</b>, <b>Uang Kehadiran</b>, dan <b>Bonus</b>.
              </p>
            </div>
          </div>

          {/* Input Field */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Jumlah Hari Kerja (Pembagi)
            </label>
            <div className="relative">
              {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 z-10 rounded-lg">
                  <Loader2 className="animate-spin text-erp-pink" size={20}/>
                </div>
              ) : null}
              
              <input 
                type="number" 
                value={days}
                onChange={(e) => {
                    const val = e.target.value;
                    setDays(val === '' ? '' : Number(val));
                }}
                placeholder="Kosong = Hitung Otomatis"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-erp-pink/50 focus:border-erp-pink outline-none text-lg font-bold text-gray-800 placeholder:text-gray-400 placeholder:text-sm placeholder:font-normal transition-all"
                disabled={isLoading || isSaving}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
              <CheckCircle2 size={12} className="text-green-600"/>
              <span>Biarkan <b>kosong</b> untuk menggunakan jumlah hari hadir aktual karyawan.</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            disabled={isSaving}
            className="px-5 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-white transition-colors disabled:opacity-50 text-sm"
          >
            Batal
          </button>
          <button 
            onClick={handleSave} 
            disabled={isSaving || isLoading}
            className="bg-erp-pink hover:bg-pink-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-md shadow-pink-200 transition-all flex items-center gap-2 disabled:opacity-70 text-sm"
          >
            {isSaving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
            Simpan Config
          </button>
        </div>
      </div>
    </div>
  );
};
