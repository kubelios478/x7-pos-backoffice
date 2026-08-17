import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession, getStoredUser } from '../../../../../../lib/auth-storage';

interface StockItemOption {
  id: number;
  currentQty: number;
  product?: { name: string; sku?: string } | null;
  supply?: { id: number; name: string; code?: string } | null;
  location?: { id: number; name: string } | null;
}

interface Movement {
  id: number;
  item: {
    id: number;
    currentQty: number;
    product?: { name: string } | null;
    supply?: { name: string } | null;
  } | null;
  quantity: number;
  type: string;
  movementType?: string | null;
  reference: string;
  reason: string;
  createdBy?: string | null;
  sourceLocationId?: number | null;
  destinationLocationId?: number | null;
  createdAt: string;
}

interface MovementsViewProps {
  onNavigate?: (view: string) => void;
}

export const MovementsView: React.FC<MovementsViewProps> = ({ onNavigate: _onNavigate }) => {

  const [movements, setMovements] = useState<Movement[]>([]);
  const [stockItemOptions, setStockItemOptions] = useState<StockItemOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Paginación y Filtros
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(15);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [itemNameFilter, setItemNameFilter] = useState<string>('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('ALL');
  const [itemIdFilter, setItemIdFilter] = useState<string>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('itemId') || '';
  });

  // Modal Record Movement
  const [isRecordOpen, setIsRecordOpen] = useState<boolean>(false);
  const [formSupplyId, setFormSupplyId] = useState<string>('');
  const [formLocationId, setFormLocationId] = useState<string>('');
  const [formDestinationLocationId, setFormDestinationLocationId] = useState<string>('');
  const [formMovementType, setFormMovementType] = useState<string>('PURCHASE_RECEIPT');
  const [formQuantity, setFormQuantity] = useState<number>(1);
  const [formReference, setFormReference] = useState<string>('');
  const [formReason, setFormReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const currentUser = getStoredUser();
  const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

  // Lista única de materias primas por nombre e ID
  const uniqueSuppliesMap = new Map<number, { id: number; name: string }>();
  stockItemOptions.forEach(item => {
    if (item.supply?.id && item.supply?.name) {
      uniqueSuppliesMap.set(item.supply.id, { id: item.supply.id, name: item.supply.name });
    } else if (item.product?.name) {
      uniqueSuppliesMap.set(item.id, { id: item.id, name: item.product.name });
    }
  });
  const uniqueSupplies = Array.from(uniqueSuppliesMap.values());

  // Ubicaciones disponibles para la materia prima seleccionada
  const availableStockItems = stockItemOptions.filter(item => {
    if (!formSupplyId) return false;
    if (item.supply?.id) return String(item.supply.id) === formSupplyId;
    return String(item.id) === formSupplyId;
  });

  // Lista única de ubicaciones globales para transferencia
  const uniqueLocationsMap = new Map<number, string>();
  stockItemOptions.forEach(item => {
    if (item.location?.id && item.location?.name) {
      uniqueLocationsMap.set(item.location.id, item.location.name);
    }
  });
  const uniqueLocations = Array.from(uniqueLocationsMap.entries()).map(([id, name]) => ({ id, name }));

  useEffect(() => {
    fetchMovements();
    fetchStockItems();
  }, [page, itemNameFilter, itemIdFilter, movementTypeFilter]);

  const fetchStockItems = async () => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      let res = await fetch(`${API_BASE}/v1/raw-material-stock/items?limit=100`, { headers });
      if (!res.ok) {
        res = await fetch(`${API_BASE}/items?limit=100`, { headers });
      }
      if (res.ok) {
        const json = await res.json();
        const data = json.items || json.data || json || [];
        setStockItemOptions(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Error loading stock items options', e);
    }
  };

  const fetchMovements = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      let url = `${API_BASE}/v1/raw-material-stock/movements?page=${page}&limit=${limit}`;
      if (itemIdFilter) {
        url += `&itemId=${encodeURIComponent(itemIdFilter)}`;
      } else if (itemNameFilter.trim()) {
        url += `&itemName=${encodeURIComponent(itemNameFilter)}`;
      }
      if (movementTypeFilter !== 'ALL') {
        url += `&movementType=${encodeURIComponent(movementTypeFilter)}`;
      }

      let res = await fetch(url, { headers });
      if (!res.ok || res.status === 404) {
        url = `${API_BASE}/movements?page=${page}&limit=${limit}`;
        if (itemIdFilter) url += `&itemId=${encodeURIComponent(itemIdFilter)}`;
        else if (itemNameFilter.trim()) url += `&itemName=${encodeURIComponent(itemNameFilter)}`;
        res = await fetch(url, { headers });
      }

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        throw new Error('Error al consultar el registro de movimientos');
      }

      const json = await res.json();
      const bodyData = json.data || json;
      setMovements(Array.isArray(bodyData) ? bodyData : (Array.isArray(bodyData.data) ? bodyData.data : []));

      if (bodyData.totalPages) {
        setTotalPages(bodyData.totalPages);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error loading stock movements.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecordMovementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSupplyId || !formLocationId) {
      setSubmitError('Please select both a Raw Material and a Storage Location.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const selectedStockItem = availableStockItems.find(i => String(i.location?.id) === formLocationId);
      if (!selectedStockItem) {
        throw new Error('Stock item record not found for the selected location');
      }

      const isEntry = ['PURCHASE_RECEIPT', 'IN', 'RETURN'].includes(formMovementType);

      const payload = {
        stockItemId: selectedStockItem.id,
        quantity: Number(formQuantity),
        type: isEntry ? 'IN' : 'OUT',
        movementType: formMovementType,
        reference: formReference || `MANUAL-${Date.now()}`,
        reason: formReason || 'Manual inventory operation log',
        sourceLocationId: Number(formLocationId),
        destinationLocationId: formMovementType === 'TRANSFER' && formDestinationLocationId ? Number(formDestinationLocationId) : null,
        createdBy: currentUser?.email || 'Inventory Clerk'
      };

      const res = await fetch(`${API_BASE}/v1/raw-material-stock/movements`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to record movement');
      }

      setIsRecordOpen(false);
      setFormSupplyId('');
      setFormLocationId('');
      setFormDestinationLocationId('');
      setFormQuantity(1);
      setFormReference('');
      setFormReason('');
      fetchMovements();
    } catch (err: any) {
      setSubmitError(err.message || 'Error creating movement record');
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      {/* Título de Sección */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
          STOCK MOVEMENTS LOG
        </h2>
        <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
          Audit trail of all inventory entries, exits, transfers, sales depletions, and adjustments across all active storage locations.
        </p>
      </div>

      {/* Panel de búsqueda y acciones */}
      <div className="bg-white border border-[#e8e2d8] rounded p-6 shadow-sm space-y-4">
        {/* Fila 1: Buscador a ancho completo */}
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-sans">
            search
          </span>
          <input
            type="text"
            placeholder="Search stock movements by ingredient name..."
            value={itemNameFilter}
            onChange={(e) => {
              setItemNameFilter(e.target.value);
              setPage(1);
            }}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-body-md font-sans outline-none focus:border-[#ae001a]"
          />
        </div>

        {/* Fila 2: Filtros + Acciones + Reload (Todos alineados a la izquierda) */}
        <div className="flex flex-wrap items-center justify-start gap-3 pt-1">
          {/* Movement Type Filter */}
          <select
            value={movementTypeFilter}
            onChange={(e) => {
              setMovementTypeFilter(e.target.value);
              setPage(1);
            }}
            className="px-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-body-sm font-sans outline-none focus:border-[#ae001a] text-secondary cursor-pointer font-bold"
          >
            <option value="ALL">All Movement Types</option>
            <option value="PURCHASE_RECEIPT">PURCHASE_RECEIPT</option>
            <option value="POS_DEPLETION">POS_DEPLETION</option>
            <option value="ADJUSTMENT">ADJUSTMENT</option>
            <option value="WASTE">WASTE</option>
            <option value="TRANSFER">TRANSFER</option>
          </select>

          {itemIdFilter && (
            <div className="flex items-center gap-2 bg-[#fef9f1] border border-[#ae001a]/30 px-3 py-2 rounded text-xs font-bold text-[#ae001a] whitespace-nowrap">
              <span>Filtered by Item #{itemIdFilter}</span>
              <button
                onClick={() => {
                  setItemIdFilter('');
                  window.history.pushState({}, '', '/inventory/movements');
                  setPage(1);
                }}
                className="text-zinc-500 hover:text-[#ae001a] font-bold cursor-pointer ml-1 text-sm"
                title="Clear item filter"
              >
                ✕
              </button>
            </div>
          )}

          <button
            onClick={() => setIsRecordOpen(true)}
            className="px-5 py-2.5 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#8e0015] transition-all duration-200 cursor-pointer text-xs rounded flex items-center gap-1.5 shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            <span>RECORD MOVEMENT</span>
          </button>

          <button
            onClick={() => {
              window.history.pushState({}, '', '/inventory/stocks');
              _onNavigate?.('stock-movements');
            }}
            className="px-4 py-2.5 bg-[#ece8e0] text-[#1c1b16] font-bold text-label-caps hover:bg-[#dcd7cd] transition-all duration-200 cursor-pointer text-xs rounded border border-[#e8e2d8]"
          >
            Back to Stock Ledger
          </button>

          <button
            onClick={() => fetchMovements()}
            className="p-2 bg-white border border-[#e8e2d8] rounded hover:bg-[#fef9f1] text-[#5f5e5e] hover:text-[#ae001a] transition-all flex items-center justify-center cursor-pointer font-sans h-[38px] w-[38px]"
            title="Reload movements data"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>

        </div>
      </div>



      {/* Tabla */}
      {isLoading ? (
        <div className="py-20 text-center bg-white border border-[#e8e2d8] rounded">
          <span className="material-symbols-outlined text-secondary animate-spin text-4xl">sync</span>
          <p className="text-secondary text-body-sm mt-3 uppercase tracking-wider font-bold">
            Loading activity history...
          </p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 border border-red-200 text-red-800 text-body-md rounded-lg">
          {error}
        </div>
      ) : (
        <div className="bg-white border border-[#e8e2d8] rounded shadow-sm overflow-hidden">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-label-caps font-bold text-white uppercase tracking-wider">
              STOCK MOVEMENTS LEDGER
            </span>
            <span className="material-symbols-outlined text-white text-sm cursor-pointer select-none">
              more_vert
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-label-caps font-bold text-[#5f5e5e]">Date & Time</th>
                  <th className="px-6 py-3 text-label-caps font-bold text-[#5f5e5e] text-center">Movement Type</th>
                  <th className="px-6 py-3 text-label-caps font-bold text-[#5f5e5e] text-right">Quantity</th>
                  <th className="px-6 py-3 text-label-caps font-bold text-[#5f5e5e]">Operator / Creator</th>
                  <th className="px-6 py-3 text-label-caps font-bold text-[#5f5e5e]">Reference & Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-secondary italic bg-white">
                      No stock movements found.
                    </td>
                  </tr>
                ) : (
                  movements.map((mv) => {
                    const typeCode = mv.movementType || mv.type;
                    const isEntry = ['IN', 'PURCHASE_RECEIPT', 'RETURN', 'PURCHASE_ENTRY'].includes(typeCode);
                    return (
                      <tr key={mv.id} className="hover:bg-[#f8f3eb] transition-colors">
                        <td className="px-6 py-4 text-body-sm text-zinc-800">
                          {new Date(mv.createdAt).toLocaleDateString()} • {new Date(mv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded uppercase ${
                            isEntry ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-red-100 text-red-700 border border-red-200'
                          }`}>
                            {typeCode}
                          </span>
                        </td>
                        <td className={`px-6 py-4 font-mono font-bold text-right text-sm ${
                          isEntry ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {isEntry ? '+' : '-'}{mv.quantity}
                        </td>
                        <td className="px-6 py-4 text-body-xs font-semibold text-zinc-700">
                          {mv.createdBy || 'System'}
                        </td>
                        <td className="px-6 py-4 text-body-sm text-zinc-800">
                          <span className="font-bold block text-zinc-900">{mv.reference || 'N/A'}</span>
                          <span className="text-secondary text-xs">{mv.reason || 'N/A'}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="bg-[#fef9f1] px-6 py-4 border-t border-[#e8e2d8] flex justify-between items-center">
              <button
                disabled={page <= 1}
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                className="px-4 py-2 border border-[#e8e2d8] rounded font-bold text-xs uppercase tracking-wider hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-white"
              >
                Previous
              </button>
              <span className="text-body-xs font-semibold text-zinc-600">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                className="px-4 py-2 border border-[#e8e2d8] rounded font-bold text-xs uppercase tracking-wider hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-white"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Portal Modal + RECORD MOVEMENT */}
      {isRecordOpen && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-hidden flex justify-end font-sans">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsRecordOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 border-l border-zinc-200">
            <div className="p-6 border-b border-zinc-200 bg-white flex justify-between items-center">
              <div>
                <h3 className="text-heading-md font-bold text-[#ae001a] uppercase tracking-wider font-sans">
                  Record Stock Movement
                </h3>
                <p className="text-secondary text-body-xs mt-1 font-sans">
                  Manual inventory entry, waste, or adjustment log
                </p>
              </div>
              <button onClick={() => setIsRecordOpen(false)} className="p-1.5 text-secondary hover:text-[#ae001a]">
                <span className="material-symbols-outlined block text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleRecordMovementSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Seleccionar Materia Prima (Sólo Nombre Limpio) */}
              <div className="space-y-1.5">
                <label className="block text-body-xs font-bold text-zinc-700">Select Raw Material</label>
                <select
                  value={formSupplyId}
                  onChange={(e) => {
                    setFormSupplyId(e.target.value);
                    setFormLocationId('');
                  }}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded text-body-sm font-sans outline-none focus:border-[#ae001a]"
                  required
                >
                  <option value="" disabled>Select a raw material...</option>
                  {uniqueSupplies.map(s => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Seleccionar Ubicación / Almacén */}
              <div className="space-y-1.5">
                <label className="block text-body-xs font-bold text-zinc-700">Select Storage Location</label>
                <select
                  value={formLocationId}
                  onChange={(e) => setFormLocationId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded text-body-sm font-sans outline-none focus:border-[#ae001a]"
                  disabled={!formSupplyId}
                  required
                >
                  <option value="" disabled>
                    {!formSupplyId ? 'First select a raw material above...' : 'Select storage location...'}
                  </option>
                  {availableStockItems.map(i => (
                    <option key={i.id} value={String(i.location?.id)}>
                      {i.location?.name || 'Unassigned'} — Current Stock: {i.currentQty}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ubicación Destino si es TRANSFER */}
              {formMovementType === 'TRANSFER' && (
                <div className="space-y-1.5">
                  <label className="block text-body-xs font-bold text-zinc-700">Select Destination Location</label>
                  <select
                    value={formDestinationLocationId}
                    onChange={(e) => setFormDestinationLocationId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded text-body-sm font-sans outline-none focus:border-[#ae001a]"
                    required
                  >
                    <option value="" disabled>Select destination location...</option>
                    {uniqueLocations.filter(loc => String(loc.id) !== formLocationId).map(loc => (
                      <option key={loc.id} value={String(loc.id)}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}


              {/* Movement Type */}
              <div className="space-y-1.5">
                <label className="block text-body-xs font-bold text-zinc-700">Movement Type</label>
                <select
                  value={formMovementType}
                  onChange={(e) => setFormMovementType(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded text-body-sm font-sans outline-none focus:border-[#ae001a]"
                >
                  <option value="PURCHASE_RECEIPT">PURCHASE_RECEIPT (Entrada por Compra)</option>
                  <option value="WASTE">WASTE (Mermas / Desperdicio)</option>
                  <option value="TRANSFER">TRANSFER (Transferencia entre Almacenes)</option>
                  <option value="ADJUSTMENT">ADJUSTMENT (Ajuste Manual de Inventario)</option>
                </select>
              </div>

              {/* Quantity */}
              <div className="space-y-1.5">
                <label className="block text-body-xs font-bold text-zinc-700">Quantity Units</label>
                <input
                  type="number"
                  min="1"
                  value={formQuantity}
                  onChange={(e) => setFormQuantity(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded text-body-sm font-sans outline-none focus:border-[#ae001a]"
                  required
                />
              </div>

              {/* Reference */}
              <div className="space-y-1.5">
                <label className="block text-body-xs font-bold text-zinc-700">Reference (e.g. Invoice/Ticket #)</label>
                <input
                  type="text"
                  placeholder="e.g. INV-2026-001"
                  value={formReference}
                  onChange={(e) => setFormReference(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded text-body-sm font-sans outline-none focus:border-[#ae001a]"
                />
              </div>

              {/* Reason */}
              <div className="space-y-1.5">
                <label className="block text-body-xs font-bold text-zinc-700">Reason / Notes</label>
                <textarea
                  placeholder="Enter reason for this movement..."
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  className="w-full p-3 bg-white border border-zinc-200 rounded h-20 text-body-sm outline-none focus:border-[#ae001a] resize-none"
                  required
                />
              </div>

              {submitError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-body-xs rounded font-bold">
                  {submitError}
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setIsRecordOpen(false)}
                  className="flex-1 py-2 border border-zinc-200 rounded text-zinc-700 text-body-sm font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 bg-[#ae001a] text-white rounded text-body-sm font-bold hover:bg-[#8e0015] disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Record Movement'}
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

