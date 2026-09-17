// frontend/src/services/api.js
// Centralized HTTP client / fetch helper for HomeCare OS Web Dashboard

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

let tokenGetter = null;
let storeRef = null; // lazy reference to useStore to avoid circular imports

/**
 * Register a function that provides the current JWT access token.
 * E.g., () => useStore.getState().userToken
 */
export const setTokenGetter = (getter) => {
  tokenGetter = getter;
};

/**
 * Provide a reference to the Zustand store so the interceptor can
 * update tokens after a refresh and call logout() on total failure.
 * Called once at the bottom of useStore.js.
 */
export const setStoreRef = (store) => {
  storeRef = store;
};

/**
 * Retrieve the current token from the registered getter, or fallback to localStorage.
 */
export const getAuthToken = () => {
  if (typeof tokenGetter === 'function') {
    const token = tokenGetter();
    if (token) return token;
  }
  try {
    return localStorage.getItem('access_token');
  } catch (e) {
    return null;
  }
};

/**
 * Attempt to refresh the JWT access token using the stored refresh token.
 * Returns the new access token string on success, or null on failure.
 */
const _refreshAccessToken = async () => {
  let refreshToken = null;
  try {
    refreshToken = storeRef?.getState?.()?.refreshToken
      || localStorage.getItem('refresh_token');
  } catch (e) { /* ignore */ }

  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const newAccess = data.access;
    const newRefresh = data.refresh; // simplejwt returns a new refresh when ROTATE_REFRESH_TOKENS=True

    if (!newAccess) return null;

    // Persist new tokens
    try {
      localStorage.setItem('access_token', newAccess);
      if (newRefresh) localStorage.setItem('refresh_token', newRefresh);
    } catch (e) { /* ignore */ }

    // Update the Zustand store state so future calls use the new token
    if (storeRef?.setState) {
      storeRef.setState({
        userToken: newAccess,
        ...(newRefresh ? { refreshToken: newRefresh } : {}),
      });
    }

    return newAccess;
  } catch (e) {
    return null;
  }
};

// Guard to prevent concurrent refresh attempts
let _isRefreshing = false;
let _refreshQueue = []; // pending requests waiting for the refresh

const _processRefreshQueue = (newToken) => {
  _refreshQueue.forEach((resolve) => resolve(newToken));
  _refreshQueue = [];
};

/**
 * Perform an authenticated fetch request against the backend API.
 *
 * Features:
 *  - Automatically attaches Authorization: Bearer <token>
 *  - Sets Content-Type: application/json when a body is provided
 *  - On 401: attempts a silent JWT refresh then retries the request once
 *  - On refresh failure: calls store logout() and returns the 401 response
 */
export const apiFetch = async (endpoint, options = {}) => {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const buildHeaders = (token) => ({
    ...(options.body && !options.headers?.['Content-Type']
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  });

  const { token: _token, ...fetchOptions } = options;
  const initialToken = _token || getAuthToken();

  // ── First attempt ────────────────────────────────────────────────────────
  let response = await fetch(url, {
    ...fetchOptions,
    headers: buildHeaders(initialToken),
  });

  // ── 401 handling: try to refresh ─────────────────────────────────────────
  if (response.status === 401) {
    // Skip refresh for auth endpoints themselves to avoid infinite loops
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh');
    if (isAuthEndpoint) return response;

    let newToken;

    if (_isRefreshing) {
      // Another call is already refreshing — queue this one
      newToken = await new Promise((resolve) => {
        _refreshQueue.push(resolve);
      });
    } else {
      _isRefreshing = true;
      newToken = await _refreshAccessToken();
      _isRefreshing = false;
      _processRefreshQueue(newToken);
    }

    if (newToken) {
      // Retry the original request with the fresh token
      response = await fetch(url, {
        ...fetchOptions,
        headers: buildHeaders(newToken),
      });
    } else {
      // Refresh failed — force logout to clear stale session
      try {
        storeRef?.getState?.()?.logout?.();
      } catch (e) { /* ignore */ }
      return response; // return the original 401
    }
  }

  return response;
};

export default apiFetch;
