import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  Warehouse, 
  Factory, 
  ShoppingCart, 
  Package, 
  Megaphone, 
  Settings, 
  Users, 
  ChevronRight,
  ChevronLeft,
  Building2,
  Clock,       
  Wallet,      
  TrendingUp,  
  Calculator,  
  FileText,    
  Box
} from 'lucide-react';

interface SubMenuItem {
  id: string;
  label: string;
  icon: any;
}

interface MenuItem {
  id: string;
  label: string;
  icon: any;
  color?: string;
  hasSubmenu?: boolean;
  subItems?: SubMenuItem[];
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
  userPermissions: string[]; 
  userRole: string;          
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeView, 
  onViewChange, 
  isExpanded, 
  onToggle,
  userPermissions = [],
  userRole = 'Staff'
}) => {
  // Hapus 'pabrik' dari default expanded menus
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['pabrik-garut']);

  const toggleMenu = (id: string) => {
    setExpandedMenus(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Helper untuk cek akses
  const hasAccess = (id: string) => {
    if (userRole === 'Admin') return true; // Admin akses semua
    return userPermissions.includes(id);
  };

  const menuGroups: MenuGroup[] = [
    {
      title: 'Modul Utama',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'text-erp-pink' },
        { id: 'gudang', label: 'Gudang', icon: Warehouse, color: 'text-erp-pink' },
        { id: 'gudang-garut', label: 'Gudang Garut', icon: Building2, color: 'text-erp-pink' },
        
        // --- MENU PABRIK GARUT (BARU) ---
        { 
          id: 'pabrik-garut', 
          label: 'Pabrik Garut', 
          icon: Factory, 
          hasSubmenu: true, 
          color: 'text-gray-600',
          subItems: [
            { id: 'pabrik-garut-absensi', label: 'Absensi', icon: Clock },
            { id: 'pabrik-garut-gaji', label: 'Gaji', icon: Wallet },
            { id: 'pabrik-garut-gaji-borongan', label: 'Gaji Borongan', icon: Wallet },
            { id: 'pabrik-garut-gaji-admin', label: 'Gaji Admin', icon: Wallet },
            { id: 'pabrik-garut-gaji-staff', label: 'Gaji Staff', icon: Wallet },
            { id: 'pabrik-garut-gaji-harian', label: 'Gaji Harian', icon: Wallet }, // Added Gaji Harian
            { id: 'pabrik-garut-output', label: 'Output', icon: TrendingUp },
            { id: 'pabrik-garut-hpp', label: 'HPP Pabrik', icon: Calculator },
            { id: 'pabrik-garut-hpp-harian', label: 'HPP Harian', icon: Calculator },
            { id: 'pabrik-garut-stok-aksesoris', label: 'Stok Aksesoris & BB', icon: Box },
            { id: 'pabrik-garut-stok-keperluan', label: 'Stok Keperluan Pabrik', icon: FileText },
          ]
        },

        // --- MENU PABRIK LAMA DIHAPUS ---
        
        { id: 'pembelanjaan', label: 'Pembelanjaan', icon: ShoppingCart, color: 'text-erp-pink' },
        { id: 'ez-pickup', label: 'EZ Pickup', icon: Package, color: 'text-erp-pink' },
      ]
    },
    {
      title: 'Marketing',
      items: [
        { id: 'marketing', label: 'Marketing', icon: Megaphone, hasSubmenu: true, color: 'text-gray-600' },
      ]
    },
    {
      title: 'Sistem',
      items: [
        { id: 'settings', label: 'Pengaturan', icon: Settings, color: 'text-erp-pink' },
        { id: 'users', label: 'Manajemen Pengguna', icon: Users, color: 'text-erp-pink' },
      ]
    }
  ];

  return (
    <motion.div 
      initial={false}
      animate={{ width: isExpanded ? 260 : 80 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="bg-white dark:bg-dark-800 border-r border-gray-200 dark:border-dark-600 h-full flex flex-col shadow-sm z-20 relative"
    >
      {/* Header Logo */}
      <div className="p-6 border-b border-gray-100 dark:border-dark-600">
        <div className="flex items-center justify-between overflow-hidden">
          <motion.div 
            animate={{ opacity: isExpanded ? 1 : 0 }}
            transition={{ duration: 0.2 }}
            className="whitespace-nowrap"
          >
            <h1 className="text-xl font-bold text-erp-pink">ERP System</h1>
            <p className="text-xs text-gray-500">Platform Terintegrasi</p>
          </motion.div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 custom-scrollbar">
        {menuGroups.map((group, groupIndex) => {
          // Filter items berdasarkan permission
          const filteredItems = group.items.filter(item => hasAccess(item.id));
          
          if (filteredItems.length === 0) return null;

          return (
            <div key={groupIndex}>
              {isExpanded && (
                <h3 className="px-3 mb-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  {group.title}
                </h3>
              )}
              <div className="space-y-1">
                {filteredItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.id || (item.subItems && item.subItems.some(sub => sub.id === activeView));
                  const isMenuExpanded = expandedMenus.includes(item.id);
                  
                  // Filter sub-items juga
                  const filteredSubItems = item.subItems?.filter(sub => hasAccess(sub.id));
                  
                  return (
                    <div key={item.id}>
                      <button
                        onClick={() => {
                          if (item.hasSubmenu) {
                            toggleMenu(item.id);
                          } else {
                            onViewChange(item.id);
                          }
                        }}
                        className={`w-full flex items-center justify-between p-3 rounded-lg transition-all duration-200 group ${
                          isActive && !item.hasSubmenu
                            ? 'bg-erp-pink-light text-erp-pink' 
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-700'
                        }`}
                      >
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <Icon 
                            size={20} 
                            className={`${isActive ? 'text-erp-pink' : item.color} min-w-[20px]`} 
                          />
                          {isExpanded && (
                            <span className={`font-medium text-sm whitespace-nowrap ${isActive ? 'text-erp-pink' : 'text-gray-700 dark:text-gray-300'}`}>
                              {item.label}
                            </span>
                          )}
                        </div>
                        
                        {isExpanded && item.hasSubmenu && (
                          <ChevronRight 
                            size={16} 
                            className={`text-gray-400 transition-transform duration-200 ${isMenuExpanded ? 'rotate-90' : ''}`} 
                          />
                        )}
                      </button>

                      {/* SUBMENU RENDERING */}
                      {isExpanded && item.hasSubmenu && isMenuExpanded && filteredSubItems && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="ml-4 pl-3 border-l border-gray-200 dark:border-dark-600 space-y-1 mt-1"
                        >
                          {filteredSubItems.map((subItem) => {
                            const SubIcon = subItem.icon;
                            const isSubActive = activeView === subItem.id;
                            
                            return (
                              <button
                                key={subItem.id}
                                onClick={() => onViewChange(subItem.id)}
                                className={`w-full flex items-center space-x-3 p-2 rounded-lg text-sm transition-colors ${
                                  isSubActive
                                    ? 'text-erp-pink bg-pink-50 dark:bg-pink-900/10 font-medium'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-700'
                                }`}
                              >
                                <SubIcon size={16} className={isSubActive ? 'text-erp-pink' : 'text-gray-400'} />
                                <span className="truncate">{subItem.label}</span>
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Collapse Toggle at Bottom */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-10 bg-white border border-gray-200 rounded-full p-1 shadow-md hover:bg-gray-50 z-50 hidden lg:block"
      >
         <motion.div
            animate={{ rotate: isExpanded ? 0 : 180 }}
            transition={{ duration: 0.3 }}
          >
            <ChevronLeft size={14} className="text-gray-500" />
          </motion.div>
      </button>
    </motion.div>
  );
};
