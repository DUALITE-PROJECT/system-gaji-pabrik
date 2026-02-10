import { Project, TeamMember, Task, CalendarEvent, SKU, StockItem, Shipment, StockOpnameSession } from '../types';

// ... (Existing TeamMembers, Projects, Tasks, CalendarEvents - Keeping them for compatibility)
export const mockTeamMembers: TeamMember[] = [
  {
    id: '1',
    name: 'Sarah Chen',
    role: 'Creative Director',
    avatar: 'https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=150&h=150&fit=crop&crop=face',
    email: 'sarah@studio.com',
    status: 'online',
    department: 'Design'
  },
];

export const mockProjects: Project[] = [];
export const mockTasks: Task[] = [];
export const mockCalendarEvents: CalendarEvent[] = [];

// --- WAREHOUSE MOCK DATA (UPDATED) ---

export const mockSKUs: SKU[] = [
  { 
    id: '1', 
    code: 'TWGL105', 
    name: 'TAS WANITA GLAMOUR', 
    description: 'Tas pesta wanita bahan kulit sintetis premium', 
    category: 'Tas Wanita', 
    minStock: 50, 
    unit: 'Pcs', 
    hpp: 58622, 
    hppUpdatedAt: '31/8/2025', 
    createdAt: '31/8/2025',
    price: 120000 
  },
  { 
    id: '2', 
    code: 'BSM', 
    name: 'BOX SLEEK MEDIUM', 
    description: 'Kotak penyimpanan serbaguna ukuran sedang', 
    category: 'Packaging', 
    minStock: 200, 
    unit: 'Pcs', 
    hpp: 4700, 
    hppUpdatedAt: '30/8/2025', 
    createdAt: '30/8/2025',
    price: 8500 
  },
  { 
    id: '3', 
    code: 'MPB101', 
    name: 'MINI POUCH BASIC', 
    description: 'Pouch kecil untuk kosmetik atau alat tulis', 
    category: 'Aksesoris', 
    minStock: 100, 
    unit: 'Pcs', 
    hpp: 15000, 
    hppUpdatedAt: '30/8/2025', 
    createdAt: '23/8/2025',
    price: 25000 
  },
  { 
    id: '4', 
    code: 'THAL101', 
    name: 'TAS HANDBAG ALLURE', 
    description: 'Handbag kasual cocok untuk sehari-hari', 
    category: 'Tas Wanita', 
    minStock: 40, 
    unit: 'Pcs', 
    hpp: 37000, 
    hppUpdatedAt: '30/8/2025', 
    createdAt: '23/8/2025',
    price: 75000 
  },
  { 
    id: '5', 
    code: 'TSWTR154', 
    name: 'TAS SELEMPANG TRAVEL', 
    description: 'Tas selempang anti air untuk traveling', 
    category: 'Tas Pria', 
    minStock: 60, 
    unit: 'Pcs', 
    hpp: 57416, 
    hppUpdatedAt: '30/8/2025', 
    createdAt: '21/8/2025',
    price: 95000 
  },
];

export const mockStock: StockItem[] = [
  { id: '1', skuId: '1', sku: mockSKUs[0], quantity: 150, location: 'Gudang Utama', status: 'available', lastUpdated: '2025-08-31' },
  { id: '2', skuId: '2', sku: mockSKUs[1], quantity: 500, location: 'Rak B-01', status: 'available', lastUpdated: '2025-08-30' },
  { id: '3', skuId: '3', sku: mockSKUs[2], quantity: 230, location: 'Gudang Utama', status: 'available', lastUpdated: '2025-08-30' },
  { id: '4', skuId: '4', sku: mockSKUs[3], quantity: 85, location: 'Rak A-05', status: 'available', lastUpdated: '2025-08-30' },
  { id: '5', skuId: '5', sku: mockSKUs[4], quantity: 120, location: 'Gudang Utama', status: 'available', lastUpdated: '2025-08-30' },
];

export const mockShipments: Shipment[] = [
  { 
    id: '1', referenceNo: 'PO-FAC-001', type: 'factory_outbound', date: '2025-08-31', status: 'pending', source: 'Pabrik Garment A', destination: 'Gudang Pusat',
    items: [{ skuId: '1', skuName: 'TAS WANITA GLAMOUR', qty: 50 }]
  },
];

export const mockStockOpname: StockOpnameSession[] = [
  { id: '1', date: '2025-08-01', auditor: 'Budi Santoso', status: 'completed', totalItems: 5430, discrepancy: -2 },
];

// --- FACTORY MOCK DATA (NEW) ---

export const mockFactoryEmployees = [
  { id: 1, kode: 'K001', nama: 'Budi Santoso', jenis_kelamin: 'L', grade_p1: 'A', grade_p2: 'Senior', divisi: 'Produksi', bulan: 'Oktober 2025', keterangan: 'Tetap', status_aktif: true },
  { id: 2, kode: 'K002', nama: 'Siti Aminah', jenis_kelamin: 'P', grade_p1: 'B', grade_p2: 'Junior', divisi: 'Packing', bulan: 'Oktober 2025', keterangan: 'Kontrak', status_aktif: true },
  { id: 3, kode: 'K003', nama: 'Rudi Hartono', jenis_kelamin: 'L', grade_p1: 'C', grade_p2: 'Training', divisi: 'Gudang', bulan: 'Oktober 2025', keterangan: 'Percobaan', status_aktif: true },
  { id: 4, kode: 'K004', nama: 'Dewi Sartika', jenis_kelamin: 'P', grade_p1: 'A', grade_p2: 'Senior', divisi: 'QC', bulan: 'Oktober 2025', keterangan: 'Tetap', status_aktif: true },
  { id: 5, kode: 'K005', nama: 'Andi Wijaya', jenis_kelamin: 'L', grade_p1: 'B', grade_p2: 'Junior', divisi: 'Produksi', bulan: 'Oktober 2025', keterangan: 'Kontrak', status_aktif: false },
];

