import React, { useEffect, useState } from 'react';
import { restaurantService } from '../../services/restaurantService';
import type { KitchenPerformance } from '../../services/restaurantService';

interface KitchenPerformanceCardProps {
  refreshTrigger: number;
}

export const KitchenPerformanceCard: React.FC<KitchenPerformanceCardProps> = ({
  refreshTrigger,
}) => {
  const [performance, setPerformance] = useState<KitchenPerformance | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPerformance = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await restaurantService.getKitchenPerformance();
      setPerformance(data);
    } catch (err) {
      setError('Error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPerformance();
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="bg-white border border-[#e8e2d8] p-6 flex flex-col justify-between h-28 animate-pulse">
        <div className="h-4 bg-zinc-200 rounded w-36"></div>
        <div className="h-6 bg-zinc-200 rounded w-16 mt-2"></div>
        <div className="h-3 bg-zinc-100 rounded w-28 mt-2"></div>
      </div>
    );
  }

  if (error || !performance) {
    return (
      <div className="bg-white border border-red-200 p-6 flex flex-col justify-between h-28 relative overflow-hidden">
        <div className="flex justify-between">
          <p className="font-label-caps text-label-caps text-red-500 font-bold uppercase">KITCHEN PERFORMANCE</p>
          <span className="material-symbols-outlined text-red-500">speed</span>
        </div>
        <p className="text-[11px] text-red-600 font-medium">Error al cargar rendimiento</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#e8e2d8] p-6 flex flex-col justify-between">
      <div className="flex justify-between">
        <p className="font-label-caps text-label-caps text-secondary uppercase font-bold">KITCHEN PERFORMANCE</p>
        <span className="material-symbols-outlined text-[#222222]">speed</span>
      </div>
      <div className="mt-4">
        <h3 className="font-h2 text-h2 text-[#222222]">
          {performance.prepRate}%
        </h3>
        <p className="text-body-sm text-secondary">{performance.onTimePrepText}</p>
      </div>
    </div>
  );
};
