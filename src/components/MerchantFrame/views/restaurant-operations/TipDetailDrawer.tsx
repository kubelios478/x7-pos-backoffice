import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Tip, TipMethod, TipStatus, TipRecordStatus } from '../../../../types/tips';
import {
  updateTip,
  fetchPaymentOptionsForOrder,
  formatTipCurrency,
  formatTipDateTime,
  type PaymentOption,
} from '../../../../api/tips';

export interface TipDetailDrawerProps {
  tip: Tip | null;
  onClose: () => void;
  onSaved?: (updatedTip: Tip) => void;
  onNavigate?: (view: string) => void;
}

export const TipDetailDrawer: React.FC<TipDetailDrawerProps> = ({
  tip,
  onClose,
  onSaved,
  onNavigate,
}) => {
  if (!tip) return null;

  const isSettled = tip.status === 'SETTLED';

  // Form State
  const [amount, setAmount] = useState<string>(String(tip.amount));
  const [method, setMethod] = useState<TipMethod>(tip.method);
  const [paymentId, setPaymentId] = useState<string>(
    tip.payment_id !== null && tip.payment_id !== undefined ? String(tip.payment_id) : ''
  );
  const [status, setStatus] = useState<TipStatus>(tip.status);
  const [recordStatus, setRecordStatus] = useState<TipRecordStatus>(tip.record_status);
  const [notes, setNotes] = useState<string>(tip.notes || '');

  // Payment Options & Status State
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [loadingPayments, setLoadingPayments] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (tip) {
      setAmount(String(tip.amount));
      setMethod(tip.method);
      setPaymentId(tip.payment_id !== null && tip.payment_id !== undefined ? String(tip.payment_id) : '');
      setStatus(tip.status);
      setRecordStatus(tip.record_status);
      setNotes(tip.notes || '');
      setErrorMessage(null);
      setSuccessMessage(null);

      // Load valid payment transaction options for the order
      setLoadingPayments(true);
      fetchPaymentOptionsForOrder(tip.order_id)
        .then((options) => setPaymentOptions(options))
        .catch(() => setPaymentOptions([]))
        .finally(() => setLoadingPayments(false));
    }
  }, [tip]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setErrorMessage('Please specify a valid numeric tip amount (precision 12, scale 2).');
      return;
    }

    if (isSettled && parsedAmount !== tip.amount) {
      setErrorMessage('Settled tips cannot be edited. Reverse the settlement transaction prior to modifying amount.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Partial<Tip> = {
        amount: parsedAmount,
        method,
        payment_id: paymentId ? parseInt(paymentId, 10) : null,
        status,
        record_status: recordStatus,
        notes,
      };

      const updated = await updateTip(tip.id, payload);
      setSuccessMessage(`Tip #TIP-${tip.id} updated successfully.`);
      if (onSaved) {
        onSaved(updated);
      }
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update tip entry.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSoftDelete = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setSubmitting(true);

    try {
      const newStatus: TipRecordStatus = recordStatus === 'ACTIVE' ? 'DELETED' : 'ACTIVE';
      const updated = await updateTip(tip.id, { record_status: newStatus });
      setRecordStatus(newStatus);
      setSuccessMessage(
        newStatus === 'DELETED'
          ? `Tip #TIP-${tip.id} logically soft-deleted (status = DELETED).`
          : `Tip #TIP-${tip.id} restored to ACTIVE status.`
      );
      if (onSaved) {
        onSaved(updated);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update record status.');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="font-sans">
      {/* Backdrop */}
      <div
        data-testid="tip-detail-drawer-backdrop"
        className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm transition-opacity animate-fade-in cursor-pointer"
        onClick={onClose}
      />

      {/* Slide-over Content Panel */}
      <div
        role="dialog"
        aria-label={`Tip #TIP-${tip.id} Details & Adjustment`}
        data-testid="tip-detail-drawer"
        className="fixed top-0 right-0 bottom-0 z-[99999] w-full max-w-lg bg-white border-l border-[#e8e2d8] shadow-2xl overflow-hidden flex flex-col animate-slide-in text-left text-[#1d1c17]"
      >
        {/* Top Header */}
        <div className="bg-[#222222] p-4 text-white flex flex-col gap-2 shrink-0">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[11px] uppercase tracking-widest">
                #TIP-{tip.id} Details &amp; Adjustment
              </span>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                  tip.record_status === 'ACTIVE'
                    ? 'bg-green-500/20 text-green-300'
                    : 'bg-gray-600/30 text-gray-300 line-through'
                }`}
              >
                {tip.record_status}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              data-testid="tip-drawer-close-button"
              className="text-white/70 hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="flex justify-between items-center text-white/70 text-[11px]">
            <span className="font-mono">Created: {formatTipDateTime(tip.created_at)}</span>
            <span className="font-mono">
              Tenant: {tip.company_id} / {tip.merchant_id}
            </span>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          {/* Settlement Immutability Guard Warning */}
          {isSettled && (
            <div
              data-testid="settlement-guard-warning"
              className="p-4 rounded border border-amber-300 bg-amber-50 text-amber-800 flex items-start gap-3 text-xs leading-relaxed"
            >
              <span className="material-symbols-outlined text-amber-600 text-lg shrink-0 mt-0.5">
                lock
              </span>
              <div>
                <p className="font-bold">Settled tips cannot be edited.</p>
                <p className="text-amber-700 mt-0.5">
                  Reverse the settlement transaction prior to modifying amount.
                </p>
              </div>
            </div>
          )}

          {/* Feedback Messages */}
          {errorMessage && (
            <div
              data-testid="tip-drawer-error"
              className="p-3.5 rounded border border-red-300 bg-red-50 text-red-700 text-xs font-semibold flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">error</span>
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div
              data-testid="tip-drawer-success"
              className="p-3.5 rounded border border-green-300 bg-green-50 text-green-800 text-xs font-semibold flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">check_circle</span>
              {successMessage}
            </div>
          )}

          {/* Associated Order Card */}
          <div className="bg-[#fef9f1] p-4 rounded border border-[#e8e2d8] space-y-2">
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-widest">Order Reference</p>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => onNavigate?.(`/pos/orders/#ORD-${tip.order_id}`)}
                className="font-bold text-[#1d1c17] hover:text-[#ae001a] transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm text-[#5f5e5e]">receipt_long</span>
                #ORD-{tip.order_id}
              </button>
              <span className="text-xs text-[#5f5e5e]">
                Current Tip: <strong className="text-[#1d1c17]">{formatTipCurrency(tip.amount)}</strong>
              </span>
            </div>
          </div>

          {/* Amount Input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tip-amount-input" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Tip Amount ($USD) <span className="text-red-600">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] font-bold text-sm">
                $
              </span>
              <input
                id="tip-amount-input"
                type="number"
                step="0.01"
                min="0"
                data-testid="tip-edit-amount-input"
                disabled={isSettled}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`w-full pl-8 pr-4 py-2 bg-white text-[#1d1c17] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none ${
                  isSettled ? 'bg-gray-100 text-[#5f5e5e] cursor-not-allowed' : ''
                }`}
                placeholder="5.50"
              />
            </div>
            {isSettled && (
              <p className="text-[11px] text-amber-700 font-medium">
                Amount editing disabled due to SETTLED status guard.
              </p>
            )}
          </div>

          {/* Payment Method Selector */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tip-method-select" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Payment Method <span className="text-red-600">*</span>
            </label>
            <select
              id="tip-method-select"
              data-testid="tip-edit-method-select"
              value={method}
              onChange={(e) => setMethod(e.target.value as TipMethod)}
              className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none"
            >
              <option value="CARD">CARD (Credit / Debit Card)</option>
              <option value="CASH">CASH (Independent Cash Tip)</option>
              <option value="ONLINE">ONLINE (App Digital Checkout)</option>
              <option value="QR_PAYMENT">QR_PAYMENT (Table QR Code)</option>
            </select>
          </div>

          {/* Payment Reference Selector (payment_id) */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tip-payment-select" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Linked Payment Reference (#PAY)
            </label>
            <select
              id="tip-payment-select"
              data-testid="tip-edit-payment-select"
              value={paymentId}
              onChange={(e) => setPaymentId(e.target.value)}
              className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none font-mono"
            >
              <option value="">None / Unlinked (Independent Cash Tip)</option>
              {loadingPayments ? (
                <option value="" disabled>Loading payment options...</option>
              ) : (
                paymentOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.reference} — {opt.method} ({formatTipCurrency(opt.amount)})
                  </option>
                ))
              )}
            </select>
            <p className="text-[11px] text-[#5f5e5e]">
              Binds tip record to card processing transaction for post-processing audits.
            </p>
          </div>

          {/* Allocation Status */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tip-status-select" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Allocation Lifecycle Status
            </label>
            <select
              id="tip-status-select"
              data-testid="tip-edit-status-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as TipStatus)}
              className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none"
            >
              <option value="PENDING">PENDING (Awaiting pool allocation)</option>
              <option value="ALLOCATED">ALLOCATED (Assigned to tip pool or shift record)</option>
              <option value="SETTLED">SETTLED (Paid out in tip settlement execution)</option>
            </select>
          </div>

          {/* Record Status */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tip-record-status-select" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Logical Record Status
            </label>
            <select
              id="tip-record-status-select"
              data-testid="tip-edit-record-status-select"
              value={recordStatus}
              onChange={(e) => setRecordStatus(e.target.value as TipRecordStatus)}
              className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none"
            >
              <option value="ACTIVE">ACTIVE (Normal Active Tip Record)</option>
              <option value="DELETED">DELETED (Soft-Deleted Record - Financial Audit Preserved)</option>
            </select>
          </div>

          {/* Audit Notes */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tip-notes" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Audit Justification Notes
            </label>
            <textarea
              id="tip-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter optional audit justification notes..."
              className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none resize-none"
            />
          </div>

          {/* Actions Footer */}
          <div className="pt-4 border-t border-[#e8e2d8] flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              data-testid="tip-soft-delete-button"
              onClick={handleSoftDelete}
              disabled={submitting}
              className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] hover:text-[#ae001a] text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">
                {recordStatus === 'ACTIVE' ? 'delete' : 'restore_from_trash'}
              </span>
              {recordStatus === 'ACTIVE' ? 'Soft Delete' : 'Restore Active'}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="tip-save-button"
                disabled={submitting}
                className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  'Saving...'
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">save</span>
                    Save Tip Adjustments
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default TipDetailDrawer;
