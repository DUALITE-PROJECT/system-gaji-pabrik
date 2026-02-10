import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, RefreshCw, Calculator, Download, FileText, Search, Database, Wallet, Users, Wrench, X, Copy } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import * as XLSX from 'xlsx';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';

export const AdminMonthlyReport: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [filterMonth, setFilterMonth] = useState('');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isTableMissing, setIsTableMissing] = useState(false);
  
  // SQL Modal State
  const [showSqlModal, setShowSqlModal] = useState(false);

  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });

  // SQL Code for Schema Update (Adding Telat & Potongan Kesiangan)
  const sqlUpdateCode = `
-- 1. Tambahkan Kolom Baru ke Tabel Laporan
ALTER TABLE public.laporan_bulanan_admin_pabrik ADD COLUMN IF NOT EXISTS telat INT DEFAULT 0;
ALTER TABLE public.laporan_bulanan_admin_pabrik ADD COLUMN IF NOT EXISTS potongan_kesiangan NUMERIC DEFAULT 0;

-- 2. Tambahkan Kolom Rate Potongan ke Master Gaji (Opsional, default 0 jika belum diisi)
ALTER TABLE public.master_gaji_admin_pabrik ADD COLUMN IF NOT EXISTS nominal_potongan_telat NUMERIC DEFAULT 0;

-- 3. Update Fungsi Hitung Ulang (Sync)
CREATE OR REPLACE FUNCTION public.sync_admin_monthly_report(p_bulan TEXT)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    r_emp RECORD;
    v_h INT; v_s INT; v_i INT; v_t INT; v_telat INT;
    v_lembur_jam NUMERIC;
    v_lembur_tm_jam NUMERIC;
    
    v_gapok NUMERIC; v_tunj_jabatan NUMERIC; v_tunj_makan NUMERIC;
    v_tunj_transport NUMERIC; v_insentif NUMERIC; v_uang_kehadiran NUMERIC;
    v_lembur_rate NUMERIC; v_lembur_tm_rate NUMERIC;
    v_pot_telat_rate NUMERIC;
    
    v_uang_lembur NUMERIC;
    v_potongan_kesiangan NUMERIC;
    
    v_total_akhir_bulan NUMERIC;
    v_total_tgl_15 NUMERIC;
    v_total_all NUMERIC;
    
    v_count INT := 0;
BEGIN
    -- Loop semua karyawan yang ada di master atau presensi bulan ini
    FOR r_emp IN 
        SELECT DISTINCT kode FROM data_karyawan_admin_pabrik WHERE bulan = p_bulan
        UNION 
        SELECT DISTINCT kode FROM presensi_harian_admin_pabrik WHERE bulan = p_bulan
    LOOP
        -- 1. Hitung Presensi
        SELECT 
            COUNT(*) FILTER (WHERE kehadiran ILIKE 'Hadir%' OR kehadiran ILIKE 'H'),
            COUNT(*) FILTER (WHERE kehadiran ILIKE 'Sakit%' OR kehadiran ILIKE 'S'),
            COUNT(*) FILTER (WHERE kehadiran ILIKE 'Izin%' OR kehadiran ILIKE 'I'),
            COUNT(*) FILTER (WHERE kehadiran ILIKE 'Alpha%' OR kehadiran ILIKE 'A'),
            COUNT(*) FILTER (WHERE kehadiran ILIKE 'Telat%'), -- Hitung Telat
            COALESCE(SUM(jam_lembur), 0),
            COALESCE(SUM(lembur_tm), 0)
        INTO v_h, v_s, v_i, v_t, v_telat, v_lembur_jam, v_lembur_tm_jam
        FROM presensi_harian_admin_pabrik
        WHERE kode = r_emp.kode AND bulan = p_bulan;

        -- 2. Ambil Master Gaji
        SELECT 
            gaji_pokok, tunjangan_jabatan, uang_makan, 
            tunjangan_transportasi, insentif, uang_kehadiran,
            lembur_per_jam, lembur_tanggal_merah,
            COALESCE(nominal_potongan_telat, 0) -- Ambil rate potongan telat
        INTO v_gapok, v_tunj_jabatan, v_tunj_makan, 
             v_tunj_transport, v_insentif, v_uang_kehadiran,
             v_lembur_rate, v_lembur_tm_rate, v_pot_telat_rate
        FROM master_gaji_admin_pabrik m
        JOIN data_karyawan_admin_pabrik k ON m.jabatan = k.jabatan AND m.divisi = k.divisi
        WHERE k.kode = r_emp.kode AND k.bulan = p_bulan AND m.bulan = p_bulan
        LIMIT 1;

        -- Fallback jika master tidak ditemukan
        IF v_gapok IS NULL THEN
             v_gapok := 0; v_tunj_jabatan := 0; v_tunj_makan := 0;
             v_tunj_transport := 0; v_insentif := 0; v_uang_kehadiran := 0;
             v_lembur_rate := 0; v_lembur_tm_rate := 0; v_pot_telat_rate := 0;
        END IF;

        -- 3. Hitung Nominal
        v_uang_lembur := (v_lembur_jam * v_lembur_rate) + (v_lembur_tm_jam * v_lembur_tm_rate);
        v_potongan_kesiangan := v_telat * v_pot_telat_rate; -- Hitung Potongan

        -- Total Akhir Bulan (Gaji Pokok + Tunj Jabatan + Makan + Lembur)
        v_total_akhir_bulan := v_gapok + v_tunj_jabatan + v_tunj_makan + v_uang_lembur;

        -- Total Tgl 15 (Transport + Insentif + Kehadiran - Potongan Kesiangan)
        v_total_tgl_15 := v_tunj_transport + v_insentif + v_uang_kehadiran - v_potongan_kesiangan;

        v_total_all := v_total_akhir_bulan + v_total_tgl_15;

        -- 4. Upsert Laporan
        INSERT INTO laporan_bulanan_admin_pabrik (
            bulan, kode, nama, jabatan, divisi, perusahaan,
            h, s, i, t, telat,
            lembur_jam, lembur_tm_jam,
            gaji_pokok, tunjangan_jabatan, uang_makan, uang_lembur,
            tunjangan_transportasi, insentif, uang_kehadiran, potongan_kesiangan,
            total_gaji_akhir_bulan, total_gaji_tgl_15, total_gaji_keseluruhan,
            updated_at
        )
        SELECT 
            p_bulan, k.kode, k.nama, k.jabatan, k.divisi, k.perusahaan,
            v_h, v_s, v_i, v_t, v_telat,
            v_lembur_jam, v_lembur_tm_jam,
            v_gapok, v_tunj_jabatan, v_tunj_makan, v_uang_lembur,
            v_tunj_transport, v_insentif, v_uang_kehadiran, v_potongan_kesiangan,
            v_total_akhir_bulan, v_total_tgl_15, v_total_all,
            NOW()
        FROM data_karyawan_admin_pabrik k
        WHERE k.kode = r_emp.kode AND k.bulan = p_bulan
        ON CONFLICT (bulan, kode) DO UPDATE SET
            h = EXCLUDED.h, s = EXCLUDED.s, i = EXCLUDED.i, t = EXCLUDED.t, telat = EXCLUDED.telat,
            lembur_jam = EXCLUDED.lembur_jam, lembur_tm_jam = EXCLUDED.lembur_tm_jam,
            gaji_pokok = EXCLUDED.gaji_pokok, tunjangan_jabatan = EXCLUDED.tunjangan_jabatan,
            uang_makan = EXCLUDED.uang_makan, uang_lembur = EXCLUDED.uang_lembur,
            tunjangan_transportasi = EXCLUDED.tunjangan_transportasi, insentif = EXCLUDED.insentif,
            uang_kehadiran = EXCLUDED.uang_kehadiran, potongan_kesiangan = EXCLUDED.potongan_kesiangan,
            total_gaji_akhir_bulan = EXCLUDED.total_gaji_akhir_bulan,
            total_gaji_tgl_15 = EXCLUDED.total_gaji_tgl_15,
            total_gaji_keseluruhan = EXCLUDED.total_gaji_keseluruhan,
            updated_at = NOW();
            
        v_count := v_count + 1;
    END LOOP;

    RETURN 'Berhasil menghitung ulang ' || v_count || ' data admin.';
END;
$function$;

NOTIFY pgrst, 'reload config';
  `;

  const handleCopySQL = () => {
    navigator.clipboard.writeText(sqlUpdateCode);
    setSuccessModal({ isOpen: true, title: 'SQL Disalin', message: 'Silakan jalankan kode di SQL Editor Supabase.' });
  };

  // 1. Fetch Available Months
  useEffect(() => {
    const fetchMonths = async () => {
      if (!isSupabaseConfigured()) return;
      const { data } = await supabase.from('data_karyawan_admin_pabrik').select('bulan').order('created_at', { ascending: false });
      if (data) {
        const months = [...new Set(data.map(d => d.bulan))].filter(Boolean);
        setAvailableMonths(months);
        if (months.length > 0 && !filterMonth) setFilterMonth(months[0]);
      }
    };
    fetchMonths();
  }, []);

  // 2. Fetch Report Data (From Table)
  const fetchData = async () => {
    if (!filterMonth) return;
    setIsLoading(true);
    setIsTableMissing(false);
    
    try {
        let query = supabase
            .from('laporan_bulanan_admin_pabrik')
            .select('*')
            .eq('bulan', filterMonth);

        if (searchTerm) {
            query = query.or(`nama.ilike.%${searchTerm}%,jabatan.ilike.%${searchTerm}%`);
        }

        const { data: result, error } = await query.order('nama', { ascending: true });

        if (error) {
            if (error.code === '42P01' || error.message.includes('does not exist')) {
                setIsTableMissing(true);
            }
            throw error;
        }

        setData(result || []);
    } catch (error: any) {
        console.error("Fetch error:", error);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterMonth, searchTerm]);

  // 3. Manual Recalculate
  const handleRecalculate = async () => {
    if (!filterMonth) return;
    setIsRecalculating(true);
    
    try {
        const { data: msg, error } = await supabase.rpc('sync_admin_monthly_report', { p_bulan: filterMonth });
        
        if (error) {
            // Jika error function not found, tawarkan update SQL
            if (error.code === '42883' || error.message.includes('function')) {
                setShowSqlModal(true);
                throw new Error("Fungsi database perlu diperbarui. Silakan jalankan script SQL.");
            }
            throw error;
        }

        setSuccessModal({ 
            isOpen: true, 
            title: 'Hitung Ulang Selesai', 
            message: msg || 'Data laporan berhasil diperbarui.' 
        });
        fetchData();
    } catch (error: any) {
        setErrorModal({ isOpen: true, title: 'Gagal', message: error.message });
    } finally {
        setIsRecalculating(false);
    }
  };

  const handleExport = () => {
    if (data.length === 0) return;
    
    const exportData = data.map(item => ({
        'Bulan': item.bulan,
        'Nama': item.nama,
        'Jabatan': item.jabatan,
        'Divisi': item.divisi,
        'Hadir': item.h,
        'Sakit': item.s,
        'Izin': item.i,
        'Alpha': item.t,
        'Telat': item.telat || 0, // Export Telat
        'Lembur (Jam)': item.lembur_jam,
        'Lembur TM (Jam)': item.lembur_tm_jam,
        'Gaji Pokok': item.gaji_pokok,
        'Uang Makan': item.uang_makan,
        'Uang Lembur': item.uang_lembur,
        'Total Akhir Bulan': item.total_gaji_akhir_bulan,
        'Uang Kehadiran': item.uang_kehadiran,
        'Pot. Kesiangan': item.potongan_kesiangan || 0, // Export Potongan
        'Insentif': item.insentif,
        'Tunj. Transport': item.tunjangan_transportasi,
        'Tunj. Jabatan': item.tunjangan_jabatan,
        'Total Tgl 15': item.total_gaji_tgl_15,
        'Total Gaji Keseluruhan': item.total_gaji_keseluruhan
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Admin");
    XLSX.writeFile(wb, `Laporan_Admin_${filterMonth || 'All'}.xlsx`);
  };

  const formatRupiah = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

  // --- CALCULATE TOTALS ---
  const totalGaji = useMemo(() => {
    return data.reduce((acc, curr) => acc + (Number(curr.total_gaji_keseluruhan) || 0), 0);
  }, [data]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm gap-4 shrink-0">
        <div className="flex items-center gap-2">
            <FileText className="text-erp-pink" size={20}/>
            <div>
                <h3 className="font-bold text-gray-800">Laporan Gaji Bulanan</h3>
                <p className="text-xs text-gray-500">Data otomatis dihitung dari Presensi & Master Gaji</p>
            </div>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                    type="text" 
                    placeholder="Cari Nama..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-erp-pink"
                />
            </div>
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-erp-pink outline-none cursor-pointer">
                <option value="" disabled>Pilih Bulan</option>
                {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            
            <button 
                onClick={handleRecalculate} 
                disabled={isRecalculating}
                className="bg-orange-50 text-orange-600 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border border-orange-200 hover:bg-orange-100 transition-colors disabled:opacity-50"
            >
                {isRecalculating ? <Loader2 className="animate-spin" size={16}/> : <Calculator size={16}/>} Hitung Ulang
            </button>
            
            <button onClick={handleExport} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-green-700 transition-colors shadow-sm">
                <Download size={16}/> Export
            </button>

            {/* Tombol Update Database */}
            <button 
                onClick={() => setShowSqlModal(true)} 
                className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                title="Update Struktur Database"
            >
                <Wrench size={18}/>
            </button>
        </div>
      </div>

      {/* --- SUMMARY CARDS --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-green-50 border border-green-200 p-4 rounded-xl shadow-sm flex flex-col justify-between">
             <div className="flex items-center gap-2 text-green-700 font-bold text-xs uppercase mb-1">
                <Wallet size={14}/> Total Gaji Admin (Net)
             </div>
             <p className="text-2xl font-bold text-green-800">{formatRupiah(totalGaji)}</p>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl shadow-sm flex flex-col justify-between">
             <div className="flex items-center gap-2 text-blue-700 font-bold text-xs uppercase mb-1">
                <Users size={14}/> Total Karyawan
             </div>
             <p className="text-2xl font-bold text-blue-800">{data.length}</p>
          </div>
      </div>

      {isTableMissing ? (
        <div className="bg-red-50 border border-red-200 p-8 rounded-xl text-center">
            <Database className="mx-auto text-red-400 mb-2" size={32}/>
            <h3 className="text-lg font-bold text-red-800">Tabel Laporan Belum Dibuat</h3>
            <p className="text-red-600 text-sm mb-4">Silakan jalankan script SQL migrasi untuk membuat tabel laporan.</p>
            <button onClick={() => setShowSqlModal(true)} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Buka Script SQL
            </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
            <div className="overflow-auto max-h-[600px] custom-scrollbar relative">
            <table className="w-full text-xs text-left whitespace-nowrap relative border-collapse">
                <thead className="bg-gray-100 font-bold text-gray-600 border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <tr>
                    <th className="px-6 py-4 bg-gray-100">Bulan</th>
                    <th className="px-6 py-4 bg-gray-100">Nama</th>
                    <th className="px-6 py-4 bg-gray-100">Jabatan</th>
                    
                    {/* Attendance Group */}
                    <th className="px-2 py-4 text-center bg-blue-50 text-blue-800 border-l border-blue-100" title="Hadir">H</th>
                    <th className="px-2 py-4 text-center bg-yellow-50 text-yellow-800" title="Sakit">S</th>
                    <th className="px-2 py-4 text-center bg-green-50 text-green-800" title="Izin">I</th>
                    <th className="px-2 py-4 text-center bg-red-50 text-red-800" title="Alpha/Tanpa Keterangan">A</th>
                    <th className="px-2 py-4 text-center bg-purple-50 text-purple-800 border-r border-purple-100" title="Telat">Telat</th>
                    
                    {/* Lembur Columns */}
                    <th className="px-4 py-4 text-center bg-orange-50/50 text-orange-800">Lembur (Jam)</th>
                    <th className="px-4 py-4 text-center bg-red-50/50 text-red-800">Lembur TM (Jam)</th>

                    {/* Gaji Akhir Bulan Group */}
                    <th className="px-6 py-4 text-right bg-blue-50/50">Gaji Pokok</th>
                    <th className="px-6 py-4 text-right bg-blue-50/50">Tunj. Jabatan</th>
                    <th className="px-6 py-4 text-right bg-blue-50/50">Tunj. Makan</th>
                    
                    <th className="px-6 py-4 text-right bg-blue-50/50">Uang Lembur</th>
                    
                    <th className="px-6 py-4 text-right font-bold bg-blue-100 text-blue-800">Total Akhir Bulan</th>

                    {/* Gaji Tgl 15 Group */}
                    <th className="px-6 py-4 text-right bg-yellow-50/50">Tunj. Transport</th>
                    <th className="px-6 py-4 text-right bg-yellow-50/50">Insentif</th>
                    <th className="px-6 py-4 text-right bg-yellow-50/50">Uang Kehadiran</th>
                    <th className="px-6 py-4 text-right bg-red-50/50 text-red-700">Pot. Kesiangan</th>
                    <th className="px-6 py-4 text-right font-bold bg-yellow-100 text-yellow-800">Total Tgl 15</th>

                    <th className="px-6 py-4 text-right font-bold bg-green-50 text-green-800 border-l border-green-200">Total Keseluruhan</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                    <tr><td colSpan={21} className="p-8 text-center"><Loader2 className="animate-spin inline"/> Memuat data...</td></tr>
                ) : data.length > 0 ? (
                    data.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-gray-600">{item.bulan}</td>
                        <td className="px-6 py-4 font-medium text-gray-900">{item.nama}</td>
                        <td className="px-6 py-4 text-gray-600">{item.jabatan}</td>
                        
                        {/* Attendance Data */}
                        <td className="px-2 py-4 text-center font-bold bg-blue-50/30 text-blue-700 border-l border-blue-50">{item.h}</td>
                        <td className="px-2 py-4 text-center bg-yellow-50/30 text-yellow-700">{item.s}</td>
                        <td className="px-2 py-4 text-center bg-green-50/30 text-green-700">{item.i}</td>
                        <td className="px-2 py-4 text-center bg-red-50/30 text-red-700">{item.t}</td>
                        <td className="px-2 py-4 text-center bg-purple-50/30 text-purple-700 border-r border-purple-50 font-bold">{item.telat || 0}</td>
                        
                        {/* Lembur Columns */}
                        <td className="px-4 py-4 text-center bg-orange-50/30 text-orange-700 font-medium">{item.lembur_jam || 0}</td>
                        <td className="px-4 py-4 text-center bg-red-50/30 text-red-700 font-medium">{item.lembur_tm_jam || 0}</td>

                        <td className="px-6 py-4 text-right text-gray-600">{formatRupiah(item.gaji_pokok)}</td>
                        <td className="px-6 py-4 text-right text-gray-600">{formatRupiah(item.tunjangan_jabatan)}</td>
                        <td className="px-6 py-4 text-right text-gray-600">{formatRupiah(item.uang_makan)}</td>
                        
                        <td className="px-6 py-4 text-right text-gray-600 font-medium">{formatRupiah(item.uang_lembur)}</td>
                        
                        <td className="px-6 py-4 text-right font-bold text-blue-700 bg-blue-50/30">{formatRupiah(item.total_gaji_akhir_bulan)}</td>

                        <td className="px-6 py-4 text-right text-gray-600">{formatRupiah(item.tunjangan_transportasi)}</td>
                        <td className="px-6 py-4 text-right text-gray-600">{formatRupiah(item.insentif)}</td>
                        <td className="px-6 py-4 text-right text-gray-600">{formatRupiah(item.uang_kehadiran)}</td>
                        <td className="px-6 py-4 text-right text-red-600 font-medium">{item.potongan_kesiangan > 0 ? `-${formatRupiah(item.potongan_kesiangan)}` : '-'}</td>
                        <td className="px-6 py-4 text-right font-bold text-yellow-700 bg-yellow-50/30">{formatRupiah(item.total_gaji_tgl_15)}</td>

                        <td className="px-6 py-4 text-right font-bold text-green-700 bg-green-50/30 border-l border-green-100">{formatRupiah(item.total_gaji_keseluruhan)}</td>
                    </tr>
                    ))
                ) : (
                    <tr><td colSpan={21} className="p-8 text-center text-gray-500 italic">Tidak ada data laporan. Klik "Hitung Ulang" untuk sinkronisasi.</td></tr>
                )}
                </tbody>
            </table>
            </div>
        </div>
      )}

      {/* SQL FIX MODAL */}
      {showSqlModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-blue-50">
              <h3 className="font-bold text-lg text-blue-800 flex items-center gap-2">
                <Database size={20}/> Update Database (Kolom Baru)
              </h3>
              <button onClick={() => setShowSqlModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 text-sm mb-4">
                Untuk menampilkan kolom <b>Telat</b> dan <b>Potongan Kesiangan</b>, struktur database perlu diperbarui.
                <br/>Silakan salin kode SQL di bawah ini dan jalankan di <b>Supabase SQL Editor</b>.
              </p>
              
              <div className="relative">
                <textarea 
                  className="w-full h-64 p-4 text-xs font-mono bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
                  readOnly
                  value={sqlUpdateCode}
                  onClick={(e) => e.currentTarget.select()}
                />
                <button 
                  onClick={handleCopySQL}
                  className="absolute top-2 right-2 p-2 bg-white rounded-md shadow-sm border border-gray-200 hover:bg-gray-50 text-gray-600"
                  title="Salin Kode"
                >
                  <Copy size={16}/>
                </button>
              </div>

              <div className="mt-4 flex justify-end gap-3">
                <button 
                    onClick={() => setShowSqlModal(false)} 
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium"
                >
                    Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message} />
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message} />
    </div>
  );
};
