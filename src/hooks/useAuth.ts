
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

  // Check for existing auth data on mount
  useEffect(() => {
    const savedAuthData = localStorage.getItem('authData');
    if (savedAuthData) {
      try {
        const parsed = JSON.parse(savedAuthData);
        setAuthData(parsed);
        setIsAuthenticated(true);
      } catch (err) {
        console.error('Error parsing saved auth data:', err);
        localStorage.removeItem('authData');
      }
    }
  }, []);

  const login = async (credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password,
        }),
      });

      if (!response.ok) {
        throw new Error(`Login failed: ${response.status}`);
      }

      const data: AuthData = await response.json();
      
      // Save auth data
      setAuthData(data);
      setIsAuthenticated(true);
      localStorage.setItem('authData', JSON.stringify(data));

      console.log('Login successful:', data);
      return { success: true };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Login error:', errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setAuthData(null);
    setIsAuthenticated(false);
    setError(null);
    localStorage.removeItem('authData');
    console.log('User logged out');
  };

  const clearError = () => {
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
