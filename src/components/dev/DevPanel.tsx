import { useState } from 'react';
import { useDevMode } from '@/hooks/useDevMode';
import { useRouter } from 'next/router';

function Toggle({
  label,
  checked,
  onChange,
  disabled,
  linked,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  linked?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between gap-2 ${disabled ? 'opacity-50' : ''}`}>
      <span className="text-xs text-dark-200">
        {label}
        {linked && <span className="ml-1 text-dark-500">(auto)</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-accent-500' : 'bg-dark-700'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
            checked ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}

export default function DevPanel() {
  const { config, updateConfig, isDevMode, isLoading } = useDevMode();
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  // Self-gate: render nothing if dev mode is off
  if (!isDevMode || !config) return null;

  const handleShortcut = async (page: string) => {
    try {
      const res = await fetch(`/api/dev/mock-session?page=${page}`);
      if (!res.ok) return;
      const data = await res.json();

      // Store in sessionStorage using the keys each page actually reads
      if (page === 'review-artists') {
        sessionStorage.setItem('artists', JSON.stringify(data.artists));
        sessionStorage.setItem('analysisProvider', data.analysisProvider || 'hybrid');
        if (data.posterThumbnail) {
          sessionStorage.setItem('posterThumbnail', data.posterThumbnail);
        }
        router.push('/review-artists');
      } else if (page === 'review-tracks') {
        sessionStorage.setItem('tracks', JSON.stringify(data.tracks));
        router.push('/review-tracks');
      } else if (page === 'success') {
        router.push({ pathname: '/success', query: { playlistUrl: data.playlistUrl } });
      }
    } catch {
      // Silently fail
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-4 right-4 z-[9999] px-3 py-1.5 bg-accent-500 text-white text-xs font-bold rounded-full shadow-lg hover:bg-accent-600 transition-colors"
      >
        DEV
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-72 bg-dark-900 border border-dark-700 rounded-lg shadow-2xl text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-dark-700">
        <span className="font-bold text-accent-400 text-xs tracking-wider">DEV MODE</span>
        <button
          onClick={() => setExpanded(false)}
          className="text-dark-400 hover:text-dark-200 text-lg leading-none"
        >
          &times;
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="px-3 py-4 text-center text-dark-400 text-xs">Loading config...</div>
      )}

      {/* Toggles */}
      {!isLoading && (
        <div className="px-3 py-2 space-y-2.5">
          <Toggle
            label="Skip Auth"
            checked={config.skipAuth}
            onChange={(v) => updateConfig({ skipAuth: v })}
            disabled={isLoading}
          />
          <Toggle
            label="Mock Analysis"
            checked={config.mockAnalysis}
            onChange={(v) => updateConfig({ mockAnalysis: v })}
            disabled={isLoading}
          />
          <Toggle
            label="Mock Track Search"
            checked={config.mockTrackSearch}
            onChange={(v) => updateConfig({ mockTrackSearch: v })}
            disabled={isLoading}
          />
          <Toggle
            label="Dry-Run Playlist"
            checked={config.dryRunPlaylist}
            onChange={(v) => updateConfig({ dryRunPlaylist: v })}
            disabled={isLoading || config.skipAuth}
            linked={config.skipAuth}
          />

          {/* Delay slider */}
          <div className="pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-dark-200">Mock Delay</span>
              <span className="text-xs text-dark-400">{config.mockDelayMs}ms</span>
            </div>
            <input
              type="range"
              min={0}
              max={5000}
              step={250}
              value={config.mockDelayMs}
              onChange={(e) =>
                updateConfig({ mockDelayMs: parseInt(e.target.value) }, { debounce: 300 })
              }
              disabled={isLoading}
              className="w-full h-1.5 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-accent-500 mt-1"
            />
          </div>

          {/* Platform picker */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-dark-200">Fake Platform</span>
            <select
              value={config.fakePlatform}
              onChange={(e) => updateConfig({ fakePlatform: e.target.value as any })}
              disabled={isLoading}
              className="text-xs bg-dark-800 text-dark-200 border border-dark-600 rounded px-2 py-1"
            >
              <option value="spotify">Spotify</option>
              <option value="apple-music">Apple Music</option>
            </select>
          </div>

          {/* Page shortcuts */}
          <div className="pt-1 border-t border-dark-700">
            <span className="text-xs text-dark-400 block mb-1.5">Jump to page</span>
            <div className="flex gap-1.5 flex-wrap">
              {['review-artists', 'review-tracks', 'success'].map((page) => (
                <button
                  key={page}
                  onClick={() => handleShortcut(page)}
                  className="px-2 py-1 text-xs bg-dark-800 text-dark-200 rounded hover:bg-dark-700 hover:text-dark-50 transition-colors"
                >
                  {page}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
