import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  SupplierPayment,
  SupplierPaymentStatus,
  SupplierPaymentAllocation,
  SupplierPaymentItem,
  SupplierInvoice,
  InvoiceSupplierRef,
  CreateSupplierPaymentDto,
  UpdateSupplierPaymentDto,
  CreateSupplierPaymentAllocationDto,
} from '../../../../types/accounts-payable';
import {
  SUPPLIER_PAYMENT_STATUSES,
  SUPPLIER_PAYMENT_STATUS_LABELS,
  SUPPLIER_PAYMENT_METHODS,
  SUPPLIER_PAYMENT_METHOD_FILTERS,
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

const formatCurrency = (v: number | string | null | undefined): string =>
  `$${num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};

const unallocatedBalance = (p: Pick<SupplierPayment, 'total_amount' | 'allocated_amount'>): number =>
  Math.max(0, num(p.total_amount) - num(p.allocated_amount));

// Un pago con monto asignado bloquea sus campos estructurales.
const isAllocated = (p: Pick<SupplierPayment, 'allocated_amount'>): boolean => num(p.allocated_amount) > 0;

const formatMethod = (method: string): string =>
  SUPPLIER_PAYMENT_METHODS.find((m) => m.value === method)?.label ??
  method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const STATUS_BADGE_STYLES: Record<SupplierPaymentStatus, string> = {
  draft: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  posted: 'bg-blue-500/10 text-blue-700',
  partially_allocated: 'bg-amber-500/10 text-amber-700',
  fully_allocated: 'bg-green-500/10 text-green-700',
  cancelled: 'bg-red-500/10 text-red-700',
};

// ========================= FORM DRAWER (RECORD / EDIT) =========================

// Asignación que el form emite: a qué invoice (por número) y cuánto aplica el pago.
export type PaymentAllocationDraft = Pick<
  CreateSupplierPaymentAllocationDto,
  'supplier_id' | 'document_number' | 'document_type' | 'allocated_amount'
>;

interface PaymentFormDrawerProps {
  mode: 'create' | 'edit';
  initial?: SupplierPayment;
  suppliers: InvoiceSupplierRef[];
  submitting: boolean;
  authHeaders: () => Record<string, string>;
  onCancel: () => void;
  onSubmit: (
    dto: CreateSupplierPaymentDto | UpdateSupplierPaymentDto,
    allocations: PaymentAllocationDraft[],
  ) => void;
}

const PaymentFormDrawer: React.FC<PaymentFormDrawerProps> = ({
  mode,
  initial,
  suppliers,
  submitting,
  authHeaders,
  onCancel,
  onSubmit,
}) => {
  const [supplierId, setSupplierId] = useState<string>(initial ? String(initial.supplier_id) : '');
  // Facturas pendientes del proveedor (balance_due > 0) para asignar el pago.
  const [outstanding, setOutstanding] = useState<SupplierInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  // invoice_id → monto a asignar (string del input).
  const [alloc, setAlloc] = useState<Record<number, string>>({});
  const [paymentNumber, setPaymentNumber] = useState(initial?.payment_number ?? '');
  const [paymentDate, setPaymentDate] = useState(initial?.payment_date?.slice(0, 10) ?? '');
  const [paymentMethod, setPaymentMethod] = useState(initial?.payment_method ?? 'bank_transfer');
  const [reference, setReference] = useState(initial?.reference ?? '');
  const [totalAmount, setTotalAmount] = useState(initial ? String(num(initial.total_amount)) : '');
  const [status, setStatus] = useState<SupplierPaymentStatus>(initial?.status ?? 'draft');

  const allocatedAmount = num(initial?.allocated_amount);
  // Lock de auditoría de campos estructurales (supplier_id, total_amount):
  // - si ya hay monto asignado (allocated_amount > 0), o
  // - si el pago ya salió de DRAFT (posting transition bloquea los atributos de cabecera).
  const locked =
    mode === 'edit' && !!initial && (allocatedAmount > 0 || initial.status !== 'draft');

  const totalNum = num(totalAmount);
  const fullyAllocatedError =
    status === 'fully_allocated' && allocatedAmount !== totalNum
      ? 'Cannot mark as Fully Allocated unless the allocated amount equals the total amount.'
      : '';

  // Cargar las facturas pendientes del proveedor seleccionado para poder asignarlas.
  useEffect(() => {
    if (!supplierId) {
      setOutstanding([]);
      return;
    }
    let cancelled = false;
    setLoadingInvoices(true);
    fetch(`${API_BASE}/supplier-invoices?supplier_id=${supplierId}&limit=100`, {
      headers: authHeaders(),
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((json) => {
        if (cancelled) return;
        const list = ((json.data ?? []) as SupplierInvoice[]).filter(
          (inv) => !inv.deleted_at && num(inv.balance_due) > 0,
        );
        setOutstanding(list);
      })
      .catch(() => {
        if (!cancelled) setOutstanding([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingInvoices(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  // Asignaciones capturadas (monto > 0) y su validación contra el saldo disponible.
  const allocEntries = outstanding
    .map((inv) => ({ inv, amount: num(alloc[inv.id]) }))
    .filter((e) => e.amount > 0);
  const allocSum = allocEntries.reduce((s, e) => s + e.amount, 0);
  // Monto del pago aún sin asignar (en edición puede haber asignaciones previas).
  const unallocatedCap = totalNum - (mode === 'edit' ? allocatedAmount : 0);
  const overCap = allocSum > unallocatedCap + 0.001;
  const overBalance = allocEntries.some(
    (e) => e.amount > num(e.inv.balance_due) + 0.001,
  );
  const allocError = overCap
    ? `Allocations (${formatCurrency(allocSum)}) exceed the payment's unallocated amount (${formatCurrency(unallocatedCap)}).`
    : overBalance
      ? 'An allocation cannot exceed the invoice balance.'
      : '';
  const hasAllocations = allocEntries.length > 0;

  const fieldsValid =
    supplierId.trim().length > 0 &&
    paymentNumber.trim().length > 0 &&
    paymentNumber.length <= 100 &&
    paymentDate.trim().length > 0 &&
    paymentMethod.trim().length > 0 &&
    totalNum > 0 &&
    !fullyAllocatedError &&
    !allocError;

  const isUnchanged =
    mode === 'edit' &&
    !!initial &&
    Number(supplierId) === initial.supplier_id &&
    paymentNumber.trim() === initial.payment_number &&
    paymentDate === (initial.payment_date?.slice(0, 10) ?? '') &&
    paymentMethod === initial.payment_method &&
    (reference ?? '').trim() === (initial.reference ?? '').trim() &&
    num(totalAmount) === num(initial.total_amount) &&
    status === initial.status;

  // En edición, agregar asignaciones es un cambio válido aunque la cabecera no cambie.
  const canSubmit = fieldsValid && (!isUnchanged || hasAllocations);

  const buildAllocations = (): PaymentAllocationDraft[] =>
    allocEntries.map((e) => ({
      supplier_id: Number(supplierId),
      document_number: e.inv.invoice_number,
      document_type: 'invoice',
      allocated_amount: e.amount,
    }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    const allocations = buildAllocations();

    if (mode === 'create') {
      onSubmit(
        {
          supplier_id: Number(supplierId),
          payment_number: paymentNumber.trim(),
          payment_date: paymentDate,
          payment_method: paymentMethod,
          reference: reference.trim() || null,
          total_amount: totalNum,
        },
        allocations,
      );
      return;
    }

    const dto: UpdateSupplierPaymentDto = {
      payment_number: paymentNumber.trim(),
      payment_date: paymentDate,
      payment_method: paymentMethod,
      reference: reference.trim() || null,
      status,
    };
    if (!locked) {
      dto.supplier_id = Number(supplierId);
      dto.total_amount = totalNum;
    }
    onSubmit(dto, allocations);
  };

  useModalDismiss(onCancel);

  return (
    <AppModal
      title={mode === 'create' ? 'Record Payment' : 'Edit Payment'}
      subtitle="Accounts Payable"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
      closeAriaLabel="Close payment form"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-left">
            {locked && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded text-xs">
                <span className="material-symbols-outlined text-base">lock</span>
                <span>
                  This payment has allocations. Core fields (supplier, total amount) are locked to
                  preserve audit integrity.
                </span>
              </div>
            )}

            {/* Supplier */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pay-supplier" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Supplier <span className="text-[#ae001a]">*</span>
              </label>
              <select
                id="pay-supplier"
                autoFocus={!locked}
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                disabled={locked}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full disabled:bg-[#f2ede5] disabled:cursor-not-allowed"
              >
                <option value="">Select a supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                {initial?.supplier && !suppliers.some((s) => s.id === initial.supplier_id) && (
                  <option value={initial.supplier_id}>{initial.supplier.name}</option>
                )}
              </select>
            </div>

            {/* Payment number */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pay-number" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Payment Number <span className="text-[#ae001a]">*</span>
              </label>
              <input
                id="pay-number"
                type="text"
                value={paymentNumber}
                onChange={(e) => setPaymentNumber(e.target.value)}
                maxLength={120}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono"
                placeholder="e.g., PAY-2026-0042"
              />
              <span className={`text-[11px] ${paymentNumber.length > 100 ? 'text-[#ae001a] font-bold' : 'text-[#5f5e5e]'}`}>
                {paymentNumber.length}/100
              </span>
            </div>

            {/* Payment date + method */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pay-date" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Payment Date <span className="text-[#ae001a]">*</span>
                </label>
                <input
                  id="pay-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pay-method" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Method <span className="text-[#ae001a]">*</span>
                </label>
                <select
                  id="pay-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
                >
                  {SUPPLIER_PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Total + reference */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pay-total" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Total Amount <span className="text-[#ae001a]">*</span>
                </label>
                <input
                  id="pay-total"
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  disabled={locked}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono disabled:bg-[#f2ede5] disabled:cursor-not-allowed"
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pay-reference" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Reference
                </label>
                <input
                  id="pay-reference"
                  type="text"
                  value={reference ?? ''}
                  onChange={(e) => setReference(e.target.value)}
                  maxLength={100}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono"
                  placeholder="e.g., TRX-998877"
                />
              </div>
            </div>

            {/* Apply payment to outstanding invoices (allocation) */}
            {supplierId && (
              <div className="flex flex-col gap-2 border border-[#e8e2d8] rounded p-3 bg-[#faf7f2]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                    Apply to invoices (optional)
                  </span>
                  {hasAllocations && (
                    <span className="text-[11px] font-mono text-[#1d1c17]">
                      {formatCurrency(allocSum)} / {formatCurrency(unallocatedCap)}
                    </span>
                  )}
                </div>
                {loadingInvoices ? (
                  <p className="text-xs text-[#5f5e5e]">Loading outstanding invoices…</p>
                ) : outstanding.length === 0 ? (
                  <p className="text-xs text-[#5f5e5e] italic">
                    No outstanding invoices for this supplier.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                    {outstanding.map((inv) => (
                      <div key={inv.id} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#1d1c17] truncate">
                            {inv.invoice_number}
                          </p>
                          <p className="text-[11px] text-[#5f5e5e] font-mono">
                            Balance {formatCurrency(inv.balance_due)}
                          </p>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={num(inv.balance_due)}
                          value={alloc[inv.id] ?? ''}
                          onChange={(e) =>
                            setAlloc((prev) => ({ ...prev, [inv.id]: e.target.value }))
                          }
                          aria-label={`Allocate to ${inv.invoice_number}`}
                          className="w-28 bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none font-mono"
                          placeholder="0.00"
                        />
                      </div>
                    ))}
                  </div>
                )}
                {allocError && (
                  <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
                    {allocError}
                  </p>
                )}
              </div>
            )}

            {/* Allocated (read-only) + status (edit only) */}
            {mode === 'edit' && (
              <>
                <div className="flex items-center justify-between bg-[#f5efe6] border border-[#e8e2d8] px-4 py-3 rounded text-sm">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">Allocated Amount</span>
                  <span className="font-bold text-[#1d1c17] font-mono">{formatCurrency(allocatedAmount)}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pay-status" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                    Status
                  </label>
                  <select
                    id="pay-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as SupplierPaymentStatus)}
                    className={`bg-white text-[#1d1c17] px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-[#ae001a] outline-none w-full ${
                      fullyAllocatedError ? 'border-[#ae001a]' : 'border-[#e8e2d8] focus:border-[#ae001a]'
                    }`}
                  >
                    {SUPPLIER_PAYMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {SUPPLIER_PAYMENT_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  {fullyAllocatedError && (
                    <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
                      {fullyAllocatedError}
                    </p>
                  )}
                </div>
              </>
            )}
          <ModalFormFooter
            onCancel={onCancel}
            submitLabel={submitting ? 'Saving…' : mode === 'create' ? 'Record Payment' : 'Save Payment'}
            isSubmitting={submitting}
            submitDisabled={!canSubmit}
          />
        </form>
    </AppModal>
  );
};

// ========================= DETAIL DRAWER =========================

interface PaymentDetailDrawerProps {
  payment: SupplierPayment;
  items: SupplierPaymentItem[] | null; // null = loading
  allocations: SupplierPaymentAllocation[] | null; // null = loading
  onClose: () => void;
  onManageItems?: () => void;
  onManageAllocations?: () => void;
}

const PaymentDetailDrawer: React.FC<PaymentDetailDrawerProps> = ({
  payment,
  items,
  allocations,
  onClose,
  onManageItems,
  onManageAllocations,
}) => {
  useModalDismiss(onClose);
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex justify-end font-sans">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Payment Details"
        className="relative w-full max-w-md bg-[#fcfbfa] h-full shadow-2xl z-10 flex flex-col border-l border-[#e8e2d8] animate-slide-in text-left"
      >
        <div className="bg-[#222222] px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-white text-xl">payments</span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-white">Payment Details</span>
          </div>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-[#1c1b16] tracking-tight font-mono">{payment.payment_number}</h2>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_STYLES[payment.status]}`}
              >
                {SUPPLIER_PAYMENT_STATUS_LABELS[payment.status]}
              </span>
            </div>
            <p className="text-xs text-[#5f5e5e] mt-1 uppercase tracking-wider font-semibold">
              {payment.supplier?.name ?? `Supplier #${payment.supplier_id}`} · {formatMethod(payment.payment_method)}{' '}
              · {formatDate(payment.payment_date)}
            </p>
            {payment.reference && (
              <p className="text-[11px] text-[#5f5e5e] mt-1 font-mono">Ref: {payment.reference}</p>
            )}
          </div>

          <div className="border-t border-[#e8e2d8] pt-5 grid grid-cols-3 gap-3 text-center">
            <div>
              <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e]">Total</span>
              <span className="text-sm font-black text-[#1c1b16]">{formatCurrency(payment.total_amount)}</span>
            </div>
            <div>
              <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e]">Allocated</span>
              <span className="text-sm font-black text-green-700">{formatCurrency(payment.allocated_amount)}</span>
            </div>
            <div>
              <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e]">Unallocated</span>
              <span className="text-sm font-black text-[#ae001a]">{formatCurrency(unallocatedBalance(payment))}</span>
            </div>
          </div>

          <div className="border-t border-[#e8e2d8] pt-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">
                Breakdown Items ({items?.length ?? 0})
              </h4>
              {onManageItems && (
                <button
                  type="button"
                  onClick={onManageItems}
                  className="text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                >
                  Manage items
                </button>
              )}
            </div>
            {items === null ? (
              <p className="text-xs text-[#5f5e5e]">Loading items…</p>
            ) : items.length > 0 ? (
              <ul className="space-y-2">
                {items.map((it) => (
                  <li key={it.id} className="flex justify-between items-center bg-[#f5efe6] border border-[#e8e2d8] p-3">
                    <div>
                      <p className="text-xs font-semibold text-[#1c1b16] font-mono">{it.document_number}</p>
                      <p className="text-[10px] text-[#5f5e5e] uppercase tracking-wider">{it.document_type}</p>
                    </div>
                    <span className="text-xs font-bold text-[#1c1b16]">{formatCurrency(it.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#5f5e5e] italic">No breakdown items recorded for this payment.</p>
            )}
          </div>

          <div className="border-t border-[#e8e2d8] pt-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">
                Allocations ({allocations?.length ?? 0})
              </h4>
              {onManageAllocations && (
                <button
                  type="button"
                  onClick={onManageAllocations}
                  className="text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                >
                  Manage allocations
                </button>
              )}
            </div>
            {allocations === null ? (
              <p className="text-xs text-[#5f5e5e]">Loading allocations…</p>
            ) : allocations.length > 0 ? (
              <ul className="space-y-2">
                {allocations.map((a) => (
                  <li key={a.id} className="flex justify-between items-center bg-[#f5efe6] border border-[#e8e2d8] p-3">
                    <div>
                      <p className="text-xs font-semibold text-[#1c1b16] font-mono">{a.document_number}</p>
                      <p className="text-[10px] text-[#5f5e5e] uppercase tracking-wider">{a.document_type}</p>
                    </div>
                    <span className="text-xs font-bold text-[#1c1b16]">{formatCurrency(a.allocated_amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#5f5e5e] italic">No allocations recorded for this payment yet.</p>
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

interface ConfirmDeleteDialogProps {
  payment: SupplierPayment;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmDeleteDialog: React.FC<ConfirmDeleteDialogProps> = ({
  payment,
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
        aria-label="Delete Payment"
        className="relative bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-sm p-6 text-left"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-red-50 border border-red-100 text-[#ae001a]">
            <span className="material-symbols-outlined text-2xl">delete</span>
          </div>
          <div className="space-y-2">
            <p className="font-bold text-[#1d1c17]">Delete this payment?</p>
            <p className="text-sm text-[#5f5e5e] leading-relaxed">
              Payment <span className="font-mono font-semibold">{payment.payment_number}</span> will be
              soft-deleted (archived) and removed from active views. The underlying record is preserved
              for auditing.
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

interface SupplierPaymentsViewProps {
  onNavigate?: (view: string) => void;
  companyId?: number;
  // Salta al workspace de líneas de pago ya filtrado por este voucher.
  onViewItems?: (payment: SupplierPayment) => void;
  // Salta a la matriz de asignaciones ya filtrada por este voucher.
  onViewAllocations?: (payment: SupplierPayment) => void;
}

export const SupplierPaymentsView: React.FC<SupplierPaymentsViewProps> = ({
  onNavigate,
  companyId,
  onViewItems,
  onViewAllocations,
}) => {
  const activeCompanyId = companyId ?? 1;

  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [suppliers, setSuppliers] = useState<InvoiceSupplierRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [methodFilter, setMethodFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'' | SupplierPaymentStatus>('');

  const [formDrawer, setFormDrawer] = useState<null | { mode: 'create' | 'edit'; payment?: SupplierPayment }>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [detailPayment, setDetailPayment] = useState<SupplierPayment | null>(null);
  const [detailAllocations, setDetailAllocations] = useState<SupplierPaymentAllocation[] | null>(null);
  const [detailItems, setDetailItems] = useState<SupplierPaymentItem[] | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<SupplierPayment | null>(null);
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

  const supplierNameById = useMemo(() => {
    const map = new Map<number, string>();
    suppliers.forEach((s) => map.set(s.id, s.name));
    return map;
  }, [suppliers]);

  const withSupplier = (p: SupplierPayment): SupplierPayment => ({
    ...p,
    supplier: p.supplier ?? (supplierNameById.has(p.supplier_id)
      ? { id: p.supplier_id, name: supplierNameById.get(p.supplier_id)! }
      : p.supplier),
  });

  const fetchPayments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/supplier-payments?limit=100`, { headers: authHeaders() });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) throw new Error('Error al cargar los pagos a proveedores');
      const json = await res.json();
      const active = (json.data ?? []).filter((p: SupplierPayment) => !p.deleted_at);
      setPayments(active);
    } catch (err) {
      console.error('Error fetching supplier payments:', err);
      setError('Failed to load supplier payments. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/inventory/suppliers?limit=100`, { headers: authHeaders() });
      if (!res.ok) return;
      const json = await res.json();
      setSuppliers(json.data ?? []);
    } catch (err) {
      console.error('Error fetching suppliers for picker:', err);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  const supplierOptions = useMemo(() => {
    const map = new Map<number, string>();
    suppliers.forEach((s) => map.set(s.id, s.name));
    payments.forEach((p) => {
      if (!map.has(p.supplier_id)) map.set(p.supplier_id, `Supplier #${p.supplier_id}`);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers, payments]);

  const filteredPayments = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return payments.map(withSupplier).filter((p) => {
      if (term) {
        const haystack = [p.payment_number, p.supplier?.name ?? '', p.reference ?? '']
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (supplierFilter && String(p.supplier_id) !== supplierFilter) return false;
      if (methodFilter && p.payment_method !== methodFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, suppliers, searchQuery, supplierFilter, methodFilter, statusFilter]);

  const hasActiveFilter = Boolean(searchQuery || supplierFilter || methodFilter || statusFilter);
  const clearFilters = () => {
    setSearchQuery('');
    setSupplierFilter('');
    setMethodFilter('');
    setStatusFilter('');
  };

  // Crea las asignaciones pago→invoice. El backend recalcula allocated_amount del pago
  // y paid_amount/status de cada factura, así que refrescamos tras aplicarlas.
  const postAllocations = async (
    paymentId: number,
    allocations: PaymentAllocationDraft[],
  ) => {
    for (const a of allocations) {
      const body: CreateSupplierPaymentAllocationDto = { payment_id: paymentId, ...a };
      const res = await fetch(`${API_BASE}/supplier-payment-allocations`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || 'Failed to apply the payment to an invoice');
      }
    }
  };

  const handleCreateSubmit = async (
    dto: CreateSupplierPaymentDto,
    allocations: PaymentAllocationDraft[],
  ) => {
    setFormSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/supplier-payments`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ...dto, company_id: activeCompanyId }),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to record payment');
      if (allocations.length > 0) {
        await postAllocations(json.data.id, allocations);
        await fetchPayments();
      } else {
        setPayments((prev) => [json.data, ...prev]);
      }
      setFormDrawer(null);
      setToast({ message: 'Payment recorded successfully', type: 'success' });
    } catch (err: any) {
      setFormDrawer(null);
      setToast({ message: err.message || 'Failed to record payment', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (
    id: number,
    dto: UpdateSupplierPaymentDto,
    allocations: PaymentAllocationDraft[],
  ) => {
    setFormSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/supplier-payments/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(dto),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to update payment');
      if (allocations.length > 0) {
        await postAllocations(id, allocations);
        await fetchPayments(); // reflejar allocated_amount/status recalculados
      } else {
        setPayments((prev) => prev.map((p) => (p.id === json.data.id ? json.data : p)));
      }
      setFormDrawer(null);
      setToast({ message: 'Payment updated successfully', type: 'success' });
    } catch (err: any) {
      setFormDrawer(null);
      setToast({ message: err.message || 'Failed to update payment', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  // Bloqueo de borrado: no se puede soft-delete si tiene monto asignado.
  const handleDeleteClick = (p: SupplierPayment) => {
    if (isAllocated(p)) {
      setToast({
        message: 'Cannot delete: unlink active allocations from this payment first.',
        type: 'error',
      });
      return;
    }
    setDeletingPayment(p);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingPayment) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/supplier-payments/${deletingPayment.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to delete payment');
      }
      setPayments((prev) => prev.filter((p) => p.id !== deletingPayment.id));
      setDeletingPayment(null);
      setToast({ message: 'Payment deleted successfully', type: 'success' });
    } catch (err: any) {
      setDeletingPayment(null);
      setToast({ message: err.message || 'Failed to delete payment', type: 'error' });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleRowClick = async (p: SupplierPayment) => {
    setDetailPayment(withSupplier(p));
    setDetailAllocations(null);
    setDetailItems(null);

    // Breakdown items del pago.
    void (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/supplier-payment-items?payment_id=${p.id}&limit=100`,
          { headers: authHeaders() },
        );
        setDetailItems(res.ok ? (await res.json()).data ?? [] : []);
      } catch {
        setDetailItems([]);
      }
    })();

    // Allocations activas contra facturas.
    try {
      const res = await fetch(
        `${API_BASE}/supplier-payment-allocations?payment_id=${p.id}&limit=100`,
        { headers: authHeaders() },
      );
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        setDetailAllocations([]);
        return;
      }
      const json = await res.json();
      setDetailAllocations(json.data ?? []);
    } catch (err) {
      console.error('Error fetching allocations:', err);
      setDetailAllocations([]);
    }
  };

  const isTrueEmpty = !loading && !error && payments.length === 0;
  const isFilteredEmpty = !loading && !error && payments.length > 0 && filteredPayments.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchPayments}
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
        <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase">Payments &amp; Disbursements</h2>
        <p className="text-[#5f5e5e] text-body-sm mt-1">
          Record outgoing supplier payments, track allocation against outstanding invoices, and verify
          disbursement status.
        </p>
      </div>

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
            placeholder="Search by payment #, supplier, or reference..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search payments"
          />
        </div>
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none min-w-[160px]"
          aria-label="Filter by supplier"
        >
          <option value="">All Suppliers</option>
          {supplierOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by payment method"
        >
          <option value="">All Methods</option>
          {SUPPLIER_PAYMENT_METHOD_FILTERS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | SupplierPaymentStatus)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          {SUPPLIER_PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SUPPLIER_PAYMENT_STATUS_LABELS[s]}
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
            Record Payment
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
          data-testid="supplier-payments-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">payments</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No supplier payments recorded. Click &apos;Record Payment&apos; to register a new vendor
            disbursement.
          </p>
          <button
            type="button"
            onClick={() => setFormDrawer({ mode: 'create' })}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Record Payment
          </button>
        </div>
      )}

      {/* Table */}
      {(loading || payments.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">PAYMENTS &amp; DISBURSEMENTS</span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredPayments.length} payments`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Payment &amp; Vendor
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Method
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Total
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Allocated
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Unallocated
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Status
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
                      {Array.from({ length: 7 }).map((_, c) => (
                        <td key={c} className="px-6 py-4">
                          <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                        <p className="text-sm text-[#5f5e5e]">No payments match your active filters</p>
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
                  filteredPayments.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => handleRowClick(p)}
                      className="group hover:bg-[#f8f3eb] transition-colors cursor-pointer"
                    >
                      {/* Number + vendor + reference + date */}
                      <td className="px-6 py-4">
                        <p className="font-bold text-[#1d1c17] font-mono">{p.payment_number}</p>
                        <p className="text-xs text-[#5f5e5e] flex items-center gap-1.5 flex-wrap">
                          <span>{p.supplier?.name ?? `Supplier #${p.supplier_id}`}</span>
                          {p.reference && (
                            <span className="inline-flex items-center bg-[#ece8e0] text-[#5f5e5e] font-mono text-[10px] px-1.5 py-0.5 rounded">
                              {p.reference}
                            </span>
                          )}
                          <span className="text-[#5f5e5e]/60">· {formatDate(p.payment_date)}</span>
                        </p>
                      </td>

                      {/* Method */}
                      <td className="px-6 py-4 text-center">
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#ece8e0] text-[#1d1c17]">
                          {formatMethod(p.payment_method)}
                        </span>
                      </td>

                      {/* Financials */}
                      <td className="px-6 py-4 text-right text-sm font-semibold text-[#1d1c17] whitespace-nowrap">
                        {formatCurrency(p.total_amount)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-green-700 whitespace-nowrap">
                        {formatCurrency(p.allocated_amount)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-bold text-[#ae001a] whitespace-nowrap">
                        {formatCurrency(unallocatedBalance(p))}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_STYLES[p.status]}`}
                        >
                          {SUPPLIER_PAYMENT_STATUS_LABELS[p.status]}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFormDrawer({ mode: 'edit', payment: p });
                            }}
                            aria-label="Edit payment"
                            title="Edit payment"
                            className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                          >
                            <span className="material-symbols-outlined text-[20px]">edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(p);
                            }}
                            aria-label="Delete payment"
                            title={isAllocated(p) ? 'Locked — remove allocations first' : 'Delete payment'}
                            className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                          >
                            <span className="material-symbols-outlined text-[20px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AccountsPayableQuickLinks active="payments" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={() => setFormDrawer({ mode: 'create' })}
        aria-label="Quick create payment"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-40"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {formDrawer && (
        <PaymentFormDrawer
          mode={formDrawer.mode}
          initial={formDrawer.payment}
          suppliers={suppliers}
          submitting={formSubmitting}
          authHeaders={authHeaders}
          onCancel={() => setFormDrawer(null)}
          onSubmit={(dto, allocations) =>
            formDrawer.mode === 'create'
              ? handleCreateSubmit(dto as CreateSupplierPaymentDto, allocations)
              : handleEditSubmit(
                  formDrawer.payment!.id,
                  dto as UpdateSupplierPaymentDto,
                  allocations,
                )
          }
        />
      )}

      {detailPayment && (
        <PaymentDetailDrawer
          payment={detailPayment}
          items={detailItems}
          allocations={detailAllocations}
          onClose={() => {
            setDetailPayment(null);
            setDetailAllocations(null);
            setDetailItems(null);
          }}
          onManageItems={
            onViewItems
              ? () => {
                  const target = detailPayment;
                  setDetailPayment(null);
                  setDetailAllocations(null);
                  setDetailItems(null);
                  onViewItems(target);
                }
              : undefined
          }
          onManageAllocations={
            onViewAllocations
              ? () => {
                  const target = detailPayment;
                  setDetailPayment(null);
                  setDetailAllocations(null);
                  setDetailItems(null);
                  onViewAllocations(target);
                }
              : undefined
          }
        />
      )}

      {deletingPayment && (
        <ConfirmDeleteDialog
          payment={deletingPayment}
          submitting={deleteSubmitting}
          onCancel={() => setDeletingPayment(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

export default SupplierPaymentsView;
