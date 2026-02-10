import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ClipboardList 
} from 'lucide-react';
import { GarutOverview } from './GarutOverview';
import { StockList } from '../Warehouse/StockList'; // Reusable component
import { ShipmentList } from '../Warehouse/ShipmentList'; // Reusable component

export const GarutDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'stok', label: 'Stok Garut', icon: Package },
    { id: 'inbound', label: 'Barang Masuk', icon: ArrowDownLeft },
    { id: 'outbound', label: 'Barang Keluar', icon: ArrowUpRight },
    { id: 'opname', label: 'Stock Opname', icon: ClipboardList },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': 
        return <GarutOverview />;
      case 'stok': 
        // Kita gunakan StockList yang sudah ada, tapi nanti perlu difilter khusus Garut
        // Untuk saat ini kita tampilkan StockList biasa, user bisa filter manual "Gudang Garut"
        return <StockList locationType="gudang" title="Stok Gudang Garut" />;
      case 'inbound':
        return <ShipmentList type="inbound" title="Inbound Gudang Garut" />;
      case 'outbound':
        return <ShipmentList type="outbound" title="Outbound Gudang Garut" />;
      default: 
        return (
          <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-dashed border-gray-300">
            <p className="text-gray-500">Modul {activeTab} untuk Garut sedang disiapkan.</p>
          </div>
        );
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 bg-erp-bg min-h-full w-full">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-erp-blue-900 mb-2">Gudang Garut</h1>
        <p className="text-gray-600 text-sm md:text-lg">Manajemen stok dan operasional cabang Garut</p>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white p-1.5 rounded-xl shadow-sm border border-gray-100 inline-flex flex-wrap gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                ${isActive 
                  ? 'bg-erp-blue-50 text-erp-blue-600 shadow-sm ring-1 ring-erp-blue-100' 
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}
              `}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="min-h-[500px]">
        {renderContent()}
      </div>
    </div>
  );
};
