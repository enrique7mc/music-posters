import { useState, useEffect, useCallback, useRef } from 'react';

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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateConfig = useCallback(
    async (partial: Partial<DevConfig>, { debounce = 0 }: { debounce?: number } = {}) => {
      // Optimistic update — apply immediately to local state
      setConfig((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...partial };
        cachedConfig = next;
        return next;
      });

      const doFetch = async () => {
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
          // Silently fail — optimistic state stays
        }
      };

      if (debounce > 0) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(doFetch, debounce);
      } else {
        await doFetch();
      }
    },
    []
  );

  return {
    config,
    updateConfig,
    isDevMode: config?.enabled ?? false,
    isLoading,
  };
}
