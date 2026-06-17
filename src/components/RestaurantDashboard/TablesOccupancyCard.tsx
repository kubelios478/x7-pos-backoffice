import React, { useEffect, useState } from 'react';
import { restaurantService } from '../../services/restaurantService';
import type { OccupancyData } from '../../services/restaurantService';

interface TablesOccupancyCardProps {
  refreshTrigger: number;
}

export const TablesOccupancyCard: React.FC<TablesOccupancyCardProps> = ({ refreshTrigger }) => {
  const [occupancy, setOccupancy] = useState<OccupancyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOccupancy = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await restaurantService.getTableOccupancy();
      setOccupancy(data);
    } catch (err) {
      setError('Error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOccupancy();
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="bg-white border border-[#e8e2d8] p-6 flex flex-col justify-between h-28 animate-pulse">
        <div className="h-4 bg-zinc-200 rounded w-24"></div>
        <div className="h-6 bg-zinc-200 rounded w-16 mt-2"></div>
        <div className="h-2 bg-zinc-100 rounded w-full mt-2"></div>
      </div>
    );
  }

  if (error || !occupancy) {
    return (
      <div className="bg-white border border-red-200 p-6 flex flex-col justify-between h-28 relative overflow-hidden">
        <div className="flex justify-between">
          <p className="font-label-caps text-label-caps text-red-500 font-bold uppercase">ACTIVE TABLES</p>
          <span className="material-symbols-outlined text-red-500">table_restaurant</span>
        </div>
        <p className="text-[11px] text-red-600 font-medium">Error al cargar ocupación</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#e8e2d8] p-6 flex flex-col justify-between">
      <div className="flex justify-between">
        <p className="font-label-caps text-label-caps text-secondary uppercase font-bold">ACTIVE TABLES</p>
        <span className="material-symbols-outlined text-[#d51f2c]">table_restaurant</span>
      </div>
      <div className="mt-4">
        <h3 className="font-h2 text-h2 text-[#222222]">
          {occupancy.active} / {occupancy.total}
        </h3>
        <div className="w-full bg-[#f1ece4] h-1.5 mt-2 overflow-hidden rounded-full">
          <div
            className="bg-[#222222] h-full rounded-full transition-all duration-500"
            style={{ width: `${occupancy.percentage}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
};
