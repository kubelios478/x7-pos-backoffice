import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../../lib/auth-storage';
import { StockQuickLinks } from '../stocks/StockQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

interface Supply {
  id: number;
  name: string;
  code: string;
  sku?: string | null;
  unit: string;
  purchase_unit?: string | null;
  consumption_unit?: string | null;
  cost_per_unit?: number | null;
  average_cost?: number | null;
  conversion_factor?: number | null;
  isActive: boolean;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  basePrice: number;
  isActive: boolean;
  variants?: Variant[];
}

interface Variant {
  id: number;
  name: string;
  sku?: string;
  price?: number;
}

interface RecipeLine {
  id?: number;
  rawMaterialId?: number | null;
  rawMaterial?: Supply | null;
  supplyProductId?: number | null;
  supplyProduct?: Product | null;
  quantity?: string | number | null;
  quantityPerSoldUnit?: string | number | null;
  unitOfMeasure?: string | null;
  costContribution?: number | null;
}

interface ProductRecipe {
  id: number;
  name?: string;
  finishedProductId: number;
  finishedProduct?: Product | null;
  finishedVariantId?: number | null;
  finishedVariant?: Variant | null;
  yieldQuantity?: number;
  isActive?: boolean;
  lines: RecipeLine[];
  theoreticalCostCached?: string | null;
}

interface RecipesViewProps {
  onNavigate?: (view: string) => void;
}

