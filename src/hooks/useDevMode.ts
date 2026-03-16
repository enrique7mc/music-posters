import { useState, useEffect, useCallback } from 'react';

interface DevConfig {
  enabled: boolean;
  mockAnalysis: boolean;
  mockTrackSearch: boolean;
  dryRunPlaylist: boolean;
  skipAuth: boolean;
  mockDelayMs: number;
  fakePlatform: 'spotify' | 'apple-music';
}

interface UseDevModeReturn {
  config: DevConfig | null;
  updateConfig: (partial: Partial<DevConfig>) => Promise<void>;
  isDevMode: boolean;
  isLoading: boolean;
}

// Module-level cache for instant re-mount
let cachedConfig: DevConfig | null = null;

export function useDevMode(): UseDevModeReturn {
  const [config, setConfig] = useState<DevConfig | null>(cachedConfig);
  const [isLoading, setIsLoading] = useState(cachedConfig === null);

  useEffect(() => {
    let cancelled = false;

    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/dev/config');
        if (!res.ok) {
          cachedConfig = null;
          if (!cancelled) {
            setConfig(null);
            setIsLoading(false);
          }
          return;
        }
        const data = await res.json();
        cachedConfig = data;
        if (!cancelled) {
          setConfig(data);
          setIsLoading(false);
        }
      } catch {
        cachedConfig = null;
        if (!cancelled) {
          setConfig(null);
          setIsLoading(false);
        }
      }
    };

    fetchConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateConfig = useCallback(async (partial: Partial<DevConfig>) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/dev/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      if (res.ok) {
        const data = await res.json();
        cachedConfig = data;
        setConfig(data);
      }
    } catch {
      // Silently fail — config unchanged
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    config,
    updateConfig,
    isDevMode: config?.enabled ?? false,
    isLoading,
  };
}
