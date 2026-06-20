const SAAS_TOKEN_KEY = 'x7_saas_admin_token';

export const saveSaasToken = (token: string): void =>
  localStorage.setItem(SAAS_TOKEN_KEY, token);

export const getSaasToken = (): string | null =>
  localStorage.getItem(SAAS_TOKEN_KEY);

export const clearSaasToken = (): void =>
  localStorage.removeItem(SAAS_TOKEN_KEY);

export const isSaasAuthenticated = (): boolean =>
  getSaasToken() !== null;
