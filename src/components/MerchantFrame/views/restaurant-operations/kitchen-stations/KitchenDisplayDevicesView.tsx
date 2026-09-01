import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../../lib/auth-storage';
import { KitchenQuickLinks } from './KitchenQuickLinks';
import { AppModal } from '../../../shared/AppModal';
import { HeaderQuickTabs } from '../../../../shared/HeaderQuickTabs';
import { TableOptionsMenu, NoColumnsEmptyState, TablePaginationFooter, getDensityPadding } from '../../../../shared/TableOptionsMenu';
import { NavHubBar } from '../../../../shared/NavHubBar';

export type KitchenDisplayDeviceStatus = 'active' | 'deleted';

export interface KitchenStationRef {
  id: number;
  name: string;
}

export interface KitchenDisplayDevice {
  id: number;
  merchant_id: number;
  station_id: number | null;
  stationId?: number | null;
  station?: KitchenStationRef | null;
  name: string;
  device_identifier: string;
  deviceIdentifier?: string;
  ip_address: string | null;
  ipAddress?: string | null;
  is_online: boolean;
  isOnline?: boolean;
  last_sync: string | null;
  lastSync?: string | null;
  status: KitchenDisplayDeviceStatus;
  created_at: string;
  createdAt?: string;
  updated_at: string;
  updatedAt?: string;
}

interface KitchenDisplayDevicesViewProps {
  onNavigate?: (view: string) => void;
}

const MOCK_KITCHEN_STATIONS: KitchenStationRef[] = [
  { id: 1, name: 'Hot Line & Grill Station' },
  { id: 2, name: 'Cold Prep & Salad Station' },
  { id: 3, name: 'Main Bar & Beverage Station' },
  { id: 4, name: 'Desserts & Bakery Hub' },
  { id: 5, name: 'Expo & Final Quality Check' },
];

const MOCK_DEVICES: KitchenDisplayDevice[] = [
  {
    id: 1,
    merchant_id: 1,
    station_id: 1,
    station: { id: 1, name: 'Hot Line & Grill Station' },
    name: 'Main Grill Touch Terminal #1',
    device_identifier: 'DEV-001-GRILL',
    ip_address: '192.168.1.101',
    is_online: true,
    last_sync: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    status: 'active',
    created_at: '2026-01-15T08:30:00Z',
    updated_at: '2026-02-10T14:20:00Z',
  },
  {
    id: 2,
    merchant_id: 1,
    station_id: 2,
    station: { id: 2, name: 'Cold Prep & Salad Station' },
    name: 'Salad & Cold Prep Display #2',
    device_identifier: 'DEV-002-COLD',
    ip_address: '192.168.1.102',
    is_online: true,
    last_sync: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    status: 'active',
    created_at: '2026-01-15T08:45:00Z',
    updated_at: '2026-02-10T14:22:00Z',
  },
  {
    id: 3,
    merchant_id: 1,
    station_id: 3,
    station: { id: 3, name: 'Main Bar & Beverage Station' },
    name: 'Bar Order Ticket Screen #3',
    device_identifier: 'DEV-003-BAR',
    ip_address: '192.168.1.103',
    is_online: false,
    last_sync: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    status: 'active',
    created_at: '2026-01-16T10:00:00Z',
    updated_at: '2026-02-11T09:15:00Z',
  },
  {
    id: 4,
    merchant_id: 1,
    station_id: null,
    station: null,
    name: 'Backup Floating Tablet #1',
    device_identifier: 'DEV-004-FLOAT',
    ip_address: '192.168.1.150',
    is_online: true,
    last_sync: new Date(Date.now() - 1000 * 30).toISOString(),
    status: 'active',
    created_at: '2026-01-20T11:15:00Z',
    updated_at: '2026-02-12T16:00:00Z',
  },
  {
    id: 5,
    merchant_id: 1,
    station_id: 5,
    station: { id: 5, name: 'Expo & Final Quality Check' },
    name: 'Expo Quality Assurance Screen',
    device_identifier: 'DEV-005-EXPO',
    ip_address: '192.168.1.105',
    is_online: false,
    last_sync: new Date(Date.now() - 1000 * 60 * 1440).toISOString(),
    status: 'deleted',
    created_at: '2026-01-22T09:00:00Z',
    updated_at: '2026-02-15T12:00:00Z',
  },
];

