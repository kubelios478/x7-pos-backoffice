import React, { useState, useEffect, useMemo } from 'react';
import { saasService } from '../../services/saasService';
import type { Application } from '../../types/subscription';

interface EditAppDialogProps {
  app: Application;
  submitting: boolean;
  onClose: () => void;
  onSave: (updates: { name: string; description: string; category: string }) => void;
}

const EditAppDialog: React.FC<EditAppDialogProps> = ({ app, submitting, onClose, onSave }) => {
  const [name, setName] = React.useState(app.name);
  const [description, setDescription] = React.useState(app.description);
  const [category, setCategory] = React.useState(app.category);

  const isValid = name.trim() !== '' && category.trim() !== '';

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg shadow-2xl">
        <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            EDIT APPLICATION
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
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-[#e8e2d8] bg-[#fef9f1] text-sm text-[#1d1c17] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all"
              placeholder="Application name"
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
              placeholder="Application description"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
              Category
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-[#e8e2d8] bg-[#fef9f1] text-sm text-[#1d1c17] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all"
              placeholder="e.g. POS Core, Utility, Kitchen Display"
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
              onClick={() => onSave({ name: name.trim(), description: description.trim(), category: category.trim() })}
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

interface RegisterAppDialogProps {
  submitting: boolean;
  onClose: () => void;
  onSave: (dto: { name: string; description: string; category: string; status: 'active' | 'inactive' }) => void;
}

const RegisterAppDialog: React.FC<RegisterAppDialogProps> = ({ submitting, onClose, onSave }) => {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [status, setStatus] = React.useState<'active' | 'inactive'>('active');

  const nameExceeded = name.length > 100;
  const categoryExceeded = category.length > 50;
  const isValid =
    name.trim() !== '' &&
    description.trim() !== '' &&
    category.trim() !== '' &&
    !nameExceeded &&
    !categoryExceeded;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg shadow-2xl">
        <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            REGISTER APPLICATION
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
              placeholder="Application name"
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
              placeholder="Application description"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                Category
              </label>
              <span className={`text-[11px] ${categoryExceeded ? 'text-[#ae001a] font-bold' : 'text-[#5f5e5e]'}`}>
                {category.length}/50
              </span>
            </div>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`w-full px-3 py-2 border bg-[#fef9f1] text-sm text-[#1d1c17] focus:ring-1 outline-none transition-all ${
                categoryExceeded
                  ? 'border-[#ae001a] focus:border-[#ae001a] focus:ring-[#ae001a]'
                  : 'border-[#e8e2d8] focus:border-[#ae001a] focus:ring-[#ae001a]'
              }`}
              placeholder="e.g. POS Core, Utility, Kitchen Display"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="register-status"
              className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]"
            >
              Status
            </label>
            <select
              id="register-status"
              aria-label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
              className="w-full px-3 py-2 border border-[#e8e2d8] bg-[#fef9f1] text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none transition-all"
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
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
              onClick={() => onSave({ name: name.trim(), description: description.trim(), category: category.trim(), status })}
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

interface DeactivateAppDialogProps {
  app: Application;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const DeactivateAppDialog: React.FC<DeactivateAppDialogProps> = ({
  app,
  submitting,
  onClose,
  onConfirm,
}) => (
  <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
    <div className="bg-white w-full max-w-md shadow-2xl">
      <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
        <span className="text-[11px] font-bold uppercase tracking-widest text-white">
          DEACTIVATE APPLICATION
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
          {`Deactivating "${app.name}" will affect all downstream subscription bundles (plan-applications) and operational storefront access points (subscription-applications). This application will no longer be distributed to new subscribers.`}
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
            {submitting ? 'Deactivating...' : 'Deactivate'}
          </button>
        </div>
      </div>
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

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export const PlatformApplicationsView: React.FC = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [togglingApp, setTogglingApp] = useState<Application | null>(null);
  const [toggleSubmitting, setToggleSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    saasService
      .getApplications()
      .then(setApplications)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const categories = useMemo(
    () => Array.from(new Set(applications.map((a) => a.category))).sort(),
    [applications],
  );

  const filtered = useMemo(
    () =>
      applications
        .filter(
          (a) =>
            searchTerm === '' ||
            fuzzyMatch(searchTerm, a.name) ||
            fuzzyMatch(searchTerm, a.description),
        )
        .filter((a) => categoryFilter === 'All Categories' || a.category === categoryFilter)
        .filter((a) => statusFilter === 'All Status' || a.status === statusFilter),
    [applications, searchTerm, categoryFilter, statusFilter],
  );

  const clearFilters = () => {
    setSearchTerm('');
    setCategoryFilter('All Categories');
    setStatusFilter('All Status');
  };

  const handleEditSave = async (updates: { name: string; description: string; category: string }) => {
    if (!editingApp) return;
    setEditSubmitting(true);
    try {
      const updated = await saasService.updateApplication(editingApp, updates);
      setApplications((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setEditingApp(null);
      setToast({ message: 'Application updated successfully', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update application';
      setEditingApp(null);
      if (msg === 'SESSION_EXPIRED') {
        setToast({ message: 'Session expired. Please refresh the page to sign in again.', type: 'error' });
      } else {
        setToast({ message: msg, type: 'error' });
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleCreateSave = async (dto: {
    name: string;
    description: string;
    category: string;
    status: 'active' | 'inactive';
  }) => {
    setCreateSubmitting(true);
    try {
      const newApp = await saasService.createApplication(dto);
      setApplications((prev) => [newApp, ...prev]);
      setIsCreating(false);
      setToast({ message: 'Application registered successfully', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to register application';
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

  const handleToggleConfirm = async () => {
    if (!togglingApp) return;
    setToggleSubmitting(true);
    try {
      const updated = await saasService.toggleApplicationInactive(togglingApp);
      setApplications((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setTogglingApp(null);
      setToast({ message: 'Application deactivated successfully', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to deactivate application';
      setTogglingApp(null);
      if (msg === 'SESSION_EXPIRED') {
        setToast({ message: 'Session expired. Please refresh the page to sign in again.', type: 'error' });
      } else {
        setToast({ message: msg, type: 'error' });
      }
    } finally {
      setToggleSubmitting(false);
    }
  };

  if (!loading && applications.length === 0) {
    return (
      <div
        data-testid="empty-state"
        className="flex flex-col items-center justify-center py-24 gap-6"
      >
        <span className="material-symbols-outlined text-[#5f5e5e]" style={{ fontSize: '72px' }}>
          inventory_2
        </span>
        <div className="text-center">
          <p className="text-sm text-[#5f5e5e] max-w-md text-center">
            No applications have been registered in the system. Click &apos;Register Application&apos; to deploy your first software module.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Filter Strip */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-5 flex flex-row justify-between items-center gap-4">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-lg">
            search
          </span>
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all font-[Poppins]"
            placeholder="Search applications..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <select
            data-testid="filter-category"
            aria-label="Filter by category"
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl text-sm focus:border-[#ae001a] outline-none font-[Poppins]"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="All Categories">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <select
            data-testid="filter-status"
            aria-label="Filter applications by state"
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl text-sm focus:border-[#ae001a] outline-none font-[Poppins]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All Status">All Status</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest rounded-xl hover:bg-[#f2ede5] transition-colors"
          >
            Clear filters
          </button>
          <button
            type="button"
            aria-label="Register Application"
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Register Application
          </button>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white border border-[#e8e2d8] overflow-hidden">
        <div className="px-4 py-3 bg-[#222222] flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            PLATFORM APPLICATION MASTER DIRECTORY
          </span>
          <span className="text-white/50 text-xs">
            {loading ? '...' : `${filtered.length} applications`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
              <tr>
                <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  App Name &amp; ID
                </th>
                <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  Description
                </th>
                <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  Category
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
                        No applications match your filtering criteria
                      </p>
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="text-[#ae001a] text-sm font-semibold hover:underline"
                      >
                        Reset filters
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((app) => (
                  <tr
                    key={app.id}
                    className={`group hover:bg-[#f8f3eb] transition-colors${app.status !== 'active' ? ' opacity-75' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-1 h-10 rounded-full flex-shrink-0 ${
                            app.status === 'active' ? 'bg-[#ae001a]' : 'bg-[#c8c6c5]'
                          }`}
                        />
                        <div>
                          <p className="font-bold text-[#1d1c17]">{app.name}</p>
                          <code className="font-mono text-[11px] text-[#5f5e5e] bg-[#f2ede5] px-1.5 py-0.5 rounded">
                            {app.id}
                          </code>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-[280px]">
                      <p className="text-sm text-[#5f5e5e] line-clamp-2">{app.description}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-[10px] font-bold uppercase text-[#5f5e5e] border border-[#e8e2d8] bg-[#f2ede5] px-2 py-0.5 rounded">
                        {app.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {app.status === 'active' ? (
                        <span className="bg-green-500/10 text-green-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                          active
                        </span>
                      ) : (
                        <span className="bg-[#5f5e5e]/20 text-[#5f5e5e] text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                          inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          aria-label={`Edit ${app.name}`}
                          onClick={() => setEditingApp(app)}
                          className="p-1 hover:text-[#ae001a] transition-colors"
                        >
                          <span className="material-symbols-outlined text-xl">edit</span>
                        </button>
                        {app.status === 'active' && (
                          <button
                            type="button"
                            aria-label={`Deactivate ${app.name}`}
                            onClick={() => setTogglingApp(app)}
                            className="p-1 hover:text-[#ae001a] transition-colors"
                          >
                            <span className="material-symbols-outlined text-xl">lock</span>
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

      <button
        type="button"
        aria-label="Open register-application form"
        onClick={() => setIsCreating(true)}
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] text-white rounded-full flex items-center justify-center shadow-xl hover:bg-[#930015] transition-all transform hover:scale-110 active:scale-95 z-50"
      >
        <span className="material-symbols-outlined text-3xl">add</span>
      </button>

      {isCreating && (
        <RegisterAppDialog
          submitting={createSubmitting}
          onClose={() => setIsCreating(false)}
          onSave={handleCreateSave}
        />
      )}

      {editingApp && (
        <EditAppDialog
          app={editingApp}
          submitting={editSubmitting}
          onClose={() => setEditingApp(null)}
          onSave={handleEditSave}
        />
      )}

      {togglingApp && (
        <DeactivateAppDialog
          app={togglingApp}
          submitting={toggleSubmitting}
          onClose={() => setTogglingApp(null)}
          onConfirm={handleToggleConfirm}
        />
      )}

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
};

export default PlatformApplicationsView;
