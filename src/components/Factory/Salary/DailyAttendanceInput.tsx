import React, { useState } from 'react';
import { Users, Building2 } from 'lucide-react';
import { AdnanHananAttendanceInput } from './AdnanHananAttendanceInput';
import { BoronganAttendanceInput } from './BoronganAttendanceInput';

export const DailyAttendanceInput: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'borongan' | 'adnan-hanan'>('borongan');

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-200 w-fit">
        <button
          onClick={() => setActiveSubTab('borongan')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeSubTab === 'borongan'
              ? 'bg-erp-pink text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Users size={16} />
          Borongan
        </button>
        <button
          onClick={() => setActiveSubTab('adnan-hanan')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeSubTab === 'adnan-hanan'
              ? 'bg-erp-pink text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Building2 size={16} />
          CV Adnan & Hanan
        </button>
      </div>

      {/* Content Area */}
      <div className="animate-fadeIn">
        {activeSubTab === 'borongan' && (
            <BoronganAttendanceInput />
        )}

        {activeSubTab === 'adnan-hanan' && (
            <AdnanHananAttendanceInput />
        )}
      </div>
    </div>
  );
};
