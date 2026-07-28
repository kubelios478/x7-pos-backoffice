import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type { CreateJournalEntryLineDto, JournalEntry, JournalEntryLine, LedgerAccount } from '../../../../types/accounting';
import { formatCurrency, formatEntryDate } from './JournalEntriesView';
import { LedgerQuickLinks } from './LedgerQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export interface FlattenedJournalEntryLine {
  key: string;
  line: JournalEntryLine;
  entry: JournalEntry;
}

export function flattenJournalEntryLines(entries: JournalEntry[]): FlattenedJournalEntryLine[] {
  return entries.flatMap((entry) =>
    entry.lines.map((line) => ({ key: `${entry.id}-${line.id}`, line, entry })),
  );
}

export function isLeafAccount(account: LedgerAccount, accounts: LedgerAccount[]): boolean {
  return !accounts.some((a) => a.parent_account_id === account.id && a.is_active);
}

interface JournalEntryLineFormDrawerProps {
  mode: 'create' | 'edit';
  lockedEntry?: JournalEntry | null;
  draftEntries: JournalEntry[];
  initialLine?: JournalEntryLine;
  leafAccounts: LedgerAccount[];
  submitting: boolean;
  submitError: string | null;
  onCancel: () => void;
  onSubmit: (entryId: number, dto: CreateJournalEntryLineDto) => void;
}