export const mockFactoryAttendance = [
  { id: 1, tanggal: '2025-10-01', kode: 'K001', grade_p1: 'A', grade_p2: 'Senior', bulan: 'Oktober 2025', kehadiran: '1', lembur: '2 jam', periode: 'Periode 1', perusahaan: 'CV ADNAN', keterangan: 'Hadir' },
  { id: 2, tanggal: '2025-10-01', kode: 'K002', grade_p1: 'B', grade_p2: 'Junior', bulan: 'Oktober 2025', kehadiran: '1', lembur: '0', periode: 'Periode 1', perusahaan: 'CV ADNAN', keterangan: 'Hadir' },
  { id: 3, tanggal: '2025-10-01', kode: 'K003', grade_p1: 'C', grade_p2: 'Training', bulan: 'Oktober 2025', kehadiran: '0.5', lembur: '0', periode: 'Periode 1', perusahaan: 'CV ADNAN', keterangan: 'Setengah Hari' },
  { id: 4, tanggal: '2025-10-02', kode: 'K001', grade_p1: 'A', grade_p2: 'Senior', bulan: 'Oktober 2025', kehadiran: '1', lembur: '1 jam', periode: 'Periode 1', perusahaan: 'CV ADNAN', keterangan: 'Hadir' },
  { id: 5, tanggal: '2025-10-02', kode: 'K002', grade_p1: 'B', grade_p2: 'Junior', bulan: 'Oktober 2025', kehadiran: 'S', lembur: '0', periode: 'Periode 1', perusahaan: 'CV ADNAN', keterangan: 'Sakit' },
];

export const mockFactorySalary = [
  { id: 1, bulan: 'Oktober 2025', grade: 'A', gaji_pokok: 5000000, gaji_harian: 192307, gaji_setengah_hari: 96154, gaji_per_jam: 24038, lembur: 25000, uang_makan: 500000, uang_makan_harian: 19230, uang_kehadiran: 300000, uang_kehadiran_harian: 11538, bonus: 1000000 },
  { id: 2, bulan: 'Oktober 2025', grade: 'B', gaji_pokok: 4000000, gaji_harian: 153846, gaji_setengah_hari: 76923, gaji_per_jam: 19230, lembur: 20000, uang_makan: 400000, uang_makan_harian: 15384, uang_kehadiran: 250000, uang_kehadiran_harian: 9615, bonus: 500000 },
  { id: 3, bulan: 'Oktober 2025', grade: 'C', gaji_pokok: 3000000, gaji_harian: 115384, gaji_setengah_hari: 57692, gaji_per_jam: 14423, lembur: 15000, uang_makan: 300000, uang_makan_harian: 11538, uang_kehadiran: 200000, uang_kehadiran_harian: 7692, bonus: 250000 },
];

export const mockSalaryAdjustment = [
  { id: 1, bulan: 'Oktober 2025', periode: 'Periode 1', perusahaan: 'CV ADNAN', kode: 'K001', penyesuaian_bonus: 50000, kasbon: 0 },
  { id: 2, bulan: 'Oktober 2025', periode: 'Periode 1', perusahaan: 'CV ADNAN', kode: 'K002', penyesuaian_bonus: 0, kasbon: 100000 },
];

export const mockMonthlyReport = [
  { id: 1, bulan: 'Oktober 2025', periode: 'Periode 1', perusahaan: 'CV ADNAN', kode: 'K001', nama: 'Budi Santoso', grade_p1: 'A', grade_p2: 'Senior', divisi: 'Produksi', h: 26, i_b: 0, i_tb: 0, s_b: 0, s_tb: 0, t_b: 0, t_tb: 0, set_h: 0, lp: 0, tm: 0, lembur: 50000, set_h_1_15: 0, h_1_31: 26, gapok: 5000000, gaji_lembur: 50000, u_k: 300000, u_m: 500000, uang_bonus: 1000000, kasbon: 0, penyesuaian_bonus: 50000, hasil_gaji: 6900000, keterangan: 'Lunas', keluar_masuk: '-', libur_perusahaan: 0 },
  { id: 2, bulan: 'Oktober 2025', periode: 'Periode 1', perusahaan: 'CV ADNAN', kode: 'K002', nama: 'Siti Aminah', grade_p1: 'B', grade_p2: 'Junior', divisi: 'Packing', h: 24, i_b: 1, i_tb: 0, s_b: 1, s_tb: 0, t_b: 0, t_tb: 0, set_h: 0, lp: 0, tm: 0, lembur: 0, set_h_1_15: 0, h_1_31: 24, gapok: 4000000, gaji_lembur: 0, u_k: 250000, u_m: 400000, uang_bonus: 500000, kasbon: 100000, penyesuaian_bonus: 0, hasil_gaji: 5050000, keterangan: 'Lunas', keluar_masuk: '-', libur_perusahaan: 0 },
];
