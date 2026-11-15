/**
 * Multi-Tenant Authentication & Session Engine
 * Isolates shop credentials, active shop_id, and Super Admin Portal authentication
 */

export interface AuthUser {
  shop_id: number;
  shop_name: string;
  owner_name: string;
  phone: string;
  email?: string;
  is_staff?: boolean;
  status?: 'pending' | 'approved' | 'suspended' | 'rejected';
}

export interface SuperAdminUser {
  id: number;
  username: string;
  name: string;
  phone: string;
  role: string;
}

const TOKEN_KEY = 'dukaan_auth_token';
const SHOP_ID_KEY = 'dukaan_shop_id';
const USER_KEY = 'dukaan_auth_user';
const LOGGED_IN_KEY = 'is_logged_in';

const ADMIN_TOKEN_KEY = 'dukaan_admin_token';
const ADMIN_USER_KEY = 'dukaan_admin_user';

export const AuthEngine = {
  getToken(): string {
    if (typeof window === 'undefined') return '';
    return (
      localStorage.getItem(TOKEN_KEY) ||
      sessionStorage.getItem(TOKEN_KEY) ||
      ''
    );
  },

  getShopId(): number {
    if (typeof window === 'undefined') return 1;
    const raw =
      localStorage.getItem(SHOP_ID_KEY) ||
      sessionStorage.getItem(SHOP_ID_KEY);
    const parsed = raw ? parseInt(raw, 10) : 1;
    return isNaN(parsed) ? 1 : parsed;
  },

  getUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw =
        localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  isLoggedIn(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      localStorage.getItem(LOGGED_IN_KEY) === 'true' ||
      sessionStorage.getItem(LOGGED_IN_KEY) === 'true'
    );
  },

  setSession(
    token: string,
    shopId: number,
    user: AuthUser,
    rememberMe: boolean = true
  ) {
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(TOKEN_KEY, token);
    storage.setItem(SHOP_ID_KEY, String(shopId));
    storage.setItem(USER_KEY, JSON.stringify(user));
    storage.setItem(LOGGED_IN_KEY, 'true');

    if (rememberMe && user.phone) {
      localStorage.setItem('dukaan_last_phone', user.phone);
    }
  },

  clearSession() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SHOP_ID_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(LOGGED_IN_KEY);

    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SHOP_ID_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(LOGGED_IN_KEY);
  },

  /**
   * Automatically intercept all API requests to attach multi-tenant or admin headers
   */
  initFetchInterceptor() {
    if (typeof window === 'undefined') return;
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      // Handle Super Admin Endpoints
      if (urlStr.includes('/api/admin/')) {
        const adminToken = AdminAuth.getToken();
        const newInit: RequestInit = { ...(init || {}) };
        const headers = new Headers(newInit.headers || {});
        if (adminToken && !headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${adminToken}`);
          headers.set('X-Admin-Token', adminToken);
        }
        newInit.headers = headers;
        return originalFetch(input, newInit);
      }

      // Handle Merchant Multi-Tenant Shop Endpoints
      if (urlStr.includes('/api/')) {
        const token = AuthEngine.getToken();
        const shopId = AuthEngine.getShopId();

        const newInit: RequestInit = { ...(init || {}) };
        const headers = new Headers(newInit.headers || {});

        if (token && !headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
          headers.set('X-Shop-Token', token);
        }
        if (shopId && !headers.has('X-Shop-Id')) {
          headers.set('X-Shop-Id', String(shopId));
        }

        newInit.headers = headers;

        try {
          const response = await originalFetch(input, newInit);
          if (response.status === 401) {
            try {
              const clone = response.clone();
              const json = await clone.json();
              if (json && json.need_login) {
                window.dispatchEvent(new CustomEvent('dukaan:unauthorized'));
              }
            } catch {
              // Ignore json error
            }
          }
          return response;
        } catch (e) {
          throw e;
        }
      }

      return originalFetch(input, init);
    };
  }
};

export const AdminAuth = {
  getToken(): string {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
  },

  getUser(): SuperAdminUser | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(ADMIN_USER_KEY) || sessionStorage.getItem(ADMIN_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  isLoggedIn(): boolean {
    return Boolean(this.getToken());
  },

  setSession(token: string, user: SuperAdminUser, remember = true) {
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(ADMIN_TOKEN_KEY, token);
    storage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
  },

  clearSession() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_USER_KEY);
  }
};
