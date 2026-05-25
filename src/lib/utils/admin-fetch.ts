/**
 * Helper for client-side requests that need the auth token.
 * Multi-tenant: same storage key is used for admin and regular user sessions.
 */

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  // Backward-compat: read legacy admin_token if present, then migrate
  const legacy = localStorage.getItem('admin_token');
  if (legacy && !localStorage.getItem(TOKEN_KEY)) {
    localStorage.setItem(TOKEN_KEY, legacy);
    localStorage.removeItem('admin_token');
    const legacyUser = localStorage.getItem('admin_user');
    if (legacyUser && !localStorage.getItem(USER_KEY)) {
      localStorage.setItem(USER_KEY, legacyUser);
      localStorage.removeItem('admin_user');
    }
  }
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('admin_token');
}

export interface StoredUser {
  id?: string;
  email: string;
  name?: string | null;
  role: 'user' | 'admin';
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY) || localStorage.getItem('admin_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function storeAuth(token: string, user: StoredUser): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // Clean up any legacy keys
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
}

/**
 * Sanitize a redirect target (e.g. ?next= query param) so it can only point
 * to a same-origin path within this app. Rejects:
 *   - absolute URLs (http://, https://, javascript:, data:, ...)
 *   - protocol-relative URLs (`//evil.com/...`)
 *   - back-slash bypass (`/\evil.com`)
 *   - anything not starting with a single `/`
 *
 * Returns `fallback` (default `/`) when input is unsafe.
 */
export function safeRedirect(target: string | null | undefined, fallback = '/'): string {
  if (!target || typeof target !== 'string') return fallback;
  if (target.length > 1024) return fallback;
  // Must start with `/` and second char (if any) must not be `/` or `\`
  if (target[0] !== '/') return fallback;
  if (target[1] === '/' || target[1] === '\\') return fallback;
  // Reject control chars
  if (/[\x00-\x1f]/.test(target)) return fallback;
  return target;
}
