//src/components/SaaSDashboard/PlatformFeatureCatalogView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { StatusToggleButton, ConfirmStatusToggleDialog, normalizeStatus } from '../../shared/StatusToggle';
import { saasService } from '../../../services/saasService';
import type { PlatformFeature } from '../../../types/subscription';

interface PlatformFeatureCatalogViewProps {
  onNavigate?: (view: string) => void;
}

interface ToastProps {
  toast: { message: string; type: 'success' | 'error' };
  onDismiss: () => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => (
  <div
    className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-5 py-3.5 shadow-lg text-white text-sm font-medium ${
      toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
    }`}
  >
    <span className="material-symbols-outlined text-lg">
      {toast.type === 'success' ? 'check_circle' : 'report'}
    </span>
    {toast.message}
    <button type="button" onClick={onDismiss} className="ml-2 text-white/70 hover:text-white">
      <span className="material-symbols-outlined text-base">close</span>
    </button>
  </div>
);

interface CreateFeatureDialogProps {
  submitting: boolean;
  onClose: () => void;
  onSave: (dto: { name: string; description: string; Unit: string }) => void;
}

const CreateFeatureDialog: React.FC<CreateFeatureDialogProps> = ({ submitting, onClose, onSave }) => {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [unit, setUnit] = React.useState('');

  const nameExceeded = name.length > 100;
  const unitExceeded = unit.length > 50;
  const isValid =
    name.trim() !== '' &&
    description.trim() !== '' &&
    unit.trim() !== '' &&
    !nameExceeded &&
    !unitExceeded;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg shadow-2xl">
        <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            CREATE FEATURE
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
            <div className="flex justify-between">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                Name
              </label>
              <span className={`text-[11px] ${nameExceeded ? 'text-[#ae001a] font-bold' : 'text-[#5f5e5e]'}`}>
                {name.length}/100
              </span>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full px-3 py-2 border bg-[#fef9f1] text-sm text-[#1d1c17] focus:ring-1 outline-none transition-all ${
                nameExceeded
                  ? 'border-[#ae001a] focus:border-[#ae001a] focus:ring-[#ae001a]'
                  : 'border-[#e8e2d8] focus:border-[#ae001a] focus:ring-[#ae001a]'
              }`}
              placeholder="Feature name"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-[#e8e2d8] bg-[#fef9f1] text-sm text-[#1d1c17] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all resize-none"
              placeholder="Feature description"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                Unit
              </label>
              <span className={`text-[11px] ${unitExceeded ? 'text-[#ae001a] font-bold' : 'text-[#5f5e5e]'}`}>
                {unit.length}/50
              </span>
            </div>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={`w-full px-3 py-2 border bg-[#fef9f1] text-sm text-[#1d1c17] focus:ring-1 outline-none transition-all ${
                unitExceeded
                  ? 'border-[#ae001a] focus:border-[#ae001a] focus:ring-[#ae001a]'
                  : 'border-[#e8e2d8] focus:border-[#ae001a] focus:ring-[#ae001a]'
              }`}
              placeholder="e.g. unit, user, gb"
            />
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
              onClick={() => onSave({ name: name.trim(), description: description.trim(), Unit: unit.trim() })}
              disabled={submitting || !isValid}
              className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && (
                <span className="material-symbols-outlined text-base animate-spin">
                  progress_activity
                </span>
              )}
              {submitting ? 'Creating...' : 'Create Feature'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface EditFeatureDialogProps {
  feature: PlatformFeature;
  submitting: boolean;
  onClose: () => void;
  onSave: (dto: { name: string; description: string; Unit: string }) => void;
}

const EditFeatureDialog: React.FC<EditFeatureDialogProps> = ({ feature, submitting, onClose, onSave }) => {
  const [name, setName] = React.useState(feature.name);
  const [description, setDescription] = React.useState(feature.description);
  const [unit, setUnit] = React.useState(feature.Unit);

  const nameExceeded = name.length > 100;
  const unitExceeded = unit.length > 50;
  const isValid =
    name.trim() !== '' &&
    description.trim() !== '' &&
    unit.trim() !== '' &&
    !nameExceeded &&
    !unitExceeded;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg shadow-2xl">
        <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            EDIT FEATURE
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
            <div className="flex justify-between">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                Name
              </label>
              <span className={`text-[11px] ${nameExceeded ? 'text-[#ae001a] font-bold' : 'text-[#5f5e5e]'}`}>
                {name.length}/100
              </span>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full px-3 py-2 border bg-[#fef9f1] text-sm text-[#1d1c17] focus:ring-1 outline-none transition-all ${
                nameExceeded
                  ? 'border-[#ae001a] focus:border-[#ae001a] focus:ring-[#ae001a]'
                  : 'border-[#e8e2d8] focus:border-[#ae001a] focus:ring-[#ae001a]'
              }`}
              placeholder="Feature name"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-[#e8e2d8] bg-[#fef9f1] text-sm text-[#1d1c17] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all resize-none"
              placeholder="Feature description"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                Unit
              </label>
              <span className={`text-[11px] ${unitExceeded ? 'text-[#ae001a] font-bold' : 'text-[#5f5e5e]'}`}>
                {unit.length}/50
              </span>
            </div>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={`w-full px-3 py-2 border bg-[#fef9f1] text-sm text-[#1d1c17] focus:ring-1 outline-none transition-all ${
                unitExceeded
                  ? 'border-[#ae001a] focus:border-[#ae001a] focus:ring-[#ae001a]'
                  : 'border-[#e8e2d8] focus:border-[#ae001a] focus:ring-[#ae001a]'
              }`}
              placeholder="e.g. unit, user, gb"
            />
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
              onClick={() => onSave({ name: name.trim(), description: description.trim(), Unit: unit.trim() })}
              disabled={submitting || !isValid}
              className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && (
                <span className="material-symbols-outlined text-base animate-spin">
                  progress_activity
                </span>
              )}
              {submitting ? 'Saving...' : 'Save Changes'}
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

export const PlatformFeatureCatalogView: React.FC<PlatformFeatureCatalogViewProps> = ({ onNavigate }) => {
  const [features, setFeatures] = useState<PlatformFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [isCreating, setIsCreating] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [editingFeature, setEditingFeature] = useState<PlatformFeature | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [togglingFeature, setTogglingFeature] = useState<PlatformFeature | null>(null);
  const [toggleSubmitting, setToggleSubmitting] = useState(false);

  useEffect(() => {
    saasService.getFeatures()
      .then((data) => setFeatures(data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const unitOptions = useMemo(
    () => [...new Set(features.map((f) => f.Unit))].sort(),
    [features],
  );

  const filteredFeatures = useMemo(() => {
    return features.filter((f) => {
      const q = searchText.trim();
      if (q) {
        const idStr = `feature_${f.id}`;
        if (!fuzzyMatch(q, f.name) && !fuzzyMatch(q, f.description) && !fuzzyMatch(q, idStr)) {
          return false;
        }
      }
      if (unitFilter && f.Unit !== unitFilter) return false;
      if (statusFilter !== 'All Status' && normalizeStatus(f.status) !== statusFilter) return false;
      return true;
    });
  }, [features, searchText, unitFilter, statusFilter]);

  const hasActiveFilter = Boolean(searchText || unitFilter || statusFilter !== 'All Status');

  const handleCreateSave = async (dto: { name: string; description: string; Unit: string }) => {
    setCreateSubmitting(true);
    try {
      const newFeature = await saasService.createFeature({ ...dto, status: 'active' });
      setFeatures((prev) => [newFeature, ...prev]);
      setIsCreating(false);
      setToast({ message: 'Feature created successfully', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create feature';
      setIsCreating(false);
      if (msg === 'SESSION_EXPIRED') {
        setToast({ message: 'Session expired. Please refresh the page to sign in again.', type: 'error' });
      } else {
        setToast({ message: msg, type: 'error' });
      }
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleEditSave = async (dto: { name: string; description: string; Unit: string }) => {
    if (!editingFeature) return;
    setEditSubmitting(true);
    try {
      const updated = await saasService.updateFeature(editingFeature.id, dto);
      setFeatures((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setEditingFeature(null);
      setToast({ message: 'Feature updated successfully', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update feature';
      setEditingFeature(null);
      if (msg === 'SESSION_EXPIRED') {
        setToast({ message: 'Session expired. Please refresh the page to sign in again.', type: 'error' });
      } else {
        setToast({ message: msg, type: 'error' });
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleToggleConfirm = async () => {
    if (!togglingFeature) return;
    const nextStatus = normalizeStatus(togglingFeature.status) === 'active' ? 'inactive' : 'active';
    setToggleSubmitting(true);
    try {
      const updated = await saasService.updateFeature(togglingFeature.id, { status: nextStatus });
      setFeatures((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setTogglingFeature(null);
      setToast({
        message: nextStatus === 'active' ? 'Feature activated successfully' : 'Feature deactivated successfully',
        type: 'success',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update feature status';
      setTogglingFeature(null);
      if (msg === 'SESSION_EXPIRED') {
        setToast({ message: 'Session expired. Please refresh the page to sign in again.', type: 'error' });
      } else {
        setToast({ message: msg, type: 'error' });
      }
    } finally {
      setToggleSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          report
        </span>
        <p className="mt-3 text-red-700 font-medium">Failed to load feature catalog.</p>
        <p className="text-red-500 text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Filter Strip Card */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-5 flex flex-row justify-between items-center gap-4">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-lg">
            search
          </span>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search features..."
            className="w-full pl-10 pr-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all font-[Poppins]"
            aria-label="Search features"
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl text-sm focus:border-[#ae001a] outline-none font-[Poppins]"
            aria-label="Filter by measurement unit"
          >
            <option value="">All Units</option>
            {unitOptions.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl text-sm focus:border-[#ae001a] outline-none font-[Poppins]"
            aria-label="Filter by status"
          >
            <option value="All Status">All Status</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={() => { setSearchText(''); setUnitFilter(''); setStatusFilter('All Status'); }}
              className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest rounded-xl hover:bg-[#f2ede5] transition-colors"
            >
              Clear Filters
            </button>
          )}
          {!isCreating && (
            <button
              type="button"
              aria-label="Create Feature"
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">add</span>
              CREATE FEATURE
            </button>
          )}
        </div>
      </div>

      {/* Table Card — shown during loading or when data exists */}
      {(loading || features.length > 0) && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden">
          <div className="px-4 py-3 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white">
              PLATFORM FEATURE CATALOG MASTER
            </span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredFeatures.length} features`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Feature Identity
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Scope Definition
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Unit
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
                        <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-48" />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-16 mx-auto" />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-12 mx-auto" />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-12 mx-auto" />
                      </td>
                    </tr>
                  ))
                ) : filteredFeatures.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                        <p className="text-sm text-[#5f5e5e]">
                          No platform features match your active filters
                        </p>
                        {hasActiveFilter && (
                          <button
                            type="button"
                            onClick={() => { setSearchText(''); setUnitFilter(''); setStatusFilter('All Status'); }}
                            className="text-[#ae001a] text-sm font-semibold hover:underline"
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredFeatures.map((feature) => (
                    <tr
                      key={feature.id}
                      className="group hover:bg-[#f8f3eb] transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-1 h-10 rounded-full flex-shrink-0 ${
                              feature.status === 'active' ? 'bg-[#ae001a]' : 'bg-[#c8c6c5]'
                            }`}
                          />
                          <div>
                            <p className="font-bold text-[#1d1c17]">{feature.name}</p>
                            <code className="font-mono text-[11px] text-[#5f5e5e] bg-[#f2ede5] px-1.5 py-0.5 rounded">
                              feature_{feature.id}
                            </code>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-[280px]">
                        <p className="text-sm text-[#5f5e5e] line-clamp-2">{feature.description}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-[10px] font-bold uppercase text-[#5f5e5e] border border-[#e8e2d8] bg-[#f2ede5] px-2 py-0.5 rounded font-mono">
                          [{feature.Unit.toLowerCase()}]
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {normalizeStatus(feature.status) === 'active' ? (
                          <span className="bg-green-500/10 text-green-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                            active
                          </span>
                        ) : (
                          <span className="bg-[#5f5e5e]/20 text-[#5f5e5e] text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                            inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            aria-label={`Edit ${feature.name}`}
                            onClick={() => setEditingFeature(feature)}
                            className="p-1 transition-colors hover:text-[#ae001a]"
                          >
                            <span className="material-symbols-outlined text-xl">edit</span>
                          </button>
                          <StatusToggleButton
                            status={feature.status}
                            entityLabel={feature.name}
                            onClick={() => setTogglingFeature(feature)}
                          />
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

      {/* Empty state — only when data is truly absent (not a filter issue) */}
      {!loading && features.length === 0 && (
        <div className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center">
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">featured_play_list</span>
          <p className="text-[#5f5e5e] mt-4 max-w-sm text-sm leading-relaxed">
            No feature definitions found. Click &apos;Create Feature&apos; to establish your first
            system capability flag.
          </p>
        </div>
      )}

      {/* Quick Launch */}
      <div className="bg-[#2a2a2a] rounded-xl p-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h3 className="!text-white font-bold text-base">Quick Launch</h3>
          <p className="text-white/60 text-sm">
            Feature workspace tools and rapid platform navigation.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onNavigate?.('subscription-applications')}
            className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform"
          >
            PLATFORM APPLICATIONS
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('subscription')}
            className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform"
          >
            SUBSCRIPTION PLANS
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('subscription-live-installs')}
            className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform"
          >
            METERED USAGE LEDGER
          </button>
          <button
            type="button"
            className="bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest px-6 py-3 rounded hover:bg-[#930015] hover:-translate-y-0.5 transition-all"
          >
            EMERGENCY SUPPORT
          </button>
        </div>
      </div>

      {/* FAB */}
      <button
        type="button"
        aria-label="Open create-feature form"
        onClick={() => setIsCreating(true)}
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] text-white rounded-full flex items-center justify-center shadow-xl hover:bg-[#930015] transition-all transform hover:scale-110 active:scale-95 z-50"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {/* Modal */}
      {isCreating && (
        <CreateFeatureDialog
          submitting={createSubmitting}
          onClose={() => setIsCreating(false)}
          onSave={handleCreateSave}
        />
      )}

      {editingFeature && (
        <EditFeatureDialog
          key={editingFeature.id}
          feature={editingFeature}
          submitting={editSubmitting}
          onClose={() => setEditingFeature(null)}
          onSave={handleEditSave}
        />
      )}

      {togglingFeature && (
        <ConfirmStatusToggleDialog
          entityName={togglingFeature.name}
          direction={normalizeStatus(togglingFeature.status) === 'active' ? 'deactivate' : 'activate'}
          submitting={toggleSubmitting}
          onClose={() => setTogglingFeature(null)}
          onConfirm={handleToggleConfirm}
        />
      )}

      {/* Toast */}
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
};
