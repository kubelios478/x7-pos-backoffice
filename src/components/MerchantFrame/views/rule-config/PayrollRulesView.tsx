import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  MerchantPayrollRule,
  PayrollFrequency,
  CreatePayrollRuleDto,
  UpdatePayrollRuleDto,
} from '../../../../types/configuration';
import { RuleConfigQuickLinks } from './RuleConfigQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export function formatPayrollSchedule(rule: MerchantPayrollRule): string {
  const dayOfWeek = rule.payDayOfWeek != null ? Number(rule.payDayOfWeek) : null;
  const dayOfMonth = rule.payDayOfMonth != null ? Number(rule.payDayOfMonth) : null;

  switch (rule.frequencyPayroll) {
    case 'weekly':
      return dayOfWeek != null ? `Weekly (Day ${dayOfWeek})` : 'Weekly';
    case 'biweekly':
      return dayOfWeek != null ? `Biweekly (Day ${dayOfWeek})` : 'Biweekly';
    case 'monthly':
      return dayOfMonth != null ? `Monthly (Day ${dayOfMonth})` : 'Monthly';
    case 'custom':
      return 'Custom';
    default:
      return '—';
  }
}

interface PayrollRuleFormModalProps {
  mode: 'create' | 'edit';
  initialRule?: MerchantPayrollRule;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (dto: CreatePayrollRuleDto | UpdatePayrollRuleDto) => void;
}

