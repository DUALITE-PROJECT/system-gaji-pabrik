import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, RefreshCw, Download, Upload, Plus, 
  ArrowUpRight, Loader2, FileText, List, Layers,
  Calendar, X, Trash2, CheckSquare, Edit2, FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { CreateShipmentModal } from './CreateShipmentModal';
import { SuccessModal } from './SuccessModal'; 
import { ConfirmationModal } from './ConfirmationModal';
import { ErrorModal } from './ErrorModal';

export const OutboundPage: React.FC = () => {
  // --- STATE ---
  const [outboundDetails, setOutboundDetails] = useState<any[]>([]); 
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  
  // Filters & View Mode
  const [detailSearch, setDetailSearch] = useState('');
  const [viewMode, setViewMode] = useState<'detail' | 'total'>('detail'); // State untuk Tab
  
  // Date Range Filter
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Grand Total State
  const [grandTotal, setGrandTotal] = useState(0);
  const [isCalculatingTotal, setIsCalculatingTotal] = useState(false);

  // Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // Import State
  const [isImporting, setIsImporting] = useState(false);

  // Modal
  const [isCreateModalOpen, setIsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Feedback Modals
  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });

  // Confirm Modal (General)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    isDangerous?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Ya, Lanjutkan',
    isDangerous: false,
    onConfirm: () => {}
  });

  // --- EDIT ITEM STATE ---
  const [isEditItemModalOpen, setIsEditItemModalOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<any>(null);
  const [editQty, setEditQty] = useState<number>(0);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // --- FETCH DATA ---
  const fetchData = () => {
    fetchOutboundDetails();
    fetchGrandTotal(); // Fetch total separately
    setSelectedIds([]); // Reset selection on refresh
  };

  const fetchOutboundDetails = async () => {
    setIsLoadingDetails(true);
    
    if (!isSupabaseConfigured()) {
      setIsLoadingDetails(false);
      return;
    }

    try {
      // 1. LOGIKA PENCARIAN SERVER-SIDE
      let matchedSkuIds: string[] = [];
      let isSearching = detailSearch.trim().length > 0;

      if (isSearching) {
        const { data: skuMatches } = await supabase
          .from('master_sku')
          .select('id')
          .or(`kode_sku.ilike.%${detailSearch}%,nama.ilike.%${detailSearch}%`);
        
        if (skuMatches && skuMatches.length > 0) {
          matchedSkuIds = skuMatches.map(s => s.id);
        } else {
          setOutboundDetails([]);
          setIsLoadingDetails(false);
          return;
        }
      }

      // 2. QUERY UTAMA
      let query = supabase
        .from('outbound_items')
        .select(`
          id,
          quantity,
          sku_id,
          outbound_id,
          outbound!inner (
            id,
            tanggal,
            nomor_outbound
          ),
          master_sku (
            kode_sku,
            nama,
            satuan
          )
        `);

      // Filter Tanggal
      if (startDate) {
        query = query.gte('outbound.tanggal', startDate);
      }
      if (endDate) {
        query = query.lte('outbound.tanggal', endDate);
      }

      // Filter Pencarian (Jika ada)
      if (isSearching) {
        query = query.in('sku_id', matchedSkuIds);
      }

      // Dynamic Limit
      // Jika sedang mencari atau filter tanggal, naikkan limit agar data lama muncul
      const queryLimit = (startDate || endDate || isSearching) ? 2000 : 50;

      const { data, error } = await query.order('id', { ascending: false }).limit(queryLimit);

      if (error) throw error;

      if (data) {
        const flatItems = data.map((item: any) => ({
          id: item.id,
          headerId: item.outbound.id,
          date: item.outbound.tanggal,
          po: item.outbound.nomor_outbound,
          skuId: item.sku_id,
          skuCode: item.master_sku?.kode_sku || '?',
          skuName: item.master_sku?.nama || 'Unknown',
          unit: item.master_sku?.satuan || 'Pcs',
          quantity: item.quantity
        }));

        // Client-side sort by date
        flatItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        setOutboundDetails(flatItems);
      }
    } catch (err: any) {
      console.error("Error fetching outbound details:", err);
      setErrorModal({
        isOpen: true,
        title: 'Gagal Memuat Data',
        message: `Gagal memuat data. (${err.message || 'Unknown Error'})`
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // --- FETCH GRAND TOTAL (BATCHED) ---
  const fetchGrandTotal = async () => {
    if (!isSupabaseConfigured()) return;
    setIsCalculatingTotal(true);
    
    try {
      let totalSum = 0;
      let from = 0;
      const step = 1000;
      let hasMore = true;

      // 1. Resolve Search
      let matchedSkuIds: string[] = [];
      let isSearching = detailSearch.trim().length > 0;

      if (isSearching) {
        const { data: skuMatches } = await supabase
          .from('master_sku')
          .select('id')
          .or(`kode_sku.ilike.%${detailSearch}%,nama.ilike.%${detailSearch}%`);
        
        if (skuMatches && skuMatches.length > 0) {
          matchedSkuIds = skuMatches.map(s => s.id);
        } else {
          setGrandTotal(0);
          setIsCalculatingTotal(false);
          return;
        }
      }

      // 2. Batch Fetch
      while (hasMore) {
        let query = supabase
          .from('outbound_items')
          .select('quantity, outbound!inner(tanggal)');

        if (startDate) query = query.gte('outbound.tanggal', startDate);
        if (endDate) query = query.lte('outbound.tanggal', endDate);
        if (isSearching) query = query.in('sku_id', matchedSkuIds);

        const { data: batch, error } = await query.range(from, from + step - 1);

        if (error) throw error;

        if (batch && batch.length > 0) {
          const batchSum = batch.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);
          totalSum += batchSum;

          if (batch.length < step) hasMore = false;
          else from += step;
        } else {
          hasMore = false;
        }
      }

      setGrandTotal(totalSum);

    } catch (error) {
      console.error("Error calculating grand total:", error);
    } finally {
      setIsCalculatingTotal(false);
    }
  };

  // Debounce Search & Fetch
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 500); 
    return () => clearTimeout(timer);
  }, [startDate, endDate, detailSearch]); 

  // --- CREATE OUTBOUND HANDLER ---
  const handleCreateSubmit = async (data: any) => {
    setIsLoadingDetails(true);
    try {
      // 1. Validasi Stok Rak
      if (data.items) {
        for (const item of data.items) {
            const { data: currentStock } = await supabase
                .from('stok_rak')
                .select('quantity')
                .match({ sku_id: item.skuId, kode_rak: 'Rak Display' })
                .single();
            
            if (!currentStock || currentStock.quantity < item.qty) {
                throw new Error(`Stok Rak tidak cukup untuk ${item.skuName || 'Item'}. Tersedia: ${currentStock?.quantity || 0}`);
            }
        }
      }

      // 2. Insert Header Outbound
      const { data: headerData, error: headerError } = await supabase
        .from('outbound')
        .insert([{
          nomor_outbound: data.referenceNo,
          tanggal: data.date,
          tujuan: data.destination,
          catatan: data.notes,
          status: 'Selesai'
        }])
        .select()
        .single();

      if (headerError) throw headerError;

      // 3. Insert Items & Update Stock
      if (data.items && data.items.length > 0 && headerData) {
        const itemsToInsert = data.items.map((item: any) => ({
          outbound_id: headerData.id,
          sku_id: item.skuId,
          quantity: item.qty
        }));

        const { error: itemsError } = await supabase
          .from('outbound_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        // Update Stock & Log Mutation
        for (const item of data.items) {
            const { data: currentStock } = await supabase
                .from('stok_rak')
                .select('quantity')
                .match({ sku_id: item.skuId, kode_rak: 'Rak Display' })
                .single();
            
            if (currentStock) {
                await supabase
                    .from('stok_rak')
                    .update({ quantity: currentStock.quantity - item.qty })
                    .match({ sku_id: item.skuId, kode_rak: 'Rak Display' });
            }

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

      setSuccessModal({
        isOpen: true,
        title: 'Berhasil Disimpan',
        message: 'Data outbound berhasil disimpan dan stok rak telah diperbarui.'
      });
      
      setIsModalOpen(false);
      fetchData();

    } catch (error: any) {
      console.error('Error saving outbound:', error);
      setErrorModal({
        isOpen: true,
        title: 'Gagal Menyimpan',
        message: error.message
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // --- GROUPING LOGIC (TOTAL MODE) ---
  const groupedOutbound = useMemo(() => {
    if (viewMode === 'detail') return [];

    const groups: Record<string, any> = {};
    outboundDetails.forEach(item => {
      const key = item.skuCode; // Group by SKU Code
      if (!groups[key]) {
        groups[key] = {
          skuCode: item.skuCode,
          skuName: item.skuName,
          unit: item.unit,
          totalQuantity: 0
        };
      }
      groups[key].totalQuantity += item.quantity;
    });
    
    return Object.values(groups).sort((a: any, b: any) => b.totalQuantity - a.totalQuantity);
  }, [outboundDetails, viewMode]);

  // --- DATA SOURCE ---
  const displayData = viewMode === 'detail' ? outboundDetails : groupedOutbound;

  // --- SELECTION HANDLERS ---
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (viewMode !== 'detail') return;
    if (e.target.checked) {
      setSelectedIds(displayData.map(item => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(item => item !== id));
    } else {
      setSelectedIds(prev => [...prev, id]);
    }
  };

  const isAllSelected = displayData.length > 0 && selectedIds.length === displayData.length;
  const isIndeterminate = selectedIds.length > 0 && selectedIds.length < displayData.length;

  // --- DELETE HANDLER (BULK & SINGLE) ---
  const deleteItemsLogic = async (idsToDelete: string[]) => {
    setIsDeleting(true);
    try {
      // 1. Get items to delete
      const itemsToDeleteData = outboundDetails.filter(item => idsToDelete.includes(item.id));
      
      if (itemsToDeleteData.length === 0) {
         throw new Error("Tidak ada data yang ditemukan untuk dihapus.");
      }

      const affectedHeaderIds = new Set(itemsToDeleteData.map(i => i.headerId));

      // 2. Aggregate by SKU
      const skuAggregation = new Map<string, { qty: number, count: number, poList: string[] }>();

      itemsToDeleteData.forEach(item => {
        const current = skuAggregation.get(item.skuId) || { qty: 0, count: 0, poList: [] };
        skuAggregation.set(item.skuId, {
          qty: current.qty + Number(item.quantity),
          count: current.count + 1,
          poList: [...current.poList, item.po]
        });
      });

      // 3. Restore Stock
      for (const [skuId, data] of skuAggregation.entries()) {
        const { data: currentStock } = await supabase
          .from('stok_rak')
          .select('quantity')
          .match({ sku_id: skuId, kode_rak: 'Rak Display' })
          .maybeSingle();
        
        const newQty = (currentStock?.quantity || 0) + data.qty;

        const { error: updateError } = await supabase
          .from('stok_rak')
          .upsert({
            sku_id: skuId,
            kode_rak: 'Rak Display',
            quantity: newQty,
            updated_at: new Date().toISOString()
          }, { onConflict: 'sku_id, kode_rak' });
          
        if (updateError) throw new Error(`Gagal update stok: ${updateError.message}`);

        const poText = data.poList.slice(0, 3).join(', ') + (data.poList.length > 3 ? ` +${data.poList.length - 3} lainnya` : '');
        
        await supabase.from('riwayat_mutasi').insert({
          sku_id: skuId,
          jenis_mutasi: 'Pembatalan Outbound',
          lokasi_asal: 'Customer',
          lokasi_tujuan: 'Rak Display',
          jumlah: data.qty,
          keterangan: `Hapus Massal (${data.count} item): ${poText}`
        });
      }

      // 4. Delete Items
      const BATCH_SIZE = 100;
      for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
        const chunk = idsToDelete.slice(i, i + BATCH_SIZE);
        const { error: deleteError } = await supabase
          .from('outbound_items')
          .delete()
          .in('id', chunk);
        
        if (deleteError) throw deleteError;
      }

      // 5. Cleanup Headers
      for (const headerId of Array.from(affectedHeaderIds)) {
          const { count } = await supabase
              .from('outbound_items')
              .select('*', { count: 'exact', head: true })
              .eq('outbound_id', headerId);
          
          if (count === 0) {
              await supabase.from('outbound').delete().eq('id', headerId);
          }
      }

      setSuccessModal({
        isOpen: true,
        title: 'Berhasil Dihapus',
        message: `${idsToDelete.length} data outbound telah dihapus dan stok dikembalikan ke Rak Display.`
      });
      
      fetchData();
      setSelectedIds([]); 

    } catch (error: any) {
      console.error("Delete error:", error);
      setErrorModal({ isOpen: true, title: 'Gagal Menghapus', message: error.message });
    } finally {
      setIsDeleting(false);
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;

    setConfirmModal({
      isOpen: true,
      title: 'Hapus Data Outbound',
      message: `Apakah Anda yakin ingin menghapus ${selectedIds.length} data outbound terpilih? \n\nStok barang akan DIKEMBALIKAN otomatis ke Rak Display.`,
      confirmLabel: 'Ya, Hapus & Kembalikan Stok',
      isDangerous: true,
      onConfirm: () => deleteItemsLogic(selectedIds)
    });
  };

  const handleDeleteSingle = (item: any) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Item Outbound',
      message: `Yakin ingin menghapus ${item.skuName}? \n\nStok sebanyak ${item.quantity} ${item.unit} akan dikembalikan ke Rak Display.`,
      confirmLabel: 'Ya, Hapus',
      isDangerous: true,
      onConfirm: () => deleteItemsLogic([item.id])
    });
  };

  // --- EDIT HANDLER ---
  const handleEditItem = (item: any) => {
    setItemToEdit(item);
    setEditQty(item.quantity);
    setIsEditItemModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!itemToEdit) return;
    const oldQty = Number(itemToEdit.quantity);
    const newQty = Number(editQty);
    const diff = newQty - oldQty;

    if (newQty <= 0) {
      alert("Jumlah harus lebih dari 0");
      return;
    }

    if (diff === 0) {
      setIsEditItemModalOpen(false);
      return;
    }

    setIsSavingEdit(true);
    try {
      if (diff > 0) {
          const { data: currentStock } = await supabase
              .from('stok_rak')
              .select('quantity')
              .match({ sku_id: itemToEdit.skuId, kode_rak: 'Rak Display' })
              .single();
          
          if (!currentStock || currentStock.quantity < diff) {
              throw new Error(`Stok Rak tidak cukup. Tersedia: ${currentStock?.quantity || 0}, Butuh tambahan: ${diff}`);
          }
          
          await supabase.from('stok_rak').update({
              quantity: currentStock.quantity - diff
          }).match({ sku_id: itemToEdit.skuId, kode_rak: 'Rak Display' });
      } else {
          const absDiff = Math.abs(diff);
          const { data: currentStock } = await supabase
              .from('stok_rak')
              .select('quantity')
              .match({ sku_id: itemToEdit.skuId, kode_rak: 'Rak Display' })
              .maybeSingle();
          
          const newStock = (currentStock?.quantity || 0) + absDiff;
          
          await supabase.from('stok_rak').upsert({
              sku_id: itemToEdit.skuId,
              kode_rak: 'Rak Display',
              quantity: newStock,
              updated_at: new Date().toISOString()
          }, { onConflict: 'sku_id, kode_rak' });
      }

      const { error } = await supabase.from('outbound_items').update({ quantity: newQty }).eq('id', itemToEdit.id);
      if (error) throw error;

      await supabase.from('riwayat_mutasi').insert({
          sku_id: itemToEdit.skuId,
          jenis_mutasi: 'Koreksi Outbound',
          lokasi_asal: diff > 0 ? 'Rak Display' : 'Customer',
          lokasi_tujuan: diff > 0 ? 'Customer' : 'Rak Display',
          jumlah: Math.abs(diff),
          keterangan: `Edit Qty Outbound: ${itemToEdit.po} (${oldQty} -> ${newQty})`
      });

      setSuccessModal({ isOpen: true, title: 'Berhasil', message: 'Data outbound diperbarui.' });
      setIsEditItemModalOpen(false);
      fetchData();

    } catch (error: any) {
      setErrorModal({ isOpen: true, title: 'Gagal Edit', message: error.message });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // --- IMPORT & TEMPLATE ---
  const handleDownloadTemplate = () => {
    const template = [
      {
        'Tanggal': new Date().toLocaleDateString('en-CA'),
        'Kode SKU': 'TSWTR105',
        'Qty': 1,
        'Keterangan': 'Penjualan Online'
      }
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(template);
    XLSX.utils.book_append_sheet(wb, ws, "Template Outbound");
    XLSX.writeFile(wb, "Template_Outbound.xlsx");
  };

  const parseDate = (dateVal: any) => {
    let dateStr = new Date().toISOString().split('T')[0]; // Default Today
    
    if (typeof dateVal === 'number') {
       // Excel Serial Date
       dateStr = new Date(Math.round((dateVal - 25569) * 86400 * 1000)).toISOString().split('T')[0];
    } else if (typeof dateVal === 'string') {
       const cleanDate = dateVal.trim();
       // Try parsing various formats
       // YYYY-MM-DD
       if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return cleanDate;
       
       const parts = cleanDate.split(/[\/\-]/);
       if (parts.length === 3) {
           // DD-MM-YYYY or DD/MM/YYYY
           const d = parts[0].padStart(2, '0');
           const m = parts[1].padStart(2, '0');
           let y = parts[2];
           if (y.length === 2) y = '20' + y;
           dateStr = `${y}-${m}-${d}`;
       }
    }
    return dateStr;
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(ws);

      if (jsonData.length === 0) {
        alert("File kosong.");
        return;
      }

      setIsImporting(true);
      try {
        // 1. Fetch Master SKU for mapping
        const { data: skus } = await supabase.from('master_sku').select('id, kode_sku, nama');
        const skuMap = new Map(skus?.map((s: any) => [s.kode_sku.trim().toUpperCase(), s.id]));

        // 2. Fetch Stock Rak for validation
        const { data: stocks } = await supabase
            .from('stok_rak')
            .select('sku_id, quantity')
            .eq('kode_rak', 'Rak Display');
        const stockMap = new Map(stocks?.map((s: any) => [s.sku_id, Number(s.quantity)]));

        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        // Group by Reference No to create headers efficiently
        // Since user removed Ref No column, we generate unique Ref per row (or per transaction if logic allowed)
        // Here we assume 1 row = 1 transaction for simplicity and robustness
        const groupedData: Record<string, any> = {};

        for (const [index, row] of jsonData.entries()) {
            // Generate unique ref for each row to avoid grouping by accident
            const refNo = `OUT-${Date.now()}-${index}`;
            
            groupedData[refNo] = {
                date: row['Tanggal'] || new Date().toISOString().split('T')[0],
                destination: 'Customer Umum',
                notes: row['Keterangan'] || '',
                items: []
            };

            const skuCode = (row['Kode SKU'] || row['sku_kode'] || '').toString().trim().toUpperCase();
            const qty = Number(row['Qty'] || 0);

            if (skuCode && qty > 0) {
                const skuId = skuMap.get(skuCode);
                if (skuId) {
                    groupedData[refNo].items.push({ skuId, qty, skuCode });
                } else {
                    errorCount++;
                    errors.push(`SKU tidak ditemukan: ${skuCode}`);
                }
            } else {
                errorCount++; // Invalid row
            }
        }

        // Process each group (Transaction)
        for (const [refNo, data] of Object.entries(groupedData)) {
            if (data.items.length === 0) continue;

            // Check Stock for all items in this transaction
            let stockSufficient = true;
            for (const item of data.items) {
                const currentStock = stockMap.get(item.skuId) || 0;
                if (currentStock < item.qty) {
                    stockSufficient = false;
                    errors.push(`Stok tidak cukup untuk ${item.skuCode}. Butuh: ${item.qty}, Ada: ${currentStock}`);
                    break;
                }
            }

            if (!stockSufficient) {
                errorCount++;
                continue; // Skip this transaction
            }

            // Create Header
            const { data: header, error: headErr } = await supabase
                .from('outbound')
                .insert({
                    nomor_outbound: refNo,
                    tanggal: parseDate(data.date), 
                    tujuan: data.destination,
                    catatan: data.notes,
                    status: 'Selesai'
                })
                .select()
                .single();

            if (headErr) {
                console.error("Header insert error", headErr);
                errorCount++;
                continue;
            }

            // Insert Items & Update Stock
            for (const item of data.items) {
                await supabase.from('outbound_items').insert({
                    outbound_id: header.id,
                    sku_id: item.skuId,
                    quantity: item.qty
                });

                // Update Stock
                const currentStock = stockMap.get(item.skuId) || 0;
                const newStock = currentStock - item.qty;
                stockMap.set(item.skuId, newStock); // Update local map for next iterations

                await supabase.from('stok_rak')
                    .update({ quantity: newStock })
                    .match({ sku_id: item.skuId, kode_rak: 'Rak Display' });

                // Log Mutation
                await supabase.from('riwayat_mutasi').insert({
                    sku_id: item.skuId,
                    jenis_mutasi: 'Penjualan (Outbound) Import',
                    lokasi_asal: 'Rak Display',
                    lokasi_tujuan: 'Customer',
                    jumlah: item.qty,
                    keterangan: `Import: ${data.notes}`
                });
            }
            successCount++;
        }

        if (errors.length > 0) {
            alert(`Import Selesai dengan catatan:\nBerhasil: ${successCount} Transaksi\nGagal: ${errorCount} Transaksi\n\nDetail Error:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...' : ''}`);
        } else {
            setSuccessModal({ isOpen: true, title: 'Import Berhasil', message: `Berhasil mengimport ${successCount} transaksi outbound.` });
        }
        
        fetchData();

      } catch (error: any) {
        alert(`Error: ${error.message}`);
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // --- EXPORT (FIXED: FETCH ALL DATA) ---
  const handleExportDetails = async () => {
    setIsLoadingDetails(true);
    try {
      let allItems: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      // Loop to fetch ALL data matching filters (ignoring 50 limit)
      while (hasMore) {
        let query = supabase
          .from('outbound_items')
          .select(`
            quantity,
            outbound!inner (tanggal, nomor_outbound),
            master_sku (kode_sku, nama, satuan)
          `)
          .range(from, from + step - 1);

        if (startDate) {
            query = query.gte('outbound.tanggal', startDate);
        }
        if (endDate) {
             query = query.lte('outbound.tanggal', endDate);
        }
        
        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          allItems = [...allItems, ...data];
          if (data.length < step) hasMore = false;
          else from += step;
        } else {
          hasMore = false;
        }
      }

      if (allItems.length === 0) {
        alert("Tidak ada data untuk diexport.");
        return;
      }

      // Process Data for Export
      const exportData = allItems.map((item: any) => ({
        'Tanggal': item.outbound?.tanggal,
        'No. Referensi': item.outbound?.nomor_outbound,
        'SKU': item.master_sku?.kode_sku,
        'Nama Barang': item.master_sku?.nama,
        'Jumlah': item.quantity,
        'Satuan': item.master_sku?.satuan || 'Pcs'
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      
      // Auto width
      const wscols = [
          { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 10 }
      ];
      ws['!cols'] = wscols;

      XLSX.utils.book_append_sheet(wb, ws, "Outbound");
      XLSX.writeFile(wb, `Outbound_All_${new Date().toISOString().slice(0,10)}.xlsx`);

    } catch (err: any) {
      console.error("Export error:", err);
      alert("Gagal export data.");
    } finally {
      setIsLoadingDetails(false);
    }
  };

  return (
    <div className="space-y-6">
      <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".xlsx, .xls" />

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <ArrowUpRight className="text-blue-600"/> Outbound / Penjualan
          </h2>
          <p className="text-sm text-gray-500">Kelola barang keluar dari Rak Display</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {selectedIds.length > 0 && (
            <button onClick={handleDeleteSelected} className="bg-red-100 text-red-700 px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium">
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

          <button onClick={handleExportDetails} className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors">
            <Download size={16} /> Ekspor
          </button>

          <button onClick={() => setIsModalOpen(true)} className="bg-erp-blue-600 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm">
            <Plus size={16} /> Tambah Manual
          </button>
          
          <button onClick={fetchData} className="bg-white border px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50" title="Refresh Data">
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
            value={detailSearch}
            onChange={(e) => setDetailSearch(e.target.value)}
            placeholder="Cari SKU atau Nama Barang..." 
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

      {/* SECTION: TAB & TABLE */}
      <div className="bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-gray-200 dark:border-dark-600 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-dark-600">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText size={20} className="text-blue-600"/> 
                {viewMode === 'detail' ? 'Rincian Outbound' : 'Total Outbound'}
              </h2>
              <p className="text-sm text-gray-500">
                {viewMode === 'detail' 
                  ? 'Daftar detail barang yang telah keluar (per item)' 
                  : 'Akumulasi total barang keluar per SKU'}
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Toggle Tabs */}
              <div className="flex bg-gray-100 p-1 rounded-lg shrink-0">
                <button
                  onClick={() => setViewMode('detail')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    viewMode === 'detail' 
                      ? 'bg-white text-blue-600 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <List size={14} /> Rincian
                </button>
                <button
                  onClick={() => setViewMode('total')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    viewMode === 'total' 
                      ? 'bg-white text-blue-600 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Layers size={14} /> Total
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* BULK ACTION BAR (Delete) */}
        {selectedIds.length > 0 && viewMode === 'detail' && (
          <div className="bg-red-50 border-b border-red-100 p-3 flex justify-between items-center animate-fadeIn">
            <div className="flex items-center gap-2 text-red-800 font-medium text-sm">
              <CheckSquare size={18} />
              <span>{selectedIds.length} item terpilih</span>
            </div>
            <button 
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="animate-spin" size={16}/> : <Trash2 size={16} />} 
              Hapus Data
            </button>
          </div>
        )}
        
        {/* SCROLLABLE TABLE CONTAINER */}
        <div className="overflow-y-auto max-h-[600px] custom-scrollbar">
          <table className="w-full text-sm text-left relative border-collapse">
            <thead className="bg-blue-50 dark:bg-dark-700 text-gray-700 dark:text-gray-300 font-semibold sticky top-0 z-10 shadow-sm">
              <tr>
                {viewMode === 'detail' && (
                  <th className="px-6 py-4 bg-blue-50 dark:bg-dark-700 w-10 text-center">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={isAllSelected}
                      ref={input => { if (input) input.indeterminate = isIndeterminate; }}
                      onChange={handleSelectAll}
                    />
                  </th>
                )}
                {viewMode === 'detail' && <th className="px-6 py-4 bg-blue-50 dark:bg-dark-700">Tanggal</th>}
                <th className="px-6 py-4 bg-blue-50 dark:bg-dark-700">SKU</th>
                <th className="px-6 py-4 bg-blue-50 dark:bg-dark-700">Nama Barang</th>
                <th className="px-6 py-4 text-center bg-blue-50 dark:bg-dark-700">
                  {viewMode === 'detail' ? 'Outbound' : 'Total Outbound'}
                </th>
                {viewMode === 'detail' && <th className="px-6 py-4 bg-blue-50 dark:bg-dark-700 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-600">
              {isLoadingDetails ? (
                <tr><td colSpan={viewMode === 'detail' ? 6 : 4} className="p-8 text-center"><Loader2 className="animate-spin inline text-blue-600"/> Memuat data...</td></tr>
              ) : displayData.length > 0 ? (
                displayData.map((item, idx) => (
                  <tr key={`${item.id || item.skuCode}-${idx}`} className={`hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors ${selectedIds.includes(item.id) ? 'bg-blue-50/50' : ''}`}>
                    {viewMode === 'detail' && (
                      <td className="px-6 py-4 text-center">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => handleSelectOne(item.id)}
                        />
                      </td>
                    )}
                    {viewMode === 'detail' && <td className="px-6 py-4 text-gray-600">{item.date}</td>}
                    <td className="px-6 py-4 font-medium text-blue-600">{item.skuCode}</td>
                    <td className="px-6 py-4 text-gray-900 dark:text-white">{item.skuName}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold text-xs">
                        {viewMode === 'detail' ? item.quantity : item.totalQuantity} {item.unit}
                      </span>
                    </td>
                    {viewMode === 'detail' && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => handleEditItem(item)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded border border-transparent hover:border-blue-100 transition-all"
                            title="Edit Jumlah"
                          >
                            <Edit2 size={16}/>
                          </button>
                          <button 
                            onClick={() => handleDeleteSingle(item)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded border border-transparent hover:border-red-100 transition-all"
                            title="Hapus Item"
                          >
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={viewMode === 'detail' ? 6 : 4} className="p-12 text-center bg-gray-50/30">
                    <p className="text-gray-500 italic">Belum ada data outbound.</p>
                  </td>
                </tr>
              )}
            </tbody>
            {/* TOTAL FOOTER ROW */}
            {!isLoadingDetails && (
                <tfoot className="bg-gray-100 dark:bg-dark-700 font-bold border-t-2 border-gray-200 sticky bottom-0 z-10">
                    <tr>
                        <td colSpan={viewMode === 'detail' ? 4 : 3} className="px-6 py-4 text-right text-gray-700 uppercase">
                            Total Keseluruhan {isCalculatingTotal ? '(Menghitung...)' : ''}
                        </td>
                        <td className="px-6 py-4 text-center text-blue-700">
                            {isCalculatingTotal ? <Loader2 className="animate-spin inline" size={16}/> : grandTotal.toLocaleString()}
                        </td>
                        {viewMode === 'detail' && <td></td>}
                    </tr>
                </tfoot>
            )}
          </table>
        </div>
      </div>

      <CreateShipmentModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleCreateSubmit}
        type="outbound"
        title="Outbound / Penjualan"
      />

      {/* EDIT ITEM MODAL */}
      <ConfirmationModal
        isOpen={isEditItemModalOpen}
        onClose={() => setIsEditItemModalOpen(false)}
        onConfirm={handleSaveEdit}
        title="Edit Jumlah Outbound"
        message={`Ubah jumlah untuk ${itemToEdit?.skuName}`}
        confirmLabel="Simpan Perubahan"
        isDangerous={false}
        isLoading={isSavingEdit}
      >
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Baru</label>
          <input 
              type="number" 
              min="1"
              value={editQty}
              onChange={(e) => setEditQty(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <p className="text-xs text-gray-500 mt-1">Stok Rak Display akan otomatis disesuaikan.</p>
        </div>
      </ConfirmationModal>

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

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        isDangerous={confirmModal.isDangerous}
      />
    </div>
  );
};
