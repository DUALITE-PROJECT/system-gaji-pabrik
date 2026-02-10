import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Printer, Search, Loader2, Building2, Layers, ChevronDown, CheckCircle2, Square, CheckSquare
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';

interface SalarySignatureListProps {
  isGarut?: boolean;
}

export const SalarySignatureList: React.FC<SalarySignatureListProps> = ({ isGarut = false }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  
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
  
  // Data State
  const [reportData, setReportData] = useState<any[]>([]);
  const [boronganData, setBoronganData] = useState<any[]>([]);
  const [masterEmployees, setMasterEmployees] = useState<any[]>([]); // NEW: State for Master Employees
  const [masterSequence, setMasterSequence] = useState<string[]>([]); 

  const printRef = useRef<HTMLDivElement>(null);

  // Tentukan tabel sumber berdasarkan prop isGarut
  const reportTable = isGarut ? 'laporan_bulanan_pabrik_garut' : 'laporan_bulanan_pabrik';
  const boronganTable = isGarut ? 'data_gaji_borongan_pabrik_garut' : 'gaji_borongan';
  const presensiTable = isGarut ? 'presensi_harian_pabrik_garut' : 'presensi_harian_pabrik';
  const employeeTable = isGarut ? 'data_karyawan_pabrik_garut' : 'karyawan_pabrik'; // NEW: Employee Table

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

  // --- HELPER: KETERANGAN SINGKAT ---
  const getKeteranganSingkat = (text: string) => {
    if (!text) return '';
    const lower = text.toLowerCase();
    if (lower.includes('baru masuk')) return 'BM';
    if (lower.includes('keluar')) return 'KL';
    return '';
  };

  // --- 1. INITIAL LOAD ---
  useEffect(() => {
    const fetchInitData = async () => {
      if (!isSupabaseConfigured()) return;
      
      const { data: months1 } = await supabase.from(reportTable).select('bulan, perusahaan, divisi');
      
      let allMonths = new Set<string>();
      if (months1) months1.forEach(m => allMonths.add(m.bulan));

      // Fetch months from Borongan table as well
      const { data: months2 } = await supabase.from(boronganTable).select('bulan');
      months2?.forEach(m => allMonths.add(m.bulan));

      // Fetch months from Presensi Harian
      const { data: months3 } = await supabase.from(presensiTable).select('bulan');
      months3?.forEach(m => {
          if (m.bulan) allMonths.add(m.bulan);
      });

      // NEW: Fetch months from Employee Data (Master) to ensure month appears even if no report yet
      const { data: months4 } = await supabase.from(employeeTable).select('bulan');
      months4?.forEach(m => {
          if (m.bulan) allMonths.add(m.bulan);
      });
      
      // Chronological Sort
      const monthMap: Record<string, number> = {
        'januari': 1, 'februari': 2, 'maret': 3, 'april': 4, 'mei': 5, 'juni': 6,
        'juli': 7, 'agustus': 8, 'september': 9, 'oktober': 10, 'november': 11, 'desember': 12
      };

      const sortedMonths = Array.from(allMonths).sort((a, b) => {
          const partsA = a.split(' ');
          const partsB = b.split(' ');
          const monthA = partsA[0]?.toLowerCase();
          const monthB = partsB[0]?.toLowerCase();
          const yearA = parseInt(partsA[1]) || 0;
          const yearB = parseInt(partsB[1]) || 0;

          if (yearA !== yearB) return yearB - yearA; // Descending year
          return (monthMap[monthB] || 0) - (monthMap[monthA] || 0); // Descending month
      });

      setUniqueMonths(sortedMonths);
      
      if (sortedMonths.length > 0 && !selectedMonth) {
        setSelectedMonth(sortedMonths[0]);
      } else if (!selectedMonth) {
        const today = new Date();
        const m = today.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        setSelectedMonth(m);
      }

      const companySet = new Set<string>();
      const normalizeAndAdd = (name: string) => {
        if (!name) return;
        const cleanName = name.trim();
        if (cleanName.toUpperCase() === 'BORONGAN' || cleanName.toUpperCase().includes('BORONGAN')) {
            companySet.add('Borongan');
        } else {
            companySet.add(cleanName);
        }
      };

      months1?.forEach(m => normalizeAndAdd(m.perusahaan));
      
      // Check if Borongan table has data to enable "Borongan" option
      const { count: boronganCount } = await supabase.from(boronganTable).select('*', { count: 'exact', head: true });
      if (boronganCount && boronganCount > 0) {
          companySet.add('Borongan');
      }

      setUniqueCompanies(Array.from(companySet).sort());

      // Divisions
      const divSet = new Set<string>();
      months1?.forEach(m => {
        if (m.divisi) divSet.add(m.divisi);
      });
      setUniqueDivisions(Array.from(divSet).sort());
    };
    fetchInitData();
  }, [isGarut, reportTable, boronganTable, presensiTable, employeeTable]);

  // --- 2. FETCH DATA ---
  useEffect(() => {
    const fetchData = async () => {
      if (!selectedMonth || !isSupabaseConfigured()) return;
      setIsLoading(true);

      try {
        // A. Fetch All Codes (Master Sequence)
        const { data: allCodes1 } = await supabase.from(reportTable).select('kode').eq('bulan', selectedMonth);
        const uniqueCodes = new Set(allCodes1?.map(c => c.kode) || []);

        const { data: allCodes2 } = await supabase.from(boronganTable).select('kode').eq('bulan', selectedMonth);
        allCodes2?.forEach(c => uniqueCodes.add(c.kode));

        // Fallback: Fetch from Employee Master if report is empty
        const { data: allCodes3 } = await supabase.from(employeeTable).select('kode').eq('bulan', selectedMonth);
        allCodes3?.forEach(c => uniqueCodes.add(c.kode));
        
        const sortedCodes = Array.from(uniqueCodes).sort();
        setMasterSequence(sortedCodes);

        // B. Fetch Data (Laporan Bulanan - Staff)
        let query1 = supabase
          .from(reportTable)
          .select('*')
          .eq('bulan', selectedMonth)
          .neq('perusahaan', 'BORONGAN');

        if (selectedPeriod !== 'Semua Periode') query1 = query1.eq('periode', selectedPeriod);
        
        // MULTI-SELECT DIVISION FILTER
        if (!selectedDivisions.includes('Semua Divisi')) {
            query1 = query1.in('divisi', selectedDivisions);
        }

        // Filter Perusahaan untuk Staff
        if (selectedCompany === 'Borongan') {
            // Jika pilih Borongan, Staff kosong
            query1 = query1.eq('perusahaan', '###NO_MATCH###'); 
        } else if (selectedCompany !== 'Semua Perusahaan') {
            query1 = query1.eq('perusahaan', selectedCompany);
        }

        const { data: res1 } = await query1;
        
        // C. Fetch Data (Borongan)
        let res2: any[] = [];
        
        // Tampilkan borongan jika filter perusahaan = Semua atau Borongan
        // Dan Divisi = Semua Divisi (Borongan tidak punya divisi spesifik di filter ini)
        const showBorongan = (selectedCompany === 'Semua Perusahaan' || selectedCompany === 'Borongan') && selectedDivisions.includes('Semua Divisi');

        if (showBorongan) {
             let query2 = supabase
                .from(boronganTable)
                .select('*')
                .eq('bulan', selectedMonth);
             
             if (selectedPeriod !== 'Semua Periode') query2 = query2.eq('periode', selectedPeriod);
             
             const { data } = await query2;
             res2 = data || [];
        }

        // D. Fetch Master Employees (Fallback if report not generated)
        let queryEmp = supabase
            .from(employeeTable)
            .select('*')
            .eq('bulan', selectedMonth);
        
        if (selectedCompany !== 'Semua Perusahaan' && selectedCompany !== 'Borongan') {
             queryEmp = queryEmp.eq('perusahaan', selectedCompany);
        }
        
        // Division filter for master employees
        if (!selectedDivisions.includes('Semua Divisi')) {
             queryEmp = queryEmp.in('divisi', selectedDivisions);
        }

        if (searchTerm) {
             queryEmp = queryEmp.or(`nama.ilike.%${searchTerm}%,kode.ilike.%${searchTerm}%`);
        }

        const { data: res3 } = await queryEmp;

        setReportData(res1 || []);
        setBoronganData(res2 || []);
        setMasterEmployees(res3 || []);

      } catch (error) {
        console.error("Error fetching list:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedMonth, selectedPeriod, selectedCompany, selectedDivisions, isGarut, reportTable, boronganTable, employeeTable]);

  // --- 3. COMBINE DATA ---
  const combinedData = useMemo(() => {
    let list: any[] = [];
    const addedCodes = new Set<string>();

    // MAP KETERANGAN DARI MASTER EMPLOYEES
    const ketMap = new Map();
    masterEmployees.forEach(emp => {
        if (emp.kode) ketMap.set(emp.kode, emp.keterangan);
    });

    // 1. Add from Report Data
    reportData.forEach(item => {
      list.push({
        type: 'Bulanan',
        id: item.id,
        kode: item.kode,
        nama: item.nama,
        divisi: item.divisi,
        perusahaan: item.perusahaan,
        periode: item.periode,
        total_gaji: item.hasil_gaji,
        grade: item.periode === 'Periode 1' ? item.grade_p1 : item.grade_p2,
        keterangan_karyawan: ketMap.get(item.kode) || ''
      });
      addedCodes.add(item.kode);
    });

    // 2. Add from Borongan Data
    const boronganGroup: Record<string, any> = {};
    boronganData.forEach(item => {
        const key = `${item.kode}-${item.periode}`;
        if (!boronganGroup[key]) {
            boronganGroup[key] = {
                type: 'Borongan',
                id: `B-${item.kode}`,
                kode: item.kode,
                nama: item.nama,
                divisi: 'Borongan',
                perusahaan: 'BORONGAN',
                periode: item.periode,
                total_gaji: 0,
                grade: item.grade,
                keterangan_karyawan: ketMap.get(item.kode) || ''
            };
        }
        boronganGroup[key].total_gaji += Number(item.gaji || 0);
        addedCodes.add(item.kode);
    });

    list = [...list, ...Object.values(boronganGroup)];

    // 3. Add from Master Employees (If not in Report/Borongan)
    masterEmployees.forEach(emp => {
        // Skip if already added (unless it's a different period logic, but simplified here)
        // For signature list, we just need the name to appear.
        // If report is missing, we show them as "Periode 1" or "Periode 2" based on filter, or "Periode 1" default
        
        // Check if this employee code is already in the list for the selected period (or any if 'Semua')
        const alreadyExists = list.some(l => l.kode === emp.kode && (selectedPeriod === 'Semua Periode' || l.periode === selectedPeriod));
        
        if (!alreadyExists) {
             // If Borongan filter is active, only add if employee is Borongan? 
             // Logic: If selectedCompany is 'Borongan', only add if emp.perusahaan is Borongan.
             // But usually master data has specific PT names.
             
             // Determine if employee matches selected company filter (already done in query but double check)
             const isBoronganEmp = (emp.perusahaan || '').toUpperCase().includes('BORONGAN') || (emp.divisi || '').toUpperCase().includes('BORONGAN');
             
             if (selectedCompany === 'Borongan' && !isBoronganEmp) return;
             if (selectedCompany !== 'Semua Perusahaan' && selectedCompany !== 'Borongan' && emp.perusahaan !== selectedCompany) return;

             list.push({
                type: 'Master',
                id: `M-${emp.id}`,
                kode: emp.kode,
                nama: emp.nama,
                divisi: emp.divisi,
                perusahaan: emp.perusahaan,
                periode: selectedPeriod === 'Semua Periode' ? 'Periode 1' : selectedPeriod, // Default to P1 or selected
                total_gaji: 0, // No salary calculated yet
                grade: selectedPeriod === 'Periode 2' ? emp.grade_p2 : emp.grade_p1,
                keterangan_karyawan: emp.keterangan || ''
             });
        }
    });

    if (searchTerm) {
        list = list.filter(item => 
            item.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.kode.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }

    // Sort by Divisi first, then Name/Code
    return list.sort((a, b) => {
        if (a.divisi !== b.divisi) return a.divisi.localeCompare(b.divisi);
        return a.nama.localeCompare(b.nama);
    });
  }, [reportData, boronganData, masterEmployees, searchTerm, selectedPeriod, selectedCompany]);

  // --- PAGINATION HELPER (15 Per Page) ---
  const chunkedData = useMemo(() => {
    const size = 15; // 15 per page
    const result = [];
    for (let i = 0; i < combinedData.length; i += size) {
      result.push(combinedData.slice(i, i + size));
    }
    return result;
  }, [combinedData]);

  const getSequenceNumber = (kode: string) => {
    const index = masterSequence.indexOf(kode);
    if (index === -1) return '000';
    return String(index + 1).padStart(3, '0');
  };

  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        setIsPrinting(false);
      }, 500);
    }, 500);
  };

  // --- MULTI-SELECT HANDLER (FIXED) ---
  const handleDivisionToggle = (div: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent dropdown from closing
    e.preventDefault();

    setSelectedDivisions(prev => {
      // Logic: If clicking "Semua", clear others. If clicking specific, clear "Semua".
      if (div === 'Semua Divisi') {
        return ['Semua Divisi'];
      }
      
      let newSelection = [...prev];
      
      // If "Semua" was selected, remove it first
      if (newSelection.includes('Semua Divisi')) {
        newSelection = [];
      }

      if (newSelection.includes(div)) {
        newSelection = newSelection.filter(d => d !== div);
      } else {
        newSelection.push(div);
      }

      // If nothing selected, default back to "Semua"
      if (newSelection.length === 0) {
        return ['Semua Divisi'];
      }
      
      return newSelection;
    });
  };

  // --- STYLES ---
  const styles = `
    @media print {
      @page { size: A4 portrait; margin: 0; }
      body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
      #root { display: none; }
      .print-portal { display: block !important; position: absolute; top: 0; left: 0; width: 100%; background: white; }
    }

    .sig-page {
      width: 210mm;
      height: 297mm; /* Fixed A4 height */
      padding: 10mm 10mm; /* Adjusted padding */
      margin: 0 auto;
      background: white;
      font-family: 'Times New Roman', serif;
      color: black;
      box-sizing: border-box;
      page-break-after: always;
      position: relative;
      display: flex;
      flex-direction: column;
    }

    .sig-header {
      text-align: center;
      margin-bottom: 3mm;
      flex-shrink: 0;
    }

    .sig-title {
      font-size: 14pt;
      font-weight: bold;
      text-transform: uppercase;
      margin: 0 0 5px 0;
      text-decoration: underline;
    }

    .sig-meta {
      font-size: 9pt;
      display: flex;
      justify-content: center;
      gap: 15px;
      flex-wrap: wrap;
    }

    /* WRAPPER AGAR TABEL FILL HEIGHT */
    .sig-content {
      flex-grow: 1;
      display: flex;
      flex-direction: column;
    }

    .sig-table {
      width: 100%;
      height: 100%; /* Fill the container */
      border-collapse: collapse;
      border: 2px solid black !important; /* Outer border thick */
      font-size: 10pt; /* Slightly smaller font for 15 rows */
    }

    .sig-table th {
      border: 1px solid black !important;
      background-color: #e0e0e0 !important;
      font-weight: bold;
      text-align: center;
      text-transform: uppercase;
      height: 8mm; /* Fixed Header Height */
      vertical-align: middle;
    }

    .sig-table td {
      border: 1px solid black !important;
      padding: 0 5px;
      vertical-align: middle;
    }

    /* Force rows to share height equally (15 rows) */
    .sig-table tbody tr {
      height: 6.6%; /* Approx 100% / 15 rows */
    }

    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .font-bold { font-weight: bold; }
    .font-mono { font-family: 'Courier New', monospace; }

    .sig-footer {
      margin-top: 5mm;
      flex-shrink: 0;
      page-break-inside: avoid;
    }

    .signatures {
      display: flex;
      justify-content: space-around;
      padding: 0 20px;
      margin-top: 10px;
    }

    .sig-box {
      text-align: center;
      width: 200px;
    }

    .sig-space {
      height: 20mm; /* Space for signature */
    }

    .sig-line {
      border-top: 1px solid black;
      margin-top: 2px;
    }

    .page-number {
      position: absolute;
      bottom: 5mm;
      right: 10mm;
      font-size: 8pt;
      color: #000;
    }

    .watermark {
      position: absolute;
      bottom: 2px;
      right: 2px;
      font-size: 6pt;
      color: #aaa;
    }
  `;

  // --- RENDER PAGE CONTENT ---
  const renderPage = (items: any[], pageIndex: number, totalPages: number) => {
    // Pad items to exactly 15 rows
    const paddedItems = [...items];
    while (paddedItems.length < 15) {
      paddedItems.push({ id: `empty-${paddedItems.length}`, isEmpty: true });
    }

    // Format Division Display for Header
    const divisionDisplay = selectedDivisions.includes('Semua Divisi') 
        ? 'Semua Divisi' 
        : selectedDivisions.join(', ');

    return (
      <div key={pageIndex} className="sig-page">
        {/* HEADER */}
        <div className="sig-header">
          <h1 className="sig-title">DAFTAR PENERIMAAN GAJI</h1>
          <div className="sig-meta">
            <span><strong>Bulan:</strong> {selectedMonth}</span>
            <span>|</span>
            <span><strong>Periode:</strong> {selectedPeriod}</span>
            <span>|</span>
            <span><strong>Perusahaan:</strong> {selectedCompany}</span>
            <span>|</span>
            <span><strong>Divisi:</strong> {divisionDisplay}</span>
          </div>
        </div>

        {/* TABLE CONTENT (FLEX GROW) */}
        <div className="sig-content">
          <table className="sig-table">
            <thead>
              <tr>
                <th style={{ width: '35px' }}>No.</th>
                <th style={{ width: '80px' }}>Kode</th>
                <th>Nama Karyawan</th>
                <th style={{ width: '110px' }}>Perusahaan</th>
                <th style={{ width: '90px' }}>Divisi</th>
                <th style={{ width: '40px' }}>Ket</th>
                <th style={{ width: '130px' }}>Tanda Tangan</th>
              </tr>
            </thead>
            <tbody>
              {paddedItems.map((item, index) => {
                if (item.isEmpty) {
                  return (
                    <tr key={`empty-${index}`}>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                    </tr>
                  );
                }
                return (
                  <tr key={`${item.id}-${index}`}>
                    <td className="text-center font-bold">
                      {getSequenceNumber(item.kode)}
                    </td>
                    <td className="text-center font-mono">
                      {item.kode}
                    </td>
                    <td className="text-left font-bold" style={{ paddingLeft: '8px' }}>
                      {item.nama}
                    </td>
                    <td className="text-center text-[9px]">
                      {getDisplayCompanyName(item.perusahaan)}
                    </td>
                    <td className="text-center text-[10px]">
                      {item.divisi}
                    </td>
                    <td className="text-center font-bold text-red-600" style={{ fontSize: '9pt' }}>
                      {getKeteranganSingkat(item.keterangan_karyawan)}
                    </td>
                    <td style={{ position: 'relative' }}>
                      <span className="watermark">
                        {getSequenceNumber(item.kode)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* FOOTER (Only Last Page) */}
        {pageIndex === totalPages - 1 && (
          <div className="sig-footer">
             <div className="signatures">
              <div className="sig-box">
                <p>Dibuat Oleh,</p>
                <div className="sig-space"></div>
                <p className="font-bold">Admin Keuangan</p>
                <div className="sig-line"></div>
              </div>
              <div className="sig-box">
                <p>Disetujui Oleh,</p>
                <div className="sig-space"></div>
                <p className="font-bold">Pimpinan</p>
                <div className="sig-line"></div>
              </div>
            </div>
          </div>
        )}

        {/* Page Number */}
        <div className="page-number">
          Hal. {pageIndex + 1} / {totalPages}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Inject Styles for Preview & Print */}
      <style>{styles}</style>

      {/* --- TOOLBAR (Hidden on Print) --- */}
      <div className="p-6 pb-0 print:hidden">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto flex-wrap">
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-4 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm font-medium focus:ring-2 focus:ring-erp-pink outline-none"
            >
              {uniqueMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            <select 
              value={selectedPeriod} 
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="px-4 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm font-medium focus:ring-2 focus:ring-erp-pink outline-none"
            >
              <option value="Semua Periode">Semua Periode</option>
              <option value="Periode 1">Periode 1</option>
              <option value="Periode 2">Periode 2</option>
            </select>

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

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Cari Nama..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink outline-none w-40"
              />
            </div>
          </div>

          <button 
            onClick={handlePrint} 
            disabled={combinedData.length === 0}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg shadow-md hover:bg-gray-900 transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
          >
            <Printer size={16} /> Cetak Daftar (A4)
          </button>
        </div>
      </div>

      {/* --- PREVIEW AREA (SCROLLABLE) --- */}
      <div className="flex-1 overflow-auto bg-gray-100 p-6 print:hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Loader2 className="animate-spin mb-2" size={32} />
            <p>Memuat data...</p>
          </div>
        ) : combinedData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Building2 size={48} className="mb-4 opacity-20" />
            <p>Tidak ada data untuk ditampilkan.</p>
          </div>
        ) : (
          <div ref={printRef} className="flex flex-col items-center gap-8 pb-10">
            {/* Preview uses scale to fit screen */}
            <div className="shadow-2xl border border-gray-300 transform scale-75 origin-top">
               {renderPage(chunkedData[0] || [], 0, chunkedData.length)}
            </div>
            {chunkedData.length > 1 && <p className="text-gray-500 text-sm italic">+ {chunkedData.length - 1} halaman lainnya (Lihat saat cetak)</p>}
          </div>
        )}
      </div>

      {/* --- PORTAL FOR PRINTING --- */}
      {isPrinting && createPortal(
        <div className="print-portal bg-white">
           {chunkedData.map((pageItems, idx) => renderPage(pageItems, idx, chunkedData.length))}
        </div>,
        document.body
      )}
    </div>
  );
};
