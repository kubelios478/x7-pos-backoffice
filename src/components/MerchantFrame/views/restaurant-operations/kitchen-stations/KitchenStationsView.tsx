import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../../lib/auth-storage';
import { KitchenQuickLinks } from './KitchenQuickLinks';
import { AppModal } from '../../../shared/AppModal';
import { HeaderQuickTabs } from '../../../../shared/HeaderQuickTabs';
import { TableOptionsMenu, NoColumnsEmptyState, TablePaginationFooter, getDensityPadding } from '../../../../shared/TableOptionsMenu';
import { NavHubBar } from '../../../../shared/NavHubBar';

export type KitchenStationType = 'HOT' | 'COLD' | 'BAR' | 'DESSERT' | 'PREP' | 'PACKING' | 'EXPO';
export type KitchenDisplayMode = 'AUTO' | 'MANUAL' | 'SUMMARY' | 'GRID';
export type KitchenStationStatus = 'active' | 'deleted';

export interface KitchenStation {
  id: number;
  merchant_id: number;
  name: string;
  station_type: KitchenStationType;
  display_mode: KitchenDisplayMode;
  display_order: number;
  printer_name: string | null;
  is_active: boolean;
  isActive?: boolean;
  status: KitchenStationStatus;
  created_at: string;
  updated_at: string;
}

interface KitchenStationsViewProps {
  onNavigate?: (view: string) => void;
}

const MOCK_KITCHEN_STATIONS: KitchenStation[] = [
  {
    id: 101,
    merchant_id: 1,
    name: 'Hot Line & Grill Station',
    station_type: 'HOT',
    display_mode: 'AUTO',
    display_order: 1,
    printer_name: 'Kitchen Printer 1 (Grill)',
    is_active: true,
    status: 'active',
    created_at: '2026-01-15T08:30:00Z',
    updated_at: '2026-02-10T14:20:00Z',
  },
  {
    id: 102,
    merchant_id: 1,
    name: 'Cold Prep & Salad Station',
    station_type: 'COLD',
    display_mode: 'AUTO',
    display_order: 2,
    printer_name: 'Kitchen Printer 2 (Cold)',
    is_active: true,
    status: 'active',
    created_at: '2026-01-15T08:45:00Z',
    updated_at: '2026-02-10T14:22:00Z',
  },
  {
    id: 103,
    merchant_id: 1,
    name: 'Main Bar & Beverage Station',
    station_type: 'BAR',
    display_mode: 'MANUAL',
    display_order: 3,
    printer_name: 'Bar Receipt Printer',
    is_active: true,
    status: 'active',
    created_at: '2026-01-16T10:00:00Z',
    updated_at: '2026-02-11T09:15:00Z',
  },
  {
    id: 104,
    merchant_id: 1,
    name: 'Desserts & Bakery Hub',
    station_type: 'DESSERT',
    display_mode: 'MANUAL',
    display_order: 4,
    printer_name: null,
    is_active: true,
    status: 'active',
    created_at: '2026-01-20T11:15:00Z',
    updated_at: '2026-02-12T16:00:00Z',
  },
  {
    id: 105,
    merchant_id: 1,
    name: 'Expo & Final Quality Check',
    station_type: 'EXPO',
    display_mode: 'AUTO',
    display_order: 5,
    printer_name: 'Expo Master Ticket Printer',
    is_active: true,
    status: 'active',
    created_at: '2026-01-22T09:00:00Z',
    updated_at: '2026-02-15T12:00:00Z',
  },
  {
    id: 106,
    merchant_id: 1,
    name: 'Prep Kitchen (Secondary)',
    station_type: 'PREP',
    display_mode: 'MANUAL',
    display_order: 6,
    printer_name: null,
    is_active: false,
    status: 'deleted',
    created_at: '2026-01-05T07:00:00Z',
    updated_at: '2026-02-01T18:00:00Z',
  },
];

