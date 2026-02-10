import React, { useState } from 'react';
import { Users, CalendarCheck, FileBarChart, Clock } from 'lucide-react';
import { GarutEmployeeData } from './GarutEmployeeData';
import { GarutDailyAttendance } from './GarutDailyAttendance';
import { GarutAttendanceReport } from './GarutAttendanceReport'; // Updated Import
import { ErrorBoundary } from '../../Common/ErrorBoundary';

export const GarutAttendancePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'karyawan' | 'harian' | 'laporan'>('karyawan');

  const tabs = [
    { id: 'karyawan', label: 'Data Karyawan', icon: Users },
    { id: 'harian', label: 'Presensi Harian', icon: CalendarCheck },
    { id: 'laporan', label: 'Laporan Bulanan', icon: FileBarChart },
  ];

  return (
    <div className="p-6 space-y-6 bg-erp-bg min-h-full relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-erp-pink mb-2 flex items-center gap-2">
            <Clock className="text-erp-pink" /> Absensi Pabrik Garut
          </h1>
          <p className="text-gray-600 text-sm md:text-lg">Kelola data karyawan dan absensi khusus cabang Garut</p>
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

      {/* Content Area with Error Boundary */}
      <div className="min-h-[500px] animate-fadeIn">
        <ErrorBoundary title="Modul Absensi Garut">
          {activeTab === 'karyawan' && <GarutEmployeeData />}
          {activeTab === 'harian' && <GarutDailyAttendance />}
          {activeTab === 'laporan' && <GarutAttendanceReport />}
        </ErrorBoundary>
      </div>
    </div>
  );
};
