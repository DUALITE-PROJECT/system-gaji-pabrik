import React, { useState, useEffect } from 'react';
import { 
  Search, Loader2, RefreshCw, 
  Download, Filter, X, Calendar, 
  Settings, Wallet,
  HelpCircle, Calculator, Info, Clock, Coffee, UserCheck, Star, Database, Users, Wrench, Copy,
  ChevronLeft, ChevronRight, AlertTriangle
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { DailyAdnanHananModal } from './DailyAdnanHananModal';
import { WorkDaysConfigModal } from './WorkDaysConfigModal';
import { SalaryFormulaInfoModal } from './SalaryFormulaInfoModal';
import { DailySalaryDetailModal } from './DailySalaryDetailModal';
import { SuccessModal } from '../../Warehouse/SuccessModal';
import { ErrorModal } from '../../Warehouse/ErrorModal';
import { ConfirmationModal } from '../../Warehouse/ConfirmationModal';
import * as XLSX from 'xlsx';

export const DailyAdnanHanan: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('Semua Periode');
  const [filterDivisi, setFilterDivisi] = useState('Semua Divisi');
  
  // Options State
  const [uniqueDivisions, setUniqueDivisions] = useState<string[]>([]);
  const [uniqueMonths, setUniqueMonths] = useState<string[]>([]); 

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [totalData, setTotalData] = useState(0);
  
  // Total Salary State (BREAKDOWN)
  const [totals, setTotals] = useState({
    gapok: 0,
    lembur: 0,
    makan: 0,
    hadir: 0,
    bonus: 0,
    total: 0
  });
  const [isCalculatingTotal, setIsCalculatingTotal] = useState(false);
  
  // Recalculate & Sync State
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [recalcProgress, setRecalcProgress] = useState('');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isFormulaModalOpen, setIsFormulaModalOpen] = useState(false);
  
  // Detail Modal State
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailData, setDetailModalData] = useState<any>(null);
  
  // SQL Fix Modal State
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [sqlFixCode, setSqlFixCode] = useState('');
  
  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
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
    onConfirm: () => {}, 
    isDangerous: false 
  });

  const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  // SQL OPTIMIZATION CODE (Updated V2 - Robust Matching & Fallback)
  const SQL_OPTIMIZE_SYNC = `
-- 1) INDEX (lebih cocok untuk query sync: bulan + periode + kode)
CREATE INDEX IF NOT EXISTS idx_gh_pabrik_bulan_periode_kode
ON public.gaji_harian_pabrik_garut (bulan, periode, kode);

CREATE INDEX IF NOT EXISTS idx_dk_bulan_kode
ON public.data_karyawan_pabrik_garut (bulan, kode);

-- 2) FUNCTION V2 yang lebih AMAN (LOWER + TRIM + FALLBACK GRADE)
CREATE OR REPLACE FUNCTION public.ui_sync_master_gaji_harian_pabrik_v2(p_bulan text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_updated_count integer := 0;
BEGIN
  -- Ambil 1 master TERBARU per (kode, bulan) untuk bulan yang dipilih
  WITH m AS (
    SELECT DISTINCT ON (LOWER(TRIM(kode)), LOWER(TRIM(bulan)))
      kode,
      bulan,
      divisi,
      keterangan,
      grade_p1,
      grade_p2,
      updated_at
    FROM public.data_karyawan_pabrik_garut
    WHERE LOWER(TRIM(bulan)) = LOWER(TRIM(p_bulan))
    ORDER BY LOWER(TRIM(kode)), LOWER(TRIM(bulan)), updated_at DESC NULLS LAST
  )
  UPDATE public.gaji_harian_pabrik_garut t
  SET
    -- grade mengikuti periode dengan FALLBACK:
    -- Jika Periode 2 kosong di master, gunakan Periode 1
    grade = CASE
              WHEN t.periode ILIKE '%Periode 2%'
                THEN COALESCE(NULLIF(TRIM(m.grade_p2), ''), NULLIF(TRIM(m.grade_p1), ''), t.grade)
              ELSE
                COALESCE(NULLIF(TRIM(m.grade_p1), ''), t.grade)
            END,

    -- metadata lain dari master (tetap aman, tidak ketimpa kosong)
    divisi = COALESCE(NULLIF(TRIM(m.divisi), ''), t.divisi),
    keluar_masuk = COALESCE(NULLIF(TRIM(m.keterangan), ''), t.keluar_masuk),

    updated_at = NOW()
  FROM m
  WHERE LOWER(TRIM(t.kode))  = LOWER(TRIM(m.kode))
    AND LOWER(TRIM(t.bulan)) = LOWER(TRIM(m.bulan))
    AND LOWER(TRIM(t.bulan)) = LOWER(TRIM(p_bulan));

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN 'Sync Master V2 Berhasil: ' || v_updated_count || ' baris diperbarui.';
END;
$function$;

-- akses UI
GRANT EXECUTE ON FUNCTION public.ui_sync_master_gaji_harian_pabrik_v2(text) TO anon;
GRANT EXECUTE ON FUNCTION public.ui_sync_master_gaji_harian_pabrik_v2(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ui_sync_master_gaji_harian_pabrik_v2(text) TO service_role;

NOTIFY pgrst, 'reload config';
`;

  // --- FETCH OPTIONS (DIVISIONS & MONTHS) ---
  useEffect(() => {
    const fetchOptions = async () => {
        if (!isSupabaseConfigured()) return;
        
        // Fetch Divisions
        const { data: divData } = await supabase
            .from('data_karyawan_pabrik_garut')
            .select('divisi');
        
        if (divData) {
            const divs = [...new Set(divData.map(d => d.divisi).filter(Boolean))].sort();
            setUniqueDivisions(divs);
        }

        // Fetch Months (Looping to get all)
        try {
            let allMonths = new Set<string>();
            let from = 0;
            const step = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data: monthData, error } = await supabase
                    .from('gaji_harian_pabrik_garut')
                    .select('bulan')
                    .range(from, from + step - 1)
                    .order('created_at', { ascending: false });
                
                if (error) throw error;

                if (monthData && monthData.length > 0) {
                    monthData.forEach(d => {
                        if (d.bulan) allMonths.add(d.bulan);
                    });
                    
                    if (monthData.length < step) hasMore = false;
                    else from += step;
                } else {
                    hasMore = false;
                }
            }

            const monthsArray = Array.from(allMonths);
            
            // Sort months chronologically
            const monthMap: Record<string, number> = {
                'januari': 1, 'februari': 2, 'maret': 3, 'april': 4, 'mei': 5, 'juni': 6,
                'juli': 7, 'agustus': 8, 'september': 9, 'oktober': 10, 'november': 11, 'desember': 12
            };

            const sortedMonths = monthsArray.sort((a, b) => {
                const partsA = a.split(' ');
                const partsB = b.split(' ');
                const monthA = partsA[0]?.toLowerCase();
                const monthB = partsB[0]?.toLowerCase();
                const yearA = parseInt(partsA[1]) || 0;
                const yearB = parseInt(partsB[1]) || 0;

                if (yearA !== yearB) return yearB - yearA; // Descending Year
                return (monthMap[monthB] || 0) - (monthMap[monthA] || 0); // Descending Month
            });

            setUniqueMonths(sortedMonths);
            
            // Auto select latest if not set
            if (sortedMonths.length > 0 && !filterMonth) {
                setFilterMonth(sortedMonths[0]);
            }
        } catch (err) {
            console.error("Error fetching months:", err);
        }
    };
    fetchOptions();
  }, []);

  // --- SYNC MASTER HANDLER (UPDATED) ---
  const handleSyncMasterClick = () => {
    if (!filterMonth) {
        alert("Mohon filter bulan terlebih dahulu sebelum melakukan sinkronisasi.");
        return;
    }

    setConfirmModal({
        isOpen: true,
        title: 'Sync Master Karyawan',
        message: `Sistem akan memperbarui Grade, Divisi, dan Keterangan (Keluar/Masuk) pada data gaji harian bulan "${filterMonth}" sesuai Master Karyawan TERBARU.\n\nData Presensi (Kehadiran/Lembur) TIDAK akan berubah.\n\nLanjutkan?`,
        confirmLabel: 'Ya, Sync Master',
        isDangerous: false,
        onConfirm: () => executeSyncMaster(filterMonth)
    });
  };

  const executeSyncMaster = async (targetMonth: string) => {
    setConfirmModal({ ...confirmModal, isOpen: false });
    setIsSyncing(true);
    setRecalcProgress('Sync Master...');

    try {
        // CALL NEW RPC V2 (ui_sync_master_gaji_harian_pabrik_v2)
        const { data: rpcResult, error: rpcError } = await supabase.rpc('ui_sync_master_gaji_harian_pabrik_v2', { p_bulan: targetMonth });
        
        if (rpcError) {
            // Check for Timeout (57014) OR Missing Function (PGRST202/42883)
            // PGRST202: Function not found in schema cache (PostgREST)
            // 42883: Undefined function (Postgres)
            const isTimeout = rpcError.code === '57014' || rpcError.message?.includes('timeout');
            const isMissingFunc = rpcError.code === 'PGRST202' || rpcError.code === '42883' || rpcError.message?.includes('Could not find the function') || rpcError.message?.includes('function');

            if (isTimeout || isMissingFunc) {
                console.warn(`RPC Issue (${rpcError.code}). Switching to client-side batch processing...`);
                await executeSyncMasterFallback(targetMonth);
                return;
            }
            throw rpcError;
        }

        setSuccessModal({ 
            isOpen: true, 
            title: 'Sync Master Berhasil', 
            message: rpcResult || 'Data master karyawan telah diperbarui.' 
        });
        
        // Refresh data immediately
        setPage(1);
        await fetchData(); 
    } catch (error: any) {
        console.error("Sync error:", error);
        
        // Handle Missing Function (V2 not found)
        if (error.code === '42883' || error.message?.includes('function')) {
            setSqlFixCode(SQL_OPTIMIZE_SYNC);
            setShowSqlModal(true);
        } else {
            setErrorModal({ 
                isOpen: true, 
                title: 'Gagal Sinkronisasi', 
                message: error.message 
            });
        }
    } finally {
        setIsSyncing(false);
        setRecalcProgress('');
    }
  };

  // NEW FALLBACK FUNCTION FOR CLIENT-SIDE BATCHING (ROBUST MATCHING & V2 LOGIC)
  const executeSyncMasterFallback = async (month: string) => {
      setRecalcProgress('Mengambil Data Master...');
      
      try {
          // 1. Fetch Master Data for the month
          const { data: employees, error: empError } = await supabase
              .from('data_karyawan_pabrik_garut')
              .select('kode, nama, perusahaan, grade_p1, grade_p2, divisi, keterangan')
              .eq('bulan', month);
          
          if (empError) throw empError;
          if (!employees || employees.length === 0) {
              throw new Error(`Tidak ada data karyawan master untuk bulan ${month}`);
          }

          // Create a map for fast lookup (LOWERCASE KEYS)
          const empMap = new Map();
          employees.forEach(emp => {
              empMap.set(emp.kode.trim().toLowerCase(), emp);
          });

          // 2. Fetch Target IDs to update
          let allIds: { id: number, kode: string, periode: string }[] = [];
          let from = 0;
          const FETCH_SIZE = 1000;
          let hasMore = true;
          
          while (hasMore) {
              setRecalcProgress(`Mengambil Data Target... ${allIds.length}`);
              const { data: targets, error: targetError } = await supabase
                  .from('gaji_harian_pabrik_garut')
                  .select('id, kode, periode')
                  .eq('bulan', month)
                  .range(from, from + FETCH_SIZE - 1);
              
              if (targetError) throw targetError;
              
              if (targets && targets.length > 0) {
                  allIds = [...allIds, ...targets];
                  if (targets.length < FETCH_SIZE) hasMore = false;
                  else from += FETCH_SIZE;
              } else {
                  hasMore = false;
              }
          }

          const total = allIds.length;
          const BATCH_SIZE = 50; 
          let processed = 0;

          // 3. Process Updates
          for (let i = 0; i < total; i += BATCH_SIZE) {
              const batch = allIds.slice(i, i + BATCH_SIZE);
              
              const updates = batch.map(async (item) => {
                  const emp = empMap.get(item.kode.trim().toLowerCase());
                  if (emp) {
                      const isPeriode2 = (item.periode || '').toLowerCase().includes('periode 2');
                      
                      // V2 LOGIC: Fallback to P1 if P2 is empty
                      let grade = isPeriode2 ? emp.grade_p2 : emp.grade_p1;
                      if (isPeriode2 && !grade) {
                          grade = emp.grade_p1;
                      }
                      
                      await supabase.from('gaji_harian_pabrik_garut')
                          .update({ 
                              divisi: emp.divisi,
                              keluar_masuk: emp.keterangan, // Map keterangan to keluar_masuk
                              grade: grade,
                              updated_at: new Date().toISOString()
                          })
                          .eq('id', item.id);
                  }
              });

              await Promise.all(updates);
              processed += batch.length;
              setRecalcProgress(`Sync Manual... ${Math.round((processed / total) * 100)}%`);
              
              // Small delay to let UI update and prevent rate limiting
              await new Promise(resolve => setTimeout(resolve, 20));
          }

          setSuccessModal({ 
              isOpen: true, 
              title: 'Sync Master Berhasil', 
              message: `Berhasil sinkronisasi ${processed} data gaji (Mode Batch Manual).` 
          });
          setPage(1);
          fetchData();

      } catch (error: any) {
          throw error; // Re-throw to be caught by main handler
      }
  };

  // --- RECALCULATE HANDLER ---
  const handleRecalculateClick = () => {
    if (!filterMonth) {
        alert("Mohon filter bulan terlebih dahulu sebelum melakukan hitung ulang.");
        return;
    }

    setConfirmModal({
        isOpen: true,
        title: 'Hitung Ulang Gaji?',
        message: `Anda akan menghitung ulang gaji harian untuk bulan "${filterMonth}".\n\nProses ini akan memperbarui angka berdasarkan data Presensi & Master Gaji terbaru.\n\nLanjutkan?`,
        confirmLabel: 'Ya, Hitung Ulang',
        isDangerous: false,
        onConfirm: () => executeRecalculate(filterMonth)
    });
  };

  const executeRecalculate = async (targetMonth: string) => {
    setConfirmModal({ ...confirmModal, isOpen: false });
    setIsRecalculating(true);
    setRecalcProgress('Menyiapkan data...');
    
    try {
        let allIds: number[] = [];
        let hasMore = true;
        let pageFetch = 0;
        const FETCH_SIZE = 1000;

        while (hasMore) {
            setRecalcProgress(`Mengambil ID... (${allIds.length})`);
            const { data: ids, error: fetchError } = await supabase
                .from('gaji_harian_pabrik_garut')
                .select('id')
                .ilike('bulan', `%${targetMonth}%`)
                .range(pageFetch * FETCH_SIZE, (pageFetch + 1) * FETCH_SIZE - 1);

            if (fetchError) throw fetchError;

            if (ids && ids.length > 0) {
                allIds = [...allIds, ...ids.map(item => item.id)];
                if (ids.length < FETCH_SIZE) hasMore = false;
                else pageFetch++;
            } else {
                hasMore = false;
            }
        }

        if (allIds.length === 0) {
             setSuccessModal({ isOpen: true, title: 'Info', message: `Tidak ada data ditemukan untuk bulan ${targetMonth}.` });
            setIsRecalculating(false);
            setRecalcProgress('');
            return;
        }

        const total = allIds.length;
        const BATCH_SIZE = 50; 
        let processed = 0;

        for (let i = 0; i < total; i += BATCH_SIZE) {
            const batchIds = allIds.slice(i, i + BATCH_SIZE);
            const { error: updateError } = await supabase
                .from('gaji_harian_pabrik_garut')
                .update({ updated_at: new Date().toISOString() })
                .in('id', batchIds);

            if (updateError) throw updateError;
            processed += batchIds.length;
            setRecalcProgress(`Memproses ${processed} / ${total}...`);
        }

        setSuccessModal({ isOpen: true, title: 'Selesai', message: `Berhasil menghitung ulang ${total} data untuk bulan ${targetMonth}.` });
        fetchData();
        
    } catch (error: any) {
        setErrorModal({ isOpen: true, title: 'Gagal', message: `Gagal menghitung ulang: ${error.message}` });
    } finally {
        setIsRecalculating(false);
        setRecalcProgress('');
    }
  };

  // --- FETCH DATA (FROM VIEW) ---
  const fetchData = async () => {
    setIsLoading(true);
    
    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }
    
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('v_gaji_harian_garut_ui')
        .select('*', { count: 'exact' });

      if (searchTerm) {
        const safeSearch = searchTerm.replace(/,/g, ''); 
        query = query.or(`kode.ilike.%${safeSearch}%,keterangan.ilike.%${safeSearch}%`);
      }
      if (startDate) query = query.gte('tanggal', startDate);
      if (endDate) query = query.lte('tanggal', endDate);
      if (filterMonth) query = query.ilike('bulan', `%${filterMonth}%`);
      if (filterPeriod && filterPeriod !== 'Semua Periode') query = query.eq('periode', filterPeriod);
      if (filterDivisi && filterDivisi !== 'Semua Divisi') query = query.eq('divisi', filterDivisi);

      const { data: result, error, count } = await query
        .order('tanggal', { ascending: false })
        .range(from, to);

      if (error) {
        console.error("Error fetching data:", error);
        if (error.code === 'PGRST205' || error.code === '42P01' || error.code === '42703') {
             setErrorModal({ isOpen: true, title: 'Kesalahan Sistem', message: 'Terjadi kesalahan struktur database. Mohon hubungi Administrator.' });
        } else {
            setErrorModal({ isOpen: true, title: 'Gagal Memuat Data', message: `Terjadi kesalahan saat pencarian: ${error.message}` });
        }
        setData([]);
        setTotalData(0);
      } else {
        setData(result || []);
        setTotalData(count || 0);
      }
    } catch (error: any) {
      console.warn("Fetch error (likely network):", error.message);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- CALCULATE TOTALS (BREAKDOWN) ---
  useEffect(() => {
    const fetchTotal = async () => {
        if (!isSupabaseConfigured()) return;
        setIsCalculatingTotal(true);
        
        let sumGapok = 0;
        let sumLembur = 0;
        let sumMakan = 0;
        let sumHadir = 0;
        let sumBonus = 0;
        let sumTotal = 0;

        let hasMore = true;
        let pageFetch = 0;
        const FETCH_SIZE = 1000;

        try {
            while (hasMore) {
                let query = supabase.from('v_gaji_harian_garut_ui')
                    .select('gaji, gaji_pokok, gaji_lembur, uang_makan, uang_kehadiran, uang_bonus');
                
                if (searchTerm) {
                    const safeSearch = searchTerm.replace(/,/g, ''); 
                    query = query.or(`kode.ilike.%${safeSearch}%,keterangan.ilike.%${safeSearch}%`);
                }
                if (startDate) query = query.gte('tanggal', startDate);
                if (endDate) query = query.lte('tanggal', endDate);
                if (filterMonth) query = query.ilike('bulan', `%${filterMonth}%`);
                if (filterPeriod && filterPeriod !== 'Semua Periode') query = query.eq('periode', filterPeriod);
                if (filterDivisi && filterDivisi !== 'Semua Divisi') query = query.eq('divisi', filterDivisi);
                
                const { data: batch, error } = await query.range(pageFetch * FETCH_SIZE, (pageFetch + 1) * FETCH_SIZE - 1);
                
                if (error) throw error;

                if (batch && batch.length > 0) {
                    batch.forEach(curr => {
                        sumGapok += Number(curr.gaji_pokok) || 0;
                        sumLembur += Number(curr.gaji_lembur) || 0;
                        sumMakan += Number(curr.uang_makan) || 0;
                        sumHadir += Number(curr.uang_kehadiran) || 0;
                        sumBonus += Number(curr.uang_bonus) || 0;
                        sumTotal += Number(curr.gaji) || 0;
                    });
                    
                    if (batch.length < FETCH_SIZE) {
                        hasMore = false;
                    } else {
                        pageFetch++;
                    }
                } else {
                    hasMore = false;
                }
            }
            
            setTotals({
                gapok: sumGapok,
                lembur: sumLembur,
                makan: sumMakan,
                hadir: sumHadir,
                bonus: sumBonus,
                total: sumTotal
            });

        } catch (err) {
            console.error("Error calculating total:", err);
        } finally {
            setIsCalculatingTotal(false);
        }
    };
    
    const timer = setTimeout(() => {
        fetchTotal();
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, startDate, endDate, filterMonth, filterPeriod, filterDivisi]);

  useEffect(() => { fetchData(); }, [page, pageSize, searchTerm, startDate, endDate, filterMonth, filterPeriod, filterDivisi]);
  useEffect(() => { setPage(1); }, [searchTerm, startDate, endDate, filterMonth, filterPeriod, filterDivisi]);

  // --- EXPORT EXCEL (FIXED SORTING) ---
  const handleExport = async () => {
    setIsLoading(true);
    try {
        let allData: any[] = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;
        
        while (hasMore) {
            let query = supabase.from('v_gaji_harian_garut_ui').select('*');
            if (searchTerm) {
                const safeSearch = searchTerm.replace(/,/g, '');
                query = query.or(`kode.ilike.%${safeSearch}%`);
            }
            if (startDate) query = query.gte('tanggal', startDate);
            if (endDate) query = query.lte('tanggal', endDate);
            if (filterMonth) query = query.ilike('bulan', `%${filterMonth}%`);
            if (filterPeriod && filterPeriod !== 'Semua Periode') query = query.eq('periode', filterPeriod);
            if (filterDivisi && filterDivisi !== 'Semua Divisi') query = query.eq('divisi', filterDivisi);

            // FIX: Added deterministic sorting
            const { data: batch, error } = await query
                .order('tanggal', { ascending: false })
                .order('nama', { ascending: true })
                .order('id', { ascending: true })
                .range(from, from + step - 1);
            
            if (error) throw error;
            
            if (batch && batch.length > 0) {
                allData = [...allData, ...batch];
                if (batch.length < step) hasMore = false;
                else from += step;
            } else {
                hasMore = false;
            }
        }
        
        if (!allData || allData.length === 0) { alert("Tidak ada data."); return; }
        
        const exportData = allData.map(item => ({
            'Tanggal': item.tanggal, 
            'Kode': item.kode, 
            'Grade': item.grade,
            'Divisi': item.divisi,
            'Perusahaan': item.perusahaan, 
            'Bulan': item.bulan, 
            'Periode': item.periode,
            'Kehadiran': item.kehadiran, 
            'Lembur': item.lembur,
            'Keterangan': item.keterangan,
            'Gaji Pokok': item.gaji_pokok,
            'Uang Lembur': item.gaji_lembur,
            'Uang Makan': item.uang_makan,
            'Uang Kehadiran': item.uang_kehadiran,
            'Bonus': item.uang_bonus,
            'Total Gaji': item.gaji
        }));
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(wb, ws, "Gaji Harian");
        XLSX.writeFile(wb, `Gaji_Harian_${startDate || 'All'}.xlsx`);
    } catch (error: any) { alert(`Gagal Export: ${error.message}`); } finally { setIsLoading(false); }
  };

  const handleResetFilters = () => {
      setSearchTerm('');
      setStartDate('');
      setEndDate('');
      setFilterMonth('');
      setFilterPeriod('Semua Periode');
      setFilterDivisi('Semua Divisi');
      setPage(1);
      fetchData();
  };

  const handleOpenDetail = (item: any) => {
    setDetailModalData(item);
    setIsDetailModalOpen(true);
  };

  const handleCopySQL = () => {
    navigator.clipboard.writeText(sqlFixCode);
    setSuccessModal({ isOpen: true, title: 'SQL Disalin', message: 'Silakan jalankan kode di SQL Editor Supabase.' });
  };

  return (
    <div className="space-y-6 h-full flex flex-col font-sans">
      {/* --- TOP TOOLBAR --- */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 shrink-0">
        <div className="relative w-full xl:w-96 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-erp-pink transition-colors" size={20} />
          <input 
            type="text" 
            placeholder="Cari kode..." 
            value={searchTerm} 
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }} 
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-erp-pink/30 focus:border-erp-pink transition-all shadow-sm" 
          />
        </div>
        <div className="flex flex-wrap gap-2 w-full xl:w-auto items-center justify-end">
          
          <button onClick={() => setIsConfigModalOpen(true)} className="px-4 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-gray-50 transition-all shadow-sm">
            <Settings size={18}/> Config Hari Kerja
          </button>

          <button onClick={() => setIsFormulaModalOpen(true)} className="px-4 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-gray-50 transition-all shadow-sm">
            <HelpCircle size={18}/> Info Rumus
          </button>

          <button onClick={handleSyncMasterClick} disabled={isSyncing} className="px-4 py-2.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-100 text-sm font-medium flex items-center gap-2 shadow-sm transition-all disabled:opacity-70">
            {isSyncing ? <Loader2 className="animate-spin" size={18}/> : <Users size={18}/>} 
            {isSyncing ? recalcProgress : 'Sync Master'}
          </button>

          <button onClick={handleRecalculateClick} disabled={isRecalculating} className="px-4 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 text-sm font-medium flex items-center gap-2 shadow-sm shadow-orange-200 transition-all disabled:opacity-70">
            {isRecalculating ? <Loader2 className="animate-spin" size={18}/> : <Calculator size={18}/>} 
            {isRecalculating && recalcProgress ? recalcProgress : 'Hitung Ulang'}
          </button>

          <button onClick={handleExport} className="px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-medium flex items-center gap-2 shadow-sm shadow-green-200 transition-all">
            <Download size={18}/> Export
          </button>
          <button onClick={() => fetchData()} className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 shadow-sm transition-all" title="Refresh Data">
            <RefreshCw size={20}/>
          </button>
        </div>
      </div>

      {/* --- FILTER SECTION --- */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
        <div className="col-span-1 md:col-span-12 flex items-center gap-2 text-sm font-bold text-erp-pink mb-1">
          <Filter size={18}/> Filter Data
        </div>
        
        <div className="col-span-1 md:col-span-3">
          <label className="block text-xs font-medium text-gray-500 mb-1.5 ml-1">Rentang Tanggal</label>
          <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl border border-gray-200">
            <div className="relative flex-1">
              <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
                className="w-full pl-9 pr-2 py-2 bg-transparent text-sm focus:outline-none text-gray-700"
              />
            </div>
            <span className="text-gray-400">-</span>
            <div className="relative flex-1">
              <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)} 
                className="w-full pl-9 pr-2 py-2 bg-transparent text-sm focus:outline-none text-gray-700"
              />
            </div>
          </div>
        </div>

        <div className="col-span-1 md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1.5 ml-1">Bulan</label>
          <select 
            value={filterMonth} 
            onChange={(e) => setFilterMonth(e.target.value)} 
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-erp-pink/30 focus:border-erp-pink outline-none cursor-pointer"
          >
            <option value="">Semua Bulan</option>
            {uniqueMonths.map(m => (
                <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="col-span-1 md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1.5 ml-1">Periode</label>
          <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-erp-pink/30 focus:border-erp-pink outline-none cursor-pointer">
            <option value="Semua Periode">Semua Periode</option>
            <option value="Periode 1">Periode 1</option>
            <option value="Periode 2">Periode 2</option>
          </select>
        </div>

        <div className="col-span-1 md:col-span-3">
          <label className="block text-xs font-medium text-gray-500 mb-1.5 ml-1">Divisi</label>
          <select 
            value={filterDivisi} 
            onChange={(e) => setFilterDivisi(e.target.value)} 
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-erp-pink/30 focus:border-erp-pink outline-none cursor-pointer"
          >
            <option value="Semua Divisi">Semua Divisi</option>
            {uniqueDivisions.map(d => (
                <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="col-span-1 md:col-span-2">
          <button onClick={handleResetFilters} className="w-full px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 hover:text-gray-800 flex items-center justify-center gap-2 transition-colors">
            <X size={18} /> Reset
          </button>
        </div>
      </div>

      {/* --- DETAILED SUMMARY CARDS --- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 1. GAPOK */}
          <div className="bg-white border border-blue-100 rounded-xl p-3 shadow-sm flex flex-col justify-between">
              <div className="flex items-center gap-2 text-blue-700 font-bold text-xs uppercase mb-1">
                  <Wallet size={14}/> Total Gapok
              </div>
              <div className="text-lg font-bold text-gray-800">
                  {isCalculatingTotal ? <Loader2 className="animate-spin" size={16}/> : formatRupiah(totals.gapok)}
              </div>
          </div>

          {/* 2. LEMBUR */}
          <div className="bg-white border border-orange-100 rounded-xl p-3 shadow-sm flex flex-col justify-between">
              <div className="flex items-center gap-2 text-orange-700 font-bold text-xs uppercase mb-1">
                  <Clock size={14}/> Total Lembur
              </div>
              <div className="text-lg font-bold text-gray-800">
                  {isCalculatingTotal ? <Loader2 className="animate-spin" size={16}/> : formatRupiah(totals.lembur)}
              </div>
          </div>

          {/* 3. MAKAN */}
          <div className="bg-white border border-green-100 rounded-xl p-3 shadow-sm flex flex-col justify-between">
              <div className="flex items-center gap-2 text-green-700 font-bold text-xs uppercase mb-1">
                  <Coffee size={14}/> Total Makan
              </div>
              <div className="text-lg font-bold text-gray-800">
                  {isCalculatingTotal ? <Loader2 className="animate-spin" size={16}/> : formatRupiah(totals.makan)}
              </div>
          </div>

          {/* 4. HADIR */}
          <div className="bg-white border border-teal-100 rounded-xl p-3 shadow-sm flex flex-col justify-between">
              <div className="flex items-center gap-2 text-teal-700 font-bold text-xs uppercase mb-1">
                  <UserCheck size={14}/> Total Hadir
              </div>
              <div className="text-lg font-bold text-gray-800">
                  {isCalculatingTotal ? <Loader2 className="animate-spin" size={16}/> : formatRupiah(totals.hadir)}
              </div>
          </div>

          {/* 5. BONUS */}
          <div className="bg-white border border-purple-100 rounded-xl p-3 shadow-sm flex flex-col justify-between">
              <div className="flex items-center gap-2 text-purple-700 font-bold text-xs uppercase mb-1">
                  <Star size={14}/> Total Bonus
              </div>
              <div className="text-lg font-bold text-gray-800">
                  {isCalculatingTotal ? <Loader2 className="animate-spin" size={16}/> : formatRupiah(totals.bonus)}
              </div>
          </div>

          {/* 6. TOTAL FINAL */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 shadow-sm flex flex-col justify-between">
              <div className="flex items-center gap-2 text-green-800 font-bold text-xs uppercase mb-1">
                  <Wallet size={14}/> Total Nominal
              </div>
              <div className="text-lg font-extrabold text-green-700">
                  {isCalculatingTotal ? <Loader2 className="animate-spin" size={16}/> : formatRupiah(totals.total)}
              </div>
          </div>
      </div>

      {/* --- DATA TABLE --- */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
        <div className="overflow-auto max-h-[600px] custom-scrollbar relative">
        <table className="w-full text-xs text-left whitespace-nowrap relative border-collapse">
            <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 sticky top-0 z-10 shadow-sm uppercase text-xs tracking-wider">
            <tr>
                <th className="px-4 py-4 w-10 text-center">No</th>
                <th className="px-6 py-4">Tanggal</th>
                <th className="px-6 py-4">Kode</th>
                <th className="px-6 py-4 text-center">Grade</th>
                <th className="px-6 py-4">Divisi</th>
                <th className="px-6 py-4 text-center">Kehadiran</th>
                <th className="px-6 py-4 text-center">Lembur</th>
                <th className="px-6 py-4">Keterangan</th>
                <th className="px-4 py-4 text-right bg-blue-50 text-blue-800">Gapok</th>
                <th className="px-4 py-4 text-right bg-orange-50 text-orange-800">Lembur</th>
                <th className="px-4 py-4 text-right bg-green-50 text-green-800">Makan</th>
                <th className="px-4 py-4 text-right bg-green-50 text-green-800">Hadir</th>
                <th className="px-4 py-4 text-right bg-purple-50 text-purple-800">Bonus</th>
                <th className="px-6 py-4 text-right bg-green-100 text-green-900 font-bold border-l border-green-200">TOTAL GAJI</th>
                <th className="px-4 py-4 text-center bg-gray-50">Aksi</th>
            </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
            {isLoading ? (
                <tr><td colSpan={16} className="p-16 text-center"><Loader2 className="animate-spin inline text-erp-pink mr-2" size={32}/> <span className="text-gray-500">Memuat data...</span></td></tr>
            ) : data.length > 0 ? (
                data.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-4 text-center text-gray-500">{idx + 1 + ((page - 1) * pageSize)}</td>
                    <td className="px-6 py-4 text-gray-700 font-medium">{item.tanggal}</td>
                    <td className="px-6 py-4 font-mono text-gray-600 bg-gray-50/50 rounded px-2 w-fit">{item.kode}</td>
                    <td className="px-6 py-4 text-center text-blue-600 font-bold">{item.grade}</td>
                    <td className="px-6 py-4 text-gray-600 text-xs">{item.divisi || '-'}</td>
                    <td className="px-6 py-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        ['1', 'H', 'Hadir'].includes(item.kehadiran) ? 'bg-green-100 text-green-700 border-green-200' :
                        ['0.5', 'Setengah'].includes(item.kehadiran) ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                        'bg-red-100 text-red-700 border-red-200'
                    }`}>
                        {item.kehadiran}
                    </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                    {item.lembur && item.lembur !== '0' && item.lembur !== '-' ? (
                        <span className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-1 rounded text-xs font-bold">
                        {item.lembur}
                        </span>
                    ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-sm italic truncate max-w-[150px]">{item.keterangan}</td>
                    
                    <td className="px-4 py-4 text-right text-gray-600 bg-blue-50/30">{formatRupiah(item.gaji_pokok || 0)}</td>
                    <td className="px-4 py-4 text-right text-gray-600 bg-orange-50/30">{formatRupiah(item.gaji_lembur || 0)}</td>
                    <td className="px-4 py-4 text-right text-gray-600 bg-green-50/30">{formatRupiah(item.uang_makan || 0)}</td>
                    <td className="px-4 py-4 text-right text-gray-600 bg-green-50/30">{formatRupiah(item.uang_kehadiran || 0)}</td>
                    <td className="px-4 py-4 text-right text-gray-600 bg-purple-50/30">{formatRupiah(item.uang_bonus || 0)}</td>

                    <td className="px-6 py-4 text-right font-bold text-green-700 bg-green-50/30 border-l border-green-50">
                    {formatRupiah(item.gaji)}
                    </td>
                    
                    <td className="px-4 py-4 text-center">
                        <button 
                            onClick={() => handleOpenDetail(item)}
                            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-full transition-colors"
                            title="Bedah Hitungan"
                        >
                            <Info size={18}/>
                        </button>
                    </td>
                </tr>
                ))
            ) : (
                <tr>
                <td colSpan={16} className="p-16 text-center text-gray-400 bg-gray-50/30">
                    <div className="flex flex-col items-center justify-center gap-3">
                    <Database size={48} className="text-gray-200"/>
                    <p>Tidak ada data gaji harian ditemukan.</p>
                    </div>
                </td>
                </tr>
            )}
            </tbody>
        </table>
        </div>
        
        {/* --- PAGINATION --- */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-2">
            <span>Menampilkan</span>
            <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="border border-gray-300 rounded-lg py-1.5 px-2 bg-white focus:ring-2 focus:ring-erp-pink/50 outline-none cursor-pointer text-xs font-medium"
            >
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
            <option value="1000">1000</option>
            </select>
            <span>dari <b>{totalData.toLocaleString()}</b> data</span>
        </div>
        
        <div className="flex items-center gap-2">
            <button 
            onClick={() => setPage(prev => Math.max(prev - 1, 1))}
            disabled={page === 1 || isLoading}
            className="p-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-white shadow-sm"
            >
            <ChevronLeft size={16} />
            </button>
            <span className="font-medium px-2">
            Halaman {page} / {Math.ceil(totalData / pageSize) || 1}
            </span>
            <button 
            onClick={() => setPage(prev => Math.min(prev + 1, Math.ceil(totalData / pageSize)))}
            disabled={page >= Math.ceil(totalData / pageSize) || isLoading}
            className="p-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-white shadow-sm"
            >
            <ChevronRight size={16} />
            </button>
        </div>
        </div>
      </div>

      {/* CONFIG MODAL */}
      <WorkDaysConfigModal 
        isOpen={isConfigModalOpen} 
        onClose={() => setIsConfigModalOpen(false)} 
        currentMonth={filterMonth} 
      />

      {/* FORMULA INFO MODAL */}
      <SalaryFormulaInfoModal 
        isOpen={isFormulaModalOpen} 
        onClose={() => setIsFormulaModalOpen(false)} 
      />
      
      {/* DETAIL CALCULATION MODAL */}
      <DailySalaryDetailModal 
        isOpen={isDetailModalOpen} 
        onClose={() => setIsDetailModalOpen(false)} 
        data={detailData} 
      />
      
      <DailyAdnanHananModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={() => {}} initialData={selectedItem} isLoading={false} />
      <SuccessModal isOpen={successModal.isOpen} onClose={() => setSuccessModal({ ...successModal, isOpen: false })} title={successModal.title} message={successModal.message} />
      <ErrorModal isOpen={errorModal.isOpen} onClose={() => setErrorModal({ ...errorModal, isOpen: false })} title={errorModal.title} message={errorModal.message} />
      
      {/* CONFIRMATION MODAL */}
      <ConfirmationModal 
        isOpen={confirmModal.isOpen} 
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} 
        onConfirm={confirmModal.onConfirm} 
        title={confirmModal.title} 
        message={confirmModal.message} 
        confirmLabel={confirmModal.confirmLabel} 
        isDangerous={confirmModal.isDangerous}
      />

      {/* SQL FIX MODAL */}
      {showSqlModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-blue-50">
              <h3 className="font-bold text-lg text-blue-800 flex items-center gap-2">
                <Database size={20}/> Optimasi Database
              </h3>
              <button onClick={() => setShowSqlModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 text-sm mb-4">
                Proses sinkronisasi memerlukan fungsi database terbaru. Silakan jalankan kode berikut di <b>Supabase SQL Editor</b>.
              </p>
              
              <div className="relative">
                <textarea 
                  className="w-full h-64 p-4 text-xs font-mono bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-erp-pink outline-none"
                  readOnly
                  value={sqlFixCode}
                  onClick={(e) => e.currentTarget.select()}
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(sqlFixCode);
                    setSuccessModal({ isOpen: true, title: 'SQL Disalin', message: 'Silakan jalankan kode di SQL Editor Supabase.' });
                  }}
                  className="absolute top-2 right-2 p-2 bg-white rounded-md shadow-sm border border-gray-200 hover:bg-gray-50 text-gray-600"
                  title="Salin Kode"
                >
                  <Copy size={16}/>
                </button>
              </div>

              <div className="mt-4 flex justify-end gap-3">
                <button 
                    onClick={() => setShowSqlModal(false)} 
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium"
                >
                    Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
