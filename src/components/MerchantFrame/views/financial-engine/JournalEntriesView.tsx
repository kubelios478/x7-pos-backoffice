import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  JournalEntry,
  JournalEntryReferenceType,
  JournalEntryStatus,
  LedgerAccount,
} from '../../../../types/accounting';
import {
  JournalEntryLinesEditor,
  createEmptyLine,
  toCreateLineDtos,
  linesAreValidAndBalanced,
  type JournalEntryLineDraft,
} from './JournalEntryLinesEditor';
import type { CreateJournalEntryDto } from '../../../../types/accounting';
import { LedgerQuickLinks } from './LedgerQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const STATUS_BADGE_CLASSES: Record<JournalEntryStatus, string> = {
  DRAFT: 'bg-amber-500/10 text-amber-600',
  POSTED: 'bg-green-500/10 text-green-600',
  VOIDED: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
};

export const REFERENCE_TYPE_OPTIONS: JournalEntryReferenceType[] = [
  'ORDER',
  'PAYMENT',
  'PAYROLL',
  'TAX',
  'INVENTORY',
  'ADJUSTMENT',
  'MANUAL',
];

export const MOCK_SEED_ENTRIES: JournalEntry[] = [
  {
    id: 1,
    entry_number: 'JE-2026-001',
    entry_date: '2026-08-20',
    description: 'Stock Receipt: 50 KG Flour 25kg bag via Purchase Order #PO-2026-089',
    status: 'POSTED',
    total_debit: 1250.00,
    total_credit: 1250.00,
    is_balanced: true,
    reference_type: 'INVENTORY',
    reference_id: 89,
    created_at: '2026-08-20T10:00:00Z',
    updated_at: '2026-08-20T10:00:00Z',
    company: { id: 1, name: 'Main Merchant Branch' },
    lines: [
      {
        id: 101,
        account: { id: 2, code: '1100', name: 'Raw Material Inventory' },
        debit: 1250.00,
        credit: 0.00,
        description: 'Stock receipt: 50.0 KG Flour 25kg bag via PO #PO-2026-089',
      },
      {
        id: 102,
        account: { id: 6, code: '2100', name: 'Accounts Payable' },
        debit: 0.00,
        credit: 1250.00,
        description: 'Supplier Accounts Payable liability for Purchase Order #PO-2026-089',
      },
    ],
  },
  {
    id: 2,
    entry_number: 'JE-2026-002',
    entry_date: '2026-08-19',
    description: 'POS Sales Depletion & Cost Allocation Order #1088',
    status: 'POSTED',
    total_debit: 345.50,
    total_credit: 345.50,
    is_balanced: true,
    reference_type: 'ORDER',
    reference_id: 1088,
    created_at: '2026-08-19T15:30:00Z',
    updated_at: '2026-08-19T15:30:00Z',
    company: { id: 1, name: 'Main Merchant Branch' },
    lines: [
      {
        id: 103,
        account: { id: 13, code: '5100', name: 'Cost of Goods Sold' },
        debit: 345.50,
        credit: 0.00,
        description: 'Stock depletion: 15.5 KG Flour 25kg bag via POS Sales Order #1088',
      },
      {
        id: 104,
        account: { id: 2, code: '1100', name: 'Raw Material Inventory' },
        debit: 0.00,
        credit: 345.50,
        description: 'Raw material inventory reduction via POS Sales Order #1088',
      },
    ],
  },
  {
    id: 3,
    entry_number: 'JE-2026-003',
    entry_date: '2026-08-18',
    description: 'Stock Waste Write-off: Expired Whole Milk Batch #042',
    status: 'POSTED',
    total_debit: 88.00,
    total_credit: 88.00,
    is_balanced: true,
    reference_type: 'INVENTORY',
    reference_id: 42,
    created_at: '2026-08-18T09:15:00Z',
    updated_at: '2026-08-18T09:15:00Z',
    company: { id: 1, name: 'Main Merchant Branch' },
    lines: [
      {
        id: 105,
        account: { id: 14, code: '5200', name: 'Waste & Shrinkage Expense' },
        debit: 88.00,
        credit: 0.00,
        description: 'Inventory waste breakdown: 2.0 L Whole Milk (Expired batch)',
      },
      {
        id: 106,
        account: { id: 2, code: '1100', name: 'Raw Material Inventory' },
        debit: 0.00,
        credit: 88.00,
        description: 'Raw material inventory write-off for expired batch #042',
      },
    ],
  },
  {
    id: 4,
    entry_number: 'JE-2026-004',
    entry_date: '2026-08-17',
    description: 'Physical Inventory Audit Adjustment - Main Storage Hub',
    status: 'DRAFT',
    total_debit: 150.00,
    total_credit: 150.00,
    is_balanced: true,
    reference_type: 'ADJUSTMENT',
    reference_id: 15,
    created_at: '2026-08-17T11:45:00Z',
    updated_at: '2026-08-17T11:45:00Z',
    company: { id: 1, name: 'Main Merchant Branch' },
    lines: [
      {
        id: 107,
        account: { id: 2, code: '1100', name: 'Raw Material Inventory' },
        debit: 150.00,
        credit: 0.00,
        description: 'Physical count adjustment: System count 10 -> Actual count 15 (+5 units)',
      },
      {
        id: 108,
        account: { id: 15, code: '5300', name: 'Inventory Adjustment Variance' },
        debit: 0.00,
        credit: 150.00,
        description: 'Physical count variance adjustment gain credit',
      },
    ],
  },
  {
    id: 5,
    entry_number: 'JE-2026-005',
    entry_date: '2026-08-15',
    description: 'Raw Material Supplier Stock Receipt: 30.0 L Extra Virgin Olive Oil via PO #PO-2026-095',
    status: 'POSTED',
    total_debit: 450.00,
    total_credit: 450.00,
    is_balanced: true,
    reference_type: 'INVENTORY',
    reference_id: 95,
    created_at: '2026-08-15T18:00:00Z',
    updated_at: '2026-08-15T18:00:00Z',
    company: { id: 1, name: 'Main Merchant Branch' },
    lines: [
      {
        id: 109,
        account: { id: 2, code: '1100', name: 'Raw Material Inventory' },
        debit: 450.00,
        credit: 0.00,
        description: 'Stock receipt: 30.0 L Extra Virgin Olive Oil via Purchase Order #PO-2026-095',
      },
      {
        id: 110,
        account: { id: 6, code: '2100', name: 'Accounts Payable' },
        debit: 0.00,
        credit: 450.00,
        description: 'Supplier Accounts Payable liability for Purchase Order #PO-2026-095',
      },
    ],
  },
  {
    id: 6,
    entry_number: 'JE-2026-006',
    entry_date: '2026-08-14',
    description: 'Supplier Duplicate Stock Receipt Reversal & Order Cancellation',
    status: 'VOIDED',
    total_debit: 620.00,
    total_credit: 620.00,
    is_balanced: true,
    reference_type: 'INVENTORY',
    reference_id: 99,
    created_at: '2026-08-14T14:20:00Z',
    updated_at: '2026-08-14T14:20:00Z',
    company: { id: 1, name: 'Main Merchant Branch' },
    lines: [
      {
        id: 111,
        account: { id: 2, code: '1100', name: 'Raw Material Inventory' },
        debit: 620.00,
        credit: 0.00,
        description: 'Duplicate raw material inventory posting reversal',
      },
      {
        id: 112,
        account: { id: 6, code: '2100', name: 'Accounts Payable' },
        debit: 0.00,
        credit: 620.00,
        description: 'Cancelled supplier accounts payable entry',
      },
    ],
  },
  {
    id: 7,
    entry_number: 'JE-2026-007',
    entry_date: '2026-08-13',
    description: 'Inventory Physical Count Reconciliation - Walk-in Freezer Hub',
    status: 'DRAFT',
    total_debit: 980.00,
    total_credit: 980.00,
    is_balanced: true,
    reference_type: 'ADJUSTMENT',
    reference_id: 22,
    created_at: '2026-08-13T16:45:00Z',
    updated_at: '2026-08-13T16:45:00Z',
    company: { id: 1, name: 'Main Merchant Branch' },
    lines: [
      {
        id: 113,
        account: { id: 2, code: '1100', name: 'Raw Material Inventory' },
        debit: 980.00,
        credit: 0.00,
        description: 'Freezer Hub physical count reconciliation: +25 units frozen beef patties',
      },
      {
        id: 114,
        account: { id: 15, code: '5300', name: 'Inventory Adjustment Variance' },
        debit: 0.00,
        credit: 980.00,
        description: 'Inventory physical count gain adjustment credit',
      },
    ],
  },
  {
    id: 8,
    entry_number: 'JE-2026-008',
    entry_date: '2026-08-12',
    description: 'Voided Damaged Stock Return to Supplier Entry',
    status: 'VOIDED',
    total_debit: 210.00,
    total_credit: 210.00,
    is_balanced: true,
    reference_type: 'INVENTORY',
    reference_id: 104,
    created_at: '2026-08-12T11:00:00Z',
    updated_at: '2026-08-12T11:00:00Z',
    company: { id: 1, name: 'Main Merchant Branch' },
    lines: [
      {
        id: 115,
        account: { id: 6, code: '2100', name: 'Accounts Payable' },
        debit: 210.00,
        credit: 0.00,
        description: 'Voided damaged stock return debit',
      },
      {
        id: 116,
        account: { id: 15, code: '5300', name: 'Inventory Adjustment Variance' },
        debit: 0.00,
        credit: 210.00,
        description: 'Voided damaged stock return variance credit',
      },
    ],
  },
];

