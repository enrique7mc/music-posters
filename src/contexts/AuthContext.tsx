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
  /**
   * Loads + configures MusicKit on demand. Idempotent and de-duplicated: concurrent
   * callers share one in-flight promise. Resolves true once MusicKit is usable.
   * Nothing Apple-related is fetched until this is called.
   */
  initMusicKit: () => Promise<boolean>;
  checkAuth: () => Promise<void>;
  loginWithSpotify: () => void;
  loginWithAppleMusic: () => Promise<void>;
  logout: () => Promise<void>;
}

const MUSICKIT_SRC = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
const MUSICKIT_TIMEOUT_MS = 10000;
const MUSICKIT_SCRIPT_TIMEOUT_MS = 10000;

/**
 * Inject the MusicKit CDN script and resolve once it has loaded.
 *
 * Two failure modes this must survive, both of which otherwise leave the promise
 * pending forever — and because initMusicKit() memoises it, a hang here disables the
 * Apple Music button permanently with no error shown:
 *
 *  1. A leftover tag from a failed attempt. Its load/error events have already fired
 *     (or never will), so subscribing to them would wait on an event that can't come.
 *     We remove stale tags and re-inject, which is also what actually retries the
 *     download — reusing the dead tag would never re-request it.
 *  2. A stalled request. If the CDN accepts the connection but never responds,
 *     neither `load` nor `error` fires, so the load itself needs its own deadline.
 */
function loadMusicKitScript(timeoutMs = MUSICKIT_SCRIPT_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.MusicKit) return resolve();

    // Clear any tag from a previous attempt (see 1 above).
    document.querySelectorAll('script[data-musickit]').forEach((el) => el.remove());

    const script = document.createElement('script');
    script.src = MUSICKIT_SRC;
    script.async = true;
    script.dataset.musickit = 'true';

    const settle = (finish: () => void) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      finish();
    };
    const fail = (message: string) =>
      settle(() => {
        // Leave no stale tag behind, so the next attempt starts clean.
        script.remove();
        reject(new Error(message));
      });

    const timer = setTimeout(() => fail('MusicKit JS load timed out'), timeoutMs);
    script.onload = () => settle(resolve);
    script.onerror = () => fail('MusicKit JS failed to load');

    document.head.appendChild(script);
  });
}

/**
 * The script's load event fires before MusicKit finishes bootstrapping, so wait for
 * `window.MusicKit` to actually appear — via the `musickitloaded` event, with a poll
 * as a fallback and a hard timeout so a blocked CDN can't hang the caller forever.
 */
function waitForMusicKit(timeoutMs = MUSICKIT_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.MusicKit) return resolve();

    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener('musickitloaded', onLoaded);
    };
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('MusicKit did not initialize in time'));
    }, timeoutMs);
    const poll = setInterval(() => {
      if (window.MusicKit) {
        cleanup();
        resolve();
      }
    }, 100);

    document.addEventListener('musickitloaded', onLoaded);
  });
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
  const musicKitPromise = useRef<Promise<boolean> | null>(null);

  /**
   * Lazily load + configure MusicKit. Previously this ran on mount for EVERY visitor,
   * which meant a Spotify-only user still paid for Apple's CDN script, a 100ms polling
   * loop, and a developer-token request that 500s when Apple isn't configured. Now
   * nothing Apple-related happens until someone actually reaches for Apple Music.
   */
  const initMusicKit = useCallback(async (): Promise<boolean> => {
    if (musicKitReady) return true;
    // De-dupe concurrent callers (e.g. selecting the platform and clicking Connect).
    if (musicKitPromise.current) return musicKitPromise.current;

    musicKitPromise.current = (async () => {
      try {
        await loadMusicKitScript();
        await waitForMusicKit();

        const response = await axios.get('/api/auth/apple-music/developer-token');
        window.MusicKit!.configure({
          developerToken: response.data.token,
          app: { name: 'Playlistd', build: '1.0.0' },
        });

        setMusicKitReady(true);
        return true;
      } catch (error) {
        console.error('Failed to initialize MusicKit:', error);
        // Clear so a later attempt can retry (transient CDN/network failures).
        musicKitPromise.current = null;
        return false;
      }
    })();

    return musicKitPromise.current;
  }, [musicKitReady]);

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

  const handlePostAuthRedirect = useCallback(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = sessionStorage.getItem('returnAfterAuth');
      if (stored) {
        const { url, timestamp } = JSON.parse(stored);
        sessionStorage.removeItem('returnAfterAuth');
        // Only consume if < 5 minutes old and is a valid internal path
        if (Date.now() - timestamp < 5 * 60 * 1000 && url.startsWith('/')) {
          router.push(url);
          return true;
        }
      }
    } catch {
      /* ignore */
    }
    return false;
  }, [router]);

  const loginWithSpotify = useCallback(() => {
    // Redirect to Spotify OAuth login
    window.location.href = '/api/auth/spotify/login';
  }, []);

  const loginWithAppleMusic = useCallback(async () => {
    // Ensure MusicKit is loaded — with lazy init it may not be yet.
    const ready = await initMusicKit();
    if (!ready || !window.MusicKit) {
      throw new Error('Apple Music is unavailable. Please try again later.');
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

      // Redirect to return URL if available, otherwise upload page
      if (!handlePostAuthRedirect()) {
        router.push('/upload');
      }
    } catch (error: any) {
      console.error('Apple Music login failed:', error);
      throw error;
    }
  }, [checkAuth, router, initMusicKit]);

  const logout = useCallback(async () => {
    try {
      await axios.post('/api/auth/logout');
      setUser(null);
      setPlatform(null);
      hasChecked.current = false;
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem('returnAfterAuth');
        } catch {
          /* ignore */
        }
      }
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
        initMusicKit,
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
