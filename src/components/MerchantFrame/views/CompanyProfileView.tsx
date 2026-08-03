import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCompanyProfile, updateCompanyProfile } from '../../../api/companies';
import { ApiError } from '../../../lib/api-error';
import {
  COMPANY_PROFILE_QUICK_LAUNCH_TARGETS,
  navigateFromCompanyProfile,
} from '../../../lib/company-profile-navigation';
import {
  EMPTY_COMPANY_FORM,
  hasCompanyFormErrors,
  toCompanyPayload,
  validateCompanyForm,
  type CompanyFormFieldErrors,
  type CompanyFormValues,
} from '../../../lib/company-form-validation';
import type { CompanyProfile } from '../../../types/company';
import { EmergencySupportModal } from '../modals/QuickActionModals';
import { CompanyProfileEditModal } from '../shared/CompanyProfileEditModal';
import { QuickLaunchPanel } from '../shared/QuickLaunchPanel';

function profileToFormValues(profile: CompanyProfile): CompanyFormValues {
  return {
    name: profile.name ?? '',
    rut: profile.rut ?? '',
    email: profile.email ?? '',
    phone: profile.phone?.trim() ?? '',
    address: profile.address ?? '',
    city: profile.city ?? '',
    state: profile.state ?? '',
    country: profile.country ?? '',
  };
}

export const CompanyProfileView: React.FC = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [formValues, setFormValues] =
    useState<CompanyFormValues>(EMPTY_COMPANY_FORM);
  const [fieldErrors, setFieldErrors] = useState<CompanyFormFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  const loadProfile = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await getCompanyProfile();
      setProfile(data);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to load company profile. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const openEditModal = () => {
    if (!profile) return;
    setFormValues(profileToFormValues(profile));
    setFieldErrors({});
    setFormError(null);
    setIsEditOpen(true);
  };

  const closeEditModal = () => {
    if (isSubmitting) return;
    setIsEditOpen(false);
    setFieldErrors({});
    setFormError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const errors = validateCompanyForm(formValues);
    setFieldErrors(errors);
    if (hasCompanyFormErrors(errors)) return;

    setIsSubmitting(true);
    try {
      const payload = toCompanyPayload(formValues);
      const updated = await updateCompanyProfile(payload);
      setProfile(updated);
      setSuccessMessage('Company profile updated successfully.');
      closeEditModal();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Failed to update company profile. Please try again.';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
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

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
      {successMessage && (
        <div
          className="p-4 border border-emerald-300 bg-emerald-50 rounded-lg text-body-sm text-emerald-800 flex items-center gap-2"
          role="status"
        >
          <span className="material-symbols-outlined text-emerald-700">
            check_circle
          </span>
          {successMessage}
        </div>
      )}

      {isLoading ? (
        <div className="bg-white border border-[#e8e2d8] p-12 text-center rounded shadow-sm">
          <span className="material-symbols-outlined animate-spin text-primary text-4xl">
            sync
          </span>
          <p className="text-secondary text-body-md mt-2 font-sans">
            Loading company profile...
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
            onClick={() => void loadProfile()}
            className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans"
          >
            Retry Connection
          </button>
        </div>
      ) : profile ? (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="bg-[#222222] p-4 flex justify-between items-center gap-4">
            <span className="text-label-caps font-bold text-white uppercase tracking-wider">
              COMPANY MASTER PROFILE
            </span>
            <button
              type="button"
              onClick={openEditModal}
              className="bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors shrink-0"
            >
              EDIT PROFILE
            </button>
          </div>

          <div className="p-8 space-y-6">
            <div className="border border-[#e8e2d8] rounded-lg bg-[#f9f7f4] p-6">
              <p className="text-label-caps text-secondary tracking-widest mb-2">
                Corporate Identity
              </p>
              <h2 className="text-3xl font-black text-[#1d1c17] leading-tight">
                {profile.name}
              </h2>
              <div className="flex flex-wrap items-center gap-3 mt-4">
                <IdentityBadge icon="badge" label={`Company ID: ${profile.id}`} />
                <IdentityBadge icon="description" label={`RUT: ${profile.rut}`} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <MetricTile
                label="Total Active Merchant Branches"
                value={profile.metrics.activeMerchantBranches}
                icon="store"
              />
              <MetricTile
                label="Global Corporate Customers"
                value={profile.metrics.globalCorporateCustomers}
                icon="groups"
              />
              <MetricTile
                label="Authorized Master Suppliers"
                value={profile.metrics.authorizedMasterSuppliers}
                icon="local_shipping"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ProfilePanel title="Contact Channels" icon="contact_mail">
                <InfoRow label="Email" value={profile.email} />
                <InfoRow label="Phone" value={profile.phone?.trim() || '—'} />
              </ProfilePanel>

              <ProfilePanel title="Headquarters Localization" icon="location_on">
                <InfoRow label="Address" value={profile.address} />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <InfoRow label="City" value={profile.city} />
                  <InfoRow label="State" value={profile.state} />
                  <InfoRow label="Country" value={profile.country} />
                </div>
              </ProfilePanel>
            </div>
          </div>
        </div>
      ) : null}

      <QuickLaunchPanel
        description="One-click access to system settings, master suppliers, and your corporate customer directory."
        actions={[
          {
            id: 'system-global-configs',
            label: 'SYSTEM GLOBAL CONFIGS',
            onClick: () =>
              navigateFromCompanyProfile(
                navigate,
                COMPANY_PROFILE_QUICK_LAUNCH_TARGETS.systemGlobalConfigs,
              ),
          },
          {
            id: 'master-suppliers-hub',
            label: 'MASTER SUPPLIERS HUB',
            onClick: () =>
              navigateFromCompanyProfile(
                navigate,
                COMPANY_PROFILE_QUICK_LAUNCH_TARGETS.masterSuppliersHub,
              ),
          },
          {
            id: 'global-customer-index',
            label: 'GLOBAL CUSTOMER INDEX',
            onClick: () =>
              navigateFromCompanyProfile(
                navigate,
                COMPANY_PROFILE_QUICK_LAUNCH_TARGETS.globalCustomerIndex,
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

      {isEditOpen && (
        <CompanyProfileEditModal
          formValues={formValues}
          fieldErrors={fieldErrors}
          formError={formError}
          isSubmitting={isSubmitting}
          onClose={closeEditModal}
          onSubmit={(e) => void handleSubmit(e)}
          onFieldChange={updateField}
        />
      )}

      <EmergencySupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />
    </div>
  );
};

function ProfilePanel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[#e8e2d8] rounded-lg bg-[#f9f7f4] p-5 h-full">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#e8e2d8]">
        <span className="material-symbols-outlined text-[#ae001a] text-xl">
          {icon}
        </span>
        <h3 className="text-label-caps font-bold text-[#5f5e5e]">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function IdentityBadge({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#e8e2d8] text-body-sm text-[#1d1c17] font-medium">
      <span className="material-symbols-outlined text-[#ae001a] text-base">
        {icon}
      </span>
      {label}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-1">
        {label}
      </p>
      <p className="text-body-md text-[#1d1c17] font-semibold break-words">
        {value || '—'}
      </p>
    </div>
  );
}

function MetricTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: string;
}) {
  return (
    <div className="border border-[#e8e2d8] rounded p-4 text-center bg-[#f9f7f4]">
      <span className="material-symbols-outlined text-[#ae001a] text-2xl">
        {icon}
      </span>
      <p className="text-2xl font-black text-[#1d1c17] mt-2">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mt-1">
        {label}
      </p>
    </div>
  );
}
