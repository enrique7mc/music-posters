import { cn } from '@/lib/utils';
import Image from 'next/image';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizes = { sm: 'h-4 w-4 border-2', md: 'h-8 w-8 border-2', lg: 'h-10 w-10 border-2' };
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block animate-spin rounded-full border-accent-500/20 border-t-accent-500 mx-auto',
        sizes[size],
        className
      )}
    />
  );
}

// A stable workspace while asynchronous work completes, without simulated progress.
export function LoadingScreen({ message = 'Loading your workspace...' }: { message?: string }) {
  return (
    <div className="min-h-screen bg-dark-950 text-dark-50">
      <div className="border-b border-dark-800">
        <div className="studio-shell flex h-20 items-center gap-3">
          <Image
            src="/favicon-32x32.png"
            alt=""
            width={28}
            height={28}
            className="shrink-0"
            aria-hidden="true"
          />
          <span className="text-xl font-bold tracking-tight">
            Playlistd<span className="text-accent-500">.</span>
          </span>
        </div>
      </div>
      <main className="studio-shell flex min-h-[calc(100vh-5rem)] items-center justify-center py-12">
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="w-full max-w-md text-center"
        >
          <div className="surface px-6 py-10 sm:px-10">
            <div className="mb-8 flex items-center justify-center">
              <LoadingSpinner size="lg" />
            </div>
            <p className="eyebrow mb-3">A little behind-the-scenes</p>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{message}</h1>
            <p className="mt-3 text-sm leading-relaxed text-dark-300">
              Hang tight. Your next step will appear here.
            </p>
            <div aria-hidden="true" className="mt-9 space-y-3 border-t border-dark-800 pt-6">
              {['w-3/4', 'w-full', 'w-5/6'].map((width) => (
                <div key={width} className="flex items-center gap-3">
                  <div className="loading-placeholder h-9 w-9 shrink-0 rounded-lg bg-dark-700" />
                  <div className={cn('loading-placeholder h-2 rounded-full bg-dark-700', width)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
