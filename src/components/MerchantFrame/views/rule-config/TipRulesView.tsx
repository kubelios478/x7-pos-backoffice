import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  MerchantTipRule,
  TipCalculationMethod,
  TipDistributionMethod,
  CreateTipRuleDto,
  UpdateTipRuleDto,
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

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  return typeof value === 'number' ? value : parseFloat(value);
}

function formatSuggestedPercentage(value: number | string): string {
  return `${Math.round(toNumber(value) * 100)}%`;
}

function formatFixedAmount(value: number | string): string {
  return `$${Math.round(toNumber(value))}`;
}

function toWholeNumber(value: number | string | null | undefined): number {
  return Math.round(toNumber(value) * 100);
}

const CALC_METHOD_LABELS: Record<TipCalculationMethod, string> = {
  percentage: 'Percentage',
  fixed_amount: 'Fixed Amount',
  custom: 'Custom',
};

const CALC_METHOD_PILL_STYLES: Record<TipCalculationMethod, string> = {
  percentage: 'bg-blue-500/10 text-blue-700',
  fixed_amount: 'bg-amber-500/10 text-amber-700',
  custom: 'bg-purple-500/10 text-purple-700',
};

const DISTRIBUTION_LABELS: Record<TipDistributionMethod, string> = {
  individual: 'Individual',
  pool: 'Pool',
  role_based: 'Role-Based',
};

const DISTRIBUTION_PILL_STYLES: Record<TipDistributionMethod, string> = {
  individual: 'bg-teal-500/10 text-teal-700',
  pool: 'bg-indigo-500/10 text-indigo-700',
  role_based: 'bg-pink-500/10 text-pink-700',
};

interface TipRuleFormModalProps {
  mode: 'create' | 'edit';
  initialRule?: MerchantTipRule;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (dto: CreateTipRuleDto | UpdateTipRuleDto) => void;
}

