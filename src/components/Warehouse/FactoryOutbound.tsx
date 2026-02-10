import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Search, Loader2, RefreshCw, Upload, Box, Trash2, 
  Download, FileSpreadsheet, Send, AlertCircle, CheckCircle2,
  Calendar, X
} from 'lucide-react';
import { CreateShipmentModal } from './CreateShipmentModal';
import { ConfirmationModal } from './ConfirmationModal';
import { ShipmentDetailModal } from './ShipmentDetailModal';
import { SuccessModal } from './SuccessModal'; 
import { ErrorModal } from './ErrorModal'; 
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import * as XLSX from 'xlsx';

export const FactoryOutbound: React.FC = () => {
  const [shipments, setShipments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Date Range Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detail State
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<any>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Modal States
  const [successModal, setSuccessModal] = useState({
    isOpen: false,
    title: '',
    message: ''
  });

  const [errorModal, setErrorModal] = useState({
    isOpen: false,
    title: '',
    message: ''
  });

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Ya, Lanjutkan',
    onConfirm: () => {}
  });

  // --- FETCH DATA ---
  const fetchShipments = async () => {
    setIsLoading(true);
    
    if (!isSupabaseConfigured()) { 
      console.warn("Supabase belum dikonfigurasi dengan benar.");
      setIsLoading(false); 
      return; 
    }

    try {
      const { data, error } = await supabase
        .from('outbound_pabrik')
        .select(`*, outbound_pabrik_items (quantity)`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const mappedData = data.map((item: any) => {
          const calculatedQty = item.outbound_pabrik_items?.reduce((acc: number, curr: any) => acc + Number(curr.quantity), 0) || 0;
          
          // Biarkan format YYYY-MM-DD sesuai database dan input user
          const formattedDate = item.tanggal; 

          return {
            id: String(item.id),
            po: item.nomor_outbound,
            noKarung: item.no_karung || '-',
            date: formattedDate, // Tetap YYYY-MM-DD
            sender: item.sender || 'AULIA',
            destination: item.tujuan_pabrik,
            totalQty: calculatedQty,
            status: item.status, 
            notes: item.catatan
          };
        });
        setShipments(mappedData);
      }
    } catch (error: any) {
      console.error('Error fetching shipments:', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchShipments(); }, []);

  // --- CREATE MANUAL ---
  const handleCreateSubmit = async (data: any) => {
    try {
      const { data: headerData, error: headerError } = await supabase
        .from('outbound_pabrik')
        .insert([{
          nomor_outbound: data.referenceNo,
          tanggal: data.date,
          sender: data.source,
          tujuan_pabrik: data.destination || 'Gudang Utama',
          status: 'Draft', 
          no_karung: data.noKarung,
          catatan: data.notes
        }])
        .select()
        .single();

      if (headerError) throw headerError;

      if (data.items && data.items.length > 0 && headerData) {
        const itemsToInsert = data.items.map((item: any) => ({
          outbound_pabrik_id: headerData.id,
          sku_id: item.skuId,
          quantity: item.qty,
          satuan: 'Pcs',
          no_karung: data.noKarung
        }));

        const { error: itemsError } = await supabase
          .from('outbound_pabrik_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }

      setSuccessModal({
        isOpen: true,
        title: 'Berhasil Disimpan',
        message: 'Data pengiriman berhasil dibuat sebagai Draft. Silakan klik tombol "Kirim" (ikon pesawat) untuk meneruskan ke Gudang.'
      });
      fetchShipments();
    } catch (error: any) {
      alert(`Gagal menyimpan: ${error.message}`);
    }
  };

  // --- VIEW DETAIL ---
  const handleViewDetail = async (shipment: any) => {
    setIsDetailOpen(true);
    setIsLoadingDetail(true);
    try {
      const { data, error } = await supabase
        .from('outbound_pabrik_items')
        .select(`id, quantity, satuan, no_karung, master_sku (kode_sku, nama, kategori)`)
        .eq('outbound_pabrik_id', shipment.id);

      if (error) throw error;

      const items = data?.map((item: any) => ({
        id: item.id,
        qty: item.quantity,
        unit: item.satuan,
        noKarung: item.no_karung || '-',
        skuCode: item.master_sku?.kode_sku || '?',
        skuName: item.master_sku?.nama || 'Unknown Item',
        skuCategory: item.master_sku?.kategori || 'Tanpa Kategori' 
      })) || [];

      // Tanggal sudah YYYY-MM-DD, aman untuk form edit
      setSelectedDetail({ ...shipment, items });
    } catch (error) {
      console.error("Error detail:", error);
      setIsDetailOpen(false);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // --- HELPER: PARSE DATE ---
  const parseDate = (dateVal: any) => {
    let dateStr = new Date().toISOString().split('T')[0]; // Default Today
    
    if (typeof dateVal === 'number') {
       // Excel Serial Date
       dateStr = new Date(Math.round((dateVal - 25569) * 86400 * 1000)).toISOString().split('T')[0];
    } else if (typeof dateVal === 'string') {
       const cleanDate = dateVal.trim();
       // Split by / or -
       const parts = cleanDate.split(/[\/\-]/);
       
       if (parts.length === 3) {
           // Check if YYYY is first (YYYY-MM-DD)
           if (parts[0].length === 4) {
               dateStr = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
           } else {
               // Assume DD-MM-YYYY (Indonesia/UK Format)
               // parts[0] = Day, parts[1] = Month, parts[2] = Year
               const d = parts[0].padStart(2, '0');
               const m = parts[1].padStart(2, '0');
               let y = parts[2];
               if (y.length === 2) y = '20' + y; // Handle 2 digit year
               
               dateStr = `${y}-${m}-${d}`;
           }
       }
    }
    return dateStr;
  };

  // --- IMPORT EXCEL ---
  const handleImportExcel = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = e.target?.result;
      setIsLoading(true);
      
      try {
        const { data: skus } = await supabase.from('master_sku').select('id, kode_sku');
        if (!skus || skus.length === 0) {
          alert("Master SKU Kosong. Harap isi Master Data terlebih dahulu.");
          setIsLoading(false);
          return;
        }

        const normalize = (str: string) => str ? str.toString().trim().toUpperCase().replace(/\s+/g, '') : '';
        const skuMap = new Map(skus.map((s: any) => [normalize(s.kode_sku), s.id]));
        
        const workbook = XLSX.read(data, { type: 'array' });
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        
        const findVal = (row: any, keys: string[]) => {
          for (const k of Object.keys(row)) if (keys.some(pk => k.toLowerCase().includes(pk.toLowerCase()))) return row[k];
          return undefined;
        };

        // --- VALIDASI DUPLIKASI KARUNG ---
        const fileKarungSet = new Set<string>();
        const duplicatesInFile: string[] = [];
        const uniqueCodesToCheck: string[] = [];
        
        // 1. Cek Duplikasi INTERNAL (Di dalam file Excel sendiri)
        jsonData.forEach((row: any) => {
          let dateVal = findVal(row, ['Tanggal', 'Date']);
          let dateStr = parseDate(dateVal);
          
          const dateCode = dateStr.replace(/-/g, '');
          const karungRaw = findVal(row, ['Karung', 'No']);
          
          if (karungRaw) {
            const rawStr = karungRaw.toString().trim();
            if (rawStr && rawStr !== '-') {
              const uniqueCode = `${dateCode}-${rawStr}`; // Format: YYYYMMDD-K1
              
              if (fileKarungSet.has(uniqueCode)) {
                if (!duplicatesInFile.includes(rawStr)) {
                  duplicatesInFile.push(rawStr);
                }
              } else {
                fileKarungSet.add(uniqueCode);
                uniqueCodesToCheck.push(uniqueCode);
              }
            }
          }
        });

        if (duplicatesInFile.length > 0) {
          setErrorModal({
            isOpen: true,
            title: 'Duplikasi Data (Internal File)',
            message: `Ditemukan nomor karung ganda di dalam file Excel Anda:\n\n**${duplicatesInFile.join(', ')}**\n\nSistem menolak data ganda. Mohon perbaiki file Excel Anda.`
          });
          setIsLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return; // STOP
        }

        // 2. Cek Duplikasi DATABASE
        if (uniqueCodesToCheck.length > 0) {
          const { data: existingKarungs } = await supabase
            .from('outbound_pabrik_items')
            .select('no_karung')
            .in('no_karung', uniqueCodesToCheck);
            
          if (existingKarungs && existingKarungs.length > 0) {
            const uniqueDupes = Array.from(new Set(existingKarungs.map(k => {
              const parts = k.no_karung.split('-');
              return parts.length > 1 ? parts.slice(1).join('-') : k.no_karung;
            })));
            
            setErrorModal({
              isOpen: true,
              title: 'Data Sudah Ada (Database)',
              message: `Nomor Karung berikut sudah terdaftar di sistem:\n\n**${uniqueDupes.join(', ')}**\n\nData ditolak untuk mencegah duplikasi stok.`
            });
            setIsLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return; // STOP
          }
        }
        // ------------------------------------------------

        const groupedData: Record<string, any[]> = {};
        jsonData.forEach((row: any) => {
          let dateVal = findVal(row, ['Tanggal', 'Date']);
          let dateStr = parseDate(dateVal);
          
          if (!groupedData[dateStr]) groupedData[dateStr] = [];
          groupedData[dateStr].push(row);
        });

        let totalInserted = 0;
        let missingSKUs: string[] = [];

        for (const [date, rows] of Object.entries(groupedData)) {
          const dateCode = date.replace(/-/g, '');
          const poNumber = `BATCH-${dateCode}`;
          
          const itemsToInsert: any[] = [];
          const karungSet = new Set<string>();
          let senderName = 'AULIA';

          for (const row of rows) {
            const skuRaw = findVal(row, ['SKU', 'Kode']);
            const qty = Number(findVal(row, ['Qty', 'Jumlah']));
            const karungRaw = findVal(row, ['Karung', 'No']);
            const senderRaw = findVal(row, ['Pengirim', 'Sender']);

            if (senderRaw) senderName = senderRaw;

            const skuKey = normalize(skuRaw);
            if (skuKey && skuMap.has(skuKey) && qty > 0) {
              const karungCode = karungRaw ? `${dateCode}-${karungRaw.toString().trim()}` : '-';
              if (karungCode !== '-') karungSet.add(karungCode);

              itemsToInsert.push({
                sku_id: skuMap.get(skuKey),
                quantity: qty,
                satuan: 'Pcs',
                no_karung: karungCode
              });
            } else if (skuKey) {
              missingSKUs.push(skuRaw);
            }
          }

          if (itemsToInsert.length > 0) {
            let headerId;
            const { data: existingHeader } = await supabase
              .from('outbound_pabrik')
              .select('id, no_karung')
              .eq('nomor_outbound', poNumber)
              .maybeSingle();

            if (existingHeader) {
              headerId = existingHeader.id;
              const currentKarungs = existingHeader.no_karung ? existingHeader.no_karung.split(', ') : [];
              const newKarungs = Array.from(karungSet).filter(k => !currentKarungs.includes(k));
              if (newKarungs.length > 0) {
                 const updatedKarungStr = [...currentKarungs, ...newKarungs].join(', ');
                 await supabase.from('outbound_pabrik').update({ no_karung: updatedKarungStr }).eq('id', headerId);
              }
            } else {
              const karungString = Array.from(karungSet).join(', ');
              const { data: newHeader, error: headErr } = await supabase.from('outbound_pabrik').insert({
                nomor_outbound: poNumber,
                tanggal: date,
                sender: senderName,
                tujuan_pabrik: 'Gudang Utama',
                status: 'Draft', 
                no_karung: karungString
              }).select().single();
              
              if (headErr) throw headErr;
              headerId = newHeader.id;
            }

            const { error: itemErr } = await supabase.from('outbound_pabrik_items').insert(
              itemsToInsert.map(i => ({ ...i, outbound_pabrik_id: headerId }))
            );
            
            if (!itemErr) totalInserted += itemsToInsert.length;
          }
        }

        if (totalInserted > 0) {
          setSuccessModal({
            isOpen: true,
            title: 'Import Selesai',
            message: `Berhasil mengimport ${totalInserted} item data pengiriman.\n\nStatus saat ini: DRAFT.\nSilakan periksa data dan klik tombol 'Kirim' untuk memproses ke Gudang.`
          });
          fetchShipments();
        } else {
          alert(`Gagal Import. ${missingSKUs.length > 0 ? `SKU tidak ditemukan: ${missingSKUs.join(', ')}` : 'Format Excel tidak sesuai.'}`);
        }

      } catch (error: any) {
        alert(`Error: ${error.message}`);
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // --- DOWNLOAD TEMPLATE ---
  const handleDownloadTemplate = () => {
    const templateData = [{
      'Tanggal': '2025-06-01', // Contoh format YYYY-MM-DD
      'SKU Code': 'TRJMI101',
      'No. Karung': 'K3',
      'Qty': 30,
      'Pengirim': 'AULIA'
    }];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templateData);
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Outbound_Pabrik.xlsx");
  };

  // --- EXPORT DATA ---
  const handleExport = () => {
    const dataToExport = shipments.map(s => ({
      'Batch PO': s.po,
      'Tanggal': s.date, // Export juga YYYY-MM-DD
      'Pengirim': s.sender,
      'Tujuan': s.destination,
      'Total Qty': s.totalQty,
      'Status': s.status,
      'No. Karung': s.noKarung,
      'Catatan': s.notes
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    XLSX.utils.book_append_sheet(wb, ws, "Data Outbound");
    XLSX.writeFile(wb, `Outbound_Pabrik_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // --- DELETE ---
  const handleDeleteSelected = () => {
    const validIdsToDelete = shipments
      .filter(s => selectedIds.includes(s.id) && s.status !== 'Diterima')
      .map(s => s.id);

    if (validIdsToDelete.length === 0) {
      if (selectedIds.length > 0) {
        alert("Data yang dipilih memiliki status 'Diterima' dan tidak dapat dihapus.");
      }
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Hapus Data',
      message: `Hapus ${validIdsToDelete.length} data terpilih? ${selectedIds.length > validIdsToDelete.length ? '(Beberapa item dilewati karena status Diterima)' : ''}`,
      confirmLabel: 'Hapus',
      onConfirm: async () => {
        await supabase.from('outbound_pabrik').delete().in('id', validIdsToDelete);
        setShipments(prev => prev.filter(s => !validIdsToDelete.includes(s.id)));
        setSelectedIds([]);
      }
    });
  };

  // --- KIRIM (SEND) ---
  const handleSend = (item: any) => {
    setConfirmModal({
      isOpen: true,
      title: 'Kirim Pengiriman',
      message: `Apakah Anda yakin ingin mengirim ${item.po}? \n\nStatus akan berubah menjadi 'Dalam Pengiriman' dan data akan muncul di Inbound Gudang.`,
      confirmLabel: 'Kirim Sekarang',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('outbound_pabrik')
            .update({ status: 'Dalam Pengiriman' }) 
            .eq('id', item.id);

          if (error) throw error;
          
          setSuccessModal({
            isOpen: true,
            title: 'Berhasil Dikirim',
            message: 'Data pengiriman telah dikirim ke gudang (Status: Dalam Pengiriman).'
          });
          fetchShipments();
        } catch (error: any) {
          alert(`Gagal mengirim: ${error.message}`);
        }
      }
    });
  };

  // --- FILTERING LOGIC ---
  const filteredShipments = shipments.filter(s => {
    // Search Filter
    const matchesSearch = 
      s.po.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.noKarung.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.sender.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Date Range Filter
    const matchesStartDate = startDate ? s.date >= startDate : true;
    const matchesEndDate = endDate ? s.date <= endDate : true;

    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Draft': return 'bg-gray-100 text-gray-600';
      case 'Dalam Pengiriman': return 'bg-blue-100 text-blue-700';
      case 'Diterima': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const deletableItems = filteredShipments.filter(s => s.status !== 'Diterima');
  const isAllDeletableSelected = deletableItems.length > 0 && deletableItems.every(s => selectedIds.includes(s.id));

  return (
    <div className="space-y-6">
      <input type="file" ref={fileInputRef} onChange={handleImportExcel} className="hidden" accept=".xlsx, .xls" />
      
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Box className="text-gray-600"/> Outbound Pabrik
        </h2>
        
        <div className="flex flex-wrap gap-2">
          {selectedIds.length > 0 && (
            <button onClick={handleDeleteSelected} className="bg-red-100 text-red-600 px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium">
              <Trash2 size={16} /> Hapus ({selectedIds.length})
            </button>
          )}
          
          <div className="flex rounded-lg shadow-sm">
            <button onClick={handleDownloadTemplate} className="bg-white border border-gray-200 px-3 py-2 rounded-l-lg text-sm hover:bg-gray-50" title="Download Template">
              <FileSpreadsheet size={16} />
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="bg-white border-t border-b border-r border-gray-200 px-3 py-2 rounded-r-lg text-sm flex items-center gap-2 hover:bg-gray-50 text-gray-700">
              <Upload size={16} className="text-blue-600" /> Import
            </button>
          </div>

          <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors">
            <Download size={16} /> Ekspor
          </button>

          <button onClick={() => setIsModalOpen(true)} className="bg-erp-blue-600 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm">
            <Plus size={16} /> Tambah Manual
          </button>
          
          <button onClick={fetchShipments} className="bg-white border px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50" title="Refresh Data">
            <RefreshCw size={16}/>
          </button>
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-white dark:bg-dark-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-dark-600 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari Batch PO, Karung, atau Pengirim..." 
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
          <thead className="bg-gray-50 dark:bg-dark-700 font-semibold text-gray-700">
            <tr>
              <th className="px-6 py-4 w-10">
                <input 
                  type="checkbox" 
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(deletableItems.map(s => s.id));
                    } else {
                      setSelectedIds([]);
                    }
                  }} 
                  checked={isAllDeletableSelected}
                  disabled={deletableItems.length === 0}
                  className={deletableItems.length === 0 ? "cursor-not-allowed opacity-50" : ""}
                />
              </th>
              <th className="px-6 py-4">Batch PO</th>
              <th className="px-6 py-4">Karung</th>
              <th className="px-6 py-4">Tanggal</th>
              <th className="px-6 py-4">Pengirim</th>
              <th className="px-6 py-4">Total Qty</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? <tr><td colSpan={8} className="text-center py-8"><Loader2 className="animate-spin inline"/></td></tr> : 
            filteredShipments.length > 0 ? (
              filteredShipments.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(item.id)} 
                      onChange={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])} 
                      disabled={item.status === 'Diterima'}
                      className={item.status === 'Diterima' ? "cursor-not-allowed opacity-30" : ""}
                    />
                  </td>
                  <td className="px-6 py-4 font-medium">{item.po}</td>
                  <td className="px-6 py-4 text-xs font-mono text-gray-500 truncate max-w-[150px]">{item.noKarung}</td>
                  <td className="px-6 py-4">{item.date}</td>
                  <td className="px-6 py-4 uppercase font-bold text-gray-700">{item.sender}</td>
                  <td className="px-6 py-4 font-bold text-blue-700">{item.totalQty}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {item.status === 'Draft' && (
                        <button 
                          onClick={() => handleSend(item)} 
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 shadow-sm transition-colors"
                          title="Kirim ke Gudang"
                        >
                          <Send size={12} /> Kirim
                        </button>
                      )}
                      <button onClick={() => handleViewDetail(item)} className="text-blue-600 hover:underline text-xs font-medium">Detail</button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400 italic">Tidak ada data pengiriman.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <CreateShipmentModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleCreateSubmit}
        type="factory_outbound"
        title="Outbound Pabrik"
      />

      <ShipmentDetailModal 
        isOpen={isDetailOpen} 
        onClose={() => setIsDetailOpen(false)} 
        data={selectedDetail} 
        isLoading={isLoadingDetail} 
        onUpdate={() => { fetchShipments(); setIsDetailOpen(false); }} 
      />
      
      <ConfirmationModal 
        isOpen={confirmModal.isOpen} 
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={() => { confirmModal.onConfirm(); setConfirmModal({ ...confirmModal, isOpen: false }); }}
        title={confirmModal.title} 
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        isDangerous={false}
      />

      <SuccessModal
        isOpen={successModal.isOpen}
        onClose={() => setSuccessModal({ ...successModal, isOpen: false })}
        title={successModal.title}
        message={successModal.message}
      />

      <ErrorModal
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal({ ...errorModal, isOpen: false })}
        title={errorModal.title}
        message={errorModal.message}
      />
    </div>
  );
};
