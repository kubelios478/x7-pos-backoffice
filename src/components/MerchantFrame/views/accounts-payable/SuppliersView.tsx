import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import { QuickLaunchPanel } from '../../shared/QuickLaunchPanel';
import { EmergencySupportModal } from '../../modals/QuickActionModals';

interface PurchaseOrder {
  id: number;
  status: string;
  totalAmount: number;
  orderDate: string;
}

interface Supplier {
  id: number;
  name: string;
  tax_id?: string;
  email?: string;
  phone?: string;
  address?: string;
  company_id: number;
  created_at: string;
  updated_at: string;
  isActive?: boolean;
  purchaseOrders?: PurchaseOrder[];
  products?: any[];
}

interface SuppliersViewProps {
  onNavigate?: (view: string) => void;
  companyId?: number;
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({ onNavigate, companyId }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filtro de búsqueda por nombre
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All Status');

  // Estados de Cajones y Modales
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  // Campos del Formulario
  const [formName, setFormName] = useState<string>('');
  const [formTaxId, setFormTaxId] = useState<string>('');
  const [formEmail, setFormEmail] = useState<string>('');
  const [formPhone, setFormPhone] = useState<string>('');
  const [formAddress, setFormAddress] = useState<string>('');
  const [formStatus, setFormStatus] = useState<'Active' | 'Inactive'>('Active');

  // Errores de validación del formulario
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);

