import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, History, ArrowRight, ArrowLeft, Package, AlertCircle, List, TrendingUp, ArrowDownLeft, ArrowUpRight, Info, Filter, Trash2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface StockBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  skuId: string;
  skuName: string;
  currentStock: number;
}

export const StockBreakdownModal: React.FC<StockBreakdownModalProps> = ({
  isOpen,
  onClose,
  skuId,
  skuName,
  currentStock
}) => {
  const [loading, setLoading] = useState(true);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'in' | 'out'>('summary');
  
  // Filter untuk Tab Rincian
  const [filterType, setFilterType] = useState<'all' | 'sales' | 'other'>('all');

  useEffect(() => {
    if (isOpen && skuId) {
      calculateBreakdown();
      setActiveTab('summary');
      setFilterType('all');
    }
  }, [isOpen, skuId]);

  const calculateBreakdown = async () => {
    setLoading(true);
    try {
      // 1. Ambil SEMUA riwayat mutasi untuk SKU ini
      const { data: allMutations, error } = await supabase
        .from('riwayat_mutasi')
        .select('*')
        .eq('sku_id', skuId)
        .order('created_at', { ascending: false })
        .limit(2000);

      if (error) throw error;

      // 2. Filter hanya mutasi yang berhubungan dengan RAK / DISPLAY
      const rackMutations = (allMutations || []).filter(m => {
          const target = (m.lokasi_tujuan || '').toLowerCase();
          const source = (m.lokasi_asal || '').toLowerCase();
          return target.includes('rak') || target.includes('display') || source.includes('rak') || source.includes('display');
      });

      // 3. Cari Stock Opname Terakhir (Basis Perhitungan)
      
      // A. Cek di Riwayat Mutasi
      const mutationSOIndex = rackMutations.findIndex(m => 
          (m.jenis_mutasi || '').toLowerCase().includes('stock opname')
      );
      const mutationSO = mutationSOIndex !== -1 ? rackMutations[mutationSOIndex] : null;

      // B. Cek di Arsip SO Rak (FALLBACK jika di mutasi tidak ketemu/lebih lama)
      const { data: archiveSO } = await supabase
        .from('stock_opname_rak')
        .select('qty_fisik, tanggal, created_at')
        .eq('sku_id', skuId)
        .eq('status', 'Diterapkan')
        .order('tanggal', { ascending: false })
        .limit(1)
        .maybeSingle();

      // C. Tentukan Basis Mana yang Dipakai (Paling Baru)
      let finalBaseStock = 0;
      let finalBaseDate = new Date('2000-01-01');
      let cutoffIndex = -1;
      let sourceInfo = 'Belum pernah Stock Opname';

      // Cek Tanggal Mutasi SO
      if (mutationSO) {
          const mDate = new Date(mutationSO.created_at);
          if (mDate > finalBaseDate) {
              finalBaseDate = mDate;
              finalBaseStock = Number(mutationSO.jumlah || 0);
              cutoffIndex = mutationSOIndex;
              sourceInfo = `Stock Opname (Log Mutasi)`;
          }
      }

      // Cek Tanggal Arsip SO
      if (archiveSO) {
          const aDate = archiveSO.created_at ? new Date(archiveSO.created_at) : new Date(`${archiveSO.tanggal}T23:59:59`);
          if (aDate > finalBaseDate) {
              finalBaseDate = aDate;
              finalBaseStock = Number(archiveSO.qty_fisik || 0);
              // Cari index di history yang lebih tua dari tanggal arsip SO
              cutoffIndex = rackMutations.findIndex(m => new Date(m.created_at) < aDate);
              if (cutoffIndex === -1) cutoffIndex = rackMutations.length; 
              sourceInfo = `Stock Opname (Arsip)`;
          }
      }

      // 4. Proses SEMUA Mutasi (Tapi tandai yang Pre-SO)
      let totalIn = 0;
      let outOther = 0;
      let detailsIn: any[] = [];
      let detailsOut: any[] = [];

      rackMutations.forEach((m, index) => {
        const isPreSO = cutoffIndex !== -1 && index >= cutoffIndex; // Item lebih tua atau sama dengan SO
        
        const isRakTujuan = (m.lokasi_tujuan || '').toLowerCase().match(/rak|display/);
        const isRakAsal = (m.lokasi_asal || '').toLowerCase().match(/rak|display/);
        const qty = Number(m.jumlah || 0);
        const type = (m.jenis_mutasi || '').toLowerCase();

        // Abaikan internal move & record SO itu sendiri dari list detail (kecuali untuk debugging)
        if ((isRakTujuan && isRakAsal) || type.includes('stock opname')) return;

        if (isRakTujuan) {
            // [FIX LOGIC] 
            // Jangan hitung "Pembatalan Outbound" sebagai Masuk, 
            // karena kita menggunakan Real Active Sales untuk menghitung Keluar.
            const isIgnoredType = type.includes('pembatalan') || type.includes('koreksi');
            
            if (!isPreSO && !isIgnoredType) {
                totalIn += qty;
            }
            
            m.isPreSO = isPreSO;
            m.isIgnored = isIgnoredType;
            detailsIn.push(m);

        } else if (isRakAsal) {
            const note = (m.keterangan || '').toLowerCase();
            const isSales = type.includes('outbound') || type.includes('penjualan') || note.includes('invoice');
            
            if (isSales) {
                m.category = 'sales'; 
            } else {
                if (!isPreSO) {
                    outOther += qty;
                }
                m.category = 'other'; 
            }
            
            m.isPreSO = isPreSO;
            detailsOut.push(m);
        }
      });

      // 6. Fetch Real Active Sales (982)
      // Ini menghitung apa yang BENAR-BENAR ada di tabel Outbound saat ini.
      const { data: activeOutbound } = await supabase
        .from('outbound_items')
        .select('quantity, outbound!inner(tanggal)')
        .eq('sku_id', skuId)
        .gt('outbound.created_at', finalBaseDate.toISOString()); 
      
      const realActiveSales = activeOutbound?.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0) || 0;

      // 7. Final Calculation
      const totalOutCalculated = realActiveSales + outOther;
      const calculatedStock = finalBaseStock + totalIn - totalOutCalculated;

      setBreakdown({
        baseDate: finalBaseDate.getFullYear() === 2000 ? null : finalBaseDate,
        baseStock: finalBaseStock,
        sourceInfo,
        totalIn,
        totalOut: totalOutCalculated,
        realActiveSales,
        outOther,
        calculatedStock,
        detailsIn,
        detailsOut
      });

    } catch (err) {
      console.error("Error calculating breakdown:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const getFilteredList = () => {
      if (activeTab === 'in') return breakdown?.detailsIn || [];
      if (activeTab === 'out') {
          const list = breakdown?.detailsOut || [];
          if (filterType === 'all') return list;
          return list.filter((item: any) => item.category === filterType);
      }
      return [];
  };

  const currentList = getFilteredList();
  
  // Hitung total hanya untuk item yang AKTIF (tidak Pre-SO dan tidak Ignored)
  const currentTotalQty = currentList.reduce((sum: number, item: any) => {
      if (item.isPreSO || item.isIgnored) return sum;
      return sum + (Number(item.jumlah) || 0);
  }, 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
            <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
              <History size={20} className="text-erp-pink"/> Bedah Stok Rak
            </h3>
            <p className="text-sm text-gray-500 font-medium">{skuName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 bg-white px-4 pt-2">
            <button 
                onClick={() => setActiveTab('summary')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'summary' ? 'border-erp-pink text-erp-pink' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
                <TrendingUp size={16}/> Ringkasan
            </button>
            <button 
                onClick={() => setActiveTab('in')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'in' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
                <ArrowDownLeft size={16}/> Masuk ({breakdown?.detailsIn?.length || 0})
            </button>
            <button 
                onClick={() => { setActiveTab('out'); setFilterType('all'); }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'out' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
                <ArrowUpRight size={16}/> Keluar ({breakdown?.detailsOut?.length || 0})
            </button>
        </div>

        {/* Sub-Filter for Out Tab */}
        {activeTab === 'out' && (
            <div className="px-4 py-2 bg-orange-50 border-b border-orange-100 flex gap-2">
                <button 
                    onClick={() => setFilterType('all')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterType === 'all' ? 'bg-orange-200 text-orange-800' : 'bg-white text-gray-600 border border-gray-200'}`}
                >
                    Semua
                </button>
                <button 
                    onClick={() => setFilterType('sales')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${filterType === 'sales' ? 'bg-blue-200 text-blue-800' : 'bg-white text-gray-600 border border-gray-200'}`}
                >
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Penjualan
                </button>
                <button 
                    onClick={() => setFilterType('other')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${filterType === 'other' ? 'bg-red-200 text-red-800' : 'bg-white text-gray-600 border border-gray-200'}`}
                >
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    Lainnya
                </button>
            </div>
        )}

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar bg-gray-50 flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Loader2 className="animate-spin mb-2" size={32}/>
              <p>Menganalisa riwayat mutasi...</p>
            </div>
          ) : breakdown ? (
            <>
                {/* TAB SUMMARY */}
                {activeTab === 'summary' && (
                    <div className="space-y-6">
                        {/* 1. BASIS STOK (SO) */}
                        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex justify-between items-center">
                            <div>
                                <p className="text-xs font-bold text-blue-600 uppercase mb-1">1. Stok Awal (Basis)</p>
                                <div className="flex items-center gap-2 text-sm text-blue-800">
                                    <Package size={16}/>
                                    {breakdown.baseDate ? (
                                        <span>
                                            SO Terakhir: <b>{new Date(breakdown.baseDate).toLocaleDateString('id-ID')}</b>
                                            <span className="block text-[10px] text-blue-500 font-normal">Sumber: {breakdown.sourceInfo}</span>
                                        </span>
                                    ) : (
                                        <span>Belum pernah Stock Opname (Basis 0)</span>
                                    )}
                                </div>
                            </div>
                            <div className="text-3xl font-bold text-blue-700">{breakdown.baseStock}</div>
                        </div>

                        <div className="flex gap-4">
                            {/* 2. MASUK */}
                            <div className="flex-1 bg-green-50 border border-green-100 p-4 rounded-xl cursor-pointer hover:bg-green-100 transition-colors" onClick={() => setActiveTab('in')}>
                                <div className="flex justify-between items-start mb-2">
                                    <p className="text-xs font-bold text-green-600 uppercase">2. Total Masuk</p>
                                    <ArrowRight size={16} className="text-green-500"/>
                                </div>
                                <div className="text-3xl font-bold text-green-700 mb-1">+{breakdown.totalIn}</div>
                                <p className="text-[10px] text-green-600">Sejak SO Terakhir</p>
                            </div>

                            {/* 3. KELUAR */}
                            <div className="flex-1 bg-orange-50 border border-orange-100 p-4 rounded-xl cursor-pointer hover:bg-orange-100 transition-colors" onClick={() => setActiveTab('out')}>
                                <div className="flex justify-between items-start mb-2">
                                    <p className="text-xs font-bold text-orange-600 uppercase">3. Total Keluar</p>
                                    <ArrowLeft size={16} className="text-orange-500"/>
                                </div>
                                <div className="text-3xl font-bold text-orange-700 mb-2">-{breakdown.totalOut}</div>
                                
                                {/* BREAKDOWN PENJUALAN VS LAINNYA */}
                                <div className="text-xs bg-white/80 p-2.5 rounded border border-orange-200 space-y-1.5 shadow-sm">
                                    <div className="flex justify-between items-center text-blue-700">
                                        <span className="font-medium">Penjualan Aktif:</span>
                                        <span className="font-bold text-sm">{breakdown.realActiveSales}</span>
                                    </div>

                                    {breakdown.outOther > 0 && (
                                        <div className="flex justify-between items-center text-red-600 border-t border-dashed border-orange-200 pt-1">
                                            <span>Lainnya (Pindah/Rusak):</span>
                                            <span className="font-bold">{breakdown.outOther}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 4. HASIL AKHIR */}
                        <div className="border-t-2 border-gray-200 pt-4">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-gray-700">Perhitungan Sistem:</span>
                                <span className="font-mono text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                    {breakdown.baseStock} (Awal) + {breakdown.totalIn} (Masuk) - {breakdown.totalOut} (Keluar) =
                                </span>
                            </div>
                            <div className="flex justify-between items-center bg-gray-800 text-white p-4 rounded-xl shadow-lg">
                                <span className="font-bold uppercase text-sm">TOTAL STOK RAK SAAT INI</span>
                                <span className={`text-3xl font-bold ${breakdown.calculatedStock === currentStock ? 'text-green-400' : 'text-yellow-400'}`}>
                                    {breakdown.calculatedStock}
                                </span>
                            </div>
                            {breakdown.calculatedStock !== currentStock && (
                                <div className="mt-3 flex items-start gap-2 text-xs text-yellow-800 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                                    <AlertCircle size={16} className="shrink-0 mt-0.5 text-yellow-600"/>
                                    <p>
                                        Ada selisih dengan tampilan tabel utama ({currentStock}). 
                                        Hal ini mungkin karena delay sinkronisasi. Klik tombol <b>"Sync Stok"</b> di halaman utama untuk memperbaiki.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB LIST (IN/OUT) */}
                {(activeTab === 'in' || activeTab === 'out') && (
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col h-full">
                        {/* Info Banner for Pre-SO items */}
                        {currentList.some((i: any) => i.isPreSO) && (
                            <div className="bg-gray-100 p-2 text-xs text-gray-600 border-b border-gray-200 flex items-center gap-2">
                                <Info size={14}/>
                                <span>Item berwarna <b>abu-abu</b> adalah transaksi lama (sebelum SO) yang sudah termasuk dalam Stok Awal.</span>
                            </div>
                        )}

                        <div className="overflow-y-auto flex-1">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-100 text-gray-600 font-bold border-b border-gray-200 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3">Tanggal</th>
                                        <th className="px-4 py-3">Jenis Mutasi</th>
                                        <th className="px-4 py-3">Keterangan</th>
                                        <th className="px-4 py-3 text-right">Jumlah</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {currentList.map((item: any) => {
                                        const isSales = item.category === 'sales';
                                        const isPreSO = item.isPreSO;
                                        const isIgnored = item.isIgnored;
                                        const isGray = isPreSO || isIgnored;

                                        return (
                                            <tr key={item.id} className={`hover:bg-gray-50 ${isGray ? 'opacity-50 bg-gray-50' : ''}`}>
                                                <td className="px-4 py-2 text-gray-600 text-xs whitespace-nowrap">
                                                    {formatDate(item.created_at)}
                                                </td>
                                                <td className="px-4 py-2 font-medium text-gray-800">
                                                    {item.jenis_mutasi}
                                                    {activeTab === 'out' && isSales && (
                                                        <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Jual</span>
                                                    )}
                                                    {activeTab === 'out' && !isSales && (
                                                        <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Lainnya</span>
                                                    )}
                                                    {isPreSO && (
                                                        <span className="ml-2 text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">Sebelum SO</span>
                                                    )}
                                                    {isIgnored && (
                                                        <span className="ml-2 text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">Ignored</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2 text-gray-500 text-xs">
                                                    {item.keterangan || '-'}
                                                    <div className="text-[10px] text-gray-400 mt-0.5">
                                                        {item.lokasi_asal} ➝ {item.lokasi_tujuan}
                                                    </div>
                                                </td>
                                                <td className={`px-4 py-2 text-right font-bold ${isGray ? 'text-gray-400 line-through' : (activeTab === 'in' ? 'text-green-600' : 'text-orange-600')}`}>
                                                    {activeTab === 'in' ? '+' : '-'}{item.jumlah}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {currentList.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-gray-400 italic">
                                                Tidak ada data {activeTab === 'in' ? 'masuk' : (filterType !== 'all' ? `keluar (${filterType})` : 'keluar')}.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        
                        {/* TOTAL FOOTER (Hanya hitung yang AKTIF) */}
                        <div className="bg-gray-50 border-t border-gray-200 p-3 flex justify-between items-center font-bold text-sm">
                            <span className="text-gray-600 uppercase">Total {activeTab === 'in' ? 'Masuk' : (filterType === 'sales' ? 'Penjualan' : filterType === 'other' ? 'Lainnya' : 'Keluar')} (Aktif)</span>
                            <span className={`text-lg ${activeTab === 'in' ? 'text-green-700' : 'text-orange-700'}`}>
                                {activeTab === 'in' ? '+' : '-'}{currentTotalQty.toLocaleString()}
                            </span>
                        </div>
                    </div>
                )}
            </>
          ) : (
            <p className="text-center text-gray-500">Gagal memuat data.</p>
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
