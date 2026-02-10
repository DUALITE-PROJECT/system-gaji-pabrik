import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  ChevronLeft, ChevronRight, Printer, Search, Loader2, 
  FileText, Filter, Download, Building2, X, Layers,
  Banknote, AlertCircle, CheckCircle2, Square, CheckSquare, ChevronDown
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import { MoneyRequirementsModal } from './MoneyRequirementsModal';

interface SalarySlipProps {
  isGarut?: boolean;
}

// Navigation Item Interface
interface SlipNavigationItem {
  type: 'regular' | 'borongan';
  id: string; // Real ID for regular, Composite Key for Borongan
  kode: string;
  nama: string;
  periode: string;
}

export const SalarySlip: React.FC<SalarySlipProps> = ({ isGarut = false }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isBulkPrinting, setIsBulkPrinting] = useState(false);
  
  // Filter State
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('Semua Periode'); 
  const [selectedCompany, setSelectedCompany] = useState('Semua Perusahaan');
  
  // Multi-select Division State
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>(['Semua Divisi']);
  const [isDivDropdownOpen, setIsDivDropdownOpen] = useState(false);
  const divDropdownRef = useRef<HTMLDivElement>(null);

  const [searchTerm, setSearchTerm] = useState('');
  
  const [uniqueMonths, setUniqueMonths] = useState<string[]>([]);
  const [uniqueCompanies, setUniqueCompanies] = useState<string[]>([]);
  const [uniqueDivisions, setUniqueDivisions] = useState<string[]>([]);
  
  // Navigation State
  const [slipNavigation, setSlipNavigation] = useState<SlipNavigationItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Data State
  const [currentSlip, setCurrentSlip] = useState<any>(null);
  const [boronganData, setBoronganData] = useState<any[]>([]); 
  const [masterSalaries, setMasterSalaries] = useState<any[]>([]);
  const [masterSequence, setMasterSequence] = useState<string[]>([]); 
  
  // Bulk Print State
  const [bulkSlips, setBulkSlips] = useState<any[]>([]);

  // Money Modal
  const [isMoneyModalOpen, setIsMoneyModalOpen] = useState(false);
  const [moneyModalData, setMoneyModalData] = useState<any[]>([]);

  const printRef = useRef<HTMLDivElement>(null);

  // Tables
  const reportTable = isGarut ? 'laporan_bulanan_pabrik_garut' : 'laporan_bulanan_pabrik';
  const boronganTable = isGarut ? 'data_gaji_borongan_pabrik_garut' : 'gaji_borongan';
  const employeeTable = isGarut ? 'data_karyawan_pabrik_garut' : 'karyawan_pabrik';

  // --- CLICK OUTSIDE HANDLER ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (divDropdownRef.current && !divDropdownRef.current.contains(event.target as Node)) {
        setIsDivDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- HELPER: COMPANY NAME MAPPING ---
  const getDisplayCompanyName = (name: string) => {
    if (!name) return '';
    const upper = name.toUpperCase().trim();
    if (upper === 'CV ADNAN') return 'CV ADNAN GHAISAN UTAMA';
    if (upper === 'CV HANAN') return 'CV HANAN MANDIRI';
    if (upper === 'BORONGAN' || upper.includes('BORONGAN')) return 'CV ADNAN GHAISAN UTAMA (BORONGAN)';
    return name;
  };

  // --- HELPER: AGGREGATE BORONGAN DATA ---
  const aggregateBoronganData = (rawData: any[]) => {
    const groups: Record<string, any> = {};

    rawData.forEach(item => {
      // Key must distinguish between periods if "Semua Periode" is selected
      const key = `${item.kode}-${item.periode}`;
      
      if (!groups[key]) {
        groups[key] = {
          id: `SLIP-${item.kode}-${item.periode}`,
          kode: item.kode,
          nama: item.nama,
          grade: item.grade,
          perusahaan: item.perusahaan || 'BORONGAN',
          divisi: 'Borongan',
          bulan: item.bulan,
          periode: item.periode,
          gaji: 0,
          bonus: 0,
          kasbon: 0, // Added kasbon initialization
          jam_kerja: 0,
          stats: { hadir: 0, sakit: 0, izin: 0, lembur: 0 }
        };
      }

      const g = groups[key];
      g.gaji += Number(item.gaji || 0);
      g.bonus += Number(item.bonus || 0);
      g.kasbon += Number(item.kasbon || 0); // Aggregate kasbon
      g.jam_kerja += Number(item.jam_kerja || 0);

      // Stats
      const k = (item.kehadiran || '').toUpperCase().trim();
      if (['H', '1', 'HADIR', 'FULL'].includes(k)) g.stats.hadir += 1;
      else if (['0.5', 'SETENGAH'].includes(k)) g.stats.hadir += 0.5;
      else if (['S', 'SAKIT'].includes(k)) g.stats.sakit += 1;
      else if (['I', 'IZIN'].includes(k)) g.stats.izin += 1;
      
      // Lembur logic (Summing hours if numeric)
      const l = parseFloat(item.lembur);
      if (!isNaN(l) && l > 0) g.stats.lembur = (Number(g.stats.lembur) || 0) + l;
    });

    return Object.values(groups);
  };

  // --- HELPER: BATCH FETCH BORONGAN ---
  const fetchAllBoronganData = async (selectColumns: string, filters: any) => {
    let allData: any[] = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
        let query = supabase
            .from(boronganTable)
            .select(selectColumns)
            .eq('bulan', filters.month)
            .order('id', { ascending: true }); // Ensure stable sort for pagination

        if (filters.period && filters.period !== 'Semua Periode') {
            query = query.eq('periode', filters.period);
        }
        
        if (filters.searchTerm) {
             query = query.or(`nama.ilike.%${filters.searchTerm}%,kode.ilike.%${filters.searchTerm}%`);
        }

        const { data, error } = await query.range(from, from + step - 1);
        
        if (error) {
            console.error("Error fetching borongan batch:", error);
            throw error;
        }

        if (data && data.length > 0) {
            allData = [...allData, ...data];
            if (data.length < step) hasMore = false;
            else from += step;
        } else {
            hasMore = false;
        }
    }
    return allData;
  };

  // --- 1. INITIAL LOAD (FILTERS) ---
  useEffect(() => {
    const fetchFilters = async () => {
      if (!isSupabaseConfigured()) return;
      
      const allMonths = new Set<string>();
      const allCompanies = new Set<string>();
      const allDivisions = new Set<string>();

      // 1. Fetch from Report Table
      const { data: reportData } = await supabase
        .from(reportTable)
        .select('bulan, perusahaan, divisi');
      
      if (reportData) {
        reportData.forEach(d => {
            if (d.bulan) allMonths.add(d.bulan);
            if (d.perusahaan) allCompanies.add(d.perusahaan);
            if (d.divisi) allDivisions.add(d.divisi);
        });
      }

      // 2. Fetch from Borongan Table
      const { data: boronganData } = await supabase
        .from(boronganTable)
        .select('bulan, perusahaan');
      
      if (boronganData) {
        boronganData.forEach(d => {
            if (d.bulan) allMonths.add(d.bulan);
        });
        // Check if Borongan table has data to enable "Borongan" option
        if (boronganData.length > 0 && isGarut) {
             allCompanies.add('Borongan');
        }
      }

      // 3. Fetch from Employee Table (Master)
      // This ensures months appear even if no report yet
      const { data: empData } = await supabase
        .from(employeeTable)
        .select('bulan');
      
      if (empData) {
        empData.forEach(d => {
            if (d.bulan) allMonths.add(d.bulan);
        });
      }

      // Process Months
      const months = Array.from(allMonths).filter(Boolean);
      const parseMonth = (str: string) => {
          const parts = str.split(' ');
          if (parts.length < 2) return 0;
          const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
          const mIndex = monthNames.findIndex(m => m.toLowerCase() === parts[0].toLowerCase());
          const year = parseInt(parts[1]);
          if (mIndex === -1 || isNaN(year)) return 0;
          return new Date(year, mIndex).getTime();
      };
      const sortedMonths = months.sort((a, b) => parseMonth(b) - parseMonth(a));
      setUniqueMonths(sortedMonths);

      // Auto select latest month
      if (sortedMonths.length > 0 && !selectedMonth) {
          setSelectedMonth(sortedMonths[0]);
      }

      setUniqueCompanies(Array.from(allCompanies).sort());
      setUniqueDivisions(Array.from(allDivisions).sort());
    };
    fetchFilters();
  }, [isGarut, reportTable, boronganTable, employeeTable]);

  // --- 2. FETCH MASTER GAJI ---
  useEffect(() => {
    const fetchMaster = async () => {
      const { data } = await supabase.from('master_gaji').select('*');
      if (data) setMasterSalaries(data);
    };
    fetchMaster();
  }, []);

  // --- 3. FETCH SLIP LIST (NAVIGATION) ---
  useEffect(() => {
    const fetchNavigationList = async () => {
      if (!selectedMonth || !isSupabaseConfigured()) return;
      setIsLoading(true);

      try {
        // A. Fetch Regular Slips (From Report)
        let queryReport = supabase
          .from(reportTable)
          .select('id, kode, nama, periode')
          .eq('bulan', selectedMonth);

        // Filter Perusahaan Regular
        if (selectedCompany !== 'Semua Perusahaan') {
             // Jika pilih Borongan, Regular kosong (kecuali ada data perusahaan='Borongan' di tabel laporan)
             if (selectedCompany === 'Borongan') {
                 queryReport = queryReport.eq('perusahaan', '###NO_MATCH###'); 
             } else {
                 queryReport = queryReport.eq('perusahaan', selectedCompany);
             }
        }
        
        // Multi-select Division Filter
        if (!selectedDivisions.includes('Semua Divisi')) {
            queryReport = queryReport.in('divisi', selectedDivisions);
        }
        
        if (selectedPeriod !== 'Semua Periode') {
            queryReport = queryReport.eq('periode', selectedPeriod);
        }
        
        if (searchTerm) {
            queryReport = queryReport.or(`nama.ilike.%${searchTerm}%,kode.ilike.%${searchTerm}%`);
        }

        const { data: regularData } = await queryReport;
        
        const regularItems: SlipNavigationItem[] = (regularData || []).map((d: any) => ({
            type: 'regular',
            id: d.id,
            kode: d.kode,
            nama: d.nama,
            periode: d.periode
        }));

        // B. Fetch Borongan Slips (BATCH FETCHING)
        let boronganItems: SlipNavigationItem[] = [];
        const showBorongan = (selectedCompany === 'Semua Perusahaan' || selectedCompany.toUpperCase().includes('BORONGAN')) && selectedDivisions.includes('Semua Divisi');

        if (isGarut && showBorongan) {
             const bData = await fetchAllBoronganData('kode, nama, periode', {
                 month: selectedMonth,
                 period: selectedPeriod,
                 searchTerm: searchTerm
             });
             
             // Dedup Borongan Data (Group by Kode + Periode)
             const uniqueSet = new Set<string>();
             if (bData) {
                 bData.forEach((d: any) => {
                     const key = `${d.kode}|${d.periode}`;
                     if (!uniqueSet.has(key)) {
                         uniqueSet.add(key);
                         boronganItems.push({
                             type: 'borongan',
                             id: key, // Composite ID
                             kode: d.kode,
                             nama: d.nama,
                             periode: d.periode
                         });
                     }
                 });
             }
        }

        // Combine and Sort
        const combined = [...regularItems, ...boronganItems].sort((a, b) => {
            // Sort by Name, then Period
            const nameCompare = a.nama.localeCompare(b.nama);
            if (nameCompare !== 0) return nameCompare;
            return a.periode.localeCompare(b.periode);
        });

        // Set Master Sequence for numbering (Unique Codes only)
        const uniqueCodes = new Set(combined.map(i => i.kode));
        setMasterSequence(Array.from(uniqueCodes).sort());

        setSlipNavigation(combined);
        setCurrentIndex(0);
        
      } catch (error) {
        console.error("Error fetching slip list:", error);
      } finally {
        setIsLoading(false);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      fetchNavigationList();
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [selectedMonth, selectedCompany, selectedDivisions, selectedPeriod, searchTerm, isGarut, reportTable, boronganTable]);

  // --- 4. FETCH CURRENT SLIP DETAIL ---
  useEffect(() => {
    const fetchSlip = async () => {
      if (slipNavigation.length === 0 || !selectedMonth) {
        setCurrentSlip(null);
        setBoronganData([]);
        return;
      }

      setIsLoadingData(true);
      const currentItem = slipNavigation[currentIndex];

      try {
        if (currentItem.type === 'regular') {
            // Fetch Regular Slip by ID
            const { data: regularData } = await supabase
                .from(reportTable)
                .select('*')
                .eq('id', currentItem.id)
                .single();
            
            setCurrentSlip(regularData);
            setBoronganData([]);
        } else {
            // Fetch Borongan Slip (Aggregate daily records for this period)
            // currentItem.id is "KODE|PERIODE"
            const [kode, periode] = currentItem.id.split('|');
            
            // Fetch ALL daily records for this specific person & period
            const { data: bData } = await supabase
                .from(boronganTable)
                .select('*')
                .eq('bulan', selectedMonth)
                .eq('kode', kode)
                .eq('periode', periode);
            
            if (bData && bData.length > 0) {
                setBoronganData(aggregateBoronganData(bData));
                setCurrentSlip(null);
            } else {
                setCurrentSlip(null);
                setBoronganData([]);
            }
        }
      } catch (error) {
        console.error("Error fetching slip:", error);
        setCurrentSlip(null);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchSlip();
  }, [currentIndex, slipNavigation, selectedMonth]);

  // --- HANDLERS ---
  const handlePrev = () => setCurrentIndex(prev => (prev > 0 ? prev - 1 : slipNavigation.length - 1));
  const handleNext = () => setCurrentIndex(prev => (prev < slipNavigation.length - 1 ? prev + 1 : 0));
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value);

  // --- MULTI-SELECT HANDLER ---
  const handleDivisionToggle = (div: string, e: React.MouseEvent) => {
    e.stopPropagation(); 
    e.preventDefault();

    setSelectedDivisions(prev => {
      if (div === 'Semua Divisi') {
        return ['Semua Divisi'];
      }
      
      let newSelection = [...prev];
      
      if (newSelection.includes('Semua Divisi')) {
        newSelection = [];
      }

      if (newSelection.includes(div)) {
        newSelection = newSelection.filter(d => d !== div);
      } else {
        newSelection.push(div);
      }

      if (newSelection.length === 0) {
        return ['Semua Divisi'];
      }
      
      return newSelection;
    });
  };

  const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  // --- ROUNDING HELPER (STEPPED UP 500 then 1000) ---
  const roundUpStepped = (val: number) => {
    const base = Math.floor(val / 1000) * 1000;
    const remainder = val - base;
    if (remainder === 0) return val;
    if (remainder < 500) return base + 500;
    return base + 1000;
  };

  const getSequenceNumber = (kode: string) => {
    const index = masterSequence.indexOf(kode);
    if (index === -1) return '000';
    return String(index + 1).padStart(3, '0');
  };

  // --- BULK PRINT ---
  const handleBulkPrint = async () => {
    setIsBulkPrinting(true);
    try {
        // Fetch Regular Slips
        let query = supabase
          .from(reportTable)
          .select('*')
          .eq('bulan', selectedMonth);

        if (selectedCompany !== 'Semua Perusahaan') {
             if (selectedCompany === 'Borongan') {
                 query = query.eq('perusahaan', '###NO_MATCH###');
             } else {
                 query = query.eq('perusahaan', selectedCompany);
             }
        }
        
        // Multi-select Division Filter
        if (!selectedDivisions.includes('Semua Divisi')) {
            query = query.in('divisi', selectedDivisions);
        }

        if (selectedPeriod !== 'Semua Periode') query = query.eq('periode', selectedPeriod);
        
        if (searchTerm) {
            query = query.or(`nama.ilike.%${searchTerm}%,kode.ilike.%${searchTerm}%`);
        }

        const { data: regularData } = await query.order('kode', { ascending: true });
        
        // Fetch Borongan Slips (BATCHED)
        let boronganRes: any[] = [];
        const showBorongan = (selectedCompany === 'Semua Perusahaan' || selectedCompany.toUpperCase().includes('BORONGAN')) && selectedDivisions.includes('Semua Divisi');

        if (isGarut && showBorongan) {
             const bData = await fetchAllBoronganData('*', {
                 month: selectedMonth,
                 period: selectedPeriod,
                 searchTerm: searchTerm
             });
             boronganRes = aggregateBoronganData(bData || []);
        }

        const combinedSlips = [
            ...(regularData || []).map((d: any) => ({ type: 'regular', data: d })),
            ...(boronganRes || []).map((d: any) => ({ type: 'borongan', data: d }))
        ].sort((a, b) => {
             // Sort by Name then Period
             const nameCompare = a.data.nama.localeCompare(b.data.nama);
             if (nameCompare !== 0) return nameCompare;
             return (a.data.periode || '').localeCompare(b.data.periode || '');
        });

        if (combinedSlips.length > 0) {
            setBulkSlips(combinedSlips);
            setTimeout(() => {
                window.print();
                setTimeout(() => setIsBulkPrinting(false), 500);
            }, 1000);
        } else {
            alert("Tidak ada data untuk dicetak.");
            setIsBulkPrinting(false);
        }
    } catch (error) {
        console.error("Bulk print error:", error);
        setIsBulkPrinting(false);
    }
  };

  const handleDownloadPDF = async () => {
    const element = document.querySelector('.single-slip-container') as HTMLElement;
    if (!element) return;
    try {
      // @ts-ignore
      const html2pdf = (await import('html2pdf.js')).default;
      const opt = {
        margin: 0,
        filename: `Slip_Gaji_Staff_${currentSlip?.nama || 'Karyawan'}_${selectedMonth}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a6', orientation: 'landscape' }
      };
      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error("PDF Error:", error);
      alert("Gagal mendownload PDF.");
    }
  };

  const handleOpenMoneyModal = async () => {
    setIsLoadingData(true);
    try {
        let allMoneyData: any[] = [];

        // 1. Fetch Regular Data
        let query = supabase
          .from(reportTable)
          .select('hasil_gaji')
          .eq('bulan', selectedMonth);

        if (selectedCompany !== 'Semua Perusahaan') {
             if (selectedCompany === 'Borongan') {
                 query = query.eq('perusahaan', '###NO_MATCH###'); 
             } else {
                 query = query.eq('perusahaan', selectedCompany);
             }
        }
        
        // Multi-select Division Filter
        if (!selectedDivisions.includes('Semua Divisi')) {
            query = query.in('divisi', selectedDivisions);
        }
        
        if (selectedPeriod !== 'Semua Periode') {
            query = query.eq('periode', selectedPeriod);
        }

        const { data: regularData } = await query;
        if (regularData) allMoneyData = [...allMoneyData, ...regularData];

        // 2. Fetch Borongan Data (BATCHED)
        const showBorongan = (selectedCompany === 'Semua Perusahaan' || selectedCompany.toUpperCase().includes('BORONGAN')) && selectedDivisions.includes('Semua Divisi');

        if (isGarut && showBorongan) {
             // FETCH PERIODE COLUMN TO GROUP CORRECTLY
             const bData = await fetchAllBoronganData('kode, gaji, bonus, kasbon, periode', {
                 month: selectedMonth,
                 period: selectedPeriod,
                 searchTerm: '' // No search term for money modal usually
             });
             
             if (bData) {
                 // AGGREGATE BY KODE + PERIODE
                 const aggMap: Record<string, number> = {};
                 
                 bData.forEach((item: any) => {
                     // Use composite key to separate periods
                     const k = `${item.kode}-${item.periode}`;
                     const val = (Number(item.gaji) || 0) + (Number(item.bonus) || 0) - (Number(item.kasbon) || 0);
                     if (!aggMap[k]) aggMap[k] = 0;
                     aggMap[k] += val;
                 });

                 const mappedBorongan = Object.values(aggMap).map(total => ({
                     hasil_gaji: total
                 }));
                 
                 allMoneyData = [...allMoneyData, ...mappedBorongan];
             }
        }

        setMoneyModalData(allMoneyData);
        setIsMoneyModalOpen(true);
    } catch (error) {
        console.error("Error fetching money data:", error);
    } finally {
        setIsLoadingData(false);
    }
  };

  // --- RENDER SLIP REGULAR ---
  const renderSlip = (data: any, isBulk: boolean = false) => {
    if (!data) return null;

    const seqNum = getSequenceNumber(data.kode);
    const isPeriode1 = (data.periode || '').toString().toLowerCase().includes('periode 1');
    
    const master = masterSalaries.find(m => 
        (m.grade || '').trim().toUpperCase() === (data.grade || '').trim().toUpperCase() &&
        (data.bulan || '').toLowerCase().includes((m.bulan || '').toLowerCase())
    );
    const tarifHarian = master?.gaji_harian || 0;
    const tarifPerJam = master?.gaji_per_jam || 0; 

    const containerClass = isBulk 
        ? "slip-page bg-white border-2 border-black p-3 relative flex flex-col box-border" 
        : "single-slip-container slip-card bg-white border-2 border-gray-800 p-4 w-[600px] text-xs shadow-lg relative flex flex-col mb-4 mx-auto";

    const fontSizeClass = isBulk ? "text-[9px]" : "text-xs";
    const headerSizeClass = isBulk ? "text-xs" : "text-sm";

    // Rounding Calculation
    const totalDiterima = Number(data.hasil_gaji || 0);
    const totalBulat = roundUpStepped(totalDiterima);

    return (
      <div key={data.id} className={containerClass}>
        {/* Sequence Number Box */}
        <div className="absolute top-2 right-2 border-2 border-black px-2 py-0.5 font-bold text-lg">{seqNum}</div>
        
        {/* Header */}
        <div className="flex justify-between items-end border-b-2 border-black pb-1 mb-2">
          <div>
            <h2 className={`font-bold uppercase tracking-wider ${isBulk ? 'text-sm' : 'text-lg'}`}>{getDisplayCompanyName(data.perusahaan)}</h2>
            <p className={`text-gray-600 text-[9px] uppercase tracking-widest`}>SLIP GAJI STAFF</p>
          </div>
          <div className="text-right mr-12">
            <p className={`font-bold ${headerSizeClass}`}>{data.bulan}</p>
            <p className="text-[10px]">Bulanan</p>
          </div>
        </div>

        {/* Employee Info */}
        <div className={`mb-2 grid grid-cols-2 gap-x-4 font-medium ${fontSizeClass}`}>
          <div className="flex justify-between"><span className="text-gray-600">Nama:</span><span className="font-bold">{data.nama}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Divisi:</span><span>{data.divisi}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Kode:</span><span className="font-mono">{data.kode}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Grade:</span><span>{data.grade}</span></div>
        </div>

        {/* Attendance Grid */}
        <div className="mb-2 border-y border-black py-1">
          <div className={`grid grid-cols-6 gap-1 text-center ${fontSizeClass}`}>
            <div><span className="block text-gray-500">Hadir</span><span className="font-bold">{data.h}</span></div>
            <div><span className="block text-gray-500">Set.H</span><span className="font-bold">{data.set_h}</span></div>
            <div><span className="block text-gray-500">Sakit</span><span className="font-bold">{Number(data.s_b || 0) + Number(data.s_tb || 0)}</span></div>
            <div><span className="block text-gray-500">Izin</span><span className="font-bold">{Number(data.i_b || 0) + Number(data.i_tb || 0)}</span></div>
            <div><span className="block text-gray-500">Lembur</span><span className="font-bold">{data.lembur} Jam</span></div>
            <div><span className="block text-gray-500">LP/TM</span><span className="font-bold">{Number(data.lp || 0)}</span></div>
          </div>
        </div>

        {/* Earnings & Deductions */}
        <div className={`grid grid-cols-2 gap-4 mb-1 flex-1 ${fontSizeClass}`}>
          {/* Left: Earnings */}
          <div>
            <h3 className="font-bold border-b border-gray-300 pb-0.5 text-[8px] uppercase text-gray-500 mb-1">PENGHASILAN UTAMA</h3>
            <div className="mb-1">
              <div className="flex justify-between font-bold"><span>Gaji Pokok</span><span>{formatRupiah(data.gapok)}</span></div>
              {tarifHarian > 0 && (
                  <div className="text-[8px] text-gray-500 pl-1 border-l border-gray-300 mt-0.5 leading-tight">
                      {data.h}x {formatRupiah(tarifHarian)} {data.set_h > 0 && ` + ${data.set_h} x ${formatRupiah(tarifPerJam)}`}
                  </div>
              )}
            </div>
            <div className="mb-1">
              <div className="flex justify-between font-bold"><span>Lembur</span><span>{formatRupiah(data.gaji_lembur)}</span></div>
            </div>
          </div>

          {/* Right: Allowances & Deductions */}
          <div>
            <h3 className="font-bold border-b border-gray-300 pb-0.5 text-[8px] uppercase text-gray-500 mb-1">TUNJANGAN & POTONGAN</h3>
            {!isPeriode1 ? (
              <>
                <div className="mb-1"><div className="flex justify-between font-bold"><span>U. Makan</span><span>{formatRupiah(data.u_m)}</span></div></div>
                <div className="mb-1"><div className="flex justify-between font-bold"><span>U. Hadir</span><span>{formatRupiah(data.u_k)}</span></div></div>
                {Number(data.uang_bonus) > 0 && (<div className="mb-1"><div className="flex justify-between font-bold"><span>Bonus</span><span>{formatRupiah(data.uang_bonus)}</span></div></div>)}
                {Number(data.penyesuaian_bonus) !== 0 && (<div className="mb-1"><div className="flex justify-between font-bold text-blue-600"><span>Penyesuaian</span><span>{formatRupiah(data.penyesuaian_bonus)}</span></div></div>)}
                {Number(data.kasbon) > 0 && (<div className="mb-1"><div className="flex justify-between font-bold text-red-600"><span>Kasbon</span><span>- {formatRupiah(data.kasbon)}</span></div></div>)}
              </>
            ) : (
              <>
                <div className="mb-1"><div className="flex justify-between font-bold"><span>U. Makan</span><span>{formatRupiah(0)}</span></div></div>
                <div className="mb-1"><div className="flex justify-between font-bold"><span>U. Kehadiran</span><span>{formatRupiah(0)}</span></div></div>
                <div className="mb-1"><div className="flex justify-between font-bold"><span>Bonus</span><span>{formatRupiah(0)}</span></div></div>
                <div className="mb-1">
                    <div className={`flex justify-between font-bold ${Number(data.kasbon) > 0 ? 'text-red-600' : ''}`}>
                        <span>Kasbon</span>
                        <span>{Number(data.kasbon) > 0 ? '- ' : ''}{formatRupiah(data.kasbon || 0)}</span>
                    </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* MODIFIED FOOTER SECTION */}
        <div className="mt-auto pt-1 border-t-2 border-black">
          <div className="flex justify-between items-center text-[10px] text-gray-600 mb-0.5">
             <span className="font-medium uppercase">Total Diterima (Asli)</span>
             <span className="font-medium">{formatRupiah(totalDiterima)}</span>
          </div>
          <div className="flex justify-between items-center">
             <span className="font-bold text-xs uppercase">TOTAL DIBAYARKAN</span>
             <span className="font-extrabold text-sm">{formatRupiah(totalBulat)}</span>
          </div>
        </div>

        <div className="mt-2 flex justify-between items-end text-[8px]">
           <span>{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
           <div className="text-center"><p className="mb-6">Penerima</p><div className="border-b border-black w-24"></div><p className="mt-0.5 font-bold">No. {seqNum}</p></div>
        </div>
      </div>
    );
  };

  // --- RENDER SLIP BORONGAN ---
  const renderBoronganSlip = (data: any, isBulk: boolean = false) => {
    if (!data) return null;

    const seqNum = getSequenceNumber(data.kode);
    const containerClass = isBulk 
        ? "slip-page bg-white border-2 border-black p-3 relative flex flex-col box-border" 
        : "single-slip-container slip-card bg-white border-2 border-gray-800 p-4 w-[600px] text-xs shadow-lg relative flex flex-col mb-4 mx-auto";

    const fontSizeClass = isBulk ? "text-[9px]" : "text-xs";
    const headerSizeClass = isBulk ? "text-xs" : "text-sm";
    
    // Calculate stats manually for display if needed
    // Assuming data is a single row from data_gaji_borongan_pabrik_garut
    const totalDiterima = Number(data.gaji || 0) + Number(data.bonus || 0) - Number(data.kasbon || 0);
    const totalBulat = roundUpStepped(totalDiterima);
    
    const hasAbsence = (data.b > 0); // Simplified check based on available columns
    const bonusText = data.bonus > 0 ? formatRupiah(data.bonus) : (hasAbsence ? "Hangus: Ada Absen" : "-");

    return (
      <div key={data.id} className={containerClass}>
        <div className="absolute top-2 right-2 border-2 border-black px-2 py-0.5 font-bold text-lg">{seqNum}</div>
        
        {/* Header */}
        <div className="flex justify-between items-end border-b-2 border-black pb-1 mb-2">
          <div>
            <h2 className={`font-bold uppercase tracking-wider ${isBulk ? 'text-sm' : 'text-lg'}`}>{getDisplayCompanyName(data.perusahaan || 'BORONGAN')}</h2>
            <p className={`text-gray-600 text-[9px] uppercase tracking-widest`}>SLIP GAJI BORONGAN</p>
          </div>
          <div className="text-right mr-12">
            <p className={`font-bold ${headerSizeClass}`}>{data.bulan}</p>
            <p className="text-[10px]">{data.periode}</p>
          </div>
        </div>
        <div className={`mb-2 grid grid-cols-2 gap-x-4 font-medium ${fontSizeClass}`}>
          <div className="flex justify-between"><span className="text-gray-600">Nama:</span><span className="font-bold">{data.nama}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Divisi:</span><span>Borongan</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Kode:</span><span className="font-mono">{data.kode}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Grade:</span><span>{data.grade}</span></div>
        </div>
        
        {/* Simple Attendance Grid for Borongan */}
        <div className="mb-2 border-y border-black py-1">
            <div className={`grid grid-cols-4 gap-1 text-center ${fontSizeClass}`}>
                <div><span className="block text-gray-500">Total Hari</span><span className="font-bold">{data.stats?.hadir || 0}</span></div>
                <div><span className="block text-gray-500">Sakit</span><span className="font-bold">{data.stats?.sakit || 0}</span></div>
                <div><span className="block text-gray-500">Izin</span><span className="font-bold">{data.stats?.izin || 0}</span></div>
                <div><span className="block text-gray-500">Lembur</span><span className="font-bold">{data.stats?.lembur || 0}</span></div>
            </div>
        </div>

        <div className={`grid grid-cols-2 gap-4 mb-1 flex-1 ${fontSizeClass}`}>
            <div>
                <h3 className="font-bold border-b border-gray-300 pb-0.5 text-[8px] uppercase text-gray-500 mb-1">PENGHASILAN</h3>
                <div className="mb-1">
                    <div className="flex justify-between font-bold"><span>Upah Borongan</span><span>{formatRupiah(data.gaji)}</span></div>
                    <div className="text-[8px] text-gray-500 pl-1 border-l border-gray-300 mt-0.5 leading-tight">
                        {data.jam_kerja} Jam Kerja
                    </div>
                </div>
            </div>
            <div>
                <h3 className="font-bold border-b border-gray-300 pb-0.5 text-[8px] uppercase text-gray-500 mb-1">TUNJANGAN & POTONGAN</h3>
                <div className="mb-1">
                    <div className="flex justify-between font-bold"><span>Bonus</span><span>{bonusText}</span></div>
                </div>
                {Number(data.kasbon) > 0 && (
                    <div className="mb-1">
                        <div className="flex justify-between font-bold text-red-600"><span>Kasbon</span><span>- {formatRupiah(data.kasbon)}</span></div>
                    </div>
                )}
            </div>
        </div>
        
        {/* MODIFIED FOOTER SECTION */}
        <div className="mt-auto pt-1 border-t-2 border-black">
          <div className="flex justify-between items-center text-[10px] text-gray-600 mb-0.5">
             <span className="font-medium uppercase">Total Diterima (Asli)</span>
             <span className="font-medium">{formatRupiah(totalDiterima)}</span>
          </div>
          <div className="flex justify-between items-center">
             <span className="font-bold text-xs uppercase">TOTAL DIBAYARKAN</span>
             <span className="font-extrabold text-sm">{formatRupiah(totalBulat)}</span>
          </div>
        </div>

        <div className="mt-2 flex justify-between items-end text-[8px]">
           <span>{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
           <div className="text-center"><p className="mb-6">Penerima</p><div className="border-b border-black w-24"></div><p className="mt-0.5 font-bold">No. {seqNum}</p></div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Print Styles */}
      <style>{`
        @media print {
          @page { size: A6 landscape; margin: 0mm; }
          html, body { margin: 0 !important; padding: 0 !important; }
          #root { display: none !important; }
          .portal-print-root { display: block !important; position: absolute; top: 0; left: 0; width: 100%; z-index: 9999; }
          .slip-page { page-break-after: always !important; break-after: page !important; width: 148mm !important; height: 100mm !important; display: flex !important; flex-direction: column; box-sizing: border-box; padding: 5mm; overflow: hidden; border: 2px solid black; margin: 0 auto; }
          .slip-page:last-child { page-break-after: auto !important; break-after: auto !important; }
        }
      `}</style>

      {/* --- TOOLBAR (Hidden on Print) --- */}
      <div className="p-6 pb-0 print:hidden">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto flex-wrap">
            {/* Month Filter */}
            <select 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)} 
                className="px-4 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm font-medium focus:ring-2 focus:ring-erp-pink outline-none cursor-pointer"
            >
              {uniqueMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            {/* Period Filter */}
            <select 
                value={selectedPeriod} 
                onChange={(e) => setSelectedPeriod(e.target.value)} 
                className="px-4 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm font-medium focus:ring-2 focus:ring-erp-pink outline-none cursor-pointer"
            >
              <option value="Semua Periode">Semua Periode</option>
              <option value="Periode 1">Periode 1</option>
              <option value="Periode 2">Periode 2</option>
            </select>

            {/* Company Filter */}
            <div className="relative">
              <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <select 
                value={selectedCompany} 
                onChange={(e) => setSelectedCompany(e.target.value)} 
                className="pl-9 pr-4 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm font-medium focus:ring-2 focus:ring-erp-pink outline-none cursor-pointer"
              >
                <option value="Semua Perusahaan">Semua Perusahaan</option>
                {uniqueCompanies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* MULTI-SELECT DIVISION FILTER */}
            <div className="relative" ref={divDropdownRef}>
              <button 
                onClick={() => setIsDivDropdownOpen(!isDivDropdownOpen)}
                className="pl-9 pr-4 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm font-medium focus:ring-2 focus:ring-erp-pink outline-none flex items-center justify-between w-48 bg-white"
              >
                <Layers size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <span className="truncate text-left">
                  {selectedDivisions.includes('Semua Divisi') ? 'Semua Divisi' : `${selectedDivisions.length} Divisi Terpilih`}
                </span>
                <ChevronDown size={14} className="text-gray-400 ml-2"/>
              </button>
              
              {isDivDropdownOpen && (
                <div 
                  className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto p-1"
                  onClick={(e) => e.stopPropagation()} // Prevent click inside from closing
                >
                  <div 
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 rounded flex items-center gap-2 ${selectedDivisions.includes('Semua Divisi') ? 'text-erp-pink font-bold' : 'text-gray-700'}`}
                    onClick={(e) => handleDivisionToggle('Semua Divisi', e)}
                  >
                    {selectedDivisions.includes('Semua Divisi') ? <CheckCircle2 size={16} className="text-erp-pink"/> : <Square size={16} className="text-gray-300"/>}
                    Semua Divisi
                  </div>
                  <div className="border-t border-gray-100 my-1"></div>
                  {uniqueDivisions.map(div => (
                    <div 
                      key={div}
                      className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 rounded flex items-center gap-2 ${selectedDivisions.includes(div) ? 'text-erp-pink font-bold' : 'text-gray-700'}`}
                      onClick={(e) => handleDivisionToggle(div, e)}
                    >
                      {selectedDivisions.includes(div) ? <CheckSquare size={16} className="text-erp-pink"/> : <Square size={16} className="text-gray-300"/>}
                      {div}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Cari Kode..." 
                value={searchTerm} 
                onChange={handleSearch}
                className="pl-9 pr-4 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-erp-pink w-32"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            
            <button 
                onClick={handleOpenMoneyModal}
                className="bg-green-600 text-white px-3 py-2 rounded-lg shadow-md hover:bg-green-700 transition-colors flex items-center gap-2 text-sm font-medium"
            >
                <Banknote size={16}/> <span className="hidden sm:inline">Rincian Uang</span>
            </button>

            <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-200">
              <button onClick={handlePrev} className="p-1.5 hover:bg-white rounded-md shadow-sm transition-all" disabled={slipNavigation.length === 0}><ChevronLeft size={18} /></button>
              <span className="text-xs font-medium px-2 min-w-[100px] text-center">{slipNavigation.length > 0 ? `${currentIndex + 1} / ${slipNavigation.length}` : '0'}</span>
              <button onClick={handleNext} className="p-1.5 hover:bg-white rounded-md shadow-sm transition-all" disabled={slipNavigation.length === 0}><ChevronRight size={18} /></button>
            </div>
            
            <button onClick={handleDownloadPDF} className="bg-blue-600 text-white px-3 py-2 rounded-lg shadow-md hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium" title="Download PDF"><Download size={16} /></button>
            
            <button onClick={handleBulkPrint} disabled={isBulkPrinting || slipNavigation.length === 0} className="bg-gray-800 text-white px-3 py-2 rounded-lg shadow-md hover:bg-gray-900 transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50" title="Cetak Semua Slip (A6)">
              {isBulkPrinting ? <Loader2 className="animate-spin" size={16}/> : <Printer size={16} />} Cetak Semua (A6)
            </button>
          </div>
        </div>
      </div>

      {/* --- PREVIEW AREA --- */}
      <div className="flex-1 overflow-auto bg-gray-100 p-6 print:hidden">
        {isLoading || isLoadingData ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500"><Loader2 className="animate-spin mb-2" size={32} /><p>Memuat data slip gaji...</p></div>
        ) : (!currentSlip && boronganData.length === 0) ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <FileText size={48} className="mb-4 opacity-20" />
            <p>Tidak ada data gaji untuk filter ini.</p>
          </div>
        ) : (
          <div ref={printRef} className="flex flex-wrap justify-center gap-8 items-start print:hidden">
            <div className={`single-slip-container w-full text-center`}>
              {currentSlip && renderSlip(currentSlip)}
              {boronganData.map((slip: any, idx: number) => (
                  <div key={`borongan-${idx}`} className="mb-8">
                      {renderBoronganSlip(slip)}
                  </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* --- PORTAL FOR BULK PRINTING --- */}
      {isBulkPrinting && createPortal(
        <div className="portal-print-root">
          {bulkSlips.map((item, idx) => 
             item.type === 'regular' 
                ? renderSlip(item.data, true) 
                : renderBoronganSlip(item.data, true)
          )}
        </div>,
        document.body
      )}

      {/* MONEY REQUIREMENTS MODAL */}
      <MoneyRequirementsModal 
        isOpen={isMoneyModalOpen}
        onClose={() => setIsMoneyModalOpen(false)}
        data={moneyModalData}
        filters={{
            perusahaan: selectedCompany,
            periode: 'Bulanan',
            bulan: selectedMonth,
            divisi: selectedDivisions
        }}
      />
    </div>
  );
};
