import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Banknote, Printer, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface MoneyRequirementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any[]; // Array of salary objects containing 'total_gaji'
  filters: {
    perusahaan: string;
    periode: string;
    bulan: string;
    divisi: string[];
  };
}

export const MoneyRequirementsModal: React.FC<MoneyRequirementsModalProps> = ({
  isOpen,
  onClose,
  data,
  filters
}) => {
  const [isPrinting, setIsPrinting] = useState(false);

  // Denominations configuration (Smallest unit 500 due to rounding policy)
  const DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500];

  // --- ROUNDING HELPER (STEPPED UP 500 then 1000) ---
  const roundUpStepped = (val: number) => {
    const base = Math.floor(val / 1000) * 1000;
    const remainder = val - base;
    if (remainder === 0) return val;
    if (remainder < 500) return base + 500;
    return base + 1000;
  };

  const calculation = useMemo(() => {
    const counts: Record<number, number> = {};
    let totalAmount = 0;

    // Initialize counts
    DENOMINATIONS.forEach(d => counts[d] = 0);

    data.forEach(item => {
      // Use hasil_gaji from laporan_bulanan or total_gaji/totalGaji depending on source
      const rawValue = Number(item.hasil_gaji || item.total_gaji || item.totalGaji || 0);
      
      // NEW ROUNDING LOGIC:
      // Sisa < 500 -> 500
      // Sisa >= 500 -> 1000
      let remainder = roundUpStepped(rawValue);
      
      totalAmount += remainder;

      DENOMINATIONS.forEach(denom => {
        if (remainder >= denom) {
          const count = Math.floor(remainder / denom);
          counts[denom] += count;
          remainder %= denom;
        }
      });
    });

    return { counts, totalAmount };
  }, [data]);

  const formatRupiah = (val: number) => 
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);

  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setIsPrinting(false), 500);
    }, 500);
  };

  const handleExportExcel = () => {
    const exportData = DENOMINATIONS.map(denom => ({
      'Pecahan': formatRupiah(denom),
      'Lembar': calculation.counts[denom],
      'Total Nominal': calculation.counts[denom] * denom
    }));

    // Add Total Row
    exportData.push({
      'Pecahan': 'TOTAL KEBUTUHAN',
      'Lembar': 0, // Placeholder
      'Total Nominal': calculation.totalAmount
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Rincian Uang");
    XLSX.writeFile(wb, `Rincian_Uang_${filters.bulan}.xlsx`);
  };

  // --- RENDER PRINT CONTENT (PORTAL) ---
  const renderPrintContent = () => (
    <div className="p-8 font-sans text-black bg-white w-full h-full flex flex-col">
        <div className="text-center mb-6 border-b-2 border-black pb-4">
            <h1 className="text-2xl font-bold uppercase">Rincian Kebutuhan Uang</h1>
            <p className="text-sm text-gray-600 mt-1">
                {filters.perusahaan} - {filters.bulan}
            </p>
        </div>

        {/* Info Section */}
        <div className="mb-6 border border-black p-4 rounded-lg">
            <table className="w-full text-sm">
                <tbody>
                    <tr>
                        <td className="font-bold w-32 py-1">Perusahaan</td>
                        <td>: {filters.perusahaan}</td>
                        <td className="font-bold w-32 py-1">Periode</td>
                        <td>: {filters.periode}</td>
                    </tr>
                    <tr>
                        <td className="font-bold py-1">Bulan</td>
                        <td>: {filters.bulan}</td>
                        <td className="font-bold py-1">Total Karyawan</td>
                        <td>: {data.length} Orang</td>
                    </tr>
                    <tr>
                        <td className="font-bold py-1">Divisi</td>
                        <td colSpan={3}>: {filters.divisi.includes('Semua Divisi') ? 'Semua Divisi' : filters.divisi.join(', ')}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        {/* Table Section */}
        <table className="w-full text-sm border-collapse border border-black">
            <thead className="bg-gray-200">
                <tr>
                    <th className="border border-black px-4 py-2 text-right">Pecahan</th>
                    <th className="border border-black px-4 py-2 text-center">Lembar</th>
                    <th className="border border-black px-4 py-2 text-right">Total Nominal</th>
                </tr>
            </thead>
            <tbody>
                {DENOMINATIONS.map(denom => (
                <tr key={denom}>
                    <td className="border border-black px-4 py-2 text-right font-mono">
                    {formatRupiah(denom)}
                    </td>
                    <td className="border border-black px-4 py-2 text-center font-bold">
                    {calculation.counts[denom].toLocaleString()}
                    </td>
                    <td className="border border-black px-4 py-2 text-right font-medium">
                    {formatRupiah(calculation.counts[denom] * denom)}
                    </td>
                </tr>
                ))}
            </tbody>
            <tfoot className="bg-gray-100 font-bold border-t-2 border-black">
                <tr>
                <td colSpan={2} className="border border-black px-4 py-3 text-right uppercase">Total Kebutuhan (Pembulatan)</td>
                <td className="border border-black px-4 py-3 text-right text-lg">
                    {formatRupiah(calculation.totalAmount)}
                </td>
                </tr>
            </tfoot>
        </table>

        <div className="mt-4 text-xs text-gray-500 italic">
            * Dicetak pada: {new Date().toLocaleString('id-ID')}
            <br/>
            * Perhitungan menggunakan pembulatan bertahap (500/1000)
        </div>

        {/* SIGNATURE SECTION */}
        <div className="mt-16">
            <h3 className="font-bold uppercase text-sm mb-8 border-b border-black pb-1 w-full">Tanda Tangan</h3>
            <div className="flex justify-between px-8">
                <div className="text-center">
                    <p className="font-bold mb-24">Penerima Uang,</p>
                    <p className="font-bold">(_____________________________)</p>
                </div>
                <div className="text-center">
                    <p className="font-bold mb-24">Yang Menyetor Uang,</p>
                    <p className="font-bold">(_____________________________)</p>
                </div>
            </div>
        </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <>
      {/* --- MODAL UI (SCREEN) --- */}
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fadeIn print:hidden">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
          
          {/* Header */}
          <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h3 className="font-bold text-xl text-gray-900 flex items-center gap-2">
              <Banknote className="text-green-600" /> Rincian Kebutuhan Uang
            </h3>
            <div className="flex gap-2">
              <button onClick={handleExportExcel} className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Export Excel">
                  <Download size={20}/>
              </button>
              <button onClick={handlePrint} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Print">
                  <Printer size={20}/>
              </button>
              <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                  <X size={24} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto custom-scrollbar">
            
            {/* Info Card */}
            <div className="mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100">
              <h4 className="font-bold text-blue-800 mb-2 border-b border-blue-200 pb-1">Filter Data</h4>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Perusahaan:</span>
                  <span className="font-medium text-gray-900">{filters.perusahaan}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Bulan:</span>
                  <span className="font-medium text-gray-900">{filters.bulan}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Periode:</span>
                  <span className="font-medium text-gray-900">{filters.periode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Karyawan:</span>
                  <span className="font-medium text-gray-900">{data.length} Orang</span>
                </div>
                <div className="col-span-2 flex justify-between border-t border-blue-200 pt-1 mt-1">
                  <span className="text-gray-500">Divisi:</span>
                  <span className="font-medium text-gray-900 text-right truncate max-w-[200px]">
                    {filters.divisi.includes('Semua Divisi') ? 'Semua Divisi' : filters.divisi.join(', ')}
                  </span>
                </div>
              </div>
            </div>

            {/* Table */}
            <table className="w-full text-sm border-collapse border border-gray-200">
              <thead className="bg-gray-100 text-gray-700 font-bold">
                <tr>
                  <th className="border border-gray-300 px-4 py-2 text-right">Pecahan</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">Lembar</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">Total Nominal</th>
                </tr>
              </thead>
              <tbody>
                {DENOMINATIONS.map(denom => (
                  <tr key={denom} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2 text-right font-mono">
                      {formatRupiah(denom)}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-center font-bold">
                      {calculation.counts[denom].toLocaleString()}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-right font-medium text-gray-800">
                      {formatRupiah(calculation.counts[denom] * denom)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300">
                <tr>
                  <td colSpan={2} className="border border-gray-300 px-4 py-3 text-right uppercase">Total Kebutuhan (Pembulatan)</td>
                  <td className="border border-gray-300 px-4 py-3 text-right text-lg text-green-700">
                    {formatRupiah(calculation.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="mt-4 text-xs text-gray-500 italic bg-yellow-50 p-2 rounded border border-yellow-100">
              <strong>Catatan:</strong> Perhitungan pecahan uang menggunakan <strong>Pembulatan Bertahap (Naik ke 500 / 1000)</strong> agar sesuai dengan nominal yang dibagikan.
            </div>
          </div>
        </div>
      </div>

      {/* --- PRINT PORTAL (A4) --- */}
      {isPrinting && createPortal(
        <div className="print-portal bg-white absolute top-0 left-0 w-full min-h-screen z-[9999]">
            {renderPrintContent()}
        </div>,
        document.body
      )}

      {/* --- PRINT STYLES --- */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { background-color: white; }
          #root { display: none !important; } /* Hide Main App */
          .print-portal { display: block !important; } /* Show Portal */
          
          /* Ensure text is black */
          * {
            color: black !important;
            text-shadow: none !important;
          }
        }
      `}</style>
    </>
  );
};
