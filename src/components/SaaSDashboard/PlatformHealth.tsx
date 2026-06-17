import React, { useEffect, useState } from 'react';
import { saasService } from '../../services/saasService';
import type { ServiceHealth } from '../../services/saasService';

interface PlatformHealthProps {
  refreshTrigger: number;
}

export const PlatformHealth: React.FC<PlatformHealthProps> = ({ refreshTrigger }) => {
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealthStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await saasService.getHealthStatus();
      setHealth(data);
    } catch (err) {
      setError('Error al obtener estado');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthStatus();
  }, [refreshTrigger]);

  const getStatusDetails = (status: ServiceHealth['status']) => {
    switch (status) {
      case 'degraded':
        return {
          colorClass: 'bg-yellow-500',
          textClass: 'text-yellow-600',
          label: 'Systems Degraded',
        };
      case 'downtime':
        return {
          colorClass: 'bg-red-500',
          textClass: 'text-red-600',
          label: 'Service Downtime / Outage',
        };
      case 'operational':
      default:
        return {
          colorClass: 'bg-[#10b981]',
          textClass: 'text-[#10b981]',
          label: 'All Systems Operational',
        };
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-[#e8e2d8] p-lg animate-pulse">
        <div className="flex items-center justify-between mb-6">
          <div className="h-4 bg-zinc-200 rounded w-48"></div>
          <div className="h-4 bg-zinc-200 rounded w-36"></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 bg-zinc-200 rounded w-20"></div>
              <div className="h-6 bg-zinc-200 rounded w-24"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="bg-white border border-red-200 p-lg">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-sans text-label-caps text-[#222222]">Platform Infrastructure Status</h3>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span className="text-label-caps text-red-500 font-bold uppercase">Connection Timeout</span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-4 gap-2">
          <p className="text-body-sm text-red-600 font-medium">No se pudo contactar al servicio de monitoreo.</p>
          <button
            onClick={fetchHealthStatus}
            className="text-[10px] font-bold text-[#d51f2c] uppercase hover:underline flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-xs">refresh</span> Reintentar
          </button>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusDetails(health.status);

  return (
    <div className="bg-white border border-[#e8e2d8] p-lg">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-sans text-label-caps text-[#222222]">Platform Infrastructure Status</h3>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusInfo.colorClass}`}></span>
          <span className={`text-label-caps font-bold ${statusInfo.textClass}`}>
            {statusInfo.label}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <p className="text-label-caps text-[#666666] mb-2">API LATENCY</p>
          <p className="text-h3 font-black text-[#222222]">
            {health.latency ? `${health.latency}ms` : 'N/A'}{' '}
            <span className="text-body-sm font-normal text-[#666666] tracking-normal">avg</span>
          </p>
        </div>
        <div>
          <p className="text-label-caps text-[#666666] mb-2">AUTH UPTIME</p>
          <p className="text-h3 font-black text-[#222222]">{health.authUptime}</p>
        </div>
        <div>
          <p className="text-label-caps text-[#666666] mb-2">PAYMENT BRIDGE</p>
          <p className={`text-h3 font-black ${health.paymentBridge === 'Stable' ? 'text-[#222222]' : 'text-red-500'}`}>
            {health.paymentBridge}
          </p>
        </div>
        <div>
          <p className="text-label-caps text-[#666666] mb-2">CLOUD NODES</p>
          <p className="text-h3 font-black text-[#222222]">
            {health.cloudNodes.active}{' '}
            <span className="text-body-sm font-normal text-[#666666] tracking-normal">Active</span>
          </p>
        </div>
      </div>
    </div>
  );
};
