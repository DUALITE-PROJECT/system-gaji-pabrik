import React, { useState } from 'react';
import { CalendarCheck, FileBarChart, FileText, Users } from 'lucide-react';
import { StaffDailyAttendance } from './StaffDailyAttendance';
import { StaffMonthlyReport } from './StaffMonthlyReport';
import { StaffSalarySlip } from './StaffSalarySlip';
import { StaffEmployeeData } from './StaffEmployeeData'; // Import component baru
import { ErrorBoundary } from '../../Common/ErrorBoundary';

export const StaffSalaryPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'karyawan' | 'harian' | 'laporan' | 'slip'>('karyawan'); // Default ke karyawan

  const tabs = [
    { id: 'karyawan', label: 'Data Karyawan', icon: Users }, // Tab Baru
    { id: 'harian', label: 'Presensi Harian', icon: CalendarCheck },
    { id: 'laporan', label: 'Laporan Bulanan', icon: FileBarChart },
    { id: 'slip', label: 'Slip Gaji Staff', icon: FileText },
  ];

  return (
    <div className="p-6 space-y-6 bg-erp-bg min-h-full relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-erp-pink mb-2 flex items-center gap-2">
            <FileText className="text-erp-pink" /> Gaji Staff
          </h1>
          <p className="text-gray-600 text-sm md:text-lg">Manajemen data, presensi, dan penggajian staff operasional</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-200 inline-flex w-full md:w-auto overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                isActive 
                  ? 'bg-gray-100 text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon size={16} className={isActive ? 'text-erp-pink' : 'text-gray-400'} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="min-h-[500px] animate-fadeIn">
        <ErrorBoundary title="Modul Gaji Staff">
          {activeTab === 'karyawan' && <StaffEmployeeData />}
          {activeTab === 'harian' && <StaffDailyAttendance />}
          {activeTab === 'laporan' && <StaffMonthlyReport />}
          {activeTab === 'slip' && <StaffSalarySlip />}
        </ErrorBoundary>
      </div>
    </div>
  );
};
