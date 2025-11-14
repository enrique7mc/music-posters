import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

interface User {
  display_name: string;
  id: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Track if we've already checked auth to prevent duplicate requests
  const hasChecked = useRef(false);
  // Track ongoing auth request to deduplicate simultaneous calls
  const checkAuthPromise = useRef<Promise<void> | null>(null);

  const checkAuth = async () => {
    // If there's already an ongoing auth check, return that promise
    if (checkAuthPromise.current) {
      return checkAuthPromise.current;
    }

    // Create new auth check promise
    checkAuthPromise.current = (async () => {
      try {
        const response = await axios.get('/api/auth/me');
        setUser(response.data);
        hasChecked.current = true;
        return response.data;
      } catch (err) {
        setUser(null);
        hasChecked.current = true;
        throw err;
      } finally {
        setLoading(false);
        // Clear the promise reference after completion
        checkAuthPromise.current = null;
      }
    })();

    return checkAuthPromise.current;
  };

  const logout = async () => {
    try {
      await axios.post('/api/auth/logout');
      setUser(null);
      hasChecked.current = false; // Reset for potential re-login
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  };

  // Check auth once on mount (only if not already checked)
  useEffect(() => {
    if (!hasChecked.current && !checkAuthPromise.current) {
      checkAuth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, checkAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