export const RecipesView: React.FC<RecipesViewProps> = ({ onNavigate }) => {
  const topRef = useRef<HTMLDivElement | null>(null);

  const [recipes, setRecipes] = useState<ProductRecipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros de búsqueda y estado
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [productFilter, setProductFilter] = useState<string>('ALL');

  // Drawer / Modal Interactivo para Crear / Editar Receta
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit' | 'view'>('add');
  const [selectedRecipe, setSelectedRecipe] = useState<ProductRecipe | null>(null);

  // Form State
  const [formName, setFormName] = useState<string>('');
  const [formProductId, setFormProductId] = useState<string>('');
  const [formVariantId, setFormVariantId] = useState<string>('');
  const [formYieldQty, setFormYieldQty] = useState<number>(1);
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formLines, setFormLines] = useState<{ raw_material_id: string; quantity: number }[]>([]);
  const [formDuplicateWarning, setFormDuplicateWarning] = useState<string | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);


  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'instant' });
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    fetchData();
  }, []);


  // 1. Cargar Recetas, Productos Comerciales y Materias Primas desde el backend
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // Cargar recetas v1
      let recipesRes = await fetch(`${API_BASE}/v1/recipes`, { headers });
      if (!recipesRes.ok) {
        recipesRes = await fetch(`${API_BASE}/v1/inventory/recipes`, { headers });
      }

      // Cargar productos
      const productsRes = await fetch(`${API_BASE}/products?limit=100`, { headers });

      // Cargar materias primas
      let suppliesRes = await fetch(`${API_BASE}/v1/inventory/raw-materials?status=active&limit=200`, { headers });
      if (!suppliesRes.ok) {
        suppliesRes = await fetch(`${API_BASE}/supplies?status=active&limit=200`, { headers });
      }

      if (recipesRes.status === 401 || productsRes.status === 401 || suppliesRes.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const productsJson = await productsRes.json().catch(() => ({}));
      const suppliesJson = await suppliesRes.json().catch(() => ({}));
      const recipesJson = recipesRes.ok ? await recipesRes.json().catch(() => []) : [];

      const productsList = productsJson.items || productsJson.data || productsJson || [];
      const suppliesList = suppliesJson.items || suppliesJson.data || suppliesJson || [];
      const recipesList = Array.isArray(recipesJson) ? recipesJson : (recipesJson.items || []);

      setProducts(Array.isArray(productsList) ? productsList : []);
      setSupplies(Array.isArray(suppliesList) ? suppliesList : []);
      setRecipes(Array.isArray(recipesList) ? recipesList : []);

    } catch (err: any) {
      console.error('Error fetching recipes workspace data:', err);
      setError(err.message || 'Failed to load recipes data from server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Abrir Drawer para Crear Nueva Receta
  const handleOpenAdd = () => {
    setSelectedRecipe(null);
    setDrawerMode('add');
    setFormName('');
    setFormProductId('');
    setFormVariantId('');
    setFormYieldQty(1);
    setFormIsActive(true);
    setFormLines([{ raw_material_id: '', quantity: 1 }]);
    setFormDuplicateWarning(null);
    setDrawerError(null);
    setIsDrawerOpen(true);
  };


  // Abrir Drawer para Editar Receta Existente
  const handleOpenEdit = (rec: ProductRecipe) => {
    setSelectedRecipe(rec);
    setDrawerMode('edit');
    const prod = rec.finishedProduct || products.find((p) => p.id === rec.finishedProductId);
    setFormName(rec.name || (prod ? `${prod.name} Formula` : `Recipe #${rec.id}`));
    setFormProductId(String(rec.finishedProductId || ''));
    setFormVariantId(rec.finishedVariantId ? String(rec.finishedVariantId) : '');
    setFormYieldQty(rec.yieldQuantity ?? 1);
    setFormIsActive(rec.isActive !== false);
    const mappedLines = (rec.lines || []).map((l) => ({
      raw_material_id: String(l.rawMaterialId || l.rawMaterial?.id || l.supplyProductId || ''),
      quantity: Number(l.quantityPerSoldUnit || l.quantity || 1),
    }));
    setFormLines(mappedLines.length > 0 ? mappedLines : [{ raw_material_id: '', quantity: 1 }]);
    setFormDuplicateWarning(null);
    setDrawerError(null);
    setIsDrawerOpen(true);
  };

  // Abrir Drawer de Solo Lectura
  const handleOpenView = (rec: ProductRecipe) => {
    setSelectedRecipe(rec);
    setDrawerMode('view');
    setDrawerError(null);
    setIsDrawerOpen(true);
  };

  // Agregar Línea de Ingrediente en el Formulario
  const handleAddFormLine = () => {
    setFormDuplicateWarning(null);
    setFormLines((prev) => [...prev, { raw_material_id: '', quantity: 1 }]);
  };

  // Remover Línea de Ingrediente
  const handleRemoveFormLine = (index: number) => {
    setFormDuplicateWarning(null);
    setFormLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Cálculo dinámico de contribución de costo en tiempo real por línea
  const calculateLineCostContribution = (rawMaterialId: string, quantity: number): number => {
    if (!rawMaterialId || quantity <= 0) return 0;
    const mat = supplies.find((s) => String(s.id) === String(rawMaterialId));
    if (!mat) return 0;
    const avgCost = Number(mat.average_cost ?? mat.cost_per_unit ?? 0);
    const convFactor = Number(mat.conversion_factor ?? 1) || 1;
    return quantity * (avgCost / convFactor);
  };

  // Cálculo dinámico del costo teórico total de la receta
  const totalTheoreticalCost = formLines.reduce((sum, line) => {
    return sum + calculateLineCostContribution(line.raw_material_id, line.quantity);
  }, 0);

  // Cambiar Valor en Línea de Ingrediente con Guardia de Duplicados
  const handleFormLineChange = (index: number, key: 'raw_material_id' | 'quantity', val: any) => {
    setFormDuplicateWarning(null);
    if (key === 'raw_material_id' && val) {
      const isAlreadyAdded = formLines.some(
        (l, i) => i !== index && String(l.raw_material_id) === String(val)
      );
      if (isAlreadyAdded) {
        const duplicateItem = supplies.find((s) => String(s.id) === String(val));
        const msg = `"${duplicateItem?.name || 'Raw Material'}" is already added to this recipe formula. Please adjust the existing line quantity instead.`;
        setFormDuplicateWarning(msg);
        return;
      }
    }

    setFormLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: val };
      return next;
    });
  };

  // Eliminar Receta
  const handleDeleteRecipe = async (recipeId: number) => {
    if (!window.confirm('Are you sure you want to delete or archive this production recipe formula?')) return;
    try {
      setIsLoading(true);
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE}/v1/recipes/${recipeId}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        throw new Error('Failed to delete recipe.');
      }

      fetchData();
    } catch (err: any) {
      alert(err.message || 'Error deleting recipe.');
      setIsLoading(false);
    }
  };

  // Guardar Receta (Submit)
  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDrawerError(null);

    if (!formProductId || Number(formProductId) <= 0) {
      setDrawerError('Debes seleccionar un Producto Final (Item del Menú) para vincular esta receta de producción.');
      return;
    }

    if (!formName.trim()) {
      setDrawerError('Por favor ingresa un nombre válido para la fórmula de la receta.');
      return;
    }

    const validLines = formLines
      .filter((l) => l.raw_material_id && Number(l.raw_material_id) > 0 && Number(l.quantity) >= 0.0001)
      .map((l) => {
        const supplyObj = supplies.find((s) => String(s.id) === String(l.raw_material_id));
        const rawUnit = (supplyObj?.consumption_unit || supplyObj?.unit || 'GRAM').trim() || 'GRAM';
        return {
          raw_material_id: Number(l.raw_material_id),
          quantity: Number(l.quantity),
          unit_of_measure: rawUnit,
        };
      });

    if (validLines.length === 0) {
      setDrawerError('Por favor agrega al menos una materia prima válida con una cantidad mayor a 0.0001.');
      return;
    }

    // Verificar duplicados antes de enviar
    const selectedIds = validLines.map((l) => String(l.raw_material_id));
    const hasDuplicates = new Set(selectedIds).size !== selectedIds.length;
    if (hasDuplicates) {
      setDrawerError('Se detectaron materias primas duplicadas en la receta. Cada ingrediente debe ser único.');
      return;
    }

    try {
      setIsLoading(true);

      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const payload: Record<string, any> = {
        productId: Number(formProductId),
        lines: validLines,
      };

      if (formName.trim()) {
        payload.name = formName.trim();
      }

      if (formYieldQty && Number(formYieldQty) > 0) {
        payload.yieldQuantity = Number(formYieldQty);
      }

      if (formVariantId && Number(formVariantId) > 0) {
        payload.variantId = Number(formVariantId);
      }

      let res;
      if (drawerMode === 'edit' && selectedRecipe) {
        res = await fetch(`${API_BASE}/v1/recipes/${selectedRecipe.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE}/v1/recipes`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        let errMsg = 'No se pudo guardar la receta.';
        if (Array.isArray(errJson.message)) {
          errMsg = errJson.message.join('\n');
        } else if (typeof errJson.message === 'string') {
          if (errJson.message.includes('already exists')) {
            errMsg = 'Ya existe una receta registrada para este producto o variante.';
          } else if (errJson.message.includes('Validation failed')) {
            errMsg = 'Error de validación en los datos ingresados. Verifica el producto e ingredientes.';
          } else {
            errMsg = errJson.message;
          }
        } else if (typeof errJson.error === 'string') {
          errMsg = errJson.error;
        }
        setDrawerError(errMsg);
        return;
      }

      setIsDrawerOpen(false);
      fetchData();
    } catch (err: any) {
      setDrawerError(err.message || 'Error al guardar la receta.');
    } finally {
      setIsLoading(false);
    }
  };




  // Filtrado Dinámico Multicriterio de Recetas
  const filteredRecipes = recipes.filter((rec) => {
    const prod = rec.finishedProduct || products.find((p) => p.id === rec.finishedProductId);
    const variant = rec.finishedVariant;

    // Nombre de receta o nombre de producto vinculado
    const recipeName = rec.name || prod?.name || `Recipe #${rec.id}`;
    const prodSku = prod?.sku || '';
    const variantName = variant?.name || '';

    // Búsqueda por Ingredientes contenidos
    const matchesIngredient = (rec.lines || []).some((l) => {
      const mat = l.rawMaterial || supplies.find((s) => s.id === l.rawMaterialId || s.id === l.supplyProductId);
      return mat?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mat?.code.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const matchesSearch =
      recipeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prodSku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      variantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      matchesIngredient;

    // Filtro por Producto Específico
    const matchesProduct =
      productFilter === 'ALL' || String(rec.finishedProductId) === productFilter;

    // Filtro por Estado (Activo / Inactivo)
    const recIsActive = rec.isActive !== false;
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && recIsActive) ||
      (statusFilter === 'INACTIVE' && !recIsActive);

    return matchesSearch && matchesProduct && matchesStatus;
  });

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      <div ref={topRef} />
      {/* Header Card */}

      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <div>
          <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
            Recipes Workspace
          </h2>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Review production formulas, link ingredients to finished products or variants, monitor yield quantities and audit theoretical costs.
          </p>
        </div>
      </div>

      {/* Banner de Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-[#ae001a] p-4 rounded-lg text-sm font-semibold flex justify-between items-center">
          <span>{error}</span>
          <button
            onClick={fetchData}
            className="px-3 py-1 bg-[#ae001a] text-white text-xs font-bold rounded hover:bg-[#930015] cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Toolbar Panel (Estructura idéntica a Purchase Orders) */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
        {/* Fila 1: Búsqueda al 100% de ancho */}
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-sans">
            search
          </span>
          <input
            type="text"
            placeholder="Search by recipe name, product SKU, or contained ingredient..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md transition-all font-sans"
          />
        </div>

        {/* Fila 2: Filtros a la izquierda, Botones a la derecha */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[150px] font-sans text-secondary cursor-pointer"
            >
              <option value="ALL">All Products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[130px] font-sans text-secondary cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors flex items-center gap-2 font-sans cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              ADD RECIPE
            </button>

            <button
              type="button"
              onClick={fetchData}
              className="p-2.5 bg-white border border-[#e8e2d8] rounded hover:bg-[#fef9f1] text-secondary hover:text-[#ae001a] transition-all flex items-center justify-center cursor-pointer"
              title="Reload recipes data"
              aria-label="Reload table data"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>
          </div>
        </div>
      </div>



      {/* Grid de Datos Principal */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 text-center text-secondary text-sm font-semibold flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-3xl animate-spin text-[#ae001a]">
              sync
            </span>
            Loading recipes dataset...
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="py-20 text-center px-4 flex flex-col items-center justify-center">
            <span className="material-symbols-outlined text-5xl text-zinc-300 mb-3">
              menu_book
            </span>
            <p className="text-base font-bold text-[#1d1c17]">No recipes found.</p>
            <p className="text-body-sm text-secondary max-w-md mt-1">
              Click 'Add Recipe' to define ingredients and cost formulas for menu items.
            </p>
            <button
              onClick={handleOpenAdd}
              className="mt-4 px-4 py-2 bg-[#ae001a] text-white text-xs font-bold uppercase rounded hover:bg-[#930015] cursor-pointer"
            >
              + Add Recipe
            </button>
          </div>
        ) : (
          <>
            <div className="p-4 bg-[#222222] flex justify-between items-center">
              <span className="text-label-caps font-bold text-white uppercase tracking-wider">
                RECIPES & BOM FORMULAS
              </span>
              <span className="material-symbols-outlined text-white text-sm cursor-pointer select-none">
                more_vert
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                  <tr>
                    <th className="px-6 py-3.5 text-label-caps font-bold text-[#5f5e5e]">Recipe Name & ID</th>
                    <th className="px-6 py-3.5 text-label-caps font-bold text-[#5f5e5e]">Linked Product / Variant</th>
                    <th className="px-6 py-3.5 text-center text-label-caps font-bold text-[#5f5e5e]">Batch Yield</th>
                    <th className="px-6 py-3.5 text-center text-label-caps font-bold text-[#5f5e5e]">Ingredients</th>
                    <th className="px-6 py-3.5 text-right text-label-caps font-bold text-[#5f5e5e]">Theoretical Cost / Portion</th>
                    <th className="px-6 py-3.5 text-center text-label-caps font-bold text-[#5f5e5e]">Status</th>
                    <th className="px-6 py-3.5 text-center text-label-caps font-bold text-[#5f5e5e]">Actions</th>
                  </tr>
                </thead>

              <tbody className="divide-y divide-[#e8e2d8] text-sm">
                {filteredRecipes.map((rec) => {
                  const prod = rec.finishedProduct || products.find((p) => p.id === rec.finishedProductId);
                  const variant = rec.finishedVariant;

                  const recipeName = rec.name || prod?.name || `Recipe Formula #${rec.id}`;
                  const yieldQty = rec.yieldQuantity ?? 1;
                  const totalCost = Number(rec.theoreticalCostCached || 0);
                  const portionCost = yieldQty > 0 ? totalCost / yieldQty : totalCost;
                  const ingredientCount = (rec.lines || []).length;
                  const recIsActive = rec.isActive !== false;

                  return (
                    <tr key={rec.id} className="hover:bg-[#f8f3eb] transition-colors">
                      {/* Recipe Name & ID */}
                      <td className="px-6 py-4">
                        <p className="font-bold text-[#1d1c17]">{recipeName}</p>
                        <span className="font-mono text-[11px] text-[#5f5e5e] bg-[#f2ede5] px-1.5 py-0.5 rounded">
                          RCP-#{rec.id}
                        </span>
                      </td>

                      {/* Linked Product / Variant */}
                      <td className="px-6 py-4">
                        {prod ? (
                          <div className="flex flex-col gap-1 items-start">
                            <span className="px-2.5 py-1 rounded-full bg-[#f2ede5] text-[#1d1c17] font-semibold text-xs border border-[#e8e2d8] inline-flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[14px] text-[#ae001a]">
                                restaurant
                              </span>
                              {prod.name}
                            </span>
                            {variant && (
                              <span className="text-[11px] text-[#5f5e5e] italic font-mono pl-1">
                                Variant: {variant.name}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500 font-semibold text-xs italic">
                            General Formula
                          </span>
                        )}
                      </td>

                      {/* Batch Yield */}
                      <td className="px-6 py-4 text-center">
                        <span className="font-bold text-[#1d1c17] font-mono">
                          {yieldQty} {yieldQty === 1 ? 'Portion' : 'Portions'}
                        </span>
                      </td>

                      {/* Ingredient Count */}
                      <td className="px-6 py-4 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-[#ece8e0] text-[#5f5e5e] font-semibold text-xs">
                          {ingredientCount} {ingredientCount === 1 ? 'Ingredient' : 'Ingredients'}
                        </span>
                      </td>

                      {/* Theoretical Cost & Portion Cost */}
                      <td className="px-6 py-4 text-right">
                        <p className="font-bold font-mono text-[#ae001a] text-sm">
                          ${portionCost.toFixed(4)} <span className="text-[10px] font-normal text-secondary">/ portion</span>
                        </p>
                        <span className="text-[10px] font-mono text-secondary">
                          Total: ${totalCost.toFixed(4)}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`text-[10px] px-2.5 py-0.5 font-bold rounded uppercase ${
                            recIsActive
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-zinc-100 text-zinc-600'
                          }`}
                        >
                          {recIsActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>


                      {/* Actions */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenView(rec)}
                            className="p-1.5 text-[#5f5e5e] hover:text-[#ae001a] rounded hover:bg-[#f2ede5] transition-colors cursor-pointer"
                            title="View Formula Lines"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              visibility
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(rec)}
                            className="p-1.5 text-[#5f5e5e] hover:text-[#ae001a] rounded hover:bg-[#f2ede5] transition-colors cursor-pointer"
                            title="Edit Recipe"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRecipe(rec.id)}
                            className="p-1.5 text-[#5f5e5e] hover:text-[#ba1a1a] rounded hover:bg-red-50 transition-colors cursor-pointer"
                            title="Delete Recipe"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              delete
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



      {/* Hub Navegacional de Accesos Rápidos (Sprint 25 Story 4114) */}
      <StockQuickLinks current="recipes" onNavigate={onNavigate} />

      {/* Drawer Interactivo para Crear / Editar Recetas */}
      {isDrawerOpen &&
        createPortal(
          <div className="fixed inset-0 z-[99999] flex justify-end overflow-hidden">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 z-[99999]"
              onClick={() => setIsDrawerOpen(false)}
            />

            <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-[#e8e2d8] animate-slide-in font-sans z-[100000]">

              {/* Header Drawer */}
              <div className="bg-[#222222] p-6 text-white flex justify-between items-center shrink-0">
                <div>
                  <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest block mb-0.5">
                    Recipe & BOM Formula Specification
                  </span>
                  <h3 className="font-black text-lg uppercase tracking-tight">
                    {drawerMode === 'add'
                      ? 'Add Recipe Formula'
                      : drawerMode === 'edit'
                      ? 'Edit Recipe Formula'
                      : 'Recipe Details'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="text-white/70 hover:text-white p-1 rounded cursor-pointer"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>

              {/* Body Drawer */}
              <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                {drawerMode === 'view' && selectedRecipe ? (
                  <div className="flex flex-col gap-5 text-left">
                    <div className="bg-[#fcfbf9] border border-[#e8e2d8] p-4 rounded-lg flex flex-col gap-2">
                      <span className="text-xs font-bold text-gray-500 uppercase">
                        Finished Menu Item
                      </span>
                      <p className="font-black text-base text-[#1d1c17]">
                        {selectedRecipe.finishedProduct?.name || `Product #${selectedRecipe.finishedProductId}`}
                      </p>
                      <p className="text-xs text-[#5f5e5e] font-mono">
                        SKU: {selectedRecipe.finishedProduct?.sku || 'N/A'}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <h4 className="font-bold text-xs uppercase text-[#1d1c17]">
                        Bill of Materials (BOM) Lines
                      </h4>
                      <div className="border border-[#e8e2d8] rounded-lg overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-[#ece8e0] text-[#5f5e5e] font-bold uppercase">
                            <tr>
                              <th className="p-3">Ingredient</th>
                              <th className="p-3 text-right">Required Quantity</th>
                              <th className="p-3 text-right">Unit Cost</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#e8e2d8]">
                            {(selectedRecipe.lines || []).map((l, i) => {
                              const mat =
                                l.rawMaterial ||
                                supplies.find(
                                  (s) => s.id === l.rawMaterialId || s.id === l.supplyProductId
                                );
                              const qty = Number(l.quantityPerSoldUnit || l.quantity || 0);
                              const cost = Number(mat?.cost_per_unit || 0);
                              return (
                                <tr key={i}>
                                  <td className="p-3 font-bold text-[#1d1c17]">
                                    {mat?.name || 'Unknown Supply'}
                                  </td>
                                  <td className="p-3 text-right font-mono font-bold">
                                    {qty} {l.unitOfMeasure || mat?.unit || 'GRAM'}
                                  </td>
                                  <td className="p-3 text-right font-mono text-[#ae001a]">
                                    ${cost.toFixed(4)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form id="recipe-form" onSubmit={handleSaveSubmit} className="flex flex-col gap-5 text-left">
                    {/* Alerta de Error en Drawer */}
                    {drawerError && (
                      <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg flex items-center gap-2 font-semibold">
                        <span className="material-symbols-outlined text-red-600 text-base">error</span>
                        <div className="flex-1">
                          <p className="font-bold text-red-900">No se pudo guardar la receta</p>
                          <p className="mt-0.5 text-[#ae001a]">{drawerError}</p>
                        </div>
                      </div>
                    )}

                    {/* Alerta de Duplicados */}
                    {formDuplicateWarning && (
                      <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg flex items-center gap-2 font-semibold">
                        <span className="material-symbols-outlined text-amber-600 text-base">warning</span>
                        <span>{formDuplicateWarning}</span>
                      </div>
                    )}

                    {/* Header Fields: Name (required, max 150 chars) */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-[#1d1c17] uppercase">
                        Recipe Formula Name *
                      </label>
                      <input
                        type="text"
                        maxLength={150}
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        required
                        placeholder="e.g. Classic Beef Burger Production Formula"
                        className="bg-[#fcfbf9] text-xs font-bold px-3 py-2.5 border border-[#e8e2d8] rounded-lg outline-none focus:border-[#ae001a]"
                      />
                    </div>

                    {/* Finished Product & Variant Dropdowns */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#1d1c17] uppercase">
                          Finished Product *
                        </label>
                        <select
                          value={formProductId}
                          onChange={(e) => {
                            const newProdId = e.target.value;
                            setFormProductId(newProdId);
                            setFormVariantId('');
                            if (newProdId && !formName) {
                              const foundProd = products.find((p) => String(p.id) === String(newProdId));
                              if (foundProd) {
                                setFormName(`${foundProd.name} Formula`);
                              }
                            }
                          }}
                          disabled={drawerMode === 'edit'}
                          required
                          className="bg-[#fcfbf9] text-xs font-semibold px-3 py-2.5 border border-[#e8e2d8] rounded-lg outline-none focus:border-[#ae001a]"
                        >
                          <option value="">(Select Finished Menu Item / Product *)</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku}) - Price: ${Number(p.basePrice).toFixed(2)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#1d1c17] uppercase">
                          Finished Variant
                        </label>
                        <select
                          value={formVariantId}
                          onChange={(e) => setFormVariantId(e.target.value)}
                          disabled={!formProductId || drawerMode === 'edit'}
                          className="bg-[#fcfbf9] text-xs font-semibold px-3 py-2.5 border border-[#e8e2d8] rounded-lg outline-none focus:border-[#ae001a]"
                        >
                          <option value="">(Optional - Standard Base Variant)</option>
                          {(() => {
                            const selectedProd = products.find((p) => String(p.id) === formProductId);
                            return (selectedProd?.variants || []).map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name} ({v.sku || 'N/A'}) - Price: ${Number(v.price || 0).toFixed(2)}
                              </option>
                            ));
                          })()}
                        </select>
                      </div>
                    </div>

                    {/* Batch Yield & Status */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#1d1c17] uppercase">
                          Batch Yield (Portions / Units) *
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={formYieldQty}
                          onChange={(e) => setFormYieldQty(Math.max(1, Number(e.target.value)))}
                          required
                          className="bg-[#fcfbf9] text-xs font-bold px-3 py-2 border border-[#e8e2d8] rounded-lg outline-none focus:border-[#ae001a]"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#1d1c17] uppercase">
                          Status
                        </label>
                        <label className="flex items-center gap-2 mt-2 cursor-pointer text-xs font-semibold text-[#1d1c17]">
                          <input
                            type="checkbox"
                            checked={formIsActive}
                            onChange={(e) => setFormIsActive(e.target.checked)}
                            className="accent-[#ae001a] w-4 h-4"
                          />
                          Active Recipe Formula
                        </label>
                      </div>
                    </div>

                    {/* Panel de Resumen de Costo Teórico en Tiempo Real */}
                    <div className="bg-[#222222] text-white p-4 rounded-lg flex flex-wrap justify-between items-center gap-4">
                      <div>
                        <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider block">
                          Real-Time Theoretical Recipe Cost
                        </span>
                        <p className="text-xl font-black text-white font-mono mt-0.5">
                          ${totalTheoreticalCost.toFixed(4)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider block">
                          Cost per Portion / Yield
                        </span>
                        <p className="text-sm font-bold text-amber-400 font-mono mt-0.5">
                          ${(totalTheoreticalCost / (formYieldQty || 1)).toFixed(4)}
                        </p>
                      </div>
                    </div>

                    {/* Ingredientes / BOM Lines Matrix */}
                    <div className="flex flex-col gap-3 pt-2">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-xs uppercase text-[#1d1c17]">
                          Recipe Ingredients Matrix (BOM) *
                        </h4>
                        <button
                          type="button"
                          onClick={handleAddFormLine}
                          className="px-3 py-1 bg-[#ece8e0] hover:bg-[#e8e2d8] text-[#1d1c17] text-xs font-bold rounded flex items-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">add</span>
                          Add Ingredient Line
                        </button>
                      </div>

                      <div className="flex flex-col gap-3">
                        {formLines.map((line, idx) => {
                          const mat = supplies.find((s) => String(s.id) === String(line.raw_material_id));
                          const lineCost = calculateLineCostContribution(line.raw_material_id, line.quantity);

                          return (

                            <div
                              key={idx}
                              className="grid grid-cols-12 gap-3 items-center bg-[#fcfbf9] border border-[#e8e2d8] p-3 rounded-lg hover:border-[#ae001a]/40 transition-colors"
                            >
                              <div className="col-span-5 flex flex-col gap-1 text-left">
                                <label className="text-[10px] font-bold text-[#5f5e5e] uppercase">
                                  Raw Material
                                </label>
                                <select
                                  value={line.raw_material_id}
                                  onChange={(e) =>
                                    handleFormLineChange(idx, 'raw_material_id', e.target.value)
                                  }
                                  required
                                  className="bg-white text-xs px-2.5 py-1.5 border border-[#e8e2d8] rounded outline-none focus:border-[#ae001a]"
                                >
                                  <option value="" disabled>
                                    Select raw material...
                                  </option>
                                  {supplies.map((s) => {
                                    const isSelectedInOtherRow = formLines.some(
                                      (other, oIdx) => oIdx !== idx && String(other.raw_material_id) === String(s.id)
                                    );
                                    const sCost = Number(s.average_cost ?? s.cost_per_unit ?? 0);
                                    return (
                                      <option
                                        key={s.id}
                                        value={s.id}
                                        disabled={isSelectedInOtherRow}
                                      >
                                        {s.name} ({s.code}) - Avg Cost: ${sCost.toFixed(4)} / {s.consumption_unit || s.unit} {isSelectedInOtherRow ? '(Added)' : ''}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>

                              <div className="col-span-3 flex flex-col gap-1 text-left">
                                <label className="text-[10px] font-bold text-[#5f5e5e] uppercase">
                                  Qty ({mat?.consumption_unit || mat?.unit || 'Units'})
                                </label>
                                <input
                                  type="number"
                                  min="0.0001"
                                  step="any"
                                  value={line.quantity}
                                  onChange={(e) =>
                                    handleFormLineChange(idx, 'quantity', Math.max(0.0001, Number(e.target.value)))
                                  }
                                  required
                                  className="bg-white text-xs px-2.5 py-1.5 border border-[#e8e2d8] rounded outline-none focus:border-[#ae001a] font-mono font-bold"
                                />
                              </div>

                              <div className="col-span-3 flex flex-col gap-1 text-right">
                                <label className="text-[10px] font-bold text-[#5f5e5e] uppercase">
                                  Live Contribution
                                </label>
                                <div className="px-2 py-1.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 font-mono font-bold truncate text-right">
                                  ${lineCost.toFixed(4)}
                                </div>
                              </div>

                              <div className="col-span-1 flex justify-center pt-3">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFormLine(idx)}
                                  className="w-7 h-7 rounded-full border border-red-200 text-red-600 flex items-center justify-center hover:bg-red-50 cursor-pointer"
                                  title="Remove line"
                                >
                                  <span className="material-symbols-outlined text-sm">delete_outline</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </form>

                )}
              </div>

              {/* Footer Drawer */}
              {drawerMode !== 'view' && (
                <div className="bg-[#fcfbf9] p-4 border-t border-[#e8e2d8] flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(false)}
                    className="px-4 py-2 border border-[#e8e2d8] hover:bg-gray-100 text-[#5f5e5e] font-bold text-xs uppercase rounded cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="recipe-form"
                    className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] text-white font-bold text-xs uppercase rounded shadow-sm cursor-pointer"
                  >
                    Save Recipe Formula
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default RecipesView;
