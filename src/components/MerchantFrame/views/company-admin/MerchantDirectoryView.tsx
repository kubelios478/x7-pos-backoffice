import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createCompanyMerchant,
  deactivateCompanyMerchant,
  getCompanyMerchants,
  getMerchantAdminSummary,
  updateCompanyMerchant,
} from '../../../../api/merchants';
import { ApiError } from '../../../../lib/api-error';
import {
  MERCHANT_BRANCH_ACTION_TARGETS,
  MERCHANT_QUICK_LAUNCH_TARGETS,
  navigateToDashboardFeature,
} from '../../../../lib/merchant-directory-navigation';
import {
  ALL_REGIONS,
  buildRegionOptions,
  filterMerchants,
  formatMerchantLocation,
  formatStatusLabel,
  getStatusBadgeClass,
} from '../../../../lib/merchant-directory';
import {
  EMPTY_MERCHANT_FORM,
  hasMerchantFormErrors,
  toMerchantPayload,
  validateMerchantForm,
  type MerchantFormFieldErrors,
  type MerchantFormValues,
} from '../../../../lib/merchant-form-validation';
import type { CompanyMerchant, MerchantAdminSummary } from '../../../../types/merchant';
import { EmergencySupportModal } from '../../modals/QuickActionModals';
import { MerchantBranchSummaryModal } from '../../shared/MerchantBranchSummaryModal';
import { QuickLaunchPanel } from '../../shared/QuickLaunchPanel';
import { MerchantEditModal } from '../../shared/MerchantEditModal';
import { AppModal, ModalFormFooter } from '../../shared/AppModal';

type ModalMode = 'add' | 'edit';

function merchantToFormValues(merchant: CompanyMerchant): MerchantFormValues {
  return {
    name: merchant.name ?? '',
    rut: merchant.rut ?? '',
    email: merchant.email ?? '',
    phone: merchant.phone ?? '',
    address: merchant.address ?? '',
    city: merchant.city ?? '',
    state: merchant.state ?? '',
    country: merchant.country ?? '',
  };
}

