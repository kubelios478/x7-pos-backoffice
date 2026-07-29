import { getAccessToken, clearAuthSession, getStoredUser } from '../lib/auth-storage';
import { ApiError, getApiErrorMessage } from '../lib/api-error';
import type {
  CreateUserPayload,
  MerchantUser,
  MessageResponse,
  UpdateUserPayload,
  UserHrSummary,
  UserHrSummaryResponse,
  UserMutationResponse,
  UsersListResponse,
} from '../types/user';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

function authHeaders(includeJson = false): Record<string, string> {
  const token = getAccessToken();
  return {
    Accept: 'application/json',
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function userRequest<T>(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...authHeaders(Boolean(init.body)),
      ...init.headers,
    },
  });

  if (response.status === 401) {
    clearAuthSession();
    window.location.href = '/login';
    throw new ApiError('Unauthorized', 401);
  }

  if (!response.ok) {
    const message = await getApiErrorMessage(response, fallbackMessage);
    throw new ApiError(message, response.status);
  }

  const text = await response.text();
  if (!text.trim()) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

/** Resolves the logged-in administrator's merchant id (used to anchor new users). */
export function getCurrentMerchantId(): number | null {
  return getStoredUser()?.merchant.id ?? null;
}

export async function getMerchantUsers(): Promise<MerchantUser[]> {
  const merchantId = getCurrentMerchantId();
  if (!merchantId) {
    throw new ApiError('Unable to resolve merchant context. Please sign in again.', 400);
  }

  const json = await userRequest<UsersListResponse>(
    `/users/merchant/${merchantId}`,
    { method: 'GET' },
    'Failed to load users. Please try again.',
  );

  return json.data ?? [];
}

export async function createUser(
  payload: CreateUserPayload,
): Promise<MerchantUser> {
  const json = await userRequest<UserMutationResponse>(
    '/users',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    'Failed to create user. Please try again.',
  );

  return json.data;
}

export async function updateUser(
  id: number,
  payload: UpdateUserPayload,
): Promise<MerchantUser> {
  const json = await userRequest<UserMutationResponse>(
    `/users/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    'Failed to update user. Please try again.',
  );

  return json.data;
}

export async function setUserActiveStatus(
  id: number,
  isActive: boolean,
): Promise<MerchantUser> {
  const json = await userRequest<UserMutationResponse>(
    `/users/${id}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    },
    'Failed to update user status. Please try again.',
  );

  return json.data;
}

export async function triggerUserPasswordReset(
  id: number,
): Promise<MessageResponse> {
  return userRequest<MessageResponse>(
    `/users/${id}/reset-password`,
    { method: 'POST' },
    'Failed to trigger password reset. Please try again.',
  );
}

export async function getUserHrSummary(id: number): Promise<UserHrSummary> {
  const json = await userRequest<UserHrSummaryResponse>(
    `/users/${id}/hr-summary`,
    { method: 'GET' },
    'Failed to load HR summary. Please try again.',
  );

  return json.data;
}
