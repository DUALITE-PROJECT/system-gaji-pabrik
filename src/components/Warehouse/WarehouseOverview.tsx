import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Box, Truck, Warehouse, LayoutGrid, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export const WarehouseOverview: React.FC = () => {
  const [stats, setStats] = useState({
    totalSku: 0,
    totalInbound: 0,
    totalOutbound: 0,
    totalStockGudang: 0,
    totalStockRak: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // 1. Count SKU (master_sku)
        const { count: skuCount } = await supabase.from('master_sku').select('*', { count: 'exact', head: true });
        
        // 2. Count Inbound (Dari Outbound Pabrik yang statusnya bukan Draft)
        // REVISI: Menggunakan 'outbound_pabrik' karena tabel 'inbound_pabrik' tidak ada
        const { count: inboundCount } = await supabase
          .from('outbound_pabrik')
          .select('*', { count: 'exact', head: true })
          .neq('status', 'Draft'); // Hanya hitung yang sudah dikirim/diterima

        // 3. Sum Stok Gudang (stok_gudang)
        const { data: stockGudangData } = await supabase.from('stok_gudang').select('quantity');
        const totalGudang = stockGudangData?.reduce((acc, curr) => acc + Number(curr.quantity), 0) || 0;

        // 4. Sum Stok Rak (stok_rak)
        const { data: stockRakData } = await supabase.from('stok_rak').select('quantity');
        const totalRak = stockRakData?.reduce((acc, curr) => acc + Number(curr.quantity), 0) || 0;

        setStats({
          totalSku: skuCount || 0,
          totalInbound: inboundCount || 0,
          totalOutbound: 0, 
          totalStockGudang: totalGudang,
          totalStockRak: totalRak
        });

      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    { label: 'Total SKU', value: stats.totalSku.toString(), subtext: 'Master data SKU aktif', icon: Box },
    { label: 'Inbound Gudang', value: stats.totalInbound.toString(), subtext: 'Total Transaksi Masuk', icon: Truck },
    { label: 'Stok Gudang', value: stats.totalStockGudang.toLocaleString(), subtext: 'Unit di Gudang Utama', icon: Warehouse },
    { label: 'Stok Rak', value: stats.totalStockRak.toLocaleString(), subtext: 'Unit di Rak Display', icon: LayoutGrid },
  ];

  return (
    <div className="space-y-6">
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
                <h3 className="text-gray-900 dark:text-white font-semibold text-sm">{stat.label}</h3>
                <Icon size={20} className="text-gray-400" />
              </div>
              <div className="space-y-1">
                {isLoading ? (
                   <Loader2 className="animate-spin text-erp-blue-600" size={24} />
                ) : (
                   <p className="text-3xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                )}
                <p className="text-sm text-gray-500">{stat.subtext}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
