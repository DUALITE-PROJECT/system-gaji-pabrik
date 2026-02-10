import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './components/Auth/Login';
import { Sidebar } from './components/Layout/Sidebar';
import { Header } from './components/Layout/Header';
import { Dashboard } from './components/Dashboard/Dashboard';
import { GarutDashboard } from './components/Garut/GarutDashboard';
import { Settings } from './components/Settings/Settings';
import { WholesaleSalary } from './components/Factory/Salary/WholesaleSalary';
import { StaffSalaryPage } from './components/Factory/Salary/StaffSalaryPage';
import { AdminSalaryPage } from './components/Factory/Salary/AdminSalaryPage'; 
import { DailySalaryPage } from './components/Factory/Salary/DailySalaryPage'; 
import { UserManagement } from './components/Settings/UserManagement';
import { GarutAttendancePage } from './components/Garut/Attendance/GarutAttendancePage';
import { Construction, Loader2 } from 'lucide-react';
import { SalaryPage } from './components/Factory/Salary/SalaryPage';
import { OutputPage } from './components/Factory/Output/OutputPage';
import { FactoryHPPPage } from './components/Factory/HPP/FactoryHPPPage'; // Import New Component

// ... (Placeholder Components tetap sama) ...
const FactoryPlaceholder: React.FC<{ title: string, subtitle: string }> = ({ title, subtitle }) => (
  <div className="p-8 h-full bg-erp-bg flex flex-col items-center justify-center">
    <div className="bg-white dark:bg-dark-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-dark-600 text-center max-w-md w-full">
      <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
        <Construction size={32} />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{title}</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-6">{subtitle}</p>
      <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-700 rounded-lg text-sm text-gray-600 dark:text-gray-300">
        <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
        Sedang dalam pengembangan
      </div>
    </div>
  </div>
);

const PlaceholderView: React.FC<{ title: string }> = ({ title }) => (
  <div className="p-8 flex flex-col items-center justify-center h-full text-center">
    <div className="bg-white dark:bg-dark-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-dark-600 max-w-md">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{title}</h2>
      <p className="text-gray-500 dark:text-gray-400">Modul ini sedang dalam pengembangan.</p>
    </div>
  </div>
);

// Komponen Utama yang dibungkus Auth
const MainApp: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [activeView, setActiveView] = useState('dashboard'); 
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Jika masih loading cek sesi
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-erp-pink" size={40} />
      </div>
    );
  }

  // Jika belum login, tampilkan halaman Login
  if (!user) {
    return <Login />;
  }

  const currentUser = {
    name: user.full_name || 'User',
    avatar: 'https://ui-avatars.com/api/?name=' + (user.full_name || 'User') + '&background=E91E63&color=fff',
    role: user.role
  };

  const renderContent = () => {
    // Handle Factory Garut Submenus (NEW)
    if (activeView.startsWith('pabrik-garut-')) {
      switch (activeView) {
        case 'pabrik-garut-absensi': return <GarutAttendancePage />;
        case 'pabrik-garut-gaji': return <SalaryPage isGarut={true} />; 
        case 'pabrik-garut-output': return <OutputPage />;
        case 'pabrik-garut-gaji-borongan': return <WholesaleSalary isGarut={true} />; 
        case 'pabrik-garut-gaji-admin': return <AdminSalaryPage />; 
        case 'pabrik-garut-gaji-staff': return <StaffSalaryPage />;
        case 'pabrik-garut-gaji-harian': return <DailySalaryPage />; 
        case 'pabrik-garut-hpp': return <FactoryHPPPage />; // Updated Route
        case 'pabrik-garut-hpp-harian': return <FactoryPlaceholder title="HPP Harian Garut" subtitle="Tracking HPP per hari Garut" />;
        case 'pabrik-garut-stok-aksesoris': return <FactoryPlaceholder title="Stok Aksesoris Garut" subtitle="Inventory material produksi Garut" />;
        case 'pabrik-garut-stok-keperluan': return <FactoryPlaceholder title="Stok Keperluan Garut" subtitle="Barang operasional pendukung Garut" />;
        default: return <PlaceholderView title="Modul Pabrik Garut" />;
      }
    }

    // ROUTING PABRIK LAMA DIHAPUS

    switch (activeView) {
      case 'dashboard': return <PlaceholderView title="Dashboard Utama" />;
      case 'gudang': return <Dashboard userPermissions={user.permissions} userRole={user.role} />;
      case 'gudang-garut': return <GarutDashboard />;
      case 'pabrik-garut': return <PlaceholderView title="Pilih Sub-menu Pabrik Garut" />;
      case 'pembelanjaan': return <PlaceholderView title="Pembelanjaan" />;
      case 'ez-pickup': return <PlaceholderView title="EZ Pickup" />;
      case 'marketing': return <PlaceholderView title="Marketing" />;
      case 'settings': return <Settings />;
      case 'users': return <UserManagement />;
      default: return <Dashboard userPermissions={user.permissions} userRole={user.role} />;
    }
  };

  return (
    <div className="h-screen h-[100dvh] bg-erp-bg dark:bg-dark-950 flex overflow-hidden font-sans text-gray-900">
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      <div className={`${isMobileMenuOpen ? 'fixed inset-y-0 left-0 w-[260px]' : 'hidden'} lg:relative lg:block z-50 lg:z-0 h-full shadow-xl lg:shadow-none`}>
        <Sidebar
          activeView={activeView}
          onViewChange={(view) => {
            setActiveView(view);
            if ((!view.startsWith('pabrik-garut')) || view.includes('-')) {
                setIsMobileMenuOpen(false);
            }
          }}
          isExpanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded(!sidebarExpanded)}
          userPermissions={user.permissions} 
          userRole={user.role} 
        />
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden relative w-full">
        <Header
          onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          currentUser={currentUser}
        />
        
        <main className="flex-1 overflow-y-auto bg-erp-bg w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
