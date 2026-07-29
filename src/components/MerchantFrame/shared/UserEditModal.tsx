import React from 'react';
import type {
  UserFormFieldErrors,
  UserFormValues,
} from '../../../lib/user-form-validation';
import {
  SCOPE_OPTIONS,
  USER_ROLE_OPTIONS,
  formatEnumLabel,
} from '../../../lib/user-directory';
import {
  AppModal,
  FormField,
  ModalFormError,
  ModalFormFooter,
} from '../shared/AppModal';

type SelectFieldProps = {
  id: string;
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  error?: string;
  onChange: (value: string) => void;
};

const SelectField: React.FC<SelectFieldProps> = ({
  id,
  label,
  value,
  options,
  placeholder,
  error,
  onChange,
}) => (
  <div className="flex flex-col gap-1.5 min-w-0">
    <label htmlFor={id} className="text-[11px] font-bold text-[#5f5e5e] uppercase">
      {label}
    </label>
    <select
      id={id}
      value={value}
      aria-invalid={Boolean(error)}
      onChange={(event) => onChange(event.target.value)}
      className={`bg-white text-[#1d1c17] px-3 py-2 border rounded text-body-md outline-none w-full ${
        error
          ? 'border-error focus:ring-1 focus:ring-error'
          : 'border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a]'
      }`}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {formatEnumLabel(option)}
        </option>
      ))}
    </select>
    {error ? (
      <p className="text-body-sm text-error" role="alert">
        {error}
      </p>
    ) : null}
  </div>
);

type UserEditModalProps = {
  mode: 'add' | 'edit';
  formValues: UserFormValues;
  fieldErrors: UserFormFieldErrors;
  formError: string | null;
  isSubmitting: boolean;
  isResettingPassword?: boolean;
  resetNotice?: string | null;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onFieldChange: (field: keyof UserFormValues, value: string) => void;
  onTriggerPasswordReset?: () => void;
};

export const UserEditModal: React.FC<UserEditModalProps> = ({
  mode,
  formValues,
  fieldErrors,
  formError,
  isSubmitting,
  isResettingPassword = false,
  resetNotice = null,
  onClose,
  onSubmit,
  onFieldChange,
  onTriggerPasswordReset,
}) => {
  return (
    <AppModal
      title={mode === 'add' ? 'Add User' : 'Edit User'}
      titleId="user-form-title"
      onClose={onClose}
      closeDisabled={isSubmitting}
      closeAriaLabel="Close user form"
    >
      <form onSubmit={onSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
        {formError ? <ModalFormError message={formError} /> : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            id="user-username"
            label="Username (Optional)"
            value={formValues.username}
            error={fieldErrors.username}
            onChange={(value) => onFieldChange('username', value)}
            placeholder="jdoe"
          />
          <FormField
            id="user-email"
            label="Email"
            value={formValues.email}
            error={fieldErrors.email}
            onChange={(value) => onFieldChange('email', value)}
            placeholder="user@company.com"
            type="email"
            required
          />
        </div>

        {mode === 'add' ? (
          <FormField
            id="user-password"
            label="Temporary Password"
            value={formValues.password}
            error={fieldErrors.password}
            onChange={(value) => onFieldChange('password', value)}
            placeholder="Min 8 chars, 1 uppercase, 1 number/symbol"
            type="password"
            required
          />
        ) : (
          <div className="flex flex-col gap-2 p-4 rounded border border-[#e8e2d8] bg-[#f8f3eb]">
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Password
            </p>
            <p className="text-body-sm text-secondary">
              Passwords are never edited here. Trigger a secure reset and the user
              receives a recovery link by email.
            </p>
            <button
              type="button"
              onClick={onTriggerPasswordReset}
              disabled={isResettingPassword || isSubmitting}
              className="self-start inline-flex items-center gap-2 px-4 py-2 rounded bg-[#222222] text-white font-bold text-label-caps hover:bg-[#3a3a3a] transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">
                lock_reset
              </span>
              {isResettingPassword
                ? 'Sending Reset…'
                : 'Trigger Password Reset'}
            </button>
            {resetNotice ? (
              <p
                className="text-body-sm text-emerald-700 flex items-center gap-1.5"
                role="status"
              >
                <span className="material-symbols-outlined text-[18px]">
                  check_circle
                </span>
                {resetNotice}
              </p>
            ) : null}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField
            id="user-role"
            label="Security Role"
            value={formValues.role}
            options={USER_ROLE_OPTIONS}
            placeholder="Select a role…"
            error={fieldErrors.role}
            onChange={(value) => onFieldChange('role', value)}
          />
          <SelectField
            id="user-scope"
            label="Access Scope"
            value={formValues.scope}
            options={SCOPE_OPTIONS}
            placeholder="Select a scope…"
            error={fieldErrors.scope}
            onChange={(value) => onFieldChange('scope', value)}
          />
        </div>

        <ModalFormFooter
          onCancel={onClose}
          submitLabel={
            isSubmitting
              ? 'Saving…'
              : mode === 'add'
                ? 'Create User'
                : 'Save Changes'
          }
          isSubmitting={isSubmitting}
        />
      </form>
    </AppModal>
  );
};
