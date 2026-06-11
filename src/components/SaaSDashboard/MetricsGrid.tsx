import React, { useEffect, useState } from 'react';
import { saasService } from '../../services/saasService';
import type { SaaSMetrics } from '../../services/saasService';

interface MetricsGridProps {
  refreshTrigger: number;
}

export const MetricsGrid: React.FC<MetricsGridProps> = ({ refreshTrigger }) => {
  const [metrics, setMetrics] = useState<SaaSMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await saasService.getMetrics();
      setMetrics(data);
    } catch (err) {
      setError('Error al cargar métricas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [refreshTrigger]);

  const renderTrendSVG = (trend: number[]) => {
    if (!trend || trend.length < 2) return null;
    const width = 300;
    const height = 64;
    const maxVal = Math.max(...trend);
    const minVal = Math.min(...trend);
    const range = maxVal - minVal || 1;
    
    const points = trend
      .map((val, idx) => {
        const x = (idx / (trend.length - 1)) * width;
        const y = height - ((val - minVal) / range) * (height - 8) - 4;
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke="#d51f2c"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter animate-pulse">
        {/* Skeleton Total Merchants */}
        <div className="bg-white border border-[#e8e2d8] p-lg h-36 flex flex-col justify-between">
          <div>
            <div className="h-4 bg-zinc-200 rounded w-28"></div>
            <div className="h-8 bg-zinc-200 rounded w-20 mt-3"></div>
          </div>
          <div className="h-10 bg-zinc-200/50 rounded w-full mt-4"></div>
        </div>
        {/* Skeletons para las otras tres tarjetas */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white border border-[#e8e2d8] p-lg h-36 flex flex-col justify-between">
            <div>
              <div className="h-4 bg-zinc-200 rounded w-24"></div>
              <div className="h-8 bg-zinc-200 rounded w-16 mt-3"></div>
            </div>
            <div className="h-4 bg-zinc-200 rounded w-32 mt-4"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter">
        {[
          { label: 'Total Merchants', icon: 'store' },
          { label: 'Quick Service', icon: 'fastfood' },
          { label: 'Full Restaurant', icon: 'restaurant' },
          { label: 'Enterprise', icon: 'domain' },
        ].map((item, idx) => (
          <div
            key={idx}
            className="bg-white border border-red-200 p-lg flex flex-col justify-between relative overflow-hidden h-36"
          >
            <div>
              <span className="text-label-caps text-red-500 font-bold uppercase">{item.label}</span>
              <p className="text-body-sm text-red-600 font-medium mt-2 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">error</span>
                Error de conexión
              </p>
            </div>
            <button
              onClick={fetchMetrics}
              className="mt-auto self-start text-[11px] font-bold text-[#d51f2c] uppercase hover:underline flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">refresh</span> Reintentar
            </button>
            <div className="absolute -right-2 -bottom-2 opacity-5">
              <span className="material-symbols-outlined text-[80px]">{item.icon}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter">
      {/* Total Merchants Card */}
      <div className="bg-white border border-[#e8e2d8] p-lg flex flex-col justify-between min-h-[144px]">
        <div>
          <span className="text-label-caps text-[#666666]">Total Merchants</span>
          <div className="flex items-center gap-2 mt-2">
            <h2 className="text-h1 font-black text-[#222222]">
              {metrics.totalMerchants.value.toLocaleString()}
            </h2>
            <span className="text-[#10b981] text-xs font-bold bg-[#10b981]/10 px-1.5 py-0.5 rounded">
              +{metrics.totalMerchants.growth}%
            </span>
          </div>
        </div>
        <div className="mt-2 h-10 w-full opacity-80">
          {renderTrendSVG(metrics.totalMerchants.trend)}
        </div>
      </div>

      {/* Quick Service Card */}
      <div className="bg-white border border-[#e8e2d8] p-lg relative overflow-hidden min-h-[144px] flex flex-col justify-between">
        <div>
          <span className="text-label-caps text-[#666666]">Quick Service</span>
          <h2 className="text-h2 font-black text-[#222222] mt-2">
            {metrics.quickService.count.toLocaleString()}
          </h2>
        </div>
        <p className="text-body-sm text-[#666666] mt-auto">
          Active Terminals: {metrics.quickService.terminals.toLocaleString()}
        </p>
        <div className="absolute -right-2 -bottom-2 opacity-5 pointer-events-none">
          <span className="material-symbols-outlined text-[80px]">fastfood</span>
        </div>
      </div>

      {/* Full Restaurant Card */}
      <div className="bg-[#222222] border border-[#222222] p-lg relative overflow-hidden min-h-[144px] flex flex-col justify-between">
        <div>
          <span className="text-label-caps text-white/60">Full Restaurant</span>
          <h2 className="text-h2 font-black text-white mt-2">
            {metrics.fullRestaurant.count.toLocaleString()}
          </h2>
        </div>
        <p className="text-body-sm text-white/50 mt-auto">
          Active Terminals: {metrics.fullRestaurant.terminals.toLocaleString()}
        </p>
        <div className="absolute -right-2 -bottom-2 opacity-10 pointer-events-none">
          <span className="material-symbols-outlined text-[80px] text-white">restaurant</span>
        </div>
      </div>

      {/* Enterprise Card */}
      <div className="bg-[#d51f2c] border border-[#d51f2c] p-lg relative overflow-hidden min-h-[144px] flex flex-col justify-between">
        <div>
          <span className="text-label-caps text-white/60">Enterprise</span>
          <h2 className="text-h2 font-black text-white mt-2">
            {metrics.enterprise.count.toLocaleString()}
          </h2>
        </div>
        <p className="text-body-sm text-white/50 mt-auto">
          Active Terminals: {metrics.enterprise.terminals.toLocaleString()}
        </p>
        <div className="absolute -right-2 -bottom-2 opacity-20 pointer-events-none">
          <span className="material-symbols-outlined text-[80px] text-white">domain</span>
        </div>
      </div>
    </div>
  );
};
