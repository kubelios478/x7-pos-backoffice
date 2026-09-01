import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession, getStoredUser } from '../../../../../lib/auth-storage';
import { StockQuickLinks } from '../stocks/StockQuickLinks';
import { EmergencySupportModal } from '../../../modals/QuickActionModals';

interface Category {
  id: number;
  name: string;
  isActive?: boolean;
  is_active?: boolean;
}

interface RawMaterial {
  id: number;
  code: string;
  sku?: string | null;
  name: string;
  category_id?: number | null;
  category?: Category | null;
  unit: string;
  purchase_unit?: string | null;
  consumption_unit?: string | null;
  conversion_factor: number;
  cost_per_unit?: number | null;
  description?: string | null;
  isActive: boolean;
  // Campos del stock relacionados a mostrar
  currentQty?: number;
  minimumQty?: number | null;
  weightedAverageUnitCost?: number | string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface RawMaterialsViewProps {
  onNavigate?: (view: string) => void;
}

export const RawMaterialsView: React.FC<RawMaterialsViewProps> = ({ onNavigate }) => {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [purchaseUnitFilter, setPurchaseUnitFilter] = useState<string>('All');
  const [consumptionUnitFilter, setConsumptionUnitFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');






  // Drawer y Detalles
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit' | 'view'>('add');
  const [selectedMaterial, setSelectedMaterial] = useState<RawMaterial | null>(null);

  // Form Fields
  const [formName, setFormName] = useState<string>('');
  const [formSku, setFormSku] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('');
  const [formPurchaseUnit, setFormPurchaseUnit] = useState<string>('KG');
  const [formConsumptionUnit, setFormConsumptionUnit] = useState<string>('GRAM');
  const [formConversionFactor, setFormConversionFactor] = useState<number>(1);
  const [formCostPerUnit, setFormCostPerUnit] = useState<string>('');
  const [formMinStock, setFormMinStock] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);

  // Warnings & Modals
  const [isWarningModalOpen, setIsWarningModalOpen] = useState<boolean>(false);
  const [warningMessage, setWarningMessage] = useState<string>('');
  const [pendingSaveHandler, setPendingSaveHandler] = useState<(() => Promise<void>) | null>(null);

  // Confirm Toggle Active modal
  const [isToggleModalOpen, setIsToggleModalOpen] = useState<boolean>(false);
  const [toggleTarget, setToggleTarget] = useState<RawMaterial | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState<boolean>(false);

  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);
  const topRef = useRef<HTMLDivElement | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
  const currentUser = getStoredUser();
  const isInventorySpecialist = ['merchant_admin', 'admin', 'super_admin', 'SaaS Owner', 'Inventory Specialist'].includes(currentUser?.role || '');

  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'instant' });
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const materialsRes = await fetch(`${API_BASE}/v1/inventory/raw-materials?limit=100&status=all`, { headers });
      if (materialsRes.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const categoriesRes = await fetch(`${API_BASE}/v1/raw-material-categories`, { headers });
      const stockRes = await fetch(`${API_BASE}/v1/raw-material-stock/items?limit=100`, { headers });

      if (!materialsRes.ok) {
        throw new Error('Error al cargar materias primas del servidor');
      }

      const materialsJson = await materialsRes.json();
      const categoriesJson = categoriesRes.ok ? await categoriesRes.json() : { data: [] };
      const stockJson = stockRes.ok ? await stockRes.json() : { data: [] };

      const rawMaterialsData = materialsJson.items || materialsJson.data || materialsJson || [];
      const rawCategoriesData = categoriesJson.data || categoriesJson.items || categoriesJson || [];
      const stockData = stockJson.data || stockJson.items || stockJson || [];
      const mappedMaterials: RawMaterial[] = rawMaterialsData.map((rm: any) => {
        const stockItems = stockData.filter((s: any) => {
          const sid = s.supplyId || s.supply_id || s.supply?.id || s.rawMaterialId || s.raw_material_id;
          return Number(sid) === Number(rm.id);
        });
        const totalQty = stockItems.reduce((acc: number, cur: any) => acc + (Number(cur.currentQty) || 0), 0);
        const minStockItem = stockItems.find((s: any) => s.minimumQty != null || s.minimum_qty != null);
        const minStock = minStockItem ? (minStockItem.minimumQty ?? minStockItem.minimum_qty) : null;
        const waccItem = stockItems.find((s: any) => s.weightedAverageUnitCost != null);
        const wacc = waccItem ? waccItem.weightedAverageUnitCost : null;


        return {
          id: rm.id,
          code: rm.code,
          sku: rm.sku || rm.code,
          name: rm.name,
          category_id: rm.category_id,
          category: rm.category ? { id: rm.category.id, name: rm.category.name } : null,
          unit: rm.unit,
          purchase_unit: rm.purchase_unit,
          consumption_unit: rm.consumption_unit,
          conversion_factor: Number(rm.conversion_factor) || 1,
          cost_per_unit: Number(rm.cost_per_unit) || null,
          description: rm.description,
          isActive: rm.isActive !== undefined ? rm.isActive : true,
          currentQty: totalQty,
          minimumQty: minStock,
          weightedAverageUnitCost: wacc,
          createdAt: rm.created_at || rm.createdAt,
          updatedAt: rm.updated_at || rm.updatedAt,
        };
      });

      setMaterials(mappedMaterials);
      setCategories(rawCategoriesData);
    } catch (err: any) {
      console.error('Error fetching raw materials:', err);
      setError('No se pudieron cargar las materias primas. Por favor, revisa la conexión con el servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAdd = () => {
    if (!isInventorySpecialist) return;
    setDrawerMode('add');
    setSelectedMaterial(null);
    setFormName('');
    setFormSku('');
    setFormCategory(categories[0]?.id ? String(categories[0].id) : '');
    setFormPurchaseUnit('KG');
    setFormConsumptionUnit('GRAM');
    setFormConversionFactor(1000);
    setFormCostPerUnit('');
    setFormMinStock('');
    setFormDescription('');
    setFormIsActive(true);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (material: RawMaterial) => {
    if (!isInventorySpecialist) return;
    setDrawerMode('edit');
    setSelectedMaterial(material);
    setFormName(material.name);
    setFormSku(material.sku || '');
    setFormCategory(material.category_id ? String(material.category_id) : '');
    setFormPurchaseUnit(material.purchase_unit || 'KG');
    setFormConsumptionUnit(material.consumption_unit || 'GRAM');
    setFormConversionFactor(material.conversion_factor);
    setFormCostPerUnit(material.cost_per_unit != null ? String(material.cost_per_unit) : '');
    setFormMinStock(material.minimumQty != null ? String(material.minimumQty) : '');
    setFormDescription(material.description || '');
    setFormIsActive(material.isActive);
    setIsDrawerOpen(true);
  };

  const handleOpenView = (material: RawMaterial) => {
    setDrawerMode('view');
    setSelectedMaterial(material);
    setIsDrawerOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formConversionFactor <= 0) {
      alert('Error: The conversion factor must be strictly greater than zero.');
      return;
    }

    const token = getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const isEdit = drawerMode === 'edit' && selectedMaterial;
    const finalSku = formSku && formSku.trim() !== '' ? formSku.trim() : undefined;
    const bodyData: any = {
      name: formName,
      sku: finalSku,
      category_id: formCategory ? Number(formCategory) : undefined,
      purchase_unit: formPurchaseUnit,
      consumption_unit: formConsumptionUnit,
      conversion_factor: Number(formConversionFactor),
      cost_per_unit: formCostPerUnit ? Number(formCostPerUnit) : undefined,
      minimumQty: formMinStock ? Number(formMinStock) : undefined,
      description: formDescription || undefined,
      isActive: formIsActive,
    };


    const saveAction = async () => {
      try {
        setIsLoading(true);
        setIsDrawerOpen(false);

        let res;
        if (isEdit) {
          res = await fetch(`${API_BASE}/v1/inventory/raw-materials/${selectedMaterial.id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(bodyData),
          });
        } else {
          if (finalSku) {
            bodyData.code = finalSku;
          } else {
            const localUuid = crypto.randomUUID();
            bodyData.code = `RM-${localUuid.split('-')[0].toUpperCase()}`;
          }
          res = await fetch(`${API_BASE}/v1/inventory/raw-materials`, {
            method: 'POST',
            headers,
            body: JSON.stringify(bodyData),
          });
        }


        if (!res.ok) {
          const errorJson = await res.json().catch(() => ({}));
          throw new Error(errorJson.message || 'Error al guardar el insumo en el servidor');
        }

        await fetchData();
      } catch (err: any) {
        alert(err.message || 'No se pudo completar la operación');
      } finally {
        setIsLoading(false);
      }
    };

    // Cost Lock & Recipe Linkage Warnings
    if (isEdit) {
      const unitOrFactorChanged =
        selectedMaterial.purchase_unit !== formPurchaseUnit ||
        selectedMaterial.consumption_unit !== formConsumptionUnit ||
        selectedMaterial.conversion_factor !== Number(formConversionFactor);

      if (unitOrFactorChanged) {
        try {
          const usageRes = await fetch(`${API_BASE}/v1/inventory/raw-materials/${selectedMaterial.id}/usage`, { headers });
          if (usageRes.ok) {
            const usageData = await usageRes.json();
            if (usageData.inRecipes || usageData.inMovements) {
              setWarningMessage(
                `Warning: This raw material is currently bound to active recipes or inventory movements. Modifying unit conversion factors will affect existing recipe yield calculations and historical costing model alignment.`
              );
              setPendingSaveHandler(() => saveAction);
              setIsWarningModalOpen(true);
              return;
            }
          }
        } catch (err) {
          console.error('Error checking usage:', err);
        }
      }
    }

    await saveAction();
  };

  const handleOpenToggleActive = (e: React.MouseEvent, material: RawMaterial) => {
    e.stopPropagation();
    if (!isInventorySpecialist) return;
    setToggleTarget(material);
    setToggleError(null);
    setIsToggleModalOpen(true);
  };

  const executeToggleActive = async () => {
    if (!toggleTarget) return;
    setIsToggling(true);
    setToggleError(null);

    const token = getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    try {
      const nextActiveState = !toggleTarget.isActive;

      // Si intentan desactivar (poner isActive = false), validamos si tiene uso
      if (!nextActiveState) {
        // La deactivación por soft status (isActive = false) SÍ es la forma de "eliminar de nuevas recetas".
      }

      // Aplicar soft deactivation (PATCH)
      const res = await fetch(`${API_BASE}/v1/inventory/raw-materials/${toggleTarget.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isActive: nextActiveState }),
      });

      if (!res.ok) {
        throw new Error('Error al actualizar el estatus de la materia prima');
      }

      setIsToggleModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setToggleError(err.message || 'Error al cambiar estatus');
    } finally {
      setIsToggling(false);
    }
  };

  // Filtrado de materiales reactivo
  const filteredMaterials = materials.filter((m) => {
    if (statusFilter === 'Active' && !m.isActive) return false;
    if (statusFilter === 'Inactive' && m.isActive) return false;


    const matchSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.sku && m.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (m.description && m.description.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!matchSearch) return false;

    if (categoryFilter !== 'All') {
      if (String(m.category_id) !== categoryFilter) return false;
    }

    if (purchaseUnitFilter !== 'All') {
      if (m.purchase_unit !== purchaseUnitFilter) return false;
    }

    if (consumptionUnitFilter !== 'All') {
      if (m.consumption_unit !== consumptionUnitFilter) return false;
    }

    return true;
  });

  return (
    <div ref={topRef} className="space-y-6 text-left p-6 font-sans">
      {/* Header */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
          RAW MATERIALS WORKSPACE
        </h2>
        <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
          Track supply master data, conversion ratios, average costs, and stock levels.
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
            placeholder="Search raw materials by name, SKU, description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-body-md font-sans outline-none focus:border-[#ae001a]"
          />
        </div>

        {/* Fila 2: Filtros a la izquierda, Botones a la derecha */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-3">
            {/* Categorías */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-body-sm font-sans outline-none focus:border-[#ae001a] text-secondary cursor-pointer"
            >
              <option value="All">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>

            {/* Unidades de Compra */}
            <select
              value={purchaseUnitFilter}
              onChange={(e) => setPurchaseUnitFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-body-sm font-sans outline-none focus:border-[#ae001a] text-secondary cursor-pointer"
            >
              <option value="All">All Purchase Units</option>
              <option value="KG">KG</option>
              <option value="BOX">BOX</option>
              <option value="LITER">LITER</option>
              <option value="BAG">BAG</option>
            </select>

            {/* Unidades de Consumo */}
            <select
              value={consumptionUnitFilter}
              onChange={(e) => setConsumptionUnitFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-body-sm font-sans outline-none focus:border-[#ae001a] text-secondary cursor-pointer"
            >
              <option value="All">All Consumption Units</option>
              <option value="GRAM">GRAM</option>
              <option value="MILLILITER">MILLILITER</option>
              <option value="UNIT">UNIT</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[130px] font-sans text-secondary cursor-pointer"
            >
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isInventorySpecialist && (
              <button
                onClick={handleOpenAdd}
                className="px-5 py-2.5 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#8e0015] transition-all duration-200 cursor-pointer text-xs rounded flex items-center gap-1.5 shadow-sm"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>ADD RAW MATERIAL</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => fetchData()}
              className="p-2.5 bg-white border border-[#e8e2d8] rounded hover:bg-[#fef9f1] text-secondary hover:text-[#ae001a] transition-all flex items-center justify-center cursor-pointer"
              title="Reload raw materials data"
              aria-label="Reload table data"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>
          </div>
        </div>
      </div>




      {/* Contenedor de la Tabla */}

      <div className="bg-white border border-[#e8e2d8] rounded overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-4 border-gray-300 border-t-[#d51f2c] rounded-full animate-spin mx-auto"></div>
            <p className="text-sm text-gray-500 font-medium">Loading raw materials workspace...</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center text-red-600 space-y-2">
            <span className="material-symbols-outlined text-4xl">warning</span>
            <p className="text-sm font-semibold">{error}</p>
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="py-20 text-center space-y-4">
            <span className="material-symbols-outlined text-5xl text-gray-300">inventory_2</span>
            <h3 className="text-lg font-black text-[#222222] uppercase tracking-tight">No raw materials found.</h3>
            <p className="text-sm text-[#666666] max-w-md mx-auto">
              No raw materials found. Click 'Add Raw Material' to register new supply items for recipe costing.
            </p>
          </div>
        ) : (
          <>
            <div className="p-4 bg-[#222222] flex justify-between items-center">
              <span className="text-label-caps font-bold text-white uppercase tracking-wider">
                RAW MATERIALS MASTER DIRECTORY
              </span>
              <span className="material-symbols-outlined text-white text-sm cursor-pointer select-none">
                more_vert
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-label-caps font-bold text-[#5f5e5e]">Raw Material & SKU</th>
                    <th className="px-6 py-3.5 text-left text-label-caps font-bold text-[#5f5e5e]">Category Tag</th>
                    <th className="px-6 py-3.5 text-left text-label-caps font-bold text-[#5f5e5e]">Unit Conversion Matrix</th>
                    <th className="px-6 py-3.5 text-right text-label-caps font-bold text-[#5f5e5e]">Costing Metrics</th>
                    <th className="px-6 py-3.5 text-center text-label-caps font-bold text-[#5f5e5e]">Min Stock Threshold</th>
                    <th className="px-6 py-3.5 text-center text-label-caps font-bold text-[#5f5e5e]">Status Badge</th>
                    <th className="px-6 py-3.5 text-center text-label-caps font-bold text-[#5f5e5e]">Actions</th>
                  </tr>
                </thead>

              <tbody className="divide-y divide-[#e8e2d8]">
                {filteredMaterials.map((m) => {
                  const isLowStock = m.minimumQty != null && (m.currentQty || 0) < m.minimumQty;
                  const isInactive = m.isActive === false;

                  return (
                    <tr
                      key={m.id}
                      onClick={() => handleOpenView(m)}
                      className={`transition-all cursor-pointer ${
                        isInactive ? 'bg-[#f8f3eb]/40 opacity-75' : 'hover:bg-[#f8f3eb]'
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className={`font-sans font-bold text-gray-900 text-sm ${isInactive ? 'line-through' : ''}`}>{m.name}</div>
                        {m.sku && (
                          <span className="inline-block bg-[#f0ebd9] text-[#222222] text-[10px] font-black uppercase px-2 py-0.5 mt-1 rounded tracking-wider">
                            {m.sku}
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {m.category ? (
                          <span className="inline-block bg-[#f0ebd9] text-[#222222] text-xs font-bold px-3 py-1 rounded-full">
                            {m.category.name}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No Category</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-sm text-[#222222] font-semibold">
                        {m.purchase_unit && m.consumption_unit ? (
                          <span>
                            1 {m.purchase_unit} = {m.conversion_factor} {m.consumption_unit}
                          </span>
                        ) : (
                          <span className="text-gray-400">Not defined</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right space-y-1">
                        <div className="text-sm font-black text-[#222222]">
                          LPC: {m.cost_per_unit != null ? `$${m.cost_per_unit.toFixed(2)}` : 'N/A'}
                        </div>
                        <div className="text-xs text-gray-500 font-bold">
                          WACC: {m.weightedAverageUnitCost != null ? `$${Number(m.weightedAverageUnitCost).toFixed(2)}` : 'N/A'}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex items-center gap-1.5 justify-center">
                          <span className="text-sm font-bold text-[#222222]">
                            Qty: {m.currentQty || 0} / Min: {m.minimumQty ?? '-'}
                          </span>
                          {isLowStock && (
                            <span className="material-symbols-outlined text-red-600 text-lg animate-pulse" title="Stock alert: Under minimum threshold!">
                              warning
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <span
                          className={`text-[10px] px-2.5 py-0.5 font-bold rounded uppercase ${
                            m.isActive
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-zinc-100 text-zinc-600'
                          }`}
                        >
                          {m.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>


                      <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center gap-2.5">
                          <button
                            onClick={() => handleOpenEdit(m)}
                            className="p-1 text-gray-500 hover:text-[#ae001a] transition-all cursor-pointer"
                            title="Edit raw material"
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button
                            onClick={(e) => handleOpenToggleActive(e, m)}
                            className="p-1 text-gray-500 hover:text-[#ae001a] transition-all cursor-pointer"
                            title={m.isActive ? 'Deactivate raw material' : 'Activate raw material'}
                          >
                            <span className="material-symbols-outlined text-lg">
                              {m.isActive ? 'block' : 'check_circle'}
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>


      {/* Quick Links Hub Persistente (Sprint 25 Story 4114) */}
      <StockQuickLinks current="raw-materials" onNavigate={onNavigate} />


      {/* Drawer Interactivo */}
      {isDrawerOpen && createPortal(
        <div className="fixed inset-0 z-[999] flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setIsDrawerOpen(false)}
          />

          {/* Operational Drawer Content */}
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-[#e8e2d8] animate-slide-in">
            {/* Header */}
            <div className="bg-[#222222] p-6 text-white flex justify-between items-center shrink-0">
              <div>
                <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest block mb-0.5">
                  Supply Master Data
                </span>
                <h3 className="font-black text-lg uppercase tracking-tight font-sans">
                  {drawerMode === 'add' ? 'Add Raw Material' : drawerMode === 'edit' ? 'Edit Raw Material' : 'View Material Details'}
                </h3>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {/* Nombre */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                    Raw Material Name
                  </label>
                  <input
                    type="text"
                    maxLength={150}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    disabled={drawerMode === 'view'}
                    className="bg-white text-[#1d1c17] px-3.5 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full disabled:bg-gray-50"
                    placeholder="e.g. Tomato Paste, Whole Milk"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* SKU */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                      SKU Code (Unique)
                    </label>
                    <input
                      type="text"
                      value={formSku}
                      onChange={(e) => setFormSku(e.target.value)}
                      disabled={drawerMode === 'view'}
                      className="bg-white text-[#1d1c17] px-3.5 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full disabled:bg-gray-50"
                      placeholder="e.g. RM-TOM-01"
                    />
                  </div>

                  {/* Categoria */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                      Category Tag
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      disabled={drawerMode === 'view'}
                      required
                      className="bg-white text-[#1d1c17] px-3.5 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full disabled:bg-gray-50"
                    >
                      <option value="" disabled>Select category...</option>
                      {categories
                        .filter((cat) => {
                          const isCatActive = cat.isActive !== undefined ? cat.isActive : (cat.is_active !== undefined ? cat.is_active : true);
                          return isCatActive || cat.id === Number(formCategory);
                        })
                        .map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 bg-[#fcfbf9] border border-[#e8e2d8] p-5 rounded-lg">
                  {/* Purchase Unit */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-[#5f5e5e] uppercase font-sans">
                      Purchase Unit
                    </label>
                    <select
                      value={formPurchaseUnit}
                      onChange={(e) => setFormPurchaseUnit(e.target.value)}
                      disabled={drawerMode === 'view'}
                      className="bg-white text-[#1d1c17] px-3 py-1.5 border border-[#e8e2d8] rounded text-xs focus:border-[#ae001a] outline-none w-full disabled:bg-gray-50"
                    >
                      <option value="KG">KG</option>
                      <option value="BOX">BOX</option>
                      <option value="LITER">LITER</option>
                      <option value="BAG">BAG</option>
                    </select>
                  </div>

                  {/* Consumption Unit */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-[#5f5e5e] uppercase font-sans">
                      Consumption Unit
                    </label>
                    <select
                      value={formConsumptionUnit}
                      onChange={(e) => setFormConsumptionUnit(e.target.value)}
                      disabled={drawerMode === 'view'}
                      className="bg-white text-[#1d1c17] px-3 py-1.5 border border-[#e8e2d8] rounded text-xs focus:border-[#ae001a] outline-none w-full disabled:bg-gray-50"
                    >
                      <option value="GRAM">GRAM</option>
                      <option value="MILLILITER">MILLILITER</option>
                      <option value="UNIT">UNIT</option>
                    </select>
                  </div>

                  {/* Conversion Factor */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-[#5f5e5e] uppercase font-sans">
                      Conversion Factor
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      value={formConversionFactor}
                      onChange={(e) => setFormConversionFactor(Number(e.target.value))}
                      disabled={drawerMode === 'view'}
                      className="bg-white text-[#1d1c17] px-3 py-1.5 border border-[#e8e2d8] rounded text-xs focus:border-[#ae001a] outline-none w-full font-mono disabled:bg-gray-50"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Cost per unit */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                      Initial Purchase Cost ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formCostPerUnit}
                      onChange={(e) => setFormCostPerUnit(e.target.value)}
                      disabled={drawerMode === 'view'}
                      className="bg-white text-[#1d1c17] px-3.5 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] outline-none w-full font-mono disabled:bg-gray-50"
                      placeholder="e.g. 15.50"
                    />
                  </div>

                  {/* Min Stock */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                      Min Stock Threshold
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formMinStock}
                      onChange={(e) => setFormMinStock(e.target.value)}
                      disabled={drawerMode === 'view'}
                      className="bg-white text-[#1d1c17] px-3.5 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] outline-none w-full font-mono disabled:bg-gray-50"
                      placeholder="e.g. 10"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                    Description / Notes
                  </label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    disabled={drawerMode === 'view'}
                    rows={3}
                    className="bg-white text-[#1d1c17] px-3.5 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] outline-none w-full disabled:bg-gray-50"
                    placeholder="e.g. Refrigerated supply item. Keep below 4°C."
                  />
                </div>

                {/* Status Toggle */}
                {drawerMode !== 'add' && (
                  <div className="flex justify-between items-center bg-[#fcfbf9] border border-[#e8e2d8] p-4 rounded-lg">
                    <div>
                      <span className="font-bold text-sm text-[#222222] block">Active Status Pipeline</span>
                      <span className="text-xs text-gray-500">Deactivation prevents selecting in new recipes while preserving WACC logs.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      disabled={drawerMode === 'view'}
                      className="w-5 h-5 accent-[#ae001a] cursor-pointer"
                    />
                  </div>
                )}

                {/* Audit Timestamps */}
                {drawerMode === 'view' && selectedMaterial && (
                  <div className="text-xs text-gray-400 space-y-1 pl-1 pt-2">
                    <div>Created At: {selectedMaterial.createdAt ? new Date(selectedMaterial.createdAt).toLocaleString() : 'N/A'}</div>
                    <div>Updated At: {selectedMaterial.updatedAt ? new Date(selectedMaterial.updatedAt).toLocaleString() : 'N/A'}</div>
                  </div>
                )}
              </div>

              {/* Botones */}
              <div className="p-6 border-t border-[#e8e2d8] flex justify-end gap-3 shrink-0 bg-[#fefbf6]">
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="px-5 py-2 border border-[#222222] text-[#222222] font-bold text-label-caps hover:bg-zinc-100 transition-all rounded"
                >
                  {drawerMode === 'view' ? 'CLOSE' : 'CANCEL'}
                </button>
                {drawerMode !== 'view' && (
                  <button
                    type="submit"
                    className="px-6 py-2 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#d2272f] transition-all rounded shadow-xs"
                  >
                    SAVE SUPPLY
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Advertencia de Impacto de Conversion (Recipes Warning) */}
      {isWarningModalOpen && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 font-sans">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setIsWarningModalOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-zinc-200 animate-scale-in text-left">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-amber-50 border border-amber-100 text-amber-600">
                <span className="material-symbols-outlined text-2xl">warning</span>
              </div>
              <div className="space-y-2">
                <h3 className="text-body-md font-bold text-zinc-900">Conversion Impact Warning</h3>
                <p className="text-body-xs text-zinc-600 leading-relaxed">
                  {warningMessage}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsWarningModalOpen(false)}
                className="px-4 py-2 text-xs font-bold border border-zinc-200 rounded-lg text-zinc-700 hover:bg-zinc-50 transition-all cursor-pointer"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsWarningModalOpen(false);
                  if (pendingSaveHandler) {
                    await pendingSaveHandler();
                  }
                }}
                className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 transition-all cursor-pointer"
              >
                Confirm Modification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Toggle Estatus (Soft Deactivate) */}
      {isToggleModalOpen && toggleTarget && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 font-sans">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setIsToggleModalOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-zinc-200 animate-scale-in text-left">
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                toggleTarget.isActive 
                  ? 'bg-red-50 border border-red-100 text-[#ae001a]'
                  : 'bg-emerald-50 border border-emerald-100 text-emerald-600'
              }`}>
                <span className="material-symbols-outlined text-2xl">
                  {toggleTarget.isActive ? 'power_settings_new' : 'check_circle'}
                </span>
              </div>
              <div className="space-y-2">
                <h3 className="text-body-md font-bold text-zinc-900">
                  {toggleTarget.isActive ? 'Deactivate Raw Material' : 'Activate Raw Material'}
                </h3>
                <p className="text-body-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to {toggleTarget.isActive ? 'deactivate' : 'activate'} this raw material? 
                  {toggleTarget.isActive && ' Deactivating prevents selecting it in new recipes but preserves WACC logs.'}
                </p>
              </div>
            </div>

            {toggleError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-body-xs font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">error</span>
                <span>{toggleError}</span>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsToggleModalOpen(false)}
                className="px-4 py-2 text-xs font-bold border border-zinc-200 rounded-lg text-zinc-700 hover:bg-zinc-50 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeToggleActive}
                disabled={isToggling}
                className={`px-4 py-2 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50 cursor-pointer ${
                  toggleTarget.isActive
                    ? 'bg-red-600 hover:bg-[#ae001a]'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isToggling ? 'Processing...' : toggleTarget.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Support Modal */}
      {isSupportOpen && (
        <EmergencySupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
      )}
    </div>
  );
};
