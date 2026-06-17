import React, { useEffect, useState } from 'react';
import { restaurantService } from '../../services/restaurantService';
import type { SalesData } from '../../services/restaurantService';

interface SalesMetricCardProps {
  refreshTrigger: number;
}

export const SalesMetricCard: React.FC<SalesMetricCardProps> = ({ refreshTrigger }) => {
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<{ hour: string; sales: number } | null>(null);

  const fetchSales = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await restaurantService.getDailySales();
      setSalesData(data);
    } catch (err) {
      setError('Error al obtener ventas diarias');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="col-span-12 lg:col-span-8 bg-white border border-[#e8e2d8] p-6 h-64 animate-pulse flex flex-col justify-between">
        <div>
          <div className="h-4 bg-zinc-200 rounded w-36"></div>
          <div className="h-8 bg-zinc-200 rounded w-44 mt-3"></div>
          <div className="h-4 bg-zinc-200 rounded w-24 mt-2"></div>
        </div>
        <div className="h-24 w-full bg-zinc-100 rounded mt-4"></div>
      </div>
    );
  }

  if (error || !salesData) {
    return (
      <div className="col-span-12 lg:col-span-8 bg-white border border-red-200 p-6 h-64 flex flex-col justify-between relative overflow-hidden">
        <div>
          <span className="text-label-caps text-red-500 font-bold uppercase">TOTAL DAILY SALES</span>
          <p className="text-body-sm text-red-600 font-medium mt-4 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">error</span>
            Error de conexión de ventas
          </p>
        </div>
        <button
          onClick={fetchSales}
          className="self-start text-[11px] font-bold text-[#d51f2c] uppercase hover:underline flex items-center gap-1 mt-4"
        >
          <span className="material-symbols-outlined text-xs">refresh</span> Reintentar
        </button>
        <div className="absolute -right-2 -bottom-2 opacity-5 pointer-events-none">
          <span className="material-symbols-outlined text-[80px]">trending_up</span>
        </div>
      </div>
    );
  }

  // Encontrar el valor máximo para calcular las alturas porcentuales
  const maxSales = Math.max(...salesData.hourlyData.map((d) => d.sales)) || 1;

  return (
    <div className="col-span-12 lg:col-span-8 bg-white border border-[#e8e2d8] p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 opacity-5 pointer-events-none">
        <img
          className="w-full h-full object-cover"
          alt="Abstract geometric patterns"
          src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&h=150&fit=crop&q=80"
        />
      </div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <p className="font-label-caps text-label-caps text-secondary mb-1">TOTAL DAILY SALES</p>
          <h3 className="font-h1 text-h1 text-[#222222]">{salesData.totalSales}</h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="flex items-center text-emerald-600 font-bold text-sm">
              <span className="material-symbols-outlined text-sm">arrow_upward</span>
              {salesData.variance}
            </span>
            <span className="text-secondary text-xs">vs yesterday</span>
          </div>
        </div>
        <div className="bg-[#f1ece4] p-2 rounded">
          <span className="material-symbols-outlined text-[#222222]">trending_up</span>
        </div>
      </div>

      {/* Mini Graph Hourly */}
      <div className="relative">
        {hoveredBar && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#222222] text-white text-[11px] font-bold py-1 px-2.5 rounded shadow-lg z-10 transition-all">
            {hoveredBar.hour}: ${hoveredBar.sales}
          </div>
        )}
        <div className="h-24 w-full flex items-end gap-2 pt-4">
          {salesData.hourlyData.map((data, idx) => {
            const heightPercent = (data.sales / maxSales) * 100;
            const isLast = idx === salesData.hourlyData.length - 1;
            return (
              <div
                key={idx}
                onMouseEnter={() => setHoveredBar(data)}
                onMouseLeave={() => setHoveredBar(null)}
                style={{ height: `${heightPercent}%` }}
                className={`flex-1 transition-all duration-200 cursor-pointer ${
                  isLast
                    ? 'bg-[#d51f2c] hover:bg-[#b01a24]'
                    : 'bg-[#e8e2d8] hover:bg-[#d51f2c]'
                }`}
                title={`${data.hour}: $${data.sales}`}
              ></div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
