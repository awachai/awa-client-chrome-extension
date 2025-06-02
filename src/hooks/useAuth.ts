
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/env';

interface AuthData {
  token: string;
  room: string;
}

interface LoginCredentials {
  username: string;
  password: string;
}

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  console.log('[AUTH_DEBUG] useAuth hook initialized');
  console.log('[AUTH_DEBUG] API_BASE_URL:', API_BASE_URL);

  // Check for existing auth data on mount
  useEffect(() => {
    console.log('[AUTH_DEBUG] Checking for saved auth data...');
    const savedAuthData = localStorage.getItem('authData');
    if (savedAuthData) {
      try {
        const parsed = JSON.parse(savedAuthData);
        console.log('[AUTH_DEBUG] Found saved auth data:', parsed);
        setAuthData(parsed);
        setIsAuthenticated(true);
      } catch (err) {
        console.error('[AUTH_DEBUG] Error parsing saved auth data:', err);
        localStorage.removeItem('authData');
      }
    } else {
      console.log('[AUTH_DEBUG] No saved auth data found');
    }
  }, []);

  const login = async (credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> => {
    console.log('[AUTH_DEBUG] Login function called with:', { username: credentials.username, password: credentials.password ? '***' : 'empty' });
    
    setIsLoading(true);
    setError(null);

    const loginUrl = `${API_BASE_URL}/auth/login`;
    console.log('[AUTH_DEBUG] Attempting to fetch:', loginUrl);

    try {
      console.log('[AUTH_DEBUG] Making fetch request...');
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password,
        }),
      });

      console.log('[AUTH_DEBUG] Fetch response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log('[AUTH_DEBUG] Response error text:', errorText);
        throw new Error(`Login failed: ${response.status} - ${errorText}`);
      }

      const data: AuthData = await response.json();
      console.log('[AUTH_DEBUG] Login response data:', data);
      
      // Save auth data
      setAuthData(data);
      setIsAuthenticated(true);
      localStorage.setItem('authData', JSON.stringify(data));

      console.log('[AUTH_DEBUG] Login successful, data saved');
      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('[AUTH_DEBUG] Login error:', err);
      console.error('[AUTH_DEBUG] Error message:', errorMessage);
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      console.log('[AUTH_DEBUG] Setting loading to false');
      setIsLoading(false);
    }
  };

  const logout = () => {
    console.log('[AUTH_DEBUG] Logout called');
    setAuthData(null);
    setIsAuthenticated(false);
    setError(null);
    localStorage.removeItem('authData');
  };

  const clearError = () => {
    console.log('[AUTH_DEBUG] Clear error called');
    setError(null);
  };

  return {
    isAuthenticated,
    authData,
    isLoading,
    error,
    login,
    logout,
    clearError,
  };
};
