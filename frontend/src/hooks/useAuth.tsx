import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface User {
  id: string;
  email: string;
  business_name: string;
  website_url?: string;
  api_key_public: string;
  webhook_url?: string;
  is_active: boolean;
  created_at: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  updateUser: (data: Partial<User>) => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  business_name: string;
  website_url?: string;
  webhook_url?: string;
}

interface AuthResponse {
  merchant: User;
  token: string;
  message?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Load auth data from localStorage on init
  useEffect(() => {
    const savedToken = localStorage.getItem('stacksgate_token');
    const savedUser = localStorage.getItem('stacksgate_user');

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch (error) {
        console.error('Failed to parse saved user data:', error);
        localStorage.removeItem('stacksgate_token');
        localStorage.removeItem('stacksgate_user');
      }
    }

    setIsLoading(false);
  }, []);

  // API helper function
  async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Request failed');
    }

    return data;
  }

  const login = async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    
    try {
      const response: AuthResponse = await apiRequest('/merchants/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      setUser(response.merchant);
      setToken(response.token);
      
      // Save to localStorage
      localStorage.setItem('stacksgate_token', response.token);
      localStorage.setItem('stacksgate_user', JSON.stringify(response.merchant));

      // Navigate to dashboard or intended page
      const from = location.state?.from?.pathname || '/app/dashboard';
      navigate(from, { replace: true });
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: RegisterData): Promise<void> => {
    setIsLoading(true);
    
    try {
      const response: AuthResponse = await apiRequest('/merchants/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });

      setUser(response.merchant);
      setToken(response.token);
      
      // Save to localStorage
      localStorage.setItem('stacksgate_token', response.token);
      localStorage.setItem('stacksgate_user', JSON.stringify(response.merchant));

      navigate('/app/dashboard', { replace: true });
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = (): void => {
    setUser(null);
    setToken(null);
    
    localStorage.removeItem('stacksgate_token');
    localStorage.removeItem('stacksgate_user');
    
    navigate('/', { replace: true });
  };

  const updateUser = async (data: Partial<User>): Promise<void> => {
    if (!user) return;

    try {
      const response = await apiRequest('/merchants/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });

      const updatedUser = { ...user, ...response };
      setUser(updatedUser);
      
      localStorage.setItem('stacksgate_user', JSON.stringify(updatedUser));
    } catch (error) {
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    login,
    register,
    logout,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Custom hook for API requests with auth
export function useAuthenticatedRequest() {
  const { token, logout } = useAuth();

  return async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired, logout
        logout();
        return;
      }
      throw new Error(data.error?.message || 'Request failed');
    }

    return data;
  };
}