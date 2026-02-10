import React, { useState, useEffect } from 'react';
import { Plus, Search, ArrowUpRight, ArrowDownLeft, Truck, RefreshCw, Loader2 } from 'lucide-react';
import { Shipment } from '../../types';
import { CreateShipmentModal } from './CreateShipmentModal';
import { supabase } from '../../lib/supabase';

interface ShipmentListProps {
  type: 'inbound' | 'outbound' | 'factory_outbound' | 'return';
  title: string;
}

// Konfigurasi Tabel sesuai Schema SQL Baru
const TABLE_CONFIG = {
  'inbound': {
    // UPDATE: Menggunakan 'outbound_pabrik' karena 'inbound_pabrik' sudah deprecated
    table: 'outbound_pabrik',
    pk: 'id',
    colRef: 'nomor_outbound',
    colDate: 'tanggal',
    colSource: 'sender',
    colDest: 'tujuan_pabrik', 
    colStatus: 'status',
    itemTable: 'outbound_pabrik_items',
    fk: 'outbound_pabrik_id'
  },
  'outbound': {
    table: 'outbound',
    pk: 'id',
    colRef: 'nomor_outbound',
    colDate: 'tanggal',
    colSource: null,
    colDest: 'tujuan',
    colStatus: 'status',
    itemTable: 'outbound_items',
    fk: 'outbound_id'
  },
  'return': {
    table: 'retur',
    pk: 'id',
    colRef: 'nomor_retur',
    colDate: 'tanggal',
    colSource: null, 
    colDest: null,
    colStatus: 'status',
    itemTable: 'retur_items',
    fk: 'retur_id'
  },
  'factory_outbound': {
    table: 'outbound_pabrik',
    pk: 'id',
    colRef: 'nomor_outbound',
    colDate: 'tanggal',
    colSource: null,
    colDest: 'tujuan_pabrik',
    colStatus: 'status',
    itemTable: 'outbound_pabrik_items',
    fk: 'outbound_pabrik_id'
  }
};

export const ShipmentList: React.FC<ShipmentListProps> = ({ type, title }) => {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const config = TABLE_CONFIG[type];

  const fetchShipments = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from(config.table)
        .select(`*`)
        .order(config.colDate, { ascending: false });

      // Filter khusus untuk Inbound agar tidak menampilkan Draft
      if (type === 'inbound') {
        query = query.neq('status', 'Draft');
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data) {
        const mappedData: Shipment[] = data.map((item: any) => ({
          id: String(item.id),
          referenceNo: item[config.colRef],
          type: type,
          date: item[config.colDate],
          status: item[config.colStatus],
          source: config.colSource ? item[config.colSource] : (type === 'outbound' ? 'Rak Display' : '-'),
          destination: config.colDest ? item[config.colDest] : '-',
          items: []
        }));
        setShipments(mappedData);
      }
    } catch (error) {
      console.error(`Error fetching ${type}:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchShipments();
  }, [type]);

  const handleCreateSubmit = async (data: Partial<Shipment>) => {
    try {
      // --- LOGIKA KHUSUS OUTBOUND (PENJUALAN) ---
      if (type === 'outbound') {
        // 1. Validasi & Kurangi Stok Rak Dulu
        if (data.items) {
            for (const item of data.items) {
                // Cek Stok
                const { data: currentStock } = await supabase
                    .from('stok_rak')
                    .select('quantity')
                    .match({ sku_id: item.skuId, kode_rak: 'Rak Display' })
                    .single();
                
                if (!currentStock || currentStock.quantity < item.qty) {
                    throw new Error(`Stok Rak tidak cukup untuk item ini.`);
                }

                // Kurangi Stok
                const newQty = currentStock.quantity - item.qty;
                const { error: updateError } = await supabase
                    .from('stok_rak')
                    .update({ quantity: newQty })
                    .match({ sku_id: item.skuId, kode_rak: 'Rak Display' });
                
                if (updateError) throw updateError;

                // Catat Riwayat Mutasi (Sales)
                await supabase.from('riwayat_mutasi').insert({
                    sku_id: item.skuId,
                    jenis_mutasi: 'Penjualan (Outbound)',
                    lokasi_asal: 'Rak Display',
                    lokasi_tujuan: 'Customer',
                    jumlah: item.qty,
                    keterangan: `Invoice: ${data.referenceNo}`
                });
            }
        }
      }

      // --- LOGIKA UMUM (SIMPAN TRANSAKSI) ---
      const payload: any = {
        [config.colRef]: data.referenceNo,
        [config.colDate]: data.date,
        [config.colStatus]: type === 'outbound' ? 'Selesai' : 'draft', // Outbound langsung selesai
        catatan: data.notes
      };

      if (config.colSource) payload[config.colSource] = data.source;
      if (config.colDest) payload[config.colDest] = data.destination;
      if (type === 'return') payload['alasan'] = 'Retur Barang';

      // 1. Insert Header
      const { data: headerData, error: headerError } = await supabase
        .from(config.table)
        .insert([payload])
        .select()
        .single();

      if (headerError) throw headerError;

      // 2. Insert Items
      if (data.items && data.items.length > 0 && headerData) {
        const itemsToInsert = data.items.map(item => ({
          [config.fk]: headerData.id,
          sku_id: item.skuId,
          quantity: item.qty,
          ...(type === 'return' ? { kondisi: 'Rusak' } : { satuan: 'Pcs' })
        }));

        const { error: itemsError } = await supabase
          .from(config.itemTable)
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }

      alert(`Data ${title} berhasil disimpan! Stok Rak telah diperbarui.`);
      fetchShipments();
    } catch (error: any) {
      console.error('Error saving:', error);
      alert(`Gagal menyimpan: ${error.message}`);
    }
  };

  const filteredShipments = shipments.filter(s => 
    s.referenceNo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getIcon = () => {
    switch (type) {
      case 'inbound': return <ArrowDownLeft className="text-green-600" />;
      case 'outbound': return <ArrowUpRight className="text-blue-600" />;
      case 'return': return <RefreshCw className="text-red-600" />;
      default: return <Truck />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-200">
            {getIcon()}
          </div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">{title}</h2>
        </div>
        
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-erp-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm text-sm font-medium"
        >
          <Plus size={18} /> Input {title}
        </button>
      </div>

      <div className="bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari No. Referensi..." 
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-erp-blue-600"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-dark-700 font-medium">
              <tr>
                <th className="px-6 py-3">No. Referensi</th>
                <th className="px-6 py-3">Tanggal</th>
                <th className="px-6 py-3">{type === 'outbound' ? 'Tujuan' : (type === 'inbound' ? 'Asal' : 'Keterangan')}</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center"><Loader2 className="animate-spin inline" /> Memuat...</td></tr>
              ) : filteredShipments.length > 0 ? (
                filteredShipments.map((shipment) => (
                  <tr key={shipment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium">{shipment.referenceNo}</td>
                    <td className="px-6 py-3">{shipment.date}</td>
                    <td className="px-6 py-3 uppercase">
                      {type === 'outbound' ? shipment.destination : shipment.source}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${shipment.status === 'Selesai' || shipment.status === 'Diterima' ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>{shipment.status}</span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button className="text-blue-600 font-medium text-xs">Detail</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">Belum ada data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CreateShipmentModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleCreateSubmit}
        type={type}
        title={title}
      />
    </div>
  );
};
