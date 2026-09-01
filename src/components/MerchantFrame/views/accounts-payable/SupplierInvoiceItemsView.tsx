import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  SupplierInvoice,
  SupplierInvoiceItem,
  InvoiceProductRef,
  CreateSupplierInvoiceItemDto,
  UpdateSupplierInvoiceItemDto,
} from '../../../../types/accounts-payable';
import { AccountsPayableQuickLinks } from './AccountsPayableQuickLinks';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormFooter } from '../../shared/AppModal';
import { Toast } from '../../shared/Toast';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// ---- Helpers ----

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Cantidad y precio unitario se muestran con hasta 4 decimales; el dinero con 2.
// Cantidad: hasta 4 decimales de precisión pero SIN ceros finales (10.0000 → 10, 10.25 → 10.25).
const formatQty = (v: number | string | null | undefined): string => String(parseFloat(num(v).toFixed(4)));
// Dinero: SIEMPRE 2 decimales.
const formatCurrency = (v: number | string | null | undefined): string =>
  `$${num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Bloqueo de auditoría: no se pueden mutar líneas si la factura padre tiene pagos o está saldada.
const parentLocked = (inv?: SupplierInvoice): boolean =>
  !!inv && (num(inv.paid_amount) > 0 || inv.status === 'paid');

// ========================= FORM DRAWER (ADD / EDIT LINE) =========================

interface ItemFormDrawerProps {
  mode: 'create' | 'edit';
  initial?: SupplierInvoiceItem;
  invoices: SupplierInvoice[];
  products: InvoiceProductRef[];
  lockedInvoiceIds: Set<number>;
  submitting: boolean;
  fixedInvoiceId?: number;
  onCancel: () => void;
  onSubmit: (dto: CreateSupplierInvoiceItemDto | UpdateSupplierInvoiceItemDto) => void;
}

const ItemFormDrawer: React.FC<ItemFormDrawerProps> = ({
  mode,
  initial,
  invoices,
  products,
  lockedInvoiceIds,
  submitting,
  fixedInvoiceId,
  onCancel,
  onSubmit,
}) => {
  const [invoiceId, setInvoiceId] = useState<string>(
    initial ? String(initial.invoice_id) : fixedInvoiceId ? String(fixedInvoiceId) : '',
  );
  const [productId, setProductId] = useState<string>(initial?.product_id ? String(initial.product_id) : '');
  const [variantId, setVariantId] = useState<string>(initial?.variant_id ? String(initial.variant_id) : '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [quantity, setQuantity] = useState(initial ? String(num(initial.quantity)) : '');
  const [unitPrice, setUnitPrice] = useState(initial ? String(num(initial.unit_price)) : '');
  const [taxAmount, setTaxAmount] = useState(initial ? String(num(initial.tax_amount)) : '0');

  // Producto seleccionado y sus variantes activas. El backend exige variant_id
  // cuando se vincula un producto, así que se obliga a elegir variante.
  const selectedProduct = productId ? products.find((p) => String(p.id) === productId) ?? null : null;
  const productVariants = (selectedProduct?.variants ?? []).filter((v) => v.isActive !== false);
  const productHasNoVariants = !!selectedProduct && productVariants.length === 0;

  // Aritmética de línea en tiempo real.
  const lineSubtotal = round2(num(quantity) * num(unitPrice));
  const lineTotal = round2(lineSubtotal + num(taxAmount));

  const selectedInvoiceLocked = invoiceId ? lockedInvoiceIds.has(Number(invoiceId)) : false;
  const invoiceLockedInEdit = mode === 'edit' && initial ? lockedInvoiceIds.has(initial.invoice_id) : false;
  const locked = selectedInvoiceLocked || invoiceLockedInEdit;

  const fieldsValid =
    invoiceId.trim().length > 0 &&
    description.trim().length > 0 &&
    description.length <= 255 &&
    quantity.trim().length > 0 &&
    num(quantity) > 0 &&
    unitPrice.trim().length > 0 &&
    num(unitPrice) >= 0 &&
    // Si se elige un producto de inventario, es obligatorio elegir una variante
    // (product_id y variant_id deben ir juntos, o ninguno).
    (!productId || variantId.trim().length > 0);

  // En edición, no permitir guardar si nada cambió respecto a la línea original.
  const isUnchanged =
    mode === 'edit' &&
    !!initial &&
    description.trim() === initial.description &&
    num(quantity) === num(initial.quantity) &&
    num(unitPrice) === num(initial.unit_price) &&
    num(taxAmount) === num(initial.tax_amount) &&
    (productId ? Number(productId) : null) === (initial.product_id ?? null) &&
    (variantId ? Number(variantId) : null) === (initial.variant_id ?? null);

  const canSubmit = fieldsValid && !isUnchanged;

  const handleProductChange = (value: string) => {
    setProductId(value);
    if (!value) {
      setVariantId('');
      return;
    }
    const product = products.find((p) => String(p.id) === value);
    if (product) {
      // Auto-rellena descripción y precio unitario con el último costo del producto.
      setDescription(product.name);
      if (product.last_cost !== null && product.last_cost !== undefined) {
        setUnitPrice(String(num(product.last_cost)));
      }
      // Auto-selecciona la variante si el producto tiene exactamente una activa.
      const active = (product.variants ?? []).filter((v) => v.isActive !== false);
      setVariantId(active.length === 1 ? String(active[0].id) : '');
    } else {
      setVariantId('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting || locked) return;

    // El backend exige product_id y variant_id juntos (o ninguno). Solo se vincula
    // inventario cuando ambos están presentes.
    const linkingInventory = !!productId && !!variantId;
    const base = {
      description: description.trim(),
      quantity: num(quantity),
      unit_price: num(unitPrice),
      tax_amount: num(taxAmount),
      // El backend exige line_subtotal y line_total en el body (los calculamos aquí).
      line_subtotal: lineSubtotal,
      line_total: lineTotal,
      product_id: linkingInventory ? Number(productId) : null,
      variant_id: linkingInventory ? Number(variantId) : null,
    };

    if (mode === 'create') {
      onSubmit({ invoice_id: Number(invoiceId), ...base });
    } else {
      onSubmit(base);
    }
  };

  const invoiceSelectDisabled = mode === 'edit' || fixedInvoiceId !== undefined;

  useModalDismiss(onCancel);

  return (
    <AppModal
      title={mode === 'create' ? 'Add Item' : 'Edit Item'}
      subtitle="Accounts Payable"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
      closeAriaLabel="Close item form"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-left">
            {locked && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded text-xs">
                <span className="material-symbols-outlined text-base">lock</span>
                <span>
                  The parent invoice has recorded payments. Line items cannot be added, edited, or
                  deleted to preserve settled liabilities.
                </span>
              </div>
            )}

            {/* Parent invoice */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="item-invoice" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Parent Invoice <span className="text-[#ae001a]">*</span>
              </label>
              <select
                id="item-invoice"
                autoFocus={!invoiceSelectDisabled}
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                disabled={invoiceSelectDisabled}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full disabled:bg-[#f2ede5] disabled:cursor-not-allowed"
              >
                <option value="">Select an invoice…</option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number} — {inv.supplier?.name ?? `Supplier #${inv.supplier_id}`}
                  </option>
                ))}
                {initial?.invoice && !invoices.some((inv) => inv.id === initial.invoice_id) && (
                  <option value={initial.invoice_id}>{initial.invoice.invoice_number}</option>
                )}
              </select>
            </div>

            {/* Product (optional) */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="item-product" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Inventory Product (optional)
              </label>
              <select
                id="item-product"
                value={productId}
                onChange={(e) => handleProductChange(e.target.value)}
                disabled={locked}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full disabled:bg-[#f2ede5] disabled:cursor-not-allowed"
              >
                <option value="">Unmapped / Direct Expense</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.sku ? ` (${p.sku})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Variant (required when a product is linked) */}
            {productId && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="item-variant" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Variant <span className="text-[#ae001a]">*</span>
                </label>
                {productHasNoVariants ? (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded text-xs">
                    <span className="material-symbols-outlined text-base">warning</span>
                    <span>
                      This product has no active variants, so it can’t be linked to inventory. Choose
                      “Unmapped / Direct Expense”, or add a variant to the product first.
                    </span>
                  </div>
                ) : (
                  <select
                    id="item-variant"
                    value={variantId}
                    onChange={(e) => setVariantId(e.target.value)}
                    disabled={locked}
                    className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full disabled:bg-[#f2ede5] disabled:cursor-not-allowed"
                  >
                    <option value="">Select a variant…</option>
                    {productVariants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.sku ? ` (${v.sku})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="item-description" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Description <span className="text-[#ae001a]">*</span>
              </label>
              <input
                id="item-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={locked}
                maxLength={300}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full disabled:bg-[#f2ede5] disabled:cursor-not-allowed"
                placeholder="e.g., Premium coffee beans, 1kg bag"
              />
              <span className={`text-[11px] ${description.length > 255 ? 'text-[#ae001a] font-bold' : 'text-[#5f5e5e]'}`}>
                {description.length}/255
              </span>
            </div>

            {/* Quantity + unit price */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="item-quantity" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Quantity <span className="text-[#ae001a]">*</span>
                </label>
                <input
                  id="item-quantity"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={locked}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono disabled:bg-[#f2ede5] disabled:cursor-not-allowed"
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="item-unit-price" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Unit Price <span className="text-[#ae001a]">*</span>
                </label>
                <input
                  id="item-unit-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  disabled={locked}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono disabled:bg-[#f2ede5] disabled:cursor-not-allowed"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Tax amount */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="item-tax-amount" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Tax Amount
              </label>
              <input
                id="item-tax-amount"
                type="number"
                step="0.01"
                min="0"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
                disabled={locked}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono disabled:bg-[#f2ede5] disabled:cursor-not-allowed"
                placeholder="0.00"
              />
            </div>

            {/* Live computed totals */}
            <div className="bg-[#222222] text-white rounded p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Line Subtotal</span>
                <span className="text-sm font-bold font-mono" data-testid="line-subtotal-preview">
                  {formatCurrency(lineSubtotal)}
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-white/10 pt-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Line Total</span>
                <span className="text-lg font-black font-mono" data-testid="line-total-preview">
                  {formatCurrency(lineTotal)}
                </span>
              </div>
            </div>

          <ModalFormFooter
            onCancel={onCancel}
            submitLabel={submitting ? 'Saving…' : 'Save Item'}
            isSubmitting={submitting}
            submitDisabled={!canSubmit || locked}
          />
        </form>
    </AppModal>
  );
};

// ========================= DELETE CONFIRM DIALOG =========================

interface ConfirmDeleteItemDialogProps {
  item: SupplierInvoiceItem;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmDeleteItemDialog: React.FC<ConfirmDeleteItemDialogProps> = ({
  item,
  submitting,
  onCancel,
  onConfirm,
}) => {
  useModalDismiss(onCancel);
  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[10000] flex justify-center items-center p-4 font-sans">
      <div className="absolute inset-0" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete Line Item"
        className="relative bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-sm p-6 text-left"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-red-50 border border-red-100 text-[#ae001a]">
            <span className="material-symbols-outlined text-2xl">delete</span>
          </div>
          <div className="space-y-2">
            <p className="font-bold text-[#1d1c17]">Delete this line item?</p>
            <p className="text-sm text-[#5f5e5e] leading-relaxed">
              &quot;{item.description}&quot; will be soft-deleted and the parent invoice totals will be
              recalculated.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onConfirm}
            className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] disabled:opacity-40 text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
          >
            {submitting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ========================= MAIN VIEW =========================

interface SupplierInvoiceItemsViewProps {
  onNavigate?: (view: string) => void;
  companyId?: number;
  invoiceId?: number; // Cuando se accede desde una factura específica.
}

export const SupplierInvoiceItemsView: React.FC<SupplierInvoiceItemsViewProps> = ({
  onNavigate,
  companyId,
  invoiceId,
}) => {
  const activeCompanyId = companyId ?? 1;

  const [items, setItems] = useState<SupplierInvoiceItem[]>([]);
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [products, setProducts] = useState<InvoiceProductRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [invoiceFilter, setInvoiceFilter] = useState<string>(invoiceId ? String(invoiceId) : '');

  // Modales / drawers
  const [formDrawer, setFormDrawer] = useState<null | { mode: 'create' | 'edit'; item?: SupplierInvoiceItem }>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [deletingItem, setDeletingItem] = useState<SupplierInvoiceItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const authHeaders = (): Record<string, string> => {
    const token = getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const handleUnauthorized = () => {
    clearAuthSession();
    window.location.href = '/login';
  };

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      // El scoping por empresa lo resuelve el backend vía JWT.
      const res = await fetch(
        `${API_BASE}/supplier-invoice-items?limit=100`,
        { headers: authHeaders() },
      );
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) throw new Error('Error al cargar las líneas de factura');
      const json = await res.json();
      const active = (json.data ?? []).filter((it: SupplierInvoiceItem) => !it.deleted_at);
      setItems(active);
    } catch (err) {
      console.error('Error fetching invoice items:', err);
      setError('Failed to load invoice line items. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoices = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/supplier-invoices?limit=100`,
        { headers: authHeaders() },
      );
      if (!res.ok) return;
      const json = await res.json();
      setInvoices((json.data ?? []).filter((inv: SupplierInvoice) => !inv.deleted_at));
    } catch (err) {
      console.error('Error fetching invoices for items view:', err);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API_BASE}/products?limit=100`, { headers: authHeaders() });
      if (!res.ok) return;
      const json = await res.json();
      setProducts(json.data ?? []);
    } catch (err) {
      console.error('Error fetching products for items view:', err);
    }
  };

  useEffect(() => {
    fetchItems();
    fetchInvoices();
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  // Mapa id→factura para determinar el bloqueo por pago y resolver números de factura.
  const invoiceMap = useMemo(() => {
    const map = new Map<number, SupplierInvoice>();
    invoices.forEach((inv) => map.set(inv.id, inv));
    return map;
  }, [invoices]);

  // Mapa id→producto para resolver nombre/SKU (el backend devuelve la línea plana).
  const productMap = useMemo(() => {
    const map = new Map<number, InvoiceProductRef>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  const resolveProduct = (item: SupplierInvoiceItem): InvoiceProductRef | null =>
    item.product ?? (item.product_id != null ? productMap.get(item.product_id) ?? null : null);

  const lockedInvoiceIds = useMemo(() => {
    const set = new Set<number>();
    invoices.forEach((inv) => {
      if (parentLocked(inv)) set.add(inv.id);
    });
    return set;
  }, [invoices]);

  // Tras cualquier mutación de línea, la factura padre debe recalcular sus totales.
  // Re-obtenemos la factura para reflejar subtotal, tax_total, total_amount y balance_due.
  const refreshParentInvoice = async (parentId: number) => {
    try {
      const res = await fetch(`${API_BASE}/supplier-invoices/${parentId}`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
      if (json.data) {
        setInvoices((prev) => {
          const exists = prev.some((inv) => inv.id === json.data.id);
          return exists
            ? prev.map((inv) => (inv.id === json.data.id ? json.data : inv))
            : [...prev, json.data];
        });
      }
    } catch (err) {
      console.error('Error refreshing parent invoice totals:', err);
    }
  };

  const resolveInvoiceNumber = (item: SupplierInvoiceItem): string =>
    item.invoice?.invoice_number ?? invoiceMap.get(item.invoice_id)?.invoice_number ?? `#${item.invoice_id}`;

  const invoiceOptions = useMemo(() => {
    const map = new Map<number, string>();
    invoices.forEach((inv) => map.set(inv.id, inv.invoice_number));
    items.forEach((it) => {
      if (!map.has(it.invoice_id)) {
        map.set(it.invoice_id, it.invoice?.invoice_number ?? `#${it.invoice_id}`);
      }
    });
    return Array.from(map.entries())
      .map(([id, number]) => ({ id, number }))
      .sort((a, b) => a.number.localeCompare(b.number));
  }, [invoices, items]);

  const filteredItems = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return items.filter((it) => {
      if (term) {
        const haystack = [it.description, resolveProduct(it)?.name ?? '', resolveInvoiceNumber(it)]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (inventoryFilter === 'mapped' && it.product_id === null) return false;
      if (inventoryFilter === 'unmapped' && it.product_id !== null) return false;
      if (invoiceFilter && String(it.invoice_id) !== invoiceFilter) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, searchQuery, inventoryFilter, invoiceFilter, invoiceMap]);

  const hasActiveFilter = Boolean(searchQuery || inventoryFilter !== 'all' || invoiceFilter);
  const clearFilters = () => {
    setSearchQuery('');
    setInventoryFilter('all');
    setInvoiceFilter(invoiceId ? String(invoiceId) : '');
  };

  const handleCreateSubmit = async (dto: CreateSupplierInvoiceItemDto) => {
    setFormSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/supplier-invoice-items`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(dto),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to add line item');
      setItems((prev) => [json.data, ...prev]);
      setFormDrawer(null);
      setToast({ message: 'Line item added successfully', type: 'success' });
      await refreshParentInvoice(dto.invoice_id);
    } catch (err: any) {
      setFormDrawer(null);
      setToast({ message: err.message || 'Failed to add line item', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (item: SupplierInvoiceItem, dto: UpdateSupplierInvoiceItemDto) => {
    setFormSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/supplier-invoice-items/${item.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(dto),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to update line item');
      setItems((prev) => prev.map((it) => (it.id === json.data.id ? json.data : it)));
      setFormDrawer(null);
      setToast({ message: 'Line item updated successfully', type: 'success' });
      await refreshParentInvoice(item.invoice_id);
    } catch (err: any) {
      setFormDrawer(null);
      setToast({ message: err.message || 'Failed to update line item', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/supplier-invoice-items/${deletingItem.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to delete line item');
      }
      const parentId = deletingItem.invoice_id;
      setItems((prev) => prev.filter((it) => it.id !== deletingItem.id));
      setDeletingItem(null);
      setToast({ message: 'Line item deleted successfully', type: 'success' });
      await refreshParentInvoice(parentId);
    } catch (err: any) {
      setDeletingItem(null);
      setToast({ message: err.message || 'Failed to delete line item', type: 'error' });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const isTrueEmpty = !loading && !error && items.length === 0;
  const isFilteredEmpty = !loading && !error && items.length > 0 && filteredItems.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchItems}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      {/* Section title */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase">Invoice Line Items</h2>
        <p className="text-[#5f5e5e] text-body-sm mt-1">
          Review product costs, verify high-precision unit rates, inspect tax distributions, and audit
          inventory catalog mappings across itemized vendor bill lines.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by description, product, or invoice #..."
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
              aria-label="Search invoice line items"
            />
          </div>
          <select
            value={inventoryFilter}
            onChange={(e) => setInventoryFilter(e.target.value as 'all' | 'mapped' | 'unmapped')}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
            aria-label="Filter by inventory link"
          >
            <option value="all">All Items</option>
            <option value="mapped">Mapped to Inventory</option>
            <option value="unmapped">Unmapped / Direct Expense</option>
          </select>
          <select
            value={invoiceFilter}
            onChange={(e) => setInvoiceFilter(e.target.value)}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none min-w-[150px]"
            aria-label="Filter by parent invoice"
          >
            <option value="">All Invoices</option>
            {invoiceOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.number}
              </option>
            ))}
          </select>
          {!isTrueEmpty && (
            <button
              type="button"
              onClick={() => setFormDrawer({ mode: 'create' })}
              className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Add Item
            </button>
          )}
        </div>
        {hasActiveFilter && (
          <div className="flex items-center">
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* True empty state */}
      {isTrueEmpty && (
        <div
          data-testid="supplier-invoice-items-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">list_alt</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No itemized invoice lines found. Click &apos;Add Item&apos; or select a Supplier Invoice to
            view detailed line breakdowns.
          </p>
          <button
            type="button"
            onClick={() => setFormDrawer({ mode: 'create' })}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add Item
          </button>
        </div>
      )}

      {/* Table */}
      {(loading || items.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">INVOICE LINE ITEMS</span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredItems.length} lines`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Invoice
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Description &amp; Item
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Qty × Unit Price
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Tax
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Subtotal / Total
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, c) => (
                        <td key={c} className="px-6 py-4">
                          <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                        <p className="text-sm text-[#5f5e5e]">No line items match your active filters</p>
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="text-[#ae001a] text-sm font-semibold hover:underline"
                        >
                          Clear filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((it) => {
                    const locked = lockedInvoiceIds.has(it.invoice_id);
                    return (
                      <tr key={it.id} className="group hover:bg-[#f8f3eb] transition-colors">
                        {/* Parent invoice link */}
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            onClick={() => onNavigate?.('supplier-invoices')}
                            className="font-mono font-bold text-[#ae001a] hover:underline transition-colors duration-200 flex items-center gap-1"
                            title="Go to parent invoice"
                          >
                            <span className="material-symbols-outlined text-[14px]">description</span>
                            {resolveInvoiceNumber(it)}
                          </button>
                        </td>

                        {/* Description + inventory badge */}
                        <td className="px-6 py-4">
                          <p className="font-semibold text-[#1d1c17]">{it.description}</p>
                          {it.product_id !== null ? (
                            <span className="inline-flex items-center gap-1 mt-1 bg-blue-500/10 text-blue-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                              <span className="material-symbols-outlined text-[12px]">inventory_2</span>
                              {resolveProduct(it)?.name ?? `Product #${it.product_id}`}
                              {resolveProduct(it)?.sku ? ` · ${resolveProduct(it)?.sku}` : ''}
                            </span>
                          ) : (
                            <span className="inline-block mt-1 text-[10px] font-bold uppercase text-[#5f5e5e] italic">
                              Direct Expense
                            </span>
                          )}
                        </td>

                        {/* Qty × unit price — cantidad con precisión (sin ceros de más), precio como dinero (2 dec) */}
                        <td className="px-6 py-4 text-right whitespace-nowrap font-mono text-sm text-[#1d1c17]">
                          {formatQty(it.quantity)}
                          <span className="text-[#5f5e5e]"> @ </span>{formatCurrency(it.unit_price)}
                        </td>

                        {/* Tax */}
                        <td className="px-6 py-4 text-right whitespace-nowrap text-sm text-[#5f5e5e]">
                          {formatCurrency(it.tax_amount)}
                        </td>

                        {/* Subtotal / total (2 decimals) */}
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <p className="text-xs text-[#5f5e5e]">{formatCurrency(it.line_subtotal)}</p>
                          <p className="text-sm font-bold text-[#1d1c17]">{formatCurrency(it.line_total)}</p>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => setFormDrawer({ mode: 'edit', item: it })}
                              aria-label="Edit line item"
                              disabled={locked}
                              title={locked ? 'Parent invoice is settled — locked' : 'Edit line item'}
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-[#1d1c17]"
                            >
                              <span className="material-symbols-outlined text-[20px]">edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingItem(it)}
                              aria-label="Delete line item"
                              disabled={locked}
                              title={locked ? 'Parent invoice is settled — locked' : 'Delete line item'}
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-[#1d1c17]"
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
      )}

      <AccountsPayableQuickLinks active="items" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={() => setFormDrawer({ mode: 'create' })}
        aria-label="Quick create line item"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-40"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {formDrawer && (
        <ItemFormDrawer
          mode={formDrawer.mode}
          initial={formDrawer.item}
          invoices={invoices}
          products={products}
          lockedInvoiceIds={lockedInvoiceIds}
          submitting={formSubmitting}
          fixedInvoiceId={invoiceId}
          onCancel={() => setFormDrawer(null)}
          onSubmit={(dto) =>
            formDrawer.mode === 'create'
              ? handleCreateSubmit(dto as CreateSupplierInvoiceItemDto)
              : handleEditSubmit(formDrawer.item!, dto as UpdateSupplierInvoiceItemDto)
          }
        />
      )}

      {deletingItem && (
        <ConfirmDeleteItemDialog
          item={deletingItem}
          submitting={deleteSubmitting}
          onCancel={() => setDeletingItem(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

export default SupplierInvoiceItemsView;
