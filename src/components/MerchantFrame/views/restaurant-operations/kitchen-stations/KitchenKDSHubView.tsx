import React, { useEffect, useState } from 'react';
import { getAccessToken } from '../../../../../lib/auth-storage';
import type { KitchenStation } from './KitchenStationsView';
import { KitchenQuickLinks } from './KitchenQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

interface KitchenKDSHubViewProps {
  onNavigate?: (view: string) => void;
  onOpenLiveMonitor?: () => void;
}

export const KitchenKDSHubView: React.FC<KitchenKDSHubViewProps> = ({
  onNavigate,
  onOpenLiveMonitor,
}) => {
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchStations = async () => {
      try {
        setLoading(true);
        const token = getAccessToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };

        const res = await fetch(`${API_BASE}/kitchen-station`, { headers });
        if (res.ok) {
          const json = await res.json();
          const rawList = Array.isArray(json) ? json : json.data || [];
          const dataList = rawList.map((st: any) => ({
            ...st,
            is_active: st.isActive ?? st.is_active ?? true,
            station_type: st.stationType ?? st.station_type ?? 'PREP',
            display_mode: st.displayMode ?? st.display_mode ?? 'AUTO',
            display_order: st.displayOrder ?? st.display_order ?? 1,
            printer_name: st.printerName ?? st.printer_name ?? null,
            status: st.status || 'active',
          }));
          setStations(dataList);
        } else {
          setStations([]);
        }
      } catch (err) {
        console.error('Error loading KDS Hub metrics:', err);
        setStations([]);
      } finally {
        setLoading(false);
      }
    };
    fetchStations();
  }, []);

  // Métricas calculadas en tiempo real
  const activeStations = stations.filter(s => (s.is_active ?? true) && (s.status === 'active' || !s.status));
  const boundPrintersCount = stations.filter(s => s.printer_name && s.printer_name.trim() !== '').length;
  const expoStationsCount = stations.filter(s => (s.station_type === 'EXPO' || s.station_type === 'PACKING') && (s.status === 'active' || !s.status)).length;

  const KDS_MODULES = [
    {
      id: 'kitchen-stations',
      title: 'Kitchen Station Profiles',
      subtitle: 'Profiles & Display Order',
      description: 'Configure prep lines, screen modes, printer names, and display order.',
      icon: 'soup_kitchen',
      badge: `${activeStations.length} Active Stations`,
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      actionText: 'Manage Stations',
    },
    {
      id: 'kitchen-display-devices',
      title: 'KDS Display Devices',
      subtitle: 'Terminals & Hardware',
      description: 'Register kitchen screens, monitor hardware status, and pair bump bars.',
      icon: 'desktop_windows',
      badge: `${boundPrintersCount} Hardware Bound`,
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
      actionText: 'Manage Devices',
    },
    {
      id: 'kitchen-orders',
      title: 'Live Kitchen Orders',
      subtitle: 'Real-time Ticket Queue',
      description: 'Monitor active preparation tickets, auto-dispatch, and pass window status.',
      icon: 'restaurant',
      badge: 'Live Queue Active',
      badgeColor: 'bg-[#fef3c7] text-[#92400e] border-[#fde68a]',
      actionText: 'View Orders Queue',
    },
    {
      id: 'kitchen-order-items',
      title: 'Order Items Tracking',
      subtitle: 'Item Prep Status',
      description: 'Track dish-level preparation progress, modifiers, and station routing.',
      icon: 'format_list_bulleted',
      badge: 'Granular Items View',
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
      actionText: 'Track Order Items',
    },
    {
      id: 'kitchen-event-log',
      title: 'KDS System Event Log',
      subtitle: 'Audit Trail & Logs',
      description: 'Inspect ticket bump history, station latency events, and audit logs.',
      icon: 'history',
      badge: 'System Audit Active',
      badgeColor: 'bg-zinc-100 text-zinc-800 border-zinc-300',
      actionText: 'View Event Log',
    },
    {
      id: 'kitchen-analytics',
      title: 'Kitchen Performance',
      subtitle: 'Metrics & Prep KPIs',
      description: 'Analyze preparation times, bottleneck charts, and throughput metrics.',
      icon: 'monitoring',
      badge: 'KPI Metrics',
      badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
      actionText: 'View Analytics',
    },
  ];

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans pb-12">
      {/* 1. Header Card Hub */}
      <div className="bg-white border border-[#e8e2d8] p-6 shadow-xs rounded">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#ae001a] tracking-wider uppercase mb-1">
              <span className="material-symbols-outlined text-lg">space_dashboard</span>
              <span>Kitchen Display System / Operational Hub</span>
            </div>
            <h1 className="text-2xl font-black text-[#1d1c17] tracking-tight uppercase">
              KDS Ecosystem Command Hub
            </h1>
            <p className="text-body-sm text-[#5f5e5e] mt-1 max-w-3xl">
              Centralized management hub for kitchen station profiles, hardware terminals, live prep queues, event logging, and preparation metrics.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {onOpenLiveMonitor && (
              <button
                type="button"
                onClick={onOpenLiveMonitor}
                className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white font-bold text-xs uppercase tracking-wider rounded shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">open_in_new</span>
                <span>LAUNCH LIVE KDS DISPLAY</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Hero KPI Health Strip (4 Cuadrados pequeños obligatoriamente en 1 sola línea horizontal) */}
      <div className="grid grid-cols-4 gap-3 w-full">
        {/* Card 1: Active KDS Stations */}
        <div className="bg-[#222222] text-white p-3.5 rounded-lg border-t-4 border-[#ae001a] shadow-sm flex flex-col justify-between h-32 group hover:border-white transition-all duration-200 min-w-0">
          <div className="flex items-center justify-between w-full min-w-0 gap-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-400 truncate">
              Active Stations
            </span>
            <div className="w-7 h-7 rounded bg-[#ae001a]/20 flex items-center justify-center text-[#ae001a] shrink-0">
              <span className="material-symbols-outlined text-base">soup_kitchen</span>
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none">
              {loading ? '...' : activeStations.length}
            </p>
            <p className="text-[9px] text-zinc-400 font-medium mt-1 truncate">Prep & pass lines</p>
          </div>
        </div>

        {/* Card 2: Hardware Printers Bound */}
        <div className="bg-[#222222] text-white p-3.5 rounded-lg border-t-4 border-blue-500 shadow-sm flex flex-col justify-between h-32 group hover:border-white transition-all duration-200 min-w-0">
          <div className="flex items-center justify-between w-full min-w-0 gap-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-400 truncate">
              Printers Bound
            </span>
            <div className="w-7 h-7 rounded bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              <span className="material-symbols-outlined text-base">print</span>
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none">
              {loading ? '...' : boundPrintersCount}
            </p>
            <p className="text-[9px] text-zinc-400 font-medium mt-1 truncate">Hardware printers</p>
          </div>
        </div>

        {/* Card 3: Expo / Pass Stations */}
        <div className="bg-[#222222] text-white p-3.5 rounded-lg border-t-4 border-amber-500 shadow-sm flex flex-col justify-between h-32 group hover:border-white transition-all duration-200 min-w-0">
          <div className="flex items-center justify-between w-full min-w-0 gap-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-400 truncate">
              Expo / Pass
            </span>
            <div className="w-7 h-7 rounded bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <span className="material-symbols-outlined text-base">star</span>
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none">
              {loading ? '...' : expoStationsCount}
            </p>
            <p className="text-[9px] text-zinc-400 font-medium mt-1 truncate">Expo stations ready</p>
          </div>
        </div>

        {/* Card 4: System Operational Status */}
        <div className="bg-[#222222] text-white p-3.5 rounded-lg border-t-4 border-emerald-500 shadow-sm flex flex-col justify-between h-32 group hover:border-white transition-all duration-200 min-w-0">
          <div className="flex items-center justify-between w-full min-w-0 gap-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-400 truncate">
              System Status
            </span>
            <div className="w-7 h-7 rounded bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <span className="material-symbols-outlined text-base">check_circle</span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <p className="text-xs sm:text-sm font-black text-emerald-400 uppercase tracking-wider truncate">
                OPERATIONAL
              </p>
            </div>
            <p className="text-[9px] text-zinc-400 font-medium mt-1 truncate">Real-time KDS</p>
          </div>
        </div>
      </div>

      {/* 3. 6 Sub-Module Command Cards Grid (3 Cuadrados por línea = 2 filas de 3) */}
      <div className="grid grid-cols-3 gap-4 mt-2 w-full">
        {KDS_MODULES.map((mod) => (
          <KDSModuleCard key={mod.id} mod={mod} onNavigate={onNavigate} />
        ))}
      </div>

      {/* 4. Persistent Bottom Quick Launch Bar */}
      <div className="mt-4">
        <KitchenQuickLinks current="kitchen-stations" onNavigate={onNavigate} />
      </div>
    </div>
  );
};

