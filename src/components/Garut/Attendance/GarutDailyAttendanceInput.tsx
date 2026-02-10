import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Save, Loader2, Filter, Search, CheckCircle2, AlertCircle, Building2, Layers
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface Employee {
  id: number;
  kode: string;
  nama: string;
  grade_p1: string;
  grade_p2: string;
  divisi: string;
  bagian: string;
  perusahaan: string;
  bulan: string;
}

interface AttendanceInputState {
  [key: string]: {
    kehadiran: string;
    lembur: string;
    keterangan: string;
    perusahaan: string; // Added specific company selection for this record
  };
}

export const GarutDailyAttendanceInput: React.FC = () => {
  // Filters
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('Periode 1');
  const [selectedBagian, setSelectedBagian] = useState('Semua Bagian'); // State Filter Bagian Baru
  
  // Data
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [inputState, setInputState] = useState<AttendanceInputState>({});
  
  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusMessage, setStatusMessage] = useState<{type: 'success'|'error'|'info', text: string} | null>(null);

  // 1. Fetch Available Months from Employee Data
  useEffect(() => {
    const fetchMonths = async () => {
      const { data } = await supabase
        .from('data_karyawan_pabrik_garut')
        .select('bulan')
        .order('created_at', { ascending: false });
      
      if (data) {
        const months = [...new Set(data.map(d => d.bulan))].filter(Boolean);
        setAvailableMonths(months);
        if (months.length > 0 && !selectedMonth) {
          const currentMonthName = new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' });
          const match = months.find(m => m.toLowerCase() === currentMonthName.toLowerCase());
          setSelectedMonth(match || months[0]);
        }
      }
    };
    fetchMonths();
  }, []);

  // 2. Fetch Employees when Month changes
  useEffect(() => {
    if (!selectedMonth) return;

    const fetchEmployees = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('data_karyawan_pabrik_garut')
          .select('*')
          .eq('bulan', selectedMonth)
          .eq('status_aktif', true)
          .order('nama', { ascending: true });

        if (error) throw error;

        // FILTER LOGIC UPDATED:
        // Include if Bagian contains CV ADNAN or CV HANAN (even if mixed with Borongan)
        // Exclude if purely Borongan (and not Adnan/Hanan)
        const filteredData = (data || []).filter(emp => {
            const p = (emp.perusahaan || '').toUpperCase();
            const d = (emp.divisi || '').toUpperCase();
            const b = (emp.bagian || '').toUpperCase();

            // Whitelist: Jika bagian/perusahaan mengandung CV ADNAN atau CV HANAN, MASUKKAN.
            const isAdnanOrHanan = b.includes('CV ADNAN') || b.includes('CV HANAN') || p.includes('CV ADNAN') || p.includes('CV HANAN');
            
            if (isAdnanOrHanan) return true;

            // Blacklist: Jika murni Borongan (tanpa Adnan/Hanan), EXCLUDE.
            const isBorongan = p.includes('BORONGAN') || d.includes('BORONGAN') || b.includes('BORONGAN');
            return !isBorongan;
        });

        setEmployees(filteredData);
        
        // Initialize input state
        const initialInput: AttendanceInputState = {};
        filteredData.forEach(emp => {
          // Determine default company logic
          let defaultCompany = emp.perusahaan;
          const bagianUpper = (emp.bagian || '').toUpperCase();

          // Prioritize stripping "Borongan" from the default company selection
          if (bagianUpper.includes('CV ADNAN')) {
             defaultCompany = 'CV ADNAN';
          } else if (bagianUpper.includes('CV HANAN')) {
             defaultCompany = 'CV HANAN';
          }

          initialInput[emp.kode] = {
            kehadiran: '', 
            lembur: '0',
            keterangan: '',
            perusahaan: defaultCompany
          };
        });
        setInputState(initialInput);
        
        // Check if data already exists for this date
        checkExistingAttendance(filteredData);

      } catch (error: any) {
        console.error("Error fetching employees:", error);
        setStatusMessage({ type: 'error', text: 'Gagal memuat data karyawan.' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmployees();
  }, [selectedMonth]);

  // 3. Check Existing Attendance when Date or Employees change
  const checkExistingAttendance = async (currentEmployees: Employee[]) => {
    if (!selectedDate || currentEmployees.length === 0) return;

    const { data: existing } = await supabase
      .from('presensi_harian_pabrik_garut')
      .select('kode, kehadiran, lembur, keterangan, perusahaan')
      .eq('tanggal', selectedDate);

    if (existing && existing.length > 0) {
      setStatusMessage({ type: 'info', text: `Ditemukan ${existing.length} data presensi untuk tanggal ini. Mode Edit Aktif.` });
      
      setInputState(prev => {
        const newState = { ...prev };
        existing.forEach((record: any) => {
          if (newState[record.kode]) {
            newState[record.kode] = {
              kehadiran: record.kehadiran,
              lembur: record.lembur,
              keterangan: record.keterangan || '',
              perusahaan: record.perusahaan || newState[record.kode].perusahaan
            };
          }
        });
        return newState;
      });
    } else {
      setStatusMessage(null);
    }
  };

  // Re-check when date changes
  useEffect(() => {
    if (employees.length > 0) {
      // Reset to default first
      const resetState: AttendanceInputState = {};
      employees.forEach(emp => {
          let defaultCompany = emp.perusahaan;
          const bagianUpper = (emp.bagian || '').toUpperCase();

          if (bagianUpper.includes('CV ADNAN')) {
             defaultCompany = 'CV ADNAN';
          } else if (bagianUpper.includes('CV HANAN')) {
             defaultCompany = 'CV HANAN';
          }

          resetState[emp.kode] = { 
              kehadiran: '', 
              lembur: '0', 
              keterangan: '',
              perusahaan: defaultCompany
          };
      });
      setInputState(resetState);
      
      // Then check database
      checkExistingAttendance(employees);
    }
  }, [selectedDate]);

  // Handlers
  const handleInputChange = (kode: string, field: keyof AttendanceInputState[string], value: string) => {
    setInputState(prev => ({
      ...prev,
      [kode]: { ...prev[kode], [field]: value }
    }));
  };

  const handleSave = async () => {
    if (!selectedDate || !selectedMonth) {
      alert("Mohon pilih Tanggal dan Bulan.");
      return;
    }

    setIsSaving(true);
    try {
      // Prepare data and FILTER empty rows
      const validData = employees.map(emp => {
        const input = inputState[emp.kode];
        
        const kehadiran = input.kehadiran ? input.kehadiran.trim() : '';
        const lembur = input.lembur ? input.lembur.toString().trim() : '';
        
        // Filter Logic: Skip if Kehadiran is empty AND Lembur is empty or '0'
        const isKehadiranEmpty = kehadiran === '';
        const isLemburEmpty = lembur === '' || lembur === '0';

        if (isKehadiranEmpty && isLemburEmpty) {
            return null;
        }

        return {
          tanggal: selectedDate,
          kode: emp.kode,
          grade_p1: emp.grade_p1,
          grade_p2: emp.grade_p2,
          bulan: selectedMonth,
          periode: selectedPeriod,
          perusahaan: input.perusahaan, // Use the selected company
          kehadiran: kehadiran,
          lembur: lembur || '0',
          keterangan: input.keterangan
        };
      }).filter(item => item !== null);

      // 1. Delete existing for this date and these employees (Clean slate for this batch)
      const codes = employees.map(e => e.kode);
      if (codes.length > 0) {
        await supabase
            .from('presensi_harian_pabrik_garut')
            .delete()
            .eq('tanggal', selectedDate)
            .in('kode', codes);
      }

      // 2. Insert new data (only valid rows)
      if (validData.length > 0) {
        const { error } = await supabase
            .from('presensi_harian_pabrik_garut')
            .insert(validData);

        if (error) throw error;
      }

      setStatusMessage({ type: 'success', text: `Berhasil menyimpan ${validData.length} data presensi!` });
      setTimeout(() => setStatusMessage(null), 3000);

    } catch (error: any) {
      console.error("Save error:", error);
      setStatusMessage({ type: 'error', text: `Gagal menyimpan: ${error.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  // --- FILTER LOGIC ---
  
  // 1. Extract Unique Bagian
  const uniqueBagian = useMemo(() => {
    const bagians = employees.map(e => e.bagian).filter(Boolean);
    // Bersihkan data bagian (trim) agar tidak ada duplikat karena spasi
    const cleanBagians = bagians.map(b => b.trim());
    return ['Semua Bagian', ...new Set(cleanBagians)].sort();
  }, [employees]);

  // 2. Filter Employees
  const filteredEmployees = useMemo(() => {
    return employees.filter(e => {
      const matchSearch = 
        e.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.kode.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchBagian = selectedBagian === 'Semua Bagian' || (e.bagian || '').trim() === selectedBagian;

      return matchSearch && matchBagian;
    });
  }, [employees, searchTerm, selectedBagian]);

  return (
    <div className="space-y-6">
      {/* --- FILTERS HEADER --- */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-4 items-end">
          <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-4 gap-4"> {/* Updated to 4 columns */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Tanggal Presensi</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink outline-none"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Bulan Data</label>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <select 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink outline-none bg-white cursor-pointer"
                >
                  <option value="" disabled>Pilih Bulan</option>
                  {availableMonths.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Periode Gaji</label>
              <select 
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink outline-none bg-white cursor-pointer"
              >
                <option value="Periode 1">Periode 1</option>
                <option value="Periode 2">Periode 2</option>
              </select>
            </div>

            {/* NEW BAGIAN FILTER */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Filter Bagian</label>
              <div className="relative">
                <Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <select 
                  value={selectedBagian}
                  onChange={(e) => setSelectedBagian(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-erp-pink outline-none bg-white cursor-pointer"
                >
                  {uniqueBagian.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-auto">
             <button 
               onClick={handleSave}
               disabled={isSaving || employees.length === 0}
               className="w-full lg:w-auto bg-erp-pink hover:bg-pink-600 text-white px-6 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-pink-200 transition-all disabled:opacity-50"
             >
               {isSaving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
               Simpan Presensi
             </button>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className={`mt-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
            statusMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
            statusMessage.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
            'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {statusMessage.type === 'success' ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}
            {statusMessage.text}
          </div>
        )}
      </div>

      {/* --- TABLE SECTION --- */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Cari Nama / Kode..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-erp-pink"
            />
          </div>
          <div className="text-xs text-gray-500">
            Menampilkan: <b>{filteredEmployees.length}</b> dari {employees.length} Karyawan
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-gray-100 text-gray-600 font-bold sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 w-12 text-center">No</th>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama Karyawan</th>
                <th className="px-4 py-3">Divisi</th>
                <th className="px-4 py-3">Bagian</th>
                <th className="px-4 py-3 text-center">Grade</th>
                <th className="px-4 py-3 w-48">Perusahaan</th>
                <th className="px-4 py-3 w-32">Kehadiran</th>
                <th className="px-4 py-3 w-24 text-center">Lembur</th>
                <th className="px-4 py-3">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={10} className="p-12 text-center"><Loader2 className="animate-spin inline text-erp-pink mr-2"/> Memuat data...</td></tr>
              ) : filteredEmployees.length > 0 ? (
                filteredEmployees.map((emp, idx) => {
                  const bagianUpper = (emp.bagian || '').toUpperCase();
                  const hasAdnan = bagianUpper.includes('CV ADNAN');
                  const hasHanan = bagianUpper.includes('CV HANAN');
                  
                  // Only show dropdown if it has BOTH Adnan AND Hanan
                  const isDual = hasAdnan && hasHanan;
                  
                  // Determine which grade to show based on selected period
                  const displayGrade = selectedPeriod === 'Periode 1' ? emp.grade_p1 : emp.grade_p2;

                  return (
                    <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2 text-center text-gray-500">{idx + 1}</td>
                      <td className="px-4 py-2 font-mono text-gray-600">{emp.kode}</td>
                      <td className="px-4 py-2 font-medium text-gray-900">{emp.nama}</td>
                      <td className="px-4 py-2 text-gray-600">{emp.divisi}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{emp.bagian}</td>
                      
                      <td className="px-4 py-2 text-center">
                        <span className="font-bold text-blue-600">{displayGrade || '-'}</span>
                      </td>

                      <td className="px-4 py-2">
                        {isDual ? (
                          <div className="relative">
                            <Building2 size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"/>
                            <select
                              value={inputState[emp.kode]?.perusahaan || 'CV ADNAN'}
                              onChange={(e) => handleInputChange(emp.kode, 'perusahaan', e.target.value)}
                              className="w-full pl-7 pr-2 py-1.5 border border-blue-200 bg-blue-50 rounded text-xs font-medium text-blue-800 focus:ring-2 focus:ring-erp-pink outline-none cursor-pointer"
                            >
                              <option value="CV ADNAN">CV ADNAN</option>
                              <option value="CV HANAN">CV HANAN</option>
                            </select>
                          </div>
                        ) : (
                          // Show the calculated default (stripped of Borongan)
                          <span className="text-gray-600 text-sm">{inputState[emp.kode]?.perusahaan}</span>
                        )}
                      </td>
                      
                      <td className="px-4 py-2">
                        <input 
                          type="text"
                          value={inputState[emp.kode]?.kehadiran || ''}
                          onChange={(e) => handleInputChange(emp.kode, 'kehadiran', e.target.value)}
                          className={`w-full px-3 py-1.5 border rounded text-center font-bold focus:ring-2 focus:ring-erp-pink outline-none ${
                            inputState[emp.kode]?.kehadiran?.toLowerCase().includes('hadir') || inputState[emp.kode]?.kehadiran === '1' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white border-gray-300'
                          }`}
                          placeholder="1 / Hadir"
                        />
                      </td>

                      <td className="px-4 py-2 text-center">
                        <input 
                          type="text"
                          value={inputState[emp.kode]?.lembur || ''}
                          onChange={(e) => handleInputChange(emp.kode, 'lembur', e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-center focus:ring-2 focus:ring-erp-pink outline-none"
                          placeholder="0"
                        />
                      </td>

                      <td className="px-4 py-2">
                        <input 
                          type="text"
                          value={inputState[emp.kode]?.keterangan || ''}
                          onChange={(e) => handleInputChange(emp.kode, 'keterangan', e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-erp-pink outline-none text-gray-600 text-sm"
                          placeholder="Catatan..."
                        />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="p-16 text-center text-gray-400 italic">
                    {employees.length === 0 ? 'Pilih bulan untuk memuat data karyawan.' : 'Tidak ada karyawan ditemukan.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="p-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex justify-between">
          <span>Total Karyawan (Non-Borongan Murni): {employees.length}</span>
          <span>Menampilkan: {filteredEmployees.length}</span>
        </div>
      </div>
    </div>
  );
};