const TipRuleFormModal: React.FC<TipRuleFormModalProps> = ({
  mode,
  initialRule,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const [name, setName] = useState(initialRule?.name ?? '');
  const [tipCalculationMethod, setTipCalculationMethod] = useState<TipCalculationMethod>(
    initialRule?.tipCalculationMethod ?? 'percentage',
  );
  const [tipDistributionMethod, setTipDistributionMethod] = useState<TipDistributionMethod>(
    initialRule?.tipDistributionMethod ?? 'individual',
  );

  const [suggestedPercentages, setSuggestedPercentages] = useState<number[]>(
    (initialRule?.suggestedPercentages ?? []).map((v) => toWholeNumber(v)),
  );
  const [percentageInput, setPercentageInput] = useState('');

  const [fixedAmountOptions, setFixedAmountOptions] = useState<number[]>(
    (initialRule?.fixedAmountOptions ?? []).map((v) => Math.round(toNumber(v))),
  );
  const [fixedAmountInput, setFixedAmountInput] = useState('');

  const [maximumTipPercentage, setMaximumTipPercentage] = useState(
    initialRule ? String(initialRule.maximumTipPercentage) : '',
  );
  const [allowCustomTip, setAllowCustomTip] = useState(initialRule?.allowCustomTip ?? false);
  const [autoDistribute, setAutoDistribute] = useState(initialRule?.autoDistribute ?? false);

  const [staffPercentage, setStaffPercentage] = useState(
    initialRule?.staffPercentage != null ? String(toWholeNumber(initialRule.staffPercentage)) : '',
  );
  const [kitchenPercentage, setKitchenPercentage] = useState(
    initialRule?.kitchenPercentage != null ? String(toWholeNumber(initialRule.kitchenPercentage)) : '',
  );
  const [managerPercentage, setManagerPercentage] = useState(
    initialRule?.managerPercentage != null ? String(toWholeNumber(initialRule.managerPercentage)) : '',
  );

  const addPercentage = () => {
    const n = parseInt(percentageInput, 10);
    if (!isNaN(n) && n > 0 && n <= 100) {
      setSuggestedPercentages((prev) => [...prev, n]);
      setPercentageInput('');
    }
  };
  const removePercentage = (index: number) => {
    setSuggestedPercentages((prev) => prev.filter((_, i) => i !== index));
  };

  const addFixedAmount = () => {
    const n = parseInt(fixedAmountInput, 10);
    if (!isNaN(n) && n > 0) {
      setFixedAmountOptions((prev) => [...prev, n]);
      setFixedAmountInput('');
    }
  };
  const removeFixedAmount = (index: number) => {
    setFixedAmountOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const isRoleBased = tipDistributionMethod === 'role_based';
  const staffNum = parseFloat(staffPercentage);
  const kitchenNum = parseFloat(kitchenPercentage);
  const managerNum = parseFloat(managerPercentage);
  const roleBasedValid =
    !isRoleBased ||
    (staffPercentage.trim() !== '' &&
      kitchenPercentage.trim() !== '' &&
      managerPercentage.trim() !== '' &&
      !isNaN(staffNum) &&
      !isNaN(kitchenNum) &&
      !isNaN(managerNum) &&
      Math.abs(staffNum + kitchenNum + managerNum - 100) <= 1);

  const suggestedPercentagesSum = suggestedPercentages.reduce((a, b) => a + b, 0);

  const arraysValid =
    tipCalculationMethod === 'percentage'
      ? suggestedPercentagesSum === 100
      : tipCalculationMethod === 'fixed_amount'
        ? fixedAmountOptions.length > 0
        : true;

  const maxTipNum = parseFloat(maximumTipPercentage);
  const maxTipValid =
    maximumTipPercentage.trim() !== '' && !isNaN(maxTipNum) && maxTipNum > 0 && maxTipNum <= 100;

  const nameValid = name.trim().length > 0 && name.length <= 50;

  const buildDto = (): CreateTipRuleDto => ({
    name: name.trim(),
    tipCalculationMethod,
    tipDistributionMethod,
    suggestedPercentages:
      tipCalculationMethod === 'percentage' ? suggestedPercentages.map((n) => n / 100) : [],
    fixedAmountOptions: tipCalculationMethod === 'fixed_amount' ? fixedAmountOptions : [],
    allowCustomTip,
    maximumTipPercentage: maxTipNum,
    autoDistribute,
    ...(isRoleBased
      ? {
          staffPercentage: staffNum / 100,
          kitchenPercentage: kitchenNum / 100,
          managerPercentage: managerNum / 100,
        }
      : {}),
  });

  const initialDto: CreateTipRuleDto | null =
    mode === 'edit' && initialRule
      ? {
          name: initialRule.name,
          tipCalculationMethod: initialRule.tipCalculationMethod,
          tipDistributionMethod: initialRule.tipDistributionMethod,
          suggestedPercentages: (initialRule.suggestedPercentages ?? []).map((v) => toNumber(v)),
          fixedAmountOptions: (initialRule.fixedAmountOptions ?? []).map((v) => toNumber(v)),
          allowCustomTip: initialRule.allowCustomTip,
          maximumTipPercentage: initialRule.maximumTipPercentage,
          autoDistribute: initialRule.autoDistribute,
          ...(initialRule.tipDistributionMethod === 'role_based'
            ? {
                staffPercentage: toNumber(initialRule.staffPercentage),
                kitchenPercentage: toNumber(initialRule.kitchenPercentage),
                managerPercentage: toNumber(initialRule.managerPercentage),
              }
            : {}),
        }
      : null;

  const isUnchanged =
    mode === 'edit' && initialDto !== null && JSON.stringify(buildDto()) === JSON.stringify(initialDto);

  const isValid = nameValid && arraysValid && maxTipValid && roleBasedValid && !isUnchanged;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit(buildDto());
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label={mode === 'create' ? 'Add Tip Rule' : 'Edit Tip Rule'}
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">
            {mode === 'create' ? 'Add Tip Rule' : 'Edit Tip Rule'}
          </span>
          <button type="button" onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tip-rule-name" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Rule Name
              </label>
              <input
                id="tip-rule-name"
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
              <label htmlFor="tip-rule-calc-method" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Calculation Method
              </label>
              <select
                id="tip-rule-calc-method"
                value={tipCalculationMethod}
                onChange={(e) => setTipCalculationMethod(e.target.value as TipCalculationMethod)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
              >
                <option value="percentage">Percentage</option>
                <option value="fixed_amount">Fixed Amount</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="tip-rule-distribution-method" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Distribution Method
              </label>
              <select
                id="tip-rule-distribution-method"
                value={tipDistributionMethod}
                onChange={(e) => setTipDistributionMethod(e.target.value as TipDistributionMethod)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
              >
                <option value="individual">Individual</option>
                <option value="pool">Pool</option>
                <option value="role_based">Role-Based</option>
              </select>
            </div>

            {tipCalculationMethod === 'percentage' && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="tip-rule-suggested-percentage-input"
                  className="text-[11px] font-bold text-[#5f5e5e] uppercase"
                >
                  Suggested Percentages
                </label>
                <div className="flex gap-2">
                  <input
                    id="tip-rule-suggested-percentage-input"
                    type="number"
                    value={percentageInput}
                    onChange={(e) => setPercentageInput(e.target.value)}
                    placeholder="e.g., 15"
                    className="flex-1 bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
                  />
                  <button
                    type="button"
                    onClick={addPercentage}
                    aria-label="Add suggested percentage"
                    className="px-3 py-2 bg-[#222222] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedPercentages.map((pct, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 text-[11px] font-semibold bg-[#f2ede5] text-[#1d1c17] px-2 py-1 rounded"
                    >
                      {pct}%
                      <button
                        type="button"
                        onClick={() => removePercentage(i)}
                        aria-label={`Remove ${pct}%`}
                        className="text-[#5f5e5e] hover:text-[#ae001a]"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                {suggestedPercentagesSum !== 100 && (
                  <span className="text-[11px] text-[#ae001a] font-bold">
                    Suggested percentages must sum to 100
                  </span>
                )}
              </div>
            )}

            {tipCalculationMethod === 'fixed_amount' && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="tip-rule-fixed-amount-input"
                  className="text-[11px] font-bold text-[#5f5e5e] uppercase"
                >
                  Fixed Amount Options
                </label>
                <div className="flex gap-2">
                  <input
                    id="tip-rule-fixed-amount-input"
                    type="number"
                    value={fixedAmountInput}
                    onChange={(e) => setFixedAmountInput(e.target.value)}
                    placeholder="e.g., 5"
                    className="flex-1 bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
                  />
                  <button
                    type="button"
                    onClick={addFixedAmount}
                    aria-label="Add fixed amount option"
                    className="px-3 py-2 bg-[#222222] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {fixedAmountOptions.map((amt, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 text-[11px] font-semibold bg-[#f2ede5] text-[#1d1c17] px-2 py-1 rounded"
                    >
                      ${amt}
                      <button
                        type="button"
                        onClick={() => removeFixedAmount(i)}
                        aria-label={`Remove $${amt}`}
                        className="text-[#5f5e5e] hover:text-[#ae001a]"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="tip-rule-max-tip" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Maximum Tip Percentage
              </label>
              <input
                id="tip-rule-max-tip"
                type="number"
                value={maximumTipPercentage}
                onChange={(e) => setMaximumTipPercentage(e.target.value)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                placeholder="e.g., 30"
              />
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={allowCustomTip}
                  onChange={(e) => setAllowCustomTip(e.target.checked)}
                />
                Allow Custom Tip
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={autoDistribute}
                  onChange={(e) => setAutoDistribute(e.target.checked)}
                />
                Auto-Distribute
              </label>
            </div>

            {isRoleBased && (
              <div className="flex flex-col gap-2 border-t border-[#e8e2d8] pt-4">
                <span className="text-[11px] font-bold text-[#5f5e5e] uppercase">Distribution Percentages</span>
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="tip-rule-staff-pct" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                      Staff %
                    </label>
                    <input
                      id="tip-rule-staff-pct"
                      type="number"
                      value={staffPercentage}
                      onChange={(e) => setStaffPercentage(e.target.value)}
                      className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="tip-rule-kitchen-pct" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                      Kitchen %
                    </label>
                    <input
                      id="tip-rule-kitchen-pct"
                      type="number"
                      value={kitchenPercentage}
                      onChange={(e) => setKitchenPercentage(e.target.value)}
                      className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="tip-rule-manager-pct" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                      Manager %
                    </label>
                    <input
                      id="tip-rule-manager-pct"
                      type="number"
                      value={managerPercentage}
                      onChange={(e) => setManagerPercentage(e.target.value)}
                      className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
                    />
                  </div>
                </div>
                {!roleBasedValid && (
                  <span className="text-[11px] text-[#ae001a] font-bold">
                    Staff, Kitchen, and Manager % must be filled and sum to 100
                  </span>
                )}
              </div>
            )}
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
              Save Tip Rule
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

interface TipRuleDetailModalProps {
  rule: MerchantTipRule;
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

const TipRuleDetailModal: React.FC<TipRuleDetailModalProps> = ({ rule, onClose }) => {
  const values = rule.tipCalculationMethod === 'fixed_amount' ? rule.fixedAmountOptions : rule.suggestedPercentages;
  const formatValue = rule.tipCalculationMethod === 'fixed_amount' ? formatFixedAmount : formatSuggestedPercentage;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label="Tip Rule Details"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">Tip Rule Details</span>
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
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Calculation Method</p>
              <p>{CALC_METHOD_LABELS[rule.tipCalculationMethod]}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Distribution Method</p>
              <p>{DISTRIBUTION_LABELS[rule.tipDistributionMethod]}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              {rule.tipCalculationMethod === 'fixed_amount' ? 'Fixed Amount Options' : 'Suggested Percentages'}
            </p>
            <div className="flex flex-wrap gap-1 mt-1">
              {values && values.length > 0 ? (
                values.map((value, i) => (
                  <span key={i} className="text-[11px] font-semibold bg-[#f2ede5] text-[#5f5e5e] px-1.5 py-0.5 rounded">
                    {formatValue(value)}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-[#5f5e5e] italic">No suggested values</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Maximum Tip %</p>
              <p>{rule.maximumTipPercentage}%</p>
            </div>
            <div className="flex flex-col gap-1">
              {rule.allowCustomTip && (
                <span className="bg-amber-500/10 text-amber-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded w-fit">
                  Custom Tip Allowed
                </span>
              )}
              {rule.autoDistribute && (
                <span className="bg-blue-500/10 text-blue-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded w-fit">
                  Auto-Distribute
                </span>
              )}
            </div>
          </div>
          {rule.tipDistributionMethod === 'role_based' && (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Staff %</p>
                <p>{formatSuggestedPercentage(rule.staffPercentage ?? 0)}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Kitchen %</p>
                <p>{formatSuggestedPercentage(rule.kitchenPercentage ?? 0)}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Manager %</p>
                <p>{formatSuggestedPercentage(rule.managerPercentage ?? 0)}</p>
              </div>
            </div>
          )}
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
  rule: MerchantTipRule;
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
          {isDeactivating ? 'Deactivate this tip rule?' : 'Reactivate this tip rule?'}
        </p>
        <p className="text-sm text-[#5f5e5e] mt-2">
          {isDeactivating
            ? `"${rule.name}" will stop being offered to customers.`
            : `"${rule.name}" will start being offered to customers again.`}
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

interface TipRulesViewProps {
  onNavigate?: (view: string) => void;
}

export const TipRulesView: React.FC<TipRulesViewProps> = ({ onNavigate }) => {
  const [rules, setRules] = useState<MerchantTipRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [calcMethodFilter, setCalcMethodFilter] = useState<'' | TipCalculationMethod>('');
  const [distributionMethodFilter, setDistributionMethodFilter] = useState<'' | TipDistributionMethod>('');
  const [kitchenOnly, setKitchenOnly] = useState(false);
  const [managersOnly, setManagersOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('');

  const [formModalOpen, setFormModalOpen] = useState<null | { mode: 'create' | 'edit'; rule?: MerchantTipRule }>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [detailRule, setDetailRule] = useState<MerchantTipRule | null>(null);
  const [togglingRule, setTogglingRule] = useState<MerchantTipRule | null>(null);
  const [toggleSubmitting, setToggleSubmitting] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchTipRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/merchant-tip-rule?limit=100`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        throw new Error('Error al cargar las reglas de propinas');
      }

      const json = await res.json();
      setRules(json.data ?? []);
    } catch (err) {
      console.error('Error fetching tip rules:', err);
      setError('Failed to load tip rules. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTipRules();
  }, []);

  const handleCreateSubmit = async (dto: CreateTipRuleDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-tip-rule`, {
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
        throw new Error(json.message || 'Failed to create tip rule');
      }

      setRules((prev) => [json.data, ...prev]);
      setFormModalOpen(null);
      setToast({ message: 'Tip rule created successfully', type: 'success' });
    } catch (err: any) {
      setFormModalOpen(null);
      setToast({ message: err.message || 'Failed to create tip rule', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (ruleId: number, dto: UpdateTipRuleDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-tip-rule/${ruleId}`, {
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
        throw new Error(json.message || 'Failed to update tip rule');
      }

      setRules((prev) => prev.map((r) => (r.id === json.data.id ? json.data : r)));
      setFormModalOpen(null);
      setToast({ message: 'Tip rule updated successfully', type: 'success' });
    } catch (err: any) {
      setFormModalOpen(null);
      setToast({ message: err.message || 'Failed to update tip rule', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleRowClick = async (ruleId: number) => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-tip-rule/${ruleId}`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to load tip rule details');
      }

      setDetailRule(json.data);
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to load tip rule details', type: 'error' });
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

      const res = await fetch(`${API_BASE}/merchant-tip-rule/${togglingRule.id}`, {
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
        throw new Error(json.message || 'Failed to update tip rule status');
      }

      setRules((prev) => prev.map((r) => (r.id === json.data.id ? json.data : r)));
      setTogglingRule(null);
      setToast({
        message: nextStatus === 'inactive' ? 'Tip rule deactivated successfully' : 'Tip rule reactivated successfully',
        type: 'success',
      });
    } catch (err: any) {
      setTogglingRule(null);
      setToast({ message: err.message || 'Failed to update tip rule status', type: 'error' });
    } finally {
      setToggleSubmitting(false);
    }
  };

  const filteredRules = useMemo(() => {
    return rules.filter((rule) => {
      const term = searchQuery.trim();
      if (term && !fuzzyMatch(term, rule.name)) return false;
      if (calcMethodFilter && rule.tipCalculationMethod !== calcMethodFilter) return false;
      if (distributionMethodFilter && rule.tipDistributionMethod !== distributionMethodFilter) return false;
      if (kitchenOnly && toNumber(rule.kitchenPercentage) <= 0) return false;
      if (managersOnly && toNumber(rule.managerPercentage) <= 0) return false;
      if (statusFilter && rule.status !== statusFilter) return false;
      return true;
    });
  }, [rules, searchQuery, calcMethodFilter, distributionMethodFilter, kitchenOnly, managersOnly, statusFilter]);

  const hasActiveFilter = Boolean(
    searchQuery || calcMethodFilter || distributionMethodFilter || kitchenOnly || managersOnly || statusFilter,
  );

  const clearFilters = () => {
    setSearchQuery('');
    setCalcMethodFilter('');
    setDistributionMethodFilter('');
    setKitchenOnly(false);
    setManagersOnly(false);
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
          onClick={fetchTipRules}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
      {/* Filtros */}
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
              placeholder="Search by rule name..."
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
              aria-label="Search tip rules"
            />
          </div>
          <select
            value={calcMethodFilter}
            onChange={(e) => setCalcMethodFilter(e.target.value as '' | TipCalculationMethod)}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
            aria-label="Filter by calculation method"
          >
            <option value="">All Methods</option>
            <option value="percentage">Percentage</option>
            <option value="fixed_amount">Fixed Amount</option>
            <option value="custom">Custom</option>
          </select>
          <select
            value={distributionMethodFilter}
            onChange={(e) => setDistributionMethodFilter(e.target.value as '' | TipDistributionMethod)}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
            aria-label="Filter by distribution method"
          >
            <option value="">All Distributions</option>
            <option value="individual">Individual</option>
            <option value="pool">Pool</option>
            <option value="role_based">Role-Based</option>
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
              Add Tip Rule
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={kitchenOnly}
              onChange={(e) => setKitchenOnly(e.target.checked)}
              className="text-[#ae001a] focus:ring-[#ae001a] border-[#e8e2d8]"
            />
            Kitchen Staff Included
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={managersOnly}
              onChange={(e) => setManagersOnly(e.target.checked)}
              className="text-[#ae001a] focus:ring-[#ae001a] border-[#e8e2d8]"
            />
            Managers Included
          </label>
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
          data-testid="tip-rules-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">volunteer_activism</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No tip processing rules configured for this company. Click &apos;Add Tip Rule&apos; to
            define service compensation parameters.
          </p>
          <button
            type="button"
            onClick={() => setFormModalOpen({ mode: 'create' })}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add Tip Rule
          </button>
        </div>
      )}

      {/* Tabla */}
      {(loading || rules.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              MERCHANT TIP RULES
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
                    Calculation &amp; Distribution
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Staff Matrix
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Threshold Safeguards
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
                      <td className="px-6 py-4">
                        <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-40" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 mx-auto" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-24" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" />
                      </td>
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
                          No tip rules match your active filters
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
                  filteredRules.map((rule) => {
                    const hasKitchen = toNumber(rule.kitchenPercentage) > 0;
                    const hasManagers = toNumber(rule.managerPercentage) > 0;
                    const values =
                      rule.tipCalculationMethod === 'fixed_amount'
                        ? rule.fixedAmountOptions
                        : rule.suggestedPercentages;
                    const formatValue =
                      rule.tipCalculationMethod === 'fixed_amount'
                        ? formatFixedAmount
                        : formatSuggestedPercentage;

                    return (
                      <tr
                        key={rule.id}
                        onClick={() => handleRowClick(rule.id)}
                        className={`group hover:bg-[#f8f3eb] transition-colors cursor-pointer ${
                          rule.status !== 'active' ? 'opacity-75' : ''
                        }`}
                      >
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17]">{rule.name}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {values && values.length > 0 ? (
                              values.map((value, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] font-semibold bg-[#f2ede5] text-[#5f5e5e] px-1.5 py-0.5 rounded"
                                >
                                  {formatValue(value)}
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] text-[#5f5e5e] italic">No suggested values</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${CALC_METHOD_PILL_STYLES[rule.tipCalculationMethod]}`}
                            >
                              Method: {CALC_METHOD_LABELS[rule.tipCalculationMethod]}
                            </span>
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${DISTRIBUTION_PILL_STYLES[rule.tipDistributionMethod]}`}
                            >
                              Split: {DISTRIBUTION_LABELS[rule.tipDistributionMethod]}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-1 flex-wrap">
                            {hasKitchen && (
                              <span className="bg-green-500/10 text-green-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                                Kitchen
                              </span>
                            )}
                            {hasManagers && (
                              <span className="bg-purple-500/10 text-purple-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                                Managers
                              </span>
                            )}
                            {rule.autoDistribute && (
                              <span className="bg-blue-500/10 text-blue-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                                Auto-Distribute
                              </span>
                            )}
                            {!hasKitchen && !hasManagers && !rule.autoDistribute && (
                              <span className="text-[#5f5e5e]">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-[#1d1c17]">
                              Max: {rule.maximumTipPercentage}%
                            </span>
                            {rule.allowCustomTip && (
                              <span className="bg-amber-500/10 text-amber-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                                Custom Tip Allowed
                              </span>
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
                              aria-label="Edit tip rule"
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
                              aria-label={rule.status === 'active' ? 'Deactivate tip rule' : 'Reactivate tip rule'}
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                            >
                              <span className="material-symbols-outlined text-[20px]">
                                {rule.status === 'active' ? 'delete' : 'check'}
                              </span>
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

      <RuleConfigQuickLinks activeRule="tips" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={() => setFormModalOpen({ mode: 'create' })}
        aria-label="Quick create tip rule"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {formModalOpen && (
        <TipRuleFormModal
          mode={formModalOpen.mode}
          initialRule={formModalOpen.rule}
          submitting={formSubmitting}
          onCancel={() => setFormModalOpen(null)}
          onSubmit={(dto) =>
            formModalOpen.mode === 'create'
              ? handleCreateSubmit(dto as CreateTipRuleDto)
              : handleEditSubmit(formModalOpen.rule!.id, dto as UpdateTipRuleDto)
          }
        />
      )}

      {detailRule && <TipRuleDetailModal rule={detailRule} onClose={() => setDetailRule(null)} />}

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

export default TipRulesView;
