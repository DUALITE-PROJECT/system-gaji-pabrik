import React, { useState } from 'react';
import { TrendingUp, PenTool, Wrench, Activity, DollarSign } from 'lucide-react';
import { DailyOutput } from './DailyOutput';
import { ProductionInput } from './ProductionInput';
import { MaintenanceProduction } from './MaintenanceProduction';
import { BiayaOutput } from './BiayaOutput'; // Import New Component
import { ErrorBoundary } from '../../Common/ErrorBoundary';

export const OutputPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('output-harian'); 

  const tabs = [
    { id: 'output-harian', label: 'Output Per Hari', icon: TrendingUp }, 
    { id: 'input-produksi', label: 'Input Data Produksi', icon: PenTool },
    { id: 'kapasitas', label: 'Kapasitas Jahit', icon: Activity },
    { id: 'maintenance', label: 'Maintenance Produksi', icon: Wrench }, 
    { id: 'biaya', label: 'Biaya Output', icon: DollarSign }, // New Tab
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'output-harian':
        return <DailyOutput />;
      case 'input-produksi':
        return <ProductionInput />;
      case 'maintenance':
        return <MaintenanceProduction />;
      case 'biaya':
        return <BiayaOutput />; // Render BiayaOutput
      case 'kapasitas':
        return (
          <div className="flex flex-col items-center justify-center h-96 bg-white rounded-xl border border-dashed border-gray-300 text-gray-400">
            <p className="text-lg font-medium mb-2">Modul {tabs.find(t => t.id === activeTab)?.label}</p>
            <p className="text-sm">Sedang dalam pengembangan.</p>
          </div>
        );
      default:
        return <DailyOutput />;
    }
  };

  return (
    <div className="p-6 space-y-6 bg-erp-bg min-h-full relative font-sans">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-erp-pink mb-2">Output Pabrik</h1>
        <p className="text-gray-600 text-sm">Monitor dan input data hasil produksi</p>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-200 inline-flex w-full overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all flex items-center justify-center gap-2 rounded-lg ${
                isActive 
                  ? 'bg-gray-100 text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon size={16} className={isActive ? 'text-erp-pink' : 'text-gray-400'}/>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="min-h-[500px] animate-fadeIn">
        <ErrorBoundary title="Modul Output">
          {renderContent()}
        </ErrorBoundary>
      </div>
    </div>
  );
};
