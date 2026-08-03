import React, { useRef, useState } from 'react';
import type { CreateJournalEntryLineDto, LedgerAccount } from '../../../../types/accounting';

export interface JournalEntryLineDraft {
  key: string;
  account_id: number | null;
  accountQuery: string;
  debit: string;
  credit: string;
  description: string;
}

let lineKeySeq = 0;
export function createEmptyLine(): JournalEntryLineDraft {
  lineKeySeq += 1;
  return {
    key: `line-${lineKeySeq}`,
    account_id: null,
    accountQuery: '',
    debit: '',
    credit: '',
    description: '',
  };
}

export function computeLineTotals(lines: JournalEntryLineDraft[]): {
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
} {
  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  return { totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.001 };
}

export function toCreateLineDtos(lines: JournalEntryLineDraft[]): CreateJournalEntryLineDto[] {
  return lines
    .filter((l) => l.account_id != null && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0))
    .map((l) => ({
      account_id: l.account_id as number,
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0,
      ...(l.description.trim() ? { description: l.description.trim() } : {}),
    }));
}

export function linesAreValidAndBalanced(lines: JournalEntryLineDraft[]): boolean {
  const dtos = toCreateLineDtos(lines);
  if (dtos.length === 0) return false;
  const totalDebit = dtos.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = dtos.reduce((sum, l) => sum + l.credit, 0);
  return totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.001;
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface JournalEntryLinesEditorProps {
  accounts: LedgerAccount[];
  lines: JournalEntryLineDraft[];
  onChange: (lines: JournalEntryLineDraft[]) => void;
}

export const JournalEntryLinesEditor: React.FC<JournalEntryLinesEditorProps> = ({
  accounts,
  lines,
  onChange,
}) => {
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBlurTimeout = () => {
    if (blurTimeoutRef.current != null) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  };

  const updateLine = (key: string, patch: Partial<JournalEntryLineDraft>) => {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    onChange(lines.filter((l) => l.key !== key));
  };

  const addLine = () => {
    onChange([...lines, createEmptyLine()]);
  };

  const selectAccount = (key: string, account: LedgerAccount) => {
    clearBlurTimeout();
    updateLine(key, { account_id: account.id, accountQuery: `${account.code} — ${account.name}` });
    setOpenRowKey(null);
  };

  const { totalDebit, totalCredit, isBalanced } = computeLineTotals(lines);

  return (
    <div className="flex flex-col gap-3" data-testid="journal-entry-lines-editor">
      {lines.map((line) => {
        const term = line.accountQuery.trim().toLowerCase();
        const filteredAccounts = accounts.filter(
          (a) => !term || a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term),
        );
        return (
          <div
            key={line.key}
            className="grid grid-cols-12 gap-2 items-start border border-[#e8e2d8] p-3 rounded relative"
          >
            <div className="col-span-5 relative">
              <input
                type="text"
                role="combobox"
                aria-expanded={openRowKey === line.key}
                aria-label="Ledger account"
                autoComplete="off"
                value={line.accountQuery}
                onFocus={() => {
                  clearBlurTimeout();
                  setOpenRowKey(line.key);
                }}
                onChange={(e) => updateLine(line.key, { accountQuery: e.target.value, account_id: null })}
                onBlur={() => {
                  blurTimeoutRef.current = setTimeout(() => setOpenRowKey(null), 100);
                }}
                placeholder="Search account..."
                className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              />
              {openRowKey === line.key && (
                <ul
                  role="listbox"
                  aria-label="Account options"
                  className="absolute top-full mt-1 left-0 right-0 bg-white border border-[#e8e2d8] rounded shadow-lg max-h-40 overflow-y-auto z-10"
                >
                  {filteredAccounts.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-[#5f5e5e]">No matching accounts</li>
                  ) : (
                    filteredAccounts.map((a) => (
                      <li
                        key={a.id}
                        role="option"
                        onMouseDown={() => selectAccount(line.key, a)}
                        className="px-3 py-2 text-sm hover:bg-[#f8f3eb] cursor-pointer"
                      >
                        {a.code} — {a.name}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
            <div className="col-span-2">
              <input
                type="number"
                min="0"
                step="0.01"
                aria-label="Debit"
                value={line.debit}
                onChange={(e) => updateLine(line.key, { debit: e.target.value })}
                className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              />
            </div>
            <div className="col-span-2">
              <input
                type="number"
                min="0"
                step="0.01"
                aria-label="Credit"
                value={line.credit}
                onChange={(e) => updateLine(line.key, { credit: e.target.value })}
                className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              />
            </div>
            <div className="col-span-2">
              <input
                type="text"
                aria-label="Line description"
                value={line.description}
                onChange={(e) => updateLine(line.key, { description: e.target.value })}
                placeholder="Description"
                className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              />
            </div>
            <div className="col-span-1 flex justify-center pt-2">
              <button
                type="button"
                onClick={() => removeLine(line.key)}
                aria-label="Remove line"
                className="text-[#5f5e5e] hover:text-red-600 transition-colors"
              >
                <span className="material-symbols-outlined text-xl">delete</span>
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addLine}
        className="self-start px-4 py-2 border border-[#e8e2d8] text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:bg-[#f2ede5] transition-colors"
      >
        + Add Line
      </button>
      <div className="flex justify-end gap-6 pt-2 border-t border-[#e8e2d8] text-sm">
        <span className="font-semibold">{`Total Debit: ${formatCurrency(totalDebit)}`}</span>
        <span className="font-semibold">{`Total Credit: ${formatCurrency(totalCredit)}`}</span>
        <span
          className={`font-bold uppercase text-[11px] px-2 py-0.5 rounded ${
            isBalanced ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
          }`}
        >
          {isBalanced ? 'Balanced' : 'Unbalanced'}
        </span>
      </div>
    </div>
  );
};

export default JournalEntryLinesEditor;