  // Estados para modal de confirmación de activación/desactivación
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [confirmTargetSupplier, setConfirmTargetSupplier] = useState<Supplier | null>(null);
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
  const activeCompanyId = companyId || 1;

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSuppliers = async () => {
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

      const res = await fetch(`${API_BASE}/v1/inventory/suppliers?limit=100`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        throw new Error('Error al cargar proveedores del servidor');
      }

      const json = await res.json();
      setSuppliers(json.data || []);
    } catch (err: any) {
      console.error('Error fetching suppliers:', err);
      setError('Failed to load suppliers. Please check if the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, [activeCompanyId]);

  // Buscar un proveedor individual por ID para obtener relaciones (como purchaseOrders) y metadatos frescos
  const fetchSupplierDetail = async (id: number) => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const res = await fetch(`${API_BASE}/v1/inventory/suppliers/${id}`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setSelectedSupplier(json.data);
          setIsDetailDrawerOpen(true);
        }
      }
    } catch (err) {
      console.error('Error fetching supplier detail:', err);
    }
  };

  // Validaciones del Formulario
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formName.trim() || formName.length < 2) {
      errors.name = 'Supplier name is required and must be at least 2 characters';
    }

    if (formEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formEmail)) {
      errors.email = 'Invalid email format';
    }

    if (formPhone.trim() && !/^\+?[0-9\s-]{7,18}$/.test(formPhone)) {
      errors.phone = 'Invalid phone format';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Abrir Modal para Crear
  const handleOpenAdd = () => {
    setDrawerMode('add');
    setFormName('');
    setFormTaxId('');
    setFormEmail('');
    setFormPhone('');
    setFormAddress('');
    setFormStatus('Active');
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Abrir Modal para Editar
  const handleOpenEdit = (supplier: Supplier, e: React.MouseEvent) => {
    e.stopPropagation(); // Evitar abrir el Detail Drawer al hacer clic en editar
    setDrawerMode('edit');
    setSelectedSupplier(supplier);
    setFormName(supplier.name);
    setFormTaxId(supplier.tax_id || '');
    setFormEmail(supplier.email || '');
    setFormPhone(supplier.phone || '');
    setFormAddress(supplier.address || '');
    setFormStatus(supplier.isActive !== false ? 'Active' : 'Inactive');
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Activar/Desactivar proveedor rápidamente
  const handleToggleActive = (supplier: Supplier, e: React.MouseEvent) => {
    e.stopPropagation(); // Evitar abrir el Detail Drawer al hacer clic en activar/desactivar
    setConfirmTargetSupplier(supplier);
    setToggleError(null);
    setIsConfirmModalOpen(true);
  };

  const executeToggleActive = async () => {
    if (!confirmTargetSupplier) return;
    setIsToggling(true);
    setToggleError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const nextActive = confirmTargetSupplier.isActive === false; // Si era inactivo (false), el siguiente estado es activo (true)

      const res = await fetch(`${API_BASE}/v1/inventory/suppliers/${confirmTargetSupplier.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isActive: nextActive })
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.message || 'Error al cambiar el estado del proveedor');
      }

      showToast(`Supplier status updated to ${nextActive ? 'Active' : 'Inactive'}`, 'success');

      setSuppliers((prevSuppliers) =>
        prevSuppliers.map((s) =>
          s.id === confirmTargetSupplier.id ? { ...s, isActive: nextActive } : s
        )
      );
      setIsConfirmModalOpen(false);
      setConfirmTargetSupplier(null);
    } catch (err: any) {
      console.error(err);
      setToggleError(err.message || 'Error al cambiar el estado del proveedor');
      showToast(err.message || 'Error al cambiar el estado del proveedor', 'error');
    } finally {
      setIsToggling(false);
    }
  };

  // Guardar Formulario (Crear / Editar)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const payload = {
        name: formName,
        tax_id: formTaxId || null,
        email: formEmail || null,
        phone: formPhone || null,
        address: formAddress || null,
        isActive: formStatus === 'Active', // Mapear estado al payload
      };

      let url = `${API_BASE}/v1/inventory/suppliers`;
      let method = 'POST';

      if (drawerMode === 'edit' && selectedSupplier) {
        url = `${API_BASE}/v1/inventory/suppliers/${selectedSupplier.id}`;
        method = 'PATCH';
      }

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.message || 'Error guardando proveedor');
      }

      showToast(
        drawerMode === 'add'
          ? 'Supplier created successfully'
          : 'Supplier updated successfully',
        'success'
      );
      setIsFormModalOpen(false);
      fetchSuppliers(); // Re-hidratación silenciosa en segundo plano
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to save supplier', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredSuppliers = suppliers.filter(s => {
    const nameLower = s.name.toLowerCase();
    const taxIdLower = (s.tax_id || '').toLowerCase();
    const emailLower = (s.email || '').toLowerCase();
    const queryLower = searchQuery.toLowerCase();

    const matchesSearch =
      nameLower.includes(queryLower) ||
      taxIdLower.includes(queryLower) ||
      emailLower.includes(queryLower);
    
    // s.isActive puede no venir definido, si no está se asume true
    const isSupplierActive = s.isActive !== false;
    
    if (statusFilter === 'Active') {
      return matchesSearch && isSupplierActive;
    }
    if (statusFilter === 'Inactive') {
      return matchesSearch && !isSupplierActive;
    }
    return matchesSearch; // All Status
  });

  return (
    <div className="flex flex-col gap-6 font-sans relative">
      <div ref={topRef} />
      {/* Toast Notification Portal */}
      {toast && createPortal(
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 shadow-lg flex items-center gap-2 border text-xs font-bold font-sans uppercase tracking-wider ${
          toast.type === 'success' ? 'bg-[#222222] text-white border-green-600' : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          <span className="material-symbols-outlined text-base">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {toast.message}
        </div>,
        document.body
      )}

      {/* Título de Sección */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <div>
          <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
            Suppliers Directory
          </h2>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Maintain your network of supplier partners, tax identification details, primary communication channels, and purchase contract links.
          </p>
        </div>
      </div>

      {/* Barra de búsqueda y Filtros */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary">
            search
          </span>
          <input
            type="text"
            placeholder="Search suppliers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md transition-all font-sans"
          />
        </div>
        <div className="flex items-center gap-4 w-full justify-start">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[140px] font-sans"
          >
            <option value="All Status">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors flex items-center gap-2 font-sans cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            ADD SUPPLIER
          </button>

          <button
            type="button"
            onClick={() => fetchSuppliers()}
            className="p-2.5 bg-white border border-[#e8e2d8] rounded hover:bg-[#fef9f1] text-secondary hover:text-[#ae001a] transition-all flex items-center justify-center cursor-pointer"
            title="Reload suppliers"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
      </div>

      {/* Main Table Grid / Empty State */}
      {isLoading ? (
        <div className="bg-white border border-[#e8e2d8] rounded p-12 text-center text-secondary font-sans shadow-sm">
          <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
            sync
          </span>
          <p className="text-secondary text-body-md mt-2 font-sans">Loading supplier directory...</p>
        </div>
      ) : error ? (
        /* Estado de Error */
        <div className="bg-white border border-[#e8e2d8] rounded p-12 text-center text-secondary font-sans shadow-sm flex flex-col items-center justify-center gap-4 animate-fade-in">
          <span className="material-symbols-outlined text-[#ae001a] text-6xl select-none">
            warning
          </span>
          <h3 className="font-bold text-[#ba1a1a] uppercase tracking-wider text-sm">Failed to Load Suppliers</h3>
          <p className="text-xs text-[#666666] max-w-md">
            {error}
          </p>
          <button
            onClick={fetchSuppliers}
            className="px-4 py-2 bg-[#222222] text-white text-xs font-bold uppercase rounded hover:bg-[#ae001a] transition-all"
          >
            Retry
          </button>
        </div>
      ) : suppliers.length === 0 ? (
        /* Empty State de Inicialización: El grid desaparece por completo (AC 1) */
        <div className="bg-white border border-[#e8e2d8] rounded p-12 text-center text-secondary font-sans shadow-sm flex flex-col items-center justify-center gap-4 animate-fade-in">
          <span className="material-symbols-outlined text-[#ae001a] text-6xl select-none">
            handshake
          </span>
          <h3 className="font-bold text-[#222222] uppercase tracking-wider text-sm">No suppliers configured yet for this company profile.</h3>
          <p className="text-xs text-[#666666] max-w-md">
            Click 'Add Supplier' to establish your business partners network.
          </p>
        </div>
      ) : (
        /* Tabla Principal Activa */
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm animate-fade-in">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-label-caps font-bold text-white uppercase tracking-wider">
              SUPPLIER DIRECTORY
            </span>
            <span className="material-symbols-outlined text-white text-sm cursor-pointer select-none">
              more_vert
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">ID</th>
                  <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">Supplier Enterprise Name</th>
                  <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">Tax Identification Number</th>
                  <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">Contact Matrix Channel</th>
                  <th className="px-6 py-3 text-center text-label-caps font-bold text-[#5f5e5e]">Active Linked Inventory</th>
                  <th className="px-6 py-3 text-center text-label-caps font-bold text-[#5f5e5e]">Status</th>
                  <th className="px-6 py-3 text-center text-label-caps font-bold text-[#5f5e5e] w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                      <span className="material-symbols-outlined text-secondary text-5xl block mb-2">
                        search_off
                      </span>
                      <p className="font-bold text-[#222222] uppercase text-sm">No suppliers match your search filters.</p>
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((supplier) => {
                    const isInactive = supplier.isActive === false;
                    return (
                      <tr
                        key={supplier.id}
                        onClick={() => fetchSupplierDetail(supplier.id)}
                        className={`group transition-colors cursor-pointer ${
                          isInactive ? 'bg-[#f8f3eb]/40 opacity-75' : 'hover:bg-[#f8f3eb]'
                        }`}
                      >
                        {/* ID */}
                        <td className="px-6 py-4 font-mono text-[13px] text-secondary">
                          #{supplier.id}
                        </td>
                        
                        {/* Supplier Enterprise Name */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-1 h-8 rounded-full ${isInactive ? 'bg-[#5f5e5e]/40' : 'bg-[#ae001a]'}`}></div>
                            <div>
                              <p className="font-bold text-[#1d1c17]">{supplier.name}</p>
                              <p className="text-[11px] text-secondary uppercase tracking-wider">
                                Supplier Partner
                              </p>
                            </div>
                          </div>
                        </td>
                        
                        {/* Tax Identification Number */}
                        <td className="px-6 py-4 text-xs text-secondary">
                          {supplier.tax_id ? (
                            <span className="font-medium text-[#1d1c17]">{supplier.tax_id}</span>
                          ) : (
                            <span className="text-secondary/60 italic font-normal">No Tax ID</span>
                          )}
                        </td>
                        
                        {/* Contact Matrix Channel */}
                        <td className="px-6 py-4 text-xs text-secondary">
                          <div className="flex flex-col gap-1">
                            {supplier.email ? (
                              <span className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[13px] text-secondary/60 select-none">mail</span>
                                {supplier.email}
                              </span>
                            ) : null}
                            {supplier.phone ? (
                              <span className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[13px] text-secondary/60 select-none">phone</span>
                                {supplier.phone}
                              </span>
                            ) : null}
                            {!supplier.email && !supplier.phone && (
                              <span className="text-secondary/60 italic">No Contact Channels</span>
                            )}
                          </div>
                        </td>
                        
                        {/* Active Linked Inventory */}
                        <td className="px-6 py-4 text-center">
                          <span className="bg-[#ece8e0] px-3 py-1 rounded text-body-sm font-bold text-[#1d1c17]">
                            {supplier.products?.length || 0} Products
                          </span>
                        </td>
                        
                        {/* Status */}
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`text-[10px] px-2.5 py-0.5 font-bold rounded uppercase ${
                              !isInactive
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-zinc-200 text-[#5f5e5e]'
                            }`}
                          >
                            {!isInactive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        
                        {/* Actions */}
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-3">
                            <button
                              type="button"
                              onClick={(e) => handleOpenEdit(supplier, e)}
                              className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                              title="Editar proveedor"
                            >
                              <span className="material-symbols-outlined text-[20px]">edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => void handleToggleActive(supplier, e)}
                              className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                              title={supplier.isActive !== false ? "Desactivar proveedor" : "Activar proveedor"}
                            >
                              <span className="material-symbols-outlined text-[20px]">
                                {supplier.isActive !== false ? 'block' : 'check_circle_outline'}
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
      )}

      {/* Floating Action Button (FAB) */}
      <button
        type="button"
        aria-label="Add new supplier"
        onClick={handleOpenAdd}
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] text-white rounded-full flex items-center justify-center shadow-xl hover:bg-[#8f0015] hover:scale-110 active:scale-95 transition-all z-40 cursor-pointer"
      >
        <span className="material-symbols-outlined text-3xl">add</span>
      </button>

      {/* ================= FORM MODAL (ADD / EDIT) ================= */}
      {isFormModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-start overflow-y-auto p-2 md:pt-4 md:pb-12 justify-center font-sans backdrop-blur-sm">
          {/* Modal Container */}
          <div className="bg-[#fcfbfa] border border-[#e8e2d8] max-w-lg w-full shadow-2xl relative flex flex-col my-auto max-h-[90vh] rounded overflow-hidden">
            {/* Header */}
            <div className="bg-[#222222] px-6 py-4 flex justify-between items-center shrink-0">
              <span className="text-label-caps font-bold text-white uppercase tracking-wider">
                {drawerMode === 'add' ? 'ADD SUPPLIER' : 'EDIT SUPPLIER'}
              </span>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="text-white hover:opacity-80"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="flex flex-col min-h-0 text-left">
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                {/* Name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                    Supplier Name <span className="text-[#ae001a]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className={`bg-white text-[#1d1c17] px-3 py-2 border rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full ${
                      formErrors.name ? 'border-[#ae001a]' : 'border-[#e8e2d8]'
                    }`}
                    placeholder="e.g. Coca-Cola FEMSA"
                  />
                  {formErrors.name && (
                    <p className="text-[10px] font-semibold text-[#ae001a] uppercase tracking-wider">{formErrors.name}</p>
                  )}
                </div>

                {/* Tax ID */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                    Tax ID / RUT
                  </label>
                  <input
                    type="text"
                    value={formTaxId}
                    onChange={(e) => setFormTaxId(e.target.value)}
                    className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                    placeholder="e.g. 12345678-9"
                  />
                </div>

                {/* Email */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className={`bg-white text-[#1d1c17] px-3 py-2 border rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full ${
                      formErrors.email ? 'border-[#ae001a]' : 'border-[#e8e2d8]'
                    }`}
                    placeholder="e.g. sales@coca-cola.com"
                  />
                  {formErrors.email && (
                    <p className="text-[10px] font-semibold text-[#ae001a] uppercase tracking-wider">{formErrors.email}</p>
                  )}
                </div>

                {/* Phone */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className={`bg-white text-[#1d1c17] px-3 py-2 border rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full ${
                      formErrors.phone ? 'border-[#ae001a]' : 'border-[#e8e2d8]'
                    }`}
                    placeholder="e.g. +56912345678"
                  />
                  {formErrors.phone && (
                    <p className="text-[10px] font-semibold text-[#ae001a] uppercase tracking-wider">{formErrors.phone}</p>
                  )}
                </div>

                {/* Address */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                    Physical Address
                  </label>
                  <textarea
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    rows={3}
                    className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full resize-none"
                    placeholder="e.g. 123 Industrial Way, Building B"
                  />
                </div>
              </div>

              {/* Actions Footer */}
              <div className="p-6 pt-4 border-t border-[#e8e2d8] flex justify-end gap-3 shrink-0 bg-[#fefbf6]">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 border border-[#222222] text-[#222222] font-bold text-label-caps hover:bg-zinc-100 transition-colors font-sans cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#d2272f] transition-colors font-sans cursor-pointer"
                >
                  {isSubmitting ? 'SAVING...' : 'SAVE SUPPLIER'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ================= DETAIL INSPECTION DRAWER ================= */}
      {isDetailDrawerOpen && selectedSupplier && createPortal(
        <div className="fixed inset-0 z-[1000] flex justify-end font-sans">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 transition-opacity duration-300"
            onClick={() => setIsDetailDrawerOpen(false)}
          />

          {/* Drawer Body */}
          <div className="relative w-full max-w-md bg-[#fcfbfa] h-full shadow-2xl z-10 flex flex-col justify-between border-l border-[#e8e2d8] animate-slide-in">
            {/* Header */}
            <div className="bg-[#222222] px-6 py-5 flex items-center justify-between border-b border-[#333333]">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-white text-xl">domain</span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-white">
                  SUPPLIER SYSTEM DETAILS
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailDrawerOpen(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Info Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <h2 className="text-xl font-black text-[#1c1b16] tracking-tight">{selectedSupplier.name}</h2>
                <p className="text-xs text-[#5f5e5e] mt-1 uppercase tracking-wider font-semibold">
                  Tax ID: {selectedSupplier.tax_id || 'Not Defined'}
                </p>
              </div>

              <div className="border-t border-[#e8e2d8] pt-5 space-y-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">Contact Information</h4>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <span className="material-symbols-outlined text-base text-[#5f5e5e]">mail</span>
                    <span className="text-xs text-[#1c1b16]">{selectedSupplier.email || 'No email provided'}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="material-symbols-outlined text-base text-[#5f5e5e]">phone</span>
                    <span className="text-xs text-[#1c1b16]">{selectedSupplier.phone || 'No phone provided'}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="material-symbols-outlined text-base text-[#5f5e5e]">pin_drop</span>
                    <span className="text-xs text-[#1c1b16]">{selectedSupplier.address || 'No address provided'}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-[#e8e2d8] pt-5 space-y-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">System Metadata</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#f5efe6] p-3 border border-[#e8e2d8]">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e] mb-1">Created At</span>
                    <span className="text-xs font-semibold text-[#1c1b16]">
                      {new Date(selectedSupplier.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="bg-[#f5efe6] p-3 border border-[#e8e2d8]">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e] mb-1">Updated At</span>
                    <span className="text-xs font-semibold text-[#1c1b16]">
                      {new Date(selectedSupplier.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-t border-[#e8e2d8] pt-5 space-y-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">Procurement Summary</h4>
                <div className="bg-[#222222] p-4 flex justify-between items-center text-white">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#ae001a] text-2xl">inventory_2</span>
                    <div>
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-white/50">Purchase Orders</span>
                      <span className="text-md font-black">
                        {selectedSupplier.purchaseOrders?.length || 0} Connected
                      </span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-white/20 text-3xl">receipt_long</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-[#f5efe6] border-t border-[#e8e2d8] px-6 py-4 flex gap-3">
              <button
                type="button"
                onClick={() => setIsDetailDrawerOpen(false)}
                className="w-full py-3 bg-[#222222] hover:bg-black text-white text-[11px] font-bold uppercase tracking-widest transition-colors cursor-pointer text-center"
              >
                CLOSE DETAILS
              </button>
            </div>
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
              id: 'purchase-orders',
              label: 'PURCHASE ORDERS LOG',
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

      <EmergencySupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />

      {/* Modal de confirmación de activación/desactivación */}
      {isConfirmModalOpen && confirmTargetSupplier && (
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
                confirmTargetSupplier.isActive !== false 
                  ? 'bg-red-50 border border-red-100 text-[#ae001a]'
                  : 'bg-emerald-50 border border-emerald-100 text-emerald-600'
              }`}>
                <span className="material-symbols-outlined text-2xl block">
                  {confirmTargetSupplier.isActive !== false ? 'power_settings_new' : 'check_circle'}
                </span>
              </div>
              <div className="space-y-2">
                <h3 className="text-body-md font-bold text-zinc-900 font-sans">
                  {confirmTargetSupplier.isActive !== false ? 'Confirm Deactivation' : 'Confirm Activation'}
                </h3>
                <p className="text-body-xs text-zinc-500 leading-relaxed font-sans">
                  Are you sure you want to {confirmTargetSupplier.isActive !== false ? 'deactivate' : 'activate'} this supplier? This action will set the status to {confirmTargetSupplier.isActive !== false ? 'inactive' : 'active'}.
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
                  confirmTargetSupplier.isActive !== false
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
                  <span>{confirmTargetSupplier.isActive !== false ? 'Deactivate' : 'Activate'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
