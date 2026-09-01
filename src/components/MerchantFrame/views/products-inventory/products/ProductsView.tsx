import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../../lib/auth-storage';
import { QuickLaunchPanel } from '../../../shared/QuickLaunchPanel';
import { CatalogQuickLinks } from '../CatalogQuickLinks';
import { EmergencySupportModal } from '../../../modals/QuickActionModals';
import { TableOptionsMenu } from '../../../../shared/TableOptionsMenu';

interface Category {
  id: number;
  name: string;
}

interface Variant {
  id: number;
  name: string;
  sku: string;
  price: number | string;
  isActive: boolean;
}

interface Modifier {
  id: number;
  name: string;
  priceDelta: number | string;
  isActive: boolean;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  basePrice: number | string;
  isActive: boolean;
  category: Category | null;
  variants?: Variant[];
  modifiers?: Modifier[];
}

interface ProductsViewProps {
  onNavigate?: (view: string) => void;
}

export const ProductsView: React.FC<ProductsViewProps> = ({ onNavigate }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Control de expansión de filas de productos
  const [expandedProducts, setExpandedProducts] = useState<Record<number, boolean>>({});

  // Filtros locales
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All Categories');
  const [statusFilter, setStatusFilter] = useState<string>('All Status');

  // Estados del Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingProductId, setEditingProductId] = useState<number | null>(null);

  // Campos del Formulario del Modal
  const [formName, setFormName] = useState<string>('');
  const [formSku, setFormSku] = useState<string>('');
  const [formPrice, setFormPrice] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('NULL');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);

  // Estados para modal de confirmación de activación/desactivación
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [confirmTargetProduct, setConfirmTargetProduct] = useState<Product | null>(null);
  const [isToggling, setIsToggling] = useState<boolean>(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);

  // Estado para Personalizar Columnas
  const [visibleColumns, setVisibleColumns] = useState<{
    category: boolean;
    basePrice: boolean;
    status: boolean;
    actions: boolean;
  }>({
    category: true,
    basePrice: true,
    status: true,
    actions: true,
  });

  // Estado para Densidad de la Fila (Padding) y Límite de Registros Visibles
  const [rowDensity, setRowDensity] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable');
  const [pageSize, setPageSize] = useState<number>(10);

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

      const [productsRes, categoriesRes] = await Promise.all([
        fetch(`${API_BASE}/products?limit=100`, { headers }),
        fetch(`${API_BASE}/category?limit=100`, { headers })
      ]);

      if (productsRes.status === 401 || categoriesRes.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!productsRes.ok || !categoriesRes.ok) {
        throw new Error('Error al cargar datos del servidor');
      }

      const productsJson = await productsRes.json();
      const categoriesJson = await categoriesRes.json();

      const productsData = productsJson.data || [];
      const categoriesData = categoriesJson.data || [];

      // Mapear y asegurar que los campos existan y tengan el tipo correcto
      const mappedProducts = productsData.map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku || 'N/A',
        basePrice: p.basePrice,
        isActive: p.isActive !== undefined ? p.isActive : true,
        category: p.category ? { id: p.category.id, name: p.category.name } : null,
        variants: p.variants || [],
        modifiers: p.modifiers || []
      }));

      setProducts(mappedProducts);
      setCategories(categoriesData);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError('Failed to load products. Please check if the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Filtrado de productos reactivo en el cliente
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      categoryFilter === 'All Categories' ||
      p.category?.name === categoryFilter;

    const matchesStatus =
      statusFilter === 'All Status' ||
      (statusFilter === 'Active' && p.isActive) ||
      (statusFilter === 'Inactive' && !p.isActive);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const formatPrice = (price: number | string) => {
    const num = typeof price === 'number' ? price : parseFloat(price);
    if (isNaN(num)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  // Abrir modal para añadir
  const handleOpenAddModal = () => {
    setModalMode('add');
    setEditingProductId(null);
    setFormName('');
    setFormSku('');
    setFormPrice('');
    setFormCategory('NULL');
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  // Abrir modal para editar
  const handleOpenEditModal = (p: Product) => {
    setModalMode('edit');
    setEditingProductId(p.id);
    setFormName(p.name);
    setFormSku(p.sku);
    setFormPrice(String(p.basePrice));
    setFormCategory(p.category ? String(p.category.id) : 'NULL');
    setFormIsActive(p.isActive);
    setIsModalOpen(true);
  };

  // Activar/Desactivar producto rápidamente
  const handleToggleActive = (p: Product) => {
    setConfirmTargetProduct(p);
    setToggleError(null);
    setIsConfirmModalOpen(true);
  };

  const executeToggleActive = async () => {
    if (!confirmTargetProduct) return;
    setIsToggling(true);
    setToggleError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const res = await fetch(`${API_BASE}/products/${confirmTargetProduct.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isActive: !confirmTargetProduct.isActive })
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.message || 'Error al cambiar el estado del producto');
      }

      setProducts((prevProducts) =>
        prevProducts.map((prod) =>
          prod.id === confirmTargetProduct.id ? { ...prod, isActive: !prod.isActive } : prod
        )
      );
      setIsConfirmModalOpen(false);
      setConfirmTargetProduct(null);
    } catch (err: any) {
      console.error(err);
      setToggleError(err.message || 'Error al cambiar el estado del producto');
    } finally {
      setIsToggling(false);
    }
  };

  // Guardar Formulario (Add o Edit) en el backend
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formSku.trim() || !formPrice.trim()) {
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

      const categoryIdNum = formCategory === 'NULL' ? null : parseInt(formCategory);

      const bodyData = {
        name: formName,
        sku: formSku,
        basePrice: priceNum,
        categoryId: categoryIdNum,
        isActive: formIsActive
      };

      if (modalMode === 'add') {
        const res = await fetch(`${API_BASE}/products`, {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyData)
        });
        if (!res.ok) {
          const errorJson = await res.json().catch(() => ({}));
          throw new Error(errorJson.message || 'Error al crear el producto');
        }
      } else if (modalMode === 'edit' && editingProductId) {
        const res = await fetch(`${API_BASE}/products/${editingProductId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(bodyData)
        });
        if (!res.ok) {
          const errorJson = await res.json().catch(() => ({}));
          throw new Error(errorJson.message || 'Error al actualizar el producto');
        }
      }

      setIsModalOpen(false);
      fetchAllData();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error al guardar el producto');
    }
  };

  // Funciones de acción del menú de opciones (more_vert)
  const handleExportCSV = () => {
    setIsOptionsMenuOpen(false);
    if (!filteredProducts || filteredProducts.length === 0) return;
    const headers = ['ID', 'Name', 'Category', 'Base Price', 'SKU', 'Status'];
    const rows = filteredProducts.map(p => [
      p.id,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.category?.name || 'Uncategorized').replace(/"/g, '""')}"`,
      p.basePrice,
      `"${(p.sku || '').replace(/"/g, '""')}"`,
      p.isActive !== false ? 'Active' : 'Inactive'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `products_directory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintTable = () => {
    setIsOptionsMenuOpen(false);
    window.print();
  };

  const handleCopySummary = () => {
    setIsOptionsMenuOpen(false);
    const text = filteredProducts
      .map(p => `#${p.id} ${p.name} (${p.category?.name || 'Uncategorized'}) - $${p.basePrice} [${p.isActive !== false ? 'ACTIVE' : 'INACTIVE'}]`)
      .join('\n');
    navigator.clipboard.writeText(text);
    alert('Products directory list copied to clipboard!');
  };

  // Helpers para tabla dinámica
  const displayedProducts = pageSize === 9999 ? filteredProducts : filteredProducts.slice(0, pageSize);
  
  const activeColSpan = 2 + (visibleColumns.category ? 1 : 0) + (visibleColumns.basePrice ? 1 : 0) + (visibleColumns.status ? 1 : 0) + (visibleColumns.actions ? 1 : 0);

  const getDensityPadding = () => {
    switch (rowDensity) {
      case 'compact':
        return 'py-2 px-6 text-xs';
      case 'spacious':
        return 'py-5 px-6 text-base';
      case 'comfortable':
      default:
        return 'py-3.5 px-6 text-sm';
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      <div ref={topRef} />

      {/* Título de Sección */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <div>
          <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase font-sans">
            Products & Catalog Master List
          </h2>
          <p className="text-[#5f5e5e] text-body-sm font-sans mt-1">
            Manage your global catalog items, configure base prices, establish SKU references and assign item variants.
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
            placeholder="Search products by name or SKU..."
          />
        </div>

        {/* Fila 2: Filtros a la izquierda, Botones a la derecha */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Filtro por Categoría */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[150px] font-sans text-secondary"
            >
              <option>All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>

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
              ADD PRODUCT
            </button>
          </div>
        </div>
      </div>

      {/* Tabla del Directorio de Productos */}
      <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
        {/* Header Oscuro #222222 con Menú Desplegable Completo de Opciones */}
        <div className="p-4 bg-[#222222] flex justify-between items-center relative">
          <div className="flex items-center gap-3">
            <span className="text-label-caps font-bold text-white uppercase tracking-wider font-sans">
              PRODUCT DIRECTORY
            </span>
            <span className="text-[10px] font-mono font-bold bg-[#333333] text-zinc-300 px-2 py-0.5 rounded border border-[#444444]">
              {displayedProducts.length === filteredProducts.length
                ? `${filteredProducts.length} product${filteredProducts.length === 1 ? '' : 's'}`
                : `${displayedProducts.length} / ${filteredProducts.length} products`}
            </span>
          </div>

          <TableOptionsMenu
            onExportCSV={handleExportCSV}
            onPrint={handlePrintTable}
            onCopySummary={handleCopySummary}
            onReload={fetchAllData}
            columns={[
              { key: 'category', label: 'Category' },
              { key: 'basePrice', label: 'Base Price' },
              { key: 'status', label: 'Status' },
              { key: 'actions', label: 'Actions' },
            ]}
            visibleColumns={visibleColumns}
            onToggleColumn={(key) =>
              setVisibleColumns((prev) => ({
                ...prev,
                [key]: !prev[key as keyof typeof visibleColumns],
              }))
            }
            rowDensity={rowDensity}
            onChangeDensity={setRowDensity}
            totalItems={filteredProducts.length}
            pageSize={pageSize}
            onChangePageSize={setPageSize}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
              <tr>
                <th className="w-10 px-4 py-3 text-left"></th>
                <th className="px-6 py-3 text-left text-label-caps font-bold text-text-muted font-sans">
                  Product Name
                </th>
                {visibleColumns.category && (
                  <th className="px-6 py-3 text-left text-label-caps font-bold text-text-muted font-sans">
                    Category
                  </th>
                )}
                {visibleColumns.basePrice && (
                  <th className="px-6 py-3 text-right text-label-caps font-bold text-text-muted font-sans">
                    Base Price
                  </th>
                )}
                {visibleColumns.status && (
                  <th className="px-6 py-3 text-center text-label-caps font-bold text-text-muted font-sans">
                    Status
                  </th>
                )}
                {visibleColumns.actions && (
                  <th className="px-6 py-3 text-center text-label-caps font-bold text-text-muted font-sans">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e2d8]">
              {isLoading ? (
                <tr>
                  <td colSpan={activeColSpan} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                    <span className="material-symbols-outlined animate-spin text-[#ae001a] text-4xl block mb-2 mx-auto select-none">
                      sync
                    </span>
                    <p className="text-secondary text-body-md mt-2 font-sans">Loading product catalog...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={activeColSpan} className="px-6 py-12 text-center text-[#ba1a1a] font-sans bg-white">
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
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={activeColSpan} className="px-6 py-12 text-center text-secondary font-sans bg-white">
                    <span className="material-symbols-outlined text-secondary text-5xl block mb-2 mx-auto select-none">
                      inventory_2
                    </span>
                    <p className="font-bold text-[#222222] uppercase text-sm">No products found</p>
                    <p className="text-xs text-[#666666] mt-1">Click 'Add Product' to start building your catalog.</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={activeColSpan} className="px-6 py-8 text-center text-secondary italic font-sans bg-white">
                      No products match the selected filters.
                    </td>
                  </tr>
                ) : (
                  displayedProducts.map((product) => {
                    const isInactive = !product.isActive;
                    const isExpanded = !!expandedProducts[product.id];
                    return (
                      <React.Fragment key={product.id}>
                        <tr
                          className={`category-row group transition-colors ${
                            isInactive ? 'bg-[#f8f3eb]/40 opacity-75' : 'hover:bg-[#f8f3eb]'
                          }`}
                        >
                          <td className="px-4 py-4 text-center">
                            <button
                              onClick={() => setExpandedProducts(prev => ({
                                ...prev,
                                [product.id]: !prev[product.id]
                              }))}
                              className="text-secondary hover:text-[#ae001a] transition-colors cursor-pointer"
                              title={isExpanded ? 'Colapsar detalles' : 'Expandir variantes y modificadores'}
                            >
                              <span className="material-symbols-outlined text-[20px] align-middle select-none">
                                {isExpanded ? 'keyboard_arrow_down' : 'keyboard_arrow_right'}
                              </span>
                            </button>
                          </td>
                          <td className={`${getDensityPadding()} flex items-center gap-3`}>
                            <div className={`w-1 h-8 rounded-full ${isInactive ? 'bg-zinc-400' : 'bg-[#ae001a]'}`}></div>
                            <div>
                              <p className={`font-bold text-[#1d1c17] font-sans ${isInactive ? 'line-through' : ''}`}>
                                {product.name}
                              </p>
                              <p className={`text-[11px] text-secondary font-mono tracking-wider ${isInactive ? 'line-through' : ''}`}>
                                SKU: {product.sku}
                              </p>
                            </div>
                          </td>

                          {visibleColumns.category && (
                            <td className={`${getDensityPadding()} text-body-md text-[#1d1c17] font-sans ${isInactive ? 'line-through' : ''}`}>
                              {product.category ? product.category.name : 'No Category'}
                            </td>
                          )}

                          {visibleColumns.basePrice && (
                            <td className={`${getDensityPadding()} text-right font-mono font-bold text-[#1d1c17] ${isInactive ? 'line-through' : ''}`}>
                              {formatPrice(product.basePrice)}
                            </td>
                          )}

                          {visibleColumns.status && (
                            <td className={`${getDensityPadding()} text-center`}>
                              <span
                                className={`text-[10px] px-2.5 py-0.5 font-bold rounded uppercase font-sans ${
                                  product.isActive
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-zinc-200 text-[#5f5e5e]'
                                }`}
                              >
                                {product.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                          )}

                          {visibleColumns.actions && (
                            <td className={`${getDensityPadding()} text-center`}>
                              <div className="flex justify-center gap-3">
                                <button
                                  onClick={() => handleOpenEditModal(product)}
                                  className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                                  title="Editar producto"
                                >
                                  <span className="material-symbols-outlined text-[20px]">edit</span>
                                </button>
                                <button
                                  onClick={() => void handleToggleActive(product)}
                                  className="p-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors cursor-pointer"
                                  title={product.isActive ? "Desactivar producto" : "Activar producto"}
                                >
                                  <span className="material-symbols-outlined text-[20px]">
                                    {product.isActive ? 'block' : 'check_circle_outline'}
                                  </span>
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>

                        {isExpanded && (
                          <tr className="bg-[#fcfbfa]/80">
                            <td colSpan={activeColSpan} className="px-12 py-5 border-t border-b border-[#e8e2d8]/60">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Variantes */}
                                <div className="space-y-3">
                                  <h4 className="text-[11px] font-bold text-[#ae001a] uppercase tracking-wider flex items-center gap-1.5 font-sans">
                                    <span className="material-symbols-outlined text-[16px]">layers</span>
                                    VARIANTS ({product.variants?.length || 0})
                                  </h4>
                                  {product.variants && product.variants.length > 0 ? (
                                    <div className="border border-[#e8e2d8] rounded overflow-hidden bg-white shadow-sm">
                                      <table className="w-full text-xs font-sans">
                                        <thead className="bg-[#ece8e0]/40">
                                          <tr className="border-b border-[#e8e2d8]">
                                            <th className="px-3 py-2 text-left font-bold text-secondary">Name</th>
                                            <th className="px-3 py-2 text-left font-bold text-secondary">SKU</th>
                                            <th className="px-3 py-2 text-right font-bold text-secondary">Price</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#e8e2d8]/50">
                                          {product.variants.map((v) => (
                                            <tr key={v.id} className="hover:bg-zinc-50/50">
                                              <td className="px-3 py-2 font-medium text-[#1d1c17]">{v.name}</td>
                                              <td className="px-3 py-2 font-mono text-[#5f5e5e]">{v.sku}</td>
                                              <td className="px-3 py-2 text-right font-mono font-bold text-[#1d1c17]">
                                                {formatPrice(v.price)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-secondary italic pl-1 font-sans">
                                      No variants defined for this item.
                                    </p>
                                  )}
                                </div>

                                {/* Modificadores */}
                                <div className="space-y-3">
                                  <h4 className="text-[11px] font-bold text-[#ae001a] uppercase tracking-wider flex items-center gap-1.5 font-sans">
                                    <span className="material-symbols-outlined text-[16px]">tune</span>
                                    MODIFIERS ({product.modifiers?.length || 0})
                                  </h4>
                                  {product.modifiers && product.modifiers.length > 0 ? (
                                    <div className="border border-[#e8e2d8] rounded overflow-hidden bg-white shadow-sm">
                                      <table className="w-full text-xs font-sans">
                                        <thead className="bg-[#ece8e0]/40">
                                          <tr className="border-b border-[#e8e2d8]">
                                            <th className="px-3 py-2 text-left font-bold text-secondary">Name</th>
                                            <th className="px-3 py-2 text-right font-bold text-secondary">Extra Cost</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#e8e2d8]/50">
                                          {product.modifiers.map((m) => (
                                            <tr key={m.id} className="hover:bg-zinc-50/50">
                                              <td className="px-3 py-2 font-medium text-[#1d1c17]">{m.name}</td>
                                              <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">
                                                +{formatPrice(m.priceDelta)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-secondary italic pl-1 font-sans">
                                      No modifiers linked to this product.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )
              )}
            </tbody>
          </table>
        </div>

        {/* Pie de Tabla (Sólo si hay paginación activa) */}
        {filteredProducts.length > pageSize && pageSize < 9999 && (
          <div className="p-4 bg-[#fcfbfa] border-t border-[#e8e2d8] flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-secondary font-sans">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#1d1c17]">
                Showing {displayedProducts.length} of {filteredProducts.length} products
              </span>
              <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-300 font-mono font-bold">
                Limit: {pageSize} per page
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider">Rows per page:</span>
              <div className="flex items-center gap-1 bg-[#f2ede5] p-0.5 rounded border border-[#e8e2d8]">
                {[5, 10, 25, 50]
                  .filter(t => t <= filteredProducts.length || t === 5)
                  .map((limit) => (
                    <button
                      key={limit}
                      type="button"
                      onClick={() => setPageSize(limit)}
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                        pageSize === limit && pageSize < filteredProducts.length
                          ? 'bg-white text-[#ae001a] shadow-xs border border-[#e8e2d8]'
                          : 'text-[#5f5e5e] hover:text-[#1c1b16]'
                      }`}
                    >
                      {limit}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => setPageSize(9999)}
                  className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    pageSize >= filteredProducts.length || pageSize === 9999
                      ? 'bg-white text-[#ae001a] shadow-xs border border-[#e8e2d8]'
                      : 'text-[#5f5e5e] hover:text-[#1c1b16]'
                  }`}
                >
                  All
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Interactivo de Add / Edit Product */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
          <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col">
            <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
              <span className="font-bold text-label-caps uppercase tracking-wider font-sans">
                {modalMode === 'add' ? 'Add Product' : 'Edit Product'}
              </span>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSaveProduct} className="flex-1 flex flex-col min-h-0">
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                  Product Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-sans"
                  placeholder="e.g., Coca-Cola, Pepperoni Pizza"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                  SKU
                </label>
                <input
                  type="text"
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-sans"
                  placeholder="e.g., BEV-COCA-01"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                  Base Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono"
                  placeholder="e.g., 2.50"
                  required
                  min="0.01"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#5f5e5e] uppercase font-sans">
                  Category
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-sans"
                >
                  <option value="NULL">None (No Category)</option>
                  {categories.map((cat) => (
                     <option key={cat.id} value={cat.id}>
                       {cat.name}
                     </option>
                  ))}
                </select>
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
                  SAVE PRODUCT
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
      {isConfirmModalOpen && confirmTargetProduct && (
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
                confirmTargetProduct.isActive 
                  ? 'bg-red-50 border border-red-100 text-[#ae001a]'
                  : 'bg-emerald-50 border border-emerald-100 text-emerald-600'
              }`}>
                <span className="material-symbols-outlined text-2xl block">
                  {confirmTargetProduct.isActive ? 'power_settings_new' : 'check_circle'}
                </span>
              </div>
              <div className="space-y-2">
                <h3 className="text-body-md font-bold text-zinc-900 font-sans">
                  {confirmTargetProduct.isActive ? 'Confirm Deactivation' : 'Confirm Activation'}
                </h3>
                <p className="text-body-xs text-zinc-500 leading-relaxed font-sans">
                  Are you sure you want to {confirmTargetProduct.isActive ? 'deactivate' : 'activate'} this product? This action will set the status to {confirmTargetProduct.isActive ? 'inactive' : 'active'}.
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
                  confirmTargetProduct.isActive
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
                  <span>{confirmTargetProduct.isActive ? 'Deactivate' : 'Activate'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Quick Links Hub */}
      <CatalogQuickLinks current="products" onNavigate={onNavigate} />
    </div>
  );
};

export default ProductsView;
