import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createUser,
  getMerchantUsers,
  getCurrentMerchantId,
  getUserHrSummary,
  setUserActiveStatus,
  triggerUserPasswordReset,
  updateUser,
} from '../../../api/users';
import { ApiError } from '../../../lib/api-error';
import { navigateToDashboardFeature } from '../../../lib/merchant-directory-navigation';
import { USER_QUICK_LAUNCH_TARGETS } from '../../../lib/user-directory-navigation';
import {
  ALL_ROLES,
  ALL_SCOPES,
  SCOPE_OPTIONS,
  USER_ROLE_OPTIONS,
  filterUsers,
  formatEnumLabel,
  getUserStatusBadgeClass,
  getUserStatusLabel,
} from '../../../lib/user-directory';
import {
  EMPTY_USER_FORM,
  hasUserFormErrors,
  toCreateUserPayload,
  toUpdateUserPayload,
  validateUserForm,
  type UserFormFieldErrors,
  type UserFormValues,
} from '../../../lib/user-form-validation';
import type { MerchantUser, UserHrSummary } from '../../../types/user';
import { EmergencySupportModal } from '../modals/QuickActionModals';
import { RolesAccessMatrixModal } from '../modals/RolesAccessMatrixModal';
import { QuickLaunchPanel } from '../shared/QuickLaunchPanel';
import { UserEditModal } from '../shared/UserEditModal';
import { UserHrSummaryModal } from '../shared/UserHrSummaryModal';
import {
  ConfirmStatusToggleDialog,
  StatusToggleButton,
} from '../../SaaSFrame/views/StatusToggle';

type ModalMode = 'add' | 'edit';

function userToFormValues(user: MerchantUser): UserFormValues {
  return {
    username: user.username ?? '',
    email: user.email ?? '',
    password: '',
    role: user.role ?? '',
    scope: user.scope ?? '',
  };
}

function userLabel(user: MerchantUser): string {
  return user.username?.trim() || user.email;
}

