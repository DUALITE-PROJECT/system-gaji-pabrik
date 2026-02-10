import React, { useState } from 'react';
import { Wallet, Users, FileText, Database, ClipboardList, PieChart } from 'lucide-react';
import { ErrorBoundary } from '../../Common/ErrorBoundary';
import { DailyAdnanHanan } from './DailyAdnanHanan';
import { DailyAttendanceInput } from './DailyAttendanceInput';
import { DailyBorongan } from './DailyBorongan';
import { DailyRecap } from './DailyRecap'; // Import component baru

export const DailySalaryPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'input-absensi' | 'daily-adnan-hanan' | 'daily-borongan' | 'daily-recap'>('input-absensi');

  const tabs = [
    { id: 'input-absensi', label: 'Input Absensi', icon: ClipboardList },
    { id: 'daily-adnan-hanan', label: 'Gaji Harian CV Adnan & Hanan', icon: Wallet },
    { id: 'daily-borongan', label: 'Gaji Harian Borongan', icon: Users },
    { id: 'daily-recap', label: 'Rekap Gaji Harian', icon: FileText },
  ];

  return (
    <div className="p-6 space-y-6 bg-erp-bg min-h-full relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-erp-pink mb-2 flex items-center gap-2">
            <Wallet className="text-erp-pink" /> Gaji Harian (Garut)
          </h1>
          <p className="text-gray-600 text-sm md:text-lg">Manajemen penggajian harian untuk CV Adnan, Hanan, dan Borongan</p>
        </div>
      </div>

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

      <div className="min-h-[500px] animate-fadeIn">
        <ErrorBoundary title="Modul Gaji Harian">
          {activeTab === 'input-absensi' && <DailyAttendanceInput />}
          {activeTab === 'daily-adnan-hanan' && <DailyAdnanHanan />}
          {activeTab === 'daily-borongan' && <DailyBorongan />}
          {activeTab === 'daily-recap' && <DailyRecap />} 
        </ErrorBoundary>
      </div>
    </div>
  );
};
