import React, { useState, useEffect, useMemo } from 'react';
import { saasService } from '../../services/saasService';
import type { PlanApplication, SubscriptionPlan, Application } from '../../types/subscription';

interface AssociateAppDialogProps {
  plan: SubscriptionPlan;
  availableApps: Application[];
  loadingApps: boolean;
  submitting: boolean;
  onClose: () => void;
  onSave: (dto: { applicationId: number; limits: string }) => void;
}

const AssociateAppDialog: React.FC<AssociateAppDialogProps> = ({
  plan,
  availableApps,
  loadingApps,
  submitting,
  onClose,
  onSave,
}) => {
  const [selectedAppId, setSelectedAppId] = React.useState<number | ''>('');
  const [limits, setLimits] = React.useState('');

  const limitsExceeded = limits.length > 50;
  const isValid =
    selectedAppId !== '' &&
    limits.trim() !== '' &&
    !limitsExceeded &&
    !loadingApps;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg shadow-2xl">
        <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            ASSOCIATE APPLICATION
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
              htmlFor="associate-app-select"
              className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]"
            >
              Application
            </label>
            <select
              id="associate-app-select"
              value={selectedAppId}
              onChange={(e) =>
                setSelectedAppId(e.target.value === '' ? '' : Number(e.target.value))
              }
              disabled={loadingApps}
              className="w-full px-3 py-2 border border-[#e8e2d8] bg-[#fef9f1] text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none transition-all disabled:opacity-50"
            >
              {loadingApps ? (
                <option value="">Loading applications…</option>
              ) : availableApps.length === 0 ? (
                <option value="">All applications already associated</option>
              ) : (
                <>
                  <option value="">Select an application…</option>
                  {availableApps.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name} ({app.category})
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                Usage Limits
              </label>
              <span
                className={`text-[11px] ${limitsExceeded ? 'text-[#ae001a] font-bold' : 'text-[#5f5e5e]'}`}
              >
                {limits.length}/50
              </span>
            </div>
            <textarea
              value={limits}
              onChange={(e) => setLimits(e.target.value)}
              rows={3}
              placeholder="e.g. Up to 5 terminals, 100 users/month"
              className={`w-full px-3 py-2 border bg-[#fef9f1] text-sm text-[#1d1c17] focus:ring-1 outline-none transition-all resize-none ${
                limitsExceeded
                  ? 'border-[#ae001a] focus:border-[#ae001a] focus:ring-[#ae001a]'
                  : 'border-[#e8e2d8] focus:border-[#ae001a] focus:ring-[#ae001a]'
              }`}
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
              onClick={() =>
                onSave({ applicationId: selectedAppId as number, limits: limits.trim() })
              }
              disabled={!isValid || submitting}
              className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && (
                <span className="material-symbols-outlined text-base animate-spin">
                  progress_activity
                </span>
              )}
              {submitting ? 'Associating…' : 'ASSOCIATE'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface PlanApplicationsViewProps {
  plan: SubscriptionPlan;
  onNavigate?: (view: string) => void;
}

export const PlanApplicationsView: React.FC<PlanApplicationsViewProps> = ({
  plan,
  onNavigate,
}) => {
  const [planApplications, setPlanApplications] = useState<PlanApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAssociateModal, setShowAssociateModal] = useState(false);
  const [availableApps, setAvailableApps] = useState<Application[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [associateSubmitting, setAssociateSubmitting] = useState(false);

  useEffect(() => {
    saasService
      .getPlanApplications(plan.id)
      .then(setPlanApplications)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to load plan applications';
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

  const openAssociateModal = () => {
    setShowAssociateModal(true);
    setLoadingApps(true);
    saasService
      .getApplications()
      .then((apps) => {
        const associatedIds = new Set(planApplications.map((pa) => pa.application.id));
        setAvailableApps(apps.filter((a) => !associatedIds.has(a.id)));
      })
      .catch(() => setAvailableApps([]))
      .finally(() => setLoadingApps(false));
  };

  const handleAssociate = async (dto: { applicationId: number; limits: string }) => {
    setAssociateSubmitting(true);
    try {
      const newPA = await saasService.createPlanApplication({
        subscriptionPlanId: plan.id,
        applicationId: dto.applicationId,
        limits: dto.limits,
        status: 'active',
      });
      setPlanApplications((prev) => [newPA, ...prev]);
      setShowAssociateModal(false);
      setToast({ message: 'Application associated successfully', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to associate application';
      setShowAssociateModal(false);
      if (msg === 'SESSION_EXPIRED') {
        setToast({
          message: 'Session expired. Please refresh the page to sign in again.',
          type: 'error',
        });
      } else {
        setToast({ message: msg, type: 'error' });
      }
    } finally {
      setAssociateSubmitting(false);
    }
  };

  const filteredApplications = useMemo(() => {
    const term = searchQuery.toLowerCase();
    return planApplications.filter((pa) => {
      const matchesSearch =
        !term ||
        pa.application.name.toLowerCase().includes(term) ||
        pa.limits.toLowerCase().includes(term);
      const matchesStatus = !statusFilter || pa.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [planApplications, searchQuery, statusFilter]);

  const hasActiveFilters = searchQuery !== '' || statusFilter !== '';
  const isFilteredEmpty = !loading && !fetchError && planApplications.length > 0 && filteredApplications.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Dark Title Card */}
      <div className="bg-[#222222] px-6 py-4">
        <span className="text-[11px] font-bold uppercase tracking-widest text-white">
          APPLICATIONS BOUND TO PLAN: {plan.name}
        </span>
      </div>

      {/* Empty State (no apps at all) */}
      {!loading && !fetchError && planApplications.length === 0 && (
        <div
          data-testid="empty-state"
          className="flex flex-col items-center justify-center py-24 gap-6"
        >
          <span className="material-symbols-outlined text-[#5f5e5e] text-[72px]">
            app_registration
          </span>
          <div className="text-center">
            <h3 className="text-xl font-bold text-[#1d1c17]">No Applications Linked</h3>
            <p className="text-sm text-[#5f5e5e] mt-2 max-w-md text-center">
              This subscription plan currently has no applications linked.
              Click &apos;Associate Application&apos; to bundle your first software module.
            </p>
          </div>
          <button
            type="button"
            onClick={openAssociateModal}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add_link</span>
            ASSOCIATE APPLICATION
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
      {(loading || planApplications.length > 0) && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden">
          <div className="px-4 py-3 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white">
              BOUND APPLICATIONS
            </span>
            <span className="text-white/50 text-xs">
              {loading ? '...' : `${planApplications.length} entries`}
            </span>
          </div>

          {/* Filter Controls Row (AC 1) */}
          {!loading && (
            <div className="px-4 py-3 border-b border-[#e8e2d8] bg-[#f8f3eb] flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search by application or constraints…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-[#e8e2d8] bg-white text-[#1d1c17] placeholder:text-[#5f5e5e] focus:outline-none focus:border-[#ae001a]"
                />
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="status-filter"
                  className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap"
                >
                  Relationship Status
                </label>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-sm border border-[#e8e2d8] bg-white text-[#1d1c17] px-3 py-2 focus:outline-none focus:border-[#ae001a]"
                >
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <button
                type="button"
                onClick={openAssociateModal}
                className="px-4 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-base">add_link</span>
                ASSOCIATE APPLICATION
              </button>
            </div>
          )}

          {/* Empty filter result (AC 4) */}
          {isFilteredEmpty && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <span className="material-symbols-outlined text-[#5f5e5e] text-[48px]">
                filter_alt_off
              </span>
              <p className="text-sm font-semibold text-[#5f5e5e]">
                No application associations match your active filters
              </p>
            </div>
          )}

          {/* Data grid */}
          {!isFilteredEmpty && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                  <tr>
                    <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                      Linked Application &amp; ID
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                      Software Category
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                      Usage Restrictions
                    </th>
                    <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                      Association Status
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
                            <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-24" />
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-48" />
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" />
                          </td>
                        </tr>
                      ))
                    : filteredApplications.map((pa) => (
                        <tr
                          key={pa.id}
                          className="hover:bg-[#f8f3eb] transition-colors"
                        >
                          <td className="px-6 py-4">
                            <p className="font-bold text-[#1d1c17]">{pa.application.name}</p>
                            <code className="font-mono text-[11px] text-[#5f5e5e] bg-[#f2ede5] px-1.5 py-0.5 rounded">
                              {pa.application.id}
                            </code>
                          </td>
                          <td className="px-6 py-4">
                            {pa.application.category !== pa.application.name ? (
                              <span className="bg-[#f2ede5] border border-[#e8e2d8] text-[#1d1c17] text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                                {pa.application.category}
                              </span>
                            ) : (
                              <span className="bg-[#f2ede5] border border-[#e8e2d8] text-[#1d1c17] text-[10px] font-bold uppercase px-2 py-0.5 rounded" aria-label={pa.application.category}>
                                {pa.application.category.toUpperCase()}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-[#5f5e5e]">{pa.limits}</p>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {pa.status === 'active' ? (
                              <span className="bg-green-500/10 text-green-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                                active
                              </span>
                            ) : (
                              <span className="bg-[#5f5e5e]/20 text-[#5f5e5e] text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                                inactive
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
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
          aria-label="Open associate-application form"
          onClick={openAssociateModal}
          className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] text-white rounded-full flex items-center justify-center shadow-xl hover:bg-[#930015] transition-all transform hover:scale-110 active:scale-95 z-50"
        >
          <span className="material-symbols-outlined text-3xl">add</span>
        </button>
      )}

      {/* Associate Application Modal */}
      {showAssociateModal && (
        <AssociateAppDialog
          plan={plan}
          availableApps={availableApps}
          loadingApps={loadingApps}
          submitting={associateSubmitting}
          onClose={() => setShowAssociateModal(false)}
          onSave={handleAssociate}
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

export default PlanApplicationsView;