export const KitchenDisplayDevicesView: React.FC<KitchenDisplayDevicesViewProps> = ({ onNavigate }) => {
  const [devices, setDevices] = useState<KitchenDisplayDevice[]>(MOCK_DEVICES);
  const [stations, setStations] = useState<KitchenStationRef[]>(MOCK_KITCHEN_STATIONS);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filtros y vista
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [stationFilter, setStationFilter] = useState<string>('All');
  const [connectivityFilter, setConnectivityFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Tabla: Densidad, Columnas Visibles y Paginación
  const [visibleColumns, setVisibleColumns] = useState<{
    deviceIdentity: boolean;
    stationBinding: boolean;
    ipAddress: boolean;
    connectivity: boolean;
    lastSync: boolean;
    status: boolean;
    actions: boolean;
  }>({
    deviceIdentity: true,
    stationBinding: true,
    ipAddress: true,
    connectivity: true,
    lastSync: true,
    status: true,
    actions: true,
  });

  const [rowDensity, setRowDensity] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reset de página al cambiar filtros o tamaño de página
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, stationFilter, connectivityFilter, statusFilter, pageSize]);

  // Drawer de Edición y Creación
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add');
  const [editingDevice, setEditingDevice] = useState<KitchenDisplayDevice | null>(null);

  // Campos de Formulario
  const [formName, setFormName] = useState<string>('');
  const [formDeviceIdentifier, setFormDeviceIdentifier] = useState<string>('');
  const [formIpAddress, setFormIpAddress] = useState<string>('');
  const [formStationId, setFormStationId] = useState<string>('');
  const [formIsOnline, setFormIsOnline] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Modal de Eliminación (Soft Delete)
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [deviceToDelete, setDeviceToDelete] = useState<KitchenDisplayDevice | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const topRef = useRef<HTMLDivElement | null>(null);
  const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, []);

  // Cargar lista de estaciones de cocina para los selectores
  const fetchStationsList = async () => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch(`${API_BASE}/kitchen-station?status=active`, { headers });
      if (res.ok) {
        const json = await res.json();
        const rawList = Array.isArray(json) ? json : json.data || [];
        if (rawList.length > 0) {
          setStations(
            rawList.map((s: any) => ({
              id: s.id,
              name: s.name,
            }))
          );
        }
      }
    } catch {
      // Usar MOCK_KITCHEN_STATIONS en caso de error de red
    }
  };

  // Fetch de Dispositivos KDS
  const fetchDevices = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const params = new URLSearchParams();
      if (statusFilter === 'Deleted') params.append('status', 'deleted');
      else if (statusFilter === 'Active') params.append('status', 'active');

      if (connectivityFilter === 'Online') params.append('isOnline', 'true');
      else if (connectivityFilter === 'Offline') params.append('isOnline', 'false');

      if (stationFilter === 'Unassigned') params.append('unassigned', 'true');
      else if (stationFilter !== 'All') params.append('stationId', stationFilter);

      const res = await fetch(`${API_BASE}/kitchen-display-devices?${params.toString()}`, { headers });

      if (res.status === 401) {
        // En entorno de desarrollo sin token JWT, mantener datos de demostración
        setIsLoading(false);
        return;
      }

      if (res.ok) {
        const json = await res.json();
        const rawList = Array.isArray(json) ? json : json.data || [];
        const dataList = rawList.map((dev: any) => ({
          id: dev.id,
          merchant_id: dev.merchant_id ?? dev.merchantId ?? 1,
          station_id: dev.station_id ?? dev.stationId ?? dev.station?.id ?? null,
          station: dev.station ? { id: dev.station.id, name: dev.station.name } : null,
          name: dev.name,
          device_identifier: dev.device_identifier ?? dev.deviceIdentifier ?? 'DEV-000',
          ip_address: dev.ip_address ?? dev.ipAddress ?? null,
          is_online: dev.is_online ?? dev.isOnline ?? false,
          last_sync: dev.last_sync ?? dev.lastSync ?? null,
          status: dev.status ?? 'active',
          created_at: dev.created_at ?? dev.createdAt ?? new Date().toISOString(),
          updated_at: dev.updated_at ?? dev.updatedAt ?? new Date().toISOString(),
        }));
        if (dataList.length > 0) {
          setDevices(dataList);
        }
      }
    } catch (err) {
      console.warn('API error fetching KDS devices (using mock fallback):', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStationsList();
    fetchDevices();
  }, [statusFilter, connectivityFilter, stationFilter]);

  // Limpiar Filtros
  const clearFilters = () => {
    setSearchQuery('');
    setStationFilter('All');
    setConnectivityFilter('All');
    setStatusFilter('All');
  };

  const hasActiveFilters = searchQuery !== '' || stationFilter !== 'All' || connectivityFilter !== 'All' || statusFilter !== 'All';

  // Filtrado alfanumérico en memoria
  const filteredDevices = devices.filter((dev) => {
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      const matchName = dev.name.toLowerCase().includes(q);
      const matchIdentifier = dev.device_identifier.toLowerCase().includes(q);
      const matchIp = (dev.ip_address || '').toLowerCase().includes(q);
      const matchStation = (dev.station?.name || '').toLowerCase().includes(q);
      if (!matchName && !matchIdentifier && !matchIp && !matchStation) return false;
    }

    if (stationFilter === 'Unassigned' && dev.station_id !== null) return false;
    if (stationFilter !== 'All' && stationFilter !== 'Unassigned' && String(dev.station_id) !== stationFilter) return false;

    if (connectivityFilter === 'Online' && !dev.is_online) return false;
    if (connectivityFilter === 'Offline' && dev.is_online) return false;

    if (statusFilter === 'Active' && dev.status !== 'active') return false;
    if (statusFilter === 'Deleted' && dev.status !== 'deleted') return false;

    return true;
  });

  // KPI Metrics
  const onlineCount = devices.filter((d) => d.is_online && d.status === 'active').length;
  const offlineCount = devices.filter((d) => !d.is_online && d.status === 'active').length;
  const unassignedCount = devices.filter((d) => !d.station_id && d.status === 'active').length;

  // Calculador de tiempo relativo ("2 mins ago", "1 hr ago", etc.)
  const formatTimeAgo = (isoString: string | null) => {
    if (!isoString) return 'Never Synced';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Abrir Drawer para Crear
  const handleOpenAddDrawer = () => {
    setDrawerMode('add');
    setEditingDevice(null);
    setFormName('');
    setFormDeviceIdentifier(`DEV-00${devices.length + 1}-KDS`);
    setFormIpAddress(`192.168.1.${100 + devices.length + 1}`);
    setFormStationId('');
    setFormIsOnline(true);
    setFormError(null);
    setIsDrawerOpen(true);
  };

  // Abrir Drawer para Editar
  const handleOpenEditDrawer = (device: KitchenDisplayDevice) => {
    setDrawerMode('edit');
    setEditingDevice(device);
    setFormName(device.name);
    setFormDeviceIdentifier(device.device_identifier);
    setFormIpAddress(device.ip_address || '');
    setFormStationId(device.station_id ? String(device.station_id) : '');
    setFormIsOnline(device.is_online);
    setFormError(null);
    setIsDrawerOpen(true);
  };

  // Guardar Formulario (Crear o Editar)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Device name is required');
      return;
    }
    if (!formDeviceIdentifier.trim()) {
      setFormError('Device identifier (Serial/MAC) is required');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const stationObj = formStationId ? stations.find((s) => s.id === Number(formStationId)) : null;

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const payload = {
        name: formName.trim(),
        deviceIdentifier: formDeviceIdentifier.trim(),
        ipAddress: formIpAddress.trim() || null,
        stationId: formStationId ? Number(formStationId) : null,
        isOnline: formIsOnline,
      };

      const url = drawerMode === 'add' ? `${API_BASE}/kitchen-display-devices` : `${API_BASE}/kitchen-display-devices/${editingDevice?.id}`;
      const method = drawerMode === 'add' ? 'POST' : 'PUT';

      const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });

      if (res.ok) {
        setIsDrawerOpen(false);
        fetchDevices(true);
      } else {
        // Fallback local
        if (drawerMode === 'add') {
          const newDev: KitchenDisplayDevice = {
            id: Date.now(),
            merchant_id: 1,
            station_id: formStationId ? Number(formStationId) : null,
            station: stationObj ? { id: stationObj.id, name: stationObj.name } : null,
            name: formName.trim(),
            device_identifier: formDeviceIdentifier.trim(),
            ip_address: formIpAddress.trim() || null,
            is_online: formIsOnline,
            last_sync: new Date().toISOString(),
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          setDevices((prev) => [newDev, ...prev]);
        } else if (editingDevice) {
          setDevices((prev) =>
            prev.map((d) =>
              d.id === editingDevice.id
                ? {
                    ...d,
                    name: formName.trim(),
                    device_identifier: formDeviceIdentifier.trim(),
                    ip_address: formIpAddress.trim() || null,
                    station_id: formStationId ? Number(formStationId) : null,
                    station: stationObj ? { id: stationObj.id, name: stationObj.name } : null,
                    is_online: formIsOnline,
                    updated_at: new Date().toISOString(),
                  }
                : d
            )
          );
        }
        setIsDrawerOpen(false);
      }
    } catch {
      setIsDrawerOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle de Conectividad en tiempo real (Persistencia en PostgreSQL DB)
  const handleToggleOnline = async (device: KitchenDisplayDevice) => {
    const updatedStatus = !device.is_online;
    const nowIso = new Date().toISOString();

    setDevices((prev) =>
      prev.map((d) => (d.id === device.id ? { ...d, is_online: updatedStatus, last_sync: nowIso } : d))
    );

    try {
      const token = getAccessToken();
      await fetch(`${API_BASE}/kitchen-display-devices/${device.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: device.name,
          deviceIdentifier: device.device_identifier,
          ipAddress: device.ip_address,
          stationId: device.station_id,
          isOnline: updatedStatus,
          lastSync: nowIso,
        }),
      });
    } catch {
      // Mantener cambio optimista
    }
  };

  // Eliminar Dispositivo (Soft Delete)
  const handleConfirmDelete = async () => {
    if (!deviceToDelete) return;
    setIsDeleting(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/kitchen-display-devices/${deviceToDelete.id}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (res.ok) {
        setDevices((prev) => prev.map((d) => (d.id === deviceToDelete.id ? { ...d, status: 'deleted', is_online: false } : d)));
      } else {
        setDevices((prev) => prev.map((d) => (d.id === deviceToDelete.id ? { ...d, status: 'deleted', is_online: false } : d)));
      }
    } catch {
      setDevices((prev) => prev.map((d) => (d.id === deviceToDelete.id ? { ...d, status: 'deleted', is_online: false } : d)));
    } finally {
      setIsDeleting(false);
      setDeleteModalOpen(false);
      setDeviceToDelete(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans pb-20">
      <div ref={topRef} />

      {/* 1. Header Card Workspace */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <div>
          <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
            KDS HARDWARE DEVICES & CONNECTIVITY WORKSPACE
          </h2>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Track physical display units, monitor live online/offline network connectivity status, manage IP address assignments, and inspect hardware bindings with kitchen stations.
          </p>
        </div>
      </div>

      {/* 1.5 Real-Time KPI Strip (3 Cuadrados alineados en 1 sola línea horizontal) */}
      <div className="grid grid-cols-3 gap-4 w-full">
        {/* KPI 1: Online Devices */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shrink-0">
              <span className="material-symbols-outlined text-xl">desktop_windows</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Online Devices
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {onlineCount}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
            ONLINE LIVE
          </span>
        </div>

        {/* KPI 2: Offline Devices */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-red-50 text-red-700 flex items-center justify-center border border-red-200 shrink-0">
              <span className="material-symbols-outlined text-xl">wifi_off</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Offline Devices
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {offlineCount}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-red-100 text-red-800 border border-red-200 shrink-0">
            OFFLINE
          </span>
        </div>

        {/* KPI 3: Unassigned Floating Tablets */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200 shrink-0">
              <span className="material-symbols-outlined text-xl">devices_other</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Floating / Unassigned
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {unassignedCount}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
            UNASSIGNED
          </span>
        </div>
      </div>

      {/* 2. Toolbar Multicriterio a 2 Filas */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
        {/* Fila 1: Búsqueda a la izquierda y View Switcher a la derecha en la MISMA línea horizontal */}
        <div className="flex flex-row items-center justify-between gap-3 w-full">
          <div className="relative flex-1 min-w-0">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e] font-sans">
              search
            </span>
            <input
              type="text"
              placeholder="Search devices by name, identifier (DEV-001), IP address, or station..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md transition-all font-sans"
              aria-label="Search KDS devices"
            />
          </div>

          {/* View Switcher Toggle (Table View vs Quick-Launch Cards) pegado a la derecha en la misma línea */}
          <div className="flex items-center bg-[#f2ede5] p-1 rounded border border-[#e8e2d8] shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-[#1d1c17] shadow-xs border border-[#e8e2d8]'
                  : 'text-[#5f5e5e] hover:text-[#ae001a]'
              }`}
              title="Switch to Table View"
            >
              <span className="material-symbols-outlined text-[16px]">table_rows</span>
              Table View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-white text-[#1d1c17] shadow-xs border border-[#e8e2d8]'
                  : 'text-[#5f5e5e] hover:text-[#ae001a]'
              }`}
              title="Switch to Quick-Launch Cards Grid View"
            >
              <span className="material-symbols-outlined text-[16px]">grid_view</span>
              Quick-Launch Cards
            </button>
          </div>
        </div>

        {/* Fila 2: Filtros a la izquierda, Botones a la derecha */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Station Filter */}
            <select
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] outline-none font-sans text-secondary cursor-pointer"
              aria-label="Filter by kitchen station"
            >
              <option value="All">All Stations</option>
              <option value="Unassigned">Unassigned / Floating Units</option>
              {stations.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name} (#KST-{s.id})
                </option>
              ))}
            </select>

            {/* Connectivity Filter */}
            <select
              value={connectivityFilter}
              onChange={(e) => setConnectivityFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] outline-none font-sans text-secondary cursor-pointer"
              aria-label="Filter by network connectivity"
            >
              <option value="All">All Network States</option>
              <option value="Online">ONLINE ONLY</option>
              <option value="Offline">OFFLINE ONLY</option>
            </select>

            {/* Record Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] outline-none font-sans text-secondary cursor-pointer"
              aria-label="Filter by record status"
            >
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Deleted">Deleted</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Botón Principal Añadir */}
            <button
              type="button"
              onClick={handleOpenAddDrawer}
              className="bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors flex items-center gap-2 font-sans cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              REGISTER KDS DEVICE
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Main Data Workspace Grid */}
      {isLoading ? (
        <div className="p-12 text-center bg-white border border-[#e8e2d8] rounded">
          <span className="material-symbols-outlined animate-spin text-3xl text-amber-600 mb-2">progress_activity</span>
          <p className="text-xs font-bold text-[#5f5e5e]">Hydrating KDS hardware devices inventory...</p>
        </div>
      ) : filteredDevices.length === 0 ? (
        <div className="p-12 text-center bg-white border border-[#e8e2d8] rounded">
          <span className="material-symbols-outlined text-4xl text-[#5f5e5e] mb-2">desktop_access_disabled</span>
          <p className="text-body-md font-bold text-[#1d1c17]">No KDS Devices Found</p>
          <p className="text-body-sm text-[#5f5e5e] max-w-md mx-auto mt-1 mb-4">
            No display hardware units match your current search criteria or filter matrix. Try resetting your search query or station filters.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 bg-[#f2ede5] hover:bg-[#e8e2d8] text-[#1d1c17] text-xs font-bold rounded transition-colors cursor-pointer"
          >
            Clear Filters Matrix
          </button>
        </div>
      ) : viewMode === 'cards' ? (
        /* Quick-Launch Cards Mode: Estrictamente 2 tarjetas por fila horizontal */
        <div className="grid grid-cols-2 gap-3.5">
          {filteredDevices.map((device) => {
            const isInactive = device.status === 'deleted';
            return (
              <div
                key={device.id}
                className={`bg-white border rounded p-4 transition-all shadow-xs flex flex-col justify-between ${
                  isInactive ? 'border-[#e8e2d8] opacity-70 bg-[#f8f3eb]/40' : 'border-[#e8e2d8] hover:border-[#ae001a]'
                }`}
              >
                <div>
                  {/* Header Identity */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="font-bold text-sm text-[#1d1c17] line-clamp-1">{device.name}</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#f2ede5] text-[#5f5e5e] border border-[#e8e2d8] inline-block mt-0.5">
                        {device.device_identifier}
                      </span>
                    </div>

                    {/* Online Status Pill */}
                    {device.is_online ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>ONLINE</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-800 text-[10px] font-bold">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        <span>OFFLINE</span>
                      </div>
                    )}
                  </div>

                  {/* Station Binding & IP Address */}
                  <div className="space-y-1.5 text-xs border-t border-[#e8e2d8] pt-2.5 mt-2">
                    <div className="flex items-center justify-between text-[#5f5e5e]">
                      <span className="text-[11px] font-semibold">Mapped Station:</span>
                      {device.station ? (
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-[#1d1c17] text-xs">{device.station.name}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-200">
                            #KST-{device.station.id}
                          </span>
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#f2ede5] text-[#5f5e5e] border border-[#e8e2d8]">
                          Unassigned / Floating
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[#5f5e5e]">
                      <span className="text-[11px] font-semibold">Network IP:</span>
                      <div className="flex items-center gap-1 font-mono text-xs text-[#1d1c17] font-bold">
                        <span className="material-symbols-outlined text-[15px] text-[#5f5e5e]">router</span>
                        {device.ip_address || '0.0.0.0 (DHCP)'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[#5f5e5e]">
                      <span className="text-[11px] font-semibold">Last Sync:</span>
                      <span className="text-[11px] font-medium text-[#1d1c17]">{formatTimeAgo(device.last_sync)}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="flex items-center justify-between border-t border-[#e8e2d8] pt-3 mt-3">
                  <button
                    type="button"
                    onClick={() => handleToggleOnline(device)}
                    disabled={isInactive}
                    className={`py-1.5 px-2.5 rounded text-[11px] font-bold border transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40 ${
                      device.is_online
                        ? 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100'
                    }`}
                    title="Simulate network connectivity state"
                  >
                    <span className="material-symbols-outlined text-xs">sync</span>
                    <span>{device.is_online ? 'Mark Offline' : 'Mark Online'}</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEditDrawer(device)}
                      disabled={isInactive}
                      className="p-1.5 text-zinc-600 hover:text-[#ae001a] hover:bg-[#fef9f1] rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title="Edit Device"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeviceToDelete(device);
                        setDeleteModalOpen(true);
                      }}
                      disabled={isInactive}
                      className="p-1.5 text-zinc-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title="Soft Delete Device"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View Mode */
        <div className="bg-white border border-[#e8e2d8] rounded shadow-sm relative">
          <HeaderQuickTabs
            title="KITCHEN DISPLAY DEVICES INVENTORY MATRIX"
            badgeCount={
              filteredDevices.length <= pageSize
                ? `${filteredDevices.length} device${filteredDevices.length === 1 ? '' : 's'}`
                : `${Math.min(filteredDevices.length, pageSize)} / ${filteredDevices.length} devices`
            }
            tabs={[]}
            rightElement={
              <TableOptionsMenu
                onExportCSV={() => {
                  const headers = ['ID', 'Name', 'Device Identifier', 'IP Address', 'Station ID', 'Station Name', 'Is Online', 'Last Sync', 'Status'];
                  const rows = filteredDevices.map((d) => [
                    d.id,
                    `"${(d.name || '').replace(/"/g, '""')}"`,
                    d.device_identifier,
                    d.ip_address || '',
                    d.station_id || '',
                    `"${(d.station?.name || 'Unassigned').replace(/"/g, '""')}"`,
                    d.is_online ? 'Online' : 'Offline',
                    d.last_sync || '',
                    d.status,
                  ]);
                  const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
                  const link = document.createElement('a');
                  link.href = encodeURI(csv);
                  link.download = `kds_devices_${new Date().toISOString().slice(0, 10)}.csv`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                onPrint={() => window.print()}
                printLabel="Print Devices Directory"
                onCopySummary={() => {
                  const summaryText = `KDS Display Devices Directory Summary:\n- Total Devices: ${filteredDevices.length}\n- Online: ${filteredDevices.filter((d) => d.is_online).length}\n- Offline: ${filteredDevices.filter((d) => !d.is_online).length}\n- Unassigned Floating: ${filteredDevices.filter((d) => !d.station_id).length}`;
                  navigator.clipboard.writeText(summaryText);
                }}
                onReload={() => fetchDevices()}
                columns={[
                  { key: 'deviceIdentity', label: 'Device Identity & HW ID' },
                  { key: 'stationBinding', label: 'Mapped Kitchen Station' },
                  { key: 'ipAddress', label: 'Network IP Address' },
                  { key: 'connectivity', label: 'Live Connectivity' },
                  { key: 'lastSync', label: 'Last Sync Timestamp' },
                  { key: 'status', label: 'Lifecycle Status' },
                  { key: 'actions', label: 'Actions' },
                ]}
                visibleColumns={visibleColumns}
                onToggleColumn={(key) => setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key as keyof typeof visibleColumns] }))}
                rowDensity={rowDensity}
                onChangeDensity={setRowDensity}
                totalItems={filteredDevices.length}
                pageSize={pageSize}
                onChangePageSize={setPageSize}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
              />
            }
          />

          {!Object.values(visibleColumns).some(Boolean) ? (
            <NoColumnsEmptyState />
          ) : (
            <>
              <div className="w-full">
                <table className="w-full text-left border-collapse text-xs font-sans">
                  <thead>
                    <tr className="bg-[#ece8e0] text-[#5f5e5e] uppercase text-[11px] tracking-wider font-bold border-b border-[#e8e2d8]">
                      {visibleColumns.deviceIdentity && <th className="py-3.5 px-4 text-[#5f5e5e] w-[26%]">Device Identity & HW ID</th>}
                      {visibleColumns.stationBinding && <th className="py-3.5 px-4 text-[#5f5e5e] w-[24%]">Mapped Kitchen Station</th>}
                      {visibleColumns.ipAddress && <th className="py-3.5 px-4 text-[#5f5e5e] w-[15%]">Network IP Address</th>}
                      {visibleColumns.connectivity && <th className="py-3.5 px-4 text-center text-[#5f5e5e] w-[12%]">Live Connectivity</th>}
                      {visibleColumns.lastSync && <th className="py-3.5 px-4 text-[#5f5e5e] w-[13%]">Last Sync Timestamp</th>}
                      {visibleColumns.status && <th className="py-3.5 px-4 text-center text-[#5f5e5e] w-[5%]">Status</th>}
                      {visibleColumns.actions && <th className="py-3.5 px-4 text-right text-[#5f5e5e] w-[5%]">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e2d8]">
                    {(pageSize >= 9999
                      ? filteredDevices
                      : filteredDevices.slice((currentPage - 1) * pageSize, (currentPage - 1) * pageSize + pageSize)
                    ).map((device) => {
                      const isInactive = device.status === 'deleted';
                      const densityPadding = getDensityPadding(rowDensity);
                      return (
                        <tr
                          key={device.id}
                          className={`transition-colors ${
                            isInactive ? 'bg-[#f8f3eb]/40 opacity-75' : 'hover:bg-[#f8f3eb]'
                          }`}
                        >
                          {/* Device Identity Block */}
                          {visibleColumns.deviceIdentity && (
                            <td className={densityPadding}>
                              <div className="font-bold text-[#1d1c17] text-sm leading-tight">{device.name}</div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#f2ede5] text-[#5f5e5e] border border-[#e8e2d8] inline-block mt-0.5">
                                {device.device_identifier}
                              </span>
                            </td>
                          )}

                          {/* Mapped Kitchen Station */}
                          {visibleColumns.stationBinding && (
                            <td className={densityPadding}>
                              {device.station ? (
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="font-bold text-[#1d1c17] text-xs">{device.station.name}</span>
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-200 shrink-0">
                                    #KST-{device.station.id}
                                  </span>
                                </div>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#f2ede5] text-[#5f5e5e] border border-[#e8e2d8] inline-block">
                                  Unassigned / Floating
                                </span>
                              )}
                            </td>
                          )}

                          {/* Network IP Address */}
                          {visibleColumns.ipAddress && (
                            <td className={densityPadding}>
                              <div className="flex items-center gap-1 font-mono text-xs text-[#1d1c17] font-semibold">
                                <span className="material-symbols-outlined text-[15px] text-[#5f5e5e] shrink-0">router</span>
                                {device.ip_address || '0.0.0.0 (DHCP)'}
                              </div>
                            </td>
                          )}

                          {/* Live Connectivity Status */}
                          {visibleColumns.connectivity && (
                            <td className={`${densityPadding} text-center`}>
                              {device.is_online ? (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                  <span>ONLINE</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-800 text-[10px] font-bold">
                                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                  <span>OFFLINE</span>
                                </div>
                              )}
                            </td>
                          )}

                          {/* Last Sync Timestamp */}
                          {visibleColumns.lastSync && (
                            <td className={densityPadding}>
                              <div className="font-semibold text-[#1d1c17] text-xs">{formatTimeAgo(device.last_sync)}</div>
                              <div className="text-[10px] text-[#5f5e5e] font-mono leading-tight">
                                {device.last_sync ? new Date(device.last_sync).toLocaleString('en-US') : 'No sync recorded'}
                              </div>
                            </td>
                          )}

                          {/* Lifecycle Status */}
                          {visibleColumns.status && (
                            <td className={`${densityPadding} text-center`}>
                              {isInactive ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-zinc-200 text-zinc-600 border border-zinc-300">
                                  DELETED
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  ACTIVE
                                </span>
                              )}
                            </td>
                          )}

                          {/* Actions */}
                          {visibleColumns.actions && (
                            <td className={`${densityPadding} text-right`}>
                              <div className="flex items-center justify-end gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleToggleOnline(device)}
                                  disabled={isInactive}
                                  className="p-1 text-zinc-600 hover:text-amber-700 hover:bg-amber-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                  title="Toggle connectivity state"
                                >
                                  <span className="material-symbols-outlined text-[16px]">sync</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditDrawer(device)}
                                  disabled={isInactive}
                                  className="p-1 text-zinc-600 hover:text-[#ae001a] hover:bg-[#fef9f1] rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                  title="Edit device"
                                >
                                  <span className="material-symbols-outlined text-[16px]">edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeviceToDelete(device);
                                    setDeleteModalOpen(true);
                                  }}
                                  disabled={isInactive}
                                  className="p-1.5 text-zinc-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                  title="Soft delete device"
                                >
                                  <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pie de paginación */}
              <TablePaginationFooter
                currentPage={currentPage}
                totalItems={filteredDevices.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </div>
      )}

      {/* 4. Quick Launch Panel Componente Estándar */}
      <div className="mt-6">
        <KitchenQuickLinks current="kitchen-display-devices" onNavigate={onNavigate} />
      </div>

      {/* 5. Sticky Persistent KDS Management Navigation Hub Bar */}
      <NavHubBar
        title="KDS Ecosystem Nav Hub"
        titleIcon="space_dashboard"
        items={[
          {
            id: 'kitchen-stations',
            label: 'KITCHEN STATIONS',
            icon: 'soup_kitchen',
            onClick: () => onNavigate?.('kitchen-stations'),
          },
          {
            id: 'kitchen-display-devices',
            label: 'KDS DEVICES',
            icon: 'desktop_windows',
            active: true,
            onClick: () => onNavigate?.('kitchen-display-devices'),
          },
          {
            id: 'kitchen-orders',
            label: 'KITCHEN ORDERS',
            icon: 'dinner_dining',
            onClick: () => onNavigate?.('kitchen-orders'),
          },
          {
            id: 'kitchen-order-items',
            label: 'ORDER ITEMS',
            icon: 'format_list_bulleted',
            onClick: () => onNavigate?.('kitchen-order-items'),
          },
          {
            id: 'kitchen-event-log',
            label: 'KDS EVENT LOG',
            icon: 'history',
            onClick: () => onNavigate?.('kitchen-event-log'),
          },
        ]}
      />

      {/* Drawer Slide-over para Agregar / Editar Dispositivo KDS */}
      {isDrawerOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-fade-in font-sans">
            <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto">
              <div>
                {/* Header Drawer */}
                <div className="p-4 bg-[#1c1b16] text-white flex items-center justify-between border-b-4 border-[#ae001a]">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-500">
                      {drawerMode === 'add' ? 'add_to_queue' : 'edit'}
                    </span>
                    <h2 className="text-base font-bold uppercase tracking-wider">
                      {drawerMode === 'add' ? 'Register New KDS Device' : 'Edit KDS Device'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(false)}
                    className="text-zinc-400 hover:text-white p-1 rounded-full transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </div>

                {/* Body Form */}
                <form id="kds-device-form" onSubmit={handleSubmitForm} className="p-5 space-y-4 text-xs font-sans">
                  {formError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded font-semibold">
                      {formError}
                    </div>
                  )}

                  {/* Device Name */}
                  <div>
                    <label className="block text-[#1d1c17] font-bold mb-1">
                      Device Name <span className="text-[#ae001a]">*</span>
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Main Grill Display Terminal"
                      className="w-full p-2.5 bg-[#fef9f1] border border-[#e8e2d8] rounded text-xs font-semibold focus:outline-none focus:border-[#ae001a]"
                      required
                    />
                  </div>

                  {/* Device Identifier (Serial / MAC) */}
                  <div>
                    <label className="block text-[#1d1c17] font-bold mb-1">
                      Hardware Identifier (Serial / MAC) <span className="text-[#ae001a]">*</span>
                    </label>
                    <input
                      type="text"
                      value={formDeviceIdentifier}
                      onChange={(e) => setFormDeviceIdentifier(e.target.value)}
                      placeholder="e.g. DEV-001-GRILL"
                      className="w-full p-2.5 bg-[#fef9f1] border border-[#e8e2d8] rounded text-xs font-mono font-bold focus:outline-none focus:border-[#ae001a]"
                      required
                    />
                  </div>

                  {/* Network IP Address */}
                  <div>
                    <label className="block text-[#1d1c17] font-bold mb-1">Network IP Address Assignment</label>
                    <input
                      type="text"
                      value={formIpAddress}
                      onChange={(e) => setFormIpAddress(e.target.value)}
                      placeholder="e.g. 192.168.1.101"
                      className="w-full p-2.5 bg-[#fef9f1] border border-[#e8e2d8] rounded text-xs font-mono font-semibold focus:outline-none focus:border-[#ae001a]"
                    />
                    <p className="text-[10px] text-[#5f5e5e] mt-1">Leave blank if using automatic DHCP IP assignment.</p>
                  </div>

                  {/* Mapped Kitchen Station */}
                  <div>
                    <label className="block text-[#1d1c17] font-bold mb-1">Mapped Kitchen Station</label>
                    <select
                      value={formStationId}
                      onChange={(e) => setFormStationId(e.target.value)}
                      className="w-full p-2.5 bg-[#fef9f1] border border-[#e8e2d8] rounded text-xs font-semibold focus:outline-none focus:border-[#ae001a] cursor-pointer"
                    >
                      <option value="">-- Unassigned / Floating Unit --</option>
                      {stations.map((s) => (
                        <option key={s.id} value={String(s.id)}>
                          {s.name} (#KST-{s.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Initial Online Network State */}
                  <div className="flex items-center justify-between p-3 bg-[#f8f3eb]/50 border border-[#e8e2d8] rounded">
                    <div>
                      <span className="font-bold text-[#1d1c17] block">Initial Connectivity State</span>
                      <span className="text-[10px] text-[#5f5e5e]">Simulate network ping connectivity</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formIsOnline}
                        onChange={(e) => setFormIsOnline(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ae001a]" />
                    </label>
                  </div>
                </form>
              </div>

              {/* Footer Actions */}
              <div className="p-4 bg-[#f8f3eb]/60 border-t border-[#e8e2d8] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="px-4 py-2 bg-white border border-[#e8e2d8] rounded text-[#1d1c17] font-bold hover:bg-[#fef9f1] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="kds-device-form"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[#ae001a] hover:bg-[#900015] text-white font-bold rounded transition-colors shadow disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{drawerMode === 'add' ? 'Register Device' : 'Save Changes'}</span>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal Confirmación de Eliminación Lógica */}
      {deleteModalOpen && deviceToDelete && (
        <AppModal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          title="Archive KDS Hardware Device"
          subtitle={`Are you sure you want to archive "${deviceToDelete.name}" (${deviceToDelete.device_identifier})?`}
        >
          <div className="space-y-4 text-xs font-sans">
            <p className="text-[#5f5e5e]">
              Archiving this hardware unit will set its lifecycle status to <strong className="text-[#1d1c17]">DELETED</strong> and disable active network sync routing. Existing historical event logs will be preserved.
            </p>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-600">warning</span>
              <span>This record can be restored later by setting the filter status to "Deleted".</span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e8e2d8]">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="px-3.5 py-2 bg-white border border-[#e8e2d8] rounded text-[#1d1c17] font-bold hover:bg-[#fef9f1] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-3.5 py-2 bg-red-700 hover:bg-red-800 text-white font-bold rounded transition-colors shadow disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                    <span>Archiving...</span>
                  </>
                ) : (
                  <span>Archive Device</span>
                )}
              </button>
            </div>
          </div>
        </AppModal>
      )}
    </div>
  );
};

export default KitchenDisplayDevicesView;
