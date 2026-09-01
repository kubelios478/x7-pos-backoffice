import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../../lib/auth-storage';
import { QuickLaunchPanel } from '../../../shared/QuickLaunchPanel';
import { CatalogQuickLinks } from '../CatalogQuickLinks';
import { EmergencySupportModal } from '../../../modals/QuickActionModals';

interface Product {
  id: number;
  name: string;
}

interface Variant {
  id: number;
  name: string;
  sku: string;
  price: number | string;
  isActive: boolean;
  product: Product | null;
}

interface VariantsViewProps {
  onNavigate?: (view: string) => void;
}

export const VariantsView: React.FC<VariantsViewProps> = ({ onNavigate }) => {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros locales
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All Status');

  // Estados del Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingVariantId, setEditingVariantId] = useState<number | null>(null);

  // Campos del Formulario del Modal
  const [formName, setFormName] = useState<string>('');
  const [formSku, setFormSku] = useState<string>('');
  const [formPrice, setFormPrice] = useState<string>('');
  const [formProduct, setFormProduct] = useState<string>('NULL');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);

  // Estados para modal de confirmación de activación/desactivación
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [confirmTargetVariant, setConfirmTargetVariant] = useState<Variant | null>(null);
  const [isToggling, setIsToggling] = useState<boolean>(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll al inicio al montar la vista
  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, []);

  const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

  const fetchAllData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const [variantsRes, productsRes] = await Promise.all([
        fetch(`${API_BASE}/variants?limit=100`, { headers }),
        fetch(`${API_BASE}/products?limit=100`, { headers })
      ]);

      if (variantsRes.status === 401 || productsRes.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!variantsRes.ok || !productsRes.ok) {
        throw new Error('Error al cargar datos del servidor');
      }

      const variantsJson = await variantsRes.json();
      const productsJson = await productsRes.json();

      const variantsData = variantsJson.data || [];
      const productsData = productsJson.data || [];

      // Mapear variantes
      const mappedVariants = variantsData.map((v: any) => ({
        id: v.id,
        name: v.name,
        sku: v.sku || 'N/A',
        price: v.price,
        isActive: v.isActive !== undefined ? v.isActive : true,
        product: v.product ? { id: v.product.id, name: v.product.name } : null
      }));

      // Mapear productos
      const mappedProducts = productsData.map((p: any) => ({
        id: p.id,
        name: p.name
      }));

      setVariants(mappedVariants);
      setProducts(mappedProducts);
    } catch (err: any) {
      console.error('Error fetching variants data:', err);
      setError('Failed to load variants. Please check if the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const filteredVariants = variants.filter((v) => {
    const matchesSearch =
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.product?.name || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'All Status' ||
      (statusFilter === 'Active' && v.isActive) ||
      (statusFilter === 'Inactive' && !v.isActive);

    return matchesSearch && matchesStatus;
  });

  const formatPrice = (price: number | string) => {
    const num = typeof price === 'number' ? price : parseFloat(price);
    if (isNaN(num)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  const handleOpenAddModal = () => {
    setModalMode('add');
    setEditingVariantId(null);
    setFormName('');
    setFormSku('');
    setFormPrice('');
    setFormProduct(products.length > 0 ? String(products[0].id) : 'NULL');
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (v: Variant) => {
    setModalMode('edit');
    setEditingVariantId(v.id);
    setFormName(v.name);
    setFormSku(v.sku === 'N/A' ? '' : v.sku);
    setFormPrice(String(v.price));
    setFormProduct(v.product ? String(v.product.id) : 'NULL');
    setFormIsActive(v.isActive);
    setIsModalOpen(true);
  };

  // Activar/Desactivar variante rápidamente
  const handleToggleActive = (v: Variant) => {
    setConfirmTargetVariant(v);
    setToggleError(null);
    setIsConfirmModalOpen(true);
  };

  const executeToggleActive = async () => {
    if (!confirmTargetVariant) return;
    setIsToggling(true);
    setToggleError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const res = await fetch(`${API_BASE}/variants/${confirmTargetVariant.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isActive: !confirmTargetVariant.isActive })
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.message || 'Error al cambiar el estado de la variante');
      }

      setVariants((prevVariants) =>
        prevVariants.map((varItem) =>
          varItem.id === confirmTargetVariant.id ? { ...varItem, isActive: !confirmTargetVariant.isActive } : varItem
        )
      );
      setIsConfirmModalOpen(false);
      setConfirmTargetVariant(null);
    } catch (err: any) {
      console.error(err);
      setToggleError(err.message || 'Error al cambiar el estado de la variante');
    } finally {
      setIsToggling(false);
    }
  };

  const handleSaveVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPrice.trim() || formProduct === 'NULL') {
      alert('Por favor, completa todos los campos obligatorios.');
      return;
    }

    const priceNum = parseFloat(formPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      alert('El precio debe ser un número positivo.');
      return;
    }

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const bodyData: any = {
        name: formName,
        sku: formSku.trim() || undefined,
        price: priceNum,
        isActive: formIsActive
      };

      if (modalMode === 'add') {
        bodyData.productId = parseInt(formProduct);
        const res = await fetch(`${API_BASE}/variants`, {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyData)
        });
        if (!res.ok) {
          const errorJson = await res.json().catch(() => ({}));
          throw new Error(errorJson.message || 'Error al crear la variante');
        }
      } else if (modalMode === 'edit' && editingVariantId) {
        const res = await fetch(`${API_BASE}/variants/${editingVariantId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(bodyData)
        });
        if (!res.ok) {
          const errorJson = await res.json().catch(() => ({}));
          throw new Error(errorJson.message || 'Error al actualizar la variante');
        }
      }

      setIsModalOpen(false);
      fetchAllData();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error al guardar la variante');
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      <div ref={topRef} />

      {/* Título de Sección */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <div>
          <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
            Product Variants Matrix
          </h2>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Establish size parameters, specific configurations, and unique price structures for different versions of catalog items.
          </p>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
        {/* Fila 1: Búsqueda al 100% de ancho */}
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-sans">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md transition-all font-sans"
            placeholder="Search variants by name, SKU or product..."
          />
        </div>

        {/* Fila 2: Filtros a la izquierda, Botones a la derecha */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Filtro por Estado */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[130px] font-sans text-secondary"
            >
              <option>All Status</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleOpenAddModal}
              className="bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors flex items-center gap-2 font-sans cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              ADD VARIANT
            </button>

            <button
              onClick={() => fetchAllData()}
              className="p-2.5 bg-white border border-[#e8e2d8] rounded hover:bg-[#fef9f1] text-secondary hover:text-[#ae001a] transition-all flex items-center justify-center cursor-pointer"
              title="Reload variants"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabla del Directorio de Variantes */}
      <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
        {/* Header Oscuro #222222 */}
        <div className="p-4 bg-[#222222] flex justify-between items-center">
          <span className="text-label-caps font-bold text-white uppercase tracking-wider font-sans">
            VARIANTS DIRECTORY
          </span>
          <span className="material-symbols-outlined text-white text-sm cursor-pointer">
            more_vert
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
              <tr>
                <th className="px-6 py-3 text-left text-label-caps font-bold text-text-muted font-sans">
                  Variant Name
                </th>
                <th className="px-6 py-3 text-left text-label-caps font-bold text-text-muted font-sans">
                  Associated Product
                </th>
                <th className="px-6 py-3 text-left text-label-caps font-bold text-text-muted font-sans">
                  SKU
                </th>
                <th className="px-6 py-3 text-right text-label-caps font-bold text-text-muted font-sans">
                  Price
                </th>
                <th className="px-6 py-3 text-center text-label-caps font-bold text-text-muted font-sans">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-label-caps font-bold text-text-muted font-sans">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e2d8]">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                    <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
                      sync
                    </span>
                    <p className="text-secondary text-body-md mt-2 font-sans">Loading variants catalog...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[#ba1a1a] font-sans bg-white">
                    <span className="material-symbols-outlined text-[#ba1a1a] text-4xl block mb-2 mx-auto select-none">
                      error
                    </span>
                    <p className="font-bold">{error}</p>
                    <button
                      onClick={fetchAllData}
                      className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans cursor-pointer"
                    >
                      Retry Connection
                    </button>
                  </td>
                </tr>
              ) : variants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                    <span className="material-symbols-outlined text-secondary text-5xl block mb-2 mx-auto select-none">
                      layers
                    </span>
                    <p className="font-bold text-[#222222] uppercase text-sm">No variants found</p>
                    <p className="text-xs text-[#666666] mt-1">Click 'Add Variant' to start building your variants catalog.</p>
                  </td>
                </tr>
              ) : filteredVariants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-secondary italic font-sans bg-white">
                    No variants match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredVariants.map((variant) => {
                  const isInactive = !variant.isActive;
                  return (
                    <tr
                      key={variant.id}
                      className={`category-row group transition-colors ${
                        isInactive ? 'bg-[#f8f3eb]/40 opacity-75' : 'hover:bg-[#f8f3eb]'
                      }`}
                    >
                      <td className="px-6 py-4 flex items-center gap-3">
                        <div className={`w-1 h-8 rounded-full ${isInactive ? 'bg-zinc-400' : 'bg-[#ae001a]'}`}></div>
                        <p className={`font-bold text-[#1d1c17] font-sans ${isInactive ? 'line-through' : ''}`}>{variant.name}</p>
                      </td>
                      <td className="px-6 py-4 text-body-md text-[#1d1c17] font-sans">
                        {variant.product ? variant.product.name : 'No Product'}
                      </td>
                      <td className={`px-6 py-4 font-mono text-[13px] text-secondary ${isInactive ? 'line-through' : ''}`}>
                        {variant.sku}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-[#1d1c17]">
                        {formatPrice(variant.price)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`text-[10px] px-2.5 py-0.5 font-bold rounded uppercase font-sans ${
                            variant.isActive
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-zinc-200 text-[#5f5e5e]'
                          }`}
                        >
                          {variant.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-3">
                          <button
                            onClick={() => handleOpenEditModal(variant)}
                            className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                            title="Editar variante"
                          >
                            <span className="material-symbols-outlined text-[20px]">edit</span>
                          </button>
                          <button
                            onClick={() => void handleToggleActive(variant)}
                            className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                            title={variant.isActive ? "Desactivar variante" : "Activar variante"}
                          >
                            <span className="material-symbols-outlined text-[20px]">
                              {variant.isActive ? 'block' : 'check_circle_outline'}
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Interactivo de Add / Edit Variant */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
          <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col">
            <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
              <span className="font-bold text-label-caps uppercase tracking-wider font-sans">
                {modalMode === 'add' ? 'Add Variant' : 'Edit Variant'}
              </span>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSaveVariant} className="flex-1 flex flex-col min-h-0">
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                  Variant Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-sans"
                  placeholder="e.g., Small, Large, Red, Blue"
                  required
                />
              </div>

              {modalMode === 'add' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                    Associated Product
                  </label>
                  <select
                    value={formProduct}
                    onChange={(e) => setFormProduct(e.target.value)}
                    className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-sans"
                  >
                    <option value="NULL" disabled>Select a product...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                  SKU
                </label>
                <input
                  type="text"
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-sans"
                  placeholder="e.g., TS-RED-S"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                  Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono"
                  placeholder="e.g., 1.50"
                  required
                  min="0.01"
                />
              </div>

              </div>
              <div className="p-6 pt-4 border-t border-[#e8e2d8] flex justify-end gap-3 shrink-0 bg-[#fefbf6]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-[#222222] text-[#222222] font-bold text-label-caps hover:bg-zinc-100 transition-colors font-sans cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#d2272f] transition-colors font-sans cursor-pointer"
                >
                  SAVE VARIANT
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}


      <EmergencySupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />

      {/* Modal de confirmación de activación/desactivación */}
      {isConfirmModalOpen && confirmTargetVariant && (
        <div className="fixed inset-0 z-[10000] overflow-y-auto flex items-center justify-center p-4 font-sans">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setIsConfirmModalOpen(false)}
          />

          {/* Caja del Modal */}
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-zinc-200 animate-scale-in">
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                confirmTargetVariant.isActive 
                  ? 'bg-red-50 border border-red-100 text-[#ae001a]'
                  : 'bg-emerald-50 border border-emerald-100 text-emerald-600'
              }`}>
                <span className="material-symbols-outlined text-2xl block">
                  {confirmTargetVariant.isActive ? 'power_settings_new' : 'check_circle'}
                </span>
              </div>
              <div className="space-y-2">
                <h3 className="text-body-md font-bold text-zinc-900 font-sans">
                  {confirmTargetVariant.isActive ? 'Confirm Deactivation' : 'Confirm Activation'}
                </h3>
                <p className="text-body-xs text-zinc-500 leading-relaxed font-sans">
                  Are you sure you want to {confirmTargetVariant.isActive ? 'deactivate' : 'activate'} this variant? This action will set the status to {confirmTargetVariant.isActive ? 'inactive' : 'active'}.
                </p>
              </div>
            </div>

            {toggleError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-body-xs font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-sm block">error</span>
                <span>{toggleError}</span>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 text-body-xs font-bold border border-zinc-200 rounded-lg text-zinc-700 hover:bg-zinc-50 transition-all duration-200 cursor-pointer font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeToggleActive}
                disabled={isToggling}
                className={`px-4 py-2 text-white text-body-xs font-bold rounded-lg transition-all duration-200 disabled:opacity-50 cursor-pointer flex items-center gap-1.5 font-sans ${
                  confirmTargetVariant.isActive
                    ? 'bg-red-600 hover:bg-[#ae001a]'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isToggling ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin block">sync</span>
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>{confirmTargetVariant.isActive ? 'Deactivate' : 'Activate'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Quick Links Hub */}
      <CatalogQuickLinks current="variants" onNavigate={onNavigate} />
    </div>
  );
};

export default VariantsView;
