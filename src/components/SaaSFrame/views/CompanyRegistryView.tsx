import React, { useEffect, useMemo, useState } from 'react';
import { saasService } from '../../../services/saasService';
import type {
  CompanyRegistryItem,
  CompanyRegistryStatus,
} from '../../../types/company-registry';
import {
  ALL_COUNTRIES,
  buildCountryOptions,
  filterCompanies,
  formatFootprint,
  getBranchCount,
  getCompanyStatusBadgeClass,
  getCompanyStatusLabel,
  getCustomerCount,
  isCompanyActive,
} from '../../../lib/company-registry';
import {
  EMPTY_COMPANY_FORM,
  hasCompanyFormErrors,
  toCompanyPayload,
  validateCompanyForm,
  type CompanyFormFieldErrors,
  type CompanyFormValues,
} from '../../../lib/company-form-validation';
import {
  AppModal,
  FormField,
  ModalFormError,
  ModalFormFooter,
} from '../../MerchantFrame/shared/AppModal';
import { EmergencySupportModal } from '../../MerchantFrame/modals/QuickActionModals';
import {
  ConfirmStatusToggleDialog,
  StatusToggleButton,
} from '../../shared/StatusToggle';


type ModalMode = 'add' | 'edit';

interface CompanyRegistryViewProps {
  onNavigate?: (view: string) => void;
}

function companyToFormValues(company: CompanyRegistryItem): CompanyFormValues {
  return {
    name: company.name ?? '',
    rut: company.rut ?? '',
    email: company.email ?? '',
    phone: company.phone ?? '',
    address: company.address ?? '',
    city: company.city ?? '',
    state: company.state ?? '',
    country: company.country ?? '',
  };
}

