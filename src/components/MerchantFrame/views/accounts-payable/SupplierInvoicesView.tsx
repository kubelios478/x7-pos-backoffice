import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  SupplierInvoice,
  SupplierInvoiceItem,
  SupplierInvoiceStatus,
  InvoiceSupplierRef,
  CreateSupplierInvoiceDto,
  UpdateSupplierInvoiceDto,
} from '../../../../types/accounts-payable';
import {
  SUPPLIER_INVOICE_STATUSES,
  SUPPLIER_INVOICE_STATUS_LABELS,
} from '../../../../types/accounts-payable';
import { AccountsPayableQuickLinks } from './AccountsPayableQuickLinks';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormFooter } from '../../shared/AppModal';
import { Toast } from '../../shared/Toast';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// ---- Helpers de coerción y formato ----

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

// Una factura está "vencida por antigüedad" si su fecha de vencimiento ya pasó
// respecto a la fecha del sistema y aún tiene saldo pendiente (balance_due > 0).
const isPastDue = (inv: Pick<SupplierInvoice, 'due_date' | 'balance_due'>): boolean => {
  const due = new Date(inv.due_date);
  if (isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime() && num(inv.balance_due) > 0;
};

const paymentProgress = (inv: Pick<SupplierInvoice, 'paid_amount' | 'total_amount'>): number => {
  const total = num(inv.total_amount);
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (num(inv.paid_amount) / total) * 100));
};

const STATUS_BADGE_STYLES: Record<SupplierInvoiceStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-700',
  partially_paid: 'bg-blue-500/10 text-blue-700',
  paid: 'bg-green-500/10 text-green-700',
  cancelled: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
};

// Una factura está bloqueada para edición financiera si ya recibió pagos o está saldada.
const isFinanciallyLocked = (inv: Pick<SupplierInvoice, 'paid_amount' | 'status'>): boolean =>
  num(inv.paid_amount) > 0 || inv.status === 'paid';

// ========================= FORM DRAWER (REGISTER / EDIT) =========================

