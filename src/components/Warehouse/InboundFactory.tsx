import React, { useState, useEffect } from 'react';
import { Search, Loader2, RefreshCw, ArrowDownLeft, Calendar, X, UserCheck } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { ShipmentDetailModal } from './ShipmentDetailModal';
import { ConfirmationModal } from './ConfirmationModal';
import { SuccessModal } from './SuccessModal';

export const InboundFactory: React.FC = () => {
  const [shipments, setShipments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<any>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; id: string; po: string; }>({ isOpen: false, id: '', po: '' });
  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  
  // State untuk Form Penerimaan
  const [receiverName, setReceiverName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); // State loading khusus tombol modal

  const fetchInbound = async () => {
    setIsLoading(true);
    if (!isSupabaseConfigured()) { setIsLoading(false); return; }

    try {
      // UPDATE: Ambil qty_received juga untuk menghitung selisih
      const { data, error } = await supabase
        .from('outbound_pabrik')
        .select(`*, outbound_pabrik_items (quantity, qty_received)`)
        .neq('status', 'Draft') // FILTER: HANYA TAMPILKAN YANG BUKAN DRAFT
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const mappedData = data.map((item: any) => {
          // Hitung Total Qty Kirim
          const calculatedQty = item.outbound_pabrik_items?.reduce((acc: number, curr: any) => acc + Number(curr.quantity), 0) || 0;
          
          // Hitung Total Qty Terima (Cek Fisik)
          const calculatedReceived = item.outbound_pabrik_items?.reduce((acc: number, curr: any) => acc + (Number(curr.qty_received) || 0), 0) || 0;
          
          // Hitung Selisih
          const discrepancy = calculatedReceived - calculatedQty;

          return {
            id: String(item.id),
            po: item.nomor_outbound,
            noKarung: item.no_karung || '-',
            date: item.tanggal,
            sender: item.sender || 'AULIA',
            receiver: item.receiver || '-', 
            totalQty: calculatedQty,
            totalReceived: calculatedReceived, // Data baru
            discrepancy: discrepancy,          // Data baru
            status: item.status,
            notes: item.catatan
          };
        });
        setShipments(mappedData);
      }
    } catch (error) {
      console.error('Error fetching inbound:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchInbound(); }, []);

  const handleViewDetail = async (shipment: any) => {
    setIsDetailOpen(true);
    setIsLoadingDetail(true);
    try {
      const { data } = await supabase
        .from('outbound_pabrik_items')
        .select(`
          id, quantity, satuan, no_karung, qty_received, is_checked, check_notes, target_warehouse,
          master_sku (kode_sku, nama, kategori)
        `)
        .eq('outbound_pabrik_id', shipment.id);

      const items = data?.map((item: any) => ({
        id: item.id,
        qty: item.quantity,
        unit: item.satuan,
        noKarung: item.no_karung || '-',
        skuCode: item.master_sku?.kode_sku || '?',
        skuName: item.master_sku?.nama || 'Unknown Item',
        skuCategory: item.master_sku?.kategori || 'Umum', 
        qtyReceived: item.qty_received, 
        isChecked: item.is_checked,
        checkNotes: item.check_notes,
        targetWarehouse: item.target_warehouse || 'Gudang 1' 
      })) || [];

      setSelectedDetail({ ...shipment, items });
    } catch (error) {
      console.error("Error detail:", error);
      setIsDetailOpen(false);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleReceive = async () => {
    const { id, po } = confirmModal;
    if (!id || !receiverName.trim()) { alert("Isi Nama Penerima!"); return; }

    setIsSubmitting(true); // Mulai loading di tombol modal

    try {
      // 1. Ambil Item dari database
      const { data: items } = await supabase
        .from('outbound_pabrik_items')
        .select('sku_id, quantity, qty_received, is_checked, no_karung, target_warehouse')
        .eq('outbound_pabrik_id', id);

      if (items) {
        for (const item of items) {
          // --- LOGIKA PENERIMAAN ---
          let finalQty = 0;
          
          if (item.is_checked) {
            finalQty = Number(item.qty_received || 0);
          } else {
            finalQty = Number(item.quantity || 0);
          }

          const karungCode = (item.no_karung && item.no_karung.trim() !== '') ? item.no_karung : '-';
          const warehouseDest = item.target_warehouse || 'Gudang 1';

          if (finalQty > 0) {
            // 2. Cek Stok Lama
            const { data: currentStock } = await supabase
              .from('stok_gudang')
              .select('quantity')
              .match({ 
                sku_id: item.sku_id, 
                lokasi_gudang: warehouseDest, 
                no_karung: karungCode 
              })
              .maybeSingle();

            const newQty = (currentStock?.quantity || 0) + finalQty;

            // 3. Upsert Stok
            const { error: upsertError } = await supabase
              .from('stok_gudang')
              .upsert({
                sku_id: item.sku_id,
                lokasi_gudang: warehouseDest,
                no_karung: karungCode,
                quantity: newQty,
                updated_at: new Date().toISOString()
              }, { onConflict: 'sku_id, lokasi_gudang, no_karung' });

            if (upsertError) throw new Error(`Gagal update stok: ${upsertError.message}`);

            // 4. CATAT RIWAYAT MUTASI (Agar muncul di History Stok Gudang)
            await supabase.from('riwayat_mutasi').insert({
              sku_id: item.sku_id,
              jenis_mutasi: 'Inbound Pabrik',
              lokasi_asal: 'Pabrik',
              lokasi_tujuan: warehouseDest,
              jumlah: finalQty,
              keterangan: `Penerimaan PO: ${po} (Karung: ${karungCode})`
            });
          }
        }
      }

      // 5. Update Status Header & Receiver
      await supabase.from('outbound_pabrik').update({ 
        status: 'Diterima', 
        receiver: receiverName,
        tujuan_pabrik: 'Multi Gudang' 
      }).eq('id', id);

      // TUTUP MODAL KONFIRMASI DULU
      setConfirmModal({ isOpen: false, id: '', po: '' });
      setReceiverName('');
      
      // LANGSUNG BUKA MODAL SUKSES
      setSuccessModal({
        isOpen: true,
        title: 'Penerimaan Selesai',
        message: 'Barang berhasil diterima dan stok telah ditambahkan ke gudang.'
      });
      
      fetchInbound(); // Refresh data di background

    } catch (error: any) {
      alert(`Gagal: ${error.message}`);
    } finally {
      setIsSubmitting(false); // Stop loading
    }
  };

  const filteredShipments = shipments.filter(s => {
    const matchesSearch = 
      s.po.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.sender && s.sender.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.receiver && s.receiver.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStartDate = startDate ? s.date >= startDate : true;
    const matchesEndDate = endDate ? s.date <= endDate : true;

    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ArrowDownLeft className="text-green-600"/> Inbound Gudang
        </h2>
        <button onClick={fetchInbound} className="p-2 border rounded-lg hover:bg-gray-50 bg-white shadow-sm text-gray-600"><RefreshCw size={16}/></button>
      </div>

      {/* Filter Section */}
      <div className="bg-white dark:bg-dark-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-dark-600 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari Batch PO, Pengirim, atau Penerima..." 
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-dark-600 bg-gray-50 dark:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-erp-blue-600"
          />
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full md:w-auto pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-700 text-sm focus:outline-none focus:ring-2 focus:ring-erp-blue-600"
              placeholder="Dari Tanggal"
            />
          </div>
          <span className="text-gray-400">-</span>
          <div className="relative flex-1 md:flex-none">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full md:w-auto pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-700 text-sm focus:outline-none focus:ring-2 focus:ring-erp-blue-600"
              placeholder="Sampai Tanggal"
            />
          </div>
          {(startDate || endDate) && (
             <button onClick={() => { setStartDate(''); setEndDate(''); }} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors" title="Reset Tanggal">
               <X size={16} />
             </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-dark-800 rounded-lg shadow-sm border overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-green-50 dark:bg-dark-700 font-semibold text-green-900">
            <tr>
              <th className="px-6 py-4">Batch PO</th>
              <th className="px-6 py-4">Tanggal</th>
              <th className="px-6 py-4">Pengirim</th>
              <th className="px-6 py-4">Penerima</th>
              <th className="px-6 py-4">Total Qty</th>
              <th className="px-6 py-4 text-center">Selisih</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? <tr><td colSpan={8} className="text-center py-8"><Loader2 className="animate-spin inline"/></td></tr> : 
            filteredShipments.length > 0 ? (
              filteredShipments.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{item.po}</td>
                  <td className="px-6 py-4">{item.date}</td>
                  <td className="px-6 py-4 uppercase">{item.sender}</td>
                  <td className="px-6 py-4">{item.receiver}</td>
                  <td className="px-6 py-4 font-bold">{item.totalQty}</td>
                  
                  <td className="px-6 py-4 text-center font-bold">
                    {item.status !== 'Diterima' && item.totalReceived === 0 ? (
                      <span className="text-gray-400">-</span>
                    ) : (
                      <span className={`${item.discrepancy === 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.discrepancy > 0 ? '+' : ''}{item.discrepancy}
                      </span>
                    )}
                  </td>

                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${item.status === 'Diterima' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2">
                    <button onClick={() => handleViewDetail(item)} className="text-blue-600 border border-blue-200 px-2 py-1 rounded text-xs hover:bg-blue-50">Cek Fisik</button>
                    
                    {item.status === 'Dalam Pengiriman' && (
                      <button onClick={() => { setReceiverName(''); setConfirmModal({ isOpen: true, id: item.id, po: item.po }); }} className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs shadow-sm">Selesai</button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400 italic">Belum ada data inbound.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ShipmentDetailModal 
        isOpen={isDetailOpen} 
        onClose={() => setIsDetailOpen(false)} 
        data={selectedDetail} 
        isLoading={isLoadingDetail} 
        isReceivingMode={true} 
        onSaveProgress={() => {
          setIsDetailOpen(false); 
          setSuccessModal({
            isOpen: true,
            title: 'Pengecekan Disimpan',
            message: 'Data pengecekan fisik berhasil disimpan ke sistem.'
          });
          fetchInbound(); 
        }} 
      />
      
      <ConfirmationModal 
        isOpen={confirmModal.isOpen} 
        onClose={() => setConfirmModal({ isOpen: false, id: '', po: '' })}
        onConfirm={handleReceive}
        title="Konfirmasi Penerimaan Barang"
        message="Pastikan barang sudah sesuai. Stok akan ditambahkan ke gudang yang telah dipilih pada menu Cek Fisik."
        confirmLabel="Ya, Terima Barang"
        isDangerous={false}
        isLoading={isSubmitting} // Pass status loading ke modal
      >
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Nama Penerima (PIC):</label>
            <div className="relative">
              <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2 focus:ring-2 focus:ring-erp-blue-600 outline-none" 
                value={receiverName} 
                onChange={e => setReceiverName(e.target.value)} 
                placeholder="Contoh: Budi Santoso" 
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>
      </ConfirmationModal>

      <SuccessModal
        isOpen={successModal.isOpen}
        onClose={() => setSuccessModal({ ...successModal, isOpen: false })}
        title={successModal.title}
        message={successModal.message}
      />
    </div>
  );
};
