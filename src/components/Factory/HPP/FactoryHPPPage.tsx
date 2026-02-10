import React, { useState } from 'react';
import { Scissors, Layers, Package, Calculator, Construction } from 'lucide-react';
import { ErrorBoundary } from '../../Common/ErrorBoundary';
import { BiayaNonJahit } from './BiayaNonJahit'; // Import Component Baru

// Placeholder Component for Empty Tabs
const PlaceholderContent = ({ title, icon: Icon }: { title: string, icon: any }) => (
  <div className="flex flex-col items-center justify-center h-96 bg-white rounded-xl border border-dashed border-gray-300 text-gray-400 animate-fadeIn">
    <div className="p-4 bg-gray-50 rounded-full mb-3">
        <Icon size={32} className="text-gray-300"/>
    </div>
    <p className="text-lg font-medium mb-1 text-gray-600">{title}</p>
    <p className="text-sm">Modul ini sedang dalam pengembangan.</p>
  </div>
);

export const FactoryHPPPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('non-jahit');

  const tabs = [
    { id: 'non-jahit', label: 'Biaya Non Jahit', icon: Scissors },
    { id: 'jahit', label: 'Biaya Jahit', icon: Layers }, 
    { id: 'lainnya', label: 'Biaya Lainnya', icon: Package },
    { id: 'hpp', label: 'HPP', icon: Calculator },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'non-jahit': 
        return <BiayaNonJahit />; // Render Real Component
      case 'jahit': 
        return <PlaceholderContent title="Biaya Jahit (Sewing Lines)" icon={Layers} />;
      case 'lainnya': 
        return <PlaceholderContent title="Biaya Lainnya (Finishing, Packing, dll)" icon={Package} />;
      case 'hpp': 
        return <PlaceholderContent title="Rekapitulasi HPP" icon={Calculator} />;
      default: 
        return <BiayaNonJahit />;
    }
  };

  return (
    <div className="p-6 space-y-6 bg-erp-bg min-h-full relative font-sans">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-erp-pink mb-2 flex items-center gap-2">
          <Calculator className="text-erp-pink" /> HPP Pabrik Garut
        </h1>
        <p className="text-gray-600 text-sm">Analisis Harga Pokok Produksi per proses (Cutting, Sewing, Finishing)</p>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-200 inline-flex w-full md:w-auto overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
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
      <div className="min-h-[500px]">
        <ErrorBoundary title="Modul HPP">
          {renderContent()}
        </ErrorBoundary>
      </div>
    </div>
  );
};
