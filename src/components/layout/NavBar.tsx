import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import Button from '../ui/Button';
import { useAuth } from '@/contexts/AuthContext';

export default function NavBar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };
  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 top-0 z-50 border-b border-dark-800 bg-dark-950/95 backdrop-blur-md"
    >
      <div className="studio-shell flex h-20 items-center justify-between gap-4">
        <Link
          href={user ? '/upload' : '/'}
          className="flex items-center gap-3 text-xl font-bold tracking-tight"
        >
          <Image
            src="/favicon-32x32.png"
            alt=""
            width={28}
            height={28}
            className="shrink-0"
            aria-hidden="true"
          />
          <span>
            Playlistd<span className="text-accent-500">.</span>
          </span>
        </Link>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <span className="hidden text-sm text-dark-300 sm:block">{user.display_name}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </>
          ) : router.pathname !== '/' ? (
            <Button variant="secondary" size="sm" onClick={() => router.push('/')}>
              Sign In
            </Button>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
