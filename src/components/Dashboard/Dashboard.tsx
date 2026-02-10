import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Truck, 
  Warehouse, 
  LayoutGrid, 
  BarChart3,
  Settings,
  RefreshCw,
  FileText,
  ClipboardCheck,
  PackageCheck,
  FileBarChart // Icon for Rekap
} from 'lucide-react';

// Import Sub-components
import { WarehouseOverview } from '../Warehouse/WarehouseOverview';
import { MasterSKU } from '../Warehouse/MasterSKU';
import { ShipmentList } from '../Warehouse/ShipmentList';
import { FactoryOutbound } from '../Warehouse/FactoryOutbound'; 
import { InboundFactory } from '../Warehouse/InboundFactory';
import { StockList } from '../Warehouse/StockList';
import { StockOpname } from '../Warehouse/StockOpname';
import { Reports } from '../Warehouse/Reports';
import { Recap } from '../Warehouse/Recap';
import { OutboundPage } from '../Warehouse/OutboundPage';
import { ReturnPage } from '../Warehouse/ReturnPage';

interface DashboardProps {
  userPermissions?: string[];
  userRole?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  userPermissions = [], 
  userRole = 'Staff' 
}) => {
  // ID Tab disesuaikan dengan ID di UserManagement.tsx agar permission connect
  const allTabs = [
    { id: 'gudang-dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'gudang-outbound-pabrik', label: 'Outbound Pabrik', icon: Box }, 
    { id: 'gudang-inbound', label: 'Inbound Gudang', icon: ShoppingCartIcon },
    { id: 'gudang-stok', label: 'Stok Gudang', icon: Warehouse },
    { id: 'gudang-rak', label: 'Stok Rak', icon: LayoutGrid },
    { id: 'gudang-outbound', label: 'Outbound', icon: Truck },
    { id: 'gudang-retur', label: 'Retur', icon: RefreshCw },
    { id: 'gudang-rekap', label: 'Rekap', icon: FileBarChart }, // Added Rekap Tab
    { id: 'gudang-laporan', label: 'Laporan', icon: FileText }, 
    { id: 'gudang-opname', label: 'Stock Opname', icon: PackageCheck },
    { id: 'gudang-master', label: 'Master SKU', icon: Settings },
  ];

  // Filter Tab Berdasarkan Permission
  const allowedTabs = allTabs.filter(tab => {
    if (userRole === 'Admin') return true; // Admin lihat semua
    return userPermissions.includes(tab.id);
  });

  // Set tab aktif pertama kali ke tab pertama yang diizinkan
  const [activeTab, setActiveTab] = useState(allowedTabs.length > 0 ? allowedTabs[0].id : '');

  // Update activeTab jika permission berubah
  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.find(t => t.id === activeTab)) {
      setActiveTab(allowedTabs[0].id);
    }
  }, [userPermissions, userRole]);

  function ShoppingCartIcon(props: any) {
    return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'gudang-dashboard': return <WarehouseOverview />;
      case 'gudang-master': return <MasterSKU />;
      case 'gudang-outbound-pabrik': return <FactoryOutbound />;
      case 'gudang-inbound': return <InboundFactory />;
      case 'gudang-outbound': return <OutboundPage />;
      case 'gudang-retur': return <ReturnPage />;
      case 'gudang-stok': return <StockList locationType="gudang" title="Stok Gudang Utama" />;
      case 'gudang-rak': return <StockList locationType="rak" title="Stok Rak & Display" />;
      case 'gudang-rekap': return <Recap />; // Render Recap Component
      case 'gudang-opname': return <StockOpname />;
      case 'gudang-laporan': return <Reports />; 
      default: return (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
          <p>Anda tidak memiliki akses ke modul ini.</p>
        </div>
      );
    }
  };

  if (allowedTabs.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <h2 className="text-xl font-bold mb-2">Akses Ditolak</h2>
        <p>Akun Anda tidak memiliki izin untuk mengakses menu Gudang manapun.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-erp-bg min-h-full w-full">
      {/* Header Section */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-erp-blue-900 mb-2">Modul Gudang</h1>
        <p className="text-gray-600 text-sm md:text-lg">Kelola seluruh alur barang dari pabrik hingga outbound</p>
      </div>

      {/* Navigation Tabs (Hanya Tampilkan yang Diizinkan) */}
      <div className="bg-erp-blue-50 p-2 rounded-xl flex flex-nowrap gap-2 overflow-x-auto pb-4 md:pb-2 scrollbar-hide">
        {allowedTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex flex-col items-center justify-center px-4 py-3 rounded-lg transition-all duration-200 min-w-[100px] flex-shrink-0
                ${isActive 
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-100' 
                  : 'text-gray-500 hover:bg-white/50 hover:text-gray-700'}
              `}
            >
              <Icon size={20} className={`mb-2 ${isActive ? 'text-erp-pink' : 'text-gray-400'}`} />
              <span className="text-xs font-medium text-center leading-tight whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Dynamic Content */}
      <div className="min-h-[500px] w-full overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
};