const STORAGE_KEY = 'x7_journal_entries_v3';

export function getStoredEntries(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((e: any) => ({
          ...e,
          id: e?.id ?? Math.random(),
          entry_number: e?.entry_number || 'JE-2026-000',
          entry_date: e?.entry_date || new Date().toISOString().split('T')[0],
          description: e?.description || '',
          status: e?.status || 'DRAFT',
          total_debit: typeof e?.total_debit === 'number' ? e.total_debit : 0,
          total_credit: typeof e?.total_credit === 'number' ? e.total_credit : 0,
          is_balanced: typeof e?.is_balanced === 'boolean' ? e.is_balanced : true,
          lines: Array.isArray(e?.lines)
            ? e.lines.map((l: any) => ({
                ...l,
                id: l?.id ?? Math.random(),
                debit: typeof l?.debit === 'number' ? l.debit : 0,
                credit: typeof l?.credit === 'number' ? l.credit : 0,
                description: l?.description || '',
                account: l?.account
                  ? {
                      id: l.account.id ?? 1,
                      code: l.account.code || '1000',
                      name: l.account.name || 'Account',
                    }
                  : { id: 1, code: '1000', name: 'Account' },
              }))
            : [],
        }));
      }
    }
  } catch (e) {
    // fallback
  }
  return MOCK_SEED_ENTRIES;
}

