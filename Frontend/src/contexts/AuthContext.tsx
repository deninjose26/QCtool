import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { User, UserRole } from '@/types';
import { API_BASE_URL } from '@/config';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
  refreshProfile: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('qc_user');
    if (!savedUser) return null;
    try {
      const parsed = JSON.parse(savedUser);
      // Migration: Map old snake_case roles to new PascalCase roles
      const migrationMap: Record<string, UserRole> = {
        'super_admin': 'SuperAdmin',
        'superadmin': 'SuperAdmin',
        'upload_supervisor': 'Upload_Supervisor',
        'vendor': 'Vendor',
        'scanning_operator': 'Scanning_Operator',
        'qc_supervisor': 'QC_Supervisor',
        'qc_user': 'QC_User'
      };

      if (parsed.role) {
        const normalizedRole = parsed.role.toLowerCase();
        if (migrationMap[normalizedRole]) {
          parsed.role = migrationMap[normalizedRole];
        }
      }
      return parsed;
    } catch (e) {
      return null;
    }
  });

  const logout = useCallback(() => {
    localStorage.removeItem('qc_user');
    localStorage.removeItem('qc_token');
    localStorage.removeItem('token');
    window.location.href = '/';
  }, []);

  const apiFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('qc_token');

    const headers = new Headers(options.headers || {});
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      console.warn('Unauthorized request detected. Token may be invalid.');
      // throw new Error('Unauthorized - please check your session');
    }

    return response;
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...updates };
      localStorage.setItem('qc_user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;

    // 1. Fetch Profile Picture if we have a path (or check if we have one)
    try {
      const res = await apiFetch(`${API_BASE_URL}/auth/profile/me/picture`);
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          updateUser({ avatar: data.url });
        }
      }
    } catch (e) {
      console.error("Failed to refresh profile picture", e);
    }
  }, [user, apiFetch, updateUser]);

  // Initial load refresh
  useEffect(() => {
    if (user && !user.avatar) {
      refreshProfile();
    }
  }, [user?.id]); // Only retry on ID change or initial mount if missing

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();

        const loggedInUser: User = {
          id: data.user_id,
          name: data.username,
          username: data.username,
          email: '',
          role: data.role as UserRole,
          createdAt: new Date().toISOString(),
          status: true
        };

        localStorage.setItem('qc_token', data.access_token);
        setUser(loggedInUser);
        localStorage.setItem('qc_user', JSON.stringify(loggedInUser));

        // Trigger a profile refresh shortly after to get avatar
        setTimeout(() => {
          // We can't call refreshProfile here easily due to closure/dep/ordering, 
          // but the useEffect above will catch the user change and fire it if avatar is missing.
        }, 100);

        return true;
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      login,
      logout,
      apiFetch,
      refreshProfile,
      updateUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
