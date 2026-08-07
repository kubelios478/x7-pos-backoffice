import React from 'react';
import type { MerchantUser, UserHrSummary } from '../../../types/user';
import {
  formatEnumLabel,
  getUserStatusBadgeClass,
  getUserStatusLabel,
} from '../../../lib/user-directory';
import { AppModal } from '../shared/AppModal';

type UserHrSummaryModalProps = {
  user: MerchantUser;
  summary: UserHrSummary | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onLinkHrProfile: () => void;
};

const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider">
      {label}
    </span>
    <span className="text-body-md text-[#1d1c17]">{value}</span>
  </div>
);

export const UserHrSummaryModal: React.FC<UserHrSummaryModalProps> = ({
  user,
  summary,
  isLoading,
  error,
  onClose,
  onLinkHrProfile,
}) => {
  const collaborators = summary?.collaborators ?? [];
  const hasCollaborators = collaborators.length > 0;

  return (
    <AppModal
      title={user.username?.trim() || user.email}
      subtitle="User Profile Summary"
      titleId="user-hr-summary-title"
      onClose={onClose}
      closeAriaLabel="Close user summary"
    >
      <div className="p-6 space-y-6 overflow-y-auto flex-1">
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow label="Email" value={user.email} />
          <InfoRow
            label="Account Status"
            value={
              <span
                className={`inline-flex px-3 py-1 rounded-full text-label-caps font-bold ${getUserStatusBadgeClass(user.isActive)}`}
              >
                {getUserStatusLabel(user.isActive)}
              </span>
            }
          />
          <InfoRow label="Security Role" value={formatEnumLabel(user.role)} />
          <InfoRow label="Access Scope" value={formatEnumLabel(user.scope)} />
        </section>

        <section className="border-t border-[#e8e2d8] pt-5">
          <h4 className="text-label-caps font-bold text-[#5f5e5e] uppercase tracking-widest mb-3">
            Linked HR Collaborator
          </h4>

          {isLoading ? (
            <div className="flex items-center gap-2 text-secondary py-6">
              <span className="material-symbols-outlined animate-spin text-primary">
                sync
              </span>
              Loading HR record…
            </div>
          ) : error ? (
            <div className="p-4 rounded border border-error/30 bg-red-50 text-body-sm text-error">
              {error}
            </div>
          ) : hasCollaborators ? (
            <div className="space-y-3">
              {collaborators.map((collaborator) => (
                <div
                  key={collaborator.id}
                  className="p-4 rounded border border-[#e8e2d8] bg-white grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                  <InfoRow label="Full Name" value={collaborator.name} />
                  <InfoRow
                    label="Employee ID"
                    value={collaborator.employeeId?.trim() || '—'}
                  />
                  <InfoRow
                    label="Department"
                    value={collaborator.department?.trim() || '—'}
                  />
                  <InfoRow
                    label="HR Role"
                    value={formatEnumLabel(collaborator.role)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-4 p-5 rounded border border-amber-200 bg-amber-50">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-amber-600">
                  info
                </span>
                <p className="text-body-md text-amber-800">
                  This user profile is not yet mapped to an HR Collaborator record.
                </p>
              </div>
              <button
                type="button"
                onClick={onLinkHrProfile}
                className="inline-flex items-center gap-2 bg-[#ae001a] text-white font-bold text-label-caps px-5 py-2.5 rounded hover:bg-[#d2272f] transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">link</span>
                Link HR Profile
              </button>
            </div>
          )}
        </section>
      </div>
    </AppModal>
  );
};