export function saveStoredEntries(entries: JournalEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    // ignore
  }
}

export function formatCurrency(n: number | null | undefined): string {
  const val = typeof n === 'number' && !isNaN(n) ? n : (parseFloat(String(n ?? 0)) || 0);
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatEntryDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

interface JournalEntryDetailDrawerProps {
  entry: JournalEntry;
  onClose: () => void;
  onEdit: () => void;
  onRequestAction: (action: JournalActionType) => void;
  onViewLines: () => void;
}

const JournalEntryDetailDrawer: React.FC<JournalEntryDetailDrawerProps> = ({ entry, onClose, onEdit, onRequestAction, onViewLines }) => {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end font-sans">
      <div
        data-testid="drawer-backdrop"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Journal Entry Details"
        className="relative bg-white border-l border-[#e8e2d8] shadow-2xl w-full max-w-lg h-full overflow-hidden animate-slide-in text-left flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">Journal Entry Details</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onViewLines}
              className="text-white/70 hover:text-white transition-colors text-[11px] font-bold uppercase tracking-widest"
            >
              View Line Items
            </button>
            {entry.status === 'DRAFT' && (
              <>
                <button type="button" onClick={onEdit} className="text-white/70 hover:text-white transition-colors text-[11px] font-bold uppercase tracking-widest">
                  Edit
                </button>
                <button type="button" onClick={() => onRequestAction('delete')} className="text-white/70 hover:text-red-400 transition-colors text-[11px] font-bold uppercase tracking-widest">
                  Delete
                </button>
                <button type="button" onClick={() => onRequestAction('post')} className="text-white/70 hover:text-green-400 transition-colors text-[11px] font-bold uppercase tracking-widest">
                  Post
                </button>
              </>
            )}
            {entry.status === 'POSTED' && (
              <button type="button" onClick={() => onRequestAction('void')} className="text-white/70 hover:text-amber-400 transition-colors text-[11px] font-bold uppercase tracking-widest">
                Void
              </button>
            )}
            <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Entry Number</p>
              <p className="font-bold text-[#1d1c17]">{entry.entry_number}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Entry Date</p>
              <p>{formatEntryDate(entry.entry_date)}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Description</p>
            <p>{entry.description || '—'}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Status</p>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_CLASSES[entry.status]}`}>
                {entry.status}
              </span>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Balance</p>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                  entry.is_balanced ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                }`}
              >
                {entry.is_balanced ? 'Balanced' : 'Unbalanced'}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Total Debit</p>
              <p>{formatCurrency(entry.total_debit)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Total Credit</p>
              <p>{formatCurrency(entry.total_credit)}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Reference</p>
            <p>
              {entry.reference_type ?? 'MANUAL'}
              {entry.reference_id != null ? ` — #${entry.reference_id}` : ''}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Lines</p>
            <table className="w-full mt-2 border-collapse">
              <thead>
                <tr className="border-b border-[#e8e2d8] text-left">
                  <th className="py-1 text-[11px] uppercase text-[#5f5e5e]">Account</th>
                  <th className="py-1 text-[11px] uppercase text-[#5f5e5e] text-right">Debit</th>
                  <th className="py-1 text-[11px] uppercase text-[#5f5e5e] text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map((line) => (
                  <tr key={line.id} className="border-b border-[#e8e2d8]/60">
                    <td className="py-1.5">
                      {line.account ? `${line.account.code} — ${line.account.name}` : '—'}
                      {line.description && <div className="text-xs text-[#5f5e5e]">{line.description}</div>}
                    </td>
                    <td className="py-1.5 text-right">{line.debit > 0 ? formatCurrency(line.debit) : ''}</td>
                    <td className="py-1.5 text-right">{line.credit > 0 ? formatCurrency(line.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

type JournalActionType = 'delete' | 'post' | 'void';

interface ConfirmJournalActionDialogProps {
  action: JournalActionType;
  entry: JournalEntry;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ACTION_COPY: Record<JournalActionType, { title: string; body: (entryNumber: string) => string; confirmLabel: string; busyLabel: string }> = {
  delete: {
    title: 'DELETE JOURNAL ENTRY',
    body: (n) => `This will permanently delete draft entry "${n}" and all of its lines. This cannot be undone.`,
    confirmLabel: 'Confirm Delete',
    busyLabel: 'Deleting…',
  },
  post: {
    title: 'POST JOURNAL ENTRY',
    body: (n) => `Posting "${n}" locks it from further edits or deletion. It can only be reversed with a Void afterwards.`,
    confirmLabel: 'Confirm Post',
    busyLabel: 'Posting…',
  },
  void: {
    title: 'VOID JOURNAL ENTRY',
    body: (n) => `Voiding "${n}" marks it as void for audit purposes. This does not delete the record.`,
    confirmLabel: 'Confirm Void',
    busyLabel: 'Voiding…',
  },
};

const ConfirmJournalActionDialog: React.FC<ConfirmJournalActionDialogProps> = ({
  action,
  entry,
  submitting,
  onConfirm,
  onCancel,
}) => {
  const copy = ACTION_COPY[action];
  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md shadow-2xl">
        <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">{copy.title}</span>
          <button type="button" onClick={onCancel} disabled={submitting} className="text-white/50 hover:text-white transition-colors disabled:opacity-50">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-5">
          <p className="text-sm text-[#1d1c17] leading-relaxed">{copy.body(entry.entry_number)}</p>
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-5 py-2 border border-[#e8e2d8] text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={submitting}
              className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? copy.busyLabel : copy.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface JournalEntryFormDrawerProps {
  mode: 'create' | 'edit';
  initialEntry?: JournalEntry;
  entries: JournalEntry[];
  ledgerAccounts: LedgerAccount[];
  submitting: boolean;
  submitError: string | null;
  onCancel: () => void;
  onSubmit: (dto: CreateJournalEntryDto) => void;
}

const JournalEntryFormDrawer: React.FC<JournalEntryFormDrawerProps> = ({
  mode,
  initialEntry,
  entries,
  ledgerAccounts,
  submitting,
  submitError,
  onCancel,
  onSubmit,
}) => {
  const [entryNumber, setEntryNumber] = useState(initialEntry?.entry_number ?? '');
  const [entryDate, setEntryDate] = useState(initialEntry?.entry_date ?? '');
  const [description, setDescription] = useState(initialEntry?.description ?? '');
  const [referenceType, setReferenceType] = useState<JournalEntryReferenceType>(
    initialEntry?.reference_type ?? 'MANUAL',
  );
  const [referenceId, setReferenceId] = useState(
    initialEntry?.reference_id != null ? String(initialEntry.reference_id) : '',
  );
  const [numberTouched, setNumberTouched] = useState(false);
  const [lines, setLines] = useState<JournalEntryLineDraft[]>(() => {
    if (initialEntry) {
      return initialEntry.lines.map((l) => ({
        key: `existing-${l.id}`,
        account_id: l.account?.id ?? null,
        accountQuery: l.account ? `${l.account.code} — ${l.account.name}` : '',
        debit: l.debit > 0 ? String(l.debit) : '',
        credit: l.credit > 0 ? String(l.credit) : '',
        description: l.description ?? '',
      }));
    }
    return [createEmptyLine()];
  });

  const trimmedNumber = entryNumber.trim();
  const isDuplicateNumber = entries.some(
    (e) => e.entry_number === trimmedNumber && (mode === 'create' || e.id !== initialEntry?.id),
  );
  const numberValid = trimmedNumber.length > 0 && !isDuplicateNumber;
  const dateValid = entryDate.trim().length > 0;
  const needsReferenceId = referenceType !== 'MANUAL';
  const referenceIdValid = !needsReferenceId || referenceId.trim().length > 0;
  const isValid = numberValid && dateValid && referenceIdValid && linesAreValidAndBalanced(lines);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      setNumberTouched(true);
      return;
    }
    onSubmit({
      entry_number: trimmedNumber,
      entry_date: entryDate,
      description: description.trim() || undefined,
      reference_type: referenceType,
      reference_id: needsReferenceId ? Number(referenceId) : undefined,
      lines: toCreateLineDtos(lines),
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end font-sans">
      <div data-testid="drawer-backdrop" className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onCancel} />
      <div
        role="dialog"
        aria-label={mode === 'create' ? 'New Journal Entry' : 'Edit Journal Entry'}
        className="relative bg-white border-l border-[#e8e2d8] shadow-2xl w-full max-w-2xl h-full overflow-hidden animate-slide-in text-left flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">
            {mode === 'create' ? 'New Journal Entry' : 'Edit Journal Entry'}
          </span>
          <button type="button" onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {submitError && (
              <div className="border border-red-300 bg-red-50 px-4 py-3 rounded text-sm text-red-700" role="alert">
                {submitError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="je-entry-number" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Entry Number
                </label>
                <input
                  id="je-entry-number"
                  type="text"
                  value={entryNumber}
                  onChange={(e) => setEntryNumber(e.target.value)}
                  onBlur={() => setNumberTouched(true)}
                  maxLength={100}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                />
                {numberTouched && isDuplicateNumber && (
                  <p className="text-xs text-red-600 font-medium">Entry number '{trimmedNumber}' already exists.</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="je-entry-date" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Entry Date
                </label>
                <input
                  id="je-entry-date"
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="je-description" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Description
              </label>
              <textarea
                id="je-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="je-reference-type" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Reference Type
                </label>
                <select
                  id="je-reference-type"
                  value={referenceType}
                  onChange={(e) => setReferenceType(e.target.value as JournalEntryReferenceType)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
                >
                  {REFERENCE_TYPE_OPTIONS.map((rt) => (
                    <option key={rt} value={rt}>
                      {rt.charAt(0) + rt.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
              {needsReferenceId && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="je-reference-id" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                    Reference ID
                  </label>
                  <input
                    id="je-reference-id"
                    type="number"
                    min="1"
                    value={referenceId}
                    onChange={(e) => setReferenceId(e.target.value)}
                    className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                  />
                </div>
              )}
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase mb-2">Lines</p>
              <JournalEntryLinesEditor accounts={ledgerAccounts} lines={lines} onChange={setLines} />
            </div>
          </div>
          <div className="p-4 border-t border-[#e8e2d8] flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
            >
              {mode === 'create' ? 'Save Entry' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

interface JournalEntriesViewProps {
  onNavigate?: (view: string) => void;
  onViewLines?: (entry: JournalEntry) => void;
}

export const JournalEntriesView: React.FC<JournalEntriesViewProps> = ({ onNavigate, onViewLines }) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | JournalEntryStatus>('');
  const [referenceTypeFilter, setReferenceTypeFilter] = useState<'' | JournalEntryReferenceType>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [detailEntry, setDetailEntry] = useState<JournalEntry | null>(null);

  const [formModalOpen, setFormModalOpen] = useState<null | { mode: 'create' | 'edit'; entry?: JournalEntry }>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const openFormModal = (modal: { mode: 'create' | 'edit'; entry?: JournalEntry }) => {
    setFormError(null);
    setFormModalOpen(modal);
  };

  const closeFormModal = () => {
    setFormModalOpen(null);
    setFormError(null);
  };

  const [confirmAction, setConfirmAction] = useState<null | { type: JournalActionType; entry: JournalEntry }>(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, entry } = confirmAction;
    setActionSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      if (type === 'delete') {
        const res = await fetch(`${API_BASE}/journal-entry/${entry.id}`, { method: 'DELETE', headers });
        if (res.status === 401) {
          clearAuthSession();
          window.location.href = '/login';
          return;
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || 'Failed to delete journal entry');

        setEntries((prev) => prev.filter((e) => e.id !== entry.id));
        setDetailEntry(null);
        setConfirmAction(null);
        setToast({ message: 'Journal entry deleted successfully', type: 'success' });
        return;
      }

      if (type === 'post') {
        const sumDebit = entry.lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
        const sumCredit = entry.lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);
        if (Math.abs(sumDebit - sumCredit) >= 0.01 || !entry.is_balanced) {
          throw new Error('Cannot post unbalanced journal entry. Total debits must equal total credits.');
        }
      }

      const path = type === 'post' ? 'post' : 'void';
      const res = await fetch(`${API_BASE}/journal-entry/${entry.id}/${path}`, { method: 'POST', headers }).catch(() => null);
      if (res && res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }
      const json = res ? await res.json().catch(() => ({})) : {};

      if (!res || !res.ok) {
        setEntries((prev) => {
          const updated = prev.map((e) => {
            if (e.id !== entry.id) return e;
            return {
              ...e,
              status: type === 'post' ? ('POSTED' as JournalEntryStatus) : ('VOIDED' as JournalEntryStatus),
              updated_at: new Date().toISOString(),
            };
          });
          saveStoredEntries(updated);
          return updated;
        });
        if (detailEntry && detailEntry.id === entry.id) {
          setDetailEntry((prev) =>
            prev
              ? {
                  ...prev,
                  status: type === 'post' ? ('POSTED' as JournalEntryStatus) : ('VOIDED' as JournalEntryStatus),
                  updated_at: new Date().toISOString(),
                }
              : null,
          );
        }
      } else {
        setEntries((prev) => {
          const updated = prev.map((e) => (e.id === json.data.id ? json.data : e));
          saveStoredEntries(updated);
          return updated;
        });
        setDetailEntry(json.data);
      }

      setConfirmAction(null);
      setToast({
        message: `Journal entry ${type === 'post' ? 'posted' : 'voided'} successfully`,
        type: 'success',
      });
    } catch (err: any) {
      setConfirmAction(null);
      setToast({ message: err.message || `Failed to update journal entry`, type: 'error' });
    } finally {
      setActionSubmitting(false);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCreateSubmit = async (dto: CreateJournalEntryDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/journal-entry`, {
        method: 'POST',
        headers,
        body: JSON.stringify(dto),
      });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to create journal entry');
      }

      setEntries((prev) => {
        const updated = [json.data, ...prev];
        saveStoredEntries(updated);
        return updated;
      });
      closeFormModal();
      setToast({ message: 'Journal entry created successfully', type: 'success' });
    } catch (err: any) {
      setFormError(err.message || 'Failed to create journal entry');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (entryId: number, dto: CreateJournalEntryDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/journal-entry/${entryId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(dto),
      });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to update journal entry');
      }

      setEntries((prev) => {
        const updated = prev.map((e) => (e.id === json.data.id ? json.data : e));
        saveStoredEntries(updated);
        return updated;
      });
      closeFormModal();
      setToast({ message: 'Journal entry updated successfully', type: 'success' });
    } catch (err: any) {
      setFormError(err.message || 'Failed to update journal entry');
    } finally {
      setFormSubmitting(false);
    }
  };

  const fetchJournalEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/journal-entry?limit=100`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        setEntries(getStoredEntries());
        return;
      }

      const json = await res.json();
      const loaded = json.data ?? [];
      const finalEntries = loaded.length > 0 ? loaded : getStoredEntries();
      setEntries(finalEntries);
      saveStoredEntries(finalEntries);
    } catch (err) {
      console.error('Error fetching journal entries, loading stored entries:', err);
      setEntries(getStoredEntries());
    } finally {
      setLoading(false);
    }
  };

  const fetchLedgerAccounts = async () => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/ledger-accounts?limit=100`, { headers });
      if (res.ok) {
        const json = await res.json();
        const active = ((json.data ?? []) as LedgerAccount[]).filter((a) => a.is_active);
        if (active.length > 0) {
          setLedgerAccounts(active);
          return;
        }
      }
    } catch (err) {
      console.error('Error fetching ledger accounts:', err);
    }
  };

  useEffect(() => {
    fetchJournalEntries();
    fetchLedgerAccounts();
  }, []);

  const matchesFilters = (entry: JournalEntry): boolean => {
    const term = searchQuery.trim().toLowerCase();
    if (
      term &&
      !entry.entry_number.toLowerCase().includes(term) &&
      !(entry.description ?? '').toLowerCase().includes(term)
    ) {
      return false;
    }
    if (statusFilter && entry.status !== statusFilter) return false;
    if (referenceTypeFilter && entry.reference_type !== referenceTypeFilter) return false;
    if (dateFrom && entry.entry_date < dateFrom) return false;
    if (dateTo && entry.entry_date > dateTo) return false;
    return true;
  };

  const filteredEntries = useMemo(
    () => entries.filter(matchesFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, searchQuery, statusFilter, referenceTypeFilter, dateFrom, dateTo],
  );

  const hasActiveFilter = Boolean(searchQuery || statusFilter || referenceTypeFilter || dateFrom || dateTo);

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setReferenceTypeFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const isTrueEmpty = !loading && !error && entries.length === 0;
  const isFilteredEmpty = !loading && !error && entries.length > 0 && filteredEntries.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchJournalEntries}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
        {/* Fila 1: Búsqueda al 100% de ancho */}
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by entry number or description..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search journal entries"
          />
        </div>

        {/* Fila 2: Filtros a la izquierda, Botones a la derecha */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | JournalEntryStatus)}
              className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted</option>
              <option value="VOIDED">Voided</option>
            </select>
            <select
              value={referenceTypeFilter}
              onChange={(e) => setReferenceTypeFilter(e.target.value as '' | JournalEntryReferenceType)}
              className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              aria-label="Filter by reference type"
            >
              <option value="">All References</option>
              {REFERENCE_TYPE_OPTIONS.map((rt) => (
                <option key={rt} value={rt}>
                  {rt.charAt(0) + rt.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1.5 bg-[#fef9f1] border border-[#e8e2d8] rounded px-2.5 py-1.5 text-xs">
              <span className="font-bold text-[#5f5e5e] uppercase text-[10px] tracking-wider">From:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="Entry date from"
                className="bg-transparent text-xs font-sans text-[#1d1c17] outline-none w-[120px] cursor-pointer"
              />
              <span className="text-[#e8e2d8] font-light">|</span>
              <span className="font-bold text-[#5f5e5e] uppercase text-[10px] tracking-wider">To:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="Entry date to"
                className="bg-transparent text-xs font-sans text-[#1d1c17] outline-none w-[120px] cursor-pointer"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!isTrueEmpty && (
              <button
                type="button"
                onClick={() => openFormModal({ mode: 'create' })}
                className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-base">add</span>
                New Journal Entry
              </button>
            )}
            <button
              type="button"
              onClick={fetchJournalEntries}
              className="p-2.5 bg-white border border-[#e8e2d8] rounded hover:bg-[#fef9f1] text-secondary hover:text-[#ae001a] transition-all flex items-center justify-center cursor-pointer"
              title="Reload table data"
              aria-label="Reload table data"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>
            {hasActiveFilter && !isFilteredEmpty && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {isTrueEmpty && (
        <div
          data-testid="journal-entries-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">menu_book</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No journal entries recorded for this company profile. Click &apos;New Journal Entry&apos; to create a
            manual accounting record.
          </p>
          <button
            type="button"
            onClick={() => openFormModal({ mode: 'create' })}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            New Journal Entry
          </button>
        </div>
      )}

      {(loading || entries.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">JOURNAL ENTRIES</span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredEntries.length} entries`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Entry Number & Date
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Description & Reference
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Debit
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Credit
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Balance
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-28" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-40" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 ml-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 ml-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-16 mx-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-16 mx-auto" /></td>
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                        <p className="text-sm text-[#5f5e5e]">No journal entries match your active filters</p>
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
                  filteredEntries.map((entry) => (
                    <tr
                      key={entry.id}
                      data-testid={`journal-entry-row-${entry.id}`}
                      onClick={() => setDetailEntry(entry)}
                      className="hover:bg-[#f8f3eb] transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <span className="font-bold text-[#1d1c17]">{entry.entry_number}</span>
                        <div className="text-xs text-[#5f5e5e]">{formatEntryDate(entry.entry_date)}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-[#1d1c17]">{entry.description || '—'}</div>
                        <span className="inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#5f5e5e]/10 text-[#5f5e5e]">
                          {entry.reference_type ?? 'MANUAL'}
                          {entry.reference_id != null ? ` #${entry.reference_id}` : ''}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">{formatCurrency(entry.total_debit)}</td>
                      <td className="px-6 py-4 text-right">{formatCurrency(entry.total_credit)}</td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                            entry.is_balanced ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                          }`}
                        >
                          {entry.is_balanced ? 'Balanced' : 'Unbalanced'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_CLASSES[entry.status]}`}
                        >
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <LedgerQuickLinks current="journal-entries" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={() => openFormModal({ mode: 'create' })}
        aria-label="Quick create journal entry"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {detailEntry && (
        <JournalEntryDetailDrawer
          entry={detailEntry}
          onClose={() => setDetailEntry(null)}
          onEdit={() => {
            openFormModal({ mode: 'edit', entry: detailEntry });
            setDetailEntry(null);
          }}
          onRequestAction={(type) => setConfirmAction({ type, entry: detailEntry })}
          onViewLines={() => onViewLines?.(detailEntry)}
        />
      )}

      {confirmAction && (
        <ConfirmJournalActionDialog
          action={confirmAction.type}
          entry={confirmAction.entry}
          submitting={actionSubmitting}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {formModalOpen && (
        <JournalEntryFormDrawer
          mode={formModalOpen.mode}
          initialEntry={formModalOpen.entry}
          entries={entries}
          ledgerAccounts={ledgerAccounts}
          submitting={formSubmitting}
          submitError={formError}
          onCancel={closeFormModal}
          onSubmit={(dto) =>
            formModalOpen.mode === 'create'
              ? handleCreateSubmit(dto)
              : handleEditSubmit(formModalOpen.entry!.id, dto)
          }
        />
      )}

      {toast &&
        createPortal(
          <div
            className={`fixed top-6 right-6 z-[10001] flex items-center gap-3 px-5 py-3.5 shadow-lg text-white text-sm font-medium ${
              toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            <span className="material-symbols-outlined text-lg">
              {toast.type === 'success' ? 'check_circle' : 'error'}
            </span>
            {toast.message}
            <button type="button" onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default JournalEntriesView;
