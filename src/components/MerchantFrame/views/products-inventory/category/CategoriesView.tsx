import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../../lib/auth-storage';
import { QuickLaunchPanel } from '../../../shared/QuickLaunchPanel';
import { EmergencySupportModal } from '../../../modals/QuickActionModals';

interface Category {
  id: string;
  name: string;
  type: 'Root Category' | 'Sub-Category';
  parentId: string;
  linkedProducts: number;
  status: 'Active' | 'Inactive';
}

interface CategoriesViewProps {
  onNavigate?: (view: string) => void;
}

export const CategoriesView: React.FC<CategoriesViewProps> = ({ onNavigate }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de filtros y búsqueda
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All Status');

  // Estados del Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  // Campos del Formulario del Modal
  const [formName, setFormName] = useState<string>('');
  const [formParent, setFormParent] = useState<string>('NULL');
  const [formStatus, setFormStatus] = useState<'Active' | 'Inactive'>('Active');
  const [formLinkedProducts, setFormLinkedProducts] = useState<number>(0);
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);
  // Estados para modal de confirmación de activación/desactivación
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [confirmTargetCategory, setConfirmTargetCategory] = useState<Category | null>(null);
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

  const fetchCategories = async () => {
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

      const [categoriesRes, productsRes] = await Promise.all([
        fetch(`${API_BASE}/category?limit=100`, { headers }),
        fetch(`${API_BASE}/products?limit=100`, { headers })
      ]);

      if (categoriesRes.status === 401 || productsRes.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!categoriesRes.ok || !productsRes.ok) {
        throw new Error('Error al cargar datos del servidor');
      }

      const categoriesJson = await categoriesRes.json();
      const productsJson = await productsRes.json();

      const categoriesData = categoriesJson.data || [];
      const productsData = productsJson.data || [];

      // Mapear al formato de la interfaz local
      const mapped: Category[] = categoriesData.map((cat: any) => {
        const hasParent = cat.parents && cat.parents.length > 0;
        const parentId = hasParent ? String(cat.parents[0].id) : 'NULL';
        const type = hasParent ? 'Sub-Category' : 'Root Category';
        
        // Contar productos vinculados
        const linkedProducts = productsData.filter((p: any) => p.category?.id === cat.id).length;

        return {
          id: String(cat.id),
          name: cat.name,
          type,
          parentId,
          linkedProducts,
          status: cat.isActive !== false ? 'Active' : 'Inactive',
        };
      });

      setCategories(mapped);
    } catch (err: any) {
      console.error('Error fetching categories:', err);
      setError('Failed to load categories. Please check if the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // Filtrado reactivo de la lista
  const filteredCategories = categories.filter((cat) => {
    const matchesSearch = cat.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          cat.id.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'All Status' || cat.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Abrir modal para añadir
  const handleOpenAddModal = () => {
    setModalMode('add');
    setEditingCategoryId(null);
    setFormName('');
    setFormParent('NULL');
    setFormStatus('Active');
    setFormLinkedProducts(0);
    setIsModalOpen(true);
  };

  // Abrir modal para editar
  const handleOpenEditModal = (cat: Category) => {
    setModalMode('edit');
    setEditingCategoryId(cat.id);
    setFormName(cat.name);
    setFormParent(cat.parentId);
    setFormStatus(cat.status);
    setFormLinkedProducts(cat.linkedProducts);
    setIsModalOpen(true);
  };

  // Activar/Desactivar categoría rápidamente
  const handleToggleActive = (cat: Category) => {
    setConfirmTargetCategory(cat);
    setToggleError(null);
    setIsConfirmModalOpen(true);
  };

  const executeToggleActive = async () => {
    if (!confirmTargetCategory) return;
    setIsToggling(true);
    setToggleError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const newIsActive = confirmTargetCategory.status !== 'Active';

      const res = await fetch(`${API_BASE}/category/${confirmTargetCategory.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isActive: newIsActive })
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.message || 'Error al cambiar el estado de la categoría');
      }

      setCategories((prevCategories) =>
        prevCategories.map((c) =>
          c.id === confirmTargetCategory.id ? { ...c, status: newIsActive ? 'Active' : 'Inactive' } : c
        )
      );
      setIsConfirmModalOpen(false);
      setConfirmTargetCategory(null);
    } catch (err: any) {
      console.error(err);
      setToggleError(err.message || 'Error al cambiar el estado de la categoría');
    } finally {
      setIsToggling(false);
    }
  };

  // Guardar Formulario (Add o Edit) en el backend
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert('Por favor, ingresa el nombre de la categoría.');
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

      const parentIdNum = formParent === 'NULL' ? null : parseInt(formParent);

      if (modalMode === 'add') {
        const res = await fetch(`${API_BASE}/category`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: formName,
            parentId: parentIdNum,
            isActive: formStatus === 'Active'
          })
        });
        if (!res.ok) throw new Error('Error al crear la categoría');
      } else if (modalMode === 'edit' && editingCategoryId) {
        const res = await fetch(`${API_BASE}/category/${editingCategoryId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            name: formName,
            parentId: parentIdNum,
            isActive: formStatus === 'Active'
          })
        });
        if (!res.ok) throw new Error('Error al actualizar la categoría');
      }

      setIsModalOpen(false);
      fetchCategories();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error al guardar la categoría');
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
      <div ref={topRef} />

      {/* Título de Sección */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <div>
          <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
            Product Categories Hierarchy
          </h2>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Organize products into parent and sub-categories to optimize menu layouts, POS sales, and tax tracking.
          </p>
        </div>
      </div>

      {/* Barra de búsqueda y Filtros */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative w-full md:w-96">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md transition-all"
            placeholder="Search categories..."
          />
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[140px]"
          >
            <option>All Status</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
          <button
            onClick={handleOpenAddModal}
            className="bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            ADD CATEGORY
          </button>

          <button
            onClick={() => fetchCategories()}
            className="p-2.5 bg-white border border-[#e8e2d8] rounded hover:bg-[#fef9f1] text-secondary hover:text-[#ae001a] transition-all flex items-center justify-center cursor-pointer font-sans"
            title="Reload categories"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
      </div>

      {/* Tabla Principal */}
      <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
        <div className="p-4 bg-[#222222] flex justify-between items-center">
          <span className="text-label-caps font-bold text-white uppercase tracking-wider">
            CATEGORY HIERARCHY
          </span>
          <span className="material-symbols-outlined text-white text-sm cursor-pointer">
            more_vert
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
              <tr>
                <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">
                  Category Name
                </th>
                <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">
                  Parent ID
                </th>
                <th className="px-6 py-3 text-center text-label-caps font-bold text-[#5f5e5e]">
                  Linked Products
                </th>
                <th className="px-6 py-3 text-center text-label-caps font-bold text-[#5f5e5e]">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-label-caps font-bold text-[#5f5e5e]">
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
                    <p className="text-secondary text-body-md mt-2 font-sans">Loading category hierarchy...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#ba1a1a] font-sans bg-white">
                    <span className="material-symbols-outlined text-[#ba1a1a] text-4xl block mb-2 mx-auto select-none">
                      error
                    </span>
                    <p className="font-bold">{error}</p>
                    <button
                      onClick={fetchCategories}
                      className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans cursor-pointer"
                    >
                      Retry Connection
                    </button>
                  </td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                      <span className="material-symbols-outlined text-secondary text-5xl block mb-2">
                        category
                      </span>
                      <p className="font-bold text-[#222222] uppercase text-sm">No categories found</p>
                      <p className="text-xs text-[#666666] mt-1">Click 'Add Category' to start building your hierarchy.</p>
                    </td>
                  </tr>
                ) : filteredCategories.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-secondary italic bg-white">
                      No categories match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredCategories.map((cat) => {
                    const isSub = cat.type === 'Sub-Category';
                    const isInactive = cat.status === 'Inactive';
                    return (
                      <tr
                        key={cat.id}
                        className={`category-row group transition-colors ${
                          isInactive ? 'bg-[#f8f3eb]/40 opacity-75' : 'hover:bg-[#f8f3eb]'
                        }`}
                      >
                        <td className={`px-6 py-4 flex items-center gap-3 ${isSub ? 'pl-12' : ''}`}>
                          {!isSub ? (
                            <div className="w-1 h-8 bg-[#ae001a] rounded-full"></div>
                          ) : (
                            <span className="material-symbols-outlined text-[#5f5e5e]/40">
                              subdirectory_arrow_right
                            </span>
                          )}
                          <div>
                            <p className="font-bold text-[#1d1c17]">{cat.name}</p>
                            <p className="text-[11px] text-secondary uppercase tracking-wider">
                              {cat.type}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-[13px] text-secondary">
                          {cat.parentId}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="bg-[#ece8e0] px-3 py-1 rounded text-body-sm font-bold text-[#1d1c17]">
                            {cat.linkedProducts}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`text-[10px] px-2.5 py-0.5 font-bold rounded uppercase ${
                              cat.status === 'Active'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-zinc-200 text-[#5f5e5e]'
                            }`}
                          >
                            {cat.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-3">
                            <button
                              onClick={() => handleOpenEditModal(cat)}
                              className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                              title="Editar categoría"
                            >
                              <span className="material-symbols-outlined text-[20px]">edit</span>
                            </button>
                            <button
                              onClick={() => void handleToggleActive(cat)}
                              className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                              title={cat.status === 'Active' ? "Desactivar categoría" : "Activar categoría"}
                            >
                              <span className="material-symbols-outlined text-[20px]">
                                {cat.status === 'Active' ? 'block' : 'check_circle_outline'}
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


      {/* Modal Interactivo de Add / Edit Category */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
          <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in max-h-[90vh] flex flex-col">
            <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
              <span className="font-bold text-label-caps uppercase tracking-wider">
                {modalMode === 'add' ? 'Add Product Category' : 'Edit Product Category'}
              </span>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/70 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSaveCategory} className="flex-1 flex flex-col min-h-0">
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Category Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                  placeholder="e.g., Soft Drinks, Desserts"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="category-parent-select" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Parent Category
                </label>
                <select
                  id="category-parent-select"
                  value={formParent}
                  onChange={(e) => setFormParent(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                >
                  <option value="NULL">None (Root Category)</option>
                  {categories
                    .filter((cat) => cat.parentId === 'NULL' && cat.id !== editingCategoryId)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>

              {modalMode === 'edit' && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="category-linked-products" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                    Linked Products Count
                  </label>
                  <input
                    id="category-linked-products"
                    type="number"
                    value={formLinkedProducts}
                    onChange={(e) => setFormLinkedProducts(Number(e.target.value))}
                    className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                    min="0"
                  />
                </div>
              )}

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
                  SAVE CATEGORY
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      <div className="mt-8">
        <QuickLaunchPanel
          description="One-click access to system settings, master suppliers, and your corporate customer directory."
          actions={[
            {
              id: 'products-master',
              label: 'PRODUCTS MASTER LIST',
              onClick: () => onNavigate?.('products'),
            },
            {
              id: 'discounts-control',
              label: 'DISCOUNTS CONTROL',
              onClick: () => onNavigate?.('discounts'),
            },
            {
              id: 'tax-configs',
              label: 'TAX CONFIGURATIONS',
              onClick: () => onNavigate?.('company-configurations'),
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

      <EmergencySupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />

      {/* Modal de confirmación de activación/desactivación */}
      {isConfirmModalOpen && confirmTargetCategory && (
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
                confirmTargetCategory.status === 'Active' 
                  ? 'bg-red-50 border border-red-100 text-[#ae001a]'
                  : 'bg-emerald-50 border border-emerald-100 text-emerald-600'
              }`}>
                <span className="material-symbols-outlined text-2xl block">
                  {confirmTargetCategory.status === 'Active' ? 'power_settings_new' : 'check_circle'}
                </span>
              </div>
              <div className="space-y-2">
                <h3 className="text-body-md font-bold text-zinc-900 font-sans">
                  {confirmTargetCategory.status === 'Active' ? 'Confirm Deactivation' : 'Confirm Activation'}
                </h3>
                <p className="text-body-xs text-zinc-500 leading-relaxed font-sans">
                  Are you sure you want to {confirmTargetCategory.status === 'Active' ? 'deactivate' : 'activate'} this category? This action will set the status to {confirmTargetCategory.status === 'Active' ? 'inactive' : 'active'}.
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
                  confirmTargetCategory.status === 'Active'
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
                  <span>{confirmTargetCategory.status === 'Active' ? 'Deactivate' : 'Activate'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoriesView;