export const KitchenStationsView: React.FC<KitchenStationsViewProps> = ({ onNavigate }) => {
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros y vista
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [stationTypeFilter, setStationTypeFilter] = useState<string>('All');
  const [displayModeFilter, setDisplayModeFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Estados para Personalizar Columnas, Densidad y Paginación en la Tabla
  const [visibleColumns, setVisibleColumns] = useState<{
    refDate: boolean;
    nameSequence: boolean;
    stationType: boolean;
    displayMode: boolean;
    printer: boolean;
    activeRouting: boolean;
    status: boolean;
    actions: boolean;
  }>({
    refDate: true,
    nameSequence: true,
    stationType: true,
    displayMode: true,
    printer: true,
    activeRouting: true,
    status: true,
    actions: true,
  });
  const [rowDensity, setRowDensity] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, stationTypeFilter, displayModeFilter, statusFilter, pageSize]);

  // Estados de Drawer / Modal de Edición y Creación
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add');
  const [editingStation, setEditingStation] = useState<KitchenStation | null>(null);

  // Formulario
  const [formName, setFormName] = useState<string>('');
  const [formStationType, setFormStationType] = useState<KitchenStationType>('HOT');
  const [formDisplayMode, setFormDisplayMode] = useState<KitchenDisplayMode>('AUTO');
  const [formDisplayOrder, setFormDisplayOrder] = useState<number>(1);
  const [formPrinterName, setFormPrinterName] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formStatus, setFormStatus] = useState<KitchenStationStatus>('active');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Estado para Modal de Eliminación (Soft Delete)
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [stationToDelete, setStationToDelete] = useState<KitchenStation | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const topRef = useRef<HTMLDivElement | null>(null);
  const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, []);

  const fetchStations = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const statusQuery = statusFilter === 'Deleted' ? 'deleted' : statusFilter === 'Active' ? 'active' : '';
      const params = new URLSearchParams();
      if (statusQuery) params.append('status', statusQuery);
      if (stationTypeFilter !== 'All') params.append('stationType', stationTypeFilter);
      if (displayModeFilter !== 'All') params.append('displayMode', displayModeFilter);
      params.append('sortBy', 'displayOrder');
      params.append('sortOrder', 'ASC');

      const res = await fetch(`${API_BASE}/kitchen-station?${params.toString()}`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (res.ok) {
        const json = await res.json();
        const rawList = Array.isArray(json) ? json : json.data || [];
        const dataList = rawList.map((st: any) => ({
          ...st,
          is_active: st.isActive ?? st.is_active ?? true,
          isActive: st.isActive ?? st.is_active ?? true,
          station_type: st.stationType ?? st.station_type ?? 'PREP',
          stationType: st.stationType ?? st.station_type ?? 'PREP',
          display_mode: st.displayMode ?? st.display_mode ?? 'AUTO',
          displayMode: st.displayMode ?? st.display_mode ?? 'AUTO',
          display_order: st.displayOrder ?? st.display_order ?? 1,
          displayOrder: st.displayOrder ?? st.display_order ?? 1,
          printer_name: st.printerName ?? st.printer_name ?? null,
          printerName: st.printerName ?? st.printer_name ?? null,
          created_at: st.createdAt ?? st.created_at ?? new Date().toISOString(),
          createdAt: st.createdAt ?? st.created_at ?? new Date().toISOString(),
        }));
        setStations(dataList);
      } else {
        setStations([]);
      }
    } catch (err) {
      console.warn('API error fetching kitchen stations:', err);
      setError('Failed to fetch kitchen stations from backend API.');
      setStations([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStations();
  }, [stationTypeFilter, displayModeFilter, statusFilter]);

  // Filtrado alfanumérico en cliente para respuesta ultrarrápida
  const filteredStations = stations.filter((station) => {
    const matchesSearch =
      searchQuery.trim() === '' ||
      station.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `#kst-${station.id}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (station.printer_name && station.printer_name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = stationTypeFilter === 'All' || station.station_type === stationTypeFilter;
    const matchesMode = displayModeFilter === 'All' || station.display_mode === displayModeFilter;
    const matchesStatus =
      statusFilter === 'Deleted'
        ? station.status === 'deleted'
        : station.status === 'active';

    return matchesSearch && matchesType && matchesMode && matchesStatus;
  });

  // Toggle interactivo is_active instantáneo (Real-Time Toggle)
  const handleToggleActive = async (station: KitchenStation) => {
    const currentActive = station.isActive ?? station.is_active ?? true;
    const nextActive = !currentActive;

    // Actualización optimista en cliente
    setStations((prev) =>
      prev.map((item) => (item.id === station.id ? { ...item, is_active: nextActive, isActive: nextActive } : item))
    );

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/kitchen-station/${station.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ isActive: nextActive }),
      });

      if (!res.ok) {
        // Revertir si falla la API
        fetchStations(true);
      }
    } catch (err) {
      console.error('Error toggling kitchen station status:', err);
      fetchStations(true);
    }
  };

  // Abrir Drawer de creación
  const handleOpenAddDrawer = () => {
    setDrawerMode('add');
    setEditingStation(null);
    setFormName('');
    setFormStationType('HOT');
    setFormDisplayMode('AUTO');
    setFormDisplayOrder(stations.length + 1);
    setFormPrinterName('');
    setFormIsActive(true);
    setFormStatus('active');
    setFormError(null);
    setIsDrawerOpen(true);
  };

  // Abrir Drawer de edición
  const handleOpenEditDrawer = (station: KitchenStation) => {
    setDrawerMode('edit');
    setEditingStation(station);
    setFormName(station.name);
    setFormStationType(station.station_type);
    setFormDisplayMode(station.display_mode);
    setFormDisplayOrder(station.display_order);
    setFormPrinterName(station.printer_name || '');
    setFormIsActive(station.is_active);
    setFormStatus(station.status || 'active');
    setFormError(null);
    setIsDrawerOpen(true);
  };

  // Enviar formulario (Crear / Editar)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Station name is required.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      let res: Response;
      if (drawerMode === 'add') {
        const createPayload = {
          name: formName.trim(),
          stationType: formStationType,
          displayMode: formDisplayMode,
          displayOrder: Number(formDisplayOrder),
          ...(formPrinterName.trim() ? { printerName: formPrinterName.trim() } : {}),
        };
        res = await fetch(`${API_BASE}/kitchen-station`, {
          method: 'POST',
          headers,
          body: JSON.stringify(createPayload),
        });
      } else {
        const isDeleted = formStatus === 'deleted';
        const updatePayload = {
          name: formName.trim(),
          stationType: formStationType,
          displayMode: formDisplayMode,
          displayOrder: Number(formDisplayOrder),
          ...(formPrinterName.trim() ? { printerName: formPrinterName.trim() } : {}),
          isActive: isDeleted ? false : formIsActive,
          status: formStatus,
        };
        res = await fetch(`${API_BASE}/kitchen-station/${editingStation?.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(updatePayload),
        });
      }

      if (res.ok) {
        setIsDrawerOpen(false);
        fetchStations(true);
      } else {
        const errorJson = await res.json().catch(() => ({}));
        const msg = errorJson.message
          ? Array.isArray(errorJson.message)
            ? errorJson.message.join(', ')
            : errorJson.message
          : 'Error al guardar la estación de cocina.';
        setFormError(msg);
      }
    } catch (err) {
      setFormError('Error de red al conectar con el servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirmar eliminación (Soft Delete)
  const handleConfirmDelete = async () => {
    if (!stationToDelete) return;
    setIsDeleting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/kitchen-station/${stationToDelete.id}`, {
        method: 'DELETE',
        headers,
      });

      if (res.ok || res.status === 404) {
        setStations((prev) => prev.filter((s) => s.id !== stationToDelete.id));
      } else {
        setStations((prev) => prev.filter((s) => s.id !== stationToDelete.id));
      }
    } catch (err) {
      setStations((prev) => prev.filter((s) => s.id !== stationToDelete.id));
    } finally {
      setIsDeleting(false);
      setDeleteModalOpen(false);
      setStationToDelete(null);
    }
  };

  // Helper para insignias de tipo de estación
  const getStationTypeBadge = (type: KitchenStationType) => {
    switch (type) {
      case 'HOT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-red-100 text-red-800 border border-red-200">
            <span className="material-symbols-outlined text-[14px]">local_fire_department</span>
            HOT LINE
          </span>
        );
      case 'COLD':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-cyan-100 text-cyan-800 border border-cyan-200">
            <span className="material-symbols-outlined text-[14px]">ac_unit</span>
            COLD PREP
          </span>
        );
      case 'BAR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <span className="material-symbols-outlined text-[14px]">local_bar</span>
            BAR & DRINKS
          </span>
        );
      case 'DESSERT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-pink-100 text-pink-800 border border-pink-200">
            <span className="material-symbols-outlined text-[14px]">icecream</span>
            DESSERTS
          </span>
        );
      case 'EXPO':
      case 'PACKING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <span className="material-symbols-outlined text-[14px]">check_circle</span>
            EXPO / PASS
          </span>
        );
      case 'PREP':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <span className="material-symbols-outlined text-[14px]">flatware</span>
            PREP KITCHEN
          </span>
        );
    }
  };

  // Helper para modo KDS
  const getDisplayModePill = (mode: KitchenDisplayMode) => {
    switch (mode) {
      case 'AUTO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            AUTO DISPATCH
          </span>
        );
      case 'MANUAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            MANUAL QUEUE
          </span>
        );
      case 'SUMMARY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            SUMMARY VIEW
          </span>
        );
      case 'GRID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            GRID MATRIX
          </span>
        );
      default:
        return null;
    }
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    stationTypeFilter !== 'All' ||
    displayModeFilter !== 'All' ||
    statusFilter !== 'All';

  const clearFilters = () => {
    setSearchQuery('');
    setStationTypeFilter('All');
    setDisplayModeFilter('All');
    setStatusFilter('All');
  };

  // Métricas KPI en tiempo real
  const totalActiveCount = stations.filter(
    (s) => (s.is_active ?? s.isActive) && s.status === 'active'
  ).length;
  const printersBoundCount = stations.filter(
    (s) => s.printer_name && s.printer_name.trim() !== ''
  ).length;
  const expoStationsCount = stations.filter(
    (s) => (s.station_type === 'EXPO' || s.station_type === 'PACKING') && s.status === 'active'
  ).length;

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans pb-20">
      <div ref={topRef} />

      {/* 1. Header Card Workspace */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <div>
          <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
            KITCHEN STATIONS & PREP ROUTING WORKSPACE
          </h2>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Configure physical prep stations, assign backup hardware printers, customize KDS screen display modes, and optimize high-speed ticket dispatch across prep lines.
          </p>
        </div>
      </div>

      {/* 1.5 Real-Time Station KPI Health Header Strip (3 Cuadrados alineados en 1 sola línea horizontal) */}
      <div className="grid grid-cols-3 gap-4 w-full">
        {/* KPI 1: Active Stations */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shrink-0">
              <span className="material-symbols-outlined text-xl">soup_kitchen</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Total Active Stations
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {totalActiveCount}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
            OPERATIONAL
          </span>
        </div>

        {/* KPI 2: Printers Bound */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200 shrink-0">
              <span className="material-symbols-outlined text-xl">print</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Hardware Printers
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {printersBoundCount}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
            HARDWARE BOUND
          </span>
        </div>

        {/* KPI 3: Expo / Pass Stations */}
        <div className="bg-white border border-[#e8e2d8] p-4 rounded-xl shadow-xs flex items-center justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200 shrink-0">
              <span className="material-symbols-outlined text-xl">check_circle</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider truncate">
                Expo / Pass Stations
              </div>
              <div className="text-2xl font-extrabold text-[#1d1c17]">
                {expoStationsCount}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200 shrink-0">
            EXPO READY
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
              placeholder="Search stations by name, ID (#KST-101), or hardware printer name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md transition-all font-sans"
              aria-label="Search kitchen stations"
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
            {/* Station Type Selector */}
            <select
              value={stationTypeFilter}
              onChange={(e) => setStationTypeFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] outline-none font-sans text-secondary cursor-pointer"
              aria-label="Filter by station type"
            >
              <option value="All">All Station Types</option>
              <option value="HOT">HOT LINE</option>
              <option value="COLD">COLD PREP</option>
              <option value="EXPO">EXPO / PASS</option>
              <option value="BAR">BAR & DRINKS</option>
              <option value="DESSERT">DESSERTS</option>
              <option value="PREP">PREP KITCHEN</option>
            </select>

            {/* Display Mode Selector */}
            <select
              value={displayModeFilter}
              onChange={(e) => setDisplayModeFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] outline-none font-sans text-secondary cursor-pointer"
              aria-label="Filter by display mode"
            >
              <option value="All">All Display Modes</option>
              <option value="AUTO">AUTO DISPATCH</option>
              <option value="MANUAL">MANUAL QUEUE</option>
              <option value="SUMMARY">SUMMARY VIEW</option>
              <option value="GRID">GRID MATRIX</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] outline-none font-sans text-secondary cursor-pointer"
              aria-label="Filter by status"
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
              ADD KITCHEN STATION
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Core Workspace Grid (Table View vs Quick-Launch Cards Grid View) */}
      {isLoading ? (
        <div className="bg-white border border-[#e8e2d8] p-12 text-center rounded shadow-sm">
          <span className="material-symbols-outlined text-[#ae001a] animate-spin text-4xl mb-2">
            progress_activity
          </span>
          <p className="text-xs font-bold uppercase tracking-wider text-[#5f5e5e]">
            Loading Kitchen Stations Directory...
          </p>
        </div>
      ) : filteredStations.length === 0 ? (
        <div className="bg-white border border-[#e8e2d8] p-12 text-center rounded shadow-sm space-y-3">
          <span className="material-symbols-outlined text-4xl text-zinc-400">soup_kitchen</span>
          <p className="text-body-md text-[#5f5e5e] font-bold uppercase tracking-wider">
            No physical kitchen prep stations matched your search criteria.
          </p>
          <p className="text-xs text-zinc-500">
            Try resetting your active search filters or click 'Add Kitchen Station' to define new prep routing targets.
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-2 gap-3.5">
          {filteredStations.map((station) => {
            const isInactive = !station.is_active;
            const isDeleted = station.status === 'deleted';
            return (
              <div
                key={station.id}
                className={`bg-white border border-[#e8e2d8] rounded-lg p-4 shadow-xs flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:border-[#ae001a]/40 ${
                  isInactive ? 'bg-[#f8f3eb]/40 opacity-75' : ''
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2 border-b border-[#e8e2d8] pb-2.5">
                    <div>
                      <div className="text-[10px] font-bold text-[#5f5e5e] uppercase tracking-wider font-sans">
                        #KST-{station.id}
                      </div>
                      <h3
                        className={`text-sm font-bold text-[#1d1c17] font-sans ${
                          isInactive ? 'line-through' : ''
                        }`}
                      >
                        {station.name}
                      </h3>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#f2ede5] text-[#1d1c17] border border-[#e8e2d8] shrink-0 font-sans">
                      Order #{station.display_order}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {getStationTypeBadge(station.station_type)}
                    {getDisplayModePill(station.display_mode)}
                  </div>

                  <div className="pt-0.5 flex items-center justify-between text-xs font-sans">
                    <div className="flex items-center gap-1.5 text-zinc-600">
                      <span className="material-symbols-outlined text-[15px] text-zinc-500">
                        print
                      </span>
                      <span className="font-semibold text-[11px] truncate max-w-[160px]">
                        {station.printer_name || 'No Printer Assigned'}
                      </span>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        disabled={isDeleted}
                        checked={station.is_active}
                        onChange={() => handleToggleActive(station)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4.5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#ae001a] disabled:opacity-40 disabled:cursor-not-allowed" />
                    </label>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-[#e8e2d8] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigate) {
                        onNavigate('kitchen-display-devices');
                      }
                    }}
                    className="flex-1 py-1.5 px-2.5 bg-[#ae001a] hover:bg-[#930015] text-white font-bold text-[11px] uppercase tracking-wider rounded transition-colors duration-200 flex items-center justify-center gap-1.5 shadow-xs cursor-pointer font-sans"
                  >
                    <span className="material-symbols-outlined text-[15px]">monitor</span>
                    LAUNCH KDS DISPLAY
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditDrawer(station)}
                    disabled={isDeleted}
                    className="p-1.5 text-zinc-600 hover:text-[#ae001a] hover:bg-[#fef9f1] border border-[#e8e2d8] rounded transition-colors disabled:opacity-30 cursor-pointer"
                    title="Edit Station"
                  >
                    <span className="material-symbols-outlined text-[15px]">edit</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-[#e8e2d8] rounded shadow-sm relative">
          <HeaderQuickTabs
            title="KITCHEN STATIONS & PREP ROUTING DIRECTORY"
            badgeCount={filteredStations.length <= pageSize ? `${filteredStations.length} station${filteredStations.length === 1 ? '' : 's'}` : `${Math.min(filteredStations.length, pageSize)} / ${filteredStations.length} stations`}
            tabs={[]}
            rightElement={
              <TableOptionsMenu
                onExportCSV={() => {
                  const headers = ['ID', 'Name', 'Station Type', 'Display Mode', 'Printer', 'Status'];
                  const rows = filteredStations.map((s) => [
                    s.id,
                    `"${(s.name || '').replace(/"/g, '""')}"`,
                    s.station_type,
                    s.display_mode,
                    `"${(s.printer_name || '').replace(/"/g, '""')}"`,
                    s.is_active ? 'Active' : 'Inactive',
                  ]);
                  const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
                  const link = document.createElement('a');
                  link.href = encodeURI(csv);
                  link.download = `kitchen_stations_${new Date().toISOString().slice(0, 10)}.csv`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                onPrint={() => window.print()}
                printLabel="Print Kitchen Stations Directory"
                onCopySummary={() => {
                  const summaryText = `Kitchen Stations Directory Summary:\n- Total Stations: ${filteredStations.length}\n- Active Stations: ${filteredStations.filter((s) => s.is_active).length}\n- Inactive/Deleted: ${filteredStations.filter((s) => !s.is_active || s.status === 'deleted').length}`;
                  navigator.clipboard.writeText(summaryText);
                }}
                onReload={fetchStations}
                columns={[
                  { key: 'refDate', label: 'Station Ref & Date' },
                  { key: 'nameSequence', label: 'Station Name & Sequence' },
                  { key: 'stationType', label: 'Station Type Role' },
                  { key: 'displayMode', label: 'KDS Display Mode' },
                  { key: 'printer', label: 'Hardware Printer Binding' },
                  { key: 'activeRouting', label: 'Active Routing' },
                  { key: 'status', label: 'Lifecycle Status' },
                  { key: 'actions', label: 'Actions' },
                ]}
                visibleColumns={visibleColumns}
                onToggleColumn={(key) =>
                  setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key as keyof typeof visibleColumns] }))
                }
                rowDensity={rowDensity}
                onChangeDensity={setRowDensity}
                totalItems={filteredStations.length}
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
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-sans">
                  <thead>
                    <tr className="bg-[#ece8e0] text-[#5f5e5e] uppercase text-[11px] tracking-wider font-bold border-b border-[#e8e2d8]">
                      {visibleColumns.refDate && <th className="py-3.5 px-4 text-[#5f5e5e]">Station Ref & Date</th>}
                      {visibleColumns.nameSequence && <th className="py-3.5 px-4 text-[#5f5e5e]">Station Name & Sequence</th>}
                      {visibleColumns.stationType && <th className="py-3.5 px-4 text-[#5f5e5e]">Station Type Role</th>}
                      {visibleColumns.displayMode && <th className="py-3.5 px-4 text-[#5f5e5e]">KDS Display Mode</th>}
                      {visibleColumns.printer && <th className="py-3.5 px-4 text-[#5f5e5e]">Hardware Printer Binding</th>}
                      {visibleColumns.activeRouting && <th className="py-3.5 px-4 text-center text-[#5f5e5e]">Active Routing</th>}
                      {visibleColumns.status && <th className="py-3.5 px-4 text-center text-[#5f5e5e]">Lifecycle Status</th>}
                      {visibleColumns.actions && <th className="py-3.5 px-4 text-right text-[#5f5e5e]">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e2d8]">
                    {(pageSize >= 9999
                      ? filteredStations
                      : filteredStations.slice((currentPage - 1) * pageSize, (currentPage - 1) * pageSize + pageSize)
                    ).map((station) => {
                      const isInactive = !station.is_active;
                      const isDeleted = station.status === 'deleted';
                      const densityPadding = getDensityPadding(rowDensity);
                      return (
                        <tr
                          key={station.id}
                          className={`transition-colors ${
                            isInactive ? 'bg-[#f8f3eb]/40 opacity-75' : 'hover:bg-[#f8f3eb]'
                          }`}
                        >
                          {/* Reference ID & Date */}
                          {visibleColumns.refDate && (
                            <td className={`${densityPadding} whitespace-nowrap`}>
                              <div className="font-bold text-[#1d1c17]">#KST-{station.id}</div>
                              <div className="text-[10px] text-[#5f5e5e]">
                                {new Date(station.created_at).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </div>
                            </td>
                          )}

                          {/* Station Name & Order Badge */}
                          {visibleColumns.nameSequence && (
                            <td className={densityPadding}>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-bold text-sm text-[#1d1c17] ${
                                    isInactive ? 'line-through' : ''
                                  }`}
                                >
                                  {station.name}
                                </span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#f2ede5] text-[#5f5e5e] border border-[#e8e2d8]">
                                  Order #{station.display_order}
                                </span>
                              </div>
                            </td>
                          )}

                          {/* Station Type Badge */}
                          {visibleColumns.stationType && (
                            <td className={`${densityPadding} whitespace-nowrap`}>
                              {getStationTypeBadge(station.station_type)}
                            </td>
                          )}

                          {/* Display Mode Pill */}
                          {visibleColumns.displayMode && (
                            <td className={`${densityPadding} whitespace-nowrap`}>
                              {getDisplayModePill(station.display_mode)}
                            </td>
                          )}

                          {/* Printer Hardware Link */}
                          {visibleColumns.printer && (
                            <td className={`${densityPadding} whitespace-nowrap`}>
                              {station.printer_name ? (
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                                  <span className="material-symbols-outlined text-[16px] text-zinc-500">
                                    print
                                  </span>
                                  {station.printer_name}
                                </div>
                              ) : (
                                <span className="text-xs italic text-zinc-400">No Printer Assigned</span>
                              )}
                            </td>
                          )}

                          {/* Active Status Switch */}
                          {visibleColumns.activeRouting && (
                            <td className={`${densityPadding} text-center whitespace-nowrap`}>
                              <label className="relative inline-flex items-center cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  disabled={isDeleted}
                                  checked={station.is_active}
                                  onChange={() => handleToggleActive(station)}
                                  className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ae001a] disabled:opacity-40 disabled:cursor-not-allowed" />
                              </label>
                            </td>
                          )}

                          {/* Record Lifecycle Badge */}
                          {visibleColumns.status && (
                            <td className={`${densityPadding} text-center whitespace-nowrap`}>
                              {isDeleted ? (
                                <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-zinc-200 text-zinc-600">
                                  DELETED
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  ACTIVE
                                </span>
                              )}
                            </td>
                          )}

                          {/* Actions */}
                          {visibleColumns.actions && (
                            <td className={`${densityPadding} text-right whitespace-nowrap`}>
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditDrawer(station)}
                                  disabled={isDeleted}
                                  className="p-1.5 text-zinc-600 hover:text-[#ae001a] hover:bg-[#fef9f1] rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Edit station"
                                >
                                  <span className="material-symbols-outlined text-[18px]">edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStationToDelete(station);
                                    setDeleteModalOpen(true);
                                  }}
                                  disabled={isDeleted}
                                  className="p-1.5 text-zinc-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Soft delete station"
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

              {/* Pie de paginación con controles Anterior / Siguiente */}
              <TablePaginationFooter
                currentPage={currentPage}
                totalItems={filteredStations.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </div>
      )}

      {/* 4. Quick Launch Panel Componente Estándar (QuickLaunchPanel) */}
      <div className="mt-6">
        <KitchenQuickLinks current="kitchen-stations" onNavigate={onNavigate} />
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
            active: true,
            onClick: () => onNavigate?.('kitchen-stations'),
          },
          {
            id: 'kitchen-display-devices',
            label: 'KDS DEVICES',
            icon: 'desktop_windows',
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
          {
            id: 'kitchen-analytics',
            label: 'KDS ANALYTICS',
            icon: 'monitoring',
            onClick: () => onNavigate?.('kitchen-analytics'),
          },
        ]}
      />

      {/* Portal: Drawer Modal (Creación y Edición de Estación KDS) */}
      {isDrawerOpen &&
        createPortal(
          <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-6 md:pb-12 backdrop-blur-xs font-sans">
            <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in max-h-[90vh] flex flex-col">
              {/* Drawer Header */}
              <div className="p-4 bg-[#222222] text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#ae001a] text-xl">
                    soup_kitchen
                  </span>
                  <h3 className="font-bold text-sm tracking-wider uppercase">
                    {drawerMode === 'add' ? 'Configure New Kitchen Station' : 'Edit Kitchen Station'}
                  </h3>
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              {/* Drawer Form Body */}
              <form onSubmit={handleSubmitForm} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 font-medium">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="block text-[#1d1c17] font-bold uppercase tracking-wider mb-1">
                    Station Name <span className="text-[#ae001a]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Hot Line & Grill Station"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded focus:border-[#ae001a] outline-none text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#1d1c17] font-bold uppercase tracking-wider mb-1">
                      Station Role Type
                    </label>
                    <select
                      value={formStationType}
                      onChange={(e) => setFormStationType(e.target.value as KitchenStationType)}
                      className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded focus:border-[#ae001a] outline-none text-xs cursor-pointer"
                    >
                      <option value="HOT">HOT LINE</option>
                      <option value="COLD">COLD PREP</option>
                      <option value="EXPO">EXPO / PASS</option>
                      <option value="BAR">BAR & DRINKS</option>
                      <option value="DESSERT">DESSERTS</option>
                      <option value="PREP">PREP KITCHEN</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#1d1c17] font-bold uppercase tracking-wider mb-1">
                      KDS Display Mode
                    </label>
                    <select
                      value={formDisplayMode}
                      onChange={(e) => setFormDisplayMode(e.target.value as KitchenDisplayMode)}
                      className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded focus:border-[#ae001a] outline-none text-xs cursor-pointer"
                    >
                      <option value="AUTO">AUTO DISPATCH</option>
                      <option value="MANUAL">MANUAL QUEUE</option>
                      <option value="SUMMARY">SUMMARY VIEW</option>
                      <option value="GRID">GRID MATRIX</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#1d1c17] font-bold uppercase tracking-wider mb-1">
                      Display Order Sequence
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={formDisplayOrder}
                      onChange={(e) => setFormDisplayOrder(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded focus:border-[#ae001a] outline-none text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[#1d1c17] font-bold uppercase tracking-wider mb-1">
                      Backup Hardware Printer
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Kitchen Printer 1"
                      value={formPrinterName}
                      onChange={(e) => setFormPrinterName(e.target.value)}
                      className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded focus:border-[#ae001a] outline-none text-xs"
                    />
                  </div>
                </div>

                {drawerMode === 'edit' && (
                  <div>
                    <label className="block text-[#1d1c17] font-bold uppercase tracking-wider mb-1">
                      Lifecycle Status
                    </label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as KitchenStationStatus)}
                      className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded focus:border-[#ae001a] outline-none text-xs cursor-pointer"
                    >
                      <option value="active">ACTIVE</option>
                      <option value="deleted">DELETED</option>
                    </select>
                  </div>
                )}

                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="rounded border-[#e8e2d8] text-[#ae001a] focus:ring-[#ae001a]"
                    />
                    <span className="text-xs font-bold text-[#1d1c17] uppercase tracking-wider">
                      Enable Active Station Routing
                    </span>
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-[#e8e2d8]">
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(false)}
                    className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] font-bold uppercase text-xs hover:bg-[#f2ede5] transition-colors rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-[#ae001a] text-white font-bold uppercase text-xs hover:bg-[#930015] transition-colors rounded flex items-center gap-2"
                  >
                    {isSubmitting && (
                      <span className="material-symbols-outlined text-sm animate-spin">
                        progress_activity
                      </span>
                    )}
                    {drawerMode === 'add' ? 'Save Station' : 'Update Station'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal de Confirmación de Eliminación (Soft Delete) */}
      {deleteModalOpen && (
        <AppModal
          onClose={() => setDeleteModalOpen(false)}
          title="Soft Delete Kitchen Station"
          size="md"
        >
          <div className="p-6 space-y-4 text-xs font-sans text-[#1d1c17]">
            <p>
              Are you sure you want to soft-delete kitchen station{' '}
              <strong className="text-[#ae001a]">{stationToDelete?.name}</strong>?
            </p>
            <p className="text-[#5f5e5e]">
              Deactivating or soft-deleting this station will flag its status as DELETED and disable real-time order item routing to associated KDS screens.
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#e8e2d8]">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] font-bold uppercase text-xs hover:bg-[#f2ede5] transition-colors rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 bg-[#ae001a] text-white font-bold uppercase text-xs hover:bg-[#930015] transition-colors rounded cursor-pointer flex items-center gap-2"
              >
                {isDeleting && (
                  <span className="material-symbols-outlined text-sm animate-spin">
                    progress_activity
                  </span>
                )}
                Confirm Delete
              </button>
            </div>
          </div>
        </AppModal>
      )}
    </div>
  );
};

export default KitchenStationsView;
