import React, { useState, useEffect, useMemo } from 'react';
import { saasService } from '../../services/saasService';
import type { SubscriptionPlan, CreateSubscriptionPlanDto, UpdateSubscriptionPlanDto } from '../../types/subscription';

const BILLING_CYCLES: CreateSubscriptionPlanDto['billingCycle'][] = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
];

const EMPTY_FORM = {
  name: '',
  description: '',
  price: '',
  billingCycle: 'monthly' as CreateSubscriptionPlanDto['billingCycle'],
};

const formatPrice = (price: number): string =>
  `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const SubscriptionPlansView: React.FC = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [billingCycle, setBillingCycle] = useState('All Cycles');
  const [statusFilter, setStatusFilter] = useState('All Status');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Edit modal state
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    price: '',
    billingCycle: 'monthly' as CreateSubscriptionPlanDto['billingCycle'],
    status: 'active' as 'active' | 'inactive',
  });
  const [editFormError, setEditFormError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [deletingPlan, setDeletingPlan] = useState<SubscriptionPlan | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  useEffect(() => {
    saasService
      .getSubscriptionPlans()
      .then(setPlans)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const uniqueBillingCycles = useMemo(
    () => ['All Cycles', ...Array.from(new Set(plans.map((p) => p.billingCycle)))],
    [plans],
  );

  const filtered = useMemo(
    () =>
      plans
        .filter(
          (p) =>
            searchTerm === '' ||
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.description.toLowerCase().includes(searchTerm.toLowerCase()),
        )
        .filter((p) => billingCycle === 'All Cycles' || p.billingCycle === billingCycle)
        .filter((p) => statusFilter === 'All Status' || p.status === statusFilter),
    [plans, searchTerm, billingCycle, statusFilter],
  );

  const clearFilters = () => {
    setSearchTerm('');
    setBillingCycle('All Cycles');
    setStatusFilter('All Status');
  };

  const openModal = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormError('');
  };

  const openEditModal = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setEditForm({
      name: plan.name,
      description: plan.description,
      price: plan.price.toString(),
      billingCycle: plan.billingCycle,
      status: plan.status === 'deleted' ? 'active' : plan.status,
    });
    setEditFormError('');
  };

  const closeEditModal = () => {
    setEditingPlan(null);
    setEditFormError('');
  };

  const handleDeleteConfirm = async () => {
    if (!deletingPlan) return;
    setDeleteSubmitting(true);
    try {
      const updated = await saasService.deleteSubscriptionPlan(deletingPlan.id);
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setDeletingPlan(null);
      setToast({ message: 'Plan deleted successfully', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete plan';
      setDeletingPlan(null);
      if (msg === 'SESSION_EXPIRED') {
        setToast({ message: 'Session expired. Please refresh the page to sign in again.', type: 'error' });
      } else {
        setToast({ message: msg, type: 'error' });
      }
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;

    const name = editForm.name.trim();
    const description = editForm.description.trim();
    const price = parseFloat(editForm.price);

    if (!name) return setEditFormError('Plan name is required');
    if (name.length > 100) return setEditFormError('Plan name must be 100 characters or less');
    if (!description) return setEditFormError('Description is required');
    if (!editForm.price || isNaN(price) || price <= 0) return setEditFormError('Price must be a positive number');

    setEditFormError('');
    setEditSubmitting(true);
    try {
      const updated = await saasService.updateSubscriptionPlan(editingPlan.id, {
        name,
        description,
        price,
        billingCycle: editForm.billingCycle,
        status: editForm.status,
      } as UpdateSubscriptionPlanDto);
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      closeEditModal();
      setToast({ message: 'Subscription plan updated successfully', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update plan';
      if (msg === 'SESSION_EXPIRED') {
        closeEditModal();
        setToast({ message: 'Session expired. Please refresh the page to sign in again.', type: 'error' });
      } else {
        setEditFormError(msg);
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    const description = form.description.trim();
    const price = parseFloat(form.price);

    if (!name) return setFormError('Plan name is required');
    if (name.length > 100) return setFormError('Plan name must be 100 characters or less');
    if (!description) return setFormError('Description is required');
    if (!form.price || isNaN(price) || price <= 0) return setFormError('Price must be a positive number');

    setFormError('');
    setSubmitting(true);
    try {
      const newPlan = await saasService.createSubscriptionPlan({
        name,
        description,
        price,
        billingCycle: form.billingCycle,
        status: 'active',
      });
      setPlans((prev) => [...prev, newPlan]);
      closeModal();
      setToast({ message: 'Subscription plan created successfully', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create plan';
      if (msg === 'SESSION_EXPIRED') {
        closeModal();
        setToast({ message: 'Session expired. Please refresh the page to sign in again.', type: 'error' });
      } else {
        setFormError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!loading && plans.length === 0) {
    return (
      <>
        <div
          data-testid="empty-state"
          className="flex flex-col items-center justify-center py-24 gap-6"
        >
          <span className="material-symbols-outlined text-[#5f5e5e]" style={{ fontSize: '72px' }}>
            inventory_2
          </span>
          <div className="text-center">
            <h3 className="text-xl font-bold text-[#1d1c17]">No Plans Configured</h3>
            <p className="text-sm text-[#5f5e5e] mt-2 max-w-md text-center">
              No subscription plans have been provisioned yet. Click &apos;Add Plan&apos; to
              initialize your platform&apos;s monetization model.
            </p>
          </div>
          <button
            type="button"
            onClick={openModal}
            className="bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-[#930015] transition-colors"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            ADD PLAN
          </button>
        </div>

        {/* FAB */}
        <button
          type="button"
          onClick={openModal}
          className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] text-white rounded-full flex items-center justify-center shadow-xl hover:bg-[#930015] transition-all hover:scale-110 active:scale-95 z-50"
          title="New Plan"
        >
          <span className="material-symbols-outlined text-2xl">add</span>
        </button>

        {showModal && <AddPlanModal form={form} setForm={setForm} formError={formError} submitting={submitting} onClose={closeModal} onSubmit={handleSubmit} />}
        {editingPlan && <EditPlanModal form={editForm} setForm={setEditForm} formError={editFormError} submitting={editSubmitting} onClose={closeEditModal} onSubmit={handleEditSubmit} />}
        {deletingPlan && (
          <DeletePlanDialog
            plan={deletingPlan}
            submitting={deleteSubmitting}
            onClose={() => setDeletingPlan(null)}
            onConfirm={handleDeleteConfirm}
          />
        )}
        {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
      </>
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
            data-testid="filter-search"
            type="text"
            className="w-full pl-10 pr-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all font-[Poppins]"
            placeholder="Search plans..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <select
            data-testid="filter-billing-cycle"
            aria-label="Filter by billing cycle"
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl text-sm focus:border-[#ae001a] outline-none font-[Poppins]"
            value={billingCycle}
            onChange={(e) => setBillingCycle(e.target.value)}
          >
            {uniqueBillingCycles.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            data-testid="filter-status"
            aria-label="Filter by status"
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl text-sm focus:border-[#ae001a] outline-none font-[Poppins]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All Status">All Status</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="deleted">deleted</option>
          </select>
          <button
            type="button"
            onClick={openModal}
            className="bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl flex items-center gap-1.5 hover:bg-[#930015] transition-colors"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            ADD PLAN
          </button>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white border border-[#e8e2d8] overflow-hidden">
        <div className="px-4 py-3 bg-[#222222] flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            SUBSCRIPTION MASTER PLANS
          </span>
          <span className="text-white/50 text-xs">
            {loading ? '...' : `${filtered.length} plans`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
              <tr>
                <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  Plan Name &amp; ID
                </th>
                <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  Description
                </th>
                <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  Pricing &amp; Cadence
                </th>
                <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
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
                    <td className="px-6 py-4" />
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">
                        search_off
                      </span>
                      <p className="text-sm text-[#5f5e5e]">
                        No subscription profiles match your search filters
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
                filtered.map((plan) => (
                  <tr
                    key={plan.id}
                    className={`group hover:bg-[#f8f3eb] transition-colors${plan.status !== 'active' ? ' opacity-75' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-1 h-10 rounded-full flex-shrink-0 ${
                            plan.status === 'active' ? 'bg-[#ae001a]' : 'bg-[#c8c6c5]'
                          }`}
                        />
                        <div>
                          <p className="font-bold text-[#1d1c17]">{plan.name}</p>
                          <code className="font-mono text-[11px] text-[#5f5e5e] bg-[#f2ede5] px-1.5 py-0.5 rounded">
                            {plan.id}
                          </code>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-[280px]">
                      <p className="text-sm text-[#5f5e5e] line-clamp-2">{plan.description}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-lg font-black text-[#1d1c17]">
                          {formatPrice(plan.price)}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-[#5f5e5e] border border-[#e8e2d8] bg-[#f2ede5] px-2 py-0.5 rounded">
                          / {plan.billingCycle}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {plan.status === 'active' ? (
                        <span className="bg-green-500/10 text-green-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                          active
                        </span>
                      ) : plan.status === 'inactive' ? (
                        <span className="bg-[#5f5e5e]/20 text-[#5f5e5e] text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                          inactive
                        </span>
                      ) : (
                        <span className="bg-red-500/10 text-red-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                          deleted
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          aria-label={`Edit ${plan.name}`}
                          onClick={() => openEditModal(plan)}
                          disabled={plan.status === 'deleted'}
                          className={`p-1 transition-colors ${
                            plan.status === 'deleted'
                              ? 'opacity-50 cursor-not-allowed'
                              : 'hover:text-[#ae001a]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-xl">edit</span>
                        </button>
                        {plan.status !== 'deleted' && (
                          <button
                            type="button"
                            aria-label={`Delete ${plan.name}`}
                            onClick={() => setDeletingPlan(plan)}
                            className="p-1 hover:text-red-600 transition-colors"
                          >
                            <span className="material-symbols-outlined text-xl">delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Launch Footer */}
      <div className="bg-[#2a2a2a] rounded-xl p-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h3 className="!text-white font-bold text-base">Quick Launch</h3>
          <p className="text-white/60 text-sm">
            Billing tools and instant platform management functions.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform">
            BILLING OVERVIEW
          </button>
          <button type="button" className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform">
            EXPORT PLANS
          </button>
          <button type="button" className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform">
            RUN REVENUE REPORT
          </button>
          <button type="button" className="bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest px-6 py-3 rounded hover:bg-[#930015] hover:-translate-y-0.5 transition-all">
            EMERGENCY SUPPORT
          </button>
        </div>
      </div>

      {/* Page Footer */}
      <footer className="flex flex-col md:flex-row justify-between items-center border-t border-[#e8e2d8] pt-5 mt-2 mb-8">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
          © 2026 X7 Point of Sale. All rights reserved.
        </p>
        <div className="flex gap-6 mt-3 md:mt-0">
          <a href="#" className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:text-[#ae001a] transition-colors underline">
            Privacy Policy
          </a>
          <a href="#" className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:text-[#ae001a] transition-colors underline">
            Terms of Service
          </a>
          <a href="#" className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:text-[#ae001a] transition-colors underline">
            Help Center
          </a>
        </div>
      </footer>

      {/* FAB */}
      <button
        type="button"
        onClick={openModal}
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] text-white rounded-full flex items-center justify-center shadow-xl hover:bg-[#930015] transition-all hover:scale-110 active:scale-95 z-50"
        title="New Plan"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {/* Add Plan Modal */}
      {showModal && (
        <AddPlanModal
          form={form}
          setForm={setForm}
          formError={formError}
          submitting={submitting}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}

      {/* Edit Plan Modal */}
      {editingPlan && (
        <EditPlanModal
          form={editForm}
          setForm={setEditForm}
          formError={editFormError}
          submitting={editSubmitting}
          onClose={closeEditModal}
          onSubmit={handleEditSubmit}
        />
      )}

      {/* Delete Plan Dialog */}
      {deletingPlan && (
        <DeletePlanDialog
          plan={deletingPlan}
          submitting={deleteSubmitting}
          onClose={() => setDeletingPlan(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {/* Toast */}
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface ModalProps {
  form: typeof EMPTY_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>;
  formError: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const AddPlanModal: React.FC<ModalProps> = ({
  form,
  setForm,
  formError,
  submitting,
  onClose,
  onSubmit,
}) => (
  <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
    <div className="bg-white w-full max-w-lg shadow-2xl">
      {/* Modal header */}
      <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
        <span className="text-[11px] font-bold uppercase tracking-widest text-white">
          NEW SUBSCRIPTION PLAN
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-white/50 hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <form onSubmit={onSubmit} className="p-6 space-y-4">
        {/* Name */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] block mb-1.5">
            Plan Name <span className="text-[#ae001a]">*</span>
          </label>
          <input
            type="text"
            maxLength={100}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-4 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all"
            placeholder="e.g. Professional"
          />
          <p className="text-[10px] text-[#5f5e5e] mt-1 text-right">{form.name.length}/100</p>
        </div>

        {/* Description */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] block mb-1.5">
            Description <span className="text-[#ae001a]">*</span>
          </label>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full px-4 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all resize-none"
            placeholder="Describe what's included in this plan..."
          />
        </div>

        {/* Price + Billing Cycle */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] block mb-1.5">
              Price (USD) <span className="text-[#ae001a]">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-sm font-bold">
                $
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                className="w-full pl-7 pr-4 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all"
                placeholder="0.00"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] block mb-1.5">
              Billing Cycle <span className="text-[#ae001a]">*</span>
            </label>
            <select
              value={form.billingCycle}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  billingCycle: e.target.value as CreateSubscriptionPlanDto['billingCycle'],
                }))
              }
              className="w-full px-3 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-sm focus:border-[#ae001a] outline-none"
            >
              {BILLING_CYCLES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status info */}
        <div className="bg-[#f2ede5] border border-[#e8e2d8] px-4 py-2.5 flex items-center gap-2">
          <span className="material-symbols-outlined text-green-600 text-lg">check_circle</span>
          <span className="text-[11px] text-[#5f5e5e]">
            Plan will be created with status{' '}
            <strong className="text-green-600">ACTIVE</strong>
          </span>
        </div>

        {/* Error */}
        {formError && (
          <div className="bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">error</span>
            {formError}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2 border border-[#e8e2d8] text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#930015] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && (
              <span className="material-symbols-outlined text-base animate-spin">
                progress_activity
              </span>
            )}
            {submitting ? 'Creating...' : 'Create Plan'}
          </button>
        </div>
      </form>
    </div>
  </div>
);

interface EditModalProps {
  form: {
    name: string;
    description: string;
    price: string;
    billingCycle: CreateSubscriptionPlanDto['billingCycle'];
    status: 'active' | 'inactive';
  };
  setForm: React.Dispatch<React.SetStateAction<EditModalProps['form']>>;
  formError: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const EditPlanModal: React.FC<EditModalProps> = ({
  form,
  setForm,
  formError,
  submitting,
  onClose,
  onSubmit,
}) => (
  <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
    <div className="bg-white w-full max-w-lg shadow-2xl">
      {/* Modal header */}
      <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
        <span className="text-[11px] font-bold uppercase tracking-widest text-white">
          EDIT SUBSCRIPTION PLAN
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-white/50 hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <form onSubmit={onSubmit} className="p-6 space-y-4">
        {/* Name */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] block mb-1.5">
            Plan Name <span className="text-[#ae001a]">*</span>
          </label>
          <input
            type="text"
            maxLength={100}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-4 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all"
            placeholder="e.g. Professional"
          />
          <p className="text-[10px] text-[#5f5e5e] mt-1 text-right">{form.name.length}/100</p>
        </div>

        {/* Description */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] block mb-1.5">
            Description <span className="text-[#ae001a]">*</span>
          </label>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full px-4 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all resize-none"
            placeholder="Describe what's included in this plan..."
          />
        </div>

        {/* Price + Billing Cycle */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] block mb-1.5">
              Price (USD) <span className="text-[#ae001a]">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-sm font-bold">
                $
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                className="w-full pl-7 pr-4 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all"
                placeholder="0.00"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] block mb-1.5">
              Billing Cycle <span className="text-[#ae001a]">*</span>
            </label>
            <select
              aria-label="Billing Cycle"
              value={form.billingCycle}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  billingCycle: e.target.value as CreateSubscriptionPlanDto['billingCycle'],
                }))
              }
              className="w-full px-3 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-sm focus:border-[#ae001a] outline-none"
            >
              {BILLING_CYCLES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] block mb-1.5">
            Status
          </label>
          <select
            aria-label="Status"
            value={form.status}
            onChange={(e) =>
              setForm((f) => ({ ...f, status: e.target.value as 'active' | 'inactive' }))
            }
            className="w-full px-3 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-sm focus:border-[#ae001a] outline-none"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Error */}
        {formError && (
          <div className="bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">error</span>
            {formError}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2 border border-[#e8e2d8] text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#930015] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && (
              <span className="material-symbols-outlined text-base animate-spin">
                progress_activity
              </span>
            )}
            {submitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  </div>
);

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
      {toast.type === 'success' ? 'check_circle' : 'error'}
    </span>
    {toast.message}
    <button
      type="button"
      onClick={onDismiss}
      className="ml-2 opacity-70 hover:opacity-100 transition-opacity"
    >
      <span className="material-symbols-outlined text-base">close</span>
    </button>
  </div>
);

interface DeletePlanDialogProps {
  plan: SubscriptionPlan;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const DeletePlanDialog: React.FC<DeletePlanDialogProps> = ({
  plan,
  submitting,
  onClose,
  onConfirm,
}) => (
  <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
    <div className="bg-white w-full max-w-md shadow-2xl">
      <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
        <span className="text-[11px] font-bold uppercase tracking-widest text-white">
          DELETE PLAN
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
        <p className="text-sm text-[#1d1c17]">
          {`Deleting "${plan.name}" will permanently prevent it from being used in any new subscriptions. The record is retained for historical analytics.`}
        </p>
        <div className="flex justify-end gap-3">
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
            onClick={onConfirm}
            disabled={submitting}
            className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && (
              <span className="material-symbols-outlined text-base animate-spin">
                progress_activity
              </span>
            )}
            {submitting ? 'Deleting...' : 'Delete Plan'}
          </button>
        </div>
      </div>
    </div>
  </div>
);

export default SubscriptionPlansView;