const JournalEntryLineFormDrawer: React.FC<JournalEntryLineFormDrawerProps> = ({
  mode,
  lockedEntry,
  draftEntries,
  initialLine,
  leafAccounts,
  submitting,
  submitError,
  onCancel,
  onSubmit,
}) => {
  const [entryId, setEntryId] = useState<number | null>(lockedEntry?.id ?? null);
  const [entryQuery, setEntryQuery] = useState('');
  const [entryListOpen, setEntryListOpen] = useState(false);
  const entryBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [accountId, setAccountId] = useState<number | null>(initialLine?.account?.id ?? null);
  const [accountQuery, setAccountQuery] = useState(
    initialLine?.account ? `${initialLine.account.code} — ${initialLine.account.name}` : '',
  );
  const [accountListOpen, setAccountListOpen] = useState(false);
  const accountBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [debit, setDebit] = useState(initialLine && initialLine.debit > 0 ? String(initialLine.debit) : '');
  const [credit, setCredit] = useState(initialLine && initialLine.credit > 0 ? String(initialLine.credit) : '');
  const [description, setDescription] = useState(initialLine?.description ?? '');
  const [touched, setTouched] = useState(false);

  const clearEntryBlur = () => {
    if (entryBlurTimeoutRef.current != null) {
      clearTimeout(entryBlurTimeoutRef.current);
      entryBlurTimeoutRef.current = null;
    }
  };
  const clearAccountBlur = () => {
    if (accountBlurTimeoutRef.current != null) {
      clearTimeout(accountBlurTimeoutRef.current);
      accountBlurTimeoutRef.current = null;
    }
  };

  const filteredEntries = draftEntries.filter((e) => {
    const term = entryQuery.trim().toLowerCase();
    return !term || e.entry_number.toLowerCase().includes(term);
  });

  const filteredAccounts = leafAccounts.filter((a) => {
    const term = accountQuery.trim().toLowerCase();
    return !term || a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term);
  });

  const selectEntry = (entry: JournalEntry) => {
    clearEntryBlur();
    setEntryId(entry.id);
    setEntryQuery(entry.entry_number);
    setEntryListOpen(false);
  };

  const selectAccount = (account: LedgerAccount) => {
    clearAccountBlur();
    setAccountId(account.id);
    setAccountQuery(`${account.code} — ${account.name}`);
    setAccountListOpen(false);
  };

  const handleDebitChange = (value: string) => {
    setDebit(value);
    if ((parseFloat(value) || 0) > 0) setCredit('0');
  };
  const handleCreditChange = (value: string) => {
    setCredit(value);
    if ((parseFloat(value) || 0) > 0) setDebit('0');
  };

  const debitAmount = parseFloat(debit) || 0;
  const creditAmount = parseFloat(credit) || 0;
  const isNonLeafSelected = accountId != null && !leafAccounts.some((a) => a.id === accountId);
  const isMovementValid = debitAmount > 0 || creditAmount > 0;
  const isValid = entryId != null && accountId != null && !isNonLeafSelected && isMovementValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || entryId == null || accountId == null) {
      setTouched(true);
      return;
    }
    onSubmit(entryId, {
      account_id: accountId,
      debit: debitAmount,
      credit: creditAmount,
      ...(description.trim() ? { description: description.trim() } : {}),
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end font-sans">
      <div
        data-testid="drawer-backdrop"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-label={mode === 'create' ? 'Add Line Item' : 'Edit Line Item'}
        className="relative bg-white border-l border-[#e8e2d8] shadow-2xl w-full max-w-md h-full overflow-hidden animate-slide-in text-left flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">
            {mode === 'create' ? 'Add Line Item' : 'Edit Line Item'}
          </span>
          <button type="button" onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {submitError && (
              <div className="bg-red-50 border border-red-300 text-red-700 text-sm px-3 py-2 rounded">
                {submitError}
              </div>
            )}
            <div className="flex flex-col gap-1.5 relative">
              <label className="text-[11px] font-bold text-[#5f5e5e] uppercase">Journal Entry</label>
              {lockedEntry ? (
                <p
                  data-testid="line-form-locked-entry"
                  className="px-3 py-2 border border-[#e8e2d8] rounded text-sm bg-[#f2ede5] text-[#1d1c17]"
                >
                  {lockedEntry.entry_number}
                </p>
              ) : (
                <>
                  <input
                    type="text"
                    role="combobox"
                    aria-expanded={entryListOpen}
                    aria-label="Journal entry"
                    autoComplete="off"
                    value={entryQuery}
                    onFocus={() => {
                      clearEntryBlur();
                      setEntryListOpen(true);
                    }}
                    onChange={(e) => {
                      setEntryQuery(e.target.value);
                      setEntryId(null);
                    }}
                    onBlur={() => {
                      entryBlurTimeoutRef.current = setTimeout(() => setEntryListOpen(false), 100);
                    }}
                    placeholder="Search DRAFT journal entries..."
                    className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
                  />
                  {entryListOpen && (
                    <ul
                      role="listbox"
                      aria-label="Journal entry options"
                      className="absolute top-full mt-1 left-0 right-0 bg-white border border-[#e8e2d8] rounded shadow-lg max-h-40 overflow-y-auto z-10"
                    >
                      {filteredEntries.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-[#5f5e5e]">No DRAFT journal entries found</li>
                      ) : (
                        filteredEntries.map((entry) => (
                          <li
                            key={entry.id}
                            role="option"
                            onMouseDown={() => selectEntry(entry)}
                            className="px-3 py-2 text-sm hover:bg-[#f8f3eb] cursor-pointer"
                          >
                            {entry.entry_number}
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </>
              )}
              {touched && entryId == null && (
                <p className="text-xs text-red-600 font-medium">A journal entry must be selected.</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 relative">
              <label className="text-[11px] font-bold text-[#5f5e5e] uppercase">Ledger Account</label>
              <input
                type="text"
                role="combobox"
                aria-expanded={accountListOpen}
                aria-label="Ledger account"
                autoComplete="off"
                value={accountQuery}
                onFocus={() => {
                  clearAccountBlur();
                  setAccountListOpen(true);
                }}
                onChange={(e) => {
                  setAccountQuery(e.target.value);
                  setAccountId(null);
                }}
                onBlur={() => {
                  accountBlurTimeoutRef.current = setTimeout(() => setAccountListOpen(false), 100);
                }}
                placeholder="Search leaf accounts..."
                className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              />
              {accountListOpen && (
                <ul
                  role="listbox"
                  aria-label="Account options"
                  className="absolute top-full mt-1 left-0 right-0 bg-white border border-[#e8e2d8] rounded shadow-lg max-h-40 overflow-y-auto z-10"
                >
                  {filteredAccounts.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-[#5f5e5e]">No matching leaf accounts</li>
                  ) : (
                    filteredAccounts.map((a) => (
                      <li
                        key={a.id}
                        role="option"
                        onMouseDown={() => selectAccount(a)}
                        className="px-3 py-2 text-sm hover:bg-[#f8f3eb] cursor-pointer"
                      >
                        {a.code} — {a.name}
                      </li>
                    ))
                  )}
                </ul>
              )}
              {touched && isNonLeafSelected && (
                <p className="text-xs text-red-600 font-medium">
                  Cannot post transactions directly to summary accounts. Please select a detailed leaf account.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="line-form-debit" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Debit
                </label>
                <input
                  id="line-form-debit"
                  type="number"
                  min="0"
                  step="0.01"
                  aria-label="Debit"
                  value={debit}
                  disabled={creditAmount > 0}
                  onChange={(e) => handleDebitChange(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="line-form-credit" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Credit
                </label>
                <input
                  id="line-form-credit"
                  type="number"
                  min="0"
                  step="0.01"
                  aria-label="Credit"
                  value={credit}
                  disabled={debitAmount > 0}
                  onChange={(e) => handleCreditChange(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            {touched && !isMovementValid && (
              <p className="text-xs text-red-600 font-medium">
                A line item must have either a Debit or Credit amount greater than zero.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="line-form-description" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Description
              </label>
              <input
                id="line-form-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              />
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
              {submitting ? 'Saving…' : 'Save Line Item'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

type PostingTypeFilter = '' | 'DEBIT' | 'CREDIT';

interface JournalEntryLinesViewProps {
  entry?: JournalEntry | null;
  onClearEntry?: () => void;
  onNavigate?: (view: string) => void;
}

export const JournalEntryLinesView: React.FC<JournalEntryLinesViewProps> = ({ entry, onClearEntry, onNavigate }) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [postingTypeFilter, setPostingTypeFilter] = useState<PostingTypeFilter>('');
  const [accountFilter, setAccountFilter] = useState('');
  const [scopedEntry, setScopedEntry] = useState<JournalEntry | null>(entry ?? null);

  const [formDrawer, setFormDrawer] = useState<
    null | { mode: 'create' } | { mode: 'edit'; item: FlattenedJournalEntryLine }
  >(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
        throw new Error('Error al cargar las lineas de asientos contables');
      }

      const json = await res.json();
      setEntries(json.data ?? []);
    } catch (err) {
      console.error('Error fetching journal entry lines:', err);
      setError('Failed to load journal entry lines. Please check if the backend is running.');
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
      if (!res.ok) return;

      const json = await res.json();
      const active = ((json.data ?? []) as LedgerAccount[]).filter((a) => a.is_active);
      setLedgerAccounts(active);
    } catch (err) {
      console.error('Error fetching ledger accounts:', err);
    }
  };

  useEffect(() => {
    fetchJournalEntries();
    fetchLedgerAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const flattenedLines = useMemo(() => flattenJournalEntryLines(entries), [entries]);
  const draftEntries = useMemo(() => entries.filter((e) => e.status === 'DRAFT'), [entries]);
  const leafAccounts = useMemo(
    () => ledgerAccounts.filter((a) => isLeafAccount(a, ledgerAccounts)),
    [ledgerAccounts],
  );

  const matchesFilters = (item: FlattenedJournalEntryLine): boolean => {
    const term = searchQuery.trim().toLowerCase();
    if (
      term &&
      !(item.line.description ?? '').toLowerCase().includes(term) &&
      !item.entry.entry_number.toLowerCase().includes(term) &&
      !(item.line.account?.code ?? '').toLowerCase().includes(term)
    ) {
      return false;
    }
    if (postingTypeFilter === 'DEBIT' && !(item.line.debit > 0)) return false;
    if (postingTypeFilter === 'CREDIT' && !(item.line.credit > 0)) return false;
    if (accountFilter && item.line.account?.id !== Number(accountFilter)) return false;
    if (scopedEntry && item.entry.id !== scopedEntry.id) return false;
    return true;
  };

  const filteredLines = useMemo(
    () => flattenedLines.filter(matchesFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flattenedLines, searchQuery, postingTypeFilter, accountFilter, scopedEntry],
  );

  const hasActiveFilter = Boolean(searchQuery || postingTypeFilter || accountFilter);

  const clearFilters = () => {
    setSearchQuery('');
    setPostingTypeFilter('');
    setAccountFilter('');
  };

  const clearScope = () => {
    setScopedEntry(null);
    onClearEntry?.();
  };

  const openCreateDrawer = () => {
    setFormError(null);
    setFormDrawer({ mode: 'create' });
  };

  const closeFormDrawer = () => {
    setFormDrawer(null);
    setFormError(null);
  };

  const handleFormSubmit = async (entryId: number, dto: CreateJournalEntryLineDto) => {
    if (!formDrawer) return;
    setFormSubmitting(true);
    setFormError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const isEdit = formDrawer.mode === 'edit';
      const url = isEdit
        ? `${API_BASE}/journal-entries/${entryId}/lines/${formDrawer.item.line.id}`
        : `${API_BASE}/journal-entries/${entryId}/lines`;

      const res = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers, body: JSON.stringify(dto) });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || `Failed to ${isEdit ? 'update' : 'create'} journal entry line`);
      }

      await fetchJournalEntries();
      setFormDrawer(null);
      setToast({ message: `Journal entry line ${isEdit ? 'updated' : 'created'} successfully`, type: 'success' });
    } catch (err: any) {
      setFormError(err.message || 'Failed to save journal entry line');
    } finally {
      setFormSubmitting(false);
    }
  };

  const isTrueEmpty = !loading && !error && flattenedLines.length === 0;
  const isFilteredEmpty = !loading && !error && flattenedLines.length > 0 && filteredLines.length === 0;

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
      {scopedEntry && (
        <div
          data-testid="scoped-entry-chip"
          className="flex items-center gap-2 self-start bg-[#fef9f1] border border-[#e8e2d8] px-4 py-2 rounded text-sm text-[#1d1c17]"
        >
          <span>
            Scoped to <span className="font-bold">{scopedEntry.entry_number}</span>
          </span>
          <button
            type="button"
            onClick={clearScope}
            aria-label="Clear journal entry scope"
            className="text-[#5f5e5e] hover:text-[#ae001a] transition-colors"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}

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
              placeholder="Search by description, entry number, or account code..."
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
              aria-label="Search posting line items"
            />
          </div>
          <select
            value={postingTypeFilter}
            onChange={(e) => setPostingTypeFilter(e.target.value as PostingTypeFilter)}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
            aria-label="Filter by posting type"
          >
            <option value="">All Lines</option>
            <option value="DEBIT">Debit Only</option>
            <option value="CREDIT">Credit Only</option>
          </select>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
            aria-label="Filter by account"
          >
            <option value="">All Accounts</option>
            {ledgerAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={openCreateDrawer}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add Line Item
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

      {isTrueEmpty && (
        <div
          data-testid="journal-entry-lines-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">receipt_long</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No posting line items recorded. Select a Journal Entry or clear filters to view detailed ledger
            movements.
          </p>
        </div>
      )}

      {(loading || flattenedLines.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">POSTING LINE ITEMS</span>
            <span className="text-white/50 text-xs">{loading ? 'Loading...' : `${filteredLines.length} lines`}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Journal Entry
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Ledger Account
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Description
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Debit
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Credit
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-28" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-40" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 ml-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 ml-auto" /></td>
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                        <p className="text-sm text-[#5f5e5e]">No posting line items match your active filters</p>
                        <div className="flex items-center gap-4">
                          {hasActiveFilter && (
                            <button
                              type="button"
                              onClick={clearFilters}
                              className="text-[#ae001a] text-sm font-semibold hover:underline"
                            >
                              Clear filters
                            </button>
                          )}
                          {scopedEntry && (
                            <button
                              type="button"
                              onClick={clearScope}
                              className="text-[#ae001a] text-sm font-semibold hover:underline"
                            >
                              Clear entry scope
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredLines.map((item) => (
                    <tr
                      key={item.key}
                      data-testid={`journal-entry-line-row-${item.key}`}
                      className="hover:bg-[#f8f3eb] transition-colors"
                    >
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => onNavigate?.('journal-entries')}
                          className="text-left hover:underline"
                        >
                          <span className="font-bold text-[#1d1c17]">{item.entry.entry_number}</span>
                          <div className="text-xs text-[#5f5e5e]">{formatEntryDate(item.entry.entry_date)}</div>
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        {item.line.account ? (
                          <span className="inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#5f5e5e]/10 text-[#5f5e5e]">
                            {item.line.account.code} - {item.line.account.name}
                          </span>
                        ) : (
                          <span className="text-[#5f5e5e]">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {item.line.description ? (
                          <span className="text-[#1d1c17]">{item.line.description}</span>
                        ) : (
                          <span className="italic text-[#5f5e5e]">{item.entry.description || '—'}</span>
                        )}
                      </td>
                      <td
                        className={`px-6 py-4 text-right ${
                          item.line.debit === 0 ? 'text-[#5f5e5e]' : 'text-[#1d1c17] font-semibold'
                        }`}
                      >
                        {formatCurrency(item.line.debit)}
                      </td>
                      <td
                        className={`px-6 py-4 text-right ${
                          item.line.credit === 0 ? 'text-[#5f5e5e]' : 'text-[#1d1c17] font-semibold'
                        }`}
                      >
                        {formatCurrency(item.line.credit)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {formDrawer && (
        <JournalEntryLineFormDrawer
          mode={formDrawer.mode}
          lockedEntry={formDrawer.mode === 'edit' ? formDrawer.item.entry : null}
          draftEntries={draftEntries}
          initialLine={formDrawer.mode === 'edit' ? formDrawer.item.line : undefined}
          leafAccounts={leafAccounts}
          submitting={formSubmitting}
          submitError={formError}
          onCancel={closeFormDrawer}
          onSubmit={handleFormSubmit}
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

      <LedgerQuickLinks current="journal-entries-lines" onNavigate={onNavigate} />
    </div>
  );
};

export default JournalEntryLinesView;
