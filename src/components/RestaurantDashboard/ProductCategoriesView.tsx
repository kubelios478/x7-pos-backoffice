import React, { useState } from 'react';

interface Category {
  id: string;
  name: string;
  type: 'Root Category' | 'Sub-Category';
  parentId: string;
  linkedProducts: number;
  status: 'Active' | 'Inactive';
}

export const ProductCategoriesView: React.FC = () => {
  // Estado inicial de categorías obtenido del HTML de referencia
  const [categories, setCategories] = useState<Category[]>([
    {
      id: 'CAT_001_BEV',
      name: 'Beverages',
      type: 'Root Category',
      parentId: 'NULL',
      linkedProducts: 142,
      status: 'Active',
    },
    {
      id: 'CAT_002_SFT',
      name: 'Soft Drinks',
      type: 'Sub-Category',
      parentId: 'CAT_001_BEV',
      linkedProducts: 28,
      status: 'Active',
    },
    {
      id: 'CAT_003_MNC',
      name: 'Main Course',
      type: 'Root Category',
      parentId: 'NULL',
      linkedProducts: 310,
      status: 'Active',
    },
    {
      id: 'CAT_004_SEA',
      name: 'Seasonal Specials',
      type: 'Root Category',
      parentId: 'NULL',
      linkedProducts: 0,
      status: 'Inactive',
    },
  ]);

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

  // Eliminar categoría
  const handleDeleteCategory = (id: string) => {
    if (window.confirm('¿Está seguro de que desea eliminar esta categoría?')) {
      setCategories(categories.filter((cat) => cat.id !== id));
    }
  };

  // Guardar Formulario (Add o Edit)
  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert('Por favor, ingresa el nombre de la categoría.');
      return;
    }

    if (modalMode === 'add') {
      const newId = `CAT_${String(categories.length + 1).padStart(3, '0')}_${formName.slice(0, 3).toUpperCase()}`;
      const newCat: Category = {
        id: newId,
        name: formName,
        type: formParent === 'NULL' ? 'Root Category' : 'Sub-Category',
        parentId: formParent,
        linkedProducts: formLinkedProducts,
        status: formStatus,
      };
      setCategories([...categories, newCat]);
    } else if (modalMode === 'edit' && editingCategoryId) {
      setCategories(
        categories.map((cat) =>
          cat.id === editingCategoryId
            ? {
                ...cat,
                name: formName,
                type: formParent === 'NULL' ? 'Root Category' : 'Sub-Category',
                parentId: formParent,
                status: formStatus,
                linkedProducts: formLinkedProducts,
              }
            : cat
        )
      );
    }

    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
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
        </div>
      </div>

      {/* Tabla Principal */}
      <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded">
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
                <th className="px-6 py-3 text-right text-label-caps font-bold text-[#5f5e5e]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e2d8]">
              {filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-secondary italic">
                    No categories found matching filters.
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
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleOpenEditModal(cat)}
                            className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                            title="Editar categoría"
                          >
                            <span className="material-symbols-outlined text-[20px]">edit</span>
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="p-1 text-[#1d1c17] hover:text-[#ba1a1a] transition-colors"
                            title="Eliminar categoría"
                          >
                            <span className="material-symbols-outlined text-[20px]">delete</span>
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

      {/* Footer Quick Actions */}
      <div className="bg-[#2a2a2a] p-8 flex flex-col md:flex-row justify-between items-center gap-6 rounded shadow-lg mt-4">
        <div className="text-center md:text-left">
          <h3 className="text-white font-bold text-lg">Quick Launch</h3>
          <p className="text-white/60 text-body-sm">
            Operational tools and instant management functions.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <button
            onClick={() => alert('Products List simulation')}
            className="quick-launch-btn px-6 py-3 bg-white text-[#1d1c17] font-bold text-label-caps border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-all"
          >
            PRODUCTS LIST
          </button>
          <button
            onClick={() => alert('Products Dashboard simulation')}
            className="quick-launch-btn px-6 py-3 bg-white text-[#1d1c17] font-bold text-label-caps border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-all"
          >
            PRODUCTS DASHBOARD
          </button>
          <button
            onClick={() => alert('Running Categories Report...')}
            className="quick-launch-btn px-6 py-3 bg-white text-[#1d1c17] font-bold text-label-caps border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-all"
          >
            RUN CATEGORIES REPORT
          </button>
          <button
            onClick={() => alert('Emergency Support simulation')}
            className="px-6 py-3 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#d2272f] transition-colors rounded"
          >
            EMERGENCY SUPPORT
          </button>
        </div>
      </div>

      {/* Modal Interactivo de Add / Edit Category */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="bg-[#222222] p-4 text-white flex justify-between items-center">
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
            <form onSubmit={handleSaveCategory} className="p-6 space-y-4">
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
                <label className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Parent Category
                </label>
                <select
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
                  <label className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                    Linked Products Count
                  </label>
                  <input
                    type="number"
                    value={formLinkedProducts}
                    onChange={(e) => setFormLinkedProducts(Number(e.target.value))}
                    className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-body-md focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                    min="0"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#5f5e5e] uppercase">Status</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-body-sm font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      checked={formStatus === 'Active'}
                      onChange={() => setFormStatus('Active')}
                      className="text-[#ae001a] focus:ring-[#ae001a] border-[#e8e2d8]"
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-body-sm font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      checked={formStatus === 'Inactive'}
                      onChange={() => setFormStatus('Inactive')}
                      className="text-[#ae001a] focus:ring-[#ae001a] border-[#e8e2d8]"
                    />
                    Inactive
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#e8e2d8]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-[#222222] text-[#222222] font-bold text-label-caps hover:bg-zinc-100 transition-colors"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#d2272f] transition-colors"
                >
                  SAVE CATEGORY
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductCategoriesView;
