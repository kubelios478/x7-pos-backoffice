import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  SupplierPayment,
  SupplierPaymentAllocation,
  SupplierCreditNote,
  SupplierInvoice,
  InvoiceSupplierRef,
  CreateSupplierPaymentAllocationDto,
} from '../../../../types/accounts-payable';
import {
  AP_ALLOCATION_DOCUMENT_TYPES,
  AP_DOCUMENT_TYPE_LABELS,
  allocationSourceType,
  documentTypeBadgeStyle,
  documentTypeLabel,
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

const formatDateTime = (value?: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
};

// Saldo sin asignar de un pago: lo que todavía puede financiar asignaciones.
const paymentAvailable = (p: SupplierPayment): number =>
  Math.max(0, num(p.total_amount) - num(p.allocated_amount));

// Saldo sin aplicar de una nota de crédito.
const creditNoteAvailable = (cn: SupplierCreditNote): number =>
  Math.max(0, num(cn.total_amount) - num(cn.applied_amount));

// Tolerancia de un milésimo para no bloquear por ruido decimal.
const EPSILON = 0.001;

// ========================= FORM DRAWER (ALLOCATE) =========================

interface AllocationFormDrawerProps {
  suppliers: InvoiceSupplierRef[];
  payments: SupplierPayment[];
  creditNotes: SupplierCreditNote[];
  submitting: boolean;
  formError: string;
  authHeaders: () => Record<string, string>;
  onCancel: () => void;
  onSubmit: (dto: CreateSupplierPaymentAllocationDto) => void;
}

const AllocationFormDrawer: React.FC<AllocationFormDrawerProps> = ({
  suppliers,
  payments,
  creditNotes,
  submitting,
  formError,
  authHeaders,
  onCancel,
  onSubmit,
}) => {
  const [supplierId, setSupplierId] = useState('');
  // Fuente de fondeo mutuamente excluyente: o pago, o nota de crédito.
  const [sourceKind, setSourceKind] = useState<'payment' | 'credit_note'>('payment');
  const [paymentId, setPaymentId] = useState('');
  const [creditNoteId, setCreditNoteId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [documentType, setDocumentType] = useState<string>('invoice');
  const [allocatedAmount, setAllocatedAmount] = useState('');
  const [outstanding, setOutstanding] = useState<SupplierInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  useModalDismiss(onCancel);

  // Cambiar de fuente resetea la otra: nunca pueden coexistir las dos.
  const selectPaymentSource = () => {
    setSourceKind('payment');
    setCreditNoteId('');
  };
  const selectCreditNoteSource = () => {
    setSourceKind('credit_note');
    setPaymentId('');
  };

  // Solo fuentes del proveedor elegido y con saldo disponible.
  const availablePayments = useMemo(
    () =>
      payments.filter(
        (p) =>
          (!supplierId || String(p.supplier_id) === supplierId) &&
          paymentAvailable(p) > EPSILON &&
          p.status !== 'cancelled',
      ),
    [payments, supplierId],
  );

  const availableCreditNotes = useMemo(
    () =>
      creditNotes.filter(
        (cn) =>
          (!supplierId || String(cn.supplier_id) === supplierId) &&
          creditNoteAvailable(cn) > EPSILON &&
          cn.status !== 'cancelled' &&
          cn.status !== 'draft',
      ),
    [creditNotes, supplierId],
  );

  // Documentos pendientes del proveedor: destino de la asignación.
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

  const selectedPayment = payments.find((p) => String(p.id) === paymentId);
  const selectedCreditNote = creditNotes.find((cn) => String(cn.id) === creditNoteId);
  const targetInvoice = outstanding.find((inv) => inv.invoice_number === documentNumber);

  const amountNum = num(allocatedAmount);
  const hasSource = sourceKind === 'payment' ? !!selectedPayment : !!selectedCreditNote;
  const sourceAvailable = selectedPayment
    ? paymentAvailable(selectedPayment)
    : selectedCreditNote
      ? creditNoteAvailable(selectedCreditNote)
      : 0;

  // Available Fund Balance Enforcement (lado fuente).
  const overSourceBalance = hasSource && amountNum > sourceAvailable + EPSILON;
  const sourceError = overSourceBalance
    ? `Allocation amount (${formatCurrency(amountNum)}) exceeds the available unallocated balance (${formatCurrency(sourceAvailable)}) of the selected funding source.`
    : '';

  // Target Document Balance Enforcement (lado destino).
  const overTargetBalance =
    !!targetInvoice && amountNum > num(targetInvoice.balance_due) + EPSILON;
  const targetError = overTargetBalance
    ? `Allocation amount (${formatCurrency(amountNum)}) exceeds the outstanding balance (${formatCurrency(targetInvoice!.balance_due)}) of the target document.`
    : '';

  const canSubmit =
    supplierId.trim().length > 0 &&
    hasSource &&
    documentNumber.trim().length > 0 &&
    documentType.trim().length > 0 &&
    amountNum > 0 &&
    !sourceError &&
    !targetError;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    // Exactamente una fuente viaja informada; la otra va explícitamente nula.
    onSubmit({
      payment_id: sourceKind === 'payment' ? Number(paymentId) : null,
      credit_note_id: sourceKind === 'credit_note' ? Number(creditNoteId) : null,
      supplier_id: Number(supplierId),
      document_number: documentNumber.trim(),
      document_type: documentType,
      allocated_amount: amountNum,
    });
  };

  const sourceTabClass = (kind: 'payment' | 'credit_note') =>
    `flex-1 px-4 py-2 text-[11px] font-bold uppercase tracking-widest border transition-colors duration-200 ${
      sourceKind === kind
        ? 'bg-[#ae001a] text-white border-[#ae001a]'
        : 'bg-white text-[#1d1c17] border-[#e8e2d8] hover:text-[#ae001a]'
    }`;

  return (
    <AppModal
      title="Allocate Payment / Credit"
      subtitle="Accounts Payable"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
      closeAriaLabel="Close allocation form"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-left font-sans">
        {formError && <ModalFormError message={formError} />}

        {/* Supplier */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="alloc-supplier" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
            Supplier <span className="text-[#ae001a]">*</span>
          </label>
          <select
            id="alloc-supplier"
            autoFocus
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              // Cambiar de proveedor invalida fuente y destino previos.
              setPaymentId('');
              setCreditNoteId('');
              setDocumentNumber('');
            }}
            className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
          >
            <option value="">Select a supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Funding source — strict mutual exclusion */}
        <div className="flex flex-col gap-2 border border-[#e8e2d8] rounded p-3 bg-[#faf7f2]">
          <span className="text-[11px] font-bold text-[#5f5e5e] uppercase">
            Funding Source <span className="text-[#ae001a]">*</span>
          </span>
          <div className="flex gap-2" role="group" aria-label="Funding source type">
            <button
              type="button"
              onClick={selectPaymentSource}
              aria-pressed={sourceKind === 'payment'}
              className={sourceTabClass('payment')}
            >
              Payment Voucher
            </button>
            <button
              type="button"
              onClick={selectCreditNoteSource}
              aria-pressed={sourceKind === 'credit_note'}
              className={sourceTabClass('credit_note')}
            >
              Credit Note
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="alloc-payment" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Payment Voucher
            </label>
            <select
              id="alloc-payment"
              value={paymentId}
              disabled={sourceKind !== 'payment'}
              onChange={(e) => setPaymentId(e.target.value)}
              className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full disabled:bg-[#f2ede5] disabled:cursor-not-allowed"
            >
              <option value="">Select a payment voucher…</option>
              {availablePayments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.payment_number} · {formatCurrency(paymentAvailable(p))} available
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="alloc-credit-note" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Credit Note
            </label>
            <select
              id="alloc-credit-note"
              value={creditNoteId}
              disabled={sourceKind !== 'credit_note'}
              onChange={(e) => setCreditNoteId(e.target.value)}
              className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full disabled:bg-[#f2ede5] disabled:cursor-not-allowed"
            >
              <option value="">Select a credit note…</option>
              {availableCreditNotes.map((cn) => (
                <option key={cn.id} value={cn.id}>
                  {cn.credit_note_number} · {formatCurrency(creditNoteAvailable(cn))} available
                </option>
              ))}
            </select>
          </div>

          {hasSource && (
            <p className="text-[11px] text-[#5f5e5e] font-mono">
              Available balance: {formatCurrency(sourceAvailable)}
            </p>
          )}
        </div>

        {/* Target document */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="alloc-document" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
            Target Document <span className="text-[#ae001a]">*</span>
          </label>
          <select
            id="alloc-document"
            value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
            disabled={!supplierId}
            className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full disabled:bg-[#f2ede5] disabled:cursor-not-allowed"
          >
            <option value="">
              {loadingInvoices ? 'Loading outstanding documents…' : 'Select a target document…'}
            </option>
            {outstanding.map((inv) => (
              <option key={inv.id} value={inv.invoice_number}>
                {inv.invoice_number} · {formatCurrency(inv.balance_due)} due
              </option>
            ))}
          </select>
          {supplierId && !loadingInvoices && outstanding.length === 0 && (
            <p className="text-[11px] text-[#5f5e5e] italic">
              No outstanding documents for this supplier.
            </p>
          )}
        </div>

        {/* Document type + amount */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="alloc-type" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Document Type <span className="text-[#ae001a]">*</span>
            </label>
            <select
              id="alloc-type"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
            >
              {AP_ALLOCATION_DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {AP_DOCUMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="alloc-amount" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Allocated Amount <span className="text-[#ae001a]">*</span>
            </label>
            <input
              id="alloc-amount"
              type="number"
              step="0.01"
              min="0"
              value={allocatedAmount}
              onChange={(e) => setAllocatedAmount(e.target.value)}
              className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono"
              placeholder="0.00"
            />
          </div>
        </div>

        {sourceError && (
          <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
            {sourceError}
          </p>
        )}
        {targetError && (
          <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
            {targetError}
          </p>
        )}

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Applying…' : 'Allocate Funds'}
          isSubmitting={submitting}
          submitDisabled={!canSubmit}
        />
      </form>
    </AppModal>
  );
};

// ========================= DETAIL DRAWER =========================

interface AllocationDetailDrawerProps {
  allocation: SupplierPaymentAllocation;
  supplierName?: string;
  onClose: () => void;
}

const AllocationDetailDrawer: React.FC<AllocationDetailDrawerProps> = ({
  allocation,
  supplierName,
  onClose,
}) => {
  useModalDismiss(onClose);
  const isCreditNote = allocationSourceType(allocation) === 'credit_note';
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex justify-end font-sans">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Allocation Details"
        className="relative w-full max-w-md bg-[#fcfbfa] h-full shadow-2xl z-10 flex flex-col border-l border-[#e8e2d8] animate-slide-in text-left"
      >
        <div className="bg-[#222222] px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-white text-xl" aria-hidden="true">
              account_tree
            </span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-white">
              Allocation Details
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Close details"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h2 className="text-xl font-black text-[#1c1b16] tracking-tight font-mono">
              Allocation #{allocation.id}
            </h2>
            <p className="text-xs text-[#5f5e5e] mt-1">{formatDateTime(allocation.created_at)}</p>
            <p className="text-2xl font-black text-[#ae001a] mt-2 font-mono">
              {formatCurrency(allocation.allocated_amount)}
            </p>
          </div>

          <div className="border-t border-[#e8e2d8] pt-5 space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">
              Funding Source
            </h4>
            <div className="bg-[#f5efe6] border border-[#e8e2d8] p-3 flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-[#1c1b16] font-mono">
                {isCreditNote
                  ? (allocation.credit_note?.credit_note_number ??
                    `Credit Note #${allocation.credit_note_id}`)
                  : (allocation.payment?.payment_number ?? `Payment #${allocation.payment_id}`)}
              </span>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                  isCreditNote
                    ? 'bg-purple-500/10 text-purple-700'
                    : 'bg-blue-500/10 text-blue-700'
                }`}
              >
                {isCreditNote ? 'Credit Note' : 'Payment Voucher'}
              </span>
            </div>
          </div>

          <div className="border-t border-[#e8e2d8] pt-5 space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">
              Target Debt Document
            </h4>
            <div className="bg-[#f5efe6] border border-[#e8e2d8] p-3 flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-[#1c1b16] font-mono">
                {allocation.document_number}
              </span>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${documentTypeBadgeStyle(allocation.document_type)}`}
              >
                {documentTypeLabel(allocation.document_type)}
              </span>
            </div>
            <p className="text-[11px] text-[#5f5e5e]">
              Supplier: {supplierName ?? `#${allocation.supplier_id}`}
            </p>
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

// ========================= UNLINK CONFIRM DIALOG =========================

interface ConfirmUnlinkDialogProps {
  allocation: SupplierPaymentAllocation;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmUnlinkDialog: React.FC<ConfirmUnlinkDialogProps> = ({
  allocation,
  submitting,
  onCancel,
  onConfirm,
}) => {
  useModalDismiss(onCancel);
  const isCreditNote = allocationSourceType(allocation) === 'credit_note';
  const sourceLabel = isCreditNote
    ? (allocation.credit_note?.credit_note_number ?? `Credit Note #${allocation.credit_note_id}`)
    : (allocation.payment?.payment_number ?? `Payment #${allocation.payment_id}`);

  return (
    <AppModal
      title="Unlink Allocation"
      subtitle="Accounts Payable"
      onClose={onCancel}
      closeDisabled={submitting}
      size="md"
      closeAriaLabel="Close unlink confirmation"
    >
      <div className="p-6 space-y-4 text-left font-sans">
        <p className="text-sm text-[#1d1c17]">
          Unlink allocation <strong className="font-mono">#{allocation.id}</strong> of{' '}
          <strong className="font-mono">{formatCurrency(allocation.allocated_amount)}</strong>?
        </p>
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded text-xs">
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            warning
          </span>
          <span>
            Balances will be restored: {formatCurrency(allocation.allocated_amount)} goes back to{' '}
            <strong className="font-mono">{sourceLabel}</strong>, and the outstanding balance of{' '}
            <strong className="font-mono">{allocation.document_number}</strong> increases by the same
            amount.
          </span>
        </div>
        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Unlinking…' : 'Unlink Allocation'}
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

interface SupplierPaymentAllocationsViewProps {
  onNavigate?: (view: string) => void;
  companyId?: number;
  // Contexto de origen: pago, nota de crédito o documento destino.
  payment?: SupplierPayment | null;
  creditNote?: SupplierCreditNote | null;
  documentNumber?: string | null;
  onClearContext?: () => void;
}

export const SupplierPaymentAllocationsView: React.FC<SupplierPaymentAllocationsViewProps> = ({
  onNavigate,
  companyId,
  payment,
  creditNote,
  documentNumber,
  onClearContext,
}) => {
  const activeCompanyId = companyId ?? 1;

  const [allocations, setAllocations] = useState<SupplierPaymentAllocation[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [creditNotes, setCreditNotes] = useState<SupplierCreditNote[]>([]);
  const [suppliers, setSuppliers] = useState<InvoiceSupplierRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'' | 'payment' | 'credit_note'>('');
  const [documentTypeFilter, setDocumentTypeFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [detailAllocation, setDetailAllocation] = useState<SupplierPaymentAllocation | null>(null);
  const [unlinkingAllocation, setUnlinkingAllocation] =
    useState<SupplierPaymentAllocation | null>(null);
  const [unlinkSubmitting, setUnlinkSubmitting] = useState(false);
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

  const fetchAllocations = async () => {
    setLoading(true);
    setError(null);
    try {
      // payment_id/credit_note_id son filtros reales del backend; document_number
      // no lo es, así que ese contexto se aplica en cliente.
      const params = new URLSearchParams({ limit: '100' });
      if (payment) params.set('payment_id', String(payment.id));
      if (creditNote) params.set('credit_note_id', String(creditNote.id));
      const res = await fetch(`${API_BASE}/supplier-payment-allocations?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) throw new Error('Error al cargar las asignaciones de pago');
      const json = await res.json();
      const active = ((json.data ?? []) as SupplierPaymentAllocation[]).filter(
        (a) => !a.deleted_at,
      );
      setAllocations(active);
    } catch (err) {
      console.error('Error fetching supplier payment allocations:', err);
      setError('Failed to load payment allocations. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  // Catálogos para resolver los números de fuente y validar saldos en el drawer.
  const fetchSources = async () => {
    try {
      const [payRes, cnRes, supRes] = await Promise.all([
        fetch(`${API_BASE}/supplier-payments?limit=100`, { headers: authHeaders() }),
        fetch(`${API_BASE}/supplier-credit-notes?limit=100`, { headers: authHeaders() }),
        fetch(`${API_BASE}/v1/inventory/suppliers?limit=100`, { headers: authHeaders() }),
      ]);
      if (payRes.ok) {
        const json = await payRes.json();
        setPayments(((json.data ?? []) as SupplierPayment[]).filter((p) => !p.deleted_at));
      }
      if (cnRes.ok) {
        const json = await cnRes.json();
        setCreditNotes(
          ((json.data ?? []) as SupplierCreditNote[]).filter((cn) => !cn.deleted_at),
        );
      }
      if (supRes.ok) {
        const json = await supRes.json();
        setSuppliers(json.data ?? []);
      }
    } catch (err) {
      console.error('Error fetching allocation sources:', err);
    }
  };

  useEffect(() => {
    fetchAllocations();
    fetchSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId, payment?.id, creditNote?.id]);

  const paymentById = useMemo(() => {
    const map = new Map<number, SupplierPayment>();
    payments.forEach((p) => map.set(p.id, p));
    return map;
  }, [payments]);

  const creditNoteById = useMemo(() => {
    const map = new Map<number, SupplierCreditNote>();
    creditNotes.forEach((cn) => map.set(cn.id, cn));
    return map;
  }, [creditNotes]);

  const supplierNameById = useMemo(() => {
    const map = new Map<number, string>();
    suppliers.forEach((s) => map.set(s.id, s.name));
    return map;
  }, [suppliers]);

  // Une cada asignación con el número de su fuente (el backend devuelve solo ids).
  const withSources = (a: SupplierPaymentAllocation): SupplierPaymentAllocation => {
    const parentPayment = a.payment_id != null ? paymentById.get(a.payment_id) : undefined;
    const parentCreditNote =
      a.credit_note_id != null ? creditNoteById.get(a.credit_note_id) : undefined;
    return {
      ...a,
      payment:
        a.payment ??
        (parentPayment
          ? { id: parentPayment.id, payment_number: parentPayment.payment_number }
          : null),
      credit_note:
        a.credit_note ??
        (parentCreditNote
          ? { id: parentCreditNote.id, credit_note_number: parentCreditNote.credit_note_number }
          : null),
    };
  };

  const filteredAllocations = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return allocations.map(withSources).filter((a) => {
      // Contexto por documento destino (no existe como filtro server-side).
      if (documentNumber && a.document_number !== documentNumber) return false;
      if (term) {
        const haystack = [
          a.document_number,
          a.payment?.payment_number ?? '',
          a.credit_note?.credit_note_number ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (sourceFilter && allocationSourceType(a) !== sourceFilter) return false;
      if (documentTypeFilter && a.document_type !== documentTypeFilter) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allocations,
    payments,
    creditNotes,
    searchQuery,
    sourceFilter,
    documentTypeFilter,
    documentNumber,
  ]);

  const hasActiveFilter = Boolean(searchQuery || sourceFilter || documentTypeFilter);
  const clearFilters = () => {
    setSearchQuery('');
    setSourceFilter('');
    setDocumentTypeFilter('');
  };

  const openCreate = () => {
    setFormError('');
    setFormOpen(true);
  };

  // El backend recalcula pago/nota de crédito/factura en cascada: recargamos todo.
  const refreshAll = async () => {
    await Promise.all([fetchAllocations(), fetchSources()]);
  };

  const handleCreateSubmit = async (dto: CreateSupplierPaymentAllocationDto) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      const res = await fetch(`${API_BASE}/supplier-payment-allocations`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(dto),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to allocate funds');
      await refreshAll();
      setFormOpen(false);
      setToast({ message: 'Allocation applied successfully', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to allocate funds');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleUnlinkConfirm = async () => {
    if (!unlinkingAllocation) return;
    setUnlinkSubmitting(true);
    try {
      const res = await fetch(
        `${API_BASE}/supplier-payment-allocations/${unlinkingAllocation.id}`,
        { method: 'DELETE', headers: authHeaders() },
      );
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to unlink allocation');
      }
      setUnlinkingAllocation(null);
      // Refetch: el backend ya revirtió los saldos de la fuente y del documento.
      await refreshAll();
      setToast({ message: 'Allocation unlinked and balances restored', type: 'success' });
    } catch (err) {
      setUnlinkingAllocation(null);
      setToast({
        message: err instanceof Error ? err.message : 'Failed to unlink allocation',
        type: 'error',
      });
    } finally {
      setUnlinkSubmitting(false);
    }
  };

  const contextLabel = payment
    ? `payment voucher ${payment.payment_number}`
    : creditNote
      ? `credit note ${creditNote.credit_note_number}`
      : documentNumber
        ? `document ${documentNumber}`
        : '';

  const isTrueEmpty = !loading && !error && allocations.length === 0;
  const isFilteredEmpty =
    !loading && !error && allocations.length > 0 && filteredAllocations.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchAllocations}
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
          Payment Allocations
        </h2>
        <p className="text-[#5f5e5e] text-body-sm mt-1">
          Track how cash payments and credit notes are applied against outstanding vendor
          obligations.
        </p>
      </div>

      {/* Context chip */}
      {contextLabel && (
        <div className="bg-[#f5efe6] border border-[#e8e2d8] px-4 py-3 rounded flex items-center gap-3 flex-wrap">
          <span className="material-symbols-outlined text-[#ae001a]" aria-hidden="true">
            call_split
          </span>
          <span className="text-sm text-[#1d1c17]">
            Showing allocations for <strong className="font-mono">{contextLabel}</strong>
          </span>
          {onClearContext && (
            <button
              type="button"
              onClick={onClearContext}
              className="ml-auto text-[11px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
            >
              View all allocations
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <span
            className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]"
            aria-hidden="true"
          >
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by document #, payment #, or credit note #..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search allocations"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as '' | 'payment' | 'credit_note')}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none min-w-[160px]"
          aria-label="Filter by allocation source"
        >
          <option value="">All Sources</option>
          <option value="payment">Direct Payment</option>
          <option value="credit_note">Credit Note Application</option>
        </select>
        <select
          value={documentTypeFilter}
          onChange={(e) => setDocumentTypeFilter(e.target.value)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by document type"
        >
          <option value="">All Types</option>
          {AP_ALLOCATION_DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {AP_DOCUMENT_TYPE_LABELS[t]}
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
            Allocate Payment / Credit
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
          data-testid="supplier-payment-allocations-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
            account_tree
          </span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No payment allocations found. Click &apos;Allocate Payment&apos; to apply funds or credit
            notes against pending vendor documents.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              add
            </span>
            Allocate Payment / Credit
          </button>
        </div>
      )}

      {/* Table */}
      {(loading || allocations.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              PAYMENT ALLOCATIONS
            </span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredAllocations.length} allocations`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Allocation
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Source Funding Document
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Target Debt Document
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Applied Amount
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
                        <span
                          className="material-symbols-outlined text-[#5f5e5e] text-4xl"
                          aria-hidden="true"
                        >
                          search_off
                        </span>
                        <p className="text-sm text-[#5f5e5e]">
                          No allocations match your active filters
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
                  filteredAllocations.map((a) => {
                    const isCreditNote = allocationSourceType(a) === 'credit_note';
                    return (
                      <tr
                        key={a.id}
                        onClick={() => setDetailAllocation(a)}
                        className="group hover:bg-[#f8f3eb] transition-colors cursor-pointer"
                      >
                        {/* Allocation id + timestamp */}
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17] font-mono">#{a.id}</p>
                          <p className="text-xs text-[#5f5e5e]">{formatDateTime(a.created_at)}</p>
                        </td>

                        {/* Source funding document — dual source disambiguation */}
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17] font-mono">
                            {isCreditNote
                              ? (a.credit_note?.credit_note_number ??
                                `Credit Note #${a.credit_note_id}`)
                              : (a.payment?.payment_number ?? `Payment #${a.payment_id}`)}
                          </p>
                          <span
                            className={`inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                              isCreditNote
                                ? 'bg-purple-500/10 text-purple-700'
                                : 'bg-blue-500/10 text-blue-700'
                            }`}
                          >
                            {isCreditNote ? 'Credit Note' : 'Payment Voucher'}
                          </span>
                        </td>

                        {/* Target debt document */}
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17] font-mono">{a.document_number}</p>
                          <span
                            className={`inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded ${documentTypeBadgeStyle(a.document_type)}`}
                          >
                            {documentTypeLabel(a.document_type)}
                          </span>
                        </td>

                        {/* Applied amount */}
                        <td className="px-6 py-4 text-right text-sm font-semibold text-[#1d1c17] whitespace-nowrap font-mono">
                          {formatCurrency(a.allocated_amount)}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUnlinkingAllocation(a);
                              }}
                              aria-label={`Unlink allocation ${a.id}`}
                              title="Unlink allocation and restore balances"
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                            >
                              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                                link_off
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

      <AccountsPayableQuickLinks active="allocations" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={openCreate}
        aria-label="Quick allocate funds"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-40"
      >
        <span className="material-symbols-outlined text-2xl" aria-hidden="true">
          add
        </span>
      </button>

      {formOpen && (
        <AllocationFormDrawer
          suppliers={suppliers}
          payments={payments}
          creditNotes={creditNotes}
          submitting={formSubmitting}
          formError={formError}
          authHeaders={authHeaders}
          onCancel={() => setFormOpen(false)}
          onSubmit={handleCreateSubmit}
        />
      )}

      {detailAllocation && (
        <AllocationDetailDrawer
          allocation={detailAllocation}
          supplierName={supplierNameById.get(detailAllocation.supplier_id)}
          onClose={() => setDetailAllocation(null)}
        />
      )}

      {unlinkingAllocation && (
        <ConfirmUnlinkDialog
          allocation={unlinkingAllocation}
          submitting={unlinkSubmitting}
          onCancel={() => setUnlinkingAllocation(null)}
          onConfirm={handleUnlinkConfirm}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

export default SupplierPaymentAllocationsView;
