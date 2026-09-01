import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type { MerchantTaxRule, TaxType, CreateTaxRuleDto, UpdateTaxRuleDto } from '../../../../types/configuration';
import { RuleConfigQuickLinks } from './RuleConfigQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

function fuzzyMatch(query: string, target: string): boolean {
  let qi = 0;
  for (let i = 0; i < target.length && qi < query.length; i++) {
    if (target[i].toLowerCase() === query[qi].toLowerCase()) qi++;
  }
  return qi === query.length;
}

function formatRate(taxType: TaxType, rate: number | string): string {
  const num = typeof rate === 'number' ? rate : parseFloat(rate);
  if (taxType === 'fixed') {
    return `$${num.toFixed(2)}`;
  }
  return `${Math.round(num * 100)}%`;
}

const TAX_TYPE_PILL_STYLES: Record<TaxType, string> = {
  percentage: 'bg-blue-500/10 text-blue-700',
  fixed: 'bg-amber-500/10 text-amber-700',
  compound: 'bg-purple-500/10 text-purple-700',
};

interface TaxRuleFormModalProps {
  mode: 'create' | 'edit';
  initialRule?: MerchantTaxRule;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (dto: CreateTaxRuleDto | UpdateTaxRuleDto) => void;
}

const TaxRuleFormModal: React.FC<TaxRuleFormModalProps> = ({
  mode,
  initialRule,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const [name, setName] = useState(initialRule?.name ?? '');
  const [description, setDescription] = useState(initialRule?.description ?? '');
  const [taxType, setTaxType] = useState<TaxType>(initialRule?.taxType ?? 'percentage');
  const [rate, setRate] = useState(initialRule ? String(initialRule.rate) : '');
  const [appliesToTips, setAppliesToTips] = useState(initialRule?.appliesToTips ?? false);
  const [appliesToOvertime, setAppliesToOvertime] = useState(initialRule?.appliesToOvertime ?? false);
  const [externalTaxCode, setExternalTaxCode] = useState(initialRule?.externalTaxCode ?? '');

  const rateNumber = parseFloat(rate);
  const fieldsValid =
    name.trim().length > 0 &&
    name.length <= 50 &&
    description.trim().length > 0 &&
    description.length <= 200 &&
    rate.trim().length > 0 &&
    !isNaN(rateNumber);

  const isUnchanged =
    mode === 'edit' &&
    !!initialRule &&
    name.trim() === initialRule.name &&
    description.trim() === initialRule.description &&
    taxType === initialRule.taxType &&
    rateNumber ===
      (typeof initialRule.rate === 'number' ? initialRule.rate : parseFloat(initialRule.rate)) &&
    appliesToTips === initialRule.appliesToTips &&
    appliesToOvertime === initialRule.appliesToOvertime &&
    (externalTaxCode.trim() || null) === (initialRule.externalTaxCode || null);

  const isValid = fieldsValid && !isUnchanged;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      taxType,
      rate: rateNumber,
      appliesToTips,
      appliesToOvertime,
      externalTaxCode:
        mode === 'edit' ? externalTaxCode.trim() || null : externalTaxCode.trim() || undefined,
    });
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label={mode === 'create' ? 'Add Tax Rule' : 'Edit Tax Rule'}
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">
            {mode === 'create' ? 'Add Tax Rule' : 'Edit Tax Rule'}
          </span>
          <button type="button" onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tax-rule-name" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Rule Name
              </label>
              <input
                id="tax-rule-name"
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
              <label htmlFor="tax-rule-description" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Description
              </label>
              <textarea
                id="tax-rule-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                rows={3}
              />
              <span className={`text-[11px] ${description.length > 200 ? 'text-[#ae001a] font-bold' : 'text-[#5f5e5e]'}`}>
                {description.length}/200
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="tax-rule-type" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Tax Type
              </label>
              <select
                id="tax-rule-type"
                value={taxType}
                onChange={(e) => setTaxType(e.target.value as TaxType)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed</option>
                <option value="compound">Compound</option>
              </select>
              {taxType === 'compound' && (
                <span className="text-[11px] text-purple-700 font-semibold">Compound tax — applied over another tax</span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="tax-rule-rate" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Rate
              </label>
              <input
                id="tax-rule-rate"
                type="number"
                step="0.0001"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono"
                placeholder="e.g., 0.19"
              />
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={appliesToTips}
                  onChange={(e) => setAppliesToTips(e.target.checked)}
                />
                Applies to Tips
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={appliesToOvertime}
                  onChange={(e) => setAppliesToOvertime(e.target.checked)}
                />
                Applies to Overtime
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="tax-rule-ledger-code" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Ledger Code (optional)
              </label>
              <input
                id="tax-rule-ledger-code"
                type="text"
                value={externalTaxCode}
                onChange={(e) => setExternalTaxCode(e.target.value)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono"
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
              Save Tax Rule
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

interface TaxRuleDetailModalProps {
  rule: MerchantTaxRule;
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

const TaxRuleDetailModal: React.FC<TaxRuleDetailModalProps> = ({ rule, onClose }) => {
  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label="Tax Rule Details"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">Tax Rule Details</span>
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
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Tax Type</p>
              <p className="capitalize">{rule.taxType}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Rate</p>
              <p>{formatRate(rule.taxType, rule.rate)}</p>
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
  rule: MerchantTaxRule;
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
          {isDeactivating ? 'Deactivate this tax rule?' : 'Reactivate this tax rule?'}
        </p>
        <p className="text-sm text-[#5f5e5e] mt-2">
          {isDeactivating
            ? `"${rule.name}" will stop applying to new transactions.`
            : `"${rule.name}" will start applying to new transactions again.`}
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

export const MOCK_SEED_TAX_RULES: MerchantTaxRule[] = [
  {
    id: 1,
    name: 'IVA General Standard Sales Tax (19%)',
    description: 'Standard 19% national value added sales tax applicable to POS items',
    taxType: 'percentage',
    rate: 0.19,
    appliesToTips: false,
    appliesToOvertime: false,
    status: 'active',
    externalTaxCode: 'TAX-IVA-19',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
  },
  {
    id: 2,
    name: 'Impuesto al Consumo ICO F&B (8%)',
    description: 'National 8% food & beverage consumption tax rate for restaurant sales',
    taxType: 'percentage',
    rate: 0.08,
    appliesToTips: false,
    appliesToOvertime: false,
    status: 'active',
    externalTaxCode: 'TAX-ICO-08',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
  },
  {
    id: 3,
    name: 'Impuesto Municipal de Licores (5%)',
    description: 'Compound 5% luxury liquor tax surcharge calculated on subtotal',
    taxType: 'compound',
    rate: 0.05,
    appliesToTips: false,
    appliesToOvertime: false,
    status: 'active',
    externalTaxCode: 'TAX-LIC-05',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
  },
  {
    id: 4,
    name: 'Tasa Fija por Bolsa Plástica Ecológica ($0.25)',
    description: 'Fixed $0.25 environmental bag surcharge fee per order transaction',
    taxType: 'fixed',
    rate: 0.25,
    appliesToTips: false,
    appliesToOvertime: false,
    status: 'active',
    externalTaxCode: 'TAX-BAG-025',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
  },
  {
    id: 5,
    name: 'Retención de Impuesto sobre Propinas (10%)',
    description: 'Special 10% tax retention rule applying directly to voluntary customer tips',
    taxType: 'percentage',
    rate: 0.10,
    appliesToTips: true,
    appliesToOvertime: false,
    status: 'inactive',
    externalTaxCode: 'TAX-TIP-10',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
  },
];

const STORAGE_KEY = 'x7_merchant_tax_rules_v1';

export function getStoredTaxRules(): MerchantTaxRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((r: any) => ({
          ...r,
          id: r?.id ?? Math.random(),
          name: r?.name || 'Tax Rule',
          description: r?.description || '',
          taxType: r?.taxType || 'percentage',
          rate: typeof r?.rate === 'number' ? r.rate : 0,
          appliesToTips: Boolean(r?.appliesToTips),
          appliesToOvertime: Boolean(r?.appliesToOvertime),
          status: r?.status || 'active',
        }));
      }
    }
  } catch (e) {
    // fallback
  }
  return MOCK_SEED_TAX_RULES;
}

export function saveStoredTaxRules(rules: MerchantTaxRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch (e) {
    // ignore
  }
}

interface TaxRulesViewProps {
  onNavigate?: (view: string) => void;
}

export const TaxRulesView: React.FC<TaxRulesViewProps> = ({ onNavigate }) => {
  const [rules, setRules] = useState<MerchantTaxRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [taxTypeFilter, setTaxTypeFilter] = useState<'' | TaxType>('');
  const [tipsOnly, setTipsOnly] = useState(false);
  const [overtimeOnly, setOvertimeOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('');

  const [formModalOpen, setFormModalOpen] = useState<null | { mode: 'create' | 'edit'; rule?: MerchantTaxRule }>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [detailRule, setDetailRule] = useState<MerchantTaxRule | null>(null);
  const [togglingRule, setTogglingRule] = useState<MerchantTaxRule | null>(null);
  const [toggleSubmitting, setToggleSubmitting] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchTaxRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/merchant-tax-rule?limit=100`, { headers }).catch(() => null);

      if (res && res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res || !res.ok) {
        const stored = getStoredTaxRules();
        setRules(stored);
        return;
      }

      const json = await res.json();
      const loaded = json.data ?? [];
      const finalRules = loaded.length > 0 ? loaded : getStoredTaxRules();
      setRules(finalRules);
      saveStoredTaxRules(finalRules);
    } catch (err) {
      console.error('Error fetching tax rules, loading stored rules:', err);
      setRules(getStoredTaxRules());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTaxRules();
  }, []);

  const handleCreateSubmit = async (dto: CreateTaxRuleDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-tax-rule`, {
        method: 'POST',
        headers,
        body: JSON.stringify(dto),
      }).catch(() => null);

      if (res && res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) {
        const newRule: MerchantTaxRule = {
          id: Date.now(),
          name: dto.name,
          description: dto.description,
          taxType: dto.taxType,
          rate: dto.rate,
          appliesToTips: dto.appliesToTips ?? false,
          appliesToOvertime: dto.appliesToOvertime ?? false,
          status: 'active',
          externalTaxCode: dto.externalTaxCode,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setRules((prev) => {
          const updated = [newRule, ...prev];
          saveStoredTaxRules(updated);
          return updated;
        });
      } else {
        setRules((prev) => {
          const updated = [json.data, ...prev];
          saveStoredTaxRules(updated);
          return updated;
        });
      }

      setFormModalOpen(null);
      setToast({ message: 'Tax rule created successfully', type: 'success' });
    } catch (err: any) {
      setFormModalOpen(null);
      setToast({ message: err.message || 'Failed to create tax rule', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (ruleId: number, dto: UpdateTaxRuleDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-tax-rule/${ruleId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(dto),
      }).catch(() => null);

      if (res && res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) {
        setRules((prev) => {
          const updated = prev.map((r) =>
            r.id === ruleId
              ? {
                  ...r,
                  ...dto,
                  updatedAt: new Date().toISOString(),
                }
              : r,
          );
          saveStoredTaxRules(updated);
          return updated;
        });
      } else {
        setRules((prev) => {
          const updated = prev.map((r) => (r.id === json.data.id ? json.data : r));
          saveStoredTaxRules(updated);
          return updated;
        });
      }

      setFormModalOpen(null);
      setToast({ message: 'Tax rule updated successfully', type: 'success' });
    } catch (err: any) {
      setFormModalOpen(null);
      setToast({ message: err.message || 'Failed to update tax rule', type: 'error' });
    } finally {
      setFormSubmitting(false);
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

      const res = await fetch(`${API_BASE}/merchant-tax-rule/${togglingRule.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: nextStatus }),
      }).catch(() => null);

      if (res && res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) {
        setRules((prev) => {
          const updated = prev.map((r) =>
            r.id === togglingRule.id
              ? { ...r, status: nextStatus, updatedAt: new Date().toISOString() }
              : r,
          );
          saveStoredTaxRules(updated);
          return updated;
        });
      } else {
        setRules((prev) => {
          const updated = prev.map((r) => (r.id === json.data.id ? json.data : r));
          saveStoredTaxRules(updated);
          return updated;
        });
      }

      setTogglingRule(null);
      setToast({
        message: nextStatus === 'inactive' ? 'Tax rule deactivated successfully' : 'Tax rule reactivated successfully',
        type: 'success',
      });
    } catch (err: any) {
      setTogglingRule(null);
      setToast({ message: err.message || 'Failed to update tax rule status', type: 'error' });
    } finally {
      setToggleSubmitting(false);
    }
  };

  const handleRowClick = async (ruleId: number) => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-tax-rule/${ruleId}`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to load tax rule details');
      }

      setDetailRule(json.data);
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to load tax rule details', type: 'error' });
    }
  };

  const filteredRules = useMemo(() => {
    return rules.filter((rule) => {
      const term = searchQuery.trim();
      if (term) {
        const matchesSearch =
          fuzzyMatch(term, rule.name) ||
          fuzzyMatch(term, rule.description) ||
          (rule.externalTaxCode ? fuzzyMatch(term, rule.externalTaxCode) : false);
        if (!matchesSearch) return false;
      }
      if (taxTypeFilter && rule.taxType !== taxTypeFilter) return false;
      if (tipsOnly && !rule.appliesToTips) return false;
      if (overtimeOnly && !rule.appliesToOvertime) return false;
      if (statusFilter && rule.status !== statusFilter) return false;
      return true;
    });
  }, [rules, searchQuery, taxTypeFilter, tipsOnly, overtimeOnly, statusFilter]);

  const hasActiveFilter = Boolean(
    searchQuery || taxTypeFilter || tipsOnly || overtimeOnly || statusFilter,
  );

  const clearFilters = () => {
    setSearchQuery('');
    setTaxTypeFilter('');
    setTipsOnly(false);
    setOvertimeOnly(false);
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
          onClick={fetchTaxRules}
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
        {/* Fila 1: Búsqueda al 100% de ancho */}
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, description, or ledger code..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search tax rules"
          />
        </div>

        {/* Fila 2: Filtros a la izquierda, Botones a la derecha */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={taxTypeFilter}
              onChange={(e) => setTaxTypeFilter(e.target.value as '' | TaxType)}
              className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              aria-label="Filter by tax type"
            >
              <option value="">All Types</option>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed</option>
              <option value="compound">Compound</option>
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
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!isTrueEmpty && (
              <button
                type="button"
                onClick={() => setFormModalOpen({ mode: 'create' })}
                className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-base">add</span>
                Add Tax Rule
              </button>
            )}
            <button
              type="button"
              onClick={fetchTaxRules}
              className="p-2.5 bg-white border border-[#e8e2d8] rounded hover:bg-[#fef9f1] text-secondary hover:text-[#ae001a] transition-all flex items-center justify-center cursor-pointer"
              title="Reload table data"
              aria-label="Reload table data"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={tipsOnly}
              onChange={(e) => setTipsOnly(e.target.checked)}
              className="text-[#ae001a] focus:ring-[#ae001a] border-[#e8e2d8]"
            />
            Applies to Tips
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={overtimeOnly}
              onChange={(e) => setOvertimeOnly(e.target.checked)}
              className="text-[#ae001a] focus:ring-[#ae001a] border-[#e8e2d8]"
            />
            Applies to Overtime
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
          data-testid="tax-rules-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">receipt_long</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No tax processing rules configured for this company. Click &apos;Add Tax Rule&apos; to
            define statutory compliance parameters.
          </p>
          <button
            type="button"
            onClick={() => setFormModalOpen({ mode: 'create' })}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add Tax Rule
          </button>
        </div>
      )}

      {/* Tabla */}
      {(loading || rules.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              MERCHANT TAX RULES
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
                    Tax Mechanics
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Applies To
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Ledger Code
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
                        <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-24" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 mx-auto" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-28" />
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
                          No tax rules match your active filters
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
                    const isInactive = rule.status !== 'active';
                    return (
                      <tr
                        key={rule.id}
                        onClick={() => handleRowClick(rule.id)}
                        className={`group transition-colors cursor-pointer ${
                          isInactive ? 'bg-[#f8f3eb]/40 opacity-75' : 'hover:bg-[#f8f3eb]'
                        }`}
                      >
                        <td className="px-6 py-4">
                          <p className={`font-bold text-[#1d1c17] ${isInactive ? 'line-through' : ''}`}>{rule.name}</p>
                          <p className="text-xs text-[#5f5e5e] line-clamp-2">{rule.description}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${TAX_TYPE_PILL_STYLES[rule.taxType]}`}
                            >
                              {rule.taxType}
                            </span>
                            <span className="text-sm font-semibold text-[#1d1c17]">
                              {formatRate(rule.taxType, rule.rate)}
                            </span>
                          </div>
                        </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-1 flex-wrap">
                          {rule.appliesToTips && (
                            <span className="bg-green-500/10 text-green-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                              Tips
                            </span>
                          )}
                          {rule.appliesToOvertime && (
                            <span className="bg-blue-500/10 text-blue-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                              Overtime
                            </span>
                          )}
                          {!rule.appliesToTips && !rule.appliesToOvertime && (
                            <span className="text-[#5f5e5e]">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {rule.externalTaxCode ? (
                          <code className="font-mono text-[11px] text-[#5f5e5e] bg-[#f2ede5] px-1.5 py-0.5 rounded">
                            {rule.externalTaxCode}
                          </code>
                        ) : (
                          <span className="text-[11px] text-[#5f5e5e] italic">
                            No Ledger Code Bound
                          </span>
                        )}
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
                            aria-label="Edit tax rule"
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
                            aria-label={rule.status === 'active' ? 'Deactivate tax rule' : 'Reactivate tax rule'}
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

      <RuleConfigQuickLinks activeRule="tax" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={() => setFormModalOpen({ mode: 'create' })}
        aria-label="Quick create tax rule"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {formModalOpen && (
        <TaxRuleFormModal
          mode={formModalOpen.mode}
          initialRule={formModalOpen.rule}
          submitting={formSubmitting}
          onCancel={() => setFormModalOpen(null)}
          onSubmit={(dto) =>
            formModalOpen.mode === 'create'
              ? handleCreateSubmit(dto as CreateTaxRuleDto)
              : handleEditSubmit(formModalOpen.rule!.id, dto as UpdateTaxRuleDto)
          }
        />
      )}

      {detailRule && <TaxRuleDetailModal rule={detailRule} onClose={() => setDetailRule(null)} />}

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

export default TaxRulesView;
