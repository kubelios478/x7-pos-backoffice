import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, getStoredUser } from '../../../../../../lib/auth-storage';
import { StockQuickLinks } from '../StockQuickLinks';
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
  code?: string | null;
  address?: string | null;
  isMainStorage?: boolean;
  isActive?: boolean;
}

interface Supply {
  id: number;
  name: string;
  sku?: string | null;
  code?: string | null;
  consumption_unit?: string | null;
  unit?: string | null;
  average_cost?: number | null;
  cost_per_unit?: number | null;
  min_stock_threshold?: number | null;
}

interface StockItem {
  id: number;
  currentQty: number;
  allocatedQty?: number;
  minimumQty: number | null;
  product: Product | null;
  variant: Variant | null;
  supply: Supply | null;
  location: Location | null;
  isActive?: boolean;
}

interface StockInventoryViewProps {
  onNavigate?: (view: string) => void;
}

export const StockInventoryView: React.FC<StockInventoryViewProps> = ({ onNavigate }) => {
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modo de vista: Por Ubicación (By Location) o Por Insumo (By Material)
  const [viewMode, setViewMode] = useState<'by-location' | 'by-material'>('by-location');

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

      const checkObjectActive = (obj: any): boolean => {
        if (!obj) return true;
        if (obj.isActive === false || obj.is_active === false || obj.isActive === 0 || obj.is_active === 0) return false;
        if (obj.isActive === 'false' || obj.is_active === 'false') return false;
        if (typeof obj.status === 'string' && ['inactive', 'disabled', 'deactivated', 'archived', 'deleted'].includes(obj.status.toLowerCase())) return false;
        return true;
      };

      // 1. Cargar lista maestra de ubicaciones para verificar estado activo real por ID
      const locationsMap = new Map<string, any>();
      const locationsNameMap = new Map<string, any>();
      try {
        let locationsRes = await fetch(`${API_BASE}/v1/inventory/locations`, { headers });
        if (!locationsRes.ok || locationsRes.status === 404 || locationsRes.status === 400) {
          const fallbackLocations = await fetch(`${API_BASE}/locations`, { headers });
          if (fallbackLocations.ok) locationsRes = fallbackLocations;
        }
        if (locationsRes.ok) {
          const lJson = await locationsRes.json();
          const rawLocations = Array.isArray(lJson)
            ? lJson
            : (Array.isArray(lJson.data) ? lJson.data : (Array.isArray(lJson.items) ? lJson.items : []));
          rawLocations.forEach((l: any) => {
            if (l.id) locationsMap.set(String(l.id), l);
            if (l.name) locationsNameMap.set(l.name.trim().toLowerCase(), l);
          });
          const activeLocations = rawLocations.filter((l: any) => checkObjectActive(l));
          setLocations(activeLocations);
        }
      } catch (lErr) {
        console.warn('Could not fetch locations list:', lErr);
      }

      // 2. Cargar lista maestra de materias primas para verificar estado activo actualizado
      const suppliesMap = new Map<string, any>();
      const suppliesNameMap = new Map<string, any>();
      try {
        let suppliesRes = await fetch(`${API_BASE}/v1/inventory/raw-materials?limit=200&status=all`, { headers });
        if (!suppliesRes.ok || suppliesRes.status === 404) {
          suppliesRes = await fetch(`${API_BASE}/v1/supplies?limit=200`, { headers });
        }
        if (!suppliesRes.ok || suppliesRes.status === 404) {
          suppliesRes = await fetch(`${API_BASE}/supplies?limit=200`, { headers });
        }
        if (suppliesRes.ok) {
          const sJson = await suppliesRes.json();
          const rawSupplies = Array.isArray(sJson)
            ? sJson
            : (Array.isArray(sJson.items)
              ? sJson.items
              : (Array.isArray(sJson.data)
                ? sJson.data
                : (Array.isArray(sJson.data?.items) ? sJson.data.items : [])));
          rawSupplies.forEach((s: any) => {
            if (s.id) suppliesMap.set(String(s.id), s);
            if (s.name) suppliesNameMap.set(s.name.trim().toLowerCase(), s);
          });
        }
      } catch (sErr) {
        console.warn('Could not fetch supplies list for status map:', sErr);
      }

      // Cargar ítems de stock
      let itemsRes = await fetch(`${API_BASE}/v1/raw-material-stock/items?limit=100`, { headers });
      if (!itemsRes.ok || itemsRes.status === 404) {
        const fallbackItems = await fetch(`${API_BASE}/items?limit=100`, { headers });
        if (fallbackItems.ok) itemsRes = fallbackItems;
      }

      if (itemsRes.ok) {
        const json = await itemsRes.json();
        const data = json.data || json.items || json || [];
        const rawItems = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : (Array.isArray(data.items) ? data.items : []));
        const mappedItems = rawItems.map((i: any) => {
          const supplyObj = i.supply || i.rawMaterial || i.raw_material || i.ingredient || null;
          const supplyId = supplyObj?.id || i.supplyId || i.supply_id || i.rawMaterialId || i.raw_material_id;
          const supplyName = supplyObj?.name || i.name || i.product?.name;
          const masterSupply = (supplyId ? suppliesMap.get(String(supplyId)) : null) || (supplyName ? suppliesNameMap.get(String(supplyName).trim().toLowerCase()) : null);
          const finalSupply = masterSupply || supplyObj;

          const isMasterSupplyActive = checkObjectActive(masterSupply);
          const isEmbeddedSupplyActive = checkObjectActive(supplyObj);
          
          const supplyIsActive = isMasterSupplyActive && isEmbeddedSupplyActive;

          const locObj = i.location;
          const locId = locObj?.id || i.locationId || i.location_id;
          const locName = locObj?.name || i.locationName || i.location_name;
          const masterLoc = (locId ? locationsMap.get(String(locId)) : null) || (locName ? locationsNameMap.get(String(locName).trim().toLowerCase()) : null);
          const finalLoc = masterLoc || locObj;

          const isMasterLocActive = checkObjectActive(masterLoc);
          const isEmbeddedLocActive = checkObjectActive(locObj);

          const locationIsActive = isMasterLocActive && isEmbeddedLocActive;
          const selfIsActive = checkObjectActive(i);

          const itemIsActive = selfIsActive && supplyIsActive && locationIsActive;

          return {
            ...i,
            isActive: itemIsActive,
            currentQty: Number(i.currentQty ?? i.current_qty ?? i.quantity ?? 0),
            allocatedQty: Number(i.allocatedQty ?? i.allocated_qty ?? 0),
            minimumQty: i.minimumQty ?? i.minimum_qty ?? null,
            supply: finalSupply,
            location: finalLoc,
            product: i.product || (finalSupply ? { id: finalSupply.id, name: finalSupply.name, sku: finalSupply.code || finalSupply.sku } : null)
          };
        });
        setStockItems(mappedItems);
      } else {
        throw new Error('Failed to fetch stock items from server.');
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

  // Filtrado reactivo multicriterio en el frontend

  const filteredItems = stockItems.filter(item => {
    const locName = item.location?.name || '';
    const locCode = item.location?.code || '';
    const rawMaterialName = item.supply?.name || item.product?.name || '';
    const itemSku = item.supply?.code || item.supply?.sku || item.product?.sku || '';

    // Búsqueda alfanumérica por nombre de ubicación, código de ubicación o nombre de materia prima
    const matchesSearch =
      locName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      locCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rawMaterialName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      itemSku.toLowerCase().includes(searchQuery.toLowerCase());

    // Filtro por Ubicación de Almacén Específica
    const matchesLocation =
      locationFilter === 'All' ||
      (item.location && String(item.location.id) === locationFilter);

    // Filtro estricto: Mostrar únicamente elementos activos. Si está inactivo o la ubicación está desactivada, se elimina de la vista.
    const supplyIsActive = item.supply
      ? ((item.supply as any).isActive !== false && (item.supply as any).is_active !== false && (item.supply as any).status !== 'inactive' && (item.supply as any).status !== 'deleted')
      : true;
    const locationIsActive = item.location
      ? ((item.location as any).isActive !== false && (item.location as any).is_active !== false && (item.location as any).status !== 'inactive' && (item.location as any).status !== 'deleted')
      : true;
    const itemIsActive = item.isActive !== false && (item as any).is_active !== false && supplyIsActive && locationIsActive;

    if (!itemIsActive) {
      return false;
    }



    // Filtro Rápido de Alerta de Stock Bajo (currentStock <= minStockThreshold)
    const minThreshold = Number(item.minimumQty ?? item.supply?.min_stock_threshold ?? 0);
    const isLowStock = minThreshold > 0 ? item.currentQty < minThreshold : false;
    const matchesOutOfStock = !outOfStockOnly || isLowStock;

    return matchesSearch && matchesLocation && matchesOutOfStock;
  });


  // Agrupar por Ubicación (By Location) o por Materia Prima (By Material)
  // Helper para determinar de forma exhaustiva el costo unitario (WACC/CPP, cost_per_unit, unit_cost)
  const getItemUnitCost = (item: any): number => {
    if (!item) return 0;
    const directCost =
      item.weightedAverageUnitCost ??
      item.weighted_average_unit_cost ??
      item.unitCost ??
      item.unit_cost ??
      item.averageCost ??
      item.average_cost ??
      item.costPerUnit ??
      item.cost_per_unit;

    if (directCost != null && !isNaN(Number(directCost)) && Number(directCost) > 0) {
      return Number(directCost);
    }

    const s = item.supply || item.rawMaterial || item.raw_material || item.product;
    if (s) {
      const sCost =
        s.average_cost ??
        s.averageCost ??
        s.cost_per_unit ??
        s.costPerUnit ??
        s.unit_cost ??
        s.unitCost ??
        s.last_purchase_cost ??
        s.lastPurchaseCost ??
        s.price;

      if (sCost != null && !isNaN(Number(sCost)) && Number(sCost) > 0) {
        return Number(sCost);
      }
    }
    return 0;
  };

  type GroupedStockItem = {
    key: string;
    title: string;
    code?: string | null;
    isMainStorage?: boolean;
    location?: Location | null;
    supply?: Supply | null;
    product?: Product | null;
    variant?: Variant | null;
    totalStock: number;
    totalAllocated: number;
    totalNetAvailable: number;
    totalValuation: number;
    items: StockItem[];
    hasAlert: boolean;
  };

  const groupedItems: GroupedStockItem[] = [];
  const groupMap = new Map<string, GroupedStockItem>();

  for (const item of filteredItems) {
    const currentStock = Number(item.currentQty || 0);
    const allocatedStock = Number(item.allocatedQty || 0);
    const netAvailable = Math.max(0, currentStock - allocatedStock);
    const avgCost = getItemUnitCost(item);
    const valuation = currentStock * avgCost;


    let key = '';
    let title = '';
    let code: string | null | undefined = null;
    let isMainStorage = false;

    if (viewMode === 'by-location') {
      key = `loc-${item.location?.id ?? 'unassigned'}`;
      title = item.location?.name || 'Unassigned Location Hub';
      code = item.location?.code || null;
      isMainStorage = !!item.location?.isMainStorage;
    } else {
      key = item.supply
        ? `supply-${item.supply.id}`
        : `product-${item.product?.id ?? 'unknown'}-${item.variant?.id ?? 'no-variant'}`;
      title = item.supply?.name || item.product?.name || 'Unknown Item';
      code = item.supply?.code || item.supply?.sku || item.product?.sku || null;
    }

    if (!groupMap.has(key)) {
      const group: GroupedStockItem = {
        key,
        title,
        code,
        isMainStorage,
        location: item.location,
        supply: item.supply,
        product: item.product,
        variant: item.variant,
        totalStock: 0,
        totalAllocated: 0,
        totalNetAvailable: 0,
        totalValuation: 0,
        items: [],
        hasAlert: false,
      };
      groupMap.set(key, group);
      groupedItems.push(group);
    }

    const group = groupMap.get(key)!;
    group.totalStock += currentStock;
    group.totalAllocated += allocatedStock;
    group.totalNetAvailable += netAvailable;
    group.totalValuation += valuation;
    group.items.push(item);

    const minThreshold = Number(item.minimumQty ?? item.supply?.min_stock_threshold ?? 0);
    if (minThreshold > 0 && currentStock < minThreshold) {
      group.hasAlert = true;
    }
  }


  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans relative">
      <div ref={topRef} />

      {/* 1. Header Card Workspace */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-6 shadow-xs text-left flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
            STOCK LOCATIONS & BALANCES WORKSPACE
          </h2>
          <p className="text-body-sm text-[#5f5e5e] mt-1 font-sans">
            Manage physical storage areas (RawMaterialLocation), inspect current stock levels (RawMaterialItem), track allocated production reserves and identify primary storage hubs.
          </p>
        </div>

        {/* Toggle de Modo de Vista: By Location vs By Material */}
        <div className="flex items-center bg-[#fef9f1] p-1 border border-[#e8e2d8] rounded-lg shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('by-location')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'by-location'
                ? 'bg-[#ae001a] text-white shadow-xs'
                : 'text-[#5f5e5e] hover:text-[#ae001a]'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">warehouse</span>
            BY LOCATION
          </button>
          <button
            type="button"
            onClick={() => setViewMode('by-material')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'by-material'
                ? 'bg-[#ae001a] text-white shadow-xs'
                : 'text-[#5f5e5e] hover:text-[#ae001a]'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">inventory_2</span>
            BY MATERIAL
          </button>
        </div>
      </div>

      {/* 2. Toolbar Multicriterio (Búsqueda + Filtros) */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
        {/* Fila 1: Bar de Búsqueda Alfanumérica al 100% */}
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-sans">
            search
          </span>
          <input
            type="text"
            placeholder="Search location, code, or material..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md transition-all font-sans"
          />
        </div>

        {/* Fila 2: Filtros a la izquierda, Botones a la derecha */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Selector de Ubicación Específica */}
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[150px] font-sans text-secondary cursor-pointer"
            >
              <option value="All">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={String(loc.id)}>
                  {loc.name} {loc.code ? `(${loc.code})` : ''}
                </option>
              ))}
            </select>

            {/* Toggle Rápido: Low Stock Only */}
            <label className="flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 bg-[#fef9f1] border border-[#e8e2d8] rounded">
              <input
                type="checkbox"
                checked={outOfStockOnly}
                onChange={(e) => setOutOfStockOnly(e.target.checked)}
                className="sr-only peer"
              />
              <div className="relative w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#ae001a]" />
              <span className="text-xs font-bold text-[#5f5e5e] uppercase tracking-wider">
                Low Stock Only
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Botón Acción Registrar Movimiento */}
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('movements')}
                className="bg-[#ae001a] text-white font-bold text-label-caps px-5 py-2.5 rounded hover:bg-[#d2272f] transition-colors flex items-center gap-2 font-sans cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">swap_vert</span>
                RECORD MOVEMENT
              </button>
            )}

            {/* Botón de Recarga */}
            <button
              type="button"
              onClick={() => fetchInitialData()}
              className="p-2.5 bg-white border border-[#e8e2d8] rounded hover:bg-[#fef9f1] text-secondary hover:text-[#ae001a] transition-all flex items-center justify-center cursor-pointer"
              title="Reload stock data"
              aria-label="Reload table data"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Data Grid Principal / Estados */}
      {error ? (
        <div className="bg-red-50 border border-red-200 p-8 text-center rounded-xl shadow-xs">
          <span className="material-symbols-outlined text-red-700 text-5xl">
            error
          </span>
          <p className="text-body-md text-red-800 font-bold uppercase tracking-wider mt-4">
            {error}
          </p>
        </div>
      ) : !isLoading && stockItems.length === 0 ? (
        /* Estado Vacío Cumpliendo Acceptance Criteria 1 */
        <div className="bg-white border border-[#e8e2d8] p-16 text-center rounded-xl shadow-xs flex flex-col items-center justify-center gap-6">
          <div className="w-20 h-20 bg-zinc-50 border border-zinc-100 rounded-full flex items-center justify-center shadow-inner">
            <span className="material-symbols-outlined text-zinc-400 text-4xl">
              warehouse
            </span>
          </div>
          <div className="max-w-md">
            <h3 className="font-bold text-[#222222] uppercase tracking-wider text-sm">
              No stock locations found. Click 'Add Location' to set up storage hubs like Main Warehouse or Kitchen Fridge.
            </h3>
            <p className="text-body-md text-secondary leading-relaxed mt-2">
              Configure physical storage hubs or receive purchase orders to initialize data tracking across your active branch network.
            </p>
          </div>
        </div>
      ) : (
        /* Data Grid de Almacenes y Saldos */
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded-xl shadow-xs">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-label-caps font-bold text-white uppercase tracking-wider">
              {viewMode === 'by-location' ? 'STORAGE LOCATIONS & BALANCES LEDGER' : 'RAW MATERIAL STOCK DISTRIBUTION LEDGER'}
            </span>
            <span className="material-symbols-outlined text-white text-sm cursor-pointer select-none">
              more_vert
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3.5 text-label-caps font-bold text-[#5f5e5e]">
                    {viewMode === 'by-location' ? 'Storage Location Node' : 'Raw Material Item'}
                  </th>
                  <th className="px-6 py-3.5 text-label-caps font-bold text-[#5f5e5e]">
                    {viewMode === 'by-location' ? 'Raw Material Items' : 'Assigned Storage Locations'}
                  </th>
                  <th className="px-6 py-3.5 text-right text-label-caps font-bold text-[#5f5e5e]">
                    Current Stock
                  </th>
                  <th className="px-6 py-3.5 text-right text-label-caps font-bold text-[#5f5e5e]">
                    Allocated & Net Available
                  </th>
                  <th className="px-6 py-3.5 text-right text-label-caps font-bold text-[#5f5e5e]">
                    Stock Valuation
                  </th>
                  <th className="px-6 py-3.5 text-center text-label-caps font-bold text-[#5f5e5e]">
                    Status
                  </th>
                  <th className="px-6 py-3.5 text-center text-label-caps font-bold text-[#5f5e5e]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8] text-sm">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                      <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
                        sync
                      </span>
                      <p className="text-secondary text-body-md mt-2 font-sans font-bold uppercase tracking-wider">
                        Hydrating stock locations and balances...
                      </p>
                    </td>
                  </tr>
                ) : groupedItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-secondary italic bg-white">
                      No stock locations or items match the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  groupedItems.map((group) => {
                    const isExpanded = expandedGroups.has(group.key);
                    const hasMultipleSubItems = group.items.length > 1;

                    return (
                      <React.Fragment key={group.key}>
                        {/* Fila Principal de Grupo */}
                        <tr
                          className={`group transition-colors cursor-pointer ${
                            isExpanded ? 'bg-[#fef9f1]' : 'hover:bg-[#f8f3eb]'
                          }`}
                          onClick={() => toggleGroup(group.key)}
                        >
                          {/* Columna 1: Nombre de Ubicación / Insumo + Badge Código + Star Indicator Main Storage + Warning Icon */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span
                                className={`material-symbols-outlined text-[16px] text-[#5f5e5e] transition-transform duration-200 ${
                                  isExpanded ? 'rotate-90' : ''
                                }`}
                              >
                                {hasMultipleSubItems ? 'chevron_right' : 'remove'}
                              </span>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                  <p className="font-bold text-[#1d1c17] text-sm whitespace-nowrap">{group.title}</p>
                                  {group.code && (
                                    <span className="font-mono text-[10px] font-bold bg-[#f2ede5] text-[#5f5e5e] px-1.5 py-0.5 rounded border border-[#e8e2d8] whitespace-nowrap inline-block shrink-0">
                                      {group.code}
                                    </span>
                                  )}
                                  {/* Indicator Star Main Storage */}
                                  {group.isMainStorage && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300 whitespace-nowrap shrink-0"
                                      title="Primary Storage Hub"
                                    >
                                      ⭐ Main Storage
                                    </span>
                                  )}
                                  {/* Warning Icon for Low Stock Alert */}
                                  {group.hasAlert && (
                                    <span
                                      className="material-symbols-outlined text-amber-600 animate-pulse text-base shrink-0"
                                      title="Low stock alert in one or more stored items"
                                    >
                                      warning
                                    </span>
                                  )}
                                </div>
                                <span className="text-secondary text-body-xs font-mono">
                                  {group.items.length} item line{group.items.length === 1 ? '' : 's'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Columna 2: Recuento o Insumo */}
                          <td className="px-6 py-4 font-semibold text-secondary">
                            {viewMode === 'by-location' ? (
                              <span>{group.items.length} Material{group.items.length === 1 ? '' : 's'} Stored</span>
                            ) : (
                              <span>{group.items.length} Location Hub{group.items.length === 1 ? '' : 's'}</span>
                            )}
                          </td>

                          {/* Columna 3: Current Stock (Resaltado en rojo si hay alerta) */}
                          <td className={`px-6 py-4 text-right font-mono font-bold ${group.hasAlert ? 'text-red-600 font-black' : 'text-[#1d1c17]'}`}>
                            {group.totalStock.toFixed(2)}
                          </td>

                          {/* Columna 4: Allocated Stock & Net Available */}
                          <td className="px-6 py-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="font-mono text-xs text-amber-700 font-bold">
                                Reserved: {group.totalAllocated.toFixed(2)}
                              </span>
                              <span className="font-mono text-xs font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mt-0.5">
                                Net Avail: {group.totalNetAvailable.toFixed(2)}
                              </span>
                            </div>
                          </td>

                          {/* Columna 5: Stock Valuation */}
                          <td className="px-6 py-4 text-right font-mono font-bold text-[#ae001a]">
                            ${group.totalValuation.toFixed(2)}
                          </td>

                          {/* Columna 6: Status Badge Estandarizado de Salud de Stock */}
                          <td className="px-6 py-4 text-center">
                            {group.hasAlert ? (
                              <span className="text-[10px] px-2.5 py-0.5 font-bold rounded uppercase bg-red-100 text-red-700 border border-red-200 whitespace-nowrap inline-block">
                                Low Stock
                              </span>
                            ) : (

                              <span className="text-[10px] px-2.5 py-0.5 font-bold rounded uppercase bg-emerald-100 text-emerald-700 whitespace-nowrap inline-block">
                                Healthy
                              </span>
                            )}
                          </td>


                          {/* Columna 7: Acciones */}
                          <td className="px-6 py-4 text-center">
                            {group.items.length === 1 ? (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  disabled={!isAdministrator}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenAdjust(group.items[0]);
                                  }}
                                  className={`p-1.5 rounded transition-all duration-200 cursor-pointer ${
                                    isAdministrator
                                      ? 'text-secondary hover:text-[#ae001a] hover:bg-[#fef9f1]'
                                      : 'text-zinc-300 cursor-not-allowed opacity-50'
                                  }`}
                                  title={
                                    isAdministrator
                                      ? 'Adjust Stock Manually'
                                      : 'Only authorized administrators can modify current stock thresholds manually.'
                                  }
                                >
                                  <span className="material-symbols-outlined text-[18px] block">tune</span>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewActivityLogs(group.items[0]);
                                  }}
                                  className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200 cursor-pointer"
                                  title="View Activity Logs"
                                >
                                  <span className="material-symbols-outlined text-[18px] block">history</span>
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-secondary font-bold uppercase tracking-wider">
                                {isExpanded ? 'collapse' : 'expand'}
                              </span>
                            )}
                          </td>
                        </tr>

                        {/* Sub-filas desglosadas al expandir */}
                        {isExpanded &&
                          group.items.map((subItem) => {
                            const currentStock = Number(subItem.currentQty || 0);
                            const allocatedStock = Number(subItem.allocatedQty || 0);
                            const netAvailable = Math.max(0, currentStock - allocatedStock);
                            const avgCost = getItemUnitCost(subItem);
                            const itemValuation = currentStock * avgCost;

                            const minThreshold = Number(subItem.minimumQty ?? subItem.supply?.min_stock_threshold ?? 0);
                            const isSubItemLowStock = minThreshold > 0 ? currentStock < minThreshold : false;


                            return (
                              <tr
                                key={subItem.id}
                                className={`hover:bg-[#fef9f1] border-l-4 transition-colors ${
                                  isSubItemLowStock
                                    ? 'bg-red-50/70 border-red-500'
                                    : 'bg-zinc-50/80 border-[#ae001a]/40'
                                }`}
                              >
                                <td className="px-6 py-2.5 pl-12">
                                  <span className="flex items-center gap-1.5 text-xs text-zinc-700 font-bold">
                                    <span className="material-symbols-outlined text-[14px] text-zinc-400">
                                      subdirectory_arrow_right
                                    </span>
                                    {viewMode === 'by-location'
                                      ? subItem.supply?.name || subItem.product?.name || 'Raw Material Item'
                                      : subItem.location?.name || 'Storage Location Hub'}
                                  </span>
                                </td>
                                <td className="px-6 py-2.5 text-xs text-secondary font-mono">
                                  {viewMode === 'by-location'
                                    ? `Unit: ${subItem.supply?.consumption_unit || subItem.supply?.unit || 'Units'}`
                                    : subItem.location?.code || 'N/A'}
                                </td>
                                <td className={`px-6 py-2.5 text-right font-mono font-bold text-xs ${
                                  isSubItemLowStock ? 'text-red-600 font-black' : 'text-[#1d1c17]'
                                }`}>
                                  {currentStock.toFixed(2)}
                                </td>
                                <td className="px-6 py-2.5 text-right font-mono text-xs">
                                  <span className="text-emerald-700 font-bold">
                                    {netAvailable.toFixed(2)} avail
                                  </span>{' '}
                                  <span className="text-secondary text-[11px]">
                                    ({allocatedStock.toFixed(2)} res)
                                  </span>
                                </td>
                                <td className="px-6 py-2.5 text-right font-mono font-bold text-xs text-[#ae001a]">
                                  ${itemValuation.toFixed(2)}
                                </td>
                                <td className="px-6 py-2.5 text-center">
                                  {isSubItemLowStock ? (
                                    <span className="text-[9px] px-2 py-0.5 font-bold rounded uppercase bg-red-100 text-red-700 border border-red-200 whitespace-nowrap inline-block">
                                      {currentStock <= 0 ? 'Out of Stock' : 'Low Stock'}
                                    </span>
                                  ) : (
                                    <span className="text-[9px] px-2 py-0.5 font-bold rounded uppercase bg-emerald-100 text-emerald-700 whitespace-nowrap inline-block">
                                      Healthy
                                    </span>
                                  )}
                                </td>
                                <td className="px-6 py-2.5 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      disabled={!isAdministrator}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenAdjust(subItem);
                                      }}
                                      className={`p-1 rounded transition-all duration-200 ${
                                        isAdministrator
                                          ? 'text-secondary hover:text-[#ae001a] hover:bg-[#fef9f1] cursor-pointer'
                                          : 'text-zinc-300 cursor-not-allowed opacity-50'
                                      }`}
                                      title={
                                        isAdministrator
                                          ? 'Adjust Stock Manually'
                                          : 'Only authorized administrators can modify current stock thresholds manually.'
                                      }
                                    >
                                      <span className="material-symbols-outlined text-[16px] block">tune</span>
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleViewActivityLogs(subItem);
                                      }}
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



      {/* Quick Links Hub Persistente (Sprint 25 Story 4114) */}
      <StockQuickLinks current="stock-movements" onNavigate={onNavigate} />

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
