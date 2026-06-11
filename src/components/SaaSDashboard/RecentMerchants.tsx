import React, { useEffect, useState } from 'react';
import { saasService } from '../../services/saasService';
import type { RecentMerchant } from '../../services/saasService';

interface RecentMerchantsProps {
  onNavigateToView: (view: string) => void;
  refreshTrigger: number;
}

export const RecentMerchants: React.FC<RecentMerchantsProps> = ({
  onNavigateToView,
  refreshTrigger,
}) => {
  const [merchants, setMerchants] = useState<RecentMerchant[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecentMerchants = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await saasService.getRecentMerchants();
      setMerchants(data);
    } catch (err) {
      setError('Error al cargar comercios');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecentMerchants();
  }, [refreshTrigger]);

  const renderBadge = (type: RecentMerchant['type']) => {
    switch (type) {
      case 'Quick Service':
        return (
          <span className="px-2 py-0.5 border border-[#222222] text-[#222222] text-[10px] font-bold uppercase whitespace-nowrap">
            Quick Service
          </span>
        );
      case 'Full Restaurant':
        return (
          <span className="px-2 py-0.5 bg-[#222222] text-white text-[10px] font-bold uppercase whitespace-nowrap">
            Full Restaurant
          </span>
        );
      case 'Enterprise':
        return (
          <div className="flex items-center gap-1 bg-[#d51f2c] text-white px-2 py-0.5 text-[10px] font-bold uppercase whitespace-nowrap">
            <span>X7</span> Enterprise
          </div>
        );
      default:
        return null;
    }
  };

  const getFallbackIcon = (type: RecentMerchant['type'], name: string) => {
    if (name.toLowerCase().includes('cafe') || name.toLowerCase().includes('steam')) {
      return 'local_cafe';
    }
    switch (type) {
      case 'Quick Service':
        return 'store';
      case 'Full Restaurant':
        return 'dining';
      case 'Enterprise':
      default:
        return 'domain';
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-[#e8e2d8] flex flex-col min-h-[400px]">
        <div className="px-lg py-md border-b border-[#e8e2d8] bg-[#f9f7f4]">
          <h3 className="font-sans text-label-caps text-[#222222]">Recently Joined Merchants</h3>
        </div>
        <div className="flex-1 divide-y divide-[#e8e2d8] animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-md flex items-center gap-4">
              <div className="w-10 h-10 bg-zinc-200 rounded"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-zinc-200 rounded w-1/2"></div>
                <div className="h-3 bg-zinc-200 rounded w-1/3"></div>
              </div>
              <div className="w-20 h-6 bg-zinc-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-[#e8e2d8] flex flex-col min-h-[400px]">
        <div className="px-lg py-md border-b border-[#e8e2d8] bg-[#f9f7f4]">
          <h3 className="font-sans text-label-caps text-[#222222]">Recently Joined Merchants</h3>
        </div>
        <div className="flex-grow flex flex-col items-center justify-center p-lg gap-3 text-center">
          <span className="material-symbols-outlined text-red-500 text-3xl">error</span>
          <p className="text-body-sm text-red-600 font-bold">{error}</p>
          <button
            onClick={fetchRecentMerchants}
            className="px-3 py-1.5 bg-[#d51f2c] text-white font-bold text-[10px] uppercase hover:opacity-90 transition-all"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#e8e2d8] flex flex-col">
      <div className="px-lg py-md border-b border-[#e8e2d8] bg-[#f9f7f4]">
        <h3 className="font-sans text-label-caps text-[#222222]">Recently Joined Merchants</h3>
      </div>
      <div className="flex-1">
        <div className="divide-y divide-[#e8e2d8]">
          {merchants.map((merchant) => (
            <div
              key={merchant.id}
              className="p-md hover:bg-[#f9f7f4] transition-colors flex items-center gap-4"
            >
              {merchant.logoUrl ? (
                <div className="w-10 h-10 rounded overflow-hidden border border-[#e8e2d8]">
                  <img
                    alt={merchant.name}
                    className="w-full h-full object-cover"
                    src={merchant.logoUrl}
                  />
                </div>
              ) : (
                <div className="w-10 h-10 bg-[#e8e2d8] flex items-center justify-center rounded">
                  <span className="material-symbols-outlined text-[#222222]">
                    {getFallbackIcon(merchant.type, merchant.name)}
                  </span>
                </div>
              )}
              <div className="flex-1">
                <p className="text-body-sm font-bold text-[#222222]">{merchant.name}</p>
                <p className="text-[11px] text-[#666666]">{merchant.joinedText}</p>
              </div>
              {renderBadge(merchant.type)}
            </div>
          ))}
        </div>
        <button
          onClick={() => onNavigateToView('merchants')}
          className="w-full py-4 text-label-caps text-[#222222] font-bold border-t border-[#e8e2d8] hover:bg-[#f9f7f4] transition-all"
        >
          View All Merchants
        </button>
      </div>
    </div>
  );
};
