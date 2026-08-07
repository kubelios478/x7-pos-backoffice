// Mirrors the backend enums in x7-pos-back-end
// (src/platform-saas/users/constants/{role,scope}.enum.ts).
// Declared as const objects (not TS `enum`) because the frontend tsconfig
// enables `erasableSyntaxOnly`, which forbids runtime-emitting enums.
export const UserRole = {
  PORTAL_ADMIN: 'portal_admin',
  PORTAL_USER: 'portal_user',
  MERCHANT_ADMIN: 'merchant_admin',
  MERCHANT_USER: 'merchant_user',
  CUSTOMER_ADMIN: 'customer_admin',
  CUSTOMER_USER: 'customer_user',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const Scope = {
  ADMIN_PORTAL: 'admin_portal',
  MERCHANT_WEB: 'merchant_web',
  MERCHANT_ANDROID: 'merchant_android',
  MERCHANT_IOS: 'merchant_ios',
  MERCHANT_CLOVER: 'merchant_clover',
  CLOVER_SDK: 'clover_sdk',
  PUBLIC_CHECKOUT: 'public_checkout',
  EXTERNAL_API: 'external_api',
} as const;
export type Scope = (typeof Scope)[keyof typeof Scope];

export interface MerchantUser {
  id: number;
  username: string | null;
  email: string;
  role: string;
  scope: string;
  isActive: boolean;
  merchantId: number;
}

export interface HrCollaborator {
  id: number;
  name: string;
  employeeId: string | null;
  department: string | null;
  role: string;
  status: string;
  merchantId: number;
}

export interface UserHrSummary {
  user: MerchantUser;
  collaborators: HrCollaborator[];
}

export interface UsersListResponse {
  statusCode: number;
  message: string;
  data: MerchantUser[];
}

export interface UserMutationResponse {
  statusCode: number;
  message: string;
  data: MerchantUser;
}

export interface UserHrSummaryResponse {
  statusCode: number;
  message: string;
  data: UserHrSummary;
}

export interface MessageResponse {
  statusCode: number;
  message: string;
}

export interface CreateUserPayload {
  username?: string;
  email: string;
  password: string;
  role: string;
  scope: string;
  merchantId: number;
}

export interface UpdateUserPayload {
  username?: string;
  email?: string;
  role?: string;
  scope?: string;
}
