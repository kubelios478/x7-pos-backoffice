import React, { useEffect, useState } from 'react';
import { restaurantService } from '../../services/restaurantService';
import type { TopItem } from '../../services/restaurantService';

interface TopSellingItemsProps {
  refreshTrigger: number;
}

export const TopSellingItems: React.FC<TopSellingItemsProps> = ({ refreshTrigger }) => {
  const [items, setItems] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTopItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await restaurantService.getTopSellingItems();
      setItems(data);
    } catch (err) {
      setError('Error al obtener productos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopItems();
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="bg-white border border-[#e8e2d8] flex flex-col h-[400px]">
        <div className="p-4 bg-[#222222] flex justify-between items-center">
          <span className="font-label-caps text-label-caps text-white">TOP SELLING ITEMS</span>
        </div>
        <div className="flex-grow divide-y divide-[#e8e2d8] animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 flex justify-between items-center">
              <div className="flex items-center gap-3 w-full">
                <div className="w-10 h-10 bg-zinc-200 rounded"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-zinc-200 rounded w-2/3"></div>
                  <div className="h-3 bg-zinc-200 rounded w-1/3"></div>
                </div>
              </div>
              <div className="w-12 h-6 bg-zinc-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-[#e8e2d8] flex flex-col h-[400px]">
        <div className="p-4 bg-[#222222] flex justify-between items-center">
          <span className="font-label-caps text-label-caps text-white">TOP SELLING ITEMS</span>
        </div>
        <div className="flex-grow flex flex-col items-center justify-center p-6 gap-3 text-center">
          <span className="material-symbols-outlined text-red-500 text-3xl">error</span>
          <p className="text-body-sm text-red-600 font-bold">{error}</p>
          <button
            onClick={fetchTopItems}
            className="px-3 py-1.5 bg-[#d51f2c] text-white font-bold text-[10px] uppercase hover:opacity-90 transition-all animate-bounce"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#e8e2d8] flex flex-col h-[400px]">
      <div className="p-4 bg-[#222222] flex justify-between items-center">
        <span className="font-label-caps text-label-caps text-white">TOP SELLING ITEMS</span>
        <button
          onClick={fetchTopItems}
          className="text-white/70 hover:text-white transition-colors"
          title="Refrescar productos"
        >
          <span className="material-symbols-outlined text-sm">more_vert</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <table className="w-full border-collapse">
          <tbody>
            {items.map((item, idx) => (
              <tr
                key={item.id}
                className={`border-b border-[#e8e2d8] hover:bg-[#f9f7f4] transition-colors ${
                  idx % 2 === 1 ? 'bg-[#f9f7f4]' : ''
                }`}
              >
                <td className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#f1ece4] flex-shrink-0 flex items-center justify-center rounded">
                    <span className="material-symbols-outlined text-[#222222]">
                      {item.icon || 'restaurant_menu'}
                    </span>
                  </div>
                  <div>
                    <p className="text-body-sm font-semibold text-[#222222]">{item.name}</p>
                    <p className="text-[11px] text-secondary">{item.category}</p>
                  </div>
                </td>
                <td className="p-4 text-right">
                  <p className="text-body-sm font-bold text-[#222222]">{item.soldCount}</p>
                  <p className="text-[11px] text-secondary">sold</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
export default TopSellingItems;
