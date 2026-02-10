import React, { useState } from 'react';
import { MasterSalary } from './MasterSalary';
import { SalaryAdjustment } from './SalaryAdjustment';
import { WholesaleAdjustment } from './WholesaleAdjustment'; // Import component baru
import { WholesaleRecap } from './WholesaleRecap'; 
import { SalarySlip } from './SalarySlip';
import { SalarySignatureList } from './SalarySignatureList';
import { Wallet, FileText, PieChart, Database, Users, Scissors } from 'lucide-react'; 
import { ErrorBoundary } from '../../Common/ErrorBoundary';
import { MonthlyReport } from '../Attendance/MonthlyReport';
import { GarutAttendanceReport } from '../../Garut/Attendance/GarutAttendanceReport'; 

interface SalaryPageProps {
  isGarut?: boolean; 
}

export const SalaryPage: React.FC<SalaryPageProps> = ({ isGarut = false }) => {
  const [activeTab, setActiveTab] = useState('master');

  return (
    <div className="p-6 space-y-6 bg-erp-bg min-h-full relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-erp-pink mb-2 flex items-center gap-2">
            <Wallet className="text-erp-pink" /> Manajemen Gaji {isGarut ? '(Garut)' : ''}
          </h1>
          <p className="text-gray-600 text-sm md:text-lg">Kelola penggajian, tunjangan, dan penyesuaian gaji karyawan</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-200 inline-flex w-full md:w-auto overflow-x-auto">
        <button
          onClick={() => setActiveTab('master')}
          className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'master' 
              ? 'bg-gray-100 text-gray-900 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Database size={16} /> Master Gaji
        </button>
        <button
          onClick={() => setActiveTab('penyesuaian')}
          className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'penyesuaian' 
              ? 'bg-gray-100 text-gray-900 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Users size={16} /> Data Penyesuaian Gaji
        </button>
        
        {/* NEW TAB: Data Penyesuaian Borongan */}
        <button
          onClick={() => setActiveTab('penyesuaian-borongan')}
          className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'penyesuaian-borongan' 
              ? 'bg-gray-100 text-gray-900 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Scissors size={16} /> Data Penyesuaian Borongan
        </button>
        
        <button
          onClick={() => setActiveTab('rekap-borongan')}
          className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'rekap-borongan' 
              ? 'bg-gray-100 text-gray-900 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <PieChart size={16} /> Rekap Gaji Borongan
        </button>
        <button
          onClick={() => setActiveTab('rincian')}
          className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'rincian' 
              ? 'bg-gray-100 text-gray-900 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <FileText size={16} /> Rincian Gaji
        </button>
        <button
          onClick={() => setActiveTab('slip')}
          className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'slip' 
              ? 'bg-gray-100 text-gray-900 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <FileText size={16} /> Slip Gaji
        </button>
        <button
          onClick={() => setActiveTab('tanda-tangan')}
          className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'tanda-tangan' 
              ? 'bg-gray-100 text-gray-900 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <FileText size={16} /> Tanda Tangan
        </button>
      </div>

      {/* Content Area with Error Boundary */}
      <div className="min-h-[500px] animate-fadeIn">
        <ErrorBoundary title="Modul Gaji">
          {activeTab === 'master' && <MasterSalary />}
          {activeTab === 'penyesuaian' && <SalaryAdjustment />}
          {activeTab === 'penyesuaian-borongan' && <WholesaleAdjustment />} {/* Render New Component */}
          {activeTab === 'rekap-borongan' && <WholesaleRecap isGarut={isGarut} />} 
          
          {/* CONDITIONAL RENDER UNTUK RINCIAN GAJI */}
          {activeTab === 'rincian' && (
            isGarut ? (
              <GarutAttendanceReport defaultView="gaji" hideTitle={true} />
            ) : (
              <MonthlyReport defaultView="gaji" hideTitle={true} />
            )
          )}
          
          {/* Pass isGarut prop to Slip and Signature */}
          {activeTab === 'slip' && <SalarySlip isGarut={isGarut} />} 
          {activeTab === 'tanda-tangan' && <SalarySignatureList isGarut={isGarut} />} 
        </ErrorBoundary>
      </div>
    </div>
  );
};