export const UserManagementView: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<MerchantUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState(ALL_ROLES);
  const [scopeFilter, setScopeFilter] = useState(ALL_SCOPES);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('add');
  const [editingUser, setEditingUser] = useState<MerchantUser | null>(null);
  const [formValues, setFormValues] = useState<UserFormValues>(EMPTY_USER_FORM);
  const [fieldErrors, setFieldErrors] = useState<UserFormFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  const [toggleTarget, setToggleTarget] = useState<MerchantUser | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  const [summaryUser, setSummaryUser] = useState<MerchantUser | null>(null);
  const [hrSummary, setHrSummary] = useState<UserHrSummary | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [isRolesMatrixOpen, setIsRolesMatrixOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await getMerchantUsers();
      setUsers(data);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to load users. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const filteredUsers = useMemo(
    () => filterUsers(users, searchQuery, roleFilter, scopeFilter),
    [users, searchQuery, roleFilter, scopeFilter],
  );

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    roleFilter !== ALL_ROLES ||
    scopeFilter !== ALL_SCOPES;

  const openAddModal = () => {
    setModalMode('add');
    setEditingUser(null);
    setFormValues(EMPTY_USER_FORM);
    setFieldErrors({});
    setFormError(null);
    setResetNotice(null);
    setIsFormOpen(true);
  };

  const openEditModal = (user: MerchantUser) => {
    setModalMode('edit');
    setEditingUser(user);
    setFormValues(userToFormValues(user));
    setFieldErrors({});
    setFormError(null);
    setResetNotice(null);
    setIsFormOpen(true);
  };

  const closeFormModal = () => {
    if (isSubmitting) return;
    setIsFormOpen(false);
    setEditingUser(null);
    setFormValues(EMPTY_USER_FORM);
    setFieldErrors({});
    setFormError(null);
    setResetNotice(null);
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const errors = validateUserForm(formValues, modalMode);
    setFieldErrors(errors);
    if (hasUserFormErrors(errors)) return;

    const merchantId = getCurrentMerchantId();
    if (modalMode === 'add' && !merchantId) {
      setFormError(
        'Unable to resolve your merchant context. Please sign in again.',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (modalMode === 'add') {
        await createUser(toCreateUserPayload(formValues, merchantId as number));
        setSuccessMessage('User created successfully.');
      } else if (editingUser) {
        await updateUser(editingUser.id, toUpdateUserPayload(formValues));
        setSuccessMessage('User updated successfully.');
      }

      closeFormModal();
      await loadUsers();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Failed to save user. Please try again.';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTriggerPasswordReset = async () => {
    if (!editingUser) return;
    setResetNotice(null);
    setIsResettingPassword(true);
    try {
      const response = await triggerUserPasswordReset(editingUser.id);
      setResetNotice(
        response.message || 'Password reset link sent to the user email.',
      );
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : 'Failed to trigger password reset. Please try again.',
      );
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleConfirmToggle = async () => {
    if (!toggleTarget) return;
    const nextActive = !toggleTarget.isActive;
    const label = userLabel(toggleTarget);

    setIsTogglingStatus(true);
    try {
      await setUserActiveStatus(toggleTarget.id, nextActive);
      setSuccessMessage(
        nextActive
          ? `${label} has been reactivated successfully.`
          : `${label} has been deactivated successfully.`,
      );
      setToggleTarget(null);
      await loadUsers();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to update user status. Please try again.',
      );
      setToggleTarget(null);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const updateField = (field: keyof UserFormValues, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const openUserSummary = async (user: MerchantUser) => {
    setSummaryUser(user);
    setHrSummary(null);
    setSummaryError(null);
    setIsSummaryLoading(true);

    try {
      const summary = await getUserHrSummary(user.id);
      setHrSummary(summary);
    } catch (err) {
      setSummaryError(
        err instanceof Error
          ? err.message
          : 'Failed to load HR summary. Please try again.',
      );
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const closeUserSummary = () => {
    setSummaryUser(null);
    setHrSummary(null);
    setSummaryError(null);
  };

  const handleLinkHrProfile = () => {
    closeUserSummary();
    navigateToDashboardFeature(
      navigate,
      USER_QUICK_LAUNCH_TARGETS.humanResources,
    );
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left relative">
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

      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
        <div className="relative w-full lg:w-96">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-body-md transition-all"
            placeholder="Search by username or email..."
          />
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            aria-label="Filter by role"
            className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[170px]"
          >
            <option value={ALL_ROLES}>{ALL_ROLES}</option>
            {USER_ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {formatEnumLabel(role)}
              </option>
            ))}
          </select>
          <select
            value={scopeFilter}
            onChange={(event) => setScopeFilter(event.target.value)}
            aria-label="Filter by scope"
            className="px-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] text-body-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none min-w-[170px]"
          >
            <option value={ALL_SCOPES}>{ALL_SCOPES}</option>
            {SCOPE_OPTIONS.map((scope) => (
              <option key={scope} value={scope}>
                {formatEnumLabel(scope)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={openAddModal}
            className="bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            ADD USER
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white border border-[#e8e2d8] p-12 text-center rounded shadow-sm">
          <span className="material-symbols-outlined animate-spin text-primary text-4xl">
            sync
          </span>
          <p className="text-secondary text-body-md mt-2 font-sans">
            Loading user directory...
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
            onClick={() => void loadUsers()}
            className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#ae001a] transition-all font-sans"
          >
            Retry Connection
          </button>
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white border border-[#e8e2d8] p-12 text-center rounded shadow-sm">
          <span className="material-symbols-outlined text-[#5f5e5e] text-5xl">
            group
          </span>
          <p className="text-[#1d1c17] font-bold mt-4 max-w-2xl mx-auto">
            No users found for this merchant. Click &apos;Add User&apos; to
            provision your first team profile.
          </p>
          <button
            type="button"
            onClick={openAddModal}
            className="mt-6 bg-[#ae001a] text-white font-bold text-label-caps px-6 py-2.5 rounded hover:bg-[#d2272f] transition-colors inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            ADD USER
          </button>
        </div>
      ) : (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-label-caps font-bold text-white uppercase tracking-wider">
              TEAM USER DIRECTORY
            </span>
            <span className="text-white/50 text-xs">
              {filteredUsers.length} of {users.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">
                    Security Role
                  </th>
                  <th className="px-6 py-3 text-left text-label-caps font-bold text-[#5f5e5e]">
                    Access Scope
                  </th>
                  <th className="px-6 py-3 text-center text-label-caps font-bold text-[#5f5e5e]">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-label-caps font-bold text-[#5f5e5e]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center">
                      <div className="flex flex-col items-center gap-2 text-secondary">
                        <span className="material-symbols-outlined text-3xl">
                          search_off
                        </span>
                        <p className="font-medium">No users match your criteria</p>
                        {hasActiveFilters && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery('');
                              setRoleFilter(ALL_ROLES);
                              setScopeFilter(ALL_SCOPES);
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
                  filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className={`group hover:bg-[#f8f3eb] transition-colors cursor-pointer ${
                        user.isActive ? '' : 'opacity-75'
                      }`}
                      onClick={() => void openUserSummary(user)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-1 h-8 bg-[#ae001a] rounded-full" />
                          <div>
                            <p className="font-bold text-[#1d1c17]">
                              {user.username?.trim() || '—'}
                            </p>
                            <p className="text-body-sm text-secondary">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-body-md text-[#1d1c17]">
                        {formatEnumLabel(user.role)}
                      </td>
                      <td className="px-6 py-4 text-body-md text-[#1d1c17]">
                        {formatEnumLabel(user.scope)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-label-caps font-bold ${getUserStatusBadgeClass(user.isActive)}`}
                        >
                          {getUserStatusLabel(user.isActive)}
                        </span>
                      </td>
                      <td
                        className="px-6 py-4 text-right"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex justify-end gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => openEditModal(user)}
                            className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                            title="Edit user"
                            aria-label={`Edit ${userLabel(user)}`}
                          >
                            <span className="material-symbols-outlined text-[20px]">
                              edit
                            </span>
                          </button>
                          <StatusToggleButton
                            status={user.isActive ? 'active' : 'inactive'}
                            entityLabel={userLabel(user)}
                            onClick={() => setToggleTarget(user)}
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

      <QuickLaunchPanel
        description="Rapid operational shortcuts to audit login histories, review permission maps, and jump to human resource files without leaving your workspace."
        actions={[
          {
            id: 'security-audit-logs',
            label: 'SECURITY AUDIT LOGS',
            onClick: () =>
              navigateToDashboardFeature(
                navigate,
                USER_QUICK_LAUNCH_TARGETS.securityAuditLogs,
              ),
          },
          {
            id: 'roles-access-matrix',
            label: 'ROLES & ACCESS MATRIX',
            onClick: () => setIsRolesMatrixOpen(true),
          },
          {
            id: 'human-resources',
            label: 'HUMAN RESOURCES (HR)',
            onClick: () =>
              navigateToDashboardFeature(
                navigate,
                USER_QUICK_LAUNCH_TARGETS.humanResources,
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

      {!isLoading && users.length > 0 && (
        <button
          type="button"
          onClick={openAddModal}
          className="fixed bottom-8 right-8 z-40 w-14 h-14 rounded-full bg-[#ae001a] text-white shadow-lg hover:bg-[#d2272f] transition-colors flex items-center justify-center"
          aria-label="Add user"
        >
          <span className="material-symbols-outlined text-3xl">add</span>
        </button>
      )}

      {isFormOpen ? (
        <UserEditModal
          mode={modalMode}
          formValues={formValues}
          fieldErrors={fieldErrors}
          formError={formError}
          isSubmitting={isSubmitting}
          isResettingPassword={isResettingPassword}
          resetNotice={resetNotice}
          onClose={closeFormModal}
          onSubmit={(event) => void handleFormSubmit(event)}
          onFieldChange={updateField}
          onTriggerPasswordReset={() => void handleTriggerPasswordReset()}
        />
      ) : null}

      {toggleTarget ? (
        <ConfirmStatusToggleDialog
          entityName={userLabel(toggleTarget)}
          direction={toggleTarget.isActive ? 'deactivate' : 'activate'}
          submitting={isTogglingStatus}
          onConfirm={() => void handleConfirmToggle()}
          onClose={() => setToggleTarget(null)}
        />
      ) : null}

      {summaryUser && (
        <UserHrSummaryModal
          user={summaryUser}
          summary={hrSummary}
          isLoading={isSummaryLoading}
          error={summaryError}
          onClose={closeUserSummary}
          onLinkHrProfile={handleLinkHrProfile}
        />
      )}

      {isRolesMatrixOpen && (
        <RolesAccessMatrixModal onClose={() => setIsRolesMatrixOpen(false)} />
      )}

      <EmergencySupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />
    </div>
  );
};
