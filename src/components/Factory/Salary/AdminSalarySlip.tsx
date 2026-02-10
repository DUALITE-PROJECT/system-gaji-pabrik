import React, { useState, useEffect, useRef } from 'react';
import { Printer, Search, Loader2, FileText, Building2, Filter } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';

export const AdminSalarySlip: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // New State for Filter Type
  const [filterType, setFilterType] = useState<'SEMUA' | 'AKHIR_BULAN' | 'TGL_15'>('SEMUA');
  
  // 1. Fetch Available Months
  useEffect(() => {
    const fetchMonths = async () => {
      if (!isSupabaseConfigured()) return;
      const { data } = await supabase.from('laporan_bulanan_admin_pabrik').select('bulan').order('created_at', { ascending: false });
      if (data) {
        const months = [...new Set(data.map(d => d.bulan))].filter(Boolean);
        setAvailableMonths(months);
        if (months.length > 0 && !selectedMonth) setSelectedMonth(months[0]);
      }
    };
    fetchMonths();
  }, []);

  // 2. Fetch Report Data
  useEffect(() => {
    const fetchData = async () => {
        if (!selectedMonth) return;
        setIsLoading(true);
        try {
            let query = supabase
                .from('laporan_bulanan_admin_pabrik')
                .select('*')
                .eq('bulan', selectedMonth);

            if (searchTerm) {
                query = query.or(`nama.ilike.%${searchTerm}%,kode.ilike.%${searchTerm}%`);
            }

            const { data: result, error } = await query.order('nama', { ascending: true });
            if (error) throw error;
            setData(result || []);
        } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };
    fetchData();
  }, [selectedMonth, searchTerm]);

  const handlePrint = () => {
    window.print();
  };

  const formatRupiah = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

  // --- RENDER SINGLE SLIP COMPONENT ---
  const renderSlip = (item: any, type: 'AKHIR_BULAN' | 'TGL_15', index: number) => {
    const isAkhirBulan = type === 'AKHIR_BULAN';
    const title = isAkhirBulan ? 'GAJI AKHIR BULAN' : 'TUNJANGAN (TGL 15)';
    const totalGaji = isAkhirBulan ? item.total_gaji_akhir_bulan : item.total_gaji_tgl_15;
    
    return (
      <div key={`${item.id}-${type}`} className="slip-card bg-white border-2 border-gray-800 p-4 w-[600px] text-xs shadow-lg relative flex flex-col mb-8 mx-auto page-break-inside-avoid">
        {/* Sequence Number */}
        <div className="absolute top-2 right-2 border-2 border-black px-2 py-0.5 font-bold text-lg">
            {String(index + 1).padStart(3, '0')} {isAkhirBulan ? 'A' : 'B'}
        </div>

        {/* Header */}
        <div className="flex justify-between items-end border-b-2 border-black pb-1 mb-2">
          <div>
            <h2 className="font-bold uppercase tracking-wider text-lg">{item.perusahaan || 'CV GARUT'}</h2>
            <p className="text-gray-600 text-[10px] uppercase tracking-widest">SLIP GAJI ADMIN</p>
          </div>
          <div className="text-right mr-12">
            <p className="font-bold text-sm">{item.bulan}</p>
            <p className="text-[10px] font-bold text-blue-700 uppercase">{title}</p>
          </div>
        </div>

        {/* Employee Info */}
        <div className="mb-2 grid grid-cols-2 gap-x-4 font-medium text-xs">
          <div className="flex justify-between"><span className="text-gray-600">Nama:</span><span className="font-bold">{item.nama}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Divisi:</span><span>{item.divisi}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Kode:</span><span className="font-mono">{item.kode}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Jabatan:</span><span>{item.jabatan}</span></div>
        </div>

        {/* Attendance Grid */}
        <div className="mb-2 border-y border-black py-1">
          <div className="grid grid-cols-5 gap-1 text-center text-xs">
            <div><span className="block text-gray-500">Hadir</span><span className="font-bold">{item.h}</span></div>
            <div><span className="block text-gray-500">Sakit</span><span className="font-bold">{item.s}</span></div>
            <div><span className="block text-gray-500">Izin</span><span className="font-bold">{item.i}</span></div>
            <div><span className="block text-gray-500">Lembur</span><span className="font-bold">{item.lembur_jam} Jam</span></div>
            <div><span className="block text-gray-500">Lembur TM</span><span className="font-bold">{item.lembur_tm_jam} Jam</span></div>
          </div>
        </div>

        {/* Earnings Content */}
        <div className="grid grid-cols-2 gap-4 mb-1 flex-1 text-xs min-h-[80px]">
          {isAkhirBulan ? (
            <>
                {/* KOLOM KIRI (AKHIR BULAN) */}
                <div>
                    <h3 className="font-bold border-b border-gray-300 pb-0.5 text-[8px] uppercase text-gray-500 mb-1">PENGHASILAN TETAP</h3>
                    <div className="mb-1"><div className="flex justify-between font-bold"><span>Gaji Pokok</span><span>{formatRupiah(item.gaji_pokok)}</span></div></div>
                    {item.uang_lembur > 0 && (
                        <div className="mb-1">
                            <div className="flex justify-between font-bold"><span>Lembur Total</span><span>{formatRupiah(item.uang_lembur)}</span></div>
                            <div className="text-[8px] text-gray-500 pl-1 border-l border-gray-300 mt-0.5">Termasuk Lembur Biasa & TM</div>
                        </div>
                    )}
                </div>
                {/* KOLOM KANAN (AKHIR BULAN) */}
                <div>
                    <h3 className="font-bold border-b border-gray-300 pb-0.5 text-[8px] uppercase text-gray-500 mb-1">TUNJANGAN HARIAN</h3>
                    <div className="mb-1"><div className="flex justify-between font-bold"><span>Uang Makan</span><span>{formatRupiah(item.uang_makan)}</span></div></div>
                </div>
            </>
          ) : (
            <>
                {/* KOLOM KIRI (TGL 15) */}
                <div>
                    <h3 className="font-bold border-b border-gray-300 pb-0.5 text-[8px] uppercase text-gray-500 mb-1">TUNJANGAN TETAP</h3>
                    <div className="mb-1"><div className="flex justify-between font-bold"><span>Tunj. Jabatan</span><span>{formatRupiah(item.tunjangan_jabatan)}</span></div></div>
                    <div className="mb-1"><div className="flex justify-between font-bold"><span>Tunj. Transport</span><span>{formatRupiah(item.tunjangan_transportasi)}</span></div></div>
                </div>
                {/* KOLOM KANAN (TGL 15) */}
                <div>
                    <h3 className="font-bold border-b border-gray-300 pb-0.5 text-[8px] uppercase text-gray-500 mb-1">INSENTIF & LAINNYA</h3>
                    <div className="mb-1"><div className="flex justify-between font-bold"><span>Uang Kehadiran</span><span>{formatRupiah(item.uang_kehadiran)}</span></div></div>
                    <div className="mb-1"><div className="flex justify-between font-bold"><span>Insentif</span><span>{formatRupiah(item.insentif)}</span></div></div>
                </div>
            </>
          )}
        </div>

        {/* Total & Footer */}
        <div className="mt-auto pt-1 border-t-2 border-black flex justify-between items-center">
          <span className="font-bold text-xs uppercase">TOTAL DITERIMA ({isAkhirBulan ? 'AKHIR BLN' : 'TGL 15'})</span>
          <span className="font-extrabold text-sm">{formatRupiah(totalGaji)}</span>
        </div>

        <div className="mt-2 flex justify-between items-end text-[8px]">
           <span>{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
           <div className="text-center"><p className="mb-6">Penerima</p><div className="border-b border-black w-24"></div><p className="mt-0.5 font-bold">No. {String(index + 1).padStart(3, '0')}</p></div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* --- TOOLBAR --- */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm gap-4 shrink-0 print:hidden">
        <div className="flex items-center gap-2">
            <FileText className="text-erp-pink" size={20}/>
            <div>
                <h3 className="font-bold text-gray-800">Cetak Slip Gaji Admin</h3>
                <p className="text-xs text-gray-500">Format: Akhir Bulan & Tanggal 15</p>
            </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                    type="text" 
                    placeholder="Cari Nama..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-erp-pink w-40"
                />
            </div>
            
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-erp-pink outline-none cursor-pointer">
                <option value="" disabled>Pilih Bulan</option>
                {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            {/* NEW: Filter Jenis Gaji */}
            <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <select 
                    value={filterType} 
                    onChange={(e) => setFilterType(e.target.value as any)} 
                    className="pl-9 pr-4 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink outline-none cursor-pointer"
                >
                    <option value="SEMUA">Semua Jenis</option>
                    <option value="AKHIR_BULAN">Gaji Akhir Bulan</option>
                    <option value="TGL_15">Gaji Tanggal 15</option>
                </select>
            </div>

            <button onClick={handlePrint} className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-md hover:bg-gray-900 transition-colors">
                <Printer size={16}/> Cetak Semua
            </button>
        </div>
      </div>

      {/* --- PREVIEW AREA --- */}
      <div className="bg-gray-100 p-6 overflow-auto h-[600px] rounded-xl border border-gray-200 print:bg-white print:p-0 print:border-none print:h-auto print:overflow-visible">
        {isLoading ? (
            <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-erp-pink" size={32}/></div>
        ) : data.length > 0 ? (
            <div className="flex flex-col items-center">
                {/* Print Styles */}
                <style>{`
                    @media print {
                        @page { size: A4; margin: 10mm; }
                        body { background: white; }
                        .print\\:hidden { display: none !important; }
                        .slip-card { 
                            break-inside: avoid; 
                            page-break-inside: avoid; 
                            border: 2px solid black !important;
                            box-shadow: none !important;
                            margin-bottom: 20px !important;
                            width: 100% !important;
                            max-width: 18cm !important;
                        }
                    }
                `}</style>

                {data.map((item, idx) => (
                    <div key={item.id} className="w-full flex flex-col items-center">
                        {/* Render Slip 1: Akhir Bulan */}
                        {(filterType === 'SEMUA' || filterType === 'AKHIR_BULAN') && renderSlip(item, 'AKHIR_BULAN', idx)}
                        
                        {/* Render Slip 2: Tanggal 15 */}
                        {(filterType === 'SEMUA' || filterType === 'TGL_15') && renderSlip(item, 'TGL_15', idx)}
                        
                        {/* Page Break for Print */}
                        <div className="print:block hidden w-full h-0 border-t border-dashed border-gray-300 my-4"></div>
                    </div>
                ))}
            </div>
        ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Building2 size={48} className="mb-4 opacity-20"/>
                <p>Tidak ada data slip gaji untuk bulan ini.</p>
            </div>
        )}
      </div>
    </div>
  );
};
