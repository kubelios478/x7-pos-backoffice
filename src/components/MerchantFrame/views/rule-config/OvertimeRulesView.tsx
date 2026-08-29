import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  MerchantOvertimeRule,
  OvertimeCalculationType,
  OvertimeRateType,
  CreateOvertimeRuleDto,
  UpdateOvertimeRuleDto,
} from '../../../../types/configuration';
import { RuleConfigQuickLinks } from './RuleConfigQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

function fuzzyMatch(query: string, target: string): boolean {
  let qi = 0;
  for (let i = 0; i < target.length && qi < query.length; i++) {
    if (target[i].toLowerCase() === query[qi].toLowerCase()) qi++;
  }
  return qi === query.length;
}

export function formatThreshold(rule: MerchantOvertimeRule): string {
  const threshold = rule.thresholdHours == null ? '--' : `${rule.thresholdHours}h`;
  const max = rule.maxHours == null ? '--' : `${rule.maxHours}`;
  return `${threshold} Threshold / ${max} Max`;
}

export function formatRateMechanics(rule: MerchantOvertimeRule): string {
  switch (rule.rateMethod) {
    case 'percentage':
      return `${rule.rateValue}%`;
    case 'multiplier':
      return `x${(rule.rateValue / 100).toFixed(2)}`;
    case 'fixed_amount':
      return `+$${rule.rateValue.toFixed(2)}`;
  }
}

interface OvertimeRuleFormModalProps {
  mode: 'create' | 'edit';
  initialRule?: MerchantOvertimeRule;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (dto: CreateOvertimeRuleDto | UpdateOvertimeRuleDto) => void;
}

