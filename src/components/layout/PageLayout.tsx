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
      {showNav && <NavBar />}
      <motion.main
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
