import React, { useState, useEffect } from 'react';
import { 
  FileText, Download, Calendar, Filter, Search, Loader2, 
  ArrowRight, AlertTriangle, RefreshCw, CheckCircle2
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import * as XLSX from 'xlsx';

export const Reports: React.FC = () => {
  const [reportType, setReportType] = useState('inbound');
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');

  const reportTypes = [
    { id: 'inbound', label: 'Laporan Inbound (Detail Masuk)' },
    { id: 'outbound', label: 'Laporan Outbound (Rincian Keluar)' },
    { id: 'retur', label: 'Laporan Retur Barang' },
    { id: 'mutasi', label: 'Riwayat Mutasi Stok (Hasil SO)' }, // Label diperjelas
    { id: 'low_stock', label: 'Stok Menipis (Low Stock)' },
  ];

  const fetchData = async () => {
    setIsLoading(true);
    setData([]);

    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }

    try {
      let query;
      let resultData: any[] = [];

      switch (reportType) {
        case 'inbound':
          query = supabase
            .from('outbound_pabrik_items')
            .select(`
              id, quantity, qty_received, no_karung,
              outbound_pabrik!inner (nomor_outbound, tanggal, sender, status),
              master_sku (kode_sku, nama, satuan)
            `)
            .gte('outbound_pabrik.tanggal', startDate)
            .lte('outbound_pabrik.tanggal', endDate)
            .neq('outbound_pabrik.status', 'Draft')
            .order('id', { ascending: false });
          
          const { data: inboundData, error: inboundError } = await query;
          if (inboundError) throw inboundError;

          resultData = inboundData?.map((item: any) => {
            const qtyKirim = Number(item.quantity || 0);
            const qtyTerima = Number(item.qty_received || 0);
            const selisih = qtyTerima - qtyKirim;
            
            let statusItem = 'Pending';
            if (item.outbound_pabrik?.status === 'Diterima') {
                statusItem = selisih === 0 ? 'Sesuai' : 'Selisih';
            } else {
                statusItem = item.outbound_pabrik?.status || 'Proses';
            }

            return {
              id: item.id,
              date: item.outbound_pabrik?.tanggal,
              ref: item.outbound_pabrik?.nomor_outbound,
              karung: item.no_karung || '-',
              sku: item.master_sku?.kode_sku || '?',
              name: item.master_sku?.nama || 'Unknown',
              qtySent: qtyKirim,
              qtyRec: qtyTerima,
              diff: selisih,
              unit: item.master_sku?.satuan || 'Pcs',
              status: statusItem
            };
          }) || [];
          break;

        case 'outbound':
          query = supabase
            .from('outbound_items')
            .select(`
              id, quantity,
              outbound!inner (id, nomor_outbound, tanggal),
              master_sku (kode_sku, nama, satuan)
            `)
            .gte('outbound.tanggal', startDate)
            .lte('outbound.tanggal', endDate);

          const { data: outboundData, error: outboundError } = await query;
          if (outboundError) throw outboundError;

          resultData = outboundData?.map((item: any) => ({
            id: item.id,
            date: item.outbound?.tanggal,
            sku: item.master_sku?.kode_sku || '?',
            name: item.master_sku?.nama || 'Unknown',
            qty: item.quantity,
            unit: item.master_sku?.satuan || 'Pcs',
            qtyDisplay: `${item.quantity} ${item.master_sku?.satuan || 'Pcs'}`
          })) || [];
          resultData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          break;

        case 'retur':
          query = supabase
            .from('retur')
            .select(`
              id, nomor_retur, tanggal, alasan, status, catatan,
              retur_items (quantity, master_sku (kode_sku, nama))
            `)
            .gte('tanggal', startDate)
            .lte('tanggal', endDate)
            .order('tanggal', { ascending: false });

          const { data: returData, error: returError } = await query;
          if (returError) throw returError;

          resultData = returData?.flatMap((header: any) => 
            header.retur_items.map((item: any) => ({
              id: `${header.id}-${item.master_sku?.kode_sku}`,
              ref: header.nomor_retur,
              date: header.tanggal,
              sku: item.master_sku?.kode_sku || '?',
              name: item.master_sku?.nama || 'Unknown',
              reason: header.alasan,
              qty: item.quantity,
              notes: header.catatan || '-'
            }))
          ) || [];
          break;

        case 'mutasi':
          // --- UPDATE: HANYA AMBIL DARI ARSIP SO GUDANG & SO RAK ---
          
          // 1. Ambil Arsip SO Gudang (Status: Diterapkan)
          const { data: soGudang, error: soGudangError } = await supabase
            .from('stock_opname_gudang')
            .select(`
              id, tanggal, lokasi, qty_sistem, qty_fisik, selisih, keterangan,
              master_sku (kode_sku, nama, satuan)
            `)
            .eq('status', 'Diterapkan')
            .gte('tanggal', startDate)
            .lte('tanggal', endDate);

          if (soGudangError && !soGudangError.message.includes('does not exist')) throw soGudangError;

          // 2. Ambil Arsip SO Rak (Status: Diterapkan)
          const { data: soRak, error: soRakError } = await supabase
            .from('stock_opname_rak')
            .select(`
              id, tanggal, lokasi, qty_sistem, qty_fisik, selisih, keterangan,
              master_sku (kode_sku, nama, satuan)
            `)
            .eq('status', 'Diterapkan')
            .gte('tanggal', startDate)
            .lte('tanggal', endDate);

          if (soRakError && !soRakError.message.includes('does not exist')) throw soRakError;

          // --- FORMAT DATA ---
          
          // A. Format SO Gudang
          const formattedSOGudang = soGudang?.map((item: any) => ({
            id: `SOG-${item.id}`,
            date: item.tanggal,
            displayDate: new Date(item.tanggal).toLocaleDateString('id-ID'),
            sku: item.master_sku?.kode_sku,
            name: item.master_sku?.nama,
            type: 'Stock Opname (Gudang)',
            from: 'Sistem',
            to: item.lokasi || 'Gudang Utama',
            qty: item.qty_fisik, // Hasil Akhir
            qtySistem: item.qty_sistem,
            qtyReal: item.qty_fisik,
            selisih: item.selisih,
            unit: item.master_sku?.satuan || 'Pcs',
            notes: item.keterangan || 'Hasil SO Diterapkan'
          })) || [];

          // B. Format SO Rak
          const formattedSORak = soRak?.map((item: any) => ({
            id: `SOR-${item.id}`,
            date: item.tanggal,
            displayDate: new Date(item.tanggal).toLocaleDateString('id-ID'),
            sku: item.master_sku?.kode_sku,
            name: item.master_sku?.nama,
            type: 'Stock Opname (Rak)',
            from: 'Sistem',
            to: item.lokasi || 'Rak Display',
            qty: item.qty_fisik,
            qtySistem: item.qty_sistem,
            qtyReal: item.qty_fisik,
            selisih: item.selisih,
            unit: item.master_sku?.satuan || 'Pcs',
            notes: item.keterangan || 'Hasil SO Diterapkan'
          })) || [];

          // Gabungkan dan Sortir berdasarkan Tanggal (Terbaru diatas)
          resultData = [...formattedSOGudang, ...formattedSORak].sort((a, b) => 
            new Date(b.date).getTime() - new Date(a.date).getTime()
          );
          break;

        case 'low_stock':
          const { data: lowStockData, error: lowStockError } = await supabase
            .from('stok_gudang')
            .select(`
              id, quantity, lokasi_gudang, no_karung, updated_at,
              master_sku (kode_sku, nama, min_stock, satuan, kategori)
            `)
            .order('quantity', { ascending: true });

          if (lowStockError) throw lowStockError;

          resultData = lowStockData?.filter((item: any) => {
            const minStock = item.master_sku?.min_stock || 0;
            return item.quantity <= minStock;
          }).map((item: any) => ({
            id: item.id,
            sku: item.master_sku?.kode_sku,
            name: item.master_sku?.nama,
            category: item.master_sku?.kategori,
            location: item.lokasi_gudang,
            karung: item.no_karung || '-',
            currentQty: item.quantity,
            minQty: item.master_sku?.min_stock || 0,
            unit: item.master_sku?.satuan,
            lastUpdate: new Date(item.updated_at).toLocaleDateString('id-ID')
          })) || [];
          break;
      }

      setData(resultData);

    } catch (error: any) {
      console.error("Error fetching report:", error);
      alert(`Gagal memuat laporan: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [reportType, startDate, endDate]);

  const getColumns = () => {
    switch (reportType) {
      case 'inbound':
        return [
          { header: 'Tanggal', accessor: 'date', width: 'w-28' },
          { header: 'No. Karung', accessor: 'karung', width: 'w-28' },
          { header: 'SKU', accessor: 'sku', width: 'w-32' },
          { header: 'Nama Barang', accessor: 'name', width: 'w-48' },
          { header: 'Qty Kirim', accessor: 'qtySent', width: 'w-24 text-center' },
          { header: 'Qty Terima', accessor: 'qtyRec', width: 'w-24 text-center' },
          { header: 'Selisih', accessor: 'diff', width: 'w-24 text-center' },
          { header: 'Status', accessor: 'status', width: 'w-28 text-center' },
        ];
      case 'outbound':
        return [
          { header: 'Tanggal', accessor: 'date', width: 'w-32' },
          { header: 'SKU', accessor: 'sku', width: 'w-40' },
          { header: 'Nama Barang', accessor: 'name', width: 'flex-1' },
          { header: 'Outbound', accessor: 'qtyDisplay', width: 'w-32 text-center' },
        ];
      case 'retur':
        return [
          { header: 'Tanggal', accessor: 'date', width: 'w-32' },
          { header: 'No. Retur', accessor: 'ref', width: 'w-40' },
          { header: 'SKU', accessor: 'sku', width: 'w-32' },
          { header: 'Nama Barang', accessor: 'name', width: 'w-48' },
          { header: 'Alasan', accessor: 'reason', width: 'w-40' },
          { header: 'Qty', accessor: 'qty', width: 'w-24 text-center' },
          { header: 'Keterangan', accessor: 'notes', width: 'flex-1' },
        ];
      case 'mutasi':
        return [
          { header: 'Tanggal', accessor: 'displayDate', width: 'w-32' },
          { header: 'SKU', accessor: 'sku', width: 'w-32' },
          { header: 'Nama Barang', accessor: 'name', width: 'w-48' },
          { header: 'Jenis Mutasi', accessor: 'type', width: 'w-40' },
          { header: 'Dari', accessor: 'from', width: 'w-24' },
          { header: 'Ke', accessor: 'to', width: 'w-24' },
          { header: 'Qty Sistem', accessor: 'qtySistem', width: 'w-24 text-center' },
          { header: 'Qty Real', accessor: 'qtyReal', width: 'w-24 text-center' },
          { header: 'Selisih', accessor: 'selisih', width: 'w-24 text-center' },
          { header: 'Hasil Akhir', accessor: 'qty', width: 'w-24 text-center' },
        ];
      case 'low_stock':
        return [
          { header: 'SKU', accessor: 'sku', width: 'w-32' },
          { header: 'Nama Barang', accessor: 'name', width: 'w-48' },
          { header: 'Kategori', accessor: 'category', width: 'w-32' },
          { header: 'Lokasi', accessor: 'location', width: 'w-32' },
          { header: 'Karung', accessor: 'karung', width: 'w-24' },
          { header: 'Stok Saat Ini', accessor: 'currentQty', width: 'w-32 text-center font-bold text-red-600' },
          { header: 'Min. Stok', accessor: 'minQty', width: 'w-32 text-center' },
          { header: 'Update Terakhir', accessor: 'lastUpdate', width: 'w-32' },
        ];
      default:
        return [];
    }
  };

  const handleExport = () => {
    if (data.length === 0) {
      alert("Tidak ada data untuk diexport.");
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    const wscols = Object.keys(data[0]).map(() => ({ wch: 20 }));
    ws['!cols'] = wscols;
    XLSX.utils.book_append_sheet(wb, ws, "Laporan");
    XLSX.writeFile(wb, `Laporan_${reportType}_${startDate}_sd_${endDate}.xlsx`);
  };

  const filteredData = data.filter(item => 
    Object.values(item).some(val => 
      String(val).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const columns = getColumns();

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-dark-900 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="text-erp-blue-600" /> Pusat Laporan
          </h1>
          <p className="text-gray-500 text-sm mt-1">Analisa data operasional gudang secara detail</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="p-2 bg-white border rounded-lg hover:bg-gray-50 text-gray-600" title="Refresh Data">
            <RefreshCw size={18} />
          </button>
          <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm transition-colors">
            <Download size={18} /> Export Excel
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-gray-200 dark:border-dark-600 p-5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-4">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Jenis Laporan</label>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <select 
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-erp-blue-500 outline-none appearance-none cursor-pointer"
              >
                {reportTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="md:col-span-5">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Periode Tanggal</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={reportType === 'low_stock'}
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-erp-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <span className="text-gray-400">-</span>
              <div className="relative flex-1">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={reportType === 'low_stock'}
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-erp-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Cari Data</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Ketik kata kunci..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-erp-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-gray-200 dark:border-dark-600 overflow-hidden">
        <div className="overflow-auto max-h-[600px] custom-scrollbar">
          <table className="w-full text-sm text-left border-collapse relative">
            <thead className="bg-gray-50 dark:bg-dark-700 text-gray-600 font-semibold border-b border-gray-200 dark:border-dark-600 sticky top-0 z-10 shadow-sm">
              <tr>
                {columns.map((col, idx) => (
                  <th key={idx} className={`px-6 py-4 whitespace-nowrap ${col.width || ''} bg-gray-50 dark:bg-dark-700`}>
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-600">
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-12 text-center">
                    <Loader2 className="animate-spin inline text-erp-blue-600 mb-2" size={32} />
                    <p className="text-gray-500">Memuat data laporan...</p>
                  </td>
                </tr>
              ) : filteredData.length > 0 ? (
                filteredData.map((row, rIdx) => (
                  <tr key={row.id || rIdx} className="hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
                    {columns.map((col, cIdx) => (
                      <td key={cIdx} className={`px-6 py-3 ${col.width || ''}`}>
                        {reportType === 'outbound' ? (
                          col.accessor === 'sku' ? (
                            <span className="font-medium text-blue-600">{row[col.accessor]}</span>
                          ) : 
                          col.accessor === 'qtyDisplay' ? (
                            <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">
                              {row[col.accessor]}
                            </span>
                          ) : (
                            <span className="text-gray-700 dark:text-gray-300">{row[col.accessor]}</span>
                          )
                        ) : 
                        reportType === 'inbound' ? (
                          col.accessor === 'karung' ? (
                            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{row[col.accessor]}</span>
                          ) :
                          col.accessor === 'qtySent' ? (
                            <span className="font-medium text-gray-600">{row[col.accessor]}</span>
                          ) :
                          col.accessor === 'qtyRec' ? (
                            <span className="font-bold text-gray-900">{row[col.accessor]}</span>
                          ) :
                          col.accessor === 'diff' ? (
                            row[col.accessor] === 0 ? (
                              <span className="text-green-600 font-medium text-xs flex items-center justify-center gap-1">
                                <CheckCircle2 size={14}/> Sesuai
                              </span>
                            ) : (
                              <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-bold">
                                {row[col.accessor] > 0 ? '+' : ''}{row[col.accessor]}
                              </span>
                            )
                          ) :
                          col.accessor === 'status' ? (
                            <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                              row.status === 'Sesuai' ? 'bg-green-100 text-green-700' :
                              row.status === 'Selisih' ? 'bg-red-100 text-red-700' :
                              row.status === 'Diterima' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {row.status}
                            </span>
                          ) : (
                            <span className="text-gray-700 dark:text-gray-300">{row[col.accessor]}</span>
                          )
                        ) : 
                        reportType === 'mutasi' && col.accessor === 'selisih' ? (
                           row[col.accessor] !== '-' && row[col.accessor] !== 0 ? (
                             <span className="text-red-600 font-bold">{row[col.accessor] > 0 ? '+' : ''}{row[col.accessor]}</span>
                           ) : (
                             <span className="text-gray-400">{row[col.accessor] === 0 ? '0' : '-'}</span>
                           )
                        ) :
                        col.accessor === 'status' ? (
                          <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                            row.status === 'Selesai' || row.status === 'Diterima' ? 'bg-green-100 text-green-700' :
                            row.status === 'Draft' ? 'bg-gray-100 text-gray-600' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {row[col.accessor]}
                          </span>
                        ) : col.accessor === 'totalQty' || col.accessor === 'qty' ? (
                          <span className="font-bold text-gray-800">{row[col.accessor]} {row.unit ? row.unit : ''}</span>
                        ) : (
                          <span className="text-gray-700 dark:text-gray-300">{row[col.accessor]}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-400">
                      <AlertTriangle size={48} className="mb-3 opacity-20" />
                      <p className="font-medium">Tidak ada data ditemukan</p>
                      <p className="text-xs mt-1">Coba ubah filter tanggal atau jenis laporan.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="bg-gray-50 dark:bg-dark-700 px-6 py-3 border-t border-gray-200 dark:border-dark-600 flex justify-between items-center text-xs text-gray-500">
          <span>Menampilkan {filteredData.length} data</span>
          <span>Data diambil pada: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
};
