import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { MusicPlatform, PlatformUser } from '@/types';

// Extend Window interface for MusicKit
declare global {
  interface Window {
    MusicKit?: {
      configure: (config: { developerToken: string; app: { name: string; build: string } }) => void;
      getInstance: () => {
        authorize: () => Promise<string>;
        isAuthorized: boolean;
        musicUserToken: string;
      };
    };
  }
}

interface User extends PlatformUser {
  display_name?: string; // Legacy field for backward compatibility
}

interface AuthContextType {
  user: User | null;
  platform: MusicPlatform | null;
  loading: boolean;
  musicKitReady: boolean;
  checkAuth: () => Promise<void>;
  loginWithSpotify: () => void;
  loginWithAppleMusic: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [platform, setPlatform] = useState<MusicPlatform | null>(null);
  const [loading, setLoading] = useState(true);
  const [musicKitReady, setMusicKitReady] = useState(false);
  const hasChecked = useRef(false);
  const checkAuthPromise = useRef<Promise<void> | null>(null);
  const musicKitInitialized = useRef(false);

  // Initialize MusicKit when available
  useEffect(() => {
    const initMusicKit = async () => {
      if (musicKitInitialized.current || !window.MusicKit) return;

      try {
        // Fetch developer token from our API
        const response = await axios.get('/api/auth/apple-music/developer-token');
        const { token } = response.data;

        window.MusicKit.configure({
          developerToken: token,
          app: {
            name: 'Music Posters',
            build: '1.0.0',
          },
        });

        musicKitInitialized.current = true;
        setMusicKitReady(true);
        console.log('MusicKit initialized successfully');
      } catch (error) {
        console.error('Failed to initialize MusicKit:', error);
        // MusicKit may not be configured, which is fine - user can still use Spotify
      }
    };

    // Check if MusicKit is already loaded
    if (window.MusicKit) {
      initMusicKit();
    } else {
      // Wait for MusicKit to load
      const checkMusicKit = setInterval(() => {
        if (window.MusicKit) {
          clearInterval(checkMusicKit);
          initMusicKit();
        }
      }, 100);

      // Stop checking after 10 seconds
      setTimeout(() => clearInterval(checkMusicKit), 10000);
    }
  }, []);

  const checkAuth = useCallback(async () => {
    if (checkAuthPromise.current) {
      return checkAuthPromise.current;
    }

    checkAuthPromise.current = (async () => {
      try {
        const response = await axios.get('/api/auth/me');
        const userData = response.data;
        setUser(userData);
        setPlatform(userData.platform || 'spotify');
        hasChecked.current = true;
        return userData;
      } catch (err: any) {
        setUser(null);
        setPlatform(null);
        hasChecked.current = true;
        // 401 is expected for unauthenticated users - don't throw
        if (err.response?.status !== 401) {
          console.error('Auth check failed:', err);
        }
        return null;
      } finally {
        setLoading(false);
        checkAuthPromise.current = null;
      }
    })();

    return checkAuthPromise.current;
  }, []);

  const loginWithSpotify = useCallback(() => {
    // Redirect to Spotify OAuth login
    window.location.href = '/api/auth/spotify/login';
  }, []);

  const loginWithAppleMusic = useCallback(async () => {
    if (!window.MusicKit) {
      throw new Error('MusicKit not available. Please try again later.');
    }

    try {
      const music = window.MusicKit.getInstance();

      // Open Apple Music authorization popup
      const musicUserToken = await music.authorize();

      if (!musicUserToken) {
        throw new Error('Apple Music authorization failed');
      }

      // Store the token on our server
      await axios.post('/api/auth/apple-music/store-token', {
        musicUserToken,
      });

      // Check auth to update state
      await checkAuth();

      // Redirect to upload page
      router.push('/upload');
    } catch (error: any) {
      console.error('Apple Music login failed:', error);
      throw error;
    }
  }, [checkAuth, router]);

  const logout = useCallback(async () => {
    try {
      await axios.post('/api/auth/logout');
      setUser(null);
      setPlatform(null);
      hasChecked.current = false;
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }, [router]);

  useEffect(() => {
    if (!hasChecked.current && !checkAuthPromise.current) {
      checkAuth();
    }
  }, [checkAuth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        platform,
        loading,
        musicKitReady,
        checkAuth,
        loginWithSpotify,
        loginWithAppleMusic,
        logout,
      }}
    >
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
