import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  SupplierPayment,
  SupplierPaymentItem,
  CreateSupplierPaymentItemDto,
  UpdateSupplierPaymentItemDto,
} from '../../../../types/accounts-payable';
import {
  AP_DOCUMENT_TYPES,
  AP_DOCUMENT_TYPE_LABELS,
  documentTypeBadgeStyle,
  documentTypeLabel,
  isPaymentFrozen,
  SUPPLIER_PAYMENT_STATUS_LABELS,
} from '../../../../types/accounts-payable';
import { AccountsPayableQuickLinks } from './AccountsPayableQuickLinks';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormFooter, ModalFormError } from '../../shared/AppModal';
import { Toast } from '../../shared/Toast';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// ---- Helpers ----

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
};

const formatCurrency = (v: number | string | null | undefined): string =>
  `$${num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};

// Motivo por el que un pago congela sus líneas, para explicarlo en la UI.
const frozenReason = (p: SupplierPayment): string =>
  num(p.allocated_amount) > 0
    ? `Locked — this payment already has ${formatCurrency(p.allocated_amount)} allocated.`
    : `Locked — this payment is ${SUPPLIER_PAYMENT_STATUS_LABELS[p.status]}.`;

// ========================= FORM DRAWER (ADD / EDIT) =========================

interface PaymentItemFormDrawerProps {
  mode: 'create' | 'edit';
  initial?: SupplierPaymentItem;
  payments: SupplierPayment[];
  // Pago preseleccionado cuando se entra desde un voucher concreto.
  defaultPaymentId?: number;
  submitting: boolean;
  formError: string;
  authHeaders: () => Record<string, string>;
  onCancel: () => void;
  onSubmit: (dto: CreateSupplierPaymentItemDto | UpdateSupplierPaymentItemDto) => void;
}

const PaymentItemFormDrawer: React.FC<PaymentItemFormDrawerProps> = ({
  mode,
  initial,
  payments,
  defaultPaymentId,
  submitting,
  formError,
  authHeaders,
  onCancel,
  onSubmit,
}) => {
  const [paymentId, setPaymentId] = useState<string>(
    initial ? String(initial.payment_id) : defaultPaymentId ? String(defaultPaymentId) : '',
  );
  const [documentNumber, setDocumentNumber] = useState(initial?.document_number ?? '');
  const [documentType, setDocumentType] = useState<string>(initial?.document_type ?? 'invoice');
  const [amount, setAmount] = useState(initial ? String(num(initial.amount)) : '');
  // Líneas hermanas del pago elegido: necesarias para validar la suma contra el total padre.
  const [siblings, setSiblings] = useState<SupplierPaymentItem[] | null>(null);

  useModalDismiss(onCancel);

  const selectedPayment = payments.find((p) => String(p.id) === paymentId);

  // Solo se pueden capturar líneas contra pagos no inmovilizados. En edición, el pago
  // actual se mantiene listado aunque ya no aparezca en el catálogo cargado.
  const selectablePayments = useMemo(() => {
    const open = payments.filter((p) => !isPaymentFrozen(p));
    if (initial && !open.some((p) => p.id === initial.payment_id)) {
      const current = payments.find((p) => p.id === initial.payment_id);
      if (current) return [current, ...open];
    }
    return open;
  }, [payments, initial]);

  // Traer las líneas vivas del pago seleccionado para calcular el margen disponible.
  useEffect(() => {
    if (!paymentId) {
      setSiblings(null);
      return;
    }
    let cancelled = false;
    setSiblings(null);
    fetch(`${API_BASE}/supplier-payment-items?payment_id=${paymentId}&limit=100`, {
      headers: authHeaders(),
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((json) => {
        if (cancelled) return;
        const list = ((json.data ?? []) as SupplierPaymentItem[]).filter((i) => !i.deleted_at);
        setSiblings(list);
      })
      .catch(() => {
        if (!cancelled) setSiblings([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  const amountNum = num(amount);
  // Suma de las OTRAS líneas del pago (la propia se excluye al editar).
  const otherItemsSum = (siblings ?? [])
    .filter((i) => i.id !== initial?.id)
    .reduce((s, i) => s + num(i.amount), 0);
  const projectedTotal = otherItemsSum + amountNum;
  const parentTotal = num(selectedPayment?.total_amount);
  const remaining = Math.max(0, parentTotal - otherItemsSum);

  const overParentTotal =
    !!selectedPayment && siblings !== null && projectedTotal > parentTotal + 0.001;
  const parentSumError = overParentTotal
    ? `The total amount of payment items (${formatCurrency(projectedTotal)}) cannot exceed the parent payment voucher total (${formatCurrency(parentTotal)}).`
    : '';

  const lockedError =
    selectedPayment && isPaymentFrozen(selectedPayment) ? frozenReason(selectedPayment) : '';

  const canSubmit =
    paymentId.trim().length > 0 &&
    documentNumber.trim().length > 0 &&
    documentNumber.length <= 100 &&
    documentType.trim().length > 0 &&
    amountNum > 0 &&
    !parentSumError &&
    !lockedError;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    onSubmit({
      payment_id: Number(paymentId),
      document_number: documentNumber.trim(),
      document_type: documentType,
      amount: amountNum,
    });
  };

  return (
    <AppModal
      title={mode === 'create' ? 'Add Payment Item' : 'Edit Payment Item'}
      subtitle="Accounts Payable"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
      closeAriaLabel="Close payment item form"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-left font-sans">
        {formError && <ModalFormError message={formError} />}

        {/* Parent payment voucher */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="item-payment" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
            Payment Voucher <span className="text-[#ae001a]">*</span>
          </label>
          <select
            id="item-payment"
            autoFocus
            value={paymentId}
            onChange={(e) => setPaymentId(e.target.value)}
            className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
          >
            <option value="">Select a payment voucher…</option>
            {selectablePayments.map((p) => (
              <option key={p.id} value={p.id}>
                {p.payment_number} · {formatCurrency(p.total_amount)}
              </option>
            ))}
          </select>
          {selectablePayments.length === 0 && (
            <p className="text-[11px] text-[#5f5e5e] italic">
              No editable payment vouchers — every payment is posted, allocated, or voided.
            </p>
          )}
        </div>

        {/* Budget summary against the parent total */}
        {selectedPayment && (
          <div className="grid grid-cols-3 gap-3 bg-[#f5efe6] border border-[#e8e2d8] px-4 py-3 rounded text-center">
            <div>
              <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e]">
                Voucher Total
              </span>
              <span className="text-sm font-black text-[#1c1b16] font-mono">
                {formatCurrency(parentTotal)}
              </span>
            </div>
            <div>
              <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e]">
                Items Recorded
              </span>
              <span className="text-sm font-black text-[#1c1b16] font-mono">
                {siblings === null ? '…' : formatCurrency(otherItemsSum)}
              </span>
            </div>
            <div>
              <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e]">
                Remaining
              </span>
              <span className="text-sm font-black text-[#ae001a] font-mono">
                {siblings === null ? '…' : formatCurrency(remaining)}
              </span>
            </div>
          </div>
        )}

        {lockedError && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded text-xs">
            <span className="material-symbols-outlined text-base">lock</span>
            <span role="alert">{lockedError}</span>
          </div>
        )}

        {/* Document number */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="item-document" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
            Document Number <span className="text-[#ae001a]">*</span>
          </label>
          <input
            id="item-document"
            type="text"
            value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
            maxLength={100}
            className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono"
            placeholder="e.g., INV-2026-0042"
          />
          <span className="text-[11px] text-[#5f5e5e]">{documentNumber.length}/100</span>
        </div>

        {/* Document type + amount */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="item-type" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Document Type <span className="text-[#ae001a]">*</span>
            </label>
            <select
              id="item-type"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
            >
              {AP_DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {AP_DOCUMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="item-amount" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Amount <span className="text-[#ae001a]">*</span>
            </label>
            <input
              id="item-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono"
              placeholder="0.00"
            />
          </div>
        </div>

        {parentSumError && (
          <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
            {parentSumError}
          </p>
        )}

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Saving…' : mode === 'create' ? 'Add Payment Item' : 'Save Payment Item'}
          isSubmitting={submitting}
          submitDisabled={!canSubmit}
        />
      </form>
    </AppModal>
  );
};

// ========================= DETAIL DRAWER =========================

interface PaymentItemDetailDrawerProps {
  item: SupplierPaymentItem;
  payment?: SupplierPayment | null;
  onClose: () => void;
  onViewPayment?: () => void;
}

const PaymentItemDetailDrawer: React.FC<PaymentItemDetailDrawerProps> = ({
  item,
  payment,
  onClose,
  onViewPayment,
}) => {
  useModalDismiss(onClose);
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex justify-end font-sans">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Payment Item Details"
        className="relative w-full max-w-md bg-[#fcfbfa] h-full shadow-2xl z-10 flex flex-col border-l border-[#e8e2d8] animate-slide-in text-left"
      >
        <div className="bg-[#222222] px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-white text-xl">receipt_long</span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-white">
              Payment Item Details
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Close details"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-black text-[#1c1b16] tracking-tight font-mono">
                {item.document_number}
              </h2>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${documentTypeBadgeStyle(item.document_type)}`}
              >
                {documentTypeLabel(item.document_type)}
              </span>
            </div>
            <p className="text-2xl font-black text-[#ae001a] mt-2 font-mono">
              {formatCurrency(item.amount)}
            </p>
          </div>

          <div className="border-t border-[#e8e2d8] pt-5 space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">
              Parent Payment Voucher
            </h4>
            {payment ? (
              <div className="bg-[#f5efe6] border border-[#e8e2d8] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[#1c1b16] font-mono">
                    {payment.payment_number}
                  </span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#ece8e0] text-[#1d1c17]">
                    {SUPPLIER_PAYMENT_STATUS_LABELS[payment.status]}
                  </span>
                </div>
                <p className="text-[11px] text-[#5f5e5e]">{formatDate(payment.payment_date)}</p>
                <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-[#e8e2d8]">
                  <div>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e]">
                      Total
                    </span>
                    <span className="text-xs font-black text-[#1c1b16] font-mono">
                      {formatCurrency(payment.total_amount)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e]">
                      Allocated
                    </span>
                    <span className="text-xs font-black text-green-700 font-mono">
                      {formatCurrency(payment.allocated_amount)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e]">
                      Unallocated
                    </span>
                    <span className="text-xs font-black text-[#ae001a] font-mono">
                      {formatCurrency(
                        Math.max(0, num(payment.total_amount) - num(payment.allocated_amount)),
                      )}
                    </span>
                  </div>
                </div>
                {onViewPayment && (
                  <button
                    type="button"
                    onClick={onViewPayment}
                    className="w-full mt-1 py-2 border border-[#e8e2d8] bg-white text-[11px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                  >
                    Open payment voucher
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#5f5e5e] italic">
                Payment #{item.payment_id} is not in the loaded catalogue.
              </p>
            )}
          </div>
        </div>

        <div className="bg-[#f5efe6] border-t border-[#e8e2d8] px-6 py-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 bg-[#222222] hover:bg-black text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ========================= DELETE CONFIRM DIALOG =========================

interface ConfirmDeleteItemDialogProps {
  item: SupplierPaymentItem;
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
  return (
    <AppModal
      title="Delete Payment Item"
      subtitle="Accounts Payable"
      onClose={onCancel}
      closeDisabled={submitting}
      size="md"
      closeAriaLabel="Close delete confirmation"
    >
      <div className="p-6 space-y-4 text-left font-sans">
        <p className="text-sm text-[#1d1c17]">
          Delete the payment item for{' '}
          <strong className="font-mono">{item.document_number}</strong> (
          {formatCurrency(item.amount)})? The line is archived, not erased — it disappears from
          active grids but stays in the audit trail.
        </p>
        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Deleting…' : 'Delete Item'}
          isSubmitting={submitting}
          submitType="button"
          onSubmit={onConfirm}
          destructive
        />
      </div>
    </AppModal>
  );
};

// ========================= MAIN VIEW =========================

interface SupplierPaymentItemsViewProps {
  onNavigate?: (view: string) => void;
  companyId?: number;
  // Contexto padre: al llegar desde un voucher concreto la grid arranca filtrada.
  payment?: SupplierPayment | null;
  onClearPayment?: () => void;
}

export const SupplierPaymentItemsView: React.FC<SupplierPaymentItemsViewProps> = ({
  onNavigate,
  companyId,
  payment,
  onClearPayment,
}) => {
  const activeCompanyId = companyId ?? 1;

  const [items, setItems] = useState<SupplierPaymentItem[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [documentTypeFilter, setDocumentTypeFilter] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<string>(payment ? String(payment.id) : '');

  const [formDrawer, setFormDrawer] = useState<null | {
    mode: 'create' | 'edit';
    item?: SupplierPaymentItem;
  }>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [detailItem, setDetailItem] = useState<SupplierPaymentItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<SupplierPaymentItem | null>(null);
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
      // El scoping multi-tenant lo aplica el backend con el JWT; el parent context
      // se traduce a un filtro payment_id server-side.
      const url = payment
        ? `${API_BASE}/supplier-payment-items?payment_id=${payment.id}&limit=100`
        : `${API_BASE}/supplier-payment-items?limit=100`;
      const res = await fetch(url, { headers: authHeaders() });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) throw new Error('Error al cargar las líneas de pago');
      const json = await res.json();
      const active = ((json.data ?? []) as SupplierPaymentItem[]).filter((i) => !i.deleted_at);
      setItems(active);
    } catch (err) {
      console.error('Error fetching supplier payment items:', err);
      setError('Failed to load payment items. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  // Catálogo de pagos: resuelve payment_number para la grid y total/status para los locks.
  const fetchPayments = async () => {
    try {
      const res = await fetch(`${API_BASE}/supplier-payments?limit=100`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const json = await res.json();
      setPayments(((json.data ?? []) as SupplierPayment[]).filter((p) => !p.deleted_at));
    } catch (err) {
      console.error('Error fetching payments for payment items:', err);
    }
  };

  useEffect(() => {
    fetchItems();
    fetchPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId, payment?.id]);

  const paymentById = useMemo(() => {
    const map = new Map<number, SupplierPayment>();
    payments.forEach((p) => map.set(p.id, p));
    return map;
  }, [payments]);

  const withPayment = (i: SupplierPaymentItem): SupplierPaymentItem => {
    const parent = paymentById.get(i.payment_id);
    return {
      ...i,
      payment:
        i.payment ??
        (parent ? { id: parent.id, payment_number: parent.payment_number } : null),
    };
  };

  // Opciones del selector de pago padre: los que tienen líneas cargadas.
  const paymentOptions = useMemo(() => {
    const map = new Map<number, string>();
    items.forEach((i) => {
      const parent = paymentById.get(i.payment_id);
      map.set(i.payment_id, parent?.payment_number ?? `Payment #${i.payment_id}`);
    });
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [items, paymentById]);

  const filteredItems = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return items.map(withPayment).filter((i) => {
      if (term) {
        const haystack = [i.document_number, i.payment?.payment_number ?? '']
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (documentTypeFilter && i.document_type !== documentTypeFilter) return false;
      if (paymentFilter && String(i.payment_id) !== paymentFilter) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, payments, searchQuery, documentTypeFilter, paymentFilter]);

  const hasActiveFilter = Boolean(searchQuery || documentTypeFilter || paymentFilter);
  const clearFilters = () => {
    setSearchQuery('');
    setDocumentTypeFilter('');
    setPaymentFilter('');
  };

  const openCreate = () => {
    setFormError('');
    setFormDrawer({ mode: 'create' });
  };

  const handleCreateSubmit = async (dto: CreateSupplierPaymentItemDto) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      const res = await fetch(`${API_BASE}/supplier-payment-items`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(dto),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to add payment item');
      await fetchItems();
      await fetchPayments();
      setFormDrawer(null);
      setToast({ message: 'Payment item added successfully', type: 'success' });
    } catch (err) {
      // El guard de suma padre vive en el backend: se muestra inline sin cerrar el drawer.
      setFormError(err instanceof Error ? err.message : 'Failed to add payment item');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (id: number, dto: UpdateSupplierPaymentItemDto) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      const res = await fetch(`${API_BASE}/supplier-payment-items/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(dto),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to update payment item');
      await fetchItems();
      await fetchPayments();
      setFormDrawer(null);
      setToast({ message: 'Payment item updated successfully', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update payment item');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Posted Payment Immobility Lock: sin pago padre cargado se asume mutable
  // (el backend vuelve a validar de todos modos).
  const isItemLocked = (i: SupplierPaymentItem): boolean => {
    const parent = paymentById.get(i.payment_id);
    return parent ? isPaymentFrozen(parent) : false;
  };

  const lockedTitle = (i: SupplierPaymentItem): string | undefined => {
    const parent = paymentById.get(i.payment_id);
    return parent && isPaymentFrozen(parent) ? frozenReason(parent) : undefined;
  };

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/supplier-payment-items/${deletingItem.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to delete payment item');
      }
      setItems((prev) => prev.filter((i) => i.id !== deletingItem.id));
      setDeletingItem(null);
      setToast({ message: 'Payment item deleted successfully', type: 'success' });
    } catch (err) {
      setDeletingItem(null);
      setToast({
        message: err instanceof Error ? err.message : 'Failed to delete payment item',
        type: 'error',
      });
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
        <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase">
          Payment Items
        </h2>
        <p className="text-[#5f5e5e] text-body-sm mt-1">
          Audit the individual document lines covered by each cash disbursement voucher.
        </p>
      </div>

      {/* Parent context chip */}
      {payment && (
        <div className="bg-[#f5efe6] border border-[#e8e2d8] px-4 py-3 rounded flex items-center gap-3 flex-wrap">
          <span className="material-symbols-outlined text-[#ae001a]">payments</span>
          <span className="text-sm text-[#1d1c17]">
            Showing breakdown items for voucher{' '}
            <strong className="font-mono">{payment.payment_number}</strong>
          </span>
          {onClearPayment && (
            <button
              type="button"
              onClick={onClearPayment}
              className="ml-auto text-[11px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
            >
              View all payment items
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by document # or payment #..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search payment items"
          />
        </div>
        <select
          value={documentTypeFilter}
          onChange={(e) => setDocumentTypeFilter(e.target.value)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by document type"
        >
          <option value="">All Types</option>
          {AP_DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {AP_DOCUMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none min-w-[160px]"
          aria-label="Filter by payment voucher"
        >
          <option value="">All Payments</option>
          {paymentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {!isTrueEmpty && (
          <button
            type="button"
            onClick={openCreate}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              add
            </span>
            Add Payment Item
          </button>
        )}
        {hasActiveFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* True empty state */}
      {isTrueEmpty && (
        <div
          data-testid="supplier-payment-items-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">list_alt</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No payment items found for this record. Click &apos;Add Payment Item&apos; to register
            document payment details.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              add
            </span>
            Add Payment Item
          </button>
        </div>
      )}

      {/* Table */}
      {(loading || items.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              PAYMENT ITEMS
            </span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredItems.length} items`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Parent Payment Voucher
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Target Document
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Document Type
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Amount
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
                      {Array.from({ length: 5 }).map((_, c) => (
                        <td key={c} className="px-6 py-4">
                          <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">
                          search_off
                        </span>
                        <p className="text-sm text-[#5f5e5e]">
                          No payment items match your active filters
                        </p>
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
                  filteredItems.map((i) => {
                    const locked = isItemLocked(i);
                    return (
                      <tr
                        key={i.id}
                        onClick={() => setDetailItem(i)}
                        className="group hover:bg-[#f8f3eb] transition-colors cursor-pointer"
                      >
                        {/* Parent payment voucher — shortcut to the payment header */}
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate?.('supplier-payments');
                            }}
                            className="font-bold text-[#1d1c17] font-mono hover:text-[#ae001a] transition-colors duration-200 hover:underline"
                            title="Open the parent payment voucher"
                          >
                            {i.payment?.payment_number ?? `Payment #${i.payment_id}`}
                          </button>
                        </td>

                        {/* Target document reference */}
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17] font-mono">{i.document_number}</p>
                        </td>

                        {/* Document type badge */}
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${documentTypeBadgeStyle(i.document_type)}`}
                          >
                            {documentTypeLabel(i.document_type)}
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="px-6 py-4 text-right text-sm font-semibold text-[#1d1c17] whitespace-nowrap font-mono">
                          {formatCurrency(i.amount)}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFormError('');
                                setFormDrawer({ mode: 'edit', item: i });
                              }}
                              disabled={locked}
                              aria-label={`Edit payment item ${i.document_number}`}
                              title={lockedTitle(i) ?? 'Edit payment item'}
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-[#1d1c17]"
                            >
                              <span className="material-symbols-outlined text-[20px]">edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingItem(i);
                              }}
                              disabled={locked}
                              aria-label={`Delete payment item ${i.document_number}`}
                              title={lockedTitle(i) ?? 'Delete payment item'}
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-[#1d1c17]"
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

      <AccountsPayableQuickLinks active="payment-items" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={openCreate}
        aria-label="Quick add payment item"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-40"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {formDrawer && (
        <PaymentItemFormDrawer
          mode={formDrawer.mode}
          initial={formDrawer.item}
          payments={payments}
          defaultPaymentId={payment?.id}
          submitting={formSubmitting}
          formError={formError}
          authHeaders={authHeaders}
          onCancel={() => setFormDrawer(null)}
          onSubmit={(dto) =>
            formDrawer.mode === 'create'
              ? handleCreateSubmit(dto as CreateSupplierPaymentItemDto)
              : handleEditSubmit(formDrawer.item!.id, dto)
          }
        />
      )}

      {detailItem && (
        <PaymentItemDetailDrawer
          item={detailItem}
          payment={paymentById.get(detailItem.payment_id) ?? null}
          onClose={() => setDetailItem(null)}
          onViewPayment={() => {
            setDetailItem(null);
            onNavigate?.('supplier-payments');
          }}
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

export default SupplierPaymentItemsView;