const CompanyFormModal: React.FC<{
  mode: ModalMode;
  formValues: CompanyFormValues;
  fieldErrors: CompanyFormFieldErrors;
  formError: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onFieldChange: (field: keyof CompanyFormValues, value: string) => void;
}> = ({
  mode,
  formValues,
  fieldErrors,
  formError,
  isSubmitting,
  onClose,
  onSubmit,
  onFieldChange,
}) => (
  <AppModal
    title={mode === 'add' ? 'Add Company' : 'Edit Company'}
    subtitle="Global Company Registry"
    titleId="company-form-title"
    onClose={onClose}
    closeDisabled={isSubmitting}
    closeAriaLabel="Close company form"
  >
    <form onSubmit={onSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
      {formError ? <ModalFormError message={formError} /> : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          id="company-name"
          label="Company Name"
          value={formValues.name}
          error={fieldErrors.name}
          onChange={(value) => onFieldChange('name', value)}
          placeholder="Acme Corp"
          required
        />
        <FormField
          id="company-rut"
          label="Tax ID (RUT)"
          value={formValues.rut}
          error={fieldErrors.rut}
          onChange={(value) => onFieldChange('rut', value)}
          placeholder="12.345.678-9"
          required
        />
        <FormField
          id="company-email"
          label="Corporate Email"
          value={formValues.email}
          error={fieldErrors.email}
          onChange={(value) => onFieldChange('email', value)}
          placeholder="contact@acme.com"
          type="email"
          required
        />
        <FormField
          id="company-phone"
          label="Phone"
          value={formValues.phone}
          error={fieldErrors.phone}
          onChange={(value) => onFieldChange('phone', value)}
          placeholder="+1 (555) 123-4567"
          type="tel"
          required
        />
      </div>

      <FormField
        id="company-address"
        label="Address"
        value={formValues.address}
        error={fieldErrors.address}
        onChange={(value) => onFieldChange('address', value)}
        placeholder="123 Main Street, Suite 100"
        required
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField
          id="company-city"
          label="City"
          value={formValues.city}
          error={fieldErrors.city}
          onChange={(value) => onFieldChange('city', value)}
          placeholder="Miami"
          required
        />
        <FormField
          id="company-state"
          label="State"
          value={formValues.state}
          error={fieldErrors.state}
          onChange={(value) => onFieldChange('state', value)}
          placeholder="Florida"
          required
        />
        <FormField
          id="company-country"
          label="Country"
          value={formValues.country}
          error={fieldErrors.country}
          onChange={(value) => onFieldChange('country', value)}
          placeholder="USA"
          required
        />
      </div>

      <ModalFormFooter
        onCancel={onClose}
        submitLabel={
          isSubmitting
            ? 'Saving…'
            : mode === 'add'
              ? 'Create Company'
              : 'Save Changes'
        }
        isSubmitting={isSubmitting}
      />
    </form>
  </AppModal>
);

export const CompanyRegistryView: React.FC<CompanyRegistryViewProps> = ({
  onNavigate,
}) => {
  const [companies, setCompanies] = useState<CompanyRegistryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [countryFilter, setCountryFilter] = useState(ALL_COUNTRIES);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('add');
  const [editingCompany, setEditingCompany] =
    useState<CompanyRegistryItem | null>(null);
  const [formValues, setFormValues] =
    useState<CompanyFormValues>(EMPTY_COMPANY_FORM);
  const [fieldErrors, setFieldErrors] = useState<CompanyFormFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [toggleTarget, setToggleTarget] =
    useState<CompanyRegistryItem | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  const [isSupportOpen, setIsSupportOpen] = useState(false);

  const loadCompanies = () => {
    setIsLoading(true);
    setFetchError(false);
    saasService
      .listCompanies()
      .then(setCompanies)
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : 'Failed to load companies';
        setFetchError(true);
        setToast({
          message:
            message === 'SESSION_EXPIRED'
              ? 'Session expired. Please refresh the page to sign in again.'
              : message,
          type: 'error',
        });
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const countryOptions = useMemo(
    () => buildCountryOptions(companies),
    [companies],
  );

  const filteredCompanies = useMemo(
    () => filterCompanies(companies, searchQuery, countryFilter),
    [companies, searchQuery, countryFilter],
  );

  const isFilteredEmpty =
    !isLoading &&
    !fetchError &&
    companies.length > 0 &&
    filteredCompanies.length === 0;

  const openAddModal = () => {
    setModalMode('add');
    setEditingCompany(null);
    setFormValues(EMPTY_COMPANY_FORM);
    setFieldErrors({});
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (company: CompanyRegistryItem) => {
    setModalMode('edit');
    setEditingCompany(company);
    setFormValues(companyToFormValues(company));
    setFieldErrors({});
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeFormModal = () => {
    if (isSubmitting) return;
    setIsFormOpen(false);
    setEditingCompany(null);
    setFormValues(EMPTY_COMPANY_FORM);
    setFieldErrors({});
    setFormError(null);
  };

  const updateField = (field: keyof CompanyFormValues, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const errors = validateCompanyForm(formValues);
    setFieldErrors(errors);
    if (hasCompanyFormErrors(errors)) return;

    setIsSubmitting(true);
    try {
      const payload = toCompanyPayload(formValues);
      if (modalMode === 'add') {
        await saasService.createCompany(payload);
        setToast({ message: 'Company provisioned successfully', type: 'success' });
      } else if (editingCompany) {
        await saasService.updateCompany(editingCompany.id, payload);
        setToast({ message: 'Company updated successfully', type: 'success' });
      }
      closeFormModal();
      loadCompanies();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Failed to save company. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmToggle = async () => {
    if (!toggleTarget) return;
    const nextStatus: CompanyRegistryStatus = isCompanyActive(toggleTarget)
      ? 'inactive'
      : 'active';

    setIsTogglingStatus(true);
    try {
      await saasService.setCompanyStatus(toggleTarget.id, nextStatus);
      setToast({
        message:
          nextStatus === 'active'
            ? 'Company reactivated successfully'
            : 'Company suspended successfully',
        type: 'success',
      });
      setToggleTarget(null);
      loadCompanies();
    } catch (err) {
      setToast({
        message:
          err instanceof Error
            ? err.message
            : 'Failed to update company status',
        type: 'error',
      });
      setToggleTarget(null);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Dark Title Card (AC 2) */}
      <div className="bg-[#222222] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-widest text-white">
          GLOBAL COMPANY REGISTRY
        </span>
        <span className="text-white/50 text-xs">
          {isLoading ? '...' : `${companies.length} tenants`}
        </span>
      </div>

      {/* Empty State (no companies at all — AC 4) */}
      {!isLoading && !fetchError && companies.length === 0 && (
        <div
          data-testid="empty-state"
          className="flex flex-col items-center justify-center py-24 gap-6 bg-white border border-[#e8e2d8]"
        >
          <span className="material-symbols-outlined text-[#5f5e5e] text-[72px]">
            corporate_fare
          </span>
          <div className="text-center">
            <h3 className="text-xl font-bold text-[#1d1c17]">No Active Companies</h3>
            <p className="text-sm text-[#5f5e5e] mt-2 max-w-md text-center">
              The platform has no active companies. Click &apos;Add Company&apos;
              to provision your first client tenant.
            </p>
          </div>
          <button
            type="button"
            onClick={openAddModal}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            ADD COMPANY
          </button>
        </div>
      )}

      {/* Registry Table */}
      {(isLoading || companies.length > 0) && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden">
          {/* Filter Controls Row (AC 1) */}
          {!isLoading && (
            <div className="px-4 py-3 border-b border-[#e8e2d8] bg-[#f8f3eb] flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search by company name or RUT…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-[#e8e2d8] bg-white text-[#1d1c17] placeholder:text-[#5f5e5e] focus:outline-none focus:border-[#ae001a]"
                />
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="country-filter"
                  className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap"
                >
                  Country / Region
                </label>
                <select
                  id="country-filter"
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                  className="text-sm border border-[#e8e2d8] bg-white text-[#1d1c17] px-3 py-2 focus:outline-none focus:border-[#ae001a] min-w-[160px]"
                >
                  {countryOptions.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={openAddModal}
                className="px-4 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-base">add</span>
                ADD COMPANY
              </button>
            </div>
          )}

          {/* Empty filter result (AC 3) */}
          {isFilteredEmpty && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <span className="material-symbols-outlined text-[#5f5e5e] text-[48px]">
                filter_alt_off
              </span>
              <p className="text-sm font-semibold text-[#5f5e5e]">
                No corporate entities match your global search criteria
              </p>
            </div>
          )}

          {!isFilteredEmpty && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                  <tr>
                    <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                      Company Name
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                      Tax ID (RUT)
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                      Corporate Contact
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                      Global Footprint
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                      Ecosystem Scale
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
                  {isLoading
                    ? [1, 2, 3].map((i) => (
                        <tr key={i}>
                          {[40, 24, 40, 40, 24, 16, 16].map((w, idx) => (
                            <td key={idx} className="px-6 py-4">
                              <div
                                className="h-4 bg-[#ece8e0] rounded animate-pulse"
                                style={{ width: `${w * 4}px` }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))
                    : filteredCompanies.map((company) => {
                        const active = isCompanyActive(company);
                        return (
                          <tr
                            key={company.id}
                            className={`group hover:bg-[#f8f3eb] transition-colors ${
                              active ? '' : 'opacity-75'
                            }`}
                          >
                            <td className="px-6 py-4">
                              <p className="font-bold text-[#1d1c17]">
                                {company.name}
                              </p>
                              <code className="font-mono text-[11px] text-[#5f5e5e] bg-[#f2ede5] px-1.5 py-0.5 rounded">
                                ID: {company.id}
                              </code>
                            </td>
                            <td className="px-6 py-4 text-sm text-[#1d1c17]">
                              {company.rut?.trim() || '—'}
                            </td>
                            <td className="px-6 py-4 text-sm text-[#1d1c17]">
                              <p>{company.email?.trim() || '—'}</p>
                              <p className="text-[#5f5e5e]">
                                {company.phone?.trim() || '—'}
                              </p>
                            </td>
                            <td className="px-6 py-4 text-sm text-[#1d1c17]">
                              {formatFootprint(company) || '—'}
                            </td>
                            <td className="px-6 py-4 text-sm text-[#1d1c17]">
                              <p>
                                <span className="font-bold">
                                  {getBranchCount(company)}
                                </span>{' '}
                                <span className="text-[#5f5e5e]">Branches</span>
                              </p>
                              <p>
                                <span className="font-bold">
                                  {getCustomerCount(company)}
                                </span>{' '}
                                <span className="text-[#5f5e5e]">B2B Clients</span>
                              </p>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getCompanyStatusBadgeClass(company.status)}`}
                              >
                                {getCompanyStatusLabel(company.status)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex justify-center gap-1 opacity-30 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  aria-label={`Edit ${company.name}`}
                                  onClick={() => openEditModal(company)}
                                  className="text-[#5f5e5e] hover:text-[#ae001a] transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[20px]">
                                    edit
                                  </span>
                                </button>
                                <StatusToggleButton
                                  status={active ? 'active' : 'inactive'}
                                  entityLabel={company.name}
                                  onClick={() => setToggleTarget(company)}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Quick Launch (AC) */}
      <div className="bg-[#2a2a2a] rounded-xl p-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="text-center md:text-left">
          <h3 className="!text-white font-bold text-lg">Quick Launch</h3>
          <p className="text-white/60 text-sm mt-1 max-w-md">
            Platform-wide administrative operations — pivot to subscription
            metrics, global logs, or master configuration seeds.
          </p>
        </div>
        <div className="flex flex-wrap justify-center md:justify-end gap-3">
          <button
            type="button"
            onClick={() => onNavigate?.('subscription')}
            className="quick-launch-btn px-6 py-3 bg-white text-[#1d1c17] font-bold text-label-caps border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-all"
          >
            SAAS BILLING &amp; PLANS
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('reports')}
            className="quick-launch-btn px-6 py-3 bg-white text-[#1d1c17] font-bold text-label-caps border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-all"
          >
            SYSTEM AUDIT LOGS
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('subscription-features')}
            className="quick-launch-btn px-6 py-3 bg-white text-[#1d1c17] font-bold text-label-caps border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-all"
          >
            CONFIG TEMPLATES SEED
          </button>
          <button
            type="button"
            onClick={() => setIsSupportOpen(true)}
            className="px-6 py-3 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#930015] hover:-translate-y-0.5 transition-all rounded"
          >
            EMERGENCY SUPPORT
          </button>
        </div>
      </div>

      {/* FAB */}
      {!fetchError && (
        <button
          type="button"
          aria-label="Add company"
          onClick={openAddModal}
          className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] text-white rounded-full flex items-center justify-center shadow-xl hover:bg-[#930015] transition-all transform hover:scale-110 active:scale-95 z-50"
        >
          <span className="material-symbols-outlined text-3xl">add</span>
        </button>
      )}

      {isFormOpen && (
        <CompanyFormModal
          mode={modalMode}
          formValues={formValues}
          fieldErrors={fieldErrors}
          formError={formError}
          isSubmitting={isSubmitting}
          onClose={closeFormModal}
          onSubmit={(event) => void handleFormSubmit(event)}
          onFieldChange={updateField}
        />
      )}

      {toggleTarget && (
        <ConfirmStatusToggleDialog
          entityName={toggleTarget.name}
          direction={isCompanyActive(toggleTarget) ? 'deactivate' : 'activate'}
          submitting={isTogglingStatus}
          description={
            isCompanyActive(toggleTarget)
              ? `Suspending "${toggleTarget.name}" will immediately block access for all linked child merchants, app users, and active POS terminals. Historical transaction data is preserved for audits.`
              : `Reactivating "${toggleTarget.name}" will restore platform privileges and merchant operations.`
          }
          onConfirm={() => void handleConfirmToggle()}
          onClose={() => setToggleTarget(null)}
        />
      )}

      <EmergencySupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />

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

export default CompanyRegistryView;
