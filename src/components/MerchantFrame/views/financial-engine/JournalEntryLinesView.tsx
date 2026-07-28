import React, { useEffect, useMemo, useState } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type { JournalEntry, JournalEntryLine, LedgerAccount } from '../../../../types/accounting';
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
  return !accounts.some((a) => a.parent_account_id === account.id);
}

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

  const flattenedLines = useMemo(() => flattenJournalEntryLines(entries), [entries]);

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
            aria-label="Filter by ledger account"
          >
            <option value="">All Accounts</option>
            {ledgerAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </select>
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

      <LedgerQuickLinks current="journal-entries-lines" onNavigate={onNavigate} />
    </div>
  );
};

export default JournalEntryLinesView;
