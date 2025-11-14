import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import Button from '../ui/Button';
import { useAuth } from '@/contexts/AuthContext';

export default function NavBar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Handle scroll for backdrop blur effect
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <motion.nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled ? 'glass shadow-medium' : 'bg-transparent'
      )}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href={user ? '/upload' : '/'} className="group">
            <motion.div className="text-xl font-bold tracking-tight" whileHover={{ scale: 1.05 }}>
              <span className="text-gradient">Music Posters</span>
            </motion.div>
          </Link>

          {/* Navigation */}
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <span className="text-sm text-dark-300 hidden sm:block">{user.display_name}</span>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  Logout
                </Button>
              </>
            ) : (
              router.pathname !== '/' && (
                <Button variant="secondary" size="sm" onClick={() => router.push('/')}>
                  Sign In
                </Button>
              )
            )}
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