const PayrollRuleFormModal: React.FC<PayrollRuleFormModalProps> = ({
  mode,
  initialRule,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const [name, setName] = useState(initialRule?.name ?? '');
  const [frequencyPayroll, setFrequencyPayroll] = useState<PayrollFrequency>(
    initialRule?.frequencyPayroll ?? 'weekly',
  );
  const [payDayOfWeek, setPayDayOfWeek] = useState(
    initialRule?.payDayOfWeek != null ? String(initialRule.payDayOfWeek) : '',
  );
  const [payDayOfMonth, setPayDayOfMonth] = useState(
    initialRule?.payDayOfMonth != null ? String(initialRule.payDayOfMonth) : '',
  );
  const [currency, setCurrency] = useState(initialRule?.currency ?? '');
  const [roundingPrecision, setRoundingPrecision] = useState(
    initialRule?.roundingPrecision != null ? String(initialRule.roundingPrecision) : '',
  );
  const [allowNegativePayroll, setAllowNegativePayroll] = useState(
    initialRule?.allowNegativePayroll ?? false,
  );
  const [autoApprovePayroll, setAutoApprovePayroll] = useState(
    initialRule?.autoApprovePayroll ?? false,
  );
  const [requiresManagerApproval, setRequiresManagerApproval] = useState(
    initialRule?.requiresManagerApproval ?? false,
  );

  const needsWeekDay = frequencyPayroll === 'weekly' || frequencyPayroll === 'biweekly';
  const needsMonthDay = frequencyPayroll === 'monthly';

  const nameValid = name.trim().length > 0 && name.length <= 50;
  const currencyValid = currency.trim().length > 0 && currency.length <= 10;

  const roundingPrecisionNum = parseInt(roundingPrecision, 10);
  const roundingPrecisionValid =
    roundingPrecision.trim() !== '' && Number.isInteger(roundingPrecisionNum);

  const payDayOfWeekNum = parseInt(payDayOfWeek, 10);
  const payDayOfWeekValid =
    !needsWeekDay ||
    (payDayOfWeek.trim() !== '' &&
      Number.isInteger(payDayOfWeekNum) &&
      payDayOfWeekNum >= 1 &&
      payDayOfWeekNum <= 7);

  const payDayOfMonthNum = parseInt(payDayOfMonth, 10);
  const payDayOfMonthValid =
    !needsMonthDay ||
    (payDayOfMonth.trim() !== '' &&
      Number.isInteger(payDayOfMonthNum) &&
      payDayOfMonthNum >= 1 &&
      payDayOfMonthNum <= 31);

  const buildDto = (): CreatePayrollRuleDto => ({
    name: name.trim(),
    frequencyPayroll,
    payDayOfWeek: needsWeekDay ? payDayOfWeekNum : null,
    payDayOfMonth: needsMonthDay ? payDayOfMonthNum : null,
    allowNegativePayroll,
    roundingPrecision: roundingPrecisionNum,
    currency: currency.trim(),
    autoApprovePayroll,
    requiresManagerApproval,
  });

  const initialDto: CreatePayrollRuleDto | null =
    mode === 'edit' && initialRule
      ? {
          name: initialRule.name,
          frequencyPayroll: initialRule.frequencyPayroll,
          payDayOfWeek: initialRule.payDayOfWeek != null ? Number(initialRule.payDayOfWeek) : null,
          payDayOfMonth:
            initialRule.payDayOfMonth != null ? Number(initialRule.payDayOfMonth) : null,
          allowNegativePayroll: initialRule.allowNegativePayroll,
          roundingPrecision: Number(initialRule.roundingPrecision),
          currency: initialRule.currency,
          autoApprovePayroll: initialRule.autoApprovePayroll,
          requiresManagerApproval: initialRule.requiresManagerApproval,
        }
      : null;

  const isUnchanged =
    mode === 'edit' && initialDto !== null && JSON.stringify(buildDto()) === JSON.stringify(initialDto);

  const isValid =
    nameValid &&
    currencyValid &&
    roundingPrecisionValid &&
    payDayOfWeekValid &&
    payDayOfMonthValid &&
    !isUnchanged;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit(buildDto());
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label={mode === 'create' ? 'Add Payroll Rule' : 'Edit Payroll Rule'}
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">
            {mode === 'create' ? 'Add Payroll Rule' : 'Edit Payroll Rule'}
          </span>
          <button type="button" onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="payroll-rule-name" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Rule Name
              </label>
              <input
                id="payroll-rule-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
              />
              <span className={`text-[11px] ${name.length > 50 ? 'text-[#ae001a] font-bold' : 'text-[#5f5e5e]'}`}>
                {name.length}/50
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="payroll-rule-frequency" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Frequency
              </label>
              <select
                id="payroll-rule-frequency"
                value={frequencyPayroll}
                onChange={(e) => setFrequencyPayroll(e.target.value as PayrollFrequency)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            {needsWeekDay && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="payroll-rule-day-of-week"
                  className="text-[11px] font-bold text-[#5f5e5e] uppercase"
                >
                  Pay Day of Week (1–7)
                </label>
                <input
                  id="payroll-rule-day-of-week"
                  type="number"
                  min={1}
                  max={7}
                  value={payDayOfWeek}
                  onChange={(e) => setPayDayOfWeek(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
                />
                {!payDayOfWeekValid && (
                  <span className="text-[11px] text-[#ae001a] font-bold">Must be an integer from 1 to 7</span>
                )}
              </div>
            )}

            {needsMonthDay && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="payroll-rule-day-of-month"
                  className="text-[11px] font-bold text-[#5f5e5e] uppercase"
                >
                  Pay Day of Month (1–31)
                </label>
                <input
                  id="payroll-rule-day-of-month"
                  type="number"
                  min={1}
                  max={31}
                  value={payDayOfMonth}
                  onChange={(e) => setPayDayOfMonth(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
                />
                {!payDayOfMonthValid && (
                  <span className="text-[11px] text-[#ae001a] font-bold">Must be an integer from 1 to 31</span>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="payroll-rule-currency" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Currency
              </label>
              <input
                id="payroll-rule-currency"
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="e.g., USD"
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
              />
              <span className={`text-[11px] ${currency.length > 10 ? 'text-[#ae001a] font-bold' : 'text-[#5f5e5e]'}`}>
                {currency.length}/10
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="payroll-rule-rounding-precision"
                className="text-[11px] font-bold text-[#5f5e5e] uppercase"
              >
                Rounding Precision
              </label>
              <input
                id="payroll-rule-rounding-precision"
                type="number"
                value={roundingPrecision}
                onChange={(e) => setRoundingPrecision(e.target.value)}
                placeholder="e.g., 2"
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={allowNegativePayroll}
                  onChange={(e) => setAllowNegativePayroll(e.target.checked)}
                />
                Allow Negative Payroll
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={autoApprovePayroll}
                  onChange={(e) => setAutoApprovePayroll(e.target.checked)}
                />
                Auto-Approve Payroll
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={requiresManagerApproval}
                  onChange={(e) => setRequiresManagerApproval(e.target.checked)}
                />
                Requires Manager Approval
              </label>
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
              Save Payroll Rule
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

interface PayrollRuleDetailModalProps {
  rule: MerchantPayrollRule;
  onClose: () => void;
}

const formatAuditDate = (value?: string) => {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

const formatAuditUser = (u?: { username: string | null; email: string } | null) => {
  if (!u) return '—';
  return u.username || u.email;
};

const PayrollRuleDetailModal: React.FC<PayrollRuleDetailModalProps> = ({ rule, onClose }) => {
  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label="Payroll Rule Details"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">Payroll Rule Details</span>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Name</p>
            <p className="font-bold text-[#1d1c17]">{rule.name}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Schedule</p>
              <p>{formatPayrollSchedule(rule)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Currency</p>
              <p>{rule.currency}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Rounding Precision</p>
              <p>{rule.roundingPrecision ?? '—'}</p>
            </div>
            <div className="flex flex-col gap-1">
              {rule.allowNegativePayroll && (
                <span className="bg-red-500/10 text-red-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded w-fit">
                  Negative Balances Allowed
                </span>
              )}
              {rule.autoApprovePayroll && (
                <span className="bg-green-500/10 text-green-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded w-fit">
                  Auto-Approve
                </span>
              )}
              {rule.requiresManagerApproval && (
                <span className="bg-amber-500/10 text-amber-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded w-fit">
                  Manager Required
                </span>
              )}
            </div>
          </div>
          <div className="border-t border-[#e8e2d8] pt-4 space-y-2">
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Audit Trail</p>
            <p className="text-xs">
              Created {formatAuditDate(rule.createdAt)} by {formatAuditUser(rule.createdBy)}
            </p>
            <p className="text-xs">
              Last updated {formatAuditDate(rule.updatedAt)} by {formatAuditUser(rule.updatedBy)}
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface ConfirmStatusDialogProps {
  rule: MerchantPayrollRule;
  nextStatus: 'active' | 'inactive';
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmStatusDialog: React.FC<ConfirmStatusDialogProps> = ({
  rule,
  nextStatus,
  submitting,
  onCancel,
  onConfirm,
}) => {
  const isDeactivating = nextStatus === 'inactive';
  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-center p-4">
      <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-sm p-6 text-left">
        <p className="font-bold text-[#1d1c17]">
          {isDeactivating ? 'Deactivate this payroll rule?' : 'Reactivate this payroll rule?'}
        </p>
        <p className="text-sm text-[#5f5e5e] mt-2">
          {isDeactivating
            ? `"${rule.name}" will stop being applied to future payroll runs.`
            : `"${rule.name}" will be applied to future payroll runs again.`}
        </p>
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
            Confirm
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface PayrollRulesViewProps {
  onNavigate?: (view: string) => void;
}

export const PayrollRulesView: React.FC<PayrollRulesViewProps> = ({ onNavigate }) => {
  const [rules, setRules] = useState<MerchantPayrollRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState<'' | PayrollFrequency>('');
  const [autoApproveOnly, setAutoApproveOnly] = useState(false);
  const [managerRequiredOnly, setManagerRequiredOnly] = useState(false);
  const [negativeAllowedOnly, setNegativeAllowedOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('');

  const [formModalOpen, setFormModalOpen] = useState<null | { mode: 'create' | 'edit'; rule?: MerchantPayrollRule }>(
    null,
  );
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [detailRule, setDetailRule] = useState<MerchantPayrollRule | null>(null);
  const [togglingRule, setTogglingRule] = useState<MerchantPayrollRule | null>(null);
  const [toggleSubmitting, setToggleSubmitting] = useState(false);

  const fetchPayrollRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/merchant-payroll-rule?limit=100`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        throw new Error('Error al cargar las reglas de nómina');
      }

      const json = await res.json();
      setRules(json.data ?? []);
    } catch (err) {
      console.error('Error fetching payroll rules:', err);
      setError('Failed to load payroll rules. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayrollRules();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const filteredRules = useMemo(() => {
    return rules.filter((rule) => {
      const term = searchQuery.trim().toLowerCase();
      if (term) {
        const matchesName = rule.name.toLowerCase().includes(term);
        const matchesCurrency = rule.currency.toLowerCase().includes(term);
        if (!matchesName && !matchesCurrency) return false;
      }
      if (frequencyFilter && rule.frequencyPayroll !== frequencyFilter) return false;
      if (autoApproveOnly && !rule.autoApprovePayroll) return false;
      if (managerRequiredOnly && !rule.requiresManagerApproval) return false;
      if (negativeAllowedOnly && !rule.allowNegativePayroll) return false;
      if (statusFilter && rule.status !== statusFilter) return false;
      return true;
    });
  }, [rules, searchQuery, frequencyFilter, autoApproveOnly, managerRequiredOnly, negativeAllowedOnly, statusFilter]);

  const hasActiveFilter = Boolean(
    searchQuery || frequencyFilter || autoApproveOnly || managerRequiredOnly || negativeAllowedOnly || statusFilter,
  );

  const clearFilters = () => {
    setSearchQuery('');
    setFrequencyFilter('');
    setAutoApproveOnly(false);
    setManagerRequiredOnly(false);
    setNegativeAllowedOnly(false);
    setStatusFilter('');
  };

  const isTrueEmpty = !loading && !error && rules.length === 0;
  const isFilteredEmpty = !loading && !error && rules.length > 0 && filteredRules.length === 0;

  const handleCreateSubmit = async (dto: CreatePayrollRuleDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-payroll-rule`, {
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
        throw new Error(json.message || 'Failed to create payroll rule');
      }

      setRules((prev) => [json.data, ...prev]);
      setFormModalOpen(null);
      setToast({ message: 'Payroll rule created successfully', type: 'success' });
    } catch (err: any) {
      setFormModalOpen(null);
      setToast({ message: err.message || 'Failed to create payroll rule', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (ruleId: number, dto: UpdatePayrollRuleDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-payroll-rule/${ruleId}`, {
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
        throw new Error(json.message || 'Failed to update payroll rule');
      }

      setRules((prev) => prev.map((r) => (r.id === json.data.id ? json.data : r)));
      setFormModalOpen(null);
      setToast({ message: 'Payroll rule updated successfully', type: 'success' });
    } catch (err: any) {
      setFormModalOpen(null);
      setToast({ message: err.message || 'Failed to update payroll rule', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleRowClick = async (ruleId: number) => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-payroll-rule/${ruleId}`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to load payroll rule details');
      }

      setDetailRule(json.data);
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to load payroll rule details', type: 'error' });
    }
  };

  const handleToggleConfirm = async () => {
    if (!togglingRule) return;
    const nextStatus: 'active' | 'inactive' = togglingRule.status === 'active' ? 'inactive' : 'active';
    setToggleSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-payroll-rule/${togglingRule.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to update payroll rule status');
      }

      setRules((prev) => prev.map((r) => (r.id === json.data.id ? json.data : r)));
      setTogglingRule(null);
      setToast({
        message:
          nextStatus === 'inactive'
            ? 'Payroll rule deactivated successfully'
            : 'Payroll rule reactivated successfully',
        type: 'success',
      });
    } catch (err: any) {
      setTogglingRule(null);
      setToast({ message: err.message || 'Failed to update payroll rule status', type: 'error' });
    } finally {
      setToggleSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchPayrollRules}
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
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by rule name or currency..."
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
              aria-label="Search payroll rules"
            />
          </div>
          <select
            value={frequencyFilter}
            onChange={(e) => setFrequencyFilter(e.target.value as '' | PayrollFrequency)}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
            aria-label="Filter by payroll frequency"
          >
            <option value="">All Frequencies</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Custom</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | 'active' | 'inactive')}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {!isTrueEmpty && (
            <button
              type="button"
              onClick={() => setFormModalOpen({ mode: 'create' })}
              className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Add Payroll Rule
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={autoApproveOnly}
              onChange={(e) => setAutoApproveOnly(e.target.checked)}
              aria-label="Auto-Approve"
              className="text-[#ae001a] focus:ring-[#ae001a] border-[#e8e2d8]"
            />
            Auto-Approve
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={managerRequiredOnly}
              onChange={(e) => setManagerRequiredOnly(e.target.checked)}
              aria-label="Manager Required"
              className="text-[#ae001a] focus:ring-[#ae001a] border-[#e8e2d8]"
            />
            Manager Required
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={negativeAllowedOnly}
              onChange={(e) => setNegativeAllowedOnly(e.target.checked)}
              aria-label="Negative Balances Allowed"
              className="text-[#ae001a] focus:ring-[#ae001a] border-[#e8e2d8]"
            />
            Negative Balances Allowed
          </label>
          {hasActiveFilter && !isFilteredEmpty && (
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

      {isTrueEmpty && (
        <div
          data-testid="payroll-rules-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">payments</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No payroll execution rules configured for this company. Click &apos;Add Payroll
            Rule&apos; to define disbursement parameters.
          </p>
          <button
            type="button"
            onClick={() => setFormModalOpen({ mode: 'create' })}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add Payroll Rule
          </button>
        </div>
      )}

      {(loading || rules.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              MERCHANT PAYROLL RULES
            </span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredRules.length} rules`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Rule Taxonomy
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Disbursement Cycle &amp; Scheduling
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Compliance &amp; Precision Matrix
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Workflow Approval Stream
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
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-40" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-28 mx-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-28 mx-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                        <p className="text-sm text-[#5f5e5e]">No payroll rules match your active filters</p>
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
                  filteredRules.map((rule) => (
                    <tr
                      key={rule.id}
                      data-testid={`payroll-rule-row-${rule.id}`}
                      onClick={() => handleRowClick(rule.id)}
                      className={`group hover:bg-[#f8f3eb] transition-colors cursor-pointer ${
                        rule.status !== 'active' ? 'opacity-75' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-[#1d1c17]">{rule.name}</p>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#ece8e0] text-[#5f5e5e]">
                            {rule.currency}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-[#1d1c17]">
                          {formatPayrollSchedule(rule)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm text-[#1d1c17]">
                            Decimals: {rule.roundingPrecision ?? '—'}
                          </span>
                          {rule.allowNegativePayroll && (
                            <span className="bg-red-500/10 text-red-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                              Negative Balances Allowed
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-1 flex-wrap">
                          {rule.autoApprovePayroll && (
                            <span className="bg-green-500/10 text-green-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                              Auto-Approve
                            </span>
                          )}
                          {rule.requiresManagerApproval && (
                            <span className="bg-amber-500/10 text-amber-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                              Manager Required
                            </span>
                          )}
                          {!rule.autoApprovePayroll && !rule.requiresManagerApproval && (
                            <span className="text-[#5f5e5e]">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {rule.status === 'active' ? (
                          <span className="bg-green-500/10 text-green-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                            Active
                          </span>
                        ) : (
                          <span className="bg-[#5f5e5e]/20 text-[#5f5e5e] text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFormModalOpen({ mode: 'edit', rule });
                            }}
                            aria-label="Edit payroll rule"
                            className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                          >
                            <span className="material-symbols-outlined text-[20px]">edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTogglingRule(rule);
                            }}
                            aria-label={rule.status === 'active' ? 'Deactivate payroll rule' : 'Reactivate payroll rule'}
                            className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                          >
                            <span className="material-symbols-outlined text-[20px]">
                              {rule.status === 'active' ? 'delete' : 'check'}
                            </span>
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

      <RuleConfigQuickLinks activeRule="payroll" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={() => setFormModalOpen({ mode: 'create' })}
        aria-label="Quick create payroll rule"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {detailRule && <PayrollRuleDetailModal rule={detailRule} onClose={() => setDetailRule(null)} />}

      {togglingRule && (
        <ConfirmStatusDialog
          rule={togglingRule}
          nextStatus={togglingRule.status === 'active' ? 'inactive' : 'active'}
          submitting={toggleSubmitting}
          onCancel={() => setTogglingRule(null)}
          onConfirm={handleToggleConfirm}
        />
      )}

      {formModalOpen && (
        <PayrollRuleFormModal
          mode={formModalOpen.mode}
          initialRule={formModalOpen.rule}
          submitting={formSubmitting}
          onCancel={() => setFormModalOpen(null)}
          onSubmit={(dto) =>
            formModalOpen.mode === 'create'
              ? handleCreateSubmit(dto as CreatePayrollRuleDto)
              : handleEditSubmit(formModalOpen.rule!.id, dto as UpdatePayrollRuleDto)
          }
        />
      )}

      {toast && (
        <div
          className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-5 py-3.5 shadow-lg text-white text-sm font-medium ${
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
        </div>
      )}
    </div>
  );
};

export default PayrollRulesView;