const OvertimeRuleFormModal: React.FC<OvertimeRuleFormModalProps> = ({
  mode,
  initialRule,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const [name, setName] = useState(initialRule?.name ?? '');
  const [description, setDescription] = useState(initialRule?.description ?? '');
  const [calculationMethod, setCalculationMethod] = useState<OvertimeCalculationType>(
    initialRule?.calculationMethod ?? 'daily',
  );
  const [thresholdHours, setThresholdHours] = useState(
    initialRule?.thresholdHours != null ? String(initialRule.thresholdHours) : '',
  );
  const [maxHours, setMaxHours] = useState(
    initialRule?.maxHours != null ? String(initialRule.maxHours) : '',
  );
  const [rateMethod, setRateMethod] = useState<OvertimeRateType>(
    initialRule?.rateMethod ?? 'percentage',
  );
  const [rateValue, setRateValue] = useState(
    initialRule
      ? String(
          initialRule.rateMethod === 'multiplier'
            ? initialRule.rateValue / 100
            : initialRule.rateValue,
        )
      : '',
  );
  const [priority, setPriority] = useState(initialRule ? String(initialRule.priority) : '');
  const [appliesOnHolidays, setAppliesOnHolidays] = useState(initialRule?.appliesOnHolidays ?? false);
  const [appliesOnWeekends, setAppliesOnWeekends] = useState(initialRule?.appliesOnWeekends ?? false);

  const requiresThreshold = calculationMethod === 'daily' || calculationMethod === 'weekly';

  const nameValid = name.trim().length > 0 && name.length <= 50;
  const descriptionValid = description.trim().length > 0 && description.length <= 200;

  const thresholdNum = parseInt(thresholdHours, 10);
  const maxNum = parseInt(maxHours, 10);
  const thresholdValid = !requiresThreshold || (thresholdHours.trim() !== '' && !isNaN(thresholdNum));
  const maxValid = !requiresThreshold || (maxHours.trim() !== '' && !isNaN(maxNum));

  const rateValueNum = parseFloat(rateValue);
  const rateValueValid = rateValue.trim() !== '' && !isNaN(rateValueNum);

  const priorityNum = parseInt(priority, 10);
  const priorityValid = priority.trim() !== '' && Number.isInteger(priorityNum);

  const rateValueLabel =
    rateMethod === 'percentage'
      ? 'Rate Value (%)'
      : rateMethod === 'fixed_amount'
        ? 'Rate Value ($)'
        : 'Rate Value (×)';

  const buildDto = (): CreateOvertimeRuleDto => ({
    name: name.trim(),
    description: description.trim(),
    calculationMethod,
    thresholdHours: requiresThreshold ? thresholdNum : null,
    maxHours: requiresThreshold ? maxNum : null,
    rateMethod,
    rateValue:
      rateMethod === 'multiplier' ? Math.round(rateValueNum * 100) : Math.round(rateValueNum),
    appliesOnHolidays,
    appliesOnWeekends,
    priority: priorityNum,
  });

  const initialDto: CreateOvertimeRuleDto | null =
    mode === 'edit' && initialRule
      ? {
          name: initialRule.name,
          description: initialRule.description,
          calculationMethod: initialRule.calculationMethod,
          thresholdHours: initialRule.thresholdHours,
          maxHours: initialRule.maxHours,
          rateMethod: initialRule.rateMethod,
          rateValue: initialRule.rateValue,
          appliesOnHolidays: initialRule.appliesOnHolidays,
          appliesOnWeekends: initialRule.appliesOnWeekends,
          priority: initialRule.priority,
        }
      : null;

  const isUnchanged =
    mode === 'edit' && initialDto !== null && JSON.stringify(buildDto()) === JSON.stringify(initialDto);

  const isValid =
    nameValid &&
    descriptionValid &&
    thresholdValid &&
    maxValid &&
    rateValueValid &&
    priorityValid &&
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
        aria-label={mode === 'create' ? 'Add Overtime Rule' : 'Edit Overtime Rule'}
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">
            {mode === 'create' ? 'Add Overtime Rule' : 'Edit Overtime Rule'}
          </span>
          <button type="button" onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="overtime-rule-name" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Rule Name
              </label>
              <input
                id="overtime-rule-name"
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
              <label htmlFor="overtime-rule-description" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Description
              </label>
              <textarea
                id="overtime-rule-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full resize-none"
              />
              <span className={`text-[11px] ${description.length > 200 ? 'text-[#ae001a] font-bold' : 'text-[#5f5e5e]'}`}>
                {description.length}/200
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="overtime-rule-calc-method" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Calculation Method
              </label>
              <select
                id="overtime-rule-calc-method"
                value={calculationMethod}
                onChange={(e) => setCalculationMethod(e.target.value as OvertimeCalculationType)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="holiday">Holiday</option>
                <option value="special_day">Special Day</option>
              </select>
            </div>

            {requiresThreshold && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="overtime-rule-threshold-hours"
                    className="text-[11px] font-bold text-[#5f5e5e] uppercase"
                  >
                    Threshold Hours
                  </label>
                  <input
                    id="overtime-rule-threshold-hours"
                    type="number"
                    value={thresholdHours}
                    onChange={(e) => setThresholdHours(e.target.value)}
                    className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="overtime-rule-max-hours" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                    Max Hours
                  </label>
                  <input
                    id="overtime-rule-max-hours"
                    type="number"
                    value={maxHours}
                    onChange={(e) => setMaxHours(e.target.value)}
                    className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="overtime-rule-rate-method" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Rate Method
              </label>
              <select
                id="overtime-rule-rate-method"
                value={rateMethod}
                onChange={(e) => setRateMethod(e.target.value as OvertimeRateType)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
              >
                <option value="percentage">Percentage</option>
                <option value="multiplier">Multiplier</option>
                <option value="fixed_amount">Fixed Amount</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="overtime-rule-rate-value" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                {rateValueLabel}
              </label>
              <input
                id="overtime-rule-rate-value"
                type="number"
                step={rateMethod === 'multiplier' ? '0.01' : '1'}
                value={rateValue}
                onChange={(e) => setRateValue(e.target.value)}
                placeholder={rateMethod === 'multiplier' ? 'e.g., 1.50' : 'e.g., 150'}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="overtime-rule-priority" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Priority
              </label>
              <input
                id="overtime-rule-priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
              />
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={appliesOnHolidays}
                  onChange={(e) => setAppliesOnHolidays(e.target.checked)}
                />
                Applies on Holidays
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={appliesOnWeekends}
                  onChange={(e) => setAppliesOnWeekends(e.target.checked)}
                />
                Applies on Weekends
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
              Save Overtime Rule
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

interface OvertimeRuleDetailModalProps {
  rule: MerchantOvertimeRule;
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

const OvertimeRuleDetailModal: React.FC<OvertimeRuleDetailModalProps> = ({ rule, onClose }) => {
  const requiresThreshold = rule.calculationMethod === 'daily' || rule.calculationMethod === 'weekly';

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label="Overtime Rule Details"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">Overtime Rule Details</span>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Name</p>
            <p className="font-bold text-[#1d1c17]">{rule.name}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Description</p>
            <p>{rule.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Priority</p>
              <p>{rule.priority}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Calculation Method</p>
              <p className="capitalize">{rule.calculationMethod.replace('_', ' ')}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Threshold / Max Hours</p>
            <p>{requiresThreshold ? formatThreshold(rule) : 'N/A'}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Rate Mechanics</p>
            <p>{formatRateMechanics(rule)}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {rule.appliesOnHolidays && (
              <span className="bg-green-500/10 text-green-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                Applies on Holidays
              </span>
            )}
            {rule.appliesOnWeekends && (
              <span className="bg-blue-500/10 text-blue-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                Applies on Weekends
              </span>
            )}
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                rule.status === 'active' ? 'bg-green-500/10 text-green-600' : 'bg-[#5f5e5e]/20 text-[#5f5e5e]'
              }`}
            >
              {rule.status === 'active' ? 'Active' : 'Inactive'}
            </span>
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
  rule: MerchantOvertimeRule;
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
          {isDeactivating ? 'Deactivate this overtime rule?' : 'Reactivate this overtime rule?'}
        </p>
        <p className="text-sm text-[#5f5e5e] mt-2">
          {isDeactivating
            ? `"${rule.name}" will stop being applied to payroll calculations.`
            : `"${rule.name}" will start being applied to payroll calculations again.`}
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

interface OvertimeRulesViewProps {
  onNavigate?: (view: string) => void;
}

export const OvertimeRulesView: React.FC<OvertimeRulesViewProps> = ({ onNavigate }) => {
  const [rules, setRules] = useState<MerchantOvertimeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [calcMethodFilter, setCalcMethodFilter] = useState<'' | OvertimeCalculationType>('');
  const [rateMethodFilter, setRateMethodFilter] = useState<'' | OvertimeRateType>('');
  const [holidaysOnly, setHolidaysOnly] = useState(false);
  const [weekendsOnly, setWeekendsOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('');

  const [formModalOpen, setFormModalOpen] = useState<null | { mode: 'create' | 'edit'; rule?: MerchantOvertimeRule }>(
    null,
  );
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [detailRule, setDetailRule] = useState<MerchantOvertimeRule | null>(null);
  const [togglingRule, setTogglingRule] = useState<MerchantOvertimeRule | null>(null);
  const [toggleSubmitting, setToggleSubmitting] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchOvertimeRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/merchant-overtime-rule?limit=100`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        throw new Error('Error al cargar las reglas de horas extra');
      }

      const json = await res.json();
      setRules(json.data ?? []);
    } catch (err) {
      console.error('Error fetching overtime rules:', err);
      setError('Failed to load overtime rules. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOvertimeRules();
  }, []);

  const handleCreateSubmit = async (dto: CreateOvertimeRuleDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-overtime-rule`, {
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
        throw new Error(json.message || 'Failed to create overtime rule');
      }

      setRules((prev) => [json.data, ...prev]);
      setFormModalOpen(null);
      setToast({ message: 'Overtime rule created successfully', type: 'success' });
    } catch (err: any) {
      setFormModalOpen(null);
      setToast({ message: err.message || 'Failed to create overtime rule', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (ruleId: number, dto: UpdateOvertimeRuleDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-overtime-rule/${ruleId}`, {
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
        throw new Error(json.message || 'Failed to update overtime rule');
      }

      setRules((prev) => prev.map((r) => (r.id === json.data.id ? json.data : r)));
      setFormModalOpen(null);
      setToast({ message: 'Overtime rule updated successfully', type: 'success' });
    } catch (err: any) {
      setFormModalOpen(null);
      setToast({ message: err.message || 'Failed to update overtime rule', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleRowClick = async (ruleId: number) => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-overtime-rule/${ruleId}`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to load overtime rule details');
      }

      setDetailRule(json.data);
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to load overtime rule details', type: 'error' });
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

      const res = await fetch(`${API_BASE}/merchant-overtime-rule/${togglingRule.id}`, {
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
        throw new Error(json.message || 'Failed to update overtime rule status');
      }

      setRules((prev) => prev.map((r) => (r.id === json.data.id ? json.data : r)));
      setTogglingRule(null);
      setToast({
        message:
          nextStatus === 'inactive'
            ? 'Overtime rule deactivated successfully'
            : 'Overtime rule reactivated successfully',
        type: 'success',
      });
    } catch (err: any) {
      setTogglingRule(null);
      setToast({ message: err.message || 'Failed to update overtime rule status', type: 'error' });
    } finally {
      setToggleSubmitting(false);
    }
  };

  const filteredRules = useMemo(() => {
    return rules
      .filter((rule) => {
        const term = searchQuery.trim();
        if (term && !fuzzyMatch(term, rule.name) && !fuzzyMatch(term, rule.description)) {
          return false;
        }
        if (calcMethodFilter && rule.calculationMethod !== calcMethodFilter) return false;
        if (rateMethodFilter && rule.rateMethod !== rateMethodFilter) return false;
        if (holidaysOnly && !rule.appliesOnHolidays) return false;
        if (weekendsOnly && !rule.appliesOnWeekends) return false;
        if (statusFilter && rule.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => a.priority - b.priority);
  }, [rules, searchQuery, calcMethodFilter, rateMethodFilter, holidaysOnly, weekendsOnly, statusFilter]);

  const hasActiveFilter = Boolean(
    searchQuery || calcMethodFilter || rateMethodFilter || holidaysOnly || weekendsOnly || statusFilter,
  );

  const clearFilters = () => {
    setSearchQuery('');
    setCalcMethodFilter('');
    setRateMethodFilter('');
    setHolidaysOnly(false);
    setWeekendsOnly(false);
    setStatusFilter('');
  };

  const isTrueEmpty = !loading && !error && rules.length === 0;
  const isFilteredEmpty = !loading && !error && rules.length > 0 && filteredRules.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchOvertimeRules}
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
              placeholder="Search by rule name or description..."
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
              aria-label="Search overtime rules"
            />
          </div>
          <select
            value={calcMethodFilter}
            onChange={(e) => setCalcMethodFilter(e.target.value as '' | OvertimeCalculationType)}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
            aria-label="Filter by calculation method"
          >
            <option value="">All Methods</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="holiday">Holiday</option>
            <option value="special_day">Special Day</option>
          </select>
          <select
            value={rateMethodFilter}
            onChange={(e) => setRateMethodFilter(e.target.value as '' | OvertimeRateType)}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
            aria-label="Filter by rate method"
          >
            <option value="">All Rates</option>
            <option value="percentage">Percentage</option>
            <option value="multiplier">Multiplier</option>
            <option value="fixed_amount">Fixed Amount</option>
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
              Add Overtime Rule
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={holidaysOnly}
              onChange={(e) => setHolidaysOnly(e.target.checked)}
              aria-label="Applies on Holidays"
              className="text-[#ae001a] focus:ring-[#ae001a] border-[#e8e2d8]"
            />
            Applies on Holidays
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={weekendsOnly}
              onChange={(e) => setWeekendsOnly(e.target.checked)}
              aria-label="Applies on Weekends"
              className="text-[#ae001a] focus:ring-[#ae001a] border-[#e8e2d8]"
            />
            Applies on Weekends
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
          data-testid="overtime-rules-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">alarm_add</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No overtime compensation rules configured for this company. Click &apos;Add Overtime
            Rule&apos; to define labor compliance parameters.
          </p>
          <button
            type="button"
            onClick={() => setFormModalOpen({ mode: 'create' })}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add Overtime Rule
          </button>
        </div>
      )}

      {(loading || rules.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              MERCHANT OVERTIME RULES
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
                    Rule Taxonomy &amp; Priority
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Calculation Threshold Matrix
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Rate Mechanics
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Calendar Restrictions
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
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 mx-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 mx-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">
                          search_off
                        </span>
                        <p className="text-sm text-[#5f5e5e]">
                          No overtime rules match your active filters
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
                  filteredRules.map((rule) => (
                    <tr
                      key={rule.id}
                      data-testid={`overtime-rule-row-${rule.id}`}
                      onClick={() => handleRowClick(rule.id)}
                      className={`group hover:bg-[#f8f3eb] transition-colors cursor-pointer ${
                        rule.status !== 'active' ? 'opacity-75' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <p className="font-bold text-[#1d1c17]">
                          <span className="font-bold">[Priority: {rule.priority}]</span> <span>{rule.name}</span>
                        </p>
                        <p className="text-[11px] text-[#5f5e5e] mt-1">{rule.description}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-[#1d1c17]">
                          {formatThreshold(rule)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-700">
                          {formatRateMechanics(rule)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-1 flex-wrap">
                          {rule.appliesOnHolidays && (
                            <span className="bg-green-500/10 text-green-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                              Holidays
                            </span>
                          )}
                          {rule.appliesOnWeekends && (
                            <span className="bg-blue-500/10 text-blue-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                              Weekends
                            </span>
                          )}
                          {!rule.appliesOnHolidays && !rule.appliesOnWeekends && (
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
                            aria-label="Edit overtime rule"
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
                            aria-label={rule.status === 'active' ? 'Deactivate overtime rule' : 'Reactivate overtime rule'}
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

      <RuleConfigQuickLinks activeRule="overtime" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={() => setFormModalOpen({ mode: 'create' })}
        aria-label="Quick create overtime rule"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {formModalOpen && (
        <OvertimeRuleFormModal
          mode={formModalOpen.mode}
          initialRule={formModalOpen.rule}
          submitting={formSubmitting}
          onCancel={() => setFormModalOpen(null)}
          onSubmit={(dto) =>
            formModalOpen.mode === 'create'
              ? handleCreateSubmit(dto as CreateOvertimeRuleDto)
              : handleEditSubmit(formModalOpen.rule!.id, dto as UpdateOvertimeRuleDto)
          }
        />
      )}

      {detailRule && <OvertimeRuleDetailModal rule={detailRule} onClose={() => setDetailRule(null)} />}

      {togglingRule && (
        <ConfirmStatusDialog
          rule={togglingRule}
          nextStatus={togglingRule.status === 'active' ? 'inactive' : 'active'}
          submitting={toggleSubmitting}
          onCancel={() => setTogglingRule(null)}
          onConfirm={handleToggleConfirm}
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

export default OvertimeRulesView;
