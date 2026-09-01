import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession, getStoredUser } from '../../../../../lib/auth-storage';
import { QuickLaunchPanel } from '../../../shared/QuickLaunchPanel';
import { StockQuickLinks } from '../stocks/StockQuickLinks';
import { EmergencySupportModal } from '../../../modals/QuickActionModals';

interface Category {
  id: number;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface RawMaterialCategoriesViewProps {
  onNavigate?: (view: string) => void;
}

export const RawMaterialCategoriesView: React.FC<RawMaterialCategoriesViewProps> = ({ onNavigate }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All');


  // Drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  // Form Fields
  const [formName, setFormName] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);

  // Confirm Toggle Active modal
  const [isToggleModalOpen, setIsToggleModalOpen] = useState<boolean>(false);
  const [toggleTarget, setToggleTarget] = useState<Category | null>(null);
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

      const res = await fetch(`${API_BASE}/v1/raw-material-categories?status=all`, { headers });
      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        throw new Error('Error al cargar categorías del servidor');
      }

      const json = await res.json();
      const rawData = json.data || json.items || json || [];
      
      const mapped: Category[] = rawData.map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        isActive: c.isActive !== undefined ? c.isActive : (c.is_active !== undefined ? c.is_active : true),
        createdAt: c.created_at || c.createdAt,
        updatedAt: c.updated_at || c.updatedAt,
      }));

      setCategories(mapped);
    } catch (err: any) {
      console.error('Error fetching categories:', err);
      setError('No se pudieron cargar las categorías. Por favor, revisa la conexión con el servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAdd = () => {
    if (!isInventorySpecialist) return;
    setDrawerMode('add');
    setSelectedCategory(null);
    setFormName('');
    setFormDescription('');
    setFormIsActive(true);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (e: React.MouseEvent, cat: Category) => {
    e.stopPropagation();
    if (!isInventorySpecialist) return;
    setDrawerMode('edit');
    setSelectedCategory(cat);
    setFormName(cat.name);
    setFormDescription(cat.description || '');
    setFormIsActive(cat.isActive);
    setIsDrawerOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const token = getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const isEdit = drawerMode === 'edit' && selectedCategory;
    const bodyData: any = {
      name: formName,
      description: formDescription || undefined,
      is_active: formIsActive,
    };

    try {
      setIsLoading(true);
      setIsDrawerOpen(false);

      let res;
      if (isEdit) {
        res = await fetch(`${API_BASE}/v1/raw-material-categories/${selectedCategory.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(bodyData),
        });
      } else {
        res = await fetch(`${API_BASE}/v1/raw-material-categories`, {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyData),
        });
      }

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.message || 'Error al guardar la categoría en el servidor');
      }

      await fetchData();
    } catch (err: any) {
      alert(err.message || 'No se pudo completar la operación');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenToggleActive = (e: React.MouseEvent, cat: Category) => {
    e.stopPropagation();
    if (!isInventorySpecialist) return;
    setToggleTarget(cat);
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

      const res = await fetch(`${API_BASE}/v1/raw-material-categories/${toggleTarget.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ is_active: nextActiveState }),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.message || 'Error al actualizar el estatus de la categoría. Es posible que esté asignada a materias primas activas.');
      }

      setIsToggleModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setToggleError(err.message || 'Error al cambiar estatus');
    } finally {
      setIsToggling(false);
    }
  };

  const filteredCategories = categories.filter((c) => {
    if (statusFilter === 'Active' && !c.isActive) return false;
    if (statusFilter === 'Inactive' && c.isActive) return false;


    const matchSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchSearch;
  });

  return (
    <div ref={topRef} className="space-y-6 text-left p-6 font-sans">
      {/* Header */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
          RAW MATERIAL CATEGORIES
        </h2>
        <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
          Manage raw material categories scoped independently from POS sales menu categories.
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
            placeholder="Search raw material categories by name, description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-body-md font-sans outline-none focus:border-[#ae001a]"
          />
        </div>

        {/* Fila 2: Filtros a la izquierda, Botones a la derecha */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-3">
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
                <span>ADD CATEGORY</span>
              </button>
            )}

            <button
              onClick={() => fetchData()}
              className="p-2.5 bg-white border border-[#e8e2d8] rounded hover:bg-[#fef9f1] text-secondary hover:text-[#ae001a] transition-all flex items-center justify-center cursor-pointer"
              title="Reload categories data"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>
          </div>
        </div>
      </div>



      {/* Tabla */}
      <div className="bg-white border border-[#e8e2d8] rounded overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-4 border-gray-300 border-t-[#d51f2c] rounded-full animate-spin mx-auto"></div>
            <p className="text-sm text-gray-500 font-medium">Loading raw material categories...</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center text-red-600 space-y-2">
            <span className="material-symbols-outlined text-4xl">warning</span>
            <p className="text-sm font-semibold">{error}</p>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="py-20 text-center space-y-4">
            <span className="material-symbols-outlined text-5xl text-gray-300">category</span>
            <h3 className="text-lg font-black text-[#222222] uppercase tracking-tight">No categories found.</h3>
            <p className="text-sm text-[#666666] max-w-md mx-auto">
              Register categories specifically scoped for raw materials (Meat, Dairy, Packaging, etc.).
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#222222] text-white border-b border-[#222222]">
                  <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-wider">Category Name</th>
                  <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-wider">Description</th>
                  <th className="px-6 py-4 text-center text-xs font-black uppercase tracking-wider">Status Badge</th>
                  <th className="px-6 py-4 text-center text-xs font-black uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {filteredCategories.map((c) => (
                  <tr key={c.id} className="hover:bg-[#fcfbf9] transition-all">
                    <td className="px-6 py-4 font-bold text-[#1d1c17] text-sm">{c.name}</td>
                    <td className="px-6 py-4 text-sm text-[#666666]">{c.description || 'No description'}</td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`text-[10px] px-2.5 py-0.5 font-bold rounded uppercase ${
                          c.isActive
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-zinc-100 text-zinc-600'
                        }`}
                      >
                        {c.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-2.5">
                        <button
                          onClick={(e) => handleOpenEdit(e, c)}
                          className="p-1 text-gray-500 hover:text-[#ae001a] transition-all cursor-pointer"
                          title="Edit category"
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <button
                          onClick={(e) => handleOpenToggleActive(e, c)}
                          className="p-1 text-gray-500 hover:text-[#ae001a] transition-all cursor-pointer"
                          title={c.isActive ? 'Deactivate category' : 'Activate category'}
                        >
                          <span className="material-symbols-outlined text-lg">
                            {c.isActive ? 'block' : 'check_circle'}
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>



      {/* Drawer */}
      {isDrawerOpen && createPortal(
        <div className="fixed inset-0 z-[999] flex justify-end">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setIsDrawerOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-[#e8e2d8] animate-slide-in">
            <div className="bg-[#222222] p-6 text-white flex justify-between items-center shrink-0">
              <div>
                <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest block mb-0.5">
                  Raw Material Category
                </span>
                <h3 className="font-black text-lg uppercase tracking-tight font-sans">
                  {drawerMode === 'add' ? 'Add Category' : 'Edit Category'}
                </h3>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                    Category Name
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="bg-white text-[#1d1c17] px-3.5 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] outline-none w-full"
                    placeholder="e.g. Meat, Dairy, Packaging"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                    Description
                  </label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    rows={4}
                    className="bg-white text-[#1d1c17] px-3.5 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] outline-none w-full"
                    placeholder="Describe what raw materials are scoped under this category..."
                  />
                </div>

                {drawerMode !== 'add' && (
                  <div className="flex justify-between items-center bg-[#fcfbf9] border border-[#e8e2d8] p-4 rounded-lg">
                    <div>
                      <span className="font-bold text-sm text-[#222222] block">Active Status Pipeline</span>
                      <span className="text-xs text-gray-500">Deactivation or deletion is blocked if raw materials are currently assigned to it.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="w-5 h-5 accent-[#ae001a] cursor-pointer"
                    />
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-[#e8e2d8] flex justify-end gap-3 shrink-0 bg-[#fefbf6]">
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="px-5 py-2 border border-[#222222] text-[#222222] font-bold text-label-caps hover:bg-zinc-100 transition-all rounded"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#d2272f] transition-all rounded shadow-xs"
                >
                  SAVE CATEGORY
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Toggle Active (Soft Delete) */}
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
                  {toggleTarget.isActive ? 'Deactivate Category' : 'Activate Category'}
                </h3>
                <p className="text-body-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to {toggleTarget.isActive ? 'deactivate' : 'activate'} this raw material category? 
                  {toggleTarget.isActive && ' Deactivation is blocked if raw materials are currently assigned to it.'}
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

      {/* Persistent Quick Links Hub */}
      <StockQuickLinks current="raw-material-categories" onNavigate={onNavigate} />

      {/* Support Modal */}
      {isSupportOpen && (
        <EmergencySupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
      )}
    </div>
  );
};
