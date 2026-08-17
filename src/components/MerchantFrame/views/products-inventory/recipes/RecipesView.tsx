import React, { useEffect, useState } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../../lib/auth-storage';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';


interface Supply {
  id: number;
  name: string;
  code: string;
  sku?: string | null;
  unit: string;
  consumption_unit?: string | null;
  cost_per_unit?: number | null;
  isActive: boolean;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  basePrice: number;
  isActive: boolean;
}

interface RecipeLine {
  id?: number;
  rawMaterialId: number;
  rawMaterial?: Supply | null;
  quantity: string;
  unitOfMeasure: string;
}

interface ProductRecipe {
  id: number;
  finishedProductId: number;
  finishedVariantId: number | null;
  lines: RecipeLine[];
  theoreticalCostCached?: string | null;
}

export const RecipesView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  const [recipe, setRecipe] = useState<ProductRecipe | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingRecipe, setIsLoadingRecipe] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Campos de formulario para edición de líneas de receta
  const [formLines, setFormLines] = useState<{ raw_material_id: string; quantity: number }[]>([]);

  // 1. Cargar productos comerciales y materias primas (supplies)
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const productsRes = await fetch(`${API_BASE}/products?limit=100`, { headers });
      let suppliesRes = await fetch(`${API_BASE}/v1/inventory/raw-materials?status=active&limit=100`, { headers });
      if (!suppliesRes.ok) {
        suppliesRes = await fetch(`${API_BASE}/supplies?status=active&limit=100`, { headers });
      }

      if (productsRes.status === 401 || suppliesRes.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!productsRes.ok || !suppliesRes.ok) {
        throw new Error('Failed to load data from backend server.');
      }

      const productsJson = await productsRes.json();
      const suppliesJson = await suppliesRes.json();

      const productsData = productsJson.items || productsJson.data || productsJson || [];
      const suppliesData = suppliesJson.items || suppliesJson.data || suppliesJson || [];

      setProducts(Array.isArray(productsData) ? productsData : []);
      setSupplies(Array.isArray(suppliesData) ? suppliesData.filter((s: any) => s.isActive !== false) : []);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error loading records.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 2. Cargar receta al seleccionar un producto comercial
  const fetchRecipeForProduct = async (productId: number) => {
    setIsLoadingRecipe(true);
    setRecipe(null);
    setIsEditing(false);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const res = await fetch(`${API_BASE}/v1/recipes/product/${productId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        // Tomamos la receta por defecto (sin variante)
        const defaultRecipe = (Array.isArray(data) ? data : []).find(r => r.finishedVariantId === null) || null;
        setRecipe(defaultRecipe);
      }
    } catch (e) {
      console.error('Error fetching recipe', e);
    } finally {
      setIsLoadingRecipe(false);
    }
  };

  const handleSelectProduct = (prod: Product) => {
    setSelectedProduct(prod);
    fetchRecipeForProduct(prod.id);
  };

  // 3. Inicializar edición de la receta
  const handleStartEdit = () => {
    if (recipe) {
      const lines = recipe.lines.map(line => ({
        raw_material_id: String(line.rawMaterialId),
        quantity: Number(line.quantity)
      }));
      setFormLines(lines);
    } else {
      setFormLines([{ raw_material_id: '', quantity: 1 }]);
    }
    setIsEditing(true);
  };

  // Agregar ingrediente
  const handleAddLine = () => {
    setFormLines(prev => [...prev, { raw_material_id: '', quantity: 1 }]);
  };

  // Quitar ingrediente
  const handleRemoveLine = (index: number) => {
    setFormLines(prev => prev.filter((_, i) => i !== index));
  };

  // Cambiar valor en la línea
  const handleLineChange = (index: number, key: 'raw_material_id' | 'quantity', value: any) => {
    setFormLines(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  };

  // 4. Guardar Receta (Upsert)
  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    // Validar líneas
    const validLines = formLines.filter(line => line.raw_material_id && line.quantity > 0);
    if (validLines.length === 0) {
      alert('Please add at least one valid ingredient to the recipe.');
      return;
    }

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const payload = {
        productId: selectedProduct.id,
        lines: validLines.map(line => {
          const supplyObj = supplies.find(s => s.id === Number(line.raw_material_id));
          return {
            raw_material_id: Number(line.raw_material_id),
            quantity: line.quantity,
            unit_of_measure: supplyObj?.consumption_unit || supplyObj?.unit || 'GRAM'
          };
        })
      };

      let res;
      if (recipe) {
        // Actualizar receta existente
        res = await fetch(`${API_BASE}/v1/recipes/${recipe.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload)
        });
      } else {
        // Crear receta nueva
        res = await fetch(`${API_BASE}/v1/recipes`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to save recipe.');
      }

      alert('Recipe saved successfully!');
      setIsEditing(false);
      fetchRecipeForProduct(selectedProduct.id);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error saving recipe.');
    }
  };

  // Filtrado de productos comerciales por buscador
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-sans text-h1 text-[#222222] uppercase tracking-tighter">
            Recipes Workspace <span className="text-[#d51f2c]">/</span> BOM Formula
          </h1>
          <p className="text-body-md text-[#666666] mt-1">
            Asocia materias primas a tus productos de venta y calcula costos teóricos de producción.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-[#ae001a] p-4 rounded text-sm font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Panel izquierdo: Lista de productos comerciales */}
        <div className="lg:col-span-4 bg-white border border-[#e8e2d8] rounded shadow-sm p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-bold text-[#222222] uppercase text-xs tracking-wider">Commercial Products</h3>
            <p className="text-[11px] text-gray-500">Selecciona el producto a configurar su receta.</p>
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#fcfbf9] text-xs px-3.5 py-2 border border-[#e8e2d8] rounded outline-none w-full focus:border-[#ae001a]"
            />
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-xs text-gray-500">Cargando productos...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-500">No se encontraron productos.</div>
          ) : (
            <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[450px] custom-scrollbar">
              {filteredProducts.map((prod) => (
                <button
                  key={prod.id}
                  onClick={() => handleSelectProduct(prod)}
                  className={`w-full text-left p-3.5 rounded border transition-all text-xs flex justify-between items-center ${
                    selectedProduct?.id === prod.id
                      ? 'bg-[#ae001a] text-white border-[#ae001a]'
                      : 'bg-[#fcfbf9] text-[#222222] border-[#e8e2d8] hover:bg-[#f1ece4]'
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold uppercase tracking-tight">{prod.name}</span>
                    <span className={`text-[10px] ${selectedProduct?.id === prod.id ? 'text-white/70' : 'text-gray-400'}`}>
                      SKU: {prod.sku}
                    </span>
                  </div>
                  <span className="font-bold font-mono">${Number(prod.basePrice).toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Panel derecho: Detalles de la Receta (BOM) */}
        <div className="lg:col-span-8 bg-white border border-[#e8e2d8] rounded shadow-sm p-6 flex flex-col gap-6">
          {!selectedProduct ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400">
              <span className="material-symbols-outlined text-5xl mb-3">restaurant_menu</span>
              <p className="text-sm font-bold uppercase tracking-wider text-[#222222]">No Product Selected</p>
              <p className="text-xs max-w-sm mt-1">Selecciona un producto comercial de la lista para gestionar su fórmula de ingredientes y costos.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Encabezado del Producto */}
              <div className="flex justify-between items-start border-b border-[#e8e2d8] pb-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Recipe Configuration</span>
                  <h2 className="font-sans text-xl font-black text-[#222222] uppercase tracking-tight">
                    {selectedProduct.name}
                  </h2>
                  <p className="text-xs text-gray-500">SKU: {selectedProduct.sku} | Precio Base: ${Number(selectedProduct.basePrice).toFixed(2)}</p>
                </div>

                {!isEditing && !isLoadingRecipe && (
                  <button
                    onClick={handleStartEdit}
                    className="px-4 py-2 bg-[#222222] hover:bg-[#ae001a] text-white font-bold text-xs uppercase tracking-wider transition-all rounded shadow-sm flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    {recipe ? 'Edit Recipe' : 'Create Recipe'}
                  </button>
                )}
              </div>

              {isLoadingRecipe ? (
                <div className="text-center py-20 text-xs text-gray-500">Cargando receta...</div>
              ) : isEditing ? (
                /* Formulario de edición */
                <form onSubmit={handleSaveRecipe} className="flex flex-col gap-5">
                  <div className="flex flex-col gap-1">
                    <h3 className="font-bold text-[#222222] uppercase text-xs">Recipe Ingredients</h3>
                    <p className="text-[10px] text-gray-500">Configura la cantidad de materia prima necesaria para preparar una porción comercial de este producto.</p>
                  </div>

                  <div className="flex flex-col gap-3">
                    {formLines.map((line, index) => {
                      const selectedSupply = supplies.find(s => s.id === Number(line.raw_material_id));
                      return (
                        <div key={index} className="grid grid-cols-12 gap-3 items-end bg-[#fcfbf9] border border-[#e8e2d8] p-3.5 rounded">
                          {/* Materia Prima */}
                          <div className="col-span-6 flex flex-col gap-1.5 text-left">
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Ingredient / Raw Material</label>
                            <select
                              value={line.raw_material_id}
                              onChange={(e) => handleLineChange(index, 'raw_material_id', e.target.value)}
                              required
                              className="bg-white text-xs px-3 py-2 border border-[#e8e2d8] rounded outline-none w-full focus:border-[#ae001a]"
                            >
                              <option value="" disabled>Select raw material...</option>
                              {supplies.map(s => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.code}) - Cost: ${Number(s.cost_per_unit || 0).toFixed(4)}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Cantidad */}
                          <div className="col-span-3 flex flex-col gap-1.5 text-left">
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Quantity</label>
                            <input
                              type="number"
                              min="0.0001"
                              step="any"
                              value={line.quantity}
                              onChange={(e) => handleLineChange(index, 'quantity', Number(e.target.value))}
                              required
                              className="bg-white text-xs px-3 py-1.5 border border-[#e8e2d8] rounded outline-none w-full focus:border-[#ae001a]"
                            />
                          </div>

                          {/* Unidad */}
                          <div className="col-span-2 flex flex-col gap-1.5 text-left">
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Unit</label>
                            <div className="px-3 py-2 bg-gray-50 border border-[#e8e2d8] rounded text-xs text-gray-500 font-bold uppercase">
                              {selectedSupply?.consumption_unit || selectedSupply?.unit || 'GRAM'}
                            </div>
                          </div>

                          {/* Botón borrar */}
                          <div className="col-span-1 flex justify-center pb-0.5">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(index)}
                              className="w-8 h-8 rounded-full border border-red-200 text-red-600 flex items-center justify-center hover:bg-red-50"
                              title="Remove item"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-between border-t border-[#e8e2d8] pt-4 mt-2">
                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="px-4 py-2 border border-[#222222] hover:bg-gray-50 text-[#222222] font-bold text-xs uppercase tracking-wider transition-all rounded shadow-sm flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      Add Ingredient
                    </button>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="px-4 py-2 border border-[#e8e2d8] hover:bg-gray-50 text-[#5f5e5e] font-bold text-xs uppercase tracking-wider transition-all rounded shadow-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 bg-[#ae001a] hover:bg-[#900014] text-white font-bold text-xs uppercase tracking-wider transition-all rounded shadow-sm"
                      >
                        Save Recipe
                      </button>
                    </div>
                  </div>
                </form>
              ) : !recipe ? (
                /* No tiene receta */
                <div className="flex flex-col items-center justify-center py-16 text-center bg-[#fcfbf9] border border-dashed border-[#e8e2d8] rounded">
                  <span className="material-symbols-outlined text-4xl text-gray-400 mb-2">recipe</span>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#222222]">No Recipe Found</p>
                  <p className="text-[11px] text-gray-500 max-w-xs mt-1">Este producto comercial no tiene una receta o BOM configurada. Las ventas no descontarán ingredientes.</p>
                  <button
                    onClick={handleStartEdit}
                    className="mt-4 px-4 py-2 bg-[#222222] hover:bg-[#ae001a] text-white font-bold text-[10px] uppercase tracking-wider transition-all rounded"
                  >
                    Configure Recipe Now
                  </button>
                </div>
              ) : (
                /* Detalle de la receta activa */
                <div className="flex flex-col gap-5">
                  <div className="grid grid-cols-2 gap-4 bg-[#fcfbf9] border border-[#e8e2d8] p-4 rounded">
                    <div className="flex flex-col gap-0.5 text-left">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">Recipe Status</span>
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-bold uppercase">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                        Active / BOM formula linked
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5 text-left border-l border-[#e8e2d8] pl-4">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">Theoretical Cost (BOM)</span>
                      <span className="text-base font-bold font-mono text-[#ae001a]">
                        ${Number(recipe.theoreticalCostCached || 0).toFixed(4)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <h3 className="font-bold text-[#222222] uppercase text-xs">Recipe Formula Ingredients</h3>
                    
                    <div className="border border-[#e8e2d8] rounded overflow-hidden">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-[#fcfbf9] border-b border-[#e8e2d8] text-[10px] font-bold text-gray-400 uppercase">
                            <th className="p-3">Ingredient</th>
                            <th className="p-3">Code / SKU</th>
                            <th className="p-3 text-right">Quantity Required</th>
                            <th className="p-3 text-right">Raw Cost per Unit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recipe.lines.map((line, idx) => (
                            <tr key={idx} className="border-b border-[#e8e2d8] hover:bg-gray-50">
                              <td className="p-3 font-bold text-[#222222] uppercase">{line.rawMaterial?.name || 'Unknown'}</td>
                              <td className="p-3 text-gray-500 font-mono">{line.rawMaterial?.code || 'N/A'}</td>
                              <td className="p-3 text-right font-bold font-mono">
                                {Number(line.quantity).toFixed(2)} {line.unitOfMeasure || 'GRAM'}
                              </td>
                              <td className="p-3 text-right font-mono text-gray-600">
                                ${Number(line.rawMaterial?.cost_per_unit || 0).toFixed(4)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecipesView;
