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
    const token = localStorage.getItem('qc_token');

    // If token is missing or is the string "null"/"undefined", treat as unauthenticated
    if (!token || token === 'null' || token === 'undefined') {
      localStorage.removeItem('qc_token');
      localStorage.removeItem('qc_user');
      return null;
    }

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

  const apiFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('qc_token');

    const headers = new Headers(options.headers || {});
    // Only set Authorization if token exists and is not the literal string "null"
    if (token && token !== 'null' && token !== 'undefined' && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });

    if (response.status === 401) {
      console.warn('Unauthorized request detected. Session may be expired.');
      // 🛑 DISABLED: Do not log out automatically.
      // Let the user re-login manually or wait for the next healthy request.
      // This prevents "flickering logouts" during DB SSL drops.
    }

    return response;
  }, []);

  const logout = useCallback(async () => {
    try {
      // 1. Pause any active uploads before logout
      // Use a promise-based approach to ensure pause completes
      const pausePromise = new Promise<void>((resolve) => {
        const handlePauseComplete = () => {
          window.removeEventListener('uploads-paused-complete', handlePauseComplete);
          resolve();
        };

        window.addEventListener('uploads-paused-complete', handlePauseComplete);

        // Dispatch pause event
        const uploadPauseEvent = new CustomEvent('pause-uploads-before-logout');
        window.dispatchEvent(uploadPauseEvent);

        // Timeout after 2 seconds if no response
        setTimeout(() => {
          window.removeEventListener('uploads-paused-complete', handlePauseComplete);
          resolve();
        }, 2000);
      });

      // Wait for uploads to pause
      await pausePromise;
      console.log('✅ Upload pause confirmed');

      // 2. Call backend logout endpoint to log the action
      await apiFetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST'
      });
    } catch (error) {
      console.error('Logout API call failed:', error);
      // Continue with logout even if API call fails
    } finally {
      // 3. Clear auth but PRESERVE upload queue so uploads can resume after re-login
      const currentUserId = user?.id;

      localStorage.removeItem('qc_token');
      localStorage.removeItem('qc_user');

      // Stop any active uploads (but don't delete the queue records)
      import('@/utils/uploadManager').then(m => m.UploadManager.stopAllInstances());

      // Mark active batches as 'interrupted' so auto-resume picks them up on next login
      if (currentUserId) {
        import('@/utils/uploadDB').then(async ({ db }) => {
          try {
            const activeBatches = await db.batch_queue
              .where('user_id').equals(currentUserId)
              .filter((b: any) => b.status === 'uploading' || b.status === 'in_progress')
              .toArray();
            for (const b of activeBatches) {
              await db.batch_queue.update(b.batch_uid, { status: 'interrupted', updated_at: new Date() });
            }
            console.log(`[LOGOUT] Preserved ${activeBatches.length} active batch(es) for resume after re-login`);
          } catch (e) {
            console.warn('Failed to update upload queue status on logout:', e);
          }
        });
      }

      setUser(null);

      console.log('🔐 Logged out - Upload queue preserved for resume');
    }
  }, [apiFetch]);

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

    try {
      // 1. Fetch full user object to sync name/email/etc
      const userRes = await apiFetch(`${API_BASE_URL}/auth/me`);
      if (userRes.ok) {
        const userData = await userRes.json();
        const updatedUser: User = {
          ...user,
          name: userData.name || userData.username,
          username: userData.username,
          email: userData.email,
          role: userData.user_role as UserRole
        };
        setUser(updatedUser);
        localStorage.setItem('qc_user', JSON.stringify(updatedUser));
      }

      // 2. Fetch Profile Picture
      const picRes = await apiFetch(`${API_BASE_URL}/auth/profile/me/picture`);
      if (picRes.ok) {
        const picData = await picRes.ok ? await picRes.json() : null;
        if (picData?.url) {
          updateUser({ avatar: picData.url });
        }
      }
    } catch (e) {
      console.error("Failed to refresh profile info", e);
    }
  }, [user, apiFetch, updateUser]);

  // Sync profile details on mount
  useEffect(() => {
    if (user) {
      refreshProfile();
    }
  }, [user?.id]); // Runs on initial load and if user changes

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();

        const loggedInUser: User = {
          id: data.user_id,
          name: data.name || data.username,
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
