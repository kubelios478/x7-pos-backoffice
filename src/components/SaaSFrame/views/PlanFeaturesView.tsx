//src/components/SaaSDashboard/PlanFeaturesView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { saasService } from '../../../services/saasService';
import type { PlanFeature, SubscriptionPlan, PlatformFeature } from '../../../types/subscription';
import { StatusToggleButton, ConfirmStatusToggleDialog } from '../../shared/StatusToggle';

function isValidLimitValue(raw: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(raw.trim()) && Number(raw) > 0;
}

interface MapFeatureDialogProps {
  plan: SubscriptionPlan;
  availableFeatures: PlatformFeature[];
  loadingFeatures: boolean;
  submitting: boolean;
  onClose: () => void;
  onSave: (dto: { featureId: number; limitValue: number }) => void;
}

const MapFeatureDialog: React.FC<MapFeatureDialogProps> = ({
  plan,
  availableFeatures,
  loadingFeatures,
  submitting,
  onClose,
  onSave,
}) => {
  const [selectedFeatureId, setSelectedFeatureId] = React.useState<number | ''>('');
  const [limitValue, setLimitValue] = React.useState('');

  const parsedLimit = Number(limitValue);
  const limitIsValid = isValidLimitValue(limitValue);
  const isValid = selectedFeatureId !== '' && limitIsValid && !loadingFeatures;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg shadow-2xl">
        <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            MAP FEATURE
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
              Subscription Plan
            </label>
            <input
              type="text"
              readOnly
              title="Subscription Plan"
              value={plan.name}
              className="w-full px-3 py-2 border border-[#e8e2d8] bg-[#ece8e0] text-sm text-[#5f5e5e] cursor-not-allowed outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="map-feature-select"
              className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]"
            >
              Feature
            </label>
            <select
              id="map-feature-select"
              value={selectedFeatureId}
              onChange={(e) =>
                setSelectedFeatureId(e.target.value === '' ? '' : Number(e.target.value))
              }
              disabled={loadingFeatures}
              className="w-full px-3 py-2 border border-[#e8e2d8] bg-[#fef9f1] text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none transition-all disabled:opacity-50"
            >
              {loadingFeatures ? (
                <option value="">Loading features…</option>
              ) : availableFeatures.length === 0 ? (
                <option value="">All features already mapped</option>
              ) : (
                <>
                  <option value="">Select a feature…</option>
                  {availableFeatures.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.Unit})
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="map-feature-limit"
              className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]"
            >
              Assigned Cap
            </label>
            <input
              id="map-feature-limit"
              type="number"
              min="0"
              step="0.01"
              value={limitValue}
              onChange={(e) => setLimitValue(e.target.value)}
              placeholder="e.g. 10.00"
              className="w-full px-3 py-2 border border-[#e8e2d8] bg-[#fef9f1] text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none transition-all"
            />
            {limitValue.trim() !== '' && !limitIsValid && (
              <p className="text-xs text-red-600 mt-1">
                Enter a positive number with up to two decimal places.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2 border border-[#e8e2d8] text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                onSave({ featureId: selectedFeatureId as number, limitValue: parsedLimit })
              }
              disabled={!isValid || submitting}
              className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && (
                <span className="material-symbols-outlined text-base animate-spin">
                  progress_activity
                </span>
              )}
              {submitting ? 'Mapping…' : 'MAP'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface EditPlanFeatureDialogProps {
  pf: PlanFeature;
  submitting: boolean;
  onClose: () => void;
  onSave: (dto: { limitValue: number }) => void;
}

const EditPlanFeatureDialog: React.FC<EditPlanFeatureDialogProps> = ({
  pf,
  submitting,
  onClose,
  onSave,
}) => {
  const [limitValue, setLimitValue] = React.useState(String(pf.limit_value));

  const parsedLimit = Number(limitValue);
  const limitIsValid = isValidLimitValue(limitValue);
  const noChanges = parsedLimit === pf.limit_value;
  const isValid = limitIsValid && !noChanges;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg shadow-2xl">
        <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            EDIT PLAN-FEATURE
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
              Subscription Plan
            </label>
            <input
              type="text"
              readOnly
              title="Subscription Plan"
              value={pf.subscriptionPlan.name}
              className="w-full px-3 py-2 border border-[#e8e2d8] bg-[#ece8e0] text-sm text-[#5f5e5e] cursor-not-allowed outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
              Feature
            </label>
            <input
              type="text"
              readOnly
              title="Feature"
              value={pf.feature.name}
              className="w-full px-3 py-2 border border-[#e8e2d8] bg-[#ece8e0] text-sm text-[#5f5e5e] cursor-not-allowed outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="edit-feature-limit"
              className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]"
            >
              Assigned Cap
            </label>
            <input
              id="edit-feature-limit"
              type="number"
              min="0"
              step="0.01"
              value={limitValue}
              onChange={(e) => setLimitValue(e.target.value)}
              className="w-full px-3 py-2 border border-[#e8e2d8] bg-[#fef9f1] text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none transition-all"
            />
            {limitValue.trim() !== '' && !limitIsValid && (
              <p className="text-xs text-red-600 mt-1">
                Enter a positive number with up to two decimal places.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2 border border-[#e8e2d8] text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave({ limitValue: parsedLimit })}
              disabled={!isValid || submitting}
              className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && (
                <span className="material-symbols-outlined text-base animate-spin">
                  progress_activity
                </span>
              )}
              {submitting ? 'Saving…' : 'SAVE CHANGES'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function fuzzyMatch(query: string, target: string): boolean {
  let qi = 0;
  for (let i = 0; i < target.length && qi < query.length; i++) {
    if (target[i].toLowerCase() === query[qi].toLowerCase()) qi++;
  }
  return qi === query.length;
}

interface PlanFeaturesViewProps {
  plan: SubscriptionPlan;
  onNavigate?: (view: string) => void;
}

export const PlanFeaturesView: React.FC<PlanFeaturesViewProps> = ({ plan, onNavigate }) => {
  const [planFeatures, setPlanFeatures] = useState<PlanFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showMapModal, setShowMapModal] = useState(false);
  const [availableFeatures, setAvailableFeatures] = useState<PlatformFeature[]>([]);
  const [loadingFeatures, setLoadingFeatures] = useState(false);
  const [mapSubmitting, setMapSubmitting] = useState(false);
  const [editingPF, setEditingPF] = useState<PlanFeature | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [togglingPF, setTogglingPF] = useState<PlanFeature | null>(null);
  const [toggleSubmitting, setToggleSubmitting] = useState(false);

  useEffect(() => {
    saasService
      .getPlanFeatures(plan.id)
      .then(setPlanFeatures)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to load plan features';
        setFetchError(true);
        if (msg === 'SESSION_EXPIRED') {
          setToast({
            message: 'Session expired. Please refresh the page to sign in again.',
            type: 'error',
          });
        } else {
          setToast({ message: msg, type: 'error' });
        }
      })
      .finally(() => setLoading(false));
  }, [plan.id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const openMapModal = () => {
    setShowMapModal(true);
    setLoadingFeatures(true);
    saasService
      .getFeatures()
      .then((features) => {
        const mappedIds = new Set(planFeatures.map((pf) => pf.feature.id));
        setAvailableFeatures(features.filter((f) => f.status === 'active' && !mappedIds.has(f.id)));
      })
      .catch(() => setAvailableFeatures([]))
      .finally(() => setLoadingFeatures(false));
  };

  const handleMap = async (dto: { featureId: number; limitValue: number }) => {
    setMapSubmitting(true);
    try {
      const newPF = await saasService.createPlanFeature({
        subscriptionPlan: plan.id,
        feature: dto.featureId,
        limit_value: dto.limitValue,
        status: 'active',
      });
      const selectedFeature = availableFeatures.find((f) => f.id === dto.featureId);
      const patchedPF: PlanFeature = {
        ...newPF,
        feature: {
          ...newPF.feature,
          unit: selectedFeature?.Unit ?? newPF.feature.unit,
          description: selectedFeature?.description ?? newPF.feature.description,
        },
      };
      setPlanFeatures((prev) => [patchedPF, ...prev]);
      setShowMapModal(false);
      setToast({ message: 'Feature mapped successfully', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to map feature';
      setShowMapModal(false);
      if (msg === 'SESSION_EXPIRED') {
        setToast({
          message: 'Session expired. Please refresh the page to sign in again.',
          type: 'error',
        });
      } else {
        setToast({ message: msg, type: 'error' });
      }
    } finally {
      setMapSubmitting(false);
    }
  };

  const handleEdit = async (dto: { limitValue: number }) => {
    setEditSubmitting(true);
    try {
      const updated = await saasService.updatePlanFeature(editingPF!.id, {
        limit_value: dto.limitValue,
      });
      const patchedUpdated: PlanFeature = {
        ...updated,
        feature: {
          ...updated.feature,
          unit: editingPF!.feature.unit,
          description: editingPF!.feature.description,
        },
      };
      setPlanFeatures((prev) => prev.map((p) => (p.id === patchedUpdated.id ? patchedUpdated : p)));
      setEditingPF(null);
      setToast({ message: 'Plan-feature updated successfully', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update plan-feature';
      setEditingPF(null);
      if (msg === 'SESSION_EXPIRED') {
        setToast({
          message: 'Session expired. Please refresh the page to sign in again.',
          type: 'error',
        });
      } else {
        setToast({ message: msg, type: 'error' });
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleToggleConfirm = async () => {
    if (!togglingPF) return;
    const nextStatus = togglingPF.status === 'active' ? 'inactive' : 'active';
    setToggleSubmitting(true);
    try {
      const updated = await saasService.updatePlanFeature(togglingPF.id, { status: nextStatus });
      const patchedUpdated: PlanFeature = {
        ...updated,
        feature: {
          ...updated.feature,
          unit: togglingPF.feature.unit,
          description: togglingPF.feature.description,
        },
      };
      setPlanFeatures((prev) => prev.map((p) => (p.id === patchedUpdated.id ? patchedUpdated : p)));
      setTogglingPF(null);
      setToast({
        message: nextStatus === 'active' ? 'Feature entitlement activated successfully' : 'Feature entitlement deactivated successfully',
        type: 'success',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update feature entitlement status';
      setTogglingPF(null);
      if (msg === 'SESSION_EXPIRED') {
        setToast({
          message: 'Session expired. Please refresh the page to sign in again.',
          type: 'error',
        });
      } else {
        setToast({ message: msg, type: 'error' });
      }
    } finally {
      setToggleSubmitting(false);
    }
  };

  const filteredFeatures = useMemo(() => {
    const term = searchQuery.trim();
    return planFeatures.filter((pf) => {
      const matchesSearch =
        !term ||
        fuzzyMatch(term, pf.feature.name) ||
        fuzzyMatch(term, String(pf.feature.id)) ||
        fuzzyMatch(term, pf.feature.description ?? '');
      const matchesStatus = !statusFilter || pf.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [planFeatures, searchQuery, statusFilter]);

  const isFilteredEmpty =
    !loading && !fetchError && planFeatures.length > 0 && filteredFeatures.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Dark Title Banner (AC2) */}
      <div className="bg-[#222222] px-6 py-4">
        <span className="text-[11px] font-bold uppercase tracking-widest text-white">
          FEATURE ENTITLEMENTS BOUND TO PLAN: {plan.name}
        </span>
      </div>

      {/* Empty State (AC4) */}
      {!loading && !fetchError && planFeatures.length === 0 && (
        <div
          data-testid="empty-state"
          className="flex flex-col items-center justify-center py-24 gap-6"
        >
          <span className="material-symbols-outlined text-[#5f5e5e] text-[72px]">tune</span>
          <div className="text-center">
            <h3 className="text-xl font-bold text-[#1d1c17]">No Features Mapped</h3>
            <p className="text-sm text-[#5f5e5e] mt-2 max-w-md text-center">
              This subscription plan currently has no features or limits mapped.
              Click &apos;Map Feature&apos; to establish your first entitlement rule.
            </p>
          </div>
          <button
            type="button"
            onClick={openMapModal}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add_link</span>
            MAP FEATURE
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('subscription')}
            className="text-[#ae001a] text-sm font-semibold hover:underline"
          >
            ← Back to Subscription Plans
          </button>
        </div>
      )}

      {/* Table */}
      {(loading || planFeatures.length > 0) && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden">
          <div className="px-4 py-3 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white">
              BOUND FEATURES
            </span>
            <span className="text-white/50 text-xs">
              {loading ? '...' : `${planFeatures.length} entries`}
            </span>
          </div>

          {!loading && (
            <div className="px-4 py-3 border-b border-[#e8e2d8] bg-[#f8f3eb] flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search by name, ID, or description…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-[#e8e2d8] bg-white text-[#1d1c17] placeholder:text-[#5f5e5e] focus:outline-none focus:border-[#ae001a]"
                />
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="pf-status-filter"
                  className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap"
                >
                  Entitlement Status
                </label>
                <select
                  id="pf-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-sm border border-[#e8e2d8] bg-white text-[#1d1c17] px-3 py-2 focus:outline-none focus:border-[#ae001a]"
                >
                  <option value="">All</option>
                  <option value="active">Active only</option>
                  <option value="inactive">Inactive only</option>
                </select>
              </div>
              <button
                type="button"
                onClick={openMapModal}
                className="px-4 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-base">add_link</span>
                MAP FEATURE
              </button>
            </div>
          )}

          {isFilteredEmpty && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <span className="material-symbols-outlined text-[#5f5e5e] text-[48px]">
                filter_alt_off
              </span>
              <p className="text-sm font-semibold text-[#5f5e5e]">
                No feature entitlements match your active filtering parameters
              </p>
            </div>
          )}

          {!isFilteredEmpty && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                  <tr>
                    <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                      Feature Identity
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                      Measurement Unit
                    </th>
                    <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                      Assigned Cap
                    </th>
                    <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                      Entitlement Status
                    </th>
                    <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e2d8]">
                  {loading
                    ? [1, 2, 3].map((i) => (
                        <tr key={i}>
                          <td className="px-6 py-4">
                            <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-40" />
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-16" />
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 ml-auto" />
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" />
                          </td>
                          <td className="px-6 py-4" />
                        </tr>
                      ))
                    : filteredFeatures.map((pf) => (
                        <tr
                          key={pf.id}
                          className={`group hover:bg-[#f8f3eb] transition-colors ${
                            pf.status !== 'active' ? 'opacity-75' : ''
                          }`}
                        >
                          <td className="px-6 py-4">
                            <p className="font-bold text-[#1d1c17]">{pf.feature.name}</p>
                            <code className="font-mono text-[11px] text-[#5f5e5e] bg-[#f2ede5] px-1.5 py-0.5 rounded">
                              {pf.feature.id}
                            </code>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-mono text-xs text-[#5f5e5e]">
                              [{pf.feature.unit}]
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-sm font-semibold text-[#1d1c17]">
                              {Number(pf.limit_value).toFixed(2)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {pf.status === 'active' ? (
                              <span className="bg-green-500/10 text-green-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                                active
                              </span>
                            ) : (
                              <span className="bg-[#5f5e5e]/20 text-[#5f5e5e] text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                                inactive
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex justify-center gap-1 opacity-30 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                aria-label={`Edit ${pf.feature.name}`}
                                onClick={() => setEditingPF(pf)}
                                className="text-[#5f5e5e] hover:text-[#ae001a] transition-colors"
                              >
                                <span className="material-symbols-outlined text-[20px]">edit</span>
                              </button>
                              <StatusToggleButton
                                status={pf.status}
                                entityLabel={pf.feature.name}
                                onClick={() => setTogglingPF(pf)}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Quick Launch */}
      <div className="bg-[#2a2a2a] rounded-xl p-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h3 className="!text-white font-bold text-base">Quick Launch</h3>
          <p className="text-white/60 text-sm">Navigation shortcuts for plan management.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onNavigate?.('subscription')}
            className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform"
          >
            SUBSCRIPTION PLANS
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('subscription-applications')}
            className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform"
          >
            PLATFORM APPLICATIONS
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('subscription-features')}
            className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform"
          >
            FEATURE CATALOG
          </button>
          <button
            type="button"
            className="bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest px-6 py-3 rounded hover:bg-[#930015] hover:-translate-y-0.5 transition-all"
          >
            EMERGENCY SUPPORT
          </button>
        </div>
      </div>

      {/* Footer (AC1) */}
      <footer className="flex flex-col md:flex-row justify-between items-center border-t border-[#e8e2d8] pt-5 mt-2 mb-8">
        <button
          type="button"
          onClick={() => onNavigate?.('subscription')}
          className="text-[11px] font-bold uppercase tracking-widest text-[#ae001a] hover:underline flex items-center gap-1"
        >
          ← Back to Subscription Plans
        </button>
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] mt-3 md:mt-0">
          © 2026 X7 Point of Sale. All rights reserved.
        </p>
      </footer>

      {/* FAB */}
      {!fetchError && (
        <button
          type="button"
          aria-label="Open map-feature form"
          onClick={openMapModal}
          className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] text-white rounded-full flex items-center justify-center shadow-xl hover:bg-[#930015] transition-all transform hover:scale-110 active:scale-95 z-50"
        >
          <span className="material-symbols-outlined text-3xl">add</span>
        </button>
      )}

      {/* Modals */}
      {showMapModal && (
        <MapFeatureDialog
          plan={plan}
          availableFeatures={availableFeatures}
          loadingFeatures={loadingFeatures}
          submitting={mapSubmitting}
          onClose={() => setShowMapModal(false)}
          onSave={handleMap}
        />
      )}
      {editingPF && (
        <EditPlanFeatureDialog
          pf={editingPF}
          submitting={editSubmitting}
          onClose={() => setEditingPF(null)}
          onSave={handleEdit}
        />
      )}
      {togglingPF && (
        <ConfirmStatusToggleDialog
          entityName={togglingPF.feature.name}
          direction={togglingPF.status === 'active' ? 'deactivate' : 'activate'}
          submitting={toggleSubmitting}
          onClose={() => setTogglingPF(null)}
          onConfirm={handleToggleConfirm}
        />
      )}

      {/* Toast */}
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
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 opacity-70 hover:opacity-100 transition-opacity"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default PlanFeaturesView;
