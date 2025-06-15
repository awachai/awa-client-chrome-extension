
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/env';

interface AuthData {
  token: string;
  room: string;
}

interface LoginCredentials {
  username: string;
  password: string;
  http_tunnel?: string;
}

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ฟังก์ชั่นส่ง log ไปยัง background script
  const logToContent = (message: string, level: string = 'log') => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'LOG_TO_CONTENT',
        message: `[AUTH_DEBUG] ${message}`,
        level: level
      });
    } else {
      console.log(`[AUTH_DEBUG] ${message}`);
    }
  };

  logToContent('useAuth hook initialized');
  logToContent(`API_BASE_URL: ${API_BASE_URL}`);

  // Check for existing auth data on mount
  useEffect(() => {
    logToContent('Checking for saved auth data...');
    const savedAuthData = localStorage.getItem('authData');
    if (savedAuthData) {
      try {
        const parsed = JSON.parse(savedAuthData);
        logToContent(`Found saved auth data: ${JSON.stringify(parsed)}`);
        setAuthData(parsed);
        setIsAuthenticated(true);
      } catch (err) {
        logToContent(`Error parsing saved auth data: ${err}`, 'error');
        localStorage.removeItem('authData');
      }
    } else {
      logToContent('No saved auth data found');
    }
  }, []);

  const login = async (credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> => {
    logToContent(`Login function called with: ${JSON.stringify({ 
      username: credentials.username, 
      password: credentials.password ? '***' : 'empty',
      http_tunnel: credentials.http_tunnel || ''
    })}`);
    
    setIsLoading(true);
    setError(null);

    const loginUrl = `${API_BASE_URL}/auth/login`;
    logToContent(`Attempting to fetch: ${loginUrl}`);

    try {
      logToContent('Making fetch request...');
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password,
          http_tunnel: credentials.http_tunnel || "",
        }),
      });

      logToContent(`Fetch response received: ${JSON.stringify({
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      })}`);

      if (!response.ok) {
        const errorText = await response.text();
        logToContent(`Response error text: ${errorText}`);
        throw new Error(`Login failed: ${response.status} - ${errorText}`);
      }

      const data: AuthData = await response.json();
      logToContent(`Login response data: ${JSON.stringify(data)}`);
      
      // Save auth data
      setAuthData(data);
      setIsAuthenticated(true);
      localStorage.setItem('authData', JSON.stringify(data));

      logToContent('Login successful, data saved');
      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      logToContent(`Login error: ${err}`, 'error');
      logToContent(`Error message: ${errorMessage}`, 'error');
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      logToContent('Setting loading to false');
      setIsLoading(false);
    }
  };

  const logout = () => {
    logToContent('Logout called');
    setAuthData(null);
    setIsAuthenticated(false);
    setError(null);
    localStorage.removeItem('authData');
  };

  const clearError = () => {
    logToContent('Clear error called');
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