export const MerchantDirectoryView: React.FC = () => {
  const navigate = useNavigate();
  const [merchants, setMerchants] = useState<CompanyMerchant[]>([]);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState(ALL_REGIONS);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('add');
  const [editingMerchant, setEditingMerchant] = useState<CompanyMerchant | null>(
    null,
  );
  const [formValues, setFormValues] =
    useState<MerchantFormValues>(EMPTY_MERCHANT_FORM);
  const [fieldErrors, setFieldErrors] = useState<MerchantFormFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [deactivateTarget, setDeactivateTarget] =
    useState<CompanyMerchant | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const [summaryMerchant, setSummaryMerchant] =
    useState<CompanyMerchant | null>(null);
  const [branchSummary, setBranchSummary] =
    useState<MerchantAdminSummary | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  const loadMerchants = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { merchants: data, meta } = await getCompanyMerchants();
      setMerchants(data);
      setCompanyId(meta.companyId);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to load merchants. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadMerchants();
  }, []);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const regionOptions = useMemo(
    () => buildRegionOptions(merchants),
    [merchants],
  );

  const filteredMerchants = useMemo(
    () => filterMerchants(merchants, searchQuery, regionFilter),
    [merchants, searchQuery, regionFilter],
  );

  const hasActiveFilters =
    searchQuery.trim().length > 0 || regionFilter !== ALL_REGIONS;

  const openAddModal = () => {
    setModalMode('add');
    setEditingMerchant(null);
    setFormValues(EMPTY_MERCHANT_FORM);
    setFieldErrors({});
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (merchant: CompanyMerchant) => {
    setModalMode('edit');
    setEditingMerchant(merchant);
    setFormValues(merchantToFormValues(merchant));
    setFieldErrors({});
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeFormModal = () => {
    if (isSubmitting) return;
    setIsFormOpen(false);
    setEditingMerchant(null);
    setFormValues(EMPTY_MERCHANT_FORM);
    setFieldErrors({});
    setFormError(null);
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const errors = validateMerchantForm(formValues);
    setFieldErrors(errors);
    if (hasMerchantFormErrors(errors)) return;

    if (modalMode === 'add' && !companyId) {
      setFormError('Unable to resolve company context. Please reload the page.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = toMerchantPayload(formValues);

      if (modalMode === 'add') {
        await createCompanyMerchant(payload);
        setSuccessMessage('Merchant branch created successfully.');
      } else if (editingMerchant) {
        await updateCompanyMerchant(editingMerchant.id, payload);
        setSuccessMessage('Merchant branch updated successfully.');
      }

      closeFormModal();
      await loadMerchants();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Failed to save merchant. Please try again.';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget) return;

    setIsDeactivating(true);
    try {
      await deactivateCompanyMerchant(deactivateTarget.id);
      setSuccessMessage(
        `${deactivateTarget.name} has been deactivated successfully.`,
      );
      setDeactivateTarget(null);
      await loadMerchants();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Failed to deactivate merchant. Please try again.';
      setError(message);
      setDeactivateTarget(null);
    } finally {
      setIsDeactivating(false);
    }
  };

  const updateField = (field: keyof MerchantFormValues, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const openBranchSummary = async (merchant: CompanyMerchant) => {
    setSummaryMerchant(merchant);
    setBranchSummary(null);
    setSummaryError(null);
    setIsSummaryLoading(true);

    try {
      const summary = await getMerchantAdminSummary(merchant.id);
      setBranchSummary(summary);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to load branch summary. Please try again.';
      setSummaryError(message);
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const closeBranchSummary = () => {
    setSummaryMerchant(null);
    setBranchSummary(null);
    setSummaryError(null);
  };

  const handleManageBranchStaff = () => {
    if (!summaryMerchant) return;
    navigateToDashboardFeature(navigate, {
      ...MERCHANT_BRANCH_ACTION_TARGETS.manageBranchStaff,
      merchantId: summaryMerchant.id,
    });
  };

  const handleManageStoreLocations = () => {
    if (!summaryMerchant) return;
    navigateToDashboardFeature(navigate, {
      ...MERCHANT_BRANCH_ACTION_TARGETS.manageStoreLocations,
      merchantId: summaryMerchant.id,
    });
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left relative">
      {successMessage && (
        <div
          className="p-4 border border-emerald-300 bg-emerald-50 rounded-lg text-body-sm text-emerald-800 flex items-center gap-2"
          role="status"
        >
          <span className="material-symbols-outlined text-emerald-700">check_circle</span>
          {successMessage}
        </div>
      )}

      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative w-full md:w-96">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md transition-all"
            placeholder="Search branches by name..."
          />
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <select
            value={regionFilter}
            onChange={(event) => setRegionFilter(event.target.value)}
            className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[180px]"
          >
            {regionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={openAddModal}
            className="bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            ADD MERCHANT
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white border border-[#e8e2d8] p-12 text-center rounded shadow-sm">
          <span className="material-symbols-outlined animate-spin text-primary text-4xl">
            sync
          </span>
          <p className="text-secondary text-body-md mt-2 font-sans">
            Loading merchant directory...
          </p>
        </div>
      ) : error ? (
        <div className="bg-white border border-[#e8e2d8] p-12 text-center rounded shadow-sm">
          <span className="material-symbols-outlined text-[#ba1a1a] text-4xl">
            error
          </span>
          <p className="text-[#ba1a1a] font-bold mt-2 font-sans">{error}</p>
          <button
            type="button"
            onClick={() => void loadMerchants()}
            className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans"
          >
            Retry Connection
          </button>
        </div>
      ) : merchants.length === 0 ? (
        <div className="bg-white border border-[#e8e2d8] p-12 text-center rounded shadow-sm">
          <span className="material-symbols-outlined text-[#5f5e5e] text-5xl">
            store
          </span>
          <p className="text-[#1d1c17] font-bold mt-4 max-w-2xl mx-auto">
            No merchants found for this company. Click &apos;Add Merchant&apos; to
            establish your first store branch.
          </p>
          <button
            type="button"
            onClick={openAddModal}
            className="mt-6 bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            ADD MERCHANT
          </button>
        </div>
      ) : (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-label-caps font-bold text-white uppercase tracking-wider">
              MERCHANT DIRECTORY
            </span>
            <span className="material-symbols-outlined text-white text-sm">
              more_vert
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">
                    Merchant Name
                  </th>
                  <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">
                    Tax Identification (RUT)
                  </th>
                  <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">
                    Contact Details
                  </th>
                  <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">
                    Location Info
                  </th>
                  <th className="px-6 py-3 text-center text-label-caps font-bold text-[#5f5e5e]">
                    Operational Status
                  </th>
                  <th className="px-6 py-3 text-right text-label-caps font-bold text-[#5f5e5e]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {filteredMerchants.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center">
                      <div className="flex flex-col items-center gap-2 text-secondary">
                        <span className="material-symbols-outlined text-3xl">
                          search_off
                        </span>
                        <p className="font-medium">
                          No branches found matching your search parameters
                        </p>
                        {hasActiveFilters && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery('');
                              setRegionFilter(ALL_REGIONS);
                            }}
                            className="text-[#ae001a] font-bold text-label-caps hover:underline"
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredMerchants.map((merchant) => (
                    <tr
                      key={merchant.id}
                      className="group hover:bg-[#f8f3eb] transition-colors cursor-pointer"
                      onClick={() => void openBranchSummary(merchant)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-1 h-8 bg-[#ae001a] rounded-full" />
                          <div>
                            <p className="font-bold text-[#1d1c17]">
                              {merchant.name}
                            </p>
                            <p className="text-body-sm text-secondary">
                              ID: {merchant.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-body-md text-[#1d1c17]">
                        {merchant.rut?.trim() || '—'}
                      </td>
                      <td className="px-6 py-4 text-body-md text-[#1d1c17]">
                        <p>{merchant.email?.trim() || '—'}</p>
                        <p className="text-body-sm text-secondary">
                          {merchant.phone?.trim() || '—'}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-body-md text-[#1d1c17]">
                        {formatMerchantLocation(merchant) || '—'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-label-caps font-bold ${getStatusBadgeClass(merchant.status)}`}
                        >
                          {formatStatusLabel(merchant.status)}
                        </span>
                      </td>
                      <td
                        className="px-6 py-4 text-right"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex justify-end gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => openEditModal(merchant)}
                            className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                            title="Edit merchant"
                          >
                            <span className="material-symbols-outlined text-[20px]">
                              edit
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeactivateTarget(merchant)}
                            disabled={merchant.status === 'inactive'}
                            className="p-1 text-[#1d1c17] hover:text-[#ba1a1a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Deactivate merchant"
                          >
                            <span className="material-symbols-outlined text-[20px]">
                              block
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

      <QuickLaunchPanel
        description="Corporate administrative shortcuts to pivot across global settings, multi-store analytics, and staff assignment without leaving branch context."
        actions={[
          {
            id: 'company-global-settings',
            label: 'COMPANY GLOBAL SETTINGS',
            onClick: () =>
              navigateToDashboardFeature(
                navigate,
                MERCHANT_QUICK_LAUNCH_TARGETS.companyGlobalSettings,
              ),
          },
          {
            id: 'multi-store-dashboard',
            label: 'MULTI-STORE DASHBOARD',
            onClick: () =>
              navigateToDashboardFeature(
                navigate,
                MERCHANT_QUICK_LAUNCH_TARGETS.multiStoreDashboard,
              ),
          },
          {
            id: 'assign-staff-roles',
            label: 'ASSIGN STAFF & ROLES',
            onClick: () =>
              navigateToDashboardFeature(
                navigate,
                MERCHANT_QUICK_LAUNCH_TARGETS.assignStaffRoles,
              ),
          },
          {
            id: 'emergency-support',
            label: 'EMERGENCY SUPPORT',
            variant: 'danger',
            onClick: () => setIsSupportOpen(true),
          },
        ]}
      />

      {!isLoading && merchants.length > 0 && (
        <button
          type="button"
          onClick={openAddModal}
          className="fixed bottom-8 right-8 z-40 w-14 h-14 rounded-full bg-[#ae001a] text-white shadow-lg hover:bg-[#d2272f] transition-colors flex items-center justify-center"
          aria-label="Add merchant"
        >
          <span className="material-symbols-outlined text-3xl">add</span>
        </button>
      )}

      {isFormOpen ? (
        <MerchantEditModal
          mode={modalMode}
          formValues={formValues}
          fieldErrors={fieldErrors}
          formError={formError}
          isSubmitting={isSubmitting}
          onClose={closeFormModal}
          onSubmit={(event) => void handleFormSubmit(event)}
          onFieldChange={updateField}
        />
      ) : null}

      {deactivateTarget ? (
        <AppModal
          title="Deactivate Branch"
          size="md"
          onClose={() => setDeactivateTarget(null)}
          closeDisabled={isDeactivating}
          closeAriaLabel="Close dialog"
        >
          <div className="p-6 space-y-4">
            <p className="text-body-md text-[#1d1c17]">
              Deactivating <strong>{deactivateTarget.name}</strong> may affect
              linked operations such as orders, shifts, and active products.
              This branch will no longer be available for POS operations.
            </p>
            <p className="text-body-sm text-secondary">
              Are you sure you want to deactivate this merchant branch?
            </p>
            <ModalFormFooter
              onCancel={() => setDeactivateTarget(null)}
              submitLabel={isDeactivating ? 'Deactivating...' : 'Deactivate Branch'}
              isSubmitting={isDeactivating}
              submitType="button"
              onSubmit={() => void handleConfirmDeactivate()}
              destructive
            />
          </div>
        </AppModal>
      ) : null}

      {summaryMerchant && (
        <MerchantBranchSummaryModal
          merchant={summaryMerchant}
          summary={branchSummary}
          isLoading={isSummaryLoading}
          error={summaryError}
          onClose={closeBranchSummary}
          onManageBranchStaff={handleManageBranchStaff}
          onManageStoreLocations={handleManageStoreLocations}
        />
      )}

      <EmergencySupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />
    </div>
  );
};
