import React, { useState } from 'react';
import { 
  List, PenTool, ClipboardList
} from 'lucide-react';
import { StaffDailyAttendanceInput } from './StaffDailyAttendanceInput';
import { StaffDailyAttendanceList } from './StaffDailyAttendanceList';

export const StaffDailyAttendance: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'input' | 'hasil'>('input');

  return (
    <div className="space-y-6 h-full flex flex-col font-sans">
      
      {/* --- SUB-TAB NAVIGATION (PILL STYLE) --- */}
      <div className="flex items-center justify-between">
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveSubTab('input')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeSubTab === 'input' 
                ? 'bg-white text-erp-pink shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <PenTool size={16} /> Input
          </button>
          <button
            onClick={() => setActiveSubTab('hasil')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeSubTab === 'hasil' 
                ? 'bg-white text-erp-pink shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <List size={16} /> Hasil Input
          </button>
        </div>
      </div>

      {/* --- CONTENT AREA --- */}
      <div className="flex-1 min-h-0 animate-fadeIn">
        {activeSubTab === 'input' && <StaffDailyAttendanceInput />}
        {activeSubTab === 'hasil' && <StaffDailyAttendanceList />}
      </div>
    </div>
  );
};
