import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { pageTransition } from '@/lib/animations';
import NavBar from './NavBar';

interface PageLayoutProps {
  children: ReactNode;
  showNav?: boolean;
  className?: string;
}

export default function PageLayout({ children, showNav = true, className }: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-dark-950">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-accent-500 focus:px-4 focus:py-2 focus:text-dark-950"
      >
        Skip to content
      </a>
      {showNav && <NavBar />}
      <motion.main
        id="main-content"
        className={className}
        variants={pageTransition}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {children}
      </motion.main>
    </div>
  );
}