interface InvoiceFormDrawerProps {
  mode: 'create' | 'edit';
  initial?: SupplierInvoice;
  suppliers: InvoiceSupplierRef[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (dto: CreateSupplierInvoiceDto | UpdateSupplierInvoiceDto) => void;
}

const InvoiceFormDrawer: React.FC<InvoiceFormDrawerProps> = ({
  mode,
  initial,
  suppliers,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const [supplierId, setSupplierId] = useState<string>(initial ? String(initial.supplier_id) : '');
  const [invoiceNumber, setInvoiceNumber] = useState(initial?.invoice_number ?? '');
  const [invoiceDate, setInvoiceDate] = useState(initial?.invoice_date?.slice(0, 10) ?? '');
  const [dueDate, setDueDate] = useState(initial?.due_date?.slice(0, 10) ?? '');
  const [subtotal, setSubtotal] = useState(initial ? String(num(initial.subtotal)) : '');
  const [taxTotal, setTaxTotal] = useState(initial ? String(num(initial.tax_total)) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  // Regla de madurez: la fecha de vencimiento no puede ser anterior a la de emisión.
  const maturityError =
    invoiceDate && dueDate && dueDate < invoiceDate
      ? 'Due date cannot be earlier than the invoice issuance date.'
      : '';

  const locked = mode === 'edit' && initial ? isFinanciallyLocked(initial) : false;

  const totalAmount = num(subtotal) + num(taxTotal);

  const fieldsValid =
    supplierId.trim().length > 0 &&
    invoiceNumber.trim().length > 0 &&
    invoiceNumber.length <= 100 &&
    invoiceDate.trim().length > 0 &&
    dueDate.trim().length > 0 &&
    !maturityError;

  // En edición, no permitir guardar si nada cambió respecto al registro original.
  const isUnchanged =
    mode === 'edit' &&
    !!initial &&
    Number(supplierId) === initial.supplier_id &&
    invoiceNumber.trim() === initial.invoice_number &&
    invoiceDate === (initial.invoice_date?.slice(0, 10) ?? '') &&
    dueDate === (initial.due_date?.slice(0, 10) ?? '') &&
    num(subtotal) === num(initial.subtotal) &&
    num(taxTotal) === num(initial.tax_total) &&
    (notes ?? '').trim() === (initial.notes ?? '').trim();

  const canSubmit = fieldsValid && !isUnchanged;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    if (mode === 'create') {
      onSubmit({
        supplier_id: Number(supplierId),
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate,
        due_date: dueDate,
        subtotal: num(subtotal),
        tax_total: num(taxTotal),
        total_amount: totalAmount, // El backend lo exige (= subtotal + tax_total).
        notes: notes.trim() || null,
      });
      return;
    }

    // En edición, los campos financieros bloqueados no se reenvían.
    const dto: UpdateSupplierInvoiceDto = {
      invoice_number: invoiceNumber.trim(),
      invoice_date: invoiceDate,
      due_date: dueDate,
      notes: notes.trim() || null,
    };
    if (!locked) {
      dto.supplier_id = Number(supplierId);
      dto.subtotal = num(subtotal);
      dto.tax_total = num(taxTotal);
    }
    onSubmit(dto);
  };

  useModalDismiss(onCancel);

  return (
    <AppModal
      title={mode === 'create' ? 'Register Invoice' : 'Edit Invoice'}
      subtitle="Accounts Payable"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
      closeAriaLabel="Close invoice form"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-left">
            {locked && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded text-xs">
                <span className="material-symbols-outlined text-base">lock</span>
                <span>
                  This invoice has recorded payments. Core financial fields (supplier, subtotal, tax)
                  are locked to preserve accounting auditability.
                </span>
              </div>
            )}

            {/* Supplier */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="invoice-supplier" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Supplier <span className="text-[#ae001a]">*</span>
              </label>
              <select
                id="invoice-supplier"
                autoFocus
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
                {/* Garantiza que el proveedor actual sea seleccionable aun si no vino en la lista */}
                {initial?.supplier && !suppliers.some((s) => s.id === initial.supplier_id) && (
                  <option value={initial.supplier_id}>{initial.supplier.name}</option>
                )}
              </select>
            </div>

            {/* Invoice number */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="invoice-number" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Invoice Number <span className="text-[#ae001a]">*</span>
              </label>
              <input
                id="invoice-number"
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                maxLength={120}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono"
                placeholder="e.g., INV-2026-0042"
              />
              <span className={`text-[11px] ${invoiceNumber.length > 100 ? 'text-[#ae001a] font-bold' : 'text-[#5f5e5e]'}`}>
                {invoiceNumber.length}/100
              </span>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="invoice-date" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Invoice Date <span className="text-[#ae001a]">*</span>
                </label>
                <input
                  id="invoice-date"
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="invoice-due-date" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Due Date <span className="text-[#ae001a]">*</span>
                </label>
                <input
                  id="invoice-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={`bg-white text-[#1d1c17] px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-[#ae001a] outline-none w-full ${
                    maturityError ? 'border-[#ae001a]' : 'border-[#e8e2d8] focus:border-[#ae001a]'
                  }`}
                />
              </div>
            </div>
            {maturityError && (
              <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
                {maturityError}
              </p>
            )}

            {/* Amounts */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="invoice-subtotal" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Subtotal
                </label>
                <input
                  id="invoice-subtotal"
                  type="number"
                  step="0.01"
                  min="0"
                  value={subtotal}
                  onChange={(e) => setSubtotal(e.target.value)}
                  disabled={locked}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono disabled:bg-[#f2ede5] disabled:cursor-not-allowed"
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="invoice-tax-total" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Tax Total
                </label>
                <input
                  id="invoice-tax-total"
                  type="number"
                  step="0.01"
                  min="0"
                  value={taxTotal}
                  onChange={(e) => setTaxTotal(e.target.value)}
                  disabled={locked}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono disabled:bg-[#f2ede5] disabled:cursor-not-allowed"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Derived total */}
            <div className="flex items-center justify-between bg-[#222222] text-white px-4 py-3 rounded">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Total Amount</span>
              <span className="text-lg font-black" data-testid="invoice-total-preview">
                {formatCurrency(totalAmount)}
              </span>
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="invoice-notes" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Notes
              </label>
              <textarea
                id="invoice-notes"
                value={notes ?? ''}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full resize-none"
                placeholder="Optional internal memo for this vendor bill"
              />
            </div>

          <ModalFormFooter
            onCancel={onCancel}
            submitLabel={submitting ? 'Saving…' : 'Save Invoice'}
            isSubmitting={submitting}
            submitDisabled={!canSubmit}
          />
        </form>
    </AppModal>
  );
};

// ========================= DETAIL DRAWER =========================

interface InvoiceDetailDrawerProps {
  invoice: SupplierInvoice;
  onClose: () => void;
}

const InvoiceDetailDrawer: React.FC<InvoiceDetailDrawerProps> = ({ invoice, onClose }) => {
  const progress = paymentProgress(invoice);
  useModalDismiss(onClose);
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex justify-end font-sans">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invoice Details"
        className="relative w-full max-w-md bg-[#fcfbfa] h-full shadow-2xl z-10 flex flex-col border-l border-[#e8e2d8] animate-slide-in text-left"
      >
        <div className="bg-[#222222] px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-white text-xl">receipt</span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-white">Invoice Details</span>
          </div>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-[#1c1b16] tracking-tight font-mono">{invoice.invoice_number}</h2>
              {isPastDue(invoice) ? (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-500/10 text-red-700">
                  Overdue
                </span>
              ) : (
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_STYLES[invoice.status]}`}
                >
                  {SUPPLIER_INVOICE_STATUS_LABELS[invoice.status]}
                </span>
              )}
            </div>
            <p className="text-xs text-[#5f5e5e] mt-1 uppercase tracking-wider font-semibold">
              {invoice.supplier?.name ?? `Supplier #${invoice.supplier_id}`}
            </p>
          </div>

