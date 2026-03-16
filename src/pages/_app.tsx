import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { AnimatePresence } from 'framer-motion';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { AuthProvider } from '@/contexts/AuthContext';
import dynamic from 'next/dynamic';

const DevPanel = dynamic(() => import('@/components/dev/DevPanel'), { ssr: false });

export default function App({ Component, pageProps, router }: AppProps) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AnimatePresence mode="wait" initial={false}>
          <Component {...pageProps} key={router.route} />
        </AnimatePresence>
        <DevPanel />
      </AuthProvider>
    </ThemeProvider>
  );
}
