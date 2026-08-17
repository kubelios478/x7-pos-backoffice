import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type { CashMovement, CashMovementType, CreateCashMovementDto } from '../../../../types/cash-movement';
import { CashManagementQuickLinks } from './CashManagementQuickLinks';

// Real backend route: GET /api/cash-shifts/:shiftId/expenses
// Response shape:     { statusCode: number; data: CashMovement[] }
const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// ─── Pure helpers (exported for unit tests) ────────────────────────────────

export function isMovementInflow(type: CashMovementType): boolean {
  return type === 'INFLOW';
}

export function isMovementOutflow(type: CashMovementType): boolean {
  return type === 'OUTFLOW';
}

export function formatMovementCurrency(n: number): string {
  return `$${Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatMovementTime(value: string | Date): string {
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function formatMovementDate(value: string | Date): string {
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Truncate reason text to maxLen chars with ellipsis. */
export function truncateReason(text: string, maxLen = 40): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

// ─── Receipt Lightbox ──────────────────────────────────────────────────────

interface ReceiptLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

const ReceiptLightbox: React.FC<ReceiptLightboxProps> = ({ src, alt, onClose }) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center font-sans"
      role="dialog"
      aria-modal="true"
      aria-label="Receipt photo preview"
    >
      <div
        data-testid="receipt-lightbox-backdrop"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative z-10 max-w-3xl w-full mx-4 animate-fade-in">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close receipt preview"
          className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors flex items-center gap-1.5 text-sm font-medium"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
          Close
        </button>
        <div className="bg-[#1a1a1a] rounded-lg overflow-hidden shadow-2xl border border-white/10">
          <div className="bg-[#222222] px-4 py-2.5 flex items-center gap-2 border-b border-white/10">
            <span className="material-symbols-outlined text-white/60 text-[16px]">receipt</span>
            <span className="text-white/60 text-[11px] font-bold uppercase tracking-widest">
              Receipt Voucher
            </span>
          </div>
          <img
            src={src}
            alt={alt}
            className="w-full max-h-[75vh] object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).alt = 'Image could not be loaded';
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Shift Selector Banner ──────────────────────────────────────────────────

interface ShiftOption {
  id: number;
  status: string;
  openedAt: string;
}

interface ShiftSelectorProps {
  shifts: ShiftOption[];
  selectedShiftId: number | null;
  loading: boolean;
  onSelect: (id: number) => void;
}

const ShiftSelector: React.FC<ShiftSelectorProps> = ({
  shifts,
  selectedShiftId,
  loading,
  onSelect,
}) => (
  <div className="bg-white border border-[#e8e2d8] p-5 rounded shadow-sm">
    <div className="flex items-center gap-3 mb-3">
      <span className="material-symbols-outlined text-[#ae001a] text-[20px]">schedule</span>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
          Shift Context
        </p>
        <p className="text-sm font-bold text-[#1d1c17]">Select a Cash Shift to view its movements</p>
      </div>
    </div>

    {loading ? (
      <div className="h-10 bg-[#ece8e0] rounded animate-pulse w-64" />
    ) : shifts.length === 0 ? (
      <p className="text-sm text-[#5f5e5e] italic">No cash shifts found for this merchant.</p>
    ) : (
      <div className="flex flex-wrap gap-2">
        {shifts.map((shift) => {
          const isOpen = shift.status === 'OPEN';
          const isSelected = shift.id === selectedShiftId;
          return (
            <button
              key={shift.id}
              type="button"
              onClick={() => onSelect(shift.id)}
              aria-pressed={isSelected}
              className={`px-3 py-1.5 rounded border text-[11px] font-bold uppercase tracking-wide transition-all ${
                isSelected
                  ? 'bg-[#222222] text-white border-[#222222]'
                  : 'bg-[#fef9f1] text-[#1d1c17] border-[#e8e2d8] hover:border-[#ae001a] hover:text-[#ae001a]'
              }`}
            >
              #CS-{shift.id}
              {isOpen && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    )}
  </div>
);

// ─── Record Cash Movement Modal ────────────────────────────────────────────

interface RecordCashMovementModalProps {
  shiftId: number;
  estimatedAvailableBalance: number;
  onClose: () => void;
  onSuccess: () => void;
}

const RecordCashMovementModal: React.FC<RecordCashMovementModalProps> = ({
  shiftId,
  estimatedAvailableBalance,
  onClose,
  onSuccess,
}) => {
  const API_BASE_MODAL = import.meta.env.VITE_API_URL ?? '/api';

  const [movementType, setMovementType] = useState<'INFLOW' | 'OUTFLOW'>('OUTFLOW');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ amount?: string; reason?: string }>({})
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Convert picked file → Base64 data-URI
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setSubmitError('Only PNG or JPEG files are accepted.');
      return;
    }
    setReceiptFile(file);
    setSubmitError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setReceiptPreview(result);
      setReceiptBase64(result);
    };
    reader.readAsDataURL(file);
  };

  const removeReceipt = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
    setReceiptBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Numeric amount parsed
  const parsedAmount = parseFloat(amount);
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount > 0;
  const showInsufficientFundsWarning =
    movementType === 'OUTFLOW' && isValidAmount && parsedAmount > estimatedAvailableBalance;

  // Client-side field validation
  const validate = (): boolean => {
    const errors: { amount?: string; reason?: string } = {};
    if (!isValidAmount) errors.amount = 'Enter a positive amount greater than $0.00.';
    if (!reason.trim()) errors.reason = 'A justification reason is required.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);

    const endpoint =
      movementType === 'OUTFLOW'
        ? `${API_BASE_MODAL}/cash-shifts/${shiftId}/expenses`
        : `${API_BASE_MODAL}/cash-shifts/${shiftId}/inflows`;

    const payload: CreateCashMovementDto = {
      amount: parsedAmount,
      reason: reason.trim(),
      ...(receiptBase64 ? { receiptPhoto: receiptBase64 } : {}),
    };

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          body?.message ||
          (res.status === 403
            ? 'You do not have permission to record this type of movement.'
            : `Request failed (HTTP ${res.status}).`);
        setSubmitError(Array.isArray(msg) ? msg.join(' ') : msg);
        return;
      }

      onSuccess();
    } catch {
      setSubmitError('Network error — please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4 font-sans"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rcm-modal-title"
    >
      {/* Backdrop */}
      <div
        data-testid="rcm-modal-backdrop"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div className="relative z-10 w-full max-w-lg bg-white border border-[#e8e2d8] rounded shadow-2xl animate-fade-in overflow-hidden flex flex-col">

        {/* ── Header ── */}
        <div className="bg-[#222222] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#ae001a] rounded flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[18px]">move_down</span>
            </div>
            <div>
              <p className="text-white/50 text-[9px] font-bold uppercase tracking-widest">Cash Shift #CS-{shiftId}</p>
              <h2 id="rcm-modal-title" className="text-white font-black text-sm uppercase tracking-tight leading-none">
                Record Cash Movement
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="text-white/60 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* ── Body ── */}
        <form onSubmit={handleSubmit} noValidate className="p-6 flex flex-col gap-5 overflow-y-auto">

          {/* Segmented control — Movement Type */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-2">
              Movement Type <span className="text-[#ae001a]">*</span>
            </p>
            <div
              role="group"
              aria-label="Movement type"
              className="grid grid-cols-2 rounded border border-[#e8e2d8] overflow-hidden"
            >
              <button
                type="button"
                id="rcm-type-outflow"
                aria-pressed={movementType === 'OUTFLOW'}
                onClick={() => setMovementType('OUTFLOW')}
                className={`flex items-center justify-center gap-2 py-3 text-[11px] font-black uppercase tracking-widest transition-all ${
                  movementType === 'OUTFLOW'
                    ? 'bg-[#ae001a] text-white shadow-inner'
                    : 'bg-[#fef9f1] text-[#5f5e5e] hover:bg-[#f2ede5]'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                Pay-Out / Outflow
              </button>
              <button
                type="button"
                id="rcm-type-inflow"
                aria-pressed={movementType === 'INFLOW'}
                onClick={() => setMovementType('INFLOW')}
                className={`flex items-center justify-center gap-2 py-3 text-[11px] font-black uppercase tracking-widest transition-all border-l border-[#e8e2d8] ${
                  movementType === 'INFLOW'
                    ? 'bg-green-600 text-white shadow-inner'
                    : 'bg-[#fef9f1] text-[#5f5e5e] hover:bg-[#f2ede5]'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                Pay-In / Inflow
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label
              htmlFor="rcm-amount"
              className="block text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-1.5"
            >
              Amount <span className="text-[#ae001a]">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5f5e5e] font-bold text-sm pointer-events-none">$</span>
              <input
                id="rcm-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (fieldErrors.amount) setFieldErrors((prev) => ({ ...prev, amount: undefined }));
                }}
                placeholder="0.00"
                aria-describedby={fieldErrors.amount ? 'rcm-amount-err' : undefined}
                className={`w-full pl-8 pr-4 py-2.5 border rounded bg-[#fef9f1] text-sm font-mono focus:outline-none focus:ring-2 transition-all ${
                  fieldErrors.amount
                    ? 'border-[#ae001a] focus:ring-[#ae001a]/30'
                    : 'border-[#e8e2d8] focus:border-[#ae001a] focus:ring-[#ae001a]/20'
                }`}
              />
            </div>
            {fieldErrors.amount && (
              <p id="rcm-amount-err" role="alert" className="mt-1 text-xs text-[#ae001a] font-medium">
                {fieldErrors.amount}
              </p>
            )}
          </div>

          {/* Insufficient funds warning */}
          {showInsufficientFundsWarning && (
            <div
              role="alert"
              data-testid="rcm-insufficient-funds-warning"
              className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-300 rounded"
            >
              <span className="material-symbols-outlined text-amber-600 text-[20px] shrink-0 mt-0.5">warning</span>
              <p className="text-amber-800 text-xs leading-snug">
                <span className="font-bold">Warning:</span> Pay-out amount ({formatMovementCurrency(parsedAmount)}) exceeds the
                estimated drawer cash balance ({formatMovementCurrency(estimatedAvailableBalance)}). Proceeding will
                generate a negative cash flow variance.
              </p>
            </div>
          )}

          {/* Reason */}
          <div>
            <label
              htmlFor="rcm-reason"
              className="block text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-1.5"
            >
              Reason / Justification <span className="text-[#ae001a]">*</span>
            </label>
            <textarea
              id="rcm-reason"
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (fieldErrors.reason) setFieldErrors((prev) => ({ ...prev, reason: undefined }));
              }}
              placeholder="e.g. Meat Supplier Invoice #1024, Office cleaning payment…"
              aria-describedby={fieldErrors.reason ? 'rcm-reason-err' : undefined}
              className={`w-full px-4 py-2.5 border rounded bg-[#fef9f1] text-sm resize-none focus:outline-none focus:ring-2 transition-all ${
                fieldErrors.reason
                  ? 'border-[#ae001a] focus:ring-[#ae001a]/30'
                  : 'border-[#e8e2d8] focus:border-[#ae001a] focus:ring-[#ae001a]/20'
              }`}
            />
            {fieldErrors.reason && (
              <p id="rcm-reason-err" role="alert" className="mt-1 text-xs text-[#ae001a] font-medium">
                {fieldErrors.reason}
              </p>
            )}
          </div>

          {/* Receipt Photo (optional) */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-1.5">
              Receipt Photo <span className="text-[#5f5e5e] font-normal normal-case tracking-normal">(optional — PNG or JPEG)</span>
            </p>
            {receiptPreview ? (
              <div className="relative border border-[#e8e2d8] rounded overflow-hidden bg-[#fef9f1]">
                <img
                  src={receiptPreview}
                  alt="Receipt preview"
                  className="w-full max-h-40 object-contain"
                />
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={removeReceipt}
                    aria-label="Remove receipt photo"
                    className="flex items-center gap-1 px-2 py-1 bg-[#ae001a] text-white text-[10px] font-bold uppercase rounded shadow hover:bg-[#8a0015] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[13px]">delete</span>
                    Remove
                  </button>
                </div>
                <div className="px-3 py-1.5 bg-[#ece8e0] border-t border-[#e8e2d8]">
                  <p className="text-[10px] text-[#5f5e5e] font-medium truncate">{receiptFile?.name}</p>
                </div>
              </div>
            ) : (
              <label
                htmlFor="rcm-receipt"
                className="flex flex-col items-center justify-center gap-2 w-full h-28 border-2 border-dashed border-[#e8e2d8] rounded bg-[#fef9f1] cursor-pointer hover:border-[#ae001a] hover:bg-[#fdf6ee] transition-all group"
              >
                <span className="material-symbols-outlined text-[#5f5e5e] text-3xl group-hover:text-[#ae001a] transition-colors">
                  upload_file
                </span>
                <span className="text-[11px] text-[#5f5e5e] font-bold uppercase tracking-widest group-hover:text-[#ae001a] transition-colors">
                  Click to attach receipt
                </span>
                <input
                  ref={fileInputRef}
                  id="rcm-receipt"
                  type="file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  onChange={handleFileChange}
                />
              </label>
            )}
          </div>

          {/* Submit error */}
          {submitError && (
            <div
              role="alert"
              data-testid="rcm-submit-error"
              className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-300 rounded"
            >
              <span className="material-symbols-outlined text-red-500 text-[18px] shrink-0 mt-0.5">error</span>
              <p className="text-red-700 text-xs leading-snug">{submitError}</p>
            </div>
          )}

          {/* Estimated balance info row */}
          <div className="flex items-center justify-between px-3 py-2 bg-[#ece8e0] rounded border border-[#e8e2d8] text-xs">
            <span className="text-[#5f5e5e] font-bold uppercase tracking-widest text-[10px]">
              Estimated Drawer Balance
            </span>
            <span
              className={`font-black tabular-nums ${
                estimatedAvailableBalance < 0 ? 'text-[#ae001a]' : 'text-[#1d1c17]'
              }`}
            >
              {formatMovementCurrency(estimatedAvailableBalance)}
            </span>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2.5 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="rcm-submit-btn"
              disabled={submitting}
              data-testid="rcm-submit"
              className={`flex items-center gap-2 px-6 py-2.5 text-white text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                movementType === 'OUTFLOW'
                  ? 'bg-[#ae001a] hover:bg-[#8a0015]'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">
                    {movementType === 'OUTFLOW' ? 'arrow_upward' : 'arrow_downward'}
                  </span>
                  Record {movementType === 'OUTFLOW' ? 'Pay-Out' : 'Pay-In'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

// ─── Main View ─────────────────────────────────────────────────────────────

interface CashMovementsViewProps {
  onNavigate?: (view: string) => void;
}

export const CashMovementsView: React.FC<CashMovementsViewProps> = ({ onNavigate }) => {
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shift management
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(true);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<'' | CashMovementType>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Lightbox
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState<string>('Receipt');

  // Record Cash Movement modal
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);

  // ── Load available shifts ──────────────────────────────────────────────

  useEffect(() => {
    const fetchShifts = async () => {
      setShiftsLoading(true);
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/cash-shifts?limit=50`, { headers });
        if (res.status === 401) {
          clearAuthSession();
          window.location.href = '/login';
          return;
        }
        if (res.ok) {
          const json = await res.json();
          const list: ShiftOption[] = (json.data ?? []).map((s: any) => ({
            id: s.id,
            status: s.status,
            openedAt: s.openedAt,
          }));
          setShifts(list);
          // Auto-select the first OPEN shift, or the most recent one
          const open = list.find((s) => s.status === 'OPEN');
          if (open) setSelectedShiftId(open.id);
          else if (list.length > 0) setSelectedShiftId(list[0].id);
        }
      } catch (err) {
        console.error('Error fetching shifts:', err);
      } finally {
        setShiftsLoading(false);
      }
    };
    fetchShifts();
  }, []);

  // ── Load movements for selected shift ─────────────────────────────────

  const fetchMovements = useCallback(async () => {
    if (selectedShiftId === null) return;
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // Real endpoint: GET /api/cash-shifts/:shiftId/expenses
      const res = await fetch(`${API_BASE}/cash-shifts/${selectedShiftId}/expenses`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      setMovements((json.data ?? []).map((m: CashMovement) => ({
        ...m,
        amount: Number(m.amount),
      })));
    } catch (err) {
      console.error('Error fetching cash movements:', err);
      setError('Failed to load cash movements for this shift.');
    } finally {
      setLoading(false);
    }
  }, [selectedShiftId]);

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  // ── Client-side filtering ──────────────────────────────────────────────

  const filteredMovements = React.useMemo(() => {
    let result = movements;

    if (typeFilter) {
      result = result.filter((mv) => mv.type === typeFilter);
    }

    const term = searchQuery.trim().toLowerCase();
    if (!term) return result;

    return result.filter((mv) => {
      const mvtRef = `#mvt-${mv.id}`;
      const idStr = String(mv.id);
      const reason = mv.reason?.toLowerCase() ?? '';
      const userId = `#user-${mv.userId}`;
      return (
        mvtRef.includes(term) ||
        idStr.includes(term) ||
        reason.includes(term) ||
        userId.includes(term)
      );
    });
  }, [movements, typeFilter, searchQuery]);

  const hasActiveFilter = Boolean(searchQuery || typeFilter);

  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('');
  };

  // ── Derived: is the selected shift OPEN? ──────────────────────────────
  const selectedShift = shifts.find((s) => s.id === selectedShiftId) ?? null;
  const isSelectedShiftOpen = selectedShift?.status === 'OPEN';

  // ── Estimated available balance ────────────────────────────────────────
  // openingBalance is not available in ShiftOption, so we use a best-effort
  // estimate from the loaded movements (INFLOW net - OUTFLOW net). The shift's
  // full balance is enforced server-side; this is only for the UI warning.
  const estimatedAvailableBalance = React.useMemo(() => {
    const net = movements.reduce((acc, mv) => {
      return mv.type === 'INFLOW' ? acc + mv.amount : acc - mv.amount;
    }, 0);
    // We don't have openingBalance here, so we just track net movement delta.
    // Show the net as a floor — the warning is non-blocking.
    return Math.max(net, 0);
  }, [movements]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">

      {/* ── Shift Selector ─────────────────────────────────────────────── */}
      <ShiftSelector
        shifts={shifts}
        selectedShiftId={selectedShiftId}
        loading={shiftsLoading}
        onSelect={(id) => {
          setSelectedShiftId(id);
          setMovements([]);
          setError(null);
        }}
      />

      {/* ── No shift selected ──────────────────────────────────────────── */}
      {selectedShiftId === null && !shiftsLoading && (
        <div
          data-testid="cash-movements-no-shift"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm gap-4"
        >
          <div className="w-16 h-16 rounded-full bg-[#fef9f1] border border-[#e8e2d8] flex items-center justify-center">
            <span className="material-symbols-outlined text-[#d51f2c] text-3xl">move_down</span>
          </div>
          <div>
            <p className="text-[#1d1c17] font-bold text-base mb-1">No Shift Selected</p>
            <p className="text-[#5f5e5e] max-w-md text-sm leading-relaxed">
              Select a cash shift above to load its movements.
            </p>
          </div>
        </div>
      )}

      {/* ── Main content (only when a shift is selected) ───────────────── */}
      {selectedShiftId !== null && (
        <>
          {/* Filter Bar */}
          <div className="bg-white border border-[#e8e2d8] p-4 rounded shadow-sm flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by #MVT-id or reason…"
                className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
                aria-label="Search cash movements"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as '' | CashMovementType)}
              className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              aria-label="Filter by movement type"
            >
              <option value="">All Types</option>
              <option value="INFLOW">Inflow (+)</option>
              <option value="OUTFLOW">Outflow (−)</option>
            </select>

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

          {/* Error State */}
          {error && (
            <div className="border border-red-300 bg-red-50 p-6 text-center rounded shadow-sm">
              <span className="material-symbols-outlined text-red-500 text-3xl" aria-hidden="true">
                error
              </span>
              <p className="mt-2 text-red-700 font-medium text-sm">{error}</p>
              <button
                type="button"
                onClick={() => fetchMovements()}
                className="mt-3 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Data Grid */}
          {!error && (
            <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
              {/* Grid Header */}
              <div className="px-4 py-3 bg-[#222222] flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">move_down</span>
                  CASH MOVEMENTS — SHIFT #CS-{selectedShiftId}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-white/50 text-xs">
                    {loading
                      ? 'Loading…'
                      : hasActiveFilter
                        ? `${filteredMovements.length} of ${movements.length} movements`
                        : `${movements.length} movements`}
                  </span>
                  {/* CTA — only enabled for OPEN shifts */}
                  <button
                    type="button"
                    id="record-cash-movement-btn"
                    data-testid="record-cash-movement-btn"
                    onClick={() => setIsRecordModalOpen(true)}
                    disabled={!isSelectedShiftOpen || loading}
                    title={
                      !isSelectedShiftOpen
                        ? 'Cash movements can only be recorded against an active OPEN shift.'
                        : 'Record a manual cash pay-in or pay-out'
                    }
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#ae001a] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#8a0015] transition-all disabled:opacity-40 disabled:cursor-not-allowed rounded"
                  >
                    <span className="material-symbols-outlined text-[15px]">add_circle</span>
                    Record Cash Movement
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                    <tr>
                      <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap">
                        Movement ID &amp; Time
                      </th>
                      <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap">
                        Type &amp; Flow
                      </th>
                      <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                        Amount
                      </th>
                      <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                        Reason / Justification
                      </th>
                      <th className="px-5 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap">
                        Receipt Voucher
                      </th>
                      <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap">
                        Recorded By &amp; Shift
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#e8e2d8]">
                    {loading
                      ? [1, 2, 3].map((i) => (
                          <tr key={i} data-testid={`cash-movement-skeleton-${i}`}>
                            <td className="px-5 py-4">
                              <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-28" />
                              <div className="h-3 bg-[#ece8e0] rounded animate-pulse w-16 mt-1.5" />
                            </td>
                            <td className="px-5 py-4">
                              <div className="h-6 bg-[#ece8e0] rounded-full animate-pulse w-20" />
                            </td>
                            <td className="px-5 py-4">
                              <div className="h-5 bg-[#ece8e0] rounded animate-pulse w-16" />
                            </td>
                            <td className="px-5 py-4">
                              <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-40" />
                            </td>
                            <td className="px-5 py-4 text-center">
                              <div className="h-6 bg-[#ece8e0] rounded-full animate-pulse w-20 mx-auto" />
                            </td>
                            <td className="px-5 py-4">
                              <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-24" />
                            </td>
                          </tr>
                        ))
                      : filteredMovements.length === 0
                        ? (
                          <tr>
                            <td colSpan={6} className="px-6 py-12 text-center">
                              <div className="flex flex-col items-center gap-3" data-testid="cash-movements-empty-state">
                                <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">
                                  {hasActiveFilter ? 'search_off' : 'move_down'}
                                </span>
                                <p className="text-sm text-[#5f5e5e] font-medium max-w-sm">
                                  {hasActiveFilter
                                    ? 'No movements match the current filters.'
                                    : 'No cash movements recorded for this shift or date range. Click Record Movement to log a pay-in or pay-out.'}
                                </p>
                                {hasActiveFilter && (
                                  <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="text-[#ae001a] text-sm font-semibold hover:underline"
                                  >
                                    Show all movements
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                        : filteredMovements.map((mv) => {
                            const inflow = isMovementInflow(mv.type);

                            return (
                              <tr
                                key={mv.id}
                                data-testid={`cash-movement-row-${mv.id}`}
                                className="hover:bg-[#f8f3eb] transition-colors"
                              >
                                {/* Movement ID & Time */}
                                <td className="px-5 py-4 whitespace-nowrap">
                                  <p className="font-bold text-[#1d1c17] leading-tight text-sm">
                                    #MVT-{mv.id}
                                  </p>
                                  <span className="text-[11px] text-[#5f5e5e] font-mono block mt-0.5">
                                    {formatMovementDate(mv.createdAt)},{' '}
                                    {formatMovementTime(mv.createdAt)}
                                  </span>
                                </td>

                                {/* Type & Flow Badge */}
                                <td className="px-5 py-4">
                                  <span
                                    className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full inline-flex items-center gap-1 whitespace-nowrap ${
                                      inflow
                                        ? 'bg-green-500/10 text-green-700 border border-green-500/20'
                                        : 'bg-red-500/10 text-[#ae001a] border border-red-500/20'
                                    }`}
                                  >
                                    <span className="font-black text-[11px]">
                                      {inflow ? '+' : '−'}
                                    </span>
                                    {mv.type}
                                  </span>
                                </td>

                                {/* Amount */}
                                <td
                                  className={`px-5 py-4 font-bold text-sm whitespace-nowrap ${
                                    inflow ? 'text-green-600' : 'text-[#ae001a]'
                                  }`}
                                >
                                  {inflow ? '+' : '−'}
                                  {formatMovementCurrency(mv.amount)}
                                </td>

                                {/* Reason */}
                                <td className="px-5 py-4 max-w-[200px]">
                                  {mv.reason ? (
                                    <span
                                      title={mv.reason}
                                      className="text-sm text-[#1d1c17] block truncate cursor-default"
                                      data-testid={`movement-reason-${mv.id}`}
                                    >
                                      {truncateReason(mv.reason)}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-[#5f5e5e] italic">
                                      No reason provided
                                    </span>
                                  )}
                                </td>

                                {/* Receipt Photo */}
                                <td className="px-5 py-4 text-center">
                                  {mv.receiptPhoto ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLightboxSrc(mv.receiptPhoto!);
                                        setLightboxAlt(`Receipt for #MVT-${mv.id}`);
                                      }}
                                      aria-label={`View receipt for movement ${mv.id}`}
                                      data-testid={`receipt-badge-${mv.id}`}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#fef9f1] hover:bg-[#f2ede5] border border-[#e8e2d8] hover:border-[#ae001a] rounded-full text-[10px] font-bold text-[#ae001a] uppercase tracking-wide transition-all group"
                                    >
                                      <span className="w-5 h-5 rounded overflow-hidden shrink-0 border border-[#e8e2d8] group-hover:border-[#ae001a] transition-colors">
                                        <img
                                          src={mv.receiptPhoto}
                                          alt=""
                                          aria-hidden="true"
                                          className="w-full h-full object-cover"
                                          onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).style.display =
                                              'none';
                                          }}
                                        />
                                      </span>
                                      <span className="material-symbols-outlined text-[13px]">
                                        zoom_in
                                      </span>
                                      View
                                    </button>
                                  ) : (
                                    <span
                                      className="text-[11px] text-[#5f5e5e] italic"
                                      data-testid={`no-receipt-${mv.id}`}
                                    >
                                      No Attachment
                                    </span>
                                  )}
                                </td>

                                {/* Recorded By & Shift */}
                                <td className="px-5 py-4">
                                  <p className="text-xs font-bold text-[#1d1c17] leading-tight">
                                    User #{mv.userId}
                                  </p>
                                  <span className="mt-1 inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-800 border border-amber-500/20">
                                    #CS-{mv.shiftId}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Receipt Lightbox Portal */}
      {lightboxSrc && (
        <ReceiptLightbox
          src={lightboxSrc}
          alt={lightboxAlt}
          onClose={() => {
            setLightboxSrc(null);
            setLightboxAlt('Receipt');
          }}
        />
      )}

      {/* Record Cash Movement Modal */}
      {isRecordModalOpen && selectedShiftId !== null && (
        <RecordCashMovementModal
          shiftId={selectedShiftId}
          estimatedAvailableBalance={estimatedAvailableBalance}
          onClose={() => setIsRecordModalOpen(false)}
          onSuccess={() => {
            setIsRecordModalOpen(false);
            fetchMovements();
          }}
        />
      )}

      <CashManagementQuickLinks activeModule="cash-movements" onNavigate={onNavigate} />
    </div>
  );
};

export default CashMovementsView;
