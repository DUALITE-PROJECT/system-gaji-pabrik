import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Calendar, User, Package, MapPin, Layers, Box, Filter, CheckCircle2, Save, ListChecks, Search, Printer, Tag, CheckSquare, Edit2, Trash2, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Barcode from 'react-barcode';

interface ShipmentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any;
  isLoading: boolean;
  isReceivingMode?: boolean; 
  onSaveProgress?: () => void;
  onUpdate?: () => void; 
}

export const ShipmentDetailModal: React.FC<ShipmentDetailModalProps> = ({
  isOpen,
  onClose,
  data,
  isLoading,
  isReceivingMode = false,
  onSaveProgress,
  onUpdate
}) => {
  // --- STATE UMUM ---
  const [selectedKarungs, setSelectedKarungs] = useState<string[]>([]);
  const [karungSearchTerm, setKarungSearchTerm] = useState('');
  const printRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  // --- STATE RECEIVING (INBOUND) ---
  const [itemsState, setItemsState] = useState<Record<string, { isChecked: boolean; qtyReceived: number; notes: string; targetWarehouse: string }>>({});

  // --- STATE EDITING (DRAFT OUTBOUND) ---
  const [isEditing, setIsEditing] = useState(false);
  const [editHeader, setEditHeader] = useState({ date: '', sender: '', notes: '' });
  const [editItems, setEditItems] = useState<Record<string, { qty: number; noKarung: string }>>({});
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([]);

  const isReadOnly = data?.status === 'Diterima';

  // --- INITIALIZE STATE ---
  useEffect(() => {
    if (data) {
      setIsEditing(false);
      setDeletedItemIds([]);
      setKarungSearchTerm('');
      setSelectedKarungs([]);

      if (data.items) {
        const initialReceiveState: any = {};
        const initialEditItemsState: any = {};

        data.items.forEach((item: any) => {
          const safeQty = item.qtyReceived !== null && item.qtyReceived !== undefined ? Number(item.qtyReceived) : 0; 
          initialReceiveState[item.id] = {
            isChecked: item.isChecked || false,
            qtyReceived: safeQty,
            notes: item.checkNotes || '',
            targetWarehouse: item.targetWarehouse || 'Gudang 1'
          };

          initialEditItemsState[item.id] = {
            qty: Number(item.qty),
            noKarung: item.noKarung || '-'
          };
        });
        setItemsState(initialReceiveState);
        setEditItems(initialEditItemsState);
      }

      setEditHeader({
        date: data.date || '',
        sender: data.sender || '',
        notes: data.notes || ''
      });
    }
  }, [data]);

  // --- LOGIKA PENGELOMPOKAN KARUNG ---
  const groupedKarungs = useMemo(() => {
    if (!data?.items) return {};
    const groups: Record<string, Set<string>> = {};
    
    const activeItems = isEditing 
      ? data.items.filter((i: any) => !deletedItemIds.includes(i.id))
      : data.items;

    activeItems.forEach((item: any) => {
      const karungRaw = isEditing && editItems[item.id] ? editItems[item.id].noKarung : item.noKarung;
      const karung = karungRaw ? karungRaw.trim() : '-';
      
      if (karung === '-') return;

      const category = item.skuCategory || 'Lainnya / Campuran';
      if (!groups[category]) groups[category] = new Set();
      groups[category].add(karung);
    });

    return groups;
  }, [data, isEditing, editItems, deletedItemIds]);

  const sortedCategories = Object.keys(groupedKarungs).sort();

  if (!isOpen) return null;

  // --- FILTERING & SORTING ---
  const cleanStr = (str: string) => str ? str.toString().trim().toLowerCase() : '';

  let filteredItems = data?.items?.filter((item: any) => !deletedItemIds.includes(item.id));
  
  if (selectedKarungs.length > 0) {
    filteredItems = filteredItems?.filter((item: any) => {
      const itemKarung = isEditing && editItems[item.id] ? cleanStr(editItems[item.id].noKarung) : cleanStr(item.noKarung);
      return selectedKarungs.some(selected => cleanStr(selected) === itemKarung);
    });
  }

  if (filteredItems) {
    filteredItems = [...filteredItems].sort((a: any, b: any) => {
      if (isReceivingMode) {
        const qtyRecA = itemsState[a.id]?.qtyReceived ?? (a.qtyReceived || 0);
        const qtyRecB = itemsState[b.id]?.qtyReceived ?? (b.qtyReceived || 0);
        const diffA = Math.abs(qtyRecA - a.qty);
        const diffB = Math.abs(qtyRecB - b.qty);
        const hasDiffA = diffA > 0;
        const hasDiffB = diffB > 0;
        if (hasDiffA && !hasDiffB) return -1;
        if (!hasDiffA && hasDiffB) return 1;
      }
      const catA = a.skuCategory || 'Lainnya';
      const catB = b.skuCategory || 'Lainnya';
      if (catA < catB) return -1;
      if (catA > catB) return 1;
      return (a.skuName || '').localeCompare(b.skuName || '');
    });
  }

  const isAllSelected = filteredItems && filteredItems.length > 0 && filteredItems.every((item: any) => itemsState[item.id]?.isChecked);

  const handleToggleSelectAll = () => {
    if (isReadOnly) return;
    if (!filteredItems) return;
    const targetState = !isAllSelected;
    setItemsState(prev => {
      const newState = { ...prev };
      filteredItems.forEach((item: any) => {
        newState[item.id] = {
          ...prev[item.id],
          isChecked: targetState,
          qtyReceived: targetState ? item.qty : 0 
        };
      });
      return newState;
    });
  };

  // --- HANDLERS ---
  const handleEditItemChange = (id: string, field: 'qty' | 'noKarung', value: string | number) => {
    setEditItems(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleDeleteItem = (id: string) => {
    if (window.confirm("Hapus item ini dari daftar?")) {
      setDeletedItemIds(prev => [...prev, id]);
    }
  };

  const handleSaveEdit = async () => {
    if (!window.confirm("Simpan perubahan data?")) return;
    setIsSaving(true);
    try {
      const { error: headerError } = await supabase
        .from('outbound_pabrik')
        .update({ tanggal: editHeader.date, sender: editHeader.sender, catatan: editHeader.notes })
        .eq('id', data.id);
      if (headerError) throw headerError;

      if (deletedItemIds.length > 0) {
        const { error: delError } = await supabase.from('outbound_pabrik_items').delete().in('id', deletedItemIds);
        if (delError) throw delError;
      }

      const updates = filteredItems
        .filter((item: any) => !deletedItemIds.includes(item.id))
        .map((item: any) => {
          const editState = editItems[item.id];
          if (editState.qty !== item.qty || editState.noKarung !== item.noKarung) {
            return supabase.from('outbound_pabrik_items').update({ quantity: editState.qty, no_karung: editState.noKarung }).eq('id', item.id);
          }
          return null;
        }).filter(Boolean);

      if (updates.length > 0) await Promise.all(updates);

      const remainingItems = data.items.filter((i: any) => !deletedItemIds.includes(i.id));
      const allKarungs = new Set<string>();
      remainingItems.forEach((i: any) => {
        const k = editItems[i.id]?.noKarung || i.noKarung;
        if (k && k !== '-') allKarungs.add(k);
      });
      
      await supabase.from('outbound_pabrik').update({ no_karung: Array.from(allKarungs).join(', ') }).eq('id', data.id);

      alert("Perubahan berhasil disimpan!");
      setIsEditing(false);
      if (onUpdate) onUpdate();
      onClose();
    } catch (error: any) {
      alert(`Gagal menyimpan: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKarungClick = (karung: string) => {
    setSelectedKarungs(prev => prev.includes(karung) ? prev.filter(k => k !== karung) : [...prev, karung]);
  };

  const handleToggleCheck = (itemId: string, originalQty: number) => {
    if (isReadOnly) return;
    setItemsState(prev => {
      const current = prev[itemId];
      const newChecked = !current.isChecked;
      return { ...prev, [itemId]: { ...current, isChecked: newChecked, qtyReceived: newChecked ? originalQty : 0 } };
    });
  };

  const handleQtyChange = (itemId: string, val: string) => {
    if (isReadOnly) return;
    const numVal = val === '' ? 0 : Number(val); 
    setItemsState(prev => ({ ...prev, [itemId]: { ...prev[itemId], qtyReceived: numVal, isChecked: numVal > 0 } }));
  };

  const handleWarehouseChange = (itemId: string, val: string) => {
    if (isReadOnly) return;
    setItemsState(prev => ({ ...prev, [itemId]: { ...prev[itemId], targetWarehouse: val } }));
  };

  const handleSaveProgress = async () => {
    setIsSaving(true);
    try {
      const entries = Object.entries(itemsState);
      const updates = entries.map(([id, state]) => 
        supabase.from('outbound_pabrik_items').update({
          is_checked: state.isChecked,
          qty_received: state.qtyReceived,
          check_notes: state.notes,
          target_warehouse: state.targetWarehouse
        }).eq('id', id)
      );
      await Promise.all(updates);
      if (onSaveProgress) onSaveProgress();
    } catch (error: any) {
      alert(`Gagal: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrintLabels = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const originalContent = document.body.innerHTML;
    document.body.innerHTML = printContent;
    window.print();
    document.body.innerHTML = originalContent;
    window.location.reload(); 
  };

  const isDraft = data?.status === 'Draft';
  const totalItems = filteredItems?.length || 0;
  const checkedItems = Object.values(itemsState).filter(s => s.isChecked).length;
  const progressPercent = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

  let lastCategory = '';
  const getHeaderLabel = () => {
    if (selectedKarungs.length === 0) return 'Semua Barang';
    if (selectedKarungs.length === 1) return `Isi Karung: ${selectedKarungs[0]}`;
    return `Isi ${selectedKarungs.length} Karung Terpilih`;
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn">
        <div className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
          
          {/* Header Modal */}
          <div className="p-5 border-b border-gray-100 dark:border-dark-600 flex justify-between items-start bg-white dark:bg-dark-800">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {isEditing ? 'Edit Data Pengiriman' : (isReceivingMode ? (isReadOnly ? 'Detail Barang Masuk' : 'Pengecekan Barang Masuk') : 'Detail Pengiriman')}
                </h2>
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  data?.status === 'Diterima' ? 'bg-green-100 text-green-700' : 
                  data?.status === 'Draft' ? 'bg-gray-100 text-gray-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {data?.status || 'Draft'}
                </span>
              </div>
              <p className="text-sm text-gray-500 font-mono">{data?.po || '-'}</p>
            </div>
            <div className="flex items-center gap-2">
              {!isEditing && !isReceivingMode && isDraft && (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  <Edit2 size={16} /> Edit Data
                </button>
              )}
              {!isEditing && (
                <button onClick={handlePrintLabels} className="bg-gray-800 text-white hover:bg-gray-900 p-2 px-4 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium shadow-sm">
                  <Printer size={18} /> Cetak Label (10x15)
                </button>
              )}
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-2">
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-dark-900">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <Loader2 className="animate-spin mb-2" size={32} />
                <p>Memuat data detail...</p>
              </div>
            ) : data ? (
              <div className="space-y-6">
                
                {/* Info Cards / Edit Header Form */}
                {isEditing ? (
                  <div className="bg-white p-4 rounded-xl border border-orange-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal</label>
                      <input 
                        type="date" 
                        value={editHeader.date} 
                        onChange={e => setEditHeader({...editHeader, date: e.target.value})}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Pengirim</label>
                      <input 
                        type="text" 
                        value={editHeader.sender} 
                        onChange={e => setEditHeader({...editHeader, sender: e.target.value})}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Catatan</label>
                      <input 
                        type="text" 
                        value={editHeader.notes} 
                        onChange={e => setEditHeader({...editHeader, notes: e.target.value})}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-dark-800 p-3 rounded-lg border border-gray-200 dark:border-dark-600 flex items-center gap-3">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Calendar size={18} /></div>
                      <div><p className="text-xs text-gray-500 uppercase">Tanggal</p><p className="font-semibold text-sm">{data.date}</p></div>
                    </div>
                    <div className="bg-white dark:bg-dark-800 p-3 rounded-lg border border-gray-200 dark:border-dark-600 flex items-center gap-3">
                      <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><User size={18} /></div>
                      <div><p className="text-xs text-gray-500 uppercase">Pengirim</p><p className="font-semibold text-sm">{data.sender}</p></div>
                    </div>
                    <div className="bg-white dark:bg-dark-800 p-3 rounded-lg border border-gray-200 dark:border-dark-600 flex items-center gap-3">
                      <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><MapPin size={18} /></div>
                      <div><p className="text-xs text-gray-500 uppercase">Tujuan</p><p className="font-semibold text-sm">{data.destination || 'Gudang Utama'}</p></div>
                    </div>
                  </div>
                )}

                {/* --- FILTER KARUNG --- */}
                <div className="bg-white dark:bg-dark-800 p-4 rounded-xl border border-gray-200 dark:border-dark-600 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                    <div className="flex items-center gap-2 text-gray-800 font-bold text-sm">
                      <Package size={18} className="text-erp-blue-600" /> 
                      Pilih Karung
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="relative flex-1 sm:flex-none">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                          type="text" 
                          placeholder="Cari Karung..." 
                          value={karungSearchTerm}
                          onChange={(e) => setKarungSearchTerm(e.target.value)}
                          className="w-full sm:w-56 pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-erp-blue-500 bg-gray-50"
                        />
                      </div>
                      {selectedKarungs.length > 0 && (
                        <button onClick={() => setSelectedKarungs([])} className="text-xs text-erp-blue-600 hover:underline flex items-center gap-1 font-medium whitespace-nowrap">
                          <Filter size={12} /> Reset ({selectedKarungs.length})
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-4 pr-2">
                    {sortedCategories.length > 0 ? (
                      sortedCategories.map(category => {
                        const karungsInCategory = Array.from(groupedKarungs[category]);
                        const visibleKarungs = karungsInCategory.filter(k => k.toLowerCase().includes(karungSearchTerm.toLowerCase()));
                        if (visibleKarungs.length === 0) return null; 

                        return (
                          <div key={category} className="bg-gray-50 dark:bg-dark-700/50 rounded-lg p-3 border border-gray-100 dark:border-dark-600">
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                              <Tag size={12} /> {category}
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {visibleKarungs.map((karungName, idx) => {
                                const isSelected = selectedKarungs.includes(karungName);
                                return (
                                  <button
                                    key={idx}
                                    onClick={() => handleKarungClick(karungName)}
                                    className={`
                                      px-3 py-1.5 rounded-lg text-sm font-medium border transition-all flex items-center gap-1.5 shadow-sm
                                      ${isSelected 
                                        ? 'bg-erp-pink text-white border-pink-600 ring-2 ring-pink-200' 
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-erp-blue-300 hover:text-erp-blue-600'}
                                    `}
                                  >
                                    {isSelected ? <CheckSquare size={14} /> : <Box size={14} className="text-gray-400" />}
                                    {karungName}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <span className="text-gray-400 italic text-sm py-2 block text-center">Tidak ada data karung.</span>
                    )}
                  </div>
                </div>

                {/* Items Table */}
                <div className={`bg-white dark:bg-dark-800 rounded-xl border shadow-sm overflow-hidden ${isEditing ? 'border-orange-200' : 'border-gray-200'}`}>
                  <div className={`px-6 py-4 border-b flex justify-between items-center ${isEditing ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100'}`}>
                    <div className="flex items-center gap-4">
                      <h3 className={`font-bold flex items-center gap-2 ${isEditing ? 'text-orange-800' : 'text-gray-800'}`}>
                        <Layers size={18} /> 
                        {getHeaderLabel()}
                      </h3>
                    </div>
                    {isReceivingMode && (
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-gray-500 font-medium">Progress: {checkedItems}/{totalItems} Item</div>
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-sm text-left">
                      <thead className={`font-medium border-b sticky top-0 z-10 ${isEditing ? 'bg-orange-50/50 text-orange-900 border-orange-100' : 'bg-gray-50 text-gray-500 border-gray-100'}`}>
                        <tr>
                          {isReceivingMode && (
                            <th className="px-4 py-3 w-10 text-center">
                              {!isReadOnly && (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-[10px] font-bold text-gray-500">ALL</span>
                                  <input 
                                    type="checkbox" 
                                    checked={!!isAllSelected}
                                    onChange={handleToggleSelectAll}
                                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                                  />
                                </div>
                              )}
                              {isReadOnly && <span className="text-[10px] font-bold text-gray-400">OK</span>}
                            </th>
                          )}
                          <th className="px-4 py-3">No. Karung</th>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">Nama Barang</th>
                          <th className="px-4 py-3 text-center">Qty Kirim</th>
                          {isReceivingMode && <th className="px-4 py-3 text-center w-24">Qty Terima</th>}
                          {isReceivingMode && <th className="px-4 py-3 w-40">Simpan Di Gudang</th>}
                          {isReceivingMode && <th className="px-4 py-3 text-center">Selisih</th>}
                          {isEditing && <th className="px-4 py-3 text-center w-10">Hapus</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-dark-600">
                        {filteredItems && filteredItems.length > 0 ? (
                          filteredItems.map((item: any) => {
                            const state = itemsState[item.id] || { isChecked: false, qtyReceived: 0, notes: '', targetWarehouse: 'Gudang 1' };
                            const editState = editItems[item.id] || { qty: item.qty, noKarung: item.noKarung };
                            const isDiscrepancy = state.qtyReceived !== item.qty;
                            
                            const currentCategory = item.skuCategory || 'Lainnya';
                            const showHeader = currentCategory !== lastCategory;
                            if (showHeader) lastCategory = currentCategory;

                            return (
                              <React.Fragment key={item.id}>
                                {showHeader && (
                                  <tr className="bg-gray-100 dark:bg-dark-700">
                                    <td colSpan={isReceivingMode ? 8 : (isEditing ? 6 : 5)} className="px-4 py-2 font-bold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider">
                                      Kategori: {currentCategory}
                                    </td>
                                  </tr>
                                )}
                                <tr className={`hover:bg-gray-50 ${state.isChecked && !isReadOnly ? 'bg-green-50/30' : ''}`}>
                                  {isReceivingMode && (
                                    <td className="px-4 py-3 text-center">
                                      {isReadOnly ? (
                                        state.isChecked ? <CheckCircle2 size={20} className="text-green-600 mx-auto" /> : <div className="w-5 h-5 border-2 border-gray-200 rounded-full bg-gray-50 mx-auto"></div>
                                      ) : (
                                        <button 
                                          onClick={() => handleToggleCheck(item.id, item.qty)}
                                          className={`p-1 rounded transition-colors ${state.isChecked ? 'text-green-600' : 'text-gray-300 hover:text-gray-400'}`}
                                        >
                                          {state.isChecked ? <CheckCircle2 size={24} /> : <div className="w-6 h-6 border-2 border-gray-300 rounded bg-white"></div>}
                                        </button>
                                      )}
                                    </td>
                                  )}
                                  
                                  <td className="px-4 py-3">
                                    {isEditing ? (
                                      <input 
                                        type="text" 
                                        value={editState.noKarung}
                                        onChange={(e) => handleEditItemChange(item.id, 'noKarung', e.target.value)}
                                        className="w-full px-2 py-1 text-xs border border-orange-200 rounded focus:ring-1 focus:ring-orange-500 outline-none"
                                      />
                                    ) : (
                                      <span className="px-2 py-1 bg-gray-100 rounded text-xs font-mono font-bold text-gray-600">
                                        {item.noKarung}
                                      </span>
                                    )}
                                  </td>

                                  <td className="px-4 py-3 font-mono text-gray-600">{item.skuCode}</td>
                                  <td className="px-4 py-3 font-medium text-gray-900">{item.skuName}</td>
                                  
                                  <td className="px-4 py-3 text-center font-bold text-gray-500">
                                    {isEditing ? (
                                      <input 
                                        type="number" min="1"
                                        value={editState.qty}
                                        onChange={(e) => handleEditItemChange(item.id, 'qty', e.target.value)}
                                        className="w-20 px-2 py-1 text-center text-sm border border-orange-200 rounded focus:ring-1 focus:ring-orange-500 outline-none font-bold text-gray-800"
                                      />
                                    ) : (
                                      item.qty
                                    )}
                                  </td>

                                  {isReceivingMode && (
                                    <>
                                      <td className="px-4 py-3 text-center">
                                        {isReadOnly ? (
                                          <span className="font-bold text-gray-800">{state.qtyReceived}</span>
                                        ) : (
                                          <input
                                            type="number" min="0"
                                            value={state.qtyReceived ?? ''}
                                            onChange={(e) => handleQtyChange(item.id, e.target.value)}
                                            className={`w-full px-2 py-1 text-center border rounded font-bold focus:outline-none focus:ring-2 ${
                                              isDiscrepancy ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-200' : 'border-gray-300 text-gray-900 focus:ring-blue-200'
                                            }`}
                                          />
                                        )}
                                      </td>
                                      <td className="px-4 py-3">
                                        {isReadOnly ? (
                                          <div className="flex items-center gap-2 text-gray-700 text-sm">
                                            <MapPin size={14} className="text-gray-400"/>
                                            {state.targetWarehouse}
                                          </div>
                                        ) : (
                                          <div className="relative">
                                            <MapPin size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"/>
                                            <select 
                                              value={state.targetWarehouse}
                                              onChange={(e) => handleWarehouseChange(item.id, e.target.value)}
                                              className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-300 rounded bg-white focus:ring-2 focus:ring-erp-blue-600 outline-none"
                                            >
                                              <option value="Gudang 1">Gudang 1</option>
                                              <option value="Gudang 2">Gudang 2</option>
                                              <option value="Gudang 3">Gudang 3</option>
                                              <option value="Gudang Utama">Gudang Utama</option>
                                            </select>
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        {isDiscrepancy ? (
                                          <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-full">
                                            {state.qtyReceived - item.qty > 0 ? '+' : ''}{state.qtyReceived - item.qty}
                                          </span>
                                        ) : (
                                          <span className="text-green-500 text-xs font-medium flex items-center justify-center gap-1"><CheckCircle2 size={14}/> Sesuai</span>
                                        )}
                                      </td>
                                    </>
                                  )}

                                  {isEditing && (
                                    <td className="px-4 py-3 text-center">
                                      <button 
                                        onClick={() => handleDeleteItem(item.id)}
                                        className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"
                                        title="Hapus Item"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              </React.Fragment>
                            );
                          })
                        ) : (
                          <tr><td colSpan={9} className="px-6 py-8 text-center text-gray-400 italic">Tidak ada data.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-100 dark:border-dark-600 bg-white dark:bg-dark-800 flex justify-between items-center">
            <div className="text-sm text-gray-500 italic">
              {isEditing && <span className="text-orange-600 flex items-center gap-1"><AlertCircle size={14}/> Mode Edit Aktif. Simpan perubahan sebelum keluar.</span>}
              {isReadOnly && <span className="text-green-600 flex items-center gap-1"><CheckCircle2 size={14}/> Data sudah diterima (Final).</span>}
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">
                Tutup
              </button>
              
              {isEditing && (
                <button 
                  onClick={handleSaveEdit} 
                  disabled={isSaving} 
                  className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg shadow-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18} />}
                  Simpan Perubahan
                </button>
              )}

              {isReceivingMode && !isReadOnly && (
                <button onClick={handleSaveProgress} disabled={isSaving} className="px-6 py-2 bg-erp-blue-900 hover:bg-erp-blue-800 text-white rounded-lg shadow-sm flex items-center gap-2 transition-colors disabled:opacity-50">
                  {isSaving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18} />}
                  Simpan Pengecekan
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* HIDDEN PRINT AREA - 10x15 CM LABEL */}
      <div className="hidden">
        <div ref={printRef} className="font-sans">
          <style>{`
            @media print {
              @page { size: 100mm 150mm; margin: 0; }
              body { margin: 0; padding: 0; background: white; }
              .label-page {
                width: 100mm;
                height: 149mm; /* Slightly less to prevent blank page */
                page-break-after: always;
                padding: 5mm;
                box-sizing: border-box;
                border: 2px solid black;
                display: flex;
                flex-direction: column;
                position: relative;
              }
              .label-header { text-align: center; font-weight: bold; border-bottom: 2px solid black; padding-bottom: 5px; margin-bottom: 10px; }
              .barcode-area { 
                text-align: center; 
                margin: 10px 0; 
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                justify-content: center; 
              }
              .info-table { width: 100%; font-size: 10px; margin-bottom: 10px; }
              .info-table td { padding: 2px 0; vertical-align: top; }
              .items-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 5px; }
              .items-table th { border-bottom: 1px solid black; text-align: left; padding: 2px; font-size: 11px; }
              .items-table td { border-bottom: 1px dotted #ccc; padding: 2px; }
              .label-footer { margin-top: auto; font-size: 8px; text-align: center; }
            }
          `}</style>

          {Object.keys(groupedKarungs).map(cat => 
            Array.from(groupedKarungs[cat]).map((karung, idx) => {
              // FILTER ITEMS FOR THIS KARUNG
              const itemsInKarung = data.items.filter((i: any) => {
                 const itemKarung = isEditing && editItems[i.id] ? editItems[i.id].noKarung : i.noKarung;
                 return itemKarung === karung;
              });

              return (
                <div key={`${cat}-${karung}`} className="label-page">
                  <div className="label-header">LABEL PENGIRIMAN PABRIK</div>
                  
                  <div className="barcode-area">
                    <div className="text-xl font-black mb-1">{karung}</div>
                    <Barcode value={karung} format="CODE128" width={1.8} height={40} displayValue={false} margin={0} />
                  </div>

                  <table className="info-table">
                    <tbody>
                      <tr><td width="30%"><strong>Kategori</strong></td><td>: {cat}</td></tr>
                      <tr><td><strong>Tanggal</strong></td><td>: {data?.date}</td></tr>
                      <tr><td><strong>PO Batch</strong></td><td>: {data?.po}</td></tr>
                      <tr><td><strong>Pengirim</strong></td><td>: {data?.sender}</td></tr>
                    </tbody>
                  </table>

                  <div style={{flex: 1, overflow: 'hidden'}}>
                    <div style={{borderBottom: '1px solid black', fontWeight: 'bold', fontSize: '10px', marginBottom: '2px'}}>Rincian Isi:</div>
                    <table className="items-table">
                      <thead>
                        <tr>
                          <th>Nama Barang</th>
                          <th width="40px" style={{textAlign: 'right'}}>Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemsInKarung.map((item: any, iIdx: number) => (
                          <tr key={iIdx}>
                            <td style={{ fontSize: '16px', fontWeight: '900', padding: '4px 0' }}>{item.skuName}</td>
                            <td style={{textAlign: 'right', fontWeight: 'bold', fontSize: '16px', verticalAlign: 'middle'}}>{isEditing && editItems[item.id] ? editItems[item.id].qty : item.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="label-footer">System Generated Label • {new Date().toLocaleString()}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};
