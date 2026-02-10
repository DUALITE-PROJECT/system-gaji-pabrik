import React, { useState, useEffect } from 'react';
import { X, Calculator, Tag, CheckCircle2, AlertCircle, Wallet, Clock, Info, Bug, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface SalaryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any; // Data baris laporan bulanan
  isGarut?: boolean; // Prop baru untuk membedakan logika
}

export const SalaryDetailModal: React.FC<SalaryDetailModalProps> = ({
  isOpen,
  onClose,
  data,
  isGarut = false
}) => {
  const [masterGaji, setMasterGaji] = useState<any>(null);
  const [p1Data, setP1Data] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sundayCount, setSundayCount] = useState(4); 
  
  // Debug State
  const [debugLog, setDebugLog] = useState<string>(''); 
  const [debugLoading, setDebugLoading] = useState(false);

  // Format Rupiah
  const fmt = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);

  useEffect(() => {
    if (isOpen && data) {
      fetchData();
      
      // Fetch Debug Log jika Garut & Periode 2
      if (isGarut && data.periode === 'Periode 2') {
          fetchDebugLog();
      } else {
          setDebugLog('');
      }
    }
  }, [isOpen, data]);

  const fetchDebugLog = async () => {
      setDebugLoading(true);
      setDebugLog('');
      try {
          const { data: log, error } = await supabase.rpc('debug_garut_bonus', { 
              p_bulan: data.bulan, 
              p_kode: data.kode 
          });
          
          if (error) {
              console.error("Debug fetch failed", error);
              setDebugLog(`Gagal memuat analisa: ${error.message}\n\nPastikan Anda sudah menjalankan script SQL V65 (Update DB).`);
          } else {
              setDebugLog(log || 'Tidak ada log yang dikembalikan oleh sistem.');
          }
      } catch (e: any) {
          setDebugLog(`Error System: ${e.message}`);
      } finally {
          setDebugLoading(false);
      }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Master Gaji
      const currentGrade = data.periode === 'Periode 1' ? data.grade_p1 : data.grade_p2;
      const { data: masters } = await supabase.from('master_gaji').select('*');
      
      if (masters) {
        const match = masters.find(m => {
            const mGrade = (m.grade || '').toString().trim().toUpperCase();
            const mBulan = (m.bulan || '').toString().trim().toLowerCase();
            const dataGrade = (currentGrade || '').toString().trim().toUpperCase();
            const dataBulan = (data.bulan || '').toString().trim().toLowerCase();
            return mGrade === dataGrade && (mBulan.includes(dataBulan) || dataBulan.includes(mBulan));
        });
        setMasterGaji(match || null);
      }

      // 2. Fetch Data Periode 1 (Jika sedang melihat Periode 2)
      if (data.periode === 'Periode 2') {
        // Tentukan tabel sumber berdasarkan isGarut
        const tableName = isGarut ? 'total_gaji_pabrik_garut' : 'laporan_bulanan_pabrik';
        
        const { data: p1 } = await supabase
          .from(tableName)
          .select('lp, tm')
          .eq('bulan', data.bulan)
          .eq('kode', data.kode)
          .eq('perusahaan', data.perusahaan)
          .eq('periode', 'Periode 1')
          .maybeSingle();
        setP1Data(p1 || { lp: 0, tm: 0 });
      } else {
        setP1Data(null);
      }

      // 3. Cek Jumlah Minggu (Untuk Info Potongan 5 Minggu)
      if (data.bulan) {
         const { data: count } = await supabase.rpc('count_sundays_in_month', { month_str: data.bulan });
         setSundayCount(count || 4);
      }

    } catch (error) {
      console.error("Error fetching details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !data) return null;

  // --- LOGIKA PERHITUNGAN DISPLAY ---
  const isPeriode1 = data.periode === 'Periode 1';
  const currentGrade = isPeriode1 ? data.grade_p1 : data.grade_p2;
  
  // Tarif
  const tarifHarian = masterGaji?.gaji_harian || (masterGaji?.gaji_pokok ? Math.round(masterGaji.gaji_pokok / 26) : 0);
  const tarifPerJam = masterGaji?.gaji_per_jam || Math.round(tarifHarian / 8);
  const tarifLembur = masterGaji?.lembur || 0;
  const baseMakan = masterGaji?.uang_makan || 0;
  const baseHadir = masterGaji?.uang_kehadiran || 0;
  
  // Tarif Harian Tunjangan (Untuk Garut)
  const tarifMakanHarian = masterGaji?.uang_makan_harian || Math.round(baseMakan / 26);
  const tarifHadirHarian = masterGaji?.uang_kehadiran_harian || Math.round(baseHadir / 26);

  // --- RENDER KHUSUS GARUT ---
  const renderGarutDetail = () => {
    if (!masterGaji) return <div className="p-6 text-center text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">Data Master Gaji tidak ditemukan untuk Grade <b>{currentGrade}</b> di bulan <b>{data.bulan}</b>.</div>;

    // Quantities
    const qH = Number(data.h || 0);
    const qSetH = Number(data.set_h || 0);
    const qLP = Number(data.lp || 0);
    const qTM = Number(data.tm || 0);
    const qLembur = Number(data.lembur || 0);
    
    // Totals (Calculated for display verification)
    const totalHariGapok = qH + qSetH + qLP + qTM;
    const calcGapok = totalHariGapok * tarifHarian;
    
    // Note: Di Garut, Tunjangan biasanya dihitung dari kehadiran fisik (H + SetH)
    const totalHariTunjangan = qH + qSetH; 
    const calcMakan = totalHariTunjangan * tarifMakanHarian;
    const calcHadir = totalHariTunjangan * tarifHadirHarian;
    const calcLembur = qLembur * tarifLembur;

    return (
      <div className="space-y-6">
        {/* 1. GAPOK SECTION */}
        <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
           <div className="flex justify-between items-center mb-4 border-b border-blue-50 pb-3">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                 <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">1</div>
                 Gaji Pokok (Gapok)
              </h3>
              <span className="text-lg font-bold text-blue-700">{fmt(data.gapok)}</span>
           </div>
           
           <div className="text-sm space-y-3 text-gray-600">
              <div className="flex justify-between items-center bg-blue-50/50 p-2 rounded-lg">
                 <span className="font-medium">Tarif Harian (Grade {currentGrade})</span>
                 <span className="font-mono font-bold text-blue-800">{fmt(tarifHarian)}</span>
              </div>
              
              <div className="space-y-1 pl-2 border-l-2 border-gray-100">
                  <div className="flex justify-between items-center">
                     <span>Hadir ({qH}) + Setengah ({qSetH})</span>
                     <span>{qH + qSetH} Hari</span>
                  </div>
                  <div className="flex justify-between items-center">
                     <span>Libur Perusahaan (LP)</span>
                     <span>{qLP} Hari</span>
                  </div>
                  <div className="flex justify-between items-center">
                     <span>Tanggal Merah (TM)</span>
                     <span>{qTM} Hari</span>
                  </div>
              </div>

              <div className="flex justify-between items-center font-bold text-gray-800 border-t border-gray-100 pt-2">
                 <span>Total Hari x Tarif</span>
                 <span>{totalHariGapok} x {fmt(tarifHarian)} = {fmt(calcGapok)}</span>
              </div>
           </div>
        </div>

        {/* 2. LEMBUR SECTION */}
        <div className="bg-white p-5 rounded-xl border border-orange-100 shadow-sm">
           <div className="flex justify-between items-center mb-4 border-b border-orange-50 pb-3">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                 <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs">2</div>
                 Gaji Lembur
              </h3>
              <span className="text-lg font-bold text-orange-700">{fmt(data.gaji_lembur)}</span>
           </div>
           <div className="text-sm space-y-2 text-gray-600">
              <div className="flex justify-between bg-orange-50/50 p-2 rounded-lg">
                 <span className="font-medium">Tarif Lembur / Jam</span>
                 <span className="font-mono font-bold text-orange-800">{fmt(tarifLembur)}</span>
              </div>
              <div className="flex justify-between items-center pl-2">
                 <span>Total Jam Lembur</span>
                 <span>{qLembur} Jam</span>
              </div>
              <div className="flex justify-between items-center font-bold text-gray-800 border-t border-gray-100 pt-2">
                 <span>Perhitungan</span>
                 <span>{qLembur} x {fmt(tarifLembur)} = {fmt(calcLembur)}</span>
              </div>
           </div>
        </div>

        {/* 3. TUNJANGAN SECTION */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm">
                <h3 className="font-bold text-gray-800 mb-3 flex justify-between items-center">
                    <span className="flex items-center gap-2"><div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-[10px]">3</div> Uang Makan</span>
                    <span className="text-green-700 font-bold">{fmt(data.u_m)}</span>
                </h3>
                <div className="text-sm space-y-2 text-gray-600">
                    <div className="flex justify-between bg-green-50/30 p-1.5 rounded"><span>Tarif/Hari</span><span className="font-mono">{fmt(tarifMakanHarian)}</span></div>
                    <div className="flex justify-between px-1"><span>Jml Hari</span><span>{totalHariTunjangan}</span></div>
                    <div className="text-xs text-gray-400 italic px-1">*Hadir + Setengah Hari</div>
                </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm">
                <h3 className="font-bold text-gray-800 mb-3 flex justify-between items-center">
                    <span className="flex items-center gap-2"><div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-[10px]">4</div> Uang Kehadiran</span>
                    <span className="text-green-700 font-bold">{fmt(data.u_k)}</span>
                </h3>
                <div className="text-sm space-y-2 text-gray-600">
                    <div className="flex justify-between bg-green-50/30 p-1.5 rounded"><span>Tarif/Hari</span><span className="font-mono">{fmt(tarifHadirHarian)}</span></div>
                    <div className="flex justify-between px-1"><span>Jml Hari</span><span>{totalHariTunjangan}</span></div>
                    <div className="text-xs text-gray-400 italic px-1">*Hadir + Setengah Hari</div>
                </div>
            </div>
        </div>

        {/* 4. LAIN-LAIN */}
        <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs">5</div>
                Lain-lain & Potongan
            </h3>
            <div className="space-y-3">
                <div className="flex justify-between items-center bg-white p-3 rounded border border-gray-100">
                    <span className="text-sm font-medium text-gray-600">Bonus</span>
                    <span className="text-green-600 font-bold">{fmt(data.uang_bonus)}</span>
                </div>
                <div className="flex justify-between items-center bg-white p-3 rounded border border-gray-100">
                    <span className="text-sm font-medium text-gray-600">Penyesuaian</span>
                    <span className="text-blue-600 font-bold">{fmt(data.penyesuaian_bonus)}</span>
                </div>
                <div className="flex justify-between items-center bg-white p-3 rounded border border-red-100">
                    <span className="text-sm font-medium text-gray-600">Kasbon (Potongan)</span>
                    <span className="text-red-600 font-bold">- {fmt(data.kasbon)}</span>
                </div>
            </div>
        </div>
      </div>
    );
  };

  // --- HITUNGAN RINCIAN POTONGAN (PERIODE 2 - NON GARUT) ---
  let breakdownPotongan: any[] = [];
  let totalPenaltyAmount = 0;

  if (!isPeriode1 && !isGarut) {
    // LOGIKA PABRIK UMUM (Dengan Denda)
    const calcProgresif = (n: number) => {
      let total = 0;
      for(let i=0; i<n; i++) total += 10000 + (i*2000);
      return total;
    };
    const calcFlat = (n: number) => n * 10000;

    const d_sb = calcProgresif(Number(data.s_b));
    const d_ib = calcProgresif(Number(data.i_b));
    const d_tb = calcProgresif(Number(data.t_b));
    const d_stb = calcFlat(Number(data.s_tb));
    const d_itb = calcFlat(Number(data.i_tb));
    const d_ttb = calcFlat(Number(data.t_tb));

    totalPenaltyAmount = d_sb + d_ib + d_tb + d_stb + d_itb + d_ttb;

    if (data.t_b > 0) breakdownPotongan.push({ label: `Tanpa Keterangan Berurutan (${data.t_b}x)`, val: d_tb });
    if (data.i_tb > 0) breakdownPotongan.push({ label: `Izin Tidak Berurutan (${data.i_tb}x)`, val: d_itb });
    if (data.t_tb > 0) breakdownPotongan.push({ label: `Tanpa Keterangan TB (${data.t_tb}x)`, val: d_ttb });
    if (data.s_b > 0) breakdownPotongan.push({ label: `Sakit Berpengaruh (${data.s_b}x)`, val: d_sb });
    if (data.i_b > 0) breakdownPotongan.push({ label: `Izin Berpengaruh (${data.i_b}x)`, val: d_ib });
    if (data.s_tb > 0) breakdownPotongan.push({ label: `Sakit TB (${data.s_tb}x)`, val: d_stb });

    // Potongan LP & TM
    const lpP1 = Number(p1Data?.lp || 0);
    const tmP1 = Number(p1Data?.tm || 0);
    const totalLP = Number(data.lp) + lpP1;
    const totalTM = Number(data.tm) + tmP1;

    if (totalLP > 0) breakdownPotongan.push({ label: `Libur Perusahaan (${totalLP} hari)`, valM: totalLP * tarifMakanHarian, valH: totalLP * tarifHadirHarian, isLPTM: true });
    if (totalTM > 0) breakdownPotongan.push({ label: `Tanggal Merah / TM (${totalTM} hari)`, valM: totalTM * tarifMakanHarian, valH: totalTM * tarifHadirHarian, isLPTM: true });
  }

  // Helper Render Potongan List (Non-Garut)
  const renderPotonganList = (isMakan: boolean) => {
    // LOGIKA UMUM (DENDA)
    if (breakdownPotongan.length === 0) return <div className="text-center text-gray-400 text-xs py-4">Tidak ada potongan</div>;
    
    let totalPot = 0;
    return (
      <div className="space-y-1 mt-2">
        {breakdownPotongan.map((item, idx) => {
          const val = item.isLPTM ? (isMakan ? item.valM : item.valH) : item.val;
          totalPot += val;
          return (
            <div key={idx} className="flex justify-between text-xs text-red-500">
              <span>{item.label}</span>
              <span>-{fmt(val)}</span>
            </div>
          );
        })}
        <div className="border-t border-red-100 mt-2 pt-2 flex justify-between font-bold text-sm text-red-700">
          <span>Total Potongan</span>
          <span>-{fmt(totalPot)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 animate-fadeIn font-sans">
      <div className="bg-gray-50 dark:bg-dark-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-200 bg-white sticky top-0 z-10 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Calculator className="text-erp-pink" size={24} />
              Rincian Perhitungan Gaji {isGarut ? '(Garut)' : ''}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-gray-600">
              <span className="font-bold text-gray-900">{data.nama}</span>
              <span>•</span>
              <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-200 text-xs font-mono">{data.kode}</span>
              <span>•</span>
              <span className="text-blue-600 font-medium">{data.periode}</span>
              <span>•</span>
              <span className="bg-purple-50 text-purple-700 border border-purple-100 px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1">
                <Tag size={12} /> Grade {currentGrade}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {/* --- CONDITIONAL RENDER: GARUT VS STANDARD --- */}
          {isGarut ? (
             renderGarutDetail()
          ) : (
            <>
              {/* 1. GAJI POKOK CARD */}
              <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="text-blue-600" size={20} />
                    <div>
                      <span className="text-sm text-blue-800 font-bold block">Gaji Pokok</span>
                      <span className="text-xs text-blue-600">Tarif: {fmt(tarifHarian)} / hari</span>
                    </div>
                  </div>
                  <span className="font-bold text-blue-700 text-lg">{fmt(data.gapok)}</span>
                </div>
                <div className="space-y-2 text-sm pl-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Hari Kerja ({data.h} hari)</span>
                    <span className="font-medium">{fmt(data.h * tarifHarian)}</span>
                  </div>
                  {data.set_h > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Setengah Hari ({data.set_h} x)</span>
                      <span className="font-medium">{fmt(data.set_h * (tarifHarian * 0.5))}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. LEMBUR CARD */}
              <div className="bg-white p-5 rounded-xl border border-orange-100 shadow-sm">
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="text-orange-600" size={20} />
                    <span className="text-sm text-orange-800 font-bold">Gaji Lembur</span>
                  </div>
                  <span className="font-bold text-orange-700 text-lg">{fmt(data.gaji_lembur)}</span>
                </div>
                <div className="flex justify-between items-center text-sm pl-2">
                  <span className="text-gray-600">Total Jam Lembur</span>
                  <div>
                    <span className="text-gray-400 mr-2 text-xs">({data.lembur} Jam x {fmt(tarifLembur)})</span>
                    <span className="font-medium text-gray-900">{fmt(data.gaji_lembur)}</span>
                  </div>
                </div>
              </div>

              {/* 3. UANG MAKAN, KEHADIRAN & BONUS (HANYA PERIODE 2) */}
              {!isPeriode1 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Uang Makan */}
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-800">Uang Makan</h3>
                        <span className="font-bold text-lg text-blue-600">{fmt(data.u_m)}</span>
                      </div>
                      
                      <div className="bg-gray-50 p-2 rounded border border-gray-100 flex justify-between items-center text-sm mb-3">
                        <span className="text-gray-500">Base (Master):</span>
                        <span className="font-bold text-gray-900">{fmt(baseMakan)}</span>
                      </div>

                      <div className="border-t border-dashed border-gray-200 my-2"></div>
                      {renderPotonganList(true)}
                    </div>

                    {/* Uang Kehadiran */}
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-800">Uang Kehadiran</h3>
                        <span className="font-bold text-lg text-blue-600">{fmt(data.u_k)}</span>
                      </div>
                      
                      <div className="bg-gray-50 p-2 rounded border border-gray-100 flex justify-between items-center text-sm mb-3">
                        <span className="text-gray-500">Base (Master):</span>
                        <span className="font-bold text-gray-900">{fmt(baseHadir)}</span>
                      </div>

                      <div className="border-t border-dashed border-gray-200 my-2"></div>
                      {renderPotonganList(false)}
                    </div>
                  </div>

                  {/* BONUS & LAINNYA */}
                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-purple-600"/> Bonus & Penyesuaian
                      </h3>
                      <span className="font-bold text-lg text-purple-700">{fmt(data.uang_bonus)}</span>
                    </div>

                    {data.penyesuaian_bonus !== 0 && (
                      <div className="flex justify-between text-blue-600 text-sm bg-blue-50 p-2 rounded border border-blue-100 mb-2">
                        <span>Penyesuaian Manual</span>
                        <span className="font-medium">{data.penyesuaian_bonus > 0 ? '-' : '+'}{fmt(Math.abs(data.penyesuaian_bonus))}</span>
                      </div>
                    )}
                    
                    {data.kasbon > 0 && (
                      <div className="flex justify-between text-red-600 text-sm bg-red-50 p-2 rounded border border-red-100">
                        <span>Potongan Kasbon</span>
                        <span className="font-medium">-{fmt(data.kasbon)}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                // INFO PERIODE 1
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
                  <div className="bg-gray-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Info className="text-gray-400" size={24} />
                  </div>
                  <h3 className="text-gray-800 font-bold mb-1">Informasi Periode 1</h3>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    Komponen <b>Uang Makan</b>, <b>Uang Kehadiran</b>, dan <b>Bonus</b> dihitung secara kumulatif dan dibayarkan pada <b>Periode 2</b>.
                  </p>
                </div>
              )}
            </>
          )}

          {/* --- DEBUG LOG SECTION (KHUSUS GARUT) --- */}
          {isGarut && (
              <div className="mt-6">
                  {debugLoading ? (
                      <div className="flex items-center justify-center gap-2 text-gray-500 text-sm bg-gray-100 p-4 rounded-xl border border-dashed border-gray-300">
                          <Loader2 className="animate-spin" size={16}/> Memuat Analisa Bonus...
                      </div>
                  ) : (
                      <div className="bg-gray-900 text-green-400 p-4 rounded-xl border border-gray-700 font-mono text-xs shadow-inner">
                          <h3 className="font-bold text-white mb-2 flex items-center gap-2 border-b border-gray-700 pb-2">
                              <Bug size={14}/> Analisa Bonus (Debug System)
                          </h3>
                          <pre className="whitespace-pre-wrap leading-relaxed">
                              {debugLog || 'Tidak ada data log. (Coba refresh)'}
                          </pre>
                      </div>
                  )}
              </div>
          )}

        </div>

        {/* Footer Total */}
        <div className="p-6 bg-white border-t border-gray-200 flex justify-between items-center sticky bottom-0 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <span className="text-gray-500 text-lg font-medium">Total Gaji Diterima</span>
          <span className="text-3xl font-bold text-gray-900">{fmt(data.hasil_gaji)}</span>
        </div>
      </div>
    </div>
  );
};
