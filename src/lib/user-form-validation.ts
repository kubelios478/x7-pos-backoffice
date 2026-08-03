import { validateEmail } from './email-validation';
import { evaluatePasswordCriteria, isPasswordValid } from './reset-password';
import type { CreateUserPayload, UpdateUserPayload } from '../types/user';

export interface UserFormValues {
  username: string;
  email: string;
  password: string;
  role: string;
  scope: string;
}

export interface UserFormFieldErrors {
  username?: string;
  email?: string;
  password?: string;
  role?: string;
  scope?: string;
}

export const EMPTY_USER_FORM: UserFormValues = {
  username: '',
  email: '',
  password: '',
  role: '',
  scope: '',
};

export const PASSWORD_STRENGTH_MESSAGE =
  'Password must be 8+ characters with an uppercase letter and a number or symbol.';

export function validateUserForm(
  values: UserFormValues,
  mode: 'add' | 'edit',
): UserFormFieldErrors {
  const errors: UserFormFieldErrors = {};

  const username = values.username.trim();
  if (username && (username.length < 2 || username.length > 60)) {
    errors.username = 'Username must be between 2 and 60 characters.';
  }

  const emailError = validateEmail(values.email);
  if (emailError) {
    errors.email = emailError;
  }

  // Password only applies when creating (edit uses the dedicated reset flow).
  if (mode === 'add') {
    if (!values.password) {
      errors.password = 'A temporary password is required.';
    } else if (!isPasswordValid(evaluatePasswordCriteria(values.password))) {
      errors.password = PASSWORD_STRENGTH_MESSAGE;
    }
  }

  if (!values.role) {
    errors.role = 'Role is required.';
  }

  if (!values.scope) {
    errors.scope = 'Scope is required.';
  }

  return errors;
}

export function hasUserFormErrors(errors: UserFormFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function toCreateUserPayload(
  values: UserFormValues,
  merchantId: number,
): CreateUserPayload {
  return {
    username: values.username.trim() || undefined,
    email: values.email.trim(),
    password: values.password,
    role: values.role,
    scope: values.scope,
    merchantId,
  };
}

export function toUpdateUserPayload(values: UserFormValues): UpdateUserPayload {
  return {
    username: values.username.trim() || undefined,
    email: values.email.trim(),
    role: values.role,
    scope: values.scope,
  };
}