interface KDSModuleCardProps {
  mod: any;
  onNavigate?: (id: string) => void;
}

const KDSModuleCard: React.FC<KDSModuleCardProps> = ({ mod, onNavigate }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onClick={() => onNavigate?.(mod.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`bg-white border rounded-xl p-5 pb-5 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between min-w-0 h-[220px] ${
        isHovered ? 'border-[#ae001a]' : 'border-[#e8e2d8]'
      }`}
    >
      <div>
        <div className="flex items-center justify-between mb-3 min-w-0 gap-2">
          <div
            className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-all duration-200 shrink-0 ${
              isHovered ? 'bg-[#ae001a] border-[#ae001a]' : 'bg-[#fef9f1] border-[#e8e2d8]'
            }`}
          >
            <span
              className="material-symbols-outlined text-xl transition-colors duration-200"
              style={{ color: isHovered ? '#ffffff' : '#ae001a' }}
            >
              {mod.icon}
            </span>
          </div>
          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${mod.badgeColor}`}>
            {mod.badge}
          </span>
        </div>

        <h3
          className={`font-bold text-xs sm:text-sm transition-colors duration-200 leading-tight ${
            isHovered ? 'text-[#ae001a]' : 'text-[#1d1c17]'
          }`}
        >
          {mod.title}
        </h3>
        <p className="text-[9px] font-semibold text-[#8a8880] uppercase tracking-wider mt-1 mb-2">
          {mod.subtitle}
        </p>
        <p className="text-[11px] text-[#5f5e5e] leading-snug">
          {mod.description}
        </p>
      </div>

      <div
        className={`mt-3 pt-3 border-t border-[#e8e2d8] flex items-center justify-between text-xs font-bold text-[#ae001a] transition-transform duration-200 ${
          isHovered ? 'translate-x-1' : ''
        }`}
      >
        <span className="truncate">{mod.actionText}</span>
        <span className="material-symbols-outlined text-base shrink-0">arrow_forward</span>
      </div>
    </div>
  );
};

export default KitchenKDSHubView;
