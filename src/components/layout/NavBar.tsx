import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import Button from '../ui/Button';
import axios from 'axios';

interface User {
  display_name: string;
  id: string;
}

export default function NavBar() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Check authentication status
    const checkAuth = async () => {
      try {
        const response = await axios.get('/api/auth/me');
        setUser(response.data);
      } catch {
        setUser(null);
      }
    };

    checkAuth();

    // Handle scroll for backdrop blur effect
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout');
      router.push('/');
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
