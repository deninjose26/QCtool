import React, { createContext, useContext, useState, useCallback } from 'react';
import { User, UserRole } from '@/types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
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
        'upload_supervisor': 'Upload_Supervisor',
        'vendor': 'Vendor',
        'scanning_operator': 'Scanning_Operator',
        'qc_supervisor': 'QC_Supervisor',
        'qc_user': 'QC_User'
      };
      if (parsed.role && migrationMap[parsed.role]) {
        parsed.role = migrationMap[parsed.role];
      }
      return parsed;
    } catch (e) {
      return null;
    }
  });

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);

      const response = await fetch('http://localhost:8000/auth/login', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();

        const loggedInUser: User = {
          id: data.user_id,
          name: data.username,
          username: data.username,
          email: '', // Not returned by login endpoint currently
          role: data.role as UserRole,
          createdAt: new Date().toISOString(),
        };
        setUser(loggedInUser);
        localStorage.setItem('qc_user', JSON.stringify(loggedInUser));
        localStorage.setItem('qc_token', data.access_token);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('qc_user');
  }, []);


  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      login,
      logout
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
