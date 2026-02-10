import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Box, Truck, Warehouse, ArrowDownLeft, ArrowUpRight, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export const GarutOverview: React.FC = () => {
  const [stats, setStats] = useState({
    totalItems: 0,
    totalInbound: 0,
    totalOutbound: 0,
    lowStock: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // 1. Hitung Total Stok di Gudang Garut
        // Asumsi: lokasi_gudang di database mengandung kata 'Garut' atau spesifik 'Gudang Garut'
        const { data: stockData } = await supabase
          .from('stok_gudang')
          .select('quantity')
          .ilike('lokasi_gudang', '%Garut%'); // Filter lokasi

        const totalItems = stockData?.reduce((acc, curr) => acc + Number(curr.quantity), 0) || 0;

        // 2. Hitung Inbound (Barang Masuk ke Garut)
        // Asumsi: Ada kolom tujuan_pabrik atau kita hitung dari inbound yang tujuannya Garut
        // Untuk sementara kita ambil dummy count atau query real jika struktur mendukung
        const totalInbound = 0; // Placeholder sampai ada transaksi real ke Garut

        setStats({
          totalItems,
          totalInbound: totalInbound,
          totalOutbound: 0,
          lowStock: 0
        });

      } catch (error) {
        console.error('Error fetching Garut stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    { 
      label: 'Total Stok Fisik', 
      value: stats.totalItems.toLocaleString(), 
      subtext: 'Unit barang di Garut', 
      icon: Warehouse,
      color: 'bg-blue-50 text-blue-600'
    },
    { 
      label: 'Barang Masuk', 
      value: stats.totalInbound.toString(), 
      subtext: 'Transaksi Inbound', 
      icon: ArrowDownLeft,
      color: 'bg-green-50 text-green-600'
    },
    { 
      label: 'Barang Keluar', 
      value: stats.totalOutbound.toString(), 
      subtext: 'Transaksi Outbound', 
      icon: ArrowUpRight,
      color: 'bg-orange-50 text-orange-600'
    },
    { 
      label: 'Perlu Restock', 
      value: stats.lowStock.toString(), 
      subtext: 'SKU menipis', 
      icon: Box,
      color: 'bg-red-50 text-red-600'
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white dark:bg-dark-800 p-6 rounded-xl shadow-card border border-gray-100 dark:border-dark-600"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{stat.label}</p>
                  {isLoading ? (
                     <Loader2 className="animate-spin text-gray-400 mt-2" size={20} />
                  ) : (
                     <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</h3>
                  )}
                </div>
                <div className={`p-3 rounded-lg ${stat.color}`}>
                  <Icon size={20} />
                </div>
              </div>
              <p className="text-xs text-gray-400">{stat.subtext}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Recent Activity Placeholder */}
      <div className="bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-gray-100 dark:border-dark-600 p-6">
        <h3 className="font-bold text-gray-900 dark:text-white mb-4">Aktivitas Terbaru (Gudang Garut)</h3>
        <div className="text-center py-8 text-gray-400 italic text-sm">
          Belum ada aktivitas tercatat hari ini.
        </div>
      </div>
    </div>
  );
};
