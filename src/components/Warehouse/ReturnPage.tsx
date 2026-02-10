import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  RefreshCw, 
  Save, 
  RotateCcw, 
  Search, 
  AlertTriangle, 
  Clock, 
  CheckCircle2,
  ChevronDown,
  Download,
  Upload,
  FileSpreadsheet,
  Trash2,
  Loader2,
  LayoutList,
  History,
  PenTool,
  Warehouse,
  Calendar,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { SuccessModal } from './SuccessModal';

export const ReturnPage: React.FC = () => {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'input' | 'history-customer' | 'history-damaged'>('input');
  const [skus, setSkus] = useState<any[]>([]);
  const [customerReturns, setCustomerReturns] = useState<any[]>([]);
  const [damagedReturns, setDamagedReturns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form State
  const [formData, setFormData] = useState({
    type: 'Retur Customer', // 'Retur Customer', 'Barang Rusak', atau 'Barang Tidak Sesuai'
    skuId: '',
    qty: '',
    notes: '',
    manualName: '' // State baru untuk input manual
  });

  // Search & Filter State
  const [skuSearch, setSkuSearch] = useState(''); // Untuk dropdown di form
  const [tableSearch, setTableSearch] = useState(''); // Untuk filter tabel history
  const [startDate, setStartDate] = useState(''); // Filter Tanggal Mulai
  const [endDate, setEndDate] = useState(''); // Filter Tanggal Akhir
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [successModal, setSuccessModal] = useState({
    isOpen: false,
    title: '',
    message: ''
  });

  // --- FETCH DATA ---
  useEffect(() => {
    fetchMasterSKU();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch returns whenever filters change
  useEffect(() => {
    fetchReturns();
  }, [startDate, endDate]);

  const fetchMasterSKU = async () => {
    if (!isSupabaseConfigured()) return;
    const { data } = await supabase.from('master_sku').select('id, kode_sku, nama');
    if (data) setSkus(data);
  };

  const fetchReturns = async () => {
    if (!isSupabaseConfigured()) return;
    
    setIsLoading(true);
    try {
      let query = supabase
        .from('retur')
        .select(`
          *,
          retur_items (
            id,
            quantity,
            kondisi,
            master_sku (kode_sku, nama)
          )
        `)
        .order('created_at', { ascending: false });

      // Apply Date Filter
      if (startDate) {
        query = query.gte('tanggal', startDate);
      }
      if (endDate) {
        query = query.lte('tanggal', endDate);
      }

      // Increased limit to 2000 to show more data by default
      if (!startDate && !endDate) {
        query = query.limit(2000);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data) {
        const cReturns: any[] = [];
        const dReturns: any[] = [];

        data.forEach((r: any) => {
          const item = r.retur_items?.[0];
          if (!item) return;

          const formattedItem = {
            id: r.id,
            itemId: item.id,
            skuId: item.sku_id,
            skuCode: item.master_sku?.kode_sku,
            skuName: item.master_sku?.nama,
            qty: item.quantity,
            date: r.tanggal,
            displayDate: new Date(r.tanggal).toLocaleDateString('id-ID'),
            notes: r.catatan || '-',
            type: r.alasan, // 'Barang Rusak' atau 'Barang Tidak Sesuai'
            // Logic Kode Gudang: Retur Customer -> Rak Display, Lainnya -> Gudang Rusak
            warehouseCode: r.alasan === 'Retur Customer' ? 'Rak Display' : 'Gudang Rusak'
          };

          // GABUNGKAN 'Barang Rusak' DAN 'Barang Tidak Sesuai' KE TAB RIWAYAT RUSAK
          if (r.alasan === 'Barang Rusak' || r.alasan === 'Barang Tidak Sesuai') {
            dReturns.push(formattedItem);
          } else {
            cReturns.push(formattedItem);
          }
        });

        setCustomerReturns(cReturns);
        setDamagedReturns(dReturns);
      }
    } catch (error) {
      console.error("Error fetching returns:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- CALCULATE SUMMARY (TODAY) ---
  const todayDate = new Date().toISOString().split('T')[0];
  
  const todayCustomerQty = customerReturns
    .filter(i => i.date === todayDate)
    .reduce((acc, curr) => acc + curr.qty, 0);

  const todayDamagedQty = damagedReturns
    .filter(i => i.date === todayDate)
    .reduce((acc, curr) => acc + curr.qty, 0);

  // --- HELPER: GET OR CREATE UNKNOWN SKU ---
  const getOrCreateUnknownSKU = async () => {
    // 1. Cek apakah SKU khusus sudah ada
    const { data: existing } = await supabase
      .from('master_sku')
      .select('id')
      .eq('kode_sku', 'ITEM-UNKNOWN')
      .maybeSingle();

    if (existing) return existing.id;

    // 2. Jika belum, buat baru
    const { data: newSku, error } = await supabase
      .from('master_sku')
      .insert({
        kode_sku: 'ITEM-UNKNOWN',
        nama: 'Barang Tidak Terdaftar (Manual)',
        kategori: 'Lainnya',
        satuan: 'Pcs',
        min_stock: 0,
        hpp: 0,
        harga_jual: 0,
        deskripsi: 'SKU Placeholder untuk barang retur yang tidak ada di sistem'
      })
      .select('id')
      .single();

    if (error) throw error;
    return newSku.id;
  };

  // --- HANDLERS ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validasi
    if (formData.type === 'Barang Tidak Sesuai') {
        if (!formData.manualName || !formData.qty) {
            alert("Mohon isi Nama Barang Manual dan Quantity.");
            return;
        }
    } else {
        if (!formData.skuId || !formData.qty) {
            alert("Mohon pilih SKU dan isi Quantity.");
            return;
        }
    }

    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const returNo = `RET-${Date.now()}`;
      
      let finalSkuId = formData.skuId;
      let finalNotes = formData.notes;

      // LOGIKA KHUSUS BARANG TIDAK SESUAI (MANUAL)
      if (formData.type === 'Barang Tidak Sesuai') {
        finalSkuId = await getOrCreateUnknownSKU();
        // Gabungkan nama manual ke catatan agar info tidak hilang
        finalNotes = `[Manual: ${formData.manualName}] ${formData.notes}`;
      }

      const { data: header, error: headErr } = await supabase
        .from('retur')
        .insert({
          nomor_retur: returNo,
          tanggal: today,
          alasan: formData.type, 
          status: 'Selesai',
          catatan: finalNotes
        })
        .select()
        .single();

      if (headErr) throw headErr;

      // Tentukan kondisi fisik barang
      let kondisiBarang = 'Baik';
      if (formData.type === 'Barang Rusak') kondisiBarang = 'Rusak';
      if (formData.type === 'Barang Tidak Sesuai') kondisiBarang = 'Tidak Sesuai';

      const { error: itemErr } = await supabase
        .from('retur_items')
        .insert({
          retur_id: header.id,
          sku_id: finalSkuId,
          quantity: Number(formData.qty),
          kondisi: kondisiBarang
        });

      if (itemErr) throw itemErr;

      // HANYA RETUR CUSTOMER YANG MENAMBAH STOK RAK DISPLAY OTOMATIS
      if (formData.type === 'Retur Customer') {
        const { data: currentStock } = await supabase
          .from('stok_rak')
          .select('quantity')
          .match({ sku_id: finalSkuId, kode_rak: 'Rak Display' })
          .maybeSingle();

        const newQty = (currentStock?.quantity || 0) + Number(formData.qty);

        await supabase
          .from('stok_rak')
          .upsert({
            sku_id: finalSkuId,
            kode_rak: 'Rak Display',
            quantity: newQty,
            updated_at: new Date().toISOString()
          }, { onConflict: 'sku_id, kode_rak' });
          
        await supabase.from('riwayat_mutasi').insert({
          sku_id: finalSkuId,
          jenis_mutasi: 'Retur Customer',
          lokasi_asal: 'Customer',
          lokasi_tujuan: 'Rak Display',
          jumlah: Number(formData.qty),
          keterangan: `Retur: ${formData.notes}`
        });
      }

      setFormData({ ...formData, skuId: '', qty: '', notes: '', manualName: '' });
      setSkuSearch('');
      fetchReturns();
      
      setSuccessModal({
        isOpen: true,
        title: 'Retur Berhasil',
        message: `Data retur (${formData.type}) telah berhasil disimpan.`
      });

    } catch (error: any) {
      alert(`Gagal: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, type: string, skuId: string, qty: number) => {
    if (!window.confirm("Hapus data ini?")) return;

    try {
      if (type === 'Retur Customer') {
         const { data: currentStock } = await supabase
          .from('stok_rak')
          .select('quantity')
          .match({ sku_id: skuId, kode_rak: 'Rak Display' })
          .single();
        
        if (currentStock) {
          const newQty = Math.max(0, currentStock.quantity - qty);
          await supabase
            .from('stok_rak')
            .update({ quantity: newQty })
            .match({ sku_id: skuId, kode_rak: 'Rak Display' });
        }
      }
      await supabase.from('retur').delete().eq('id', id);
      fetchReturns();
    } catch (error: any) {
      alert(`Gagal menghapus: ${error.message}`);
    }
  };

  // --- IMPORT & EXPORT SYSTEM ---
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
        alert("File kosong!");
        return;
      }

      setIsLoading(true);
      try {
        const { data: skus } = await supabase.from('master_sku').select('id, kode_sku');
        const skuMap = new Map(skus?.map((s: any) => [s.kode_sku.trim().toUpperCase(), s.id]));
        
        let successCount = 0;
        let errorCount = 0;

        for (const row: any of jsonData) {
          // Parse fields
          const dateRaw = row['Tanggal'];
          const skuCode = row['SKU']?.toString().trim().toUpperCase();
          const qty = Number(row['Qty']);
          const type = row['Tipe'] || 'Retur Customer'; // Default
          let notes = row['Keterangan'] || '';

          if (!skuCode || !qty) {
             errorCount++;
             continue;
          }

          let skuId = skuMap.get(skuCode);
          
          if (!skuId) {
            // FIX: Handle unknown SKU for 'Barang Tidak Sesuai' (Manual Import)
            if (type === 'Barang Tidak Sesuai') {
               try {
                  skuId = await getOrCreateUnknownSKU();
                  // Append manual SKU name to notes so it's not lost
                  notes = `[Manual Import: ${row['SKU']}] ${notes}`;
               } catch (err) {
                  console.error("Failed to create unknown SKU", err);
                  errorCount++;
                  continue;
               }
            } else {
               // For other types, SKU must exist
               errorCount++;
               continue;
            }
          }

          // --- IMPROVED DATE PARSING ---
          let dateStr = new Date().toISOString().split('T')[0];
          
          if (typeof dateRaw === 'number') {
             // Excel Serial
             dateStr = new Date(Math.round((dateRaw - 25569) * 86400 * 1000)).toISOString().split('T')[0];
          } else if (typeof dateRaw === 'string') {
             const cleanDate = dateRaw.trim();
             const parts = cleanDate.split(/[\/\-]/);
             
             if (parts.length === 3) {
                 if (parts[0].length === 4) {
                     // YYYY-MM-DD
                     dateStr = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
                 } else {
                     // DD-MM-YYYY
                     const d = parts[0].padStart(2, '0');
                     const m = parts[1].padStart(2, '0');
                     let y = parts[2];
                     if (y.length === 2) y = '20' + y;
                     dateStr = `${y}-${m}-${d}`;
                 }
             }
          }

          // Insert Header
          const { data: header, error: headErr } = await supabase.from('retur').insert({
             nomor_retur: `RET-${Date.now()}-${Math.floor(Math.random()*1000)}`,
             tanggal: dateStr,
             alasan: type,
             status: 'Selesai',
             catatan: notes
          }).select().single();

          if (headErr) throw headErr;

          // Insert Item
          const kondisi = (type === 'Barang Rusak') ? 'Rusak' : (type === 'Barang Tidak Sesuai' ? 'Tidak Sesuai' : 'Baik');
          
          await supabase.from('retur_items').insert({
             retur_id: header.id,
             sku_id: skuId,
             quantity: qty,
             kondisi: kondisi
          });

          // Update Stock if Retur Customer
          if (type === 'Retur Customer') {
             const { data: currentStock } = await supabase
               .from('stok_rak')
               .select('quantity')
               .match({ sku_id: skuId, kode_rak: 'Rak Display' })
               .maybeSingle();
             
             const newQty = (currentStock?.quantity || 0) + qty;
             
             await supabase.from('stok_rak').upsert({
               sku_id: skuId,
               kode_rak: 'Rak Display',
               quantity: newQty,
               updated_at: new Date().toISOString()
             }, { onConflict: 'sku_id, kode_rak' });

             await supabase.from('riwayat_mutasi').insert({
                sku_id: skuId,
                jenis_mutasi: 'Retur Customer (Import)',
                lokasi_asal: 'Customer',
                lokasi_tujuan: 'Rak Display',
                jumlah: qty,
                keterangan: `Import: ${notes}`
             });
          }

          successCount++;
        }

        setSuccessModal({
           isOpen: true,
           title: 'Import Selesai',
           message: `Berhasil mengimport ${successCount} data retur.\nGagal: ${errorCount} baris (SKU tidak ditemukan/Format salah).`
        });
        fetchReturns();

      } catch (error: any) {
        alert(`Error: ${error.message}`);
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = () => {
    const data = [{ 'Tanggal': '11/06/2025', 'SKU': 'CPKL10232', 'Qty': 1, 'Tipe': 'Retur Customer', 'Keterangan': 'Tukar Size' }];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Retur.xlsx");
  };

  const handleExport = (data: any[], filename: string) => {
    const exportData = data.map(item => ({
      'SKU': item.skuCode,
      'Nama Barang': item.skuName,
      'Qty Retur': item.qty,
      'Jenis Retur': item.type, // Tambahkan kolom jenis retur
      'Kode Gudang': item.warehouseCode,
      'Keterangan': item.notes,
      'Tanggal': item.displayDate
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    const wscols = [
      { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 15 }
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Data Retur");
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  // --- FILTER DATA FOR TABLES ---
  const filteredCustomerReturns = customerReturns.filter(item => 
    item.skuName.toLowerCase().includes(tableSearch.toLowerCase()) ||
    item.skuCode.toLowerCase().includes(tableSearch.toLowerCase())
  );

  const filteredDamagedReturns = damagedReturns.filter(item => 
    item.skuName.toLowerCase().includes(tableSearch.toLowerCase()) ||
    item.skuCode.toLowerCase().includes(tableSearch.toLowerCase()) ||
    item.notes.toLowerCase().includes(tableSearch.toLowerCase()) // Include notes search for manual items
  );

  const filteredSkus = skus.filter(s => 
    s.nama.toLowerCase().includes(skuSearch.toLowerCase()) || 
    s.kode_sku.toLowerCase().includes(skuSearch.toLowerCase())
  );

  // --- CALCULATE TOTALS ---
  const totalCustomerQty = filteredCustomerReturns.reduce((acc, item) => acc + (Number(item.qty) || 0), 0);
  const totalDamagedQty = filteredDamagedReturns.reduce((acc, item) => acc + (Number(item.qty) || 0), 0);

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-dark-900 min-h-full">
      <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".xlsx, .xls" />

      {/* HEADER & TAB NAVIGATION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <RefreshCw className="text-erp-blue-600" /> Retur Barang
          </h1>
          <p className="text-gray-500 text-sm mt-1">Manajemen retur customer dan barang rusak</p>
        </div>

        {/* TAB SWITCHER */}
        <div className="flex bg-gray-200 dark:bg-dark-700 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('input')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'input' 
                ? 'bg-white dark:bg-dark-600 text-erp-blue-600 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <PenTool size={16} /> Input Retur
          </button>
          <button
            onClick={() => { setActiveTab('history-customer'); setTableSearch(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'history-customer' 
                ? 'bg-white dark:bg-dark-600 text-erp-blue-600 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <History size={16} /> Riwayat Customer
          </button>
          <button
            onClick={() => { setActiveTab('history-damaged'); setTableSearch(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'history-damaged' 
                ? 'bg-white dark:bg-dark-600 text-erp-blue-600 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <AlertTriangle size={16} /> Riwayat Rusak
          </button>
        </div>
      </div>

      {/* --- TAB CONTENT: INPUT RETUR --- */}
      {activeTab === 'input' && (
        <div className="space-y-6 animate-fadeIn">
          
          {/* FORM INPUT */}
          <div className="bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-gray-200 dark:border-dark-600 p-6">
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-100 dark:border-dark-700">
              <RotateCcw className="text-gray-700 dark:text-gray-300" size={20} />
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Input Retur Baru</h2>
                <p className="text-xs text-gray-500">Masukkan data retur customer atau barang rusak manual</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Jenis Retur</label>
                <select 
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-erp-blue-500/20 outline-none"
                >
                  <option value="Retur Customer">Retur Customer (Restock)</option>
                  <option value="Barang Rusak">Barang Rusak</option>
                  <option value="Barang Tidak Sesuai">Barang Tidak Sesuai</option>
                </select>
              </div>

              {/* KONDISIONAL INPUT: Jika "Barang Tidak Sesuai", Tampil Input Manual */}
              {formData.type === 'Barang Tidak Sesuai' ? (
                <div className="md:col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nama Barang / SKU (Manual)</label>
                  <input 
                    type="text"
                    placeholder="Ketik nama barang..."
                    value={formData.manualName}
                    onChange={(e) => setFormData({...formData, manualName: e.target.value})}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-erp-blue-500 outline-none"
                  />
                </div>
              ) : (
                <div className="md:col-span-1" ref={dropdownRef}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">SKU Barang</label>
                  <div className="relative">
                    <div 
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm cursor-pointer flex justify-between items-center hover:bg-white"
                    >
                      <span className="truncate">{formData.skuId ? skus.find(s => s.id === formData.skuId)?.kode_sku : 'Pilih SKU...'}</span>
                      <ChevronDown size={14} className="text-gray-400" />
                    </div>
                    {isDropdownOpen && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto p-2">
                        <input 
                          type="text" autoFocus placeholder="Cari..." 
                          value={skuSearch} onChange={(e) => setSkuSearch(e.target.value)}
                          className="w-full px-2 py-1 text-xs border rounded mb-2"
                        />
                        {filteredSkus.map(sku => (
                          <div key={sku.id} onClick={() => { setFormData({...formData, skuId: sku.id}); setIsDropdownOpen(false); }} className="px-2 py-1.5 hover:bg-blue-50 cursor-pointer text-xs rounded">
                            <b>{sku.kode_sku}</b> - {sku.nama}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Qty</label>
                <input 
                  type="number" min="1" placeholder="0"
                  value={formData.qty} onChange={(e) => setFormData({...formData, qty: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none"
                />
              </div>

              <button type="submit" disabled={isLoading} className="bg-erp-pink hover:bg-pink-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 h-[38px]">
                {isLoading ? <Loader2 className="animate-spin" size={16}/> : <Save size={16} />} Simpan
              </button>
            </form>
          </div>

          {/* SUMMARY CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-dark-800 p-6 rounded-xl shadow-sm border border-green-100 dark:border-green-900/20">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-gray-500 text-sm font-medium">Ringkasan Retur Hari Ini</h3>
                  <p className="text-xs text-gray-400">Retur Customer</p>
                </div>
                <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                  <RotateCcw size={20} />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">{todayCustomerQty}</span>
                <span className="text-sm text-gray-500">Pcs</span>
              </div>
            </div>

            <div className="bg-white dark:bg-dark-800 p-6 rounded-xl shadow-sm border border-red-100 dark:border-red-900/20">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-gray-500 text-sm font-medium">Ringkasan Barang Rusak Hari Ini</h3>
                  <p className="text-xs text-gray-400">Barang Tidak Sesuai/Rusak</p>
                </div>
                <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                  <AlertTriangle size={20} />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">{todayDamagedQty}</span>
                <span className="text-sm text-gray-500">Pcs</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB CONTENT: HISTORY CUSTOMER --- */}
      {activeTab === 'history-customer' && (
        <div className="bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-gray-200 dark:border-dark-600 overflow-hidden animate-fadeIn">
          <div className="p-6 border-b border-gray-100 dark:border-dark-600 flex flex-col xl:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <History className="text-erp-blue-600" size={20} />
              <h2 className="font-bold text-gray-900 dark:text-white">History Retur Customer</h2>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
              {/* Date Filter */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 shadow-sm h-[38px]">
                  <Calendar size={14} className="text-gray-400" />
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="text-xs border-none focus:ring-0 p-0 text-gray-600 bg-transparent w-24 outline-none"
                    placeholder="Dari"
                  />
                  <span className="text-gray-300">-</span>
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="text-xs border-none focus:ring-0 p-0 text-gray-600 bg-transparent w-24 outline-none"
                    placeholder="Sampai"
                  />
                  {(startDate || endDate) && (
                    <button onClick={() => { setStartDate(''); setEndDate(''); }} className="text-gray-400 hover:text-red-500 p-1">
                      <X size={14} />
                    </button>
                  )}
              </div>

              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Cari SKU..." 
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-erp-blue-500"
                />
              </div>
              <button onClick={handleDownloadTemplate} className="p-2 border rounded-lg hover:bg-gray-50 text-gray-600" title="Template">
                <FileSpreadsheet size={18} />
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="p-2 border rounded-lg hover:bg-gray-50 text-gray-600" title="Import">
                <Upload size={18} />
              </button>
              <button onClick={() => handleExport(customerReturns, 'Retur_Customer')} className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-green-700">
                <Download size={16} /> Export
              </button>
            </div>
          </div>

          <div className="overflow-auto max-h-[600px] custom-scrollbar">
            <table className="w-full text-sm text-left relative">
              <thead className="bg-gray-50 dark:bg-dark-700 text-gray-600 font-medium border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-3">SKU</th>
                  <th className="px-6 py-3 text-center">Qty Retur</th>
                  <th className="px-6 py-3">Kode Gudang</th>
                  <th className="px-6 py-3">Keterangan</th>
                  <th className="px-6 py-3">Tanggal</th>
                  <th className="px-6 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-600">
                {filteredCustomerReturns.length > 0 ? (
                  filteredCustomerReturns.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-dark-700">
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-800 dark:text-white">{item.skuCode}</div>
                        <div className="text-gray-500 text-xs">{item.skuName}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">
                          {item.qty}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Warehouse size={14} /> {item.warehouseCode}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{item.notes}</td>
                      <td className="px-6 py-4 text-gray-600">{item.displayDate}</td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleDelete(item.id, 'Retur Customer', item.skuId, item.qty)}
                          className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-400 italic">Belum ada data retur customer.</td></tr>
                )}
              </tbody>
              {/* FOOTER TOTAL */}
              <tfoot className="bg-gray-50 dark:bg-dark-700 font-bold border-t border-gray-200 sticky bottom-0 z-10">
                <tr>
                  <td className="px-6 py-3 text-right">TOTAL</td>
                  <td className="px-6 py-3 text-center text-green-700">{totalCustomerQty}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* --- TAB CONTENT: HISTORY DAMAGED (RUSAK & TIDAK SESUAI) --- */}
      {activeTab === 'history-damaged' && (
        <div className="bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-gray-200 dark:border-dark-600 overflow-hidden animate-fadeIn">
          <div className="p-6 border-b border-gray-100 dark:border-dark-600 flex flex-col xl:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-red-600" size={20} />
              <h2 className="font-bold text-gray-900 dark:text-white">History Barang Rusak / Tidak Sesuai</h2>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
              {/* Date Filter */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 shadow-sm h-[38px]">
                  <Calendar size={14} className="text-gray-400" />
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="text-xs border-none focus:ring-0 p-0 text-gray-600 bg-transparent w-24 outline-none"
                    placeholder="Dari"
                  />
                  <span className="text-gray-300">-</span>
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="text-xs border-none focus:ring-0 p-0 text-gray-600 bg-transparent w-24 outline-none"
                    placeholder="Sampai"
                  />
                  {(startDate || endDate) && (
                    <button onClick={() => { setStartDate(''); setEndDate(''); }} className="text-gray-400 hover:text-red-500 p-1">
                      <X size={14} />
                    </button>
                  )}
              </div>

              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Cari SKU / Keterangan..." 
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              {/* BUTTONS ADDED HERE FOR DAMAGED HISTORY */}
              <button onClick={handleDownloadTemplate} className="p-2 border rounded-lg hover:bg-gray-50 text-gray-600" title="Template">
                <FileSpreadsheet size={18} />
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="p-2 border rounded-lg hover:bg-gray-50 text-gray-600" title="Import">
                <Upload size={18} />
              </button>
              <button onClick={() => handleExport(damagedReturns, 'Barang_Rusak')} className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-green-700">
                <Download size={16} /> Export
              </button>
            </div>
          </div>

          <div className="overflow-auto max-h-[600px] custom-scrollbar">
            <table className="w-full text-sm text-left relative">
              <thead className="bg-gray-50 dark:bg-dark-700 text-gray-600 font-medium border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-3">SKU</th>
                  <th className="px-6 py-3 text-center">Qty Retur</th>
                  <th className="px-6 py-3">Jenis Retur</th>
                  <th className="px-6 py-3">Kode Gudang</th>
                  <th className="px-6 py-3">Keterangan</th>
                  <th className="px-6 py-3">Tanggal</th>
                  <th className="px-6 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-600">
                {filteredDamagedReturns.length > 0 ? (
                  filteredDamagedReturns.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-dark-700">
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-800 dark:text-white">{item.skuCode}</div>
                        <div className="text-gray-500 text-xs">{item.skuName}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">
                          {item.qty}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${item.type === 'Barang Rusak' ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'}`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Warehouse size={14} /> {item.warehouseCode}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{item.notes}</td>
                      <td className="px-6 py-4 text-gray-600">{item.displayDate}</td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleDelete(item.id, item.type, item.skuId, item.qty)}
                          className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-400 italic">Belum ada data barang rusak.</td></tr>
                )}
              </tbody>
              {/* FOOTER TOTAL */}
              <tfoot className="bg-gray-50 dark:bg-dark-700 font-bold border-t border-gray-200 sticky bottom-0 z-10">
                <tr>
                  <td className="px-6 py-3 text-right">TOTAL</td>
                  <td className="px-6 py-3 text-center text-red-700">{totalDamagedQty}</td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <SuccessModal
        isOpen={successModal.isOpen}
        onClose={() => setSuccessModal({ ...successModal, isOpen: false })}
        title={successModal.title}
        message={successModal.message}
      />
    </div>
  );
};
