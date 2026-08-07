import { describe, expect, it } from 'vitest';
import {
  EMPTY_USER_FORM,
  hasUserFormErrors,
  toCreateUserPayload,
  toUpdateUserPayload,
  validateUserForm,
  type UserFormValues,
} from './user-form-validation';

const VALID: UserFormValues = {
  username: 'jdoe',
  email: 'john@acme.com',
  password: 'Sup3rSecret',
  role: 'merchant_admin',
  scope: 'merchant_web',
};

describe('validateUserForm (add mode)', () => {
  it('accepts a fully valid form', () => {
    expect(hasUserFormErrors(validateUserForm(VALID, 'add'))).toBe(false);
  });

  it('requires email, role and scope', () => {
    const errors = validateUserForm(EMPTY_USER_FORM, 'add');
    expect(errors.email).toBeDefined();
    expect(errors.role).toBeDefined();
    expect(errors.scope).toBeDefined();
  });

  it('enforces password strength on create', () => {
    expect(validateUserForm({ ...VALID, password: 'weak' }, 'add').password)
      .toBeDefined();
    expect(validateUserForm({ ...VALID, password: '' }, 'add').password)
      .toBeDefined();
  });

  it('allows an empty username but rejects a too-short one', () => {
    expect(validateUserForm({ ...VALID, username: '' }, 'add').username)
      .toBeUndefined();
    expect(validateUserForm({ ...VALID, username: 'a' }, 'add').username)
      .toBeDefined();
  });
});

describe('validateUserForm (edit mode)', () => {
  it('does not require a password when editing', () => {
    const errors = validateUserForm({ ...VALID, password: '' }, 'edit');
    expect(errors.password).toBeUndefined();
  });
});

describe('payload builders', () => {
  it('injects merchantId and omits an empty username on create', () => {
    const payload = toCreateUserPayload({ ...VALID, username: '  ' }, 42);
    expect(payload.merchantId).toBe(42);
    expect(payload.username).toBeUndefined();
    expect(payload.email).toBe('john@acme.com');
  });

  it('builds an update payload without the password field', () => {
    const payload = toUpdateUserPayload(VALID);
    expect(payload).not.toHaveProperty('password');
    expect(payload.role).toBe('merchant_admin');
  });
});