          {/* Supplier contact */}
          <div className="border-t border-[#e8e2d8] pt-5 space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">Supplier Contact</h4>
            <div className="flex gap-3">
              <span className="material-symbols-outlined text-base text-[#5f5e5e]">mail</span>
              <span className="text-xs text-[#1c1b16]">{invoice.supplier?.email || 'No email provided'}</span>
            </div>
            <div className="flex gap-3">
              <span className="material-symbols-outlined text-base text-[#5f5e5e]">phone</span>
              <span className="text-xs text-[#1c1b16]">{invoice.supplier?.phone || 'No phone provided'}</span>
            </div>
          </div>

          {/* Schedule */}
          <div className="border-t border-[#e8e2d8] pt-5 grid grid-cols-2 gap-4">
            <div className="bg-[#f5efe6] p-3 border border-[#e8e2d8]">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e] mb-1">Invoice Date</span>
              <span className="text-xs font-semibold text-[#1c1b16]">{formatDate(invoice.invoice_date)}</span>
            </div>
            <div className="bg-[#f5efe6] p-3 border border-[#e8e2d8]">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e] mb-1">Due Date</span>
              <span className={`text-xs font-semibold ${isPastDue(invoice) ? 'text-red-600 font-bold' : 'text-[#1c1b16]'}`}>
                {formatDate(invoice.due_date)}
              </span>
            </div>
          </div>

          {/* Payment progress */}
          <div className="border-t border-[#e8e2d8] pt-5 space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">Payment Progress</h4>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e]">Total</span>
                <span className="text-sm font-black text-[#1c1b16]">{formatCurrency(invoice.total_amount)}</span>
              </div>
              <div>
                <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e]">Paid</span>
                <span className="text-sm font-black text-green-700">{formatCurrency(invoice.paid_amount)}</span>
              </div>
              <div>
                <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e]">Balance</span>
                <span className="text-sm font-black text-[#ae001a]">{formatCurrency(invoice.balance_due)}</span>
              </div>
            </div>
            <div className="h-2 w-full bg-[#e8e2d8] rounded-full overflow-hidden">
              <div className="h-full bg-green-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-[11px] text-[#5f5e5e] text-right">{Math.round(progress)}% settled</p>
          </div>

          {/* Line items */}
          <div className="border-t border-[#e8e2d8] pt-5 space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">
              Line Items ({invoice.items?.length ?? 0})
            </h4>
            {invoice.items && invoice.items.length > 0 ? (
              <ul className="space-y-2">
                {invoice.items.map((item) => (
                  <li key={item.id} className="flex justify-between items-start gap-3 bg-[#f5efe6] border border-[#e8e2d8] p-3">
                    <div>
                      <p className="text-xs font-semibold text-[#1c1b16]">{item.description}</p>
                      <p className="text-[10px] text-[#5f5e5e]">
                        {num(item.quantity)} × {formatCurrency(item.unit_price)}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-[#1c1b16] whitespace-nowrap">
                      {formatCurrency(item.line_total)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#5f5e5e] italic">No line items recorded for this invoice.</p>
            )}
          </div>

          {invoice.notes && (
            <div className="border-t border-[#e8e2d8] pt-5 space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">Notes</h4>
              <p className="text-xs text-[#1c1b16] leading-relaxed">{invoice.notes}</p>
            </div>
          )}
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
  invoice: SupplierInvoice;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmDeleteDialog: React.FC<ConfirmDeleteDialogProps> = ({
  invoice,
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
        aria-label="Delete Invoice"
        className="relative bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-sm p-6 text-left"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-red-50 border border-red-100 text-[#ae001a]">
            <span className="material-symbols-outlined text-2xl">delete</span>
          </div>
          <div className="space-y-2">
            <p className="font-bold text-[#1d1c17]">Delete this supplier invoice?</p>
            <p className="text-sm text-[#5f5e5e] leading-relaxed">
              Invoice <span className="font-mono font-semibold">{invoice.invoice_number}</span> will be
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

// ========================= RESTORE CONFIRM DIALOG =========================

interface ConfirmRestoreDialogProps {
  invoice: SupplierInvoice;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmRestoreDialog: React.FC<ConfirmRestoreDialogProps> = ({
  invoice,
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
        aria-label="Restore Invoice"
        className="relative bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-sm p-6 text-left"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-emerald-50 border border-emerald-100 text-emerald-600">
            <span className="material-symbols-outlined text-2xl">check</span>
          </div>
          <div className="space-y-2">
            <p className="font-bold text-[#1d1c17]">Restore this supplier invoice?</p>
            <p className="text-sm text-[#5f5e5e] leading-relaxed">
              Invoice <span className="font-mono font-semibold">{invoice.invoice_number}</span> will be
              un-archived and returned to the active directory.
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
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
          >
            {submitting ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ========================= MAIN VIEW =========================

interface SupplierInvoicesViewProps {
  onNavigate?: (view: string) => void;
  companyId?: number;
}

export const SupplierInvoicesView: React.FC<SupplierInvoicesViewProps> = ({ onNavigate, companyId }) => {
  const activeCompanyId = companyId ?? 1;

  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<InvoiceSupplierRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Vista: directorio activo vs. archivadas (soft-deleted).
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  // 'overdue' es un estado DERIVADO (due_date < hoy && balance > 0), no persistido en el backend.
  const [statusFilter, setStatusFilter] = useState<'' | SupplierInvoiceStatus | 'overdue'>('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Modales / drawers
  const [formDrawer, setFormDrawer] = useState<null | { mode: 'create' | 'edit'; invoice?: SupplierInvoice }>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState<SupplierInvoice | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<SupplierInvoice | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [restoringInvoice, setRestoringInvoice] = useState<SupplierInvoice | null>(null);
  const [restoreSubmitting, setRestoreSubmitting] = useState(false);
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

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      // El scoping por empresa lo resuelve el backend vía JWT; sólo pedimos un límite alto.
      // En modo "archived" pedimos las soft-deleted con only_deleted=true.
      const query = viewMode === 'archived' ? 'only_deleted=true&limit=100' : 'limit=100';
      const res = await fetch(
        `${API_BASE}/supplier-invoices?${query}`,
        { headers: authHeaders() },
      );
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) throw new Error('Error al cargar las facturas de proveedores');
      const json = await res.json();
      // Activo: excluye soft-deleted. Archivado: sólo soft-deleted.
      const list = (json.data ?? []).filter((inv: SupplierInvoice) =>
        viewMode === 'archived' ? !!inv.deleted_at : !inv.deleted_at,
      );
      setInvoices(list);
    } catch (err) {
      console.error('Error fetching supplier invoices:', err);
      setError('Failed to load supplier invoices. Please check if the backend is running.');
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
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId, viewMode]);

  useEffect(() => {
    fetchSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  // Opciones del filtro por proveedor: unión de proveedores fetchados y los presentes en facturas.
  const supplierOptions = useMemo(() => {
    const map = new Map<number, string>();
    suppliers.forEach((s) => map.set(s.id, s.name));
    invoices.forEach((inv) => {
      if (inv.supplier) map.set(inv.supplier.id, inv.supplier.name);
      else if (!map.has(inv.supplier_id)) map.set(inv.supplier_id, `Supplier #${inv.supplier_id}`);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers, invoices]);

  const filteredInvoices = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (term) {
        const haystack = [
          inv.invoice_number,
          inv.supplier?.name ?? '',
          inv.notes ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (supplierFilter && String(inv.supplier_id) !== supplierFilter) return false;
      if (statusFilter === 'overdue') {
        if (!isPastDue(inv)) return false;
      } else if (statusFilter && inv.status !== statusFilter) {
        return false;
      }
      if (overdueOnly && !isPastDue(inv)) return false;
      return true;
    });
  }, [invoices, searchQuery, supplierFilter, statusFilter, overdueOnly]);

  const hasActiveFilter = Boolean(searchQuery || supplierFilter || statusFilter || overdueOnly);
  const clearFilters = () => {
    setSearchQuery('');
    setSupplierFilter('');
    setStatusFilter('');
    setOverdueOnly(false);
  };

  const handleCreateSubmit = async (dto: CreateSupplierInvoiceDto) => {
    setFormSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/supplier-invoices`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ...dto, company_id: activeCompanyId }),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to register invoice');
      setInvoices((prev) => [json.data, ...prev]);
      setFormDrawer(null);
      setToast({ message: 'Invoice registered successfully', type: 'success' });
    } catch (err: any) {
      setFormDrawer(null);
      setToast({ message: err.message || 'Failed to register invoice', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (invoiceId: number, dto: UpdateSupplierInvoiceDto) => {
    setFormSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/supplier-invoices/${invoiceId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(dto),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to update invoice');
      setInvoices((prev) => prev.map((inv) => (inv.id === json.data.id ? json.data : inv)));
      setFormDrawer(null);
      setToast({ message: 'Invoice updated successfully', type: 'success' });
    } catch (err: any) {
      setFormDrawer(null);
      setToast({ message: err.message || 'Failed to update invoice', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingInvoice) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/supplier-invoices/${deletingInvoice.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to delete invoice');
      }
      // Soft-delete: se retira del directorio activo sin purga física.
      setInvoices((prev) => prev.filter((inv) => inv.id !== deletingInvoice.id));
      setDeletingInvoice(null);
      setToast({ message: 'Invoice deleted successfully', type: 'success' });
    } catch (err: any) {
      setDeletingInvoice(null);
      setToast({ message: err.message || 'Failed to delete invoice', type: 'error' });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleRestoreConfirm = async () => {
    if (!restoringInvoice) return;
    setRestoreSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/supplier-invoices/${restoringInvoice.id}/restore`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to restore invoice');
      }
      // Restaurada: sale del listado de archivadas.
      setInvoices((prev) => prev.filter((inv) => inv.id !== restoringInvoice.id));
      setRestoringInvoice(null);
      setToast({ message: 'Invoice restored successfully', type: 'success' });
    } catch (err: any) {
      setRestoringInvoice(null);
      setToast({ message: err.message || 'Failed to restore invoice', type: 'error' });
    } finally {
      setRestoreSubmitting(false);
    }
  };

  const handleRowClick = async (invoiceId: number) => {
    try {
      const res = await fetch(`${API_BASE}/supplier-invoices/${invoiceId}`, {
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to load invoice details');
      const inv: SupplierInvoice = json.data;

      // El backend devuelve la factura plana: resolvemos el contacto del proveedor
      // desde la lista fetchada y cargamos los items de la factura por separado.
      const supplier =
        suppliers.find((s) => s.id === inv.supplier_id) ?? inv.supplier ?? null;

      let items: SupplierInvoiceItem[] = [];
      try {
        const itemsRes = await fetch(
          `${API_BASE}/supplier-invoice-items?invoice_id=${invoiceId}&limit=100`,
          { headers: authHeaders() },
        );
        if (itemsRes.ok) {
          const ij = await itemsRes.json();
          items = (ij.data ?? []).filter((it: SupplierInvoiceItem) => !it.deleted_at);
        }
      } catch {
        /* los items son opcionales para el detalle */
      }

      setDetailInvoice({ ...inv, supplier, items });
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to load invoice details', type: 'error' });
    }
  };

  const isTrueEmpty = !loading && !error && invoices.length === 0;
  const isFilteredEmpty = !loading && !error && invoices.length > 0 && filteredInvoices.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchInvoices}
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
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase">Supplier Invoices</h2>
          <p className="text-[#5f5e5e] text-body-sm mt-1">
            Track pending vendor liabilities, review issuance vs. maturity schedules, and monitor
            outstanding balances against total amounts.
          </p>
        </div>
        {/* Directorio activo vs. archivadas */}
        <div
          role="tablist"
          aria-label="Invoice directory view"
          className="inline-flex rounded border border-[#e8e2d8] overflow-hidden shrink-0 self-start"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'active'}
            onClick={() => setViewMode('active')}
            className={`px-4 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors ${
              viewMode === 'active' ? 'bg-[#ae001a] text-white' : 'bg-white text-[#5f5e5e] hover:text-[#ae001a]'
            }`}
          >
            Active
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'archived'}
            onClick={() => setViewMode('archived')}
            className={`px-4 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 border-l border-[#e8e2d8] ${
              viewMode === 'archived' ? 'bg-[#ae001a] text-white' : 'bg-white text-[#5f5e5e] hover:text-[#ae001a]'
            }`}
          >
            <span className="material-symbols-outlined text-sm">inventory_2</span>
            Archived
          </button>
        </div>
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
              placeholder="Search by invoice #, supplier, or notes..."
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
              aria-label="Search supplier invoices"
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | SupplierInvoiceStatus | 'overdue')}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            {SUPPLIER_INVOICE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUPPLIER_INVOICE_STATUS_LABELS[s]}
              </option>
            ))}
            <option value="overdue">Overdue</option>
          </select>
          {!isTrueEmpty && viewMode === 'active' && (
            <button
              type="button"
              onClick={() => setFormDrawer({ mode: 'create' })}
              className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Register Invoice
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => setOverdueOnly((v) => !v)}
            aria-pressed={overdueOnly}
            className={`flex items-center gap-2 px-4 py-2 rounded text-[11px] font-bold uppercase tracking-widest border transition-colors ${
              overdueOnly
                ? 'bg-[#ae001a] border-[#ae001a] text-white'
                : 'bg-white border-[#e8e2d8] text-[#5f5e5e] hover:text-[#ae001a] hover:border-[#ae001a]'
            }`}
          >
            <span className="material-symbols-outlined text-base">event_busy</span>
            Overdue Only
          </button>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* True empty state */}
      {isTrueEmpty && (
        <div
          data-testid="supplier-invoices-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">
            {viewMode === 'archived' ? 'inventory_2' : 'receipt_long'}
          </span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            {viewMode === 'archived'
              ? 'No archived invoices. Deleted invoices appear here and can be restored.'
              : "No supplier invoices found. Click 'Register Invoice' to record a new vendor bill."}
          </p>
          {viewMode === 'active' && (
            <button
              type="button"
              onClick={() => setFormDrawer({ mode: 'create' })}
              className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Register Invoice
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {(loading || invoices.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">SUPPLIER INVOICES</span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredInvoices.length} invoices`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Invoice &amp; Vendor
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Issuance / Maturity
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Total
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Paid
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Balance Due
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
                        <p className="text-sm text-[#5f5e5e]">No invoices match your active filters</p>
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
                  filteredInvoices.map((inv) => {
                    const pastDue = isPastDue(inv);
                    const progress = paymentProgress(inv);
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => viewMode === 'active' && handleRowClick(inv.id)}
                        className={`group hover:bg-[#f8f3eb] transition-colors ${
                          viewMode === 'active' ? 'cursor-pointer' : 'opacity-75'
                        }`}
                      >
                        {/* Invoice & vendor */}
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17] font-mono">{inv.invoice_number}</p>
                          <p className="text-xs text-[#5f5e5e]">{inv.supplier?.name ?? `Supplier #${inv.supplier_id}`}</p>
                        </td>

                        {/* Dates */}
                        <td className="px-6 py-4 text-xs">
                          <p className="text-[#5f5e5e]">
                            <span className="text-[10px] uppercase tracking-wider text-[#5f5e5e]/70">Issued </span>
                            {formatDate(inv.invoice_date)}
                          </p>
                          <p
                            data-testid={`invoice-due-${inv.id}`}
                            className={pastDue ? 'text-red-600 font-bold' : 'text-[#1d1c17]'}
                          >
                            <span className="text-[10px] uppercase tracking-wider text-[#5f5e5e]/70 font-normal">Due </span>
                            {formatDate(inv.due_date)}
                          </p>
                        </td>

                        {/* Financials */}
                        <td className="px-6 py-4 text-right text-sm font-semibold text-[#1d1c17] whitespace-nowrap">
                          {formatCurrency(inv.total_amount)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-green-700 whitespace-nowrap">
                          {formatCurrency(inv.paid_amount)}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <p className="text-sm font-bold text-[#ae001a]">{formatCurrency(inv.balance_due)}</p>
                          <div className="h-1.5 w-24 ml-auto mt-1 bg-[#e8e2d8] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-600 rounded-full"
                              style={{ width: `${progress}%` }}
                              aria-hidden="true"
                            />
                          </div>
                        </td>

                        {/* Status (OVERDUE derivado tiene prioridad visual sobre el estado guardado) */}
                        <td className="px-6 py-4 text-center">
                          {pastDue ? (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-500/10 text-red-700">
                              Overdue
                            </span>
                          ) : (
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_STYLES[inv.status]}`}
                            >
                              {SUPPLIER_INVOICE_STATUS_LABELS[inv.status]}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                            {viewMode === 'active' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFormDrawer({ mode: 'edit', invoice: inv });
                                  }}
                                  aria-label="Edit invoice"
                                  title="Edit invoice"
                                  className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                                >
                                  <span className="material-symbols-outlined text-[20px]">edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingInvoice(inv);
                                  }}
                                  aria-label="Delete invoice"
                                  title="Delete invoice"
                                  className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                                >
                                  <span className="material-symbols-outlined text-[20px]">delete</span>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRestoringInvoice(inv);
                                }}
                                aria-label="Restore invoice"
                                title="Restore invoice"
                                className="p-1 text-[#1d1c17] hover:text-emerald-600 transition-colors duration-200"
                              >
                                <span className="material-symbols-outlined text-[20px]">check</span>
                              </button>
                            )}
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

      <AccountsPayableQuickLinks active="invoices" onNavigate={onNavigate} />

      {viewMode === 'active' && (
        <button
          type="button"
          onClick={() => setFormDrawer({ mode: 'create' })}
          aria-label="Quick create invoice"
          className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-40"
        >
          <span className="material-symbols-outlined text-2xl">add</span>
        </button>
      )}

      {formDrawer && (
        <InvoiceFormDrawer
          mode={formDrawer.mode}
          initial={formDrawer.invoice}
          suppliers={suppliers}
          submitting={formSubmitting}
          onCancel={() => setFormDrawer(null)}
          onSubmit={(dto) =>
            formDrawer.mode === 'create'
              ? handleCreateSubmit(dto as CreateSupplierInvoiceDto)
              : handleEditSubmit(formDrawer.invoice!.id, dto as UpdateSupplierInvoiceDto)
          }
        />
      )}

      {detailInvoice && (
        <InvoiceDetailDrawer invoice={detailInvoice} onClose={() => setDetailInvoice(null)} />
      )}

      {deletingInvoice && (
        <ConfirmDeleteDialog
          invoice={deletingInvoice}
          submitting={deleteSubmitting}
          onCancel={() => setDeletingInvoice(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {restoringInvoice && (
        <ConfirmRestoreDialog
          invoice={restoringInvoice}
          submitting={restoreSubmitting}
          onCancel={() => setRestoringInvoice(null)}
          onConfirm={handleRestoreConfirm}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

export default SupplierInvoicesView;
