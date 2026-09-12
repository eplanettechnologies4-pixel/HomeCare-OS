// frontend/src/services/api.js
// Centralized HTTP client / fetch helper for HomeCare OS Web Dashboard

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

let tokenGetter = null;

/**
 * Register a function that provides the current JWT access token.
 * E.g., () => useStore.getState().userToken
 */
export const setTokenGetter = (getter) => {
  tokenGetter = getter;
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
 * Perform an authenticated fetch request against the backend API.
 * Automatically attaches Authorization: Bearer <token> if a token is available,
 * and sets Content-Type to application/json when a body is provided.
 */
export const apiFetch = async (endpoint, options = {}) => {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const token = options.token || getAuthToken();

  const headers = {
    ...(options.body && !options.headers?.['Content-Type']
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const { token: _token, ...fetchOptions } = options;

  return fetch(url, {
    ...fetchOptions,
    headers,
  });
};

export default apiFetch;
