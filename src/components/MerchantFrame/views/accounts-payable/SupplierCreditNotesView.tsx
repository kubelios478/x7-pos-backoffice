import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  SupplierCreditNote,
  SupplierCreditNoteStatus,
  SupplierPaymentAllocation,
  InvoiceSupplierRef,
  CreateSupplierCreditNoteDto,
  UpdateSupplierCreditNoteDto,
} from '../../../../types/accounts-payable';
import {
  SUPPLIER_CREDIT_NOTE_STATUSES,
  SUPPLIER_CREDIT_NOTE_STATUS_LABELS,
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

const remainingBalance = (cn: Pick<SupplierCreditNote, 'total_amount' | 'applied_amount'>): number =>
  Math.max(0, num(cn.total_amount) - num(cn.applied_amount));

// Una nota de crédito con monto aplicado bloquea sus campos estructurales.
const isApplied = (cn: Pick<SupplierCreditNote, 'applied_amount'>): boolean => num(cn.applied_amount) > 0;

const STATUS_BADGE_STYLES: Record<SupplierCreditNoteStatus, string> = {
  draft: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  issued: 'bg-blue-500/10 text-blue-700',
  partially_applied: 'bg-amber-500/10 text-amber-700',
  fully_applied: 'bg-green-500/10 text-green-700',
  cancelled: 'bg-red-500/10 text-red-700',
};

// ========================= FORM DRAWER (ISSUE / EDIT) =========================

interface CreditNoteFormDrawerProps {
  mode: 'create' | 'edit';
  initial?: SupplierCreditNote;
  suppliers: InvoiceSupplierRef[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (dto: CreateSupplierCreditNoteDto | UpdateSupplierCreditNoteDto) => void;
}

const CreditNoteFormDrawer: React.FC<CreditNoteFormDrawerProps> = ({
  mode,
  initial,
  suppliers,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const [supplierId, setSupplierId] = useState<string>(initial ? String(initial.supplier_id) : '');
  const [creditNoteNumber, setCreditNoteNumber] = useState(initial?.credit_note_number ?? '');
  const [issueDate, setIssueDate] = useState(initial?.issue_date?.slice(0, 10) ?? '');
  const [totalAmount, setTotalAmount] = useState(initial ? String(num(initial.total_amount)) : '');
  const [status, setStatus] = useState<SupplierCreditNoteStatus>(initial?.status ?? 'draft');

  const appliedAmount = num(initial?.applied_amount);
  // Lock de auditoría: si ya hay monto aplicado, supplier_id y total_amount son read-only.
  const locked = mode === 'edit' && appliedAmount > 0;

  // Guard: no permitir marcar FULLY_APPLIED salvo que applied === total.
  const totalNum = num(totalAmount);
  const fullyAppliedError =
    status === 'fully_applied' && appliedAmount !== totalNum
      ? 'Cannot mark as Fully Applied unless the applied amount equals the total amount.'
      : '';

  const fieldsValid =
    supplierId.trim().length > 0 &&
    creditNoteNumber.trim().length > 0 &&
    creditNoteNumber.length <= 100 &&
    issueDate.trim().length > 0 &&
    totalNum > 0 &&
    !fullyAppliedError;

  const isUnchanged =
    mode === 'edit' &&
    !!initial &&
    Number(supplierId) === initial.supplier_id &&
    creditNoteNumber.trim() === initial.credit_note_number &&
    issueDate === (initial.issue_date?.slice(0, 10) ?? '') &&
    num(totalAmount) === num(initial.total_amount) &&
    status === initial.status;

  const canSubmit = fieldsValid && !isUnchanged;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    if (mode === 'create') {
      onSubmit({
        supplier_id: Number(supplierId),
        credit_note_number: creditNoteNumber.trim(),
        issue_date: issueDate,
        total_amount: totalNum,
      });
      return;
    }

    const dto: UpdateSupplierCreditNoteDto = {
      credit_note_number: creditNoteNumber.trim(),
      issue_date: issueDate,
      status,
    };
    if (!locked) {
      dto.supplier_id = Number(supplierId);
      dto.total_amount = totalNum;
    }
    onSubmit(dto);
  };

  useModalDismiss(onCancel);

  return (
    <AppModal
      title={mode === 'create' ? 'Issue Credit Note' : 'Edit Credit Note'}
      subtitle="Accounts Payable"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
      closeAriaLabel="Close credit note form"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-left">
            {locked && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded text-xs">
                <span className="material-symbols-outlined text-base">lock</span>
                <span>
                  This credit note has applied allocations. Core fields (supplier, total amount) are
                  locked to preserve audit integrity.
                </span>
              </div>
            )}

            {/* Supplier */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cn-supplier" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Supplier <span className="text-[#ae001a]">*</span>
              </label>
              <select
                id="cn-supplier"
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

            {/* Credit note number */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cn-number" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Credit Note Number <span className="text-[#ae001a]">*</span>
              </label>
              <input
                id="cn-number"
                type="text"
                value={creditNoteNumber}
                onChange={(e) => setCreditNoteNumber(e.target.value)}
                maxLength={120}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono"
                placeholder="e.g., CN-2026-0042"
              />
              <span className={`text-[11px] ${creditNoteNumber.length > 100 ? 'text-[#ae001a] font-bold' : 'text-[#5f5e5e]'}`}>
                {creditNoteNumber.length}/100
              </span>
            </div>

            {/* Issue date + total */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cn-issue-date" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Issue Date <span className="text-[#ae001a]">*</span>
                </label>
                <input
                  id="cn-issue-date"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cn-total" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Total Amount <span className="text-[#ae001a]">*</span>
                </label>
                <input
                  id="cn-total"
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
            </div>

            {/* Applied (read-only) + status (edit only) */}
            {mode === 'edit' && (
              <>
                <div className="flex items-center justify-between bg-[#f5efe6] border border-[#e8e2d8] px-4 py-3 rounded text-sm">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">Applied Amount</span>
                  <span className="font-bold text-[#1d1c17] font-mono">{formatCurrency(appliedAmount)}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="cn-status" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                    Status
                  </label>
                  <select
                    id="cn-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as SupplierCreditNoteStatus)}
                    className={`bg-white text-[#1d1c17] px-3 py-2 border rounded text-sm focus:ring-1 focus:ring-[#ae001a] outline-none w-full ${
                      fullyAppliedError ? 'border-[#ae001a]' : 'border-[#e8e2d8] focus:border-[#ae001a]'
                    }`}
                  >
                    {SUPPLIER_CREDIT_NOTE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {SUPPLIER_CREDIT_NOTE_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  {fullyAppliedError && (
                    <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
                      {fullyAppliedError}
                    </p>
                  )}
                </div>
              </>
            )}
          <ModalFormFooter
            onCancel={onCancel}
            submitLabel={submitting ? 'Saving…' : mode === 'create' ? 'Issue Credit Note' : 'Save Credit Note'}
            isSubmitting={submitting}
            submitDisabled={!canSubmit}
          />
        </form>
    </AppModal>
  );
};

// ========================= DETAIL DRAWER =========================

interface CreditNoteDetailDrawerProps {
  creditNote: SupplierCreditNote;
  allocations: SupplierPaymentAllocation[] | null; // null = loading
  onClose: () => void;
  onManageAllocations?: () => void;
}

const CreditNoteDetailDrawer: React.FC<CreditNoteDetailDrawerProps> = ({
  creditNote,
  allocations,
  onClose,
  onManageAllocations,
}) => {
  useModalDismiss(onClose);
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex justify-end font-sans">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Credit Note Details"
        className="relative w-full max-w-md bg-[#fcfbfa] h-full shadow-2xl z-10 flex flex-col border-l border-[#e8e2d8] animate-slide-in text-left"
      >
        <div className="bg-[#222222] px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-white text-xl">assignment_return</span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-white">Credit Note Details</span>
          </div>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-[#1c1b16] tracking-tight font-mono">
                {creditNote.credit_note_number}
              </h2>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_STYLES[creditNote.status]}`}
              >
                {SUPPLIER_CREDIT_NOTE_STATUS_LABELS[creditNote.status]}
              </span>
            </div>
            <p className="text-xs text-[#5f5e5e] mt-1 uppercase tracking-wider font-semibold">
              {creditNote.supplier?.name ?? `Supplier #${creditNote.supplier_id}`} · Issued{' '}
              {formatDate(creditNote.issue_date)}
            </p>
          </div>

          <div className="border-t border-[#e8e2d8] pt-5 grid grid-cols-3 gap-3 text-center">
            <div>
              <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e]">Total</span>
              <span className="text-sm font-black text-[#1c1b16]">{formatCurrency(creditNote.total_amount)}</span>
            </div>
            <div>
              <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e]">Applied</span>
              <span className="text-sm font-black text-green-700">{formatCurrency(creditNote.applied_amount)}</span>
            </div>
            <div>
              <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e]">Remaining</span>
              <span className="text-sm font-black text-[#ae001a]">{formatCurrency(remainingBalance(creditNote))}</span>
            </div>
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
              <p className="text-xs text-[#5f5e5e] italic">No allocations applied to this credit note yet.</p>
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
  creditNote: SupplierCreditNote;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmDeleteDialog: React.FC<ConfirmDeleteDialogProps> = ({
  creditNote,
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
        aria-label="Delete Credit Note"
        className="relative bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-sm p-6 text-left"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-red-50 border border-red-100 text-[#ae001a]">
            <span className="material-symbols-outlined text-2xl">delete</span>
          </div>
          <div className="space-y-2">
            <p className="font-bold text-[#1d1c17]">Delete this credit note?</p>
            <p className="text-sm text-[#5f5e5e] leading-relaxed">
              Credit note <span className="font-mono font-semibold">{creditNote.credit_note_number}</span> will
              be soft-deleted (archived) and removed from active views. The underlying record is preserved
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

interface SupplierCreditNotesViewProps {
  onNavigate?: (view: string) => void;
  companyId?: number;
  // Salta a la matriz de asignaciones ya filtrada por esta nota de crédito.
  onViewAllocations?: (creditNote: SupplierCreditNote) => void;
}

export const SupplierCreditNotesView: React.FC<SupplierCreditNotesViewProps> = ({
  onNavigate,
  companyId,
  onViewAllocations,
}) => {
  const activeCompanyId = companyId ?? 1;

  const [creditNotes, setCreditNotes] = useState<SupplierCreditNote[]>([]);
  const [suppliers, setSuppliers] = useState<InvoiceSupplierRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'' | SupplierCreditNoteStatus>('');

  const [formDrawer, setFormDrawer] = useState<null | { mode: 'create' | 'edit'; creditNote?: SupplierCreditNote }>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [detailNote, setDetailNote] = useState<SupplierCreditNote | null>(null);
  const [detailAllocations, setDetailAllocations] = useState<SupplierPaymentAllocation[] | null>(null);
  const [deletingNote, setDeletingNote] = useState<SupplierCreditNote | null>(null);
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

  // Resuelve el nombre del proveedor (el backend no lo embebe en la nota).
  const supplierNameById = useMemo(() => {
    const map = new Map<number, string>();
    suppliers.forEach((s) => map.set(s.id, s.name));
    return map;
  }, [suppliers]);

  const withSupplier = (cn: SupplierCreditNote): SupplierCreditNote => ({
    ...cn,
    supplier: cn.supplier ?? (supplierNameById.has(cn.supplier_id)
      ? { id: cn.supplier_id, name: supplierNameById.get(cn.supplier_id)! }
      : cn.supplier),
  });

  const fetchCreditNotes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/supplier-credit-notes?limit=100`, { headers: authHeaders() });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) throw new Error('Error al cargar las notas de crédito');
      const json = await res.json();
      const active = (json.data ?? []).filter((cn: SupplierCreditNote) => !cn.deleted_at);
      setCreditNotes(active);
    } catch (err) {
      console.error('Error fetching supplier credit notes:', err);
      setError('Failed to load supplier credit notes. Please check if the backend is running.');
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
    fetchCreditNotes();
    fetchSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  const supplierOptions = useMemo(() => {
    const map = new Map<number, string>();
    suppliers.forEach((s) => map.set(s.id, s.name));
    creditNotes.forEach((cn) => {
      if (!map.has(cn.supplier_id)) map.set(cn.supplier_id, `Supplier #${cn.supplier_id}`);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers, creditNotes]);

  const filteredNotes = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return creditNotes.map(withSupplier).filter((cn) => {
      if (term) {
        const haystack = [cn.credit_note_number, cn.supplier?.name ?? ''].join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (supplierFilter && String(cn.supplier_id) !== supplierFilter) return false;
      if (statusFilter && cn.status !== statusFilter) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creditNotes, suppliers, searchQuery, supplierFilter, statusFilter]);

  const hasActiveFilter = Boolean(searchQuery || supplierFilter || statusFilter);
  const clearFilters = () => {
    setSearchQuery('');
    setSupplierFilter('');
    setStatusFilter('');
  };

  const handleCreateSubmit = async (dto: CreateSupplierCreditNoteDto) => {
    setFormSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/supplier-credit-notes`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ...dto, company_id: activeCompanyId }),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to issue credit note');
      setCreditNotes((prev) => [json.data, ...prev]);
      setFormDrawer(null);
      setToast({ message: 'Credit note issued successfully', type: 'success' });
    } catch (err: any) {
      setFormDrawer(null);
      setToast({ message: err.message || 'Failed to issue credit note', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (id: number, dto: UpdateSupplierCreditNoteDto) => {
    setFormSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/supplier-credit-notes/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(dto),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to update credit note');
      setCreditNotes((prev) => prev.map((cn) => (cn.id === json.data.id ? json.data : cn)));
      setFormDrawer(null);
      setToast({ message: 'Credit note updated successfully', type: 'success' });
    } catch (err: any) {
      setFormDrawer(null);
      setToast({ message: err.message || 'Failed to update credit note', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  // Bloqueo de borrado: no se puede soft-delete si tiene monto aplicado.
  const handleDeleteClick = (cn: SupplierCreditNote) => {
    if (isApplied(cn)) {
      setToast({
        message: 'Cannot delete: unlink active allocations from this credit note first.',
        type: 'error',
      });
      return;
    }
    setDeletingNote(cn);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingNote) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/supplier-credit-notes/${deletingNote.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to delete credit note');
      }
      setCreditNotes((prev) => prev.filter((cn) => cn.id !== deletingNote.id));
      setDeletingNote(null);
      setToast({ message: 'Credit note deleted successfully', type: 'success' });
    } catch (err: any) {
      setDeletingNote(null);
      setToast({ message: err.message || 'Failed to delete credit note', type: 'error' });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleRowClick = async (cn: SupplierCreditNote) => {
    setDetailNote(withSupplier(cn));
    setDetailAllocations(null);
    try {
      const res = await fetch(
        `${API_BASE}/supplier-payment-allocations?credit_note_id=${cn.id}&limit=100`,
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

  const isTrueEmpty = !loading && !error && creditNotes.length === 0;
  const isFilteredEmpty = !loading && !error && creditNotes.length > 0 && filteredNotes.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchCreditNotes}
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
        <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase">Supplier Credit Notes</h2>
        <p className="text-[#5f5e5e] text-body-sm mt-1">
          Track vendor credit adjustments, monitor total vs. applied balances, and verify execution status.
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
            placeholder="Search by credit note # or supplier..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search credit notes"
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
          onChange={(e) => setStatusFilter(e.target.value as '' | SupplierCreditNoteStatus)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          {SUPPLIER_CREDIT_NOTE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SUPPLIER_CREDIT_NOTE_STATUS_LABELS[s]}
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
            Issue Credit Note
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
          data-testid="supplier-credit-notes-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">assignment_return</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No supplier credit notes found. Click &apos;Issue Credit Note&apos; to record a new vendor
            balance adjustment.
          </p>
          <button
            type="button"
            onClick={() => setFormDrawer({ mode: 'create' })}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Issue Credit Note
          </button>
        </div>
      )}

      {/* Table */}
      {(loading || creditNotes.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">SUPPLIER CREDIT NOTES</span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredNotes.length} credit notes`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Credit Note &amp; Vendor
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Total
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Applied
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Remaining
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
                        <p className="text-sm text-[#5f5e5e]">No credit notes match your active filters</p>
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
                  filteredNotes.map((cn) => {
                    const applied = isApplied(cn);
                    return (
                      <tr
                        key={cn.id}
                        onClick={() => handleRowClick(cn)}
                        className="group hover:bg-[#f8f3eb] transition-colors cursor-pointer"
                      >
                        {/* Number + vendor + issue date */}
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17] font-mono">{cn.credit_note_number}</p>
                          <p className="text-xs text-[#5f5e5e]">
                            {cn.supplier?.name ?? `Supplier #${cn.supplier_id}`}
                            <span className="text-[#5f5e5e]/60"> · Issued {formatDate(cn.issue_date)}</span>
                          </p>
                        </td>

                        {/* Financials */}
                        <td className="px-6 py-4 text-right text-sm font-semibold text-[#1d1c17] whitespace-nowrap">
                          {formatCurrency(cn.total_amount)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-green-700 whitespace-nowrap">
                          {formatCurrency(cn.applied_amount)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-bold text-[#ae001a] whitespace-nowrap">
                          {formatCurrency(remainingBalance(cn))}
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_STYLES[cn.status]}`}
                          >
                            {SUPPLIER_CREDIT_NOTE_STATUS_LABELS[cn.status]}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFormDrawer({ mode: 'edit', creditNote: cn });
                              }}
                              aria-label="Edit credit note"
                              title="Edit credit note"
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                            >
                              <span className="material-symbols-outlined text-[20px]">edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(cn);
                              }}
                              aria-label="Delete credit note"
                              title={applied ? 'Locked — remove allocations first' : 'Delete credit note'}
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
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

      <AccountsPayableQuickLinks active="credit-notes" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={() => setFormDrawer({ mode: 'create' })}
        aria-label="Quick create credit note"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-40"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {formDrawer && (
        <CreditNoteFormDrawer
          mode={formDrawer.mode}
          initial={formDrawer.creditNote}
          suppliers={suppliers}
          submitting={formSubmitting}
          onCancel={() => setFormDrawer(null)}
          onSubmit={(dto) =>
            formDrawer.mode === 'create'
              ? handleCreateSubmit(dto as CreateSupplierCreditNoteDto)
              : handleEditSubmit(formDrawer.creditNote!.id, dto as UpdateSupplierCreditNoteDto)
          }
        />
      )}

      {detailNote && (
        <CreditNoteDetailDrawer
          creditNote={detailNote}
          allocations={detailAllocations}
          onClose={() => {
            setDetailNote(null);
            setDetailAllocations(null);
          }}
          onManageAllocations={
            onViewAllocations
              ? () => {
                  const target = detailNote;
                  setDetailNote(null);
                  setDetailAllocations(null);
                  onViewAllocations(target);
                }
              : undefined
          }
        />
      )}

      {deletingNote && (
        <ConfirmDeleteDialog
          creditNote={deletingNote}
          submitting={deleteSubmitting}
          onCancel={() => setDeletingNote(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

export default SupplierCreditNotesView;
