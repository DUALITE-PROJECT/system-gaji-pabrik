import React, { useState, useEffect } from 'react';
import { X, Calculator, Info, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface DailySalaryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any; // Data baris gaji harian
}

export const DailySalaryDetailModal: React.FC<DailySalaryDetailModalProps> = ({
  isOpen,
  onClose,
  data
}) => {
  const [loading, setLoading] = useState(true);
  const [master, setMaster] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);

  const formatRupiah = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

  useEffect(() => {
    if (isOpen && data) {
      fetchDetails();
    }
  }, [isOpen, data]);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      // 1. Ambil Master Gaji
      const { data: mData } = await supabase
        .from('master_gaji')
        .select('*')
        .eq('grade', data.grade)
        .ilike('bulan', data.bulan)
        .single();
      
      setMaster(mData || {});

      // 2. Ambil Statistik Presensi Bulan Ini
      const { data: pData } = await supabase
        .from('presensi_harian_pabrik_garut')
        .select('kehadiran, keterangan')
        .eq('kode', data.kode)
        .eq('bulan', data.bulan);

      const statsCount = {
        h: 0, s: 0, i: 0, t: 0, b: 0, lp: 0, tm: 0, total: 0,
        hasLiburPribadi: false,
        hasLiburPerusahaan: false
      };

      pData?.forEach((row: any) => {
        const k = row.kehadiran;
        if (['H', '1', 'Hadir'].includes(k) || !isNaN(parseFloat(k))) statsCount.h++;
        if (['S', 'Sakit'].includes(k)) statsCount.s++;
        if (['I', 'Izin'].includes(k)) statsCount.i++;
        if (['T', 'Alpha', 'A'].includes(k)) statsCount.t++;
        if (['B', 'Bolos'].includes(k)) statsCount.b++;
        if (['LP'].includes(k)) statsCount.lp++;
        if (['TM'].includes(k)) statsCount.tm++;
        
        if (row.keterangan?.toLowerCase().includes('libur pribadi')) statsCount.hasLiburPribadi = true;
        if (row.keterangan?.toLowerCase().includes('libur perusahaan')) statsCount.hasLiburPerusahaan = true;
        
        statsCount.total++;
      });
      setStats(statsCount);

      // 3. Ambil Config Hari Kerja
      const { data: cData } = await supabase
        .from('konfigurasi_gaji_bulanan')
        .select('jumlah_hari_kerja')
        .eq('bulan', data.bulan)
        .single();
      
      setConfig(cData || { jumlah_hari_kerja: 26 }); // Default 26 jika null

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !data) return null;

  // --- SIMULASI PERHITUNGAN (LOGIC V7) ---
  const pembagi = config?.jumlah_hari_kerja || 26;
  
  // 1. Denda
  const totalPelanggaran = (stats?.s || 0) + (stats?.i || 0) + (stats?.t || 0);
  const dendaFlat = totalPelanggaran * 10000; // Simplifikasi V7 (Flat 10k per kejadian)

  // 2. Pengurang Tambahan
  const totalPengurangHari = (stats?.b || 0) + (stats?.lp || 0) + (stats?.tm || 0);
  const pengurangMakan = ((master?.uang_makan || 0) / pembagi) * totalPengurangHari;
  const pengurangHadir = ((master?.uang_kehadiran || 0) / pembagi) * totalPengurangHari;

  // 3. Net Bulanan
  const netMakanBulanan = Math.max(0, (master?.uang_makan || 0) - dendaFlat - pengurangMakan);
  const netHadirBulanan = Math.max(0, (master?.uang_kehadiran || 0) - dendaFlat - pengurangHadir);

  // 4. Harian Final
  const harianMakan = netMakanBulanan / pembagi;
  const harianHadir = netHadirBulanan / pembagi;

  // 5. Bonus Logic
  let bonusStatus = 'FULL';
  let bonusBulanan = master?.bonus || 0;
  
  const isBorongan = data.perusahaan?.toUpperCase().includes('BORONGAN') || data.bagian?.toUpperCase().includes('BORONGAN');
  const hasKeluarMasuk = data.keluar_masuk && data.keluar_masuk !== '';

  if (hasKeluarMasuk || totalPelanggaran > 0 || stats?.hasLiburPribadi) {
    bonusStatus = 'HANGUS (0)';
    bonusBulanan = 0;
  } else if (stats?.lp > 0 || stats?.hasLiburPerusahaan) {
    bonusStatus = 'DIPOTONG (LP)';
    bonusBulanan = isBorongan ? (bonusBulanan / 8) : (bonusBulanan / 2);
  } else if (isBorongan) {
    bonusStatus = 'BORONGAN (1/4)';
    bonusBulanan = bonusBulanan / 4;
  }

  const harianBonus = bonusBulanan / pembagi;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 animate-fadeIn font-sans">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-blue-600 text-white">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Calculator size={20} className="text-blue-200"/> 
              Bedah Hitungan: {data.kode}
            </h3>
            <p className="text-blue-100 text-xs mt-1">{data.nama} - {data.grade} ({data.bulan})</p>
          </div>
          <button onClick={onClose} className="text-blue-100 hover:text-white p-1 rounded-full hover:bg-white/20 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar bg-gray-50">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={32}/></div>
          ) : (
            <div className="space-y-6">
              
              {/* 1. INFO DASAR */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Master Gaji (Bulanan)</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>Gapok:</span> <span className="font-mono">{formatRupiah(master?.gaji_harian || 0)}/hari</span></div>
                    <div className="flex justify-between"><span>Makan:</span> <span className="font-mono">{formatRupiah(master?.uang_makan || 0)}</span></div>
                    <div className="flex justify-between"><span>Hadir:</span> <span className="font-mono">{formatRupiah(master?.uang_kehadiran || 0)}</span></div>
                    <div className="flex justify-between"><span>Bonus:</span> <span className="font-mono">{formatRupiah(master?.bonus || 0)}</span></div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Statistik Presensi</h4>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="bg-green-50 rounded p-1"><span className="block text-xs text-green-600">Hadir</span><b>{stats?.h}</b></div>
                    <div className="bg-red-50 rounded p-1"><span className="block text-xs text-red-600">S/I/T</span><b>{totalPelanggaran}</b></div>
                    <div className="bg-yellow-50 rounded p-1"><span className="block text-xs text-yellow-600">LP/B</span><b>{stats?.lp + stats?.b}</b></div>
                  </div>
                  {hasKeluarMasuk && <div className="mt-2 text-xs text-red-600 font-bold bg-red-50 px-2 py-1 rounded">Status: {data.keluar_masuk}</div>}
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Konfigurasi</h4>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600">Pembagi Bulan:</span>
                    <span className="text-xl font-bold text-blue-600">{pembagi}</span>
                  </div>
                  <p className="text-[10px] text-gray-400">Digunakan untuk membagi nilai bulanan ke harian.</p>
                </div>
              </div>

              {/* 2. TABEL RINCIAN HITUNGAN */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-100 text-gray-600 font-bold border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">Komponen</th>
                      <th className="px-4 py-3 text-right">Nilai Dasar</th>
                      <th className="px-4 py-3 text-right text-red-600">Potongan/Denda</th>
                      <th className="px-4 py-3 text-right text-blue-600">Net Bulanan</th>
                      <th className="px-4 py-3 text-right font-bold bg-green-50 text-green-800">Hasil Harian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {/* MAKAN */}
                    <tr>
                      <td className="px-4 py-3 font-medium">Uang Makan</td>
                      <td className="px-4 py-3 text-right">{formatRupiah(master?.uang_makan || 0)}</td>
                      <td className="px-4 py-3 text-right text-red-600">
                        -{formatRupiah(dendaFlat + pengurangMakan)}
                        <div className="text-[10px] text-gray-400">Denda: {formatRupiah(dendaFlat)}, Pengurang: {formatRupiah(pengurangMakan)}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-blue-600 font-medium">{formatRupiah(netMakanBulanan)}</td>
                      <td className="px-4 py-3 text-right font-bold bg-green-50">{formatRupiah(harianMakan)}</td>
                    </tr>
                    {/* HADIR */}
                    <tr>
                      <td className="px-4 py-3 font-medium">Uang Kehadiran</td>
                      <td className="px-4 py-3 text-right">{formatRupiah(master?.uang_kehadiran || 0)}</td>
                      <td className="px-4 py-3 text-right text-red-600">
                        -{formatRupiah(dendaFlat + pengurangHadir)}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-600 font-medium">{formatRupiah(netHadirBulanan)}</td>
                      <td className="px-4 py-3 text-right font-bold bg-green-50">{formatRupiah(harianHadir)}</td>
                    </tr>
                    {/* BONUS */}
                    <tr>
                      <td className="px-4 py-3 font-medium">
                        Bonus
                        <span className={`block text-[10px] px-1.5 py-0.5 rounded w-fit mt-1 ${bonusStatus.includes('HANGUS') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                          {bonusStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{formatRupiah(master?.bonus || 0)}</td>
                      <td className="px-4 py-3 text-right text-red-600">
                        -{formatRupiah((master?.bonus || 0) - bonusBulanan)}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-600 font-medium">{formatRupiah(bonusBulanan)}</td>
                      <td className="px-4 py-3 text-right font-bold bg-green-50">{formatRupiah(harianBonus)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 3. TOTAL FINAL */}
              <div className="bg-gray-800 text-white p-4 rounded-xl flex justify-between items-center shadow-lg">
                <div>
                  <p className="text-xs text-gray-400 uppercase font-bold">Total Gaji Harian (Estimasi)</p>
                  <p className="text-xs text-gray-500 mt-1">Gapok + Lembur + Makan + Hadir + Bonus</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-green-400">
                    {formatRupiah((Number(data.gaji_pokok) || 0) + (Number(data.gaji_lembur) || 0) + harianMakan + harianHadir + harianBonus)}
                  </p>
                  <p className="text-[10px] text-gray-400">Nilai di tabel: {formatRupiah(data.gaji)}</p>
                </div>
              </div>

              {/* Warning jika ada selisih */}
              {Math.abs((Number(data.gaji) || 0) - ((Number(data.gaji_pokok) || 0) + (Number(data.gaji_lembur) || 0) + harianMakan + harianHadir + harianBonus)) > 100 && (
                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg flex gap-2 items-start text-xs text-yellow-800">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5"/>
                  <p>
                    Ada selisih antara nilai di tabel dengan simulasi ini. Hal ini mungkin karena data Master Gaji atau Config Hari Kerja telah berubah setelah perhitungan terakhir. 
                    Silakan klik tombol <b>Hitung Ulang</b> di halaman utama untuk memperbarui nilai tabel.
                  </p>
                </div>
              )}

            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-gray-100 bg-white flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
