import React from 'react';
import { PanelLeft, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface HeaderProps {
  onMenuToggle: () => void;
  currentUser: {
    name: string;
    avatar: string;
  };
}

export const Header: React.FC<HeaderProps> = ({ onMenuToggle, currentUser }) => {
  const { logout } = useAuth();

  return (
    <header className="bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-600 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <button
          onClick={onMenuToggle}
          className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors lg:hidden"
        >
          <PanelLeft size={20} className="text-gray-600 dark:text-gray-400" />
        </button>
        
        <div className="flex items-center space-x-3">
          <PanelLeft size={20} className="text-gray-800 dark:text-white hidden lg:block" />
          <h1 className="text-lg font-medium text-gray-900 dark:text-white">
            Sistem Manajemen Terintegrasi
          </h1>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-gray-900 dark:text-white">{currentUser.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Role: {currentUser.role || 'Staff'}</p>
          </div>
          <img src={currentUser.avatar} alt="Profile" className="w-9 h-9 rounded-full border border-gray-200" />
          
          <div className="h-8 w-px bg-gray-200 mx-2"></div>
          
          <button 
            onClick={logout}
            className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
            title="Keluar"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </div>
    </header>
  );
};
