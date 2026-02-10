import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Download, 
  RefreshCw, 
  Loader2,
  Database,
  Truck,
  Warehouse,
  LayoutGrid,
  DollarSign,
  TrendingUp,
  Package
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import * as XLSX from 'xlsx';

export const Recap: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]); // Awal bulan
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]); // Hari ini
  
  // State untuk Data
  const [summaryTop, setSummaryTop] = useState({
    totalSku: 0,
    totalPengiriman: 0,
    totalGudang: 0,
    totalRak: 0
  });

  const [summaryValues, setSummaryValues] = useState({
    nilaiInbound: 0,
    nilaiInventory: 0,
    nilaiRak: 0,
    nilaiOutbound: 0
  });

  const [dailyRecap, setDailyRecap] = useState<any[]>([]);

  // --- HELPER: FORMAT RUPIAH ---
  const formatRupiah = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value).replace('Rp', 'Rp ');
  };

  // --- FETCH DATA UTAMA ---
  const fetchData = async () => {
    setIsLoading(true);
    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }

    try {
      // 1. AMBIL MASTER SKU (Untuk HPP & Kategori)
      const { data: skus } = await supabase.from('master_sku').select('id, hpp, kategori, harga_jual');
      const skuMap = new Map(skus?.map((s: any) => [s.id, { 
        hpp: Number(s.hpp) || 0, 
        cat: s.kategori || 'Lainnya' 
      }]));

      // 2. HITUNG RINGKASAN ATAS (TOP CARDS)
      // Total SKU
      const totalSku = skus?.length || 0;

      // Total Pengiriman Pabrik (Count Header)
      const { count: countPengiriman } = await supabase
        .from('outbound_pabrik')
        .select('*', { count: 'exact', head: true });

      // Total Stok Gudang (Sum Qty)
      const { data: stokGudang } = await supabase.from('stok_gudang').select('quantity, sku_id');
      const totalGudang = stokGudang?.reduce((acc, curr) => acc + Number(curr.quantity), 0) || 0;
      
      // Hitung Nilai Inventory (Gudang)
      const nilaiInventory = stokGudang?.reduce((acc, curr) => {
        const skuInfo = skuMap.get(curr.sku_id);
        return acc + (Number(curr.quantity) * (skuInfo?.hpp || 0));
      }, 0) || 0;

      // Total Stok Rak (Sum Qty)
      const { data: stokRak } = await supabase.from('stok_rak').select('quantity, sku_id');
      const totalRak = stokRak?.reduce((acc, curr) => acc + Number(curr.quantity), 0) || 0;

      // Hitung Nilai Rak
      const nilaiRak = stokRak?.reduce((acc, curr) => {
        const skuInfo = skuMap.get(curr.sku_id);
        return acc + (Number(curr.quantity) * (skuInfo?.hpp || 0));
      }, 0) || 0;

      setSummaryTop({
        totalSku,
        totalPengiriman: countPengiriman || 0,
        totalGudang,
        totalRak
      });

      // 3. HITUNG DATA HARIAN
      
      // A. Inbound (Barang Masuk ke Gudang dari Pabrik)
      const { data: inboundItems } = await supabase
        .from('outbound_pabrik_items')
        .select(`quantity, sku_id, outbound_pabrik!inner(tanggal)`)
        .gte('outbound_pabrik.tanggal', startDate)
        .lte('outbound_pabrik.tanggal', endDate)
        .neq('outbound_pabrik.status', 'Draft'); // Hanya yang sudah dikirim/diterima

      // B. Rak Masuk (Dari Riwayat Mutasi dengan Tujuan Rak)
      // REVISI: Filter 'Stock Opname' agar tidak terhitung sebagai barang masuk
      const { data: rakMasukItems } = await supabase
        .from('riwayat_mutasi')
        .select(`jumlah, sku_id, created_at`)
        .or('lokasi_tujuan.ilike.%Rak%,lokasi_tujuan.ilike.%Display%') // Filter tujuan Rak
        .neq('jenis_mutasi', 'Stock Opname') // EXCLUDE STOCK OPNAME
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      // C. Outbound (Barang Keluar / Penjualan)
      const { data: outboundItems } = await supabase
        .from('outbound_items')
        .select(`quantity, sku_id, outbound!inner(tanggal)`)
        .gte('outbound.tanggal', startDate)
        .lte('outbound.tanggal', endDate);

      // --- AGREGASI DATA PER TANGGAL ---
      const dateMap: Record<string, any> = {};
      let totalNilaiInbound = 0;
      let totalNilaiOutbound = 0;

      // Helper untuk inisialisasi object tanggal
      const initDateObj = (date: string) => ({
        date,
        inbound: { tas: 0, celana: 0, fashion: 0 },
        gudang: { tas: 0, celana: 0, fashion: 0 }, // Gudang = Inbound (Asumsi barang masuk gudang)
        rak: { tas: 0, celana: 0, fashion: 0 }, 
        outboundEkspedisi: { tas: 0, celana: 0, fashion: 0 },
        outboundNon: { tas: 0, celana: 0, fashion: 0 },
        totalOut: { tas: 0, celana: 0, fashion: 0 }
      });

      const mapCategory = (cat: string) => {
        const c = (cat || '').toLowerCase();
        if (c.includes('tas')) return 'tas';
        if (c.includes('celana')) return 'celana';
        return 'fashion'; // Lainnya masuk fashion
      };

      // 1. Proses Inbound (Pabrik -> Gudang)
      inboundItems?.forEach((item: any) => {
        const date = item.outbound_pabrik.tanggal;
        if (!dateMap[date]) dateMap[date] = initDateObj(date);
        
        const skuInfo = skuMap.get(item.sku_id);
        const qty = Number(item.quantity);
        const catKey = mapCategory(skuInfo?.cat || '');
        
        // Tambah Qty Inbound & Gudang
        dateMap[date].inbound[catKey] += qty;
        dateMap[date].gudang[catKey] += qty; 

        // Tambah Nilai
        totalNilaiInbound += qty * (skuInfo?.hpp || 0);
      });

      // 2. Proses Rak Masuk (Gudang -> Rak)
      rakMasukItems?.forEach((item: any) => {
        // created_at format: YYYY-MM-DDTHH:mm:ss... ambil tanggalnya saja
        const date = new Date(item.created_at).toISOString().split('T')[0];
        if (!dateMap[date]) dateMap[date] = initDateObj(date);

        const skuInfo = skuMap.get(item.sku_id);
        const qty = Number(item.jumlah); // Kolom 'jumlah' di riwayat_mutasi
        const catKey = mapCategory(skuInfo?.cat || '');

        // Tambah Qty Rak
        dateMap[date].rak[catKey] += qty;
      });

      // 3. Proses Outbound (Penjualan)
      outboundItems?.forEach((item: any) => {
        const date = item.outbound.tanggal;
        if (!dateMap[date]) dateMap[date] = initDateObj(date);

        const skuInfo = skuMap.get(item.sku_id);
        const qty = Number(item.quantity);
        const catKey = mapCategory(skuInfo?.cat || '');

        // Masukkan ke kolom Outbound (Misal Ekspedisi sebagai default)
        dateMap[date].outboundEkspedisi[catKey] += qty;
        dateMap[date].totalOut[catKey] += qty;

        // Tambah Nilai
        totalNilaiOutbound += qty * (skuInfo?.hpp || 0);
      });

      // Convert Map to Array & Sort
      const sortedData = Object.values(dateMap).sort((a: any, b: any) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      setDailyRecap(sortedData);
      setSummaryValues({
        nilaiInbound: totalNilaiInbound,
        nilaiInventory: nilaiInventory, // Nilai Stok Gudang Saat Ini
        nilaiRak: nilaiRak,             // Nilai Stok Rak Saat Ini
        nilaiOutbound: totalNilaiOutbound
      });

    } catch (error) {
      console.error("Error recap:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- EXPORT EXCEL ---
  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    
    // Flat Data untuk Excel
    const exportData = dailyRecap.map(d => ({
      'Tanggal': d.date,
      'Inbound Tas': d.inbound.tas,
      'Inbound Celana': d.inbound.celana,
      'Inbound Fashion': d.inbound.fashion,
      'Gudang Tas': d.gudang.tas,
      'Gudang Celana': d.gudang.celana,
      'Gudang Fashion': d.gudang.fashion,
      'Rak Tas': d.rak.tas,
      'Rak Celana': d.rak.celana,
      'Rak Fashion': d.rak.fashion,
      'Outbound Tas': d.totalOut.tas,
      'Outbound Celana': d.totalOut.celana,
      'Outbound Fashion': d.totalOut.fashion
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Harian");
    XLSX.writeFile(wb, `Rekap_Inventory_${startDate}_sd_${endDate}.xlsx`);
  };

  return (
    <div className="space-y-6 pb-10">
      
      {/* 1. TOP CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 text-center">
          <p className="text-gray-500 text-sm mb-1">Total SKU</p>
          <h3 className="text-3xl font-bold text-gray-800">{summaryTop.totalSku}</h3>
          <p className="text-xs text-gray-400 mt-1">Master data SKU</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 text-center">
          <p className="text-gray-500 text-sm mb-1">Pengiriman Pabrik</p>
          <h3 className="text-3xl font-bold text-gray-800">{summaryTop.totalPengiriman}</h3>
          <p className="text-xs text-gray-400 mt-1">Data pengiriman</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 text-center">
          <p className="text-gray-500 text-sm mb-1">Total di Gudang</p>
          <h3 className="text-3xl font-bold text-gray-800">{summaryTop.totalGudang.toLocaleString()}</h3>
          <p className="text-xs text-gray-400 mt-1">Semua lokasi gudang</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 text-center">
          <p className="text-gray-500 text-sm mb-1">Total di Rak</p>
          <h3 className="text-3xl font-bold text-gray-800">{summaryTop.totalRak.toLocaleString()}</h3>
          <p className="text-xs text-gray-400 mt-1">Semua rak penyimpanan</p>
        </div>
      </div>

      {/* 2. MAIN SECTION */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        
        {/* Header Biru */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-400 p-6 text-center text-white">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Database size={20} />
            <h2 className="text-xl font-bold">Rekap Harian Inventory - Data Akunting</h2>
          </div>
          <p className="text-blue-100 text-sm">Laporan detail pergerakan inventory per kategori untuk keperluan pencatatan keuangan dan audit</p>
        </div>

        {/* Controls & Filter */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
            <Calendar size={18} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-600">Periode Rekap:</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Dari:</span>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <span className="text-xs text-gray-400">Sampai:</span>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={fetchData}
              disabled={isLoading}
              className="bg-erp-pink hover:bg-pink-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              Update Rekap
            </button>
            <button 
              onClick={handleExport}
              className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-colors"
            >
              <Download size={16} />
              Export Data
            </button>
          </div>
        </div>

        {/* 3. VALUE SUMMARY BAR */}
        <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-gray-200 border-b border-gray-200">
          <div className="p-4 border-l-4 border-red-500 bg-white">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-1">
              <DollarSign size={14} className="text-red-500" /> Nilai Inbound
            </div>
            <p className="text-lg font-bold text-gray-900">{formatRupiah(summaryValues.nilaiInbound)}</p>
          </div>
          <div className="p-4 border-l-4 border-orange-500 bg-white">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-1">
              <Warehouse size={14} className="text-orange-500" /> Nilai Inventory
            </div>
            <p className="text-lg font-bold text-gray-900">{formatRupiah(summaryValues.nilaiInventory)}</p>
          </div>
          <div className="p-4 border-l-4 border-green-500 bg-white">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-1">
              <LayoutGrid size={14} className="text-green-500" /> Nilai di Rak
            </div>
            <p className="text-lg font-bold text-gray-900">{formatRupiah(summaryValues.nilaiRak)}</p>
          </div>
          <div className="p-4 border-l-4 border-blue-500 bg-white">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-1">
              <TrendingUp size={14} className="text-blue-500" /> Nilai Outbound
            </div>
            <p className="text-lg font-bold text-gray-900">{formatRupiah(summaryValues.nilaiOutbound)}</p>
          </div>
        </div>

        {/* 4. COMPLEX TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center border-collapse">
            <thead>
              {/* Header Row 1 */}
              <tr className="text-white">
                <th rowSpan={2} className="bg-gray-800 p-3 border-r border-gray-700 min-w-[120px]">Tanggal</th>
                
                <th colSpan={3} className="bg-blue-100 text-blue-800 border-r border-blue-200 py-2">
                  <div className="flex items-center justify-center gap-1 font-bold"><Truck size={14}/> Inbound</div>
                </th>
                
                <th colSpan={3} className="bg-orange-100 text-orange-800 border-r border-orange-200 py-2">
                  <div className="flex items-center justify-center gap-1 font-bold"><Warehouse size={14}/> Gudang</div>
                </th>
                
                <th colSpan={3} className="bg-green-100 text-green-800 border-r border-green-200 py-2">
                  <div className="flex items-center justify-center gap-1 font-bold"><LayoutGrid size={14}/> Rak</div>
                </th>
                
                <th colSpan={3} className="bg-purple-100 text-purple-800 border-r border-purple-200 py-2">
                  <div className="flex items-center justify-center gap-1 font-bold"><Truck size={14}/> Outbound Ekspedisi</div>
                </th>
                
                <th colSpan={3} className="bg-yellow-100 text-yellow-800 border-r border-yellow-200 py-2">
                  <div className="flex items-center justify-center gap-1 font-bold"><Package size={14}/> Outbound Non-Ekspedisi</div>
                </th>
                
                <th colSpan={3} className="bg-blue-900 text-white py-2">
                  <div className="flex items-center justify-center gap-1 font-bold"><TrendingUp size={14}/> Total Outbound</div>
                </th>
              </tr>

              {/* Header Row 2 (Categories) */}
              <tr className="text-xs font-bold">
                {/* Inbound */}
                <th className="bg-blue-50 text-gray-700 py-2 border-r border-blue-100 w-20"><span className="text-red-500">●</span> Tas</th>
                <th className="bg-blue-50 text-gray-700 py-2 border-r border-blue-100 w-20"><span className="text-blue-500">●</span> Celana</th>
                <th className="bg-blue-50 text-gray-700 py-2 border-r border-blue-200 w-20"><span className="text-purple-500">●</span> Fashion</th>
                
                {/* Gudang */}
                <th className="bg-orange-50 text-gray-700 py-2 border-r border-orange-100 w-20"><span className="text-red-500">●</span> Tas</th>
                <th className="bg-orange-50 text-gray-700 py-2 border-r border-orange-100 w-20"><span className="text-blue-500">●</span> Celana</th>
                <th className="bg-orange-50 text-gray-700 py-2 border-r border-orange-200 w-20"><span className="text-purple-500">●</span> Fashion</th>

                {/* Rak */}
                <th className="bg-green-50 text-gray-700 py-2 border-r border-green-100 w-20"><span className="text-red-500">●</span> Tas</th>
                <th className="bg-green-50 text-gray-700 py-2 border-r border-green-100 w-20"><span className="text-blue-500">●</span> Celana</th>
                <th className="bg-green-50 text-gray-700 py-2 border-r border-green-200 w-20"><span className="text-purple-500">●</span> Fashion</th>

                {/* Outbound Ekspedisi */}
                <th className="bg-purple-50 text-gray-700 py-2 border-r border-purple-100 w-20"><span className="text-red-500">●</span> Tas</th>
                <th className="bg-purple-50 text-gray-700 py-2 border-r border-purple-100 w-20"><span className="text-blue-500">●</span> Celana</th>
                <th className="bg-purple-50 text-gray-700 py-2 border-r border-purple-200 w-20"><span className="text-purple-500">●</span> Fashion</th>

                {/* Outbound Non */}
                <th className="bg-yellow-50 text-gray-700 py-2 border-r border-yellow-100 w-20"><span className="text-red-500">●</span> Tas</th>
                <th className="bg-yellow-50 text-gray-700 py-2 border-r border-yellow-100 w-20"><span className="text-blue-500">●</span> Celana</th>
                <th className="bg-yellow-50 text-gray-700 py-2 border-r border-yellow-200 w-20"><span className="text-purple-500">●</span> Fashion</th>

                {/* Total Outbound */}
                <th className="bg-white text-gray-700 py-2 border-r border-gray-200 w-20"><span className="text-red-500">●</span> Tas</th>
                <th className="bg-white text-gray-700 py-2 border-r border-gray-200 w-20"><span className="text-blue-500">●</span> Celana</th>
                <th className="bg-white text-gray-700 py-2 w-20"><span className="text-purple-500">●</span> Fashion</th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={19} className="py-12"><Loader2 className="animate-spin mx-auto text-blue-500" /></td></tr>
              ) : dailyRecap.length > 0 ? (
                dailyRecap.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-2 border-r border-gray-200 bg-gray-50 font-medium text-gray-700">
                      {new Date(row.date).toLocaleDateString('id-ID')}
                    </td>
                    
                    {/* Inbound Data */}
                    <td className="py-3 text-red-600 font-medium border-r border-gray-100">{row.inbound.tas || 0}</td>
                    <td className="py-3 text-green-600 font-medium border-r border-gray-100">{row.inbound.celana || 0}</td>
                    <td className="py-3 text-blue-600 font-medium border-r border-gray-200">{row.inbound.fashion || 0}</td>

                    {/* Gudang Data */}
                    <td className="py-3 text-red-600 font-medium border-r border-gray-100">{row.gudang.tas || 0}</td>
                    <td className="py-3 text-green-600 font-medium border-r border-gray-100">{row.gudang.celana || 0}</td>
                    <td className="py-3 text-blue-600 font-medium border-r border-gray-200">{row.gudang.fashion || 0}</td>

                    {/* Rak Data (UPDATED: Sourced from Mutation History - EXCLUDE SO) */}
                    <td className="py-3 text-red-600 font-medium border-r border-gray-100">{row.rak.tas || 0}</td>
                    <td className="py-3 text-green-600 font-medium border-r border-gray-100">{row.rak.celana || 0}</td>
                    <td className="py-3 text-blue-600 font-medium border-r border-gray-200">{row.rak.fashion || 0}</td>

                    {/* Outbound Ekspedisi */}
                    <td className="py-3 text-gray-600 border-r border-gray-100">{row.outboundEkspedisi.tas || 0}</td>
                    <td className="py-3 text-gray-600 border-r border-gray-100">{row.outboundEkspedisi.celana || 0}</td>
                    <td className="py-3 text-gray-600 border-r border-gray-200">{row.outboundEkspedisi.fashion || 0}</td>

                    {/* Outbound Non */}
                    <td className="py-3 text-gray-600 border-r border-gray-100">{row.outboundNon.tas || 0}</td>
                    <td className="py-3 text-gray-600 border-r border-gray-100">{row.outboundNon.celana || 0}</td>
                    <td className="py-3 text-gray-600 border-r border-gray-200">{row.outboundNon.fashion || 0}</td>

                    {/* Total Outbound */}
                    <td className="py-3 font-bold text-gray-800 border-r border-gray-100">{row.totalOut.tas || 0}</td>
                    <td className="py-3 font-bold text-gray-800 border-r border-gray-100">{row.totalOut.celana || 0}</td>
                    <td className="py-3 font-bold text-gray-800">{row.totalOut.fashion || 0}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={19} className="py-12 text-center text-gray-400 italic">
                    Tidak ada data transaksi pada periode ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
