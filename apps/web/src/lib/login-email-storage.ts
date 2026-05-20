/** Persisted for “create org then re-login” without a switch-tenant API (not a secret). */
const LAST_EMAIL_KEY = 'dental-saas-last-login-email';

export function getStoredLastLoginEmail(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(LAST_EMAIL_KEY);
}

export function setStoredLastLoginEmail(email: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (email === null || email === '') {
    window.localStorage.removeItem(LAST_EMAIL_KEY);
    return;
  }
  window.localStorage.setItem(LAST_EMAIL_KEY, email.trim().toLowerCase());
}
