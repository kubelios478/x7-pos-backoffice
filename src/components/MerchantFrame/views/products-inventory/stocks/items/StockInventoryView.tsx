import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, getStoredUser } from '../../../../../../lib/auth-storage';
import { QuickLaunchPanel } from '../../../../shared/QuickLaunchPanel';
import { EmergencySupportModal } from '../../../../modals/QuickActionModals';

interface Product {
  id: number;
  name: string;
  sku?: string;
}

interface Variant {
  id: number;
  name: string;
}

interface Location {
  id: number;
  name: string;
}

interface Supply {
  id: number;
  name: string;
  sku?: string | null;
  code?: string | null;
}

interface StockItem {
  id: number;
  currentQty: number;
  minimumQty: number | null;
  product: Product | null;
  variant: Variant | null;
  supply: Supply | null;
  location: Location | null;
}

interface StockInventoryViewProps {
  onNavigate?: (view: string) => void;
}

export const StockInventoryView: React.FC<StockInventoryViewProps> = ({ onNavigate }) => {
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Ajuste de stock manual
  const [isAdjustOpen, setIsAdjustOpen] = useState<boolean>(false);
  const [selectedItemForAdjust, setSelectedItemForAdjust] = useState<StockItem | null>(null);
  const [adjustValue, setAdjustValue] = useState<number>(0);
  const [adjustType, setAdjustType] = useState<'absolute' | 'relative'>('absolute');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState<boolean>(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Historial de movimientos de stock (Drawer)
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [selectedItemForHistory, setSelectedItemForHistory] = useState<StockItem | null>(null);
  const [historyMovements, setHistoryMovements] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const currentUser = getStoredUser();
  const isAdministrator = ['merchant_admin', 'admin', 'super_admin', 'SaaS Owner'].includes(currentUser?.role || '');

  // Filtros
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [locationFilter, setLocationFilter] = useState<string>('All');
  const [outOfStockOnly, setOutOfStockOnly] = useState<boolean>(false);

  // Soporte
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);

  // Grupos expandidos (key: productId-variantId)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const topRef = useRef<HTMLDivElement | null>(null);
  const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'instant' });
    }
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      // Cargar ítems de stock (soporta materias primas /v1/raw-material-stock/items e ítems comerciales /items)
      let itemsRes = await fetch(`${API_BASE}/v1/raw-material-stock/items?limit=100`, { headers });
      if (!itemsRes.ok || itemsRes.status === 404) {
        const fallbackItems = await fetch(`${API_BASE}/items?limit=100`, { headers });
        if (fallbackItems.ok) itemsRes = fallbackItems;
      }

      // Cargar ubicaciones de almacén
      let locationsRes = await fetch(`${API_BASE}/v1/inventory/locations`, { headers });
      if (!locationsRes.ok || locationsRes.status === 404 || locationsRes.status === 400) {
        const fallbackLocations = await fetch(`${API_BASE}/locations`, { headers });
        if (fallbackLocations.ok) locationsRes = fallbackLocations;
      }

      if (itemsRes.ok) {
        const json = await itemsRes.json();
        const data = json.data || json.items || json || [];
        const rawItems = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
        const activeItems = rawItems.filter((i: any) => i.isActive !== false).map((i: any) => ({
          ...i,
          currentQty: Number(i.currentQty ?? i.current_qty ?? 0),
          product: i.product || (i.supply ? { id: i.supply.id, name: i.supply.name, sku: i.supply.code || i.supply.sku } : null)
        }));
        setStockItems(activeItems);
      } else {
        throw new Error('Failed to fetch stock items from server.');
      }


      if (locationsRes.ok) {
        const json = await locationsRes.json();
        const data = json.data || json || [];
        const rawLocations = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
        const activeLocations = rawLocations.filter((l: any) => l.isActive !== false);
        setLocations(activeLocations);
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to load stock control panel data. Please check your backend connection.');
    } finally {
      setIsLoading(false);
    }
  };

  // Abrir Modal de Ajuste de Stock
  const handleOpenAdjust = (item: StockItem) => {
    if (!isAdministrator) return;
    setSelectedItemForAdjust(item);
    setAdjustValue(item.currentQty);
    setAdjustType('absolute');
    setAdjustReason('');
    setAdjustError(null);
    setIsAdjustOpen(true);
  };

  const handleSubmitAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemForAdjust) return;

    setIsSubmittingAdjust(true);
    setAdjustError(null);

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const payload = {
        value: Number(adjustValue),
        type: adjustType,
        reason: adjustReason
      };

      console.log('[AdjustStock] Enviando ajuste:', {
        stockItemId: selectedItemForAdjust.id,
        product: selectedItemForAdjust.product?.name,
        location: selectedItemForAdjust.location?.name,
        currentQty: selectedItemForAdjust.currentQty,
        payload
      });

      // Intentar primero /v1/raw-material-stock/items/:id/adjust y fallback a /items/:id/adjust
      let usedUrl = `${API_BASE}/v1/raw-material-stock/items/${selectedItemForAdjust.id}/adjust`;
      let res = await fetch(usedUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok || res.status === 404) {
        usedUrl = `${API_BASE}/items/${selectedItemForAdjust.id}/adjust`;
        res = await fetch(usedUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
      }


      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || 'Failed to adjust stock quantity.');
      }

      const resBody = await res.json();
      const updatedItem = resBody.data || resBody;

      // Sincronizar el grid en segundo plano inmediatamente sin recargar
      setStockItems(prev => prev.map(item => item.id === updatedItem.id ? { ...item, currentQty: updatedItem.currentQty } : item));
      setIsAdjustOpen(false);
    } catch (err: any) {
      console.error(err);
      setAdjustError(err.message || 'Error processing stock adjustment.');
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  // Navegar a la bitácora de movimientos filtrada por itemId (Deep-Linking)
  const handleViewActivityLogs = async (item: StockItem) => {
    window.history.pushState({}, '', `/inventory/movements?itemId=${item.id}`);
    if (onNavigate) {
      onNavigate('movements');
    } else {
      setSelectedItemForHistory(item);
      setIsHistoryOpen(true);
      setIsLoadingHistory(true);
      setHistoryError(null);
      setHistoryMovements([]);

      try {
        const token = getAccessToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        };

        const res = await fetch(`${API_BASE}/movements?itemId=${item.id}&limit=100`, { headers });
        if (!res.ok) {
          throw new Error('Error al cargar la bitácora de movimientos');
        }

        const json = await res.json();
        const data = json.data || json || [];
        setHistoryMovements(Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []));
      } catch (err: any) {
        console.error(err);
        setHistoryError(err.message || 'Failed to fetch movements history.');
      } finally {
        setIsLoadingHistory(false);
      }
    }
  };

  // Filtrado reactivo en el frontend
  const filteredItems = stockItems.filter(item => {
    const productName = item.product?.name || '';
    const productSku = item.product?.sku || '';
    const matchesSearch =
      productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      productSku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLocation =
      locationFilter === 'All' ||
      (item.location && String(item.location.id) === locationFilter);
    const matchesOutOfStock = !outOfStockOnly || item.currentQty <= 0;
    return matchesSearch && matchesLocation && matchesOutOfStock;
  });

  // Agrupar por producto/insumo + variante
  type GroupedStockItem = {
    key: string;
    productId: number | null;
    supplyId: number | null;
    variantId: number | null;
    product: Product | null;
    supply: Supply | null;
    variant: Variant | null;
    totalQty: number;
    locations: StockItem[];
    hasAlert: boolean;
  };

  const groupedItems: GroupedStockItem[] = [];
  const groupMap = new Map<string, GroupedStockItem>();

  for (const item of filteredItems) {
    const key = item.supply
      ? `supply-${item.supply.id}`
      : `product-${item.product?.id ?? 'unknown'}-${item.variant?.id ?? 'no-variant'}`;

    if (!groupMap.has(key)) {
      const group: GroupedStockItem = {
        key,
        productId: item.product?.id ?? null,
        supplyId: item.supply?.id ?? null,
        variantId: item.variant?.id ?? null,
        product: item.product,
        supply: item.supply,
        variant: item.variant,
        totalQty: 0,
        locations: [],
        hasAlert: false,
      };
      groupMap.set(key, group);
      groupedItems.push(group);
    }
    const group = groupMap.get(key)!;
    group.totalQty += item.currentQty;
    group.locations.push(item);
    if (item.currentQty <= 0) group.hasAlert = true;
  }




  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans relative">
      <div ref={topRef} />

      {/* Título de Sección */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <div>
          <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
            Stock & Inventory Control
          </h2>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Monitor real-time warehouse counts, track variant assignments and manage physical warehouse footprints.
          </p>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="relative w-full lg:w-96">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-sans">
            search
          </span>
          <input
            type="text"
            placeholder="Search by product name or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md transition-all font-sans"
          />
        </div>

        <div className="flex flex-wrap items-center gap-6 w-full lg:w-auto">
          {/* Branch Picker */}
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ae001a] text-md">store</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[160px] font-sans text-secondary cursor-pointer"
            >
              <option value="All">All Locations</option>
              {locations.map(loc => (
                <option key={loc.id} value={String(loc.id)}>{loc.name}</option>
              ))}
            </select>
          </div>

          {/* Out of Stock Toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={outOfStockOnly}
              onChange={(e) => setOutOfStockOnly(e.target.checked)}
              className="sr-only peer"
            />
            <div className="relative w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ae001a]" />
            <span className="text-body-sm font-bold text-secondary uppercase tracking-wider">
              Out of Stock Only
            </span>
          </label>

          {/* Botón de Recarga tipo Categorías */}
          <button
            onClick={() => fetchInitialData()}
            className="p-2 bg-white border border-[#e8e2d8] rounded hover:bg-[#fef9f1] text-[#5f5e5e] hover:text-[#ae001a] transition-all flex items-center justify-center cursor-pointer font-sans h-[38px] w-[38px]"
            title="Reload stock data"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
      </div>

      {/* Lista Principal */}
      {error ? (
        <div className="bg-red-50 border border-red-200 p-8 text-center rounded shadow-sm">
          <span className="material-symbols-outlined text-red-700 text-5xl">
            error
          </span>
          <p className="text-body-md text-red-800 font-bold uppercase tracking-wider mt-4">
            {error}
          </p>
        </div>
      ) : !isLoading && stockItems.length === 0 ? (
        /* Empty State */
        <div className="bg-white border border-[#e8e2d8] p-16 text-center rounded shadow-sm flex flex-col items-center justify-center gap-6">
          <div className="w-20 h-20 bg-zinc-50 border border-zinc-100 rounded-full flex items-center justify-center shadow-inner">
            <span className="material-symbols-outlined text-zinc-400 text-4xl">
              inventory
            </span>
          </div>
          <div className="max-w-md">
            <h3 className="font-bold text-[#222222] uppercase tracking-wider text-sm">
              No stock definitions established yet for your active branch network.
            </h3>
            <p className="text-body-md text-secondary leading-relaxed mt-2">
              Configure initial stock metrics or receive purchase orders to initialize data tracking.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-label-caps font-bold text-white uppercase tracking-wider">
              STOCK INVENTORY LEDGER
            </span>
            <span className="material-symbols-outlined text-white text-sm cursor-pointer select-none">
              more_vert
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-label-caps font-bold text-[#5f5e5e]">
                    Product Context
                  </th>
                  <th className="px-6 py-3 text-label-caps font-bold text-[#5f5e5e]">
                    Variant Attribute Matrix
                  </th>
                  <th className="px-6 py-3 text-label-caps font-bold text-[#5f5e5e]">
                    Operational Node Assignment
                  </th>
                  <th className="px-6 py-3 text-right text-label-caps font-bold text-[#5f5e5e] w-36">
                    Inventory Balance
                  </th>
                  <th className="px-6 py-3 text-center text-label-caps font-bold text-[#5f5e5e] w-28">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                      <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
                        sync
                      </span>
                      <p className="text-secondary text-body-md mt-2 font-sans font-bold uppercase tracking-wider">
                        Fetching active warehouse stock levels...
                      </p>
                    </td>
                  </tr>
                ) : groupedItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-secondary italic bg-white">
                      No stock items match the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  groupedItems.map((group) => {

                        const prodName = group.supply?.name || group.product?.name || 'Unknown Item';
                        const prodSku = group.supply?.sku || group.supply?.code || group.product?.sku || 'N/A';
                        const varName = group.variant?.name || 'No Variant';
                        const isExpanded = expandedGroups.has(group.key);
                        const hasMultipleLocations = group.locations.length > 1;

                        const groupMin = group.locations.find(loc => loc.minimumQty != null)?.minimumQty ?? 0;
                        const isTotalLowStock = groupMin > 0 ? group.totalQty <= groupMin : group.totalQty <= 0;
                        const hasLocationAlert = group.locations.some(loc => {
                          const min = loc.minimumQty ?? 0;
                          return min > 0 ? loc.currentQty <= min : loc.currentQty <= 0;
                        });

                        return (
                          <React.Fragment key={group.key}>
                            {/* Fila principal (agrupada por producto+variante) */}
                            <tr
                              className={`group transition-colors cursor-pointer ${
                                isExpanded ? 'bg-[#fef9f1]' : 'hover:bg-[#f8f3eb]'
                              }`}
                              onClick={() => toggleGroup(group.key)}
                            >
                              <td className="px-6 py-4 flex items-center gap-3">
                                {/* Indicador expand/collapse */}
                                <span className={`material-symbols-outlined text-[16px] text-[#5f5e5e] transition-transform duration-200 ${
                                  isExpanded ? 'rotate-90' : ''
                                }`}>
                                  {hasMultipleLocations ? 'chevron_right' : 'remove'}
                                </span>
                                <div className={`w-1 h-8 rounded-full ${
                                  isTotalLowStock ? 'bg-[#ae001a]' : (hasLocationAlert ? 'bg-amber-500' : 'bg-emerald-600')
                                }`}></div>
                                <div>
                                  <p className="font-bold text-[#1d1c17]">{prodName}</p>
                                  <p className="text-secondary text-body-xs font-mono">SKU: {prodSku}</p>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-[#1d1c17] font-sans">
                                <span className={`px-2 py-0.5 rounded text-body-xs font-semibold ${
                                  group.variant ? 'bg-[#ece8e0] text-[#5f5e5e]' : 'text-zinc-400 italic'
                                }`}>
                                  {varName}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-secondary text-sm font-semibold">
                                {group.locations.length === 1
                                  ? (group.locations[0].location?.name || 'Unassigned')
                                  : (
                                    <span className="flex items-center gap-1.5 text-[#ae001a]">
                                      <span className="material-symbols-outlined text-[14px]">warehouse</span>
                                      {group.locations.length} locations
                                    </span>
                                  )
                                }
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="inline-flex items-center gap-1.5 justify-end">
                                  {hasLocationAlert && !isTotalLowStock && (
                                    <span
                                      className="material-symbols-outlined text-amber-600 text-base animate-pulse"
                                      title="Location Alert: 1 or more warehouse locations are below minimum stock threshold!"
                                    >
                                      warning
                                    </span>
                                  )}
                                  <span className={`px-3 py-1 font-mono font-bold rounded-full text-sm ${
                                    isTotalLowStock
                                      ? 'bg-red-100 text-[#ae001a] border border-red-200'
                                      : 'bg-emerald-50 text-emerald-800'
                                  }`}>
                                    {group.totalQty} units
                                  </span>
                                </div>
                                {hasMultipleLocations && (
                                  <span className="block text-[10px] text-secondary mt-0.5 text-right">total</span>
                                )}
                              </td>

                          <td className="px-6 py-4 text-center">
                            {group.locations.length === 1 ? (
                              /* Si solo hay una localización, acciones directas */
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  disabled={!isAdministrator}
                                  onClick={(e) => { e.stopPropagation(); handleOpenAdjust(group.locations[0]); }}
                                  className={`p-1.5 rounded transition-all duration-200 cursor-pointer ${
                                    isAdministrator
                                      ? 'text-secondary hover:text-[#ae001a] hover:bg-[#fef9f1]'
                                      : 'text-zinc-300 cursor-not-allowed opacity-50'
                                  }`}
                                  title={isAdministrator ? "Adjust Stock Manually" : "Only authorized administrators can modify current stock thresholds manually."}
                                >
                                  <span className="material-symbols-outlined text-[18px] block">tune</span>
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleViewActivityLogs(group.locations[0]); }}
                                  className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200 cursor-pointer"
                                  title="View Activity Logs"
                                >
                                  <span className="material-symbols-outlined text-[18px] block">history</span>
                                </button>
                              </div>
                            ) : (
                              /* Si hay múltiples, invitar a expandir */
                              <span className="text-[10px] text-secondary font-bold uppercase tracking-wider">
                                {isExpanded ? 'collapse' : 'expand'}
                              </span>
                            )}
                          </td>
                        </tr>

                        {/* Sub-filas por localización (solo si expandido y hay más de 1) */}
                        {isExpanded && hasMultipleLocations && group.locations.map((locItem) => {
                          const locMin = locItem.minimumQty ?? 0;
                          const locIsAlert = locMin > 0 ? locItem.currentQty <= locMin : locItem.currentQty <= 0;
                          return (
                            <tr key={locItem.id} className="bg-zinc-50/70 hover:bg-[#fef5e7] border-l-2 border-[#ae001a]/20">
                              <td className="px-6 py-2.5 pl-16">
                                <span className="flex items-center gap-1.5 text-[10px] text-zinc-600 font-bold uppercase tracking-wider">
                                  <span className="material-symbols-outlined text-[12px]">subdirectory_arrow_right</span>
                                  {locItem.location?.name || 'Unassigned'}
                                </span>
                              </td>
                              <td className="px-6 py-2.5 text-[#1d1c17] font-sans">
                                {/* Vacío - variante ya mostrada en fila padre */}
                              </td>
                              <td className="px-6 py-2.5">
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-secondary">
                                  <span className="material-symbols-outlined text-[13px]">location_on</span>
                                  {locItem.location?.name || 'Unassigned'}
                                </span>
                              </td>
                              <td className="px-6 py-2.5 text-right">
                                <span className={`px-2.5 py-0.5 font-mono font-bold rounded-full text-xs ${
                                  locIsAlert
                                    ? 'bg-red-100 text-[#ae001a] border border-red-200'
                                    : 'bg-emerald-50 text-emerald-700'
                                }`}>
                                  {locItem.currentQty} units
                                </span>
                              </td>
                              <td className="px-6 py-2.5 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    disabled={!isAdministrator}
                                    onClick={(e) => { e.stopPropagation(); handleOpenAdjust(locItem); }}
                                    className={`p-1 rounded transition-all duration-200 ${
                                      isAdministrator
                                        ? 'text-secondary hover:text-[#ae001a] hover:bg-[#fef9f1] cursor-pointer'
                                        : 'text-zinc-300 cursor-not-allowed opacity-50'
                                    }`}
                                    title={isAdministrator ? "Adjust Stock Manually" : "Only authorized administrators can modify current stock thresholds manually."}
                                  >
                                    <span className="material-symbols-outlined text-[16px] block">tune</span>
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleViewActivityLogs(locItem); }}
                                    className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200 cursor-pointer"
                                    title="View Activity Logs"
                                  >
                                    <span className="material-symbols-outlined text-[16px] block">history</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Launch Panel Footer */}
      <div className="mt-8">
        <QuickLaunchPanel
          description="One-click access to warehouse locations, suppliers list, and products catalog."
          actions={[
            {
              id: 'products-master',
              label: 'PRODUCTS MASTER LIST',
              onClick: () => onNavigate?.('products'),
            },
            {
              id: 'locations',
              label: 'WAREHOUSE LOCATIONS',
              onClick: () => onNavigate?.('locations'),
            },
            {
              id: 'movements-log',
              label: 'GO TO MOVEMENTS LOG',
              onClick: () => onNavigate?.('movements'),
            },
            {
              id: 'po-management',
              label: 'PURCHASE ORDER MANAGEMENT',
              onClick: () => onNavigate?.('purchase-orders'),
            },
            {
              id: 'emergency-support',
              label: 'EMERGENCY SUPPORT',
              variant: 'danger',
              onClick: () => setIsSupportOpen(true),
            },
          ]}
        />
      </div>

      {/* Emergency Support Modal */}
      <EmergencySupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />



      {/* Renderizado del Portal del Drawer de Historial de Movimientos */}
      {isHistoryOpen && selectedItemForHistory && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-hidden flex justify-end font-sans">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setIsHistoryOpen(false)}
          />

          {/* Panel Lateral */}
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-10 border-l border-zinc-200 animate-slide-in">
            {/* Header */}
            <div className="p-6 border-b border-zinc-200 bg-[#222222] flex justify-between items-center text-white">
              <div>
                <h3 className="text-heading-md font-bold text-white uppercase tracking-wider font-sans">
                  STOCK ACTIVITY LEDGER
                </h3>
                <p className="text-white/60 text-body-xs mt-1 font-sans">
                  Audit trail and movements log
                </p>
              </div>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-all duration-200 cursor-pointer"
              >
                <span className="material-symbols-outlined block text-xl">close</span>
              </button>
            </div>

            {/* Cuerpo del Drawer */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Contexto del Ítem */}
              <div className="bg-zinc-50 p-4 border border-zinc-200 rounded-lg flex gap-4 items-center">
                <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-[#ae001a]">
                  <span className="material-symbols-outlined text-xl block">inventory</span>
                </div>
                <div>
                  <h4 className="font-bold text-zinc-900 leading-tight">
                    {selectedItemForHistory.product?.name}
                  </h4>
                  <p className="text-secondary text-body-xs mt-0.5">
                    SKU: {selectedItemForHistory.product?.sku || 'N/A'} • {selectedItemForHistory.variant?.name || 'Standard'}
                  </p>
                  <p className="text-secondary text-body-xs mt-0.5">
                    Warehouse: {selectedItemForHistory.location?.name || 'N/A'}
                  </p>
                </div>
              </div>

              {isLoadingHistory ? (
                <div className="py-12 text-center">
                  <span className="material-symbols-outlined text-secondary animate-spin text-4xl">sync</span>
                  <p className="text-secondary text-body-sm mt-3 uppercase tracking-wider font-bold">
                    Fetching audit trail...
                  </p>
                </div>
              ) : historyError ? (
                <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-body-sm rounded-lg flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm block">error</span>
                  <span>{historyError}</span>
                </div>
              ) : historyMovements.length === 0 ? (
                <div className="py-12 text-center text-secondary italic">
                  No movements have been registered for this stock item yet.
                </div>
              ) : (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a] mb-2">
                    Registered Movements ({historyMovements.length})
                  </h4>
                  <div className="border border-zinc-200 rounded-lg overflow-hidden">
                    <table className="w-full border-collapse text-left">
                      <thead className="bg-zinc-50 border-b border-zinc-200">
                        <tr>
                          <th className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500">Date</th>
                          <th className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500 text-center">Type</th>
                          <th className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500 text-right">Qty</th>
                          <th className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500">Reference / Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200">
                        {historyMovements.map((mv) => {
                          const isEntry = ['IN', 'PURCHASE_ENTRY', 'RETURN'].includes(mv.type);
                          return (
                            <tr key={mv.id} className="hover:bg-zinc-50/50">
                              <td className="px-4 py-3 text-body-xs text-zinc-600">
                                {new Date(mv.createdAt).toLocaleDateString()} • {new Date(mv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`text-[8px] font-bold px-2 py-0.5 rounded uppercase ${
                                  isEntry ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {mv.type}
                                </span>
                              </td>
                              <td className={`px-4 py-3 text-body-xs font-bold text-right ${
                                isEntry ? 'text-emerald-600' : 'text-red-600'
                              }`}>
                                {isEntry ? '+' : '-'}{mv.quantity}
                              </td>
                              <td className="px-4 py-3 text-body-xs text-zinc-800">
                                <span className="font-bold block text-zinc-900">{mv.reference || 'N/A'}</span>
                                <span className="text-secondary text-[10px]">{mv.reason || 'N/A'}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-zinc-50 border-t border-zinc-200 px-6 py-4 flex justify-end">
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                className="px-5 py-2.5 bg-[#ece8e0] text-[#1c1b16] font-bold text-label-caps hover:bg-[#dcd7cd] transition-colors font-sans cursor-pointer"
              >
                CLOSE AUDIT LEDGER
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Renderizar Drawer usando un Portal en document.body para evitar recortes y traslapes de z-index */}
      {isAdjustOpen && selectedItemForAdjust && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-hidden flex justify-end font-sans">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setIsAdjustOpen(false)}
          />

          {/* Panel Lateral */}
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 border-l border-zinc-200 animate-slide-in">
            {/* Header */}
            <div className="p-6 border-b border-zinc-200 bg-white flex justify-between items-center">
              <div>
                <h3 className="text-heading-md font-bold text-[#ae001a] uppercase tracking-wider font-sans">
                  Adjust Stock Level
                </h3>
                <p className="text-secondary text-body-xs mt-1 font-sans">
                  Manual discrepancy correction workflow
                </p>
              </div>
              <button
                onClick={() => setIsAdjustOpen(false)}
                className="p-1.5 rounded-full hover:bg-zinc-100 text-secondary hover:text-[#ae001a] transition-all duration-200 cursor-pointer"
              >
                <span className="material-symbols-outlined block text-xl">close</span>
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSubmitAdjust} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Contexto del Ítem */}
              <div className="bg-zinc-50 p-4 border border-zinc-200 rounded-lg flex gap-4 items-center">
                <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-[#ae001a]">
                  <span className="material-symbols-outlined text-xl block">box</span>
                </div>
                <div>
                  <span className="block text-body-sm font-bold text-zinc-800 font-sans">
                    {selectedItemForAdjust.product?.name || 'Unknown Product'}
                  </span>
                  {selectedItemForAdjust.variant && (
                    <span className="block text-body-xs text-secondary font-semibold font-sans mt-0.5">
                      Variant: {selectedItemForAdjust.variant.name}
                    </span>
                  )}
                  <span className="block text-[10px] text-zinc-500 font-sans mt-0.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">location_on</span>
                    <span>Location: {selectedItemForAdjust.location?.name || 'Unassigned'}</span>
                  </span>
                </div>
              </div>

              {/* Ajuste de Cantidad */}
              <div className="space-y-5">
                <label className="block text-label-caps font-bold text-zinc-400 uppercase tracking-widest text-[9px]">
                  Adjustment Setup
                </label>

                {/* Tipo de Ajuste */}
                <div className="space-y-2">
                  <span className="block text-body-xs font-bold text-zinc-700 font-sans">Adjustment Type</span>
                  <div className="grid grid-cols-2 gap-2 bg-zinc-100 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setAdjustType('absolute');
                        setAdjustValue(selectedItemForAdjust.currentQty);
                      }}
                      className={`py-2 px-3 text-body-xs font-bold rounded-md transition-all duration-200 cursor-pointer ${
                        adjustType === 'absolute'
                          ? 'bg-[#ae001a] text-white shadow-sm'
                          : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'
                      }`}
                    >
                      Absolute Total
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdjustType('relative');
                        setAdjustValue(0);
                      }}
                      className={`py-2 px-3 text-body-xs font-bold rounded-md transition-all duration-200 cursor-pointer ${
                        adjustType === 'relative'
                          ? 'bg-[#ae001a] text-white shadow-sm'
                          : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'
                      }`}
                    >
                      Relative Delta
                    </button>
                  </div>
                </div>

                {/* Valor */}
                <div className="space-y-2">
                  <span className="block text-body-xs font-bold text-zinc-700 font-sans">
                    {adjustType === 'absolute' ? 'New Target Stock (Units)' : 'Delta Modification Step'}
                  </span>
                  <div className="relative">
                    <input
                      type="number"
                      value={adjustValue}
                      onChange={(e) => setAdjustValue(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] text-body-sm font-bold text-zinc-800 transition-all shadow-sm"
                      required
                    />
                  </div>
                  <div className="bg-zinc-50 border border-zinc-150 p-2.5 rounded-lg flex items-start gap-2">
                    <span className="material-symbols-outlined text-[#ae001a] text-sm block mt-0.5">info</span>
                    <span className="text-[10px] text-zinc-500 font-medium leading-relaxed">
                      {adjustType === 'absolute'
                        ? `Establishes current stock to exactly ${adjustValue} units (diff of ${adjustValue - selectedItemForAdjust.currentQty}).`
                        : `Applies a ${adjustValue >= 0 ? '+' : ''}${adjustValue} modifier to current ${selectedItemForAdjust.currentQty} (new total: ${selectedItemForAdjust.currentQty + adjustValue}).`}
                    </span>
                  </div>
                </div>

                {/* Motivo del Ajuste */}
                <div className="space-y-1.5">
                  <span className="block text-body-xs font-bold text-zinc-700 font-sans">Reason for Adjustment</span>
                  <textarea
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="Enter reason for manual adjustment..."
                    className="w-full p-3 bg-white border border-zinc-200 rounded-lg h-24 text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all resize-none text-zinc-800 shadow-sm"
                    required
                  />
                </div>
              </div>

              {adjustError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-body-xs font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm block">error</span>
                  <span>{adjustError}</span>
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-3 pt-5 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setIsAdjustOpen(false)}
                  className="flex-1 py-2 text-body-sm font-bold border border-zinc-200 rounded-lg text-zinc-700 hover:bg-zinc-50 transition-all duration-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdjust}
                  className="flex-1 py-2 bg-zinc-950 text-white hover:bg-[#ae001a] text-body-sm font-bold rounded-lg transition-all duration-200 disabled:opacity-50 cursor-pointer flex justify-center items-center gap-1.5 shadow-sm"
                >
                  {isSubmittingAdjust ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin block">sync</span>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Adjustment</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
